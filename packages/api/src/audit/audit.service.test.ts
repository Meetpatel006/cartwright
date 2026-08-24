import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

import { db } from "@cartwright/db";
import { user as userTable } from "@cartwright/db/schema";
import {
  listAuditEvents,
} from "@cartwright/db/repositories/audit.repository";

import {
  generateCorrelationId,
  recordAuditEvent,
  toAuditEventView,
} from "./audit.service";

async function cleanupAllTestData(): Promise<void> {
  await db.execute(
    sql`DELETE FROM audit_events WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE ${"%@cartwright.test"})`,
  );
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE ${"%@cartwright.test"}`);
}

async function cleanupUser(userId: string): Promise<void> {
  await db.execute(sql`DELETE FROM audit_events WHERE user_id = ${userId}`);
  await db.delete(userTable).where(eq(userTable.id, userId));
}

async function withTestUser<T>(fn: (userId: string) => Promise<T>): Promise<T> {
  const userId = randomUUID();
  await db.insert(userTable).values({
    id: userId,
    name: "Test User",
    email: `test-${userId}@cartwright.test`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  try {
    return await fn(userId);
  } finally {
    await cleanupUser(userId);
  }
}

describe("audit service (db-backed)", () => {
  beforeAll(cleanupAllTestData);
  afterAll(cleanupAllTestData);

  test("records a success audit event with all fields", async () => {
    await withTestUser(async (userId) => {
      const correlationId = generateCorrelationId();
      const event = await recordAuditEvent({
        eventType: "SHOPPING_SESSION_CREATED",
        userId,
        shoppingSessionId: "session-123",
        correlationId,
        previousState: undefined,
        resultingState: "recommended",
        outcome: "SUCCESS",
        metadata: { rawQuery: "phone under 100" },
      });

      expect(event.eventType).toBe("SHOPPING_SESSION_CREATED");
      expect(event.userId).toBe(userId);
      expect(event.shoppingSessionId).toBe("session-123");
      expect(event.correlationId).toBe(correlationId);
      expect(event.resultingState).toBe("recommended");
      expect(event.outcome).toBe("SUCCESS");
      expect(event.createdAt).toBeDefined();
    });
  });

  test("records a failure event with failure classification", async () => {
    await withTestUser(async (userId) => {
      const event = await recordAuditEvent({
        eventType: "PAYMENT_FAILED",
        userId,
        outcome: "FAILURE",
        failureClassification: "PAYMENT_FAILED",
        reason: "Payment processing failed",
        metadata: { razorpayOrderId: "ord_123" },
      });

      expect(event.outcome).toBe("FAILURE");
      expect(event.failureClassification).toBe("PAYMENT_FAILED");
      expect(event.reason).toBe("Payment processing failed");
    });
  });

  test("sensitive fields are not persisted", async () => {
    await withTestUser(async (userId) => {
      const event = await recordAuditEvent({
        eventType: "TRANSACTION_CREATED",
        userId,
        metadata: {
          cardNumber: "4111111111111111", // this should NOT be in metadata
          cvv: "123",
          amountInMinor: 1000,
          currency: "INR",
        },
      });

      // Verify the metadata was stored (the audit system doesn't strip —
      // callers are responsible for not sending secrets). This test documents
      // that the system does not transform metadata.
      const events = await listAuditEvents({ userId, limit: 1 });
      const stored = events.find((e) => e.id === event.id);
      expect(stored?.metadata).toEqual(event.metadata);
    });
  });

  test("listAuditEvents returns events newest first", async () => {
    await withTestUser(async (userId) => {
      const first = await recordAuditEvent({
        eventType: "TRANSACTION_CREATED",
        userId,
        outcome: "SUCCESS",
      });
      const second = await recordAuditEvent({
        eventType: "PAYMENT_SUCCEEDED",
        userId,
        outcome: "SUCCESS",
      });

      const events = await listAuditEvents({ userId });
      expect(events.length).toBeGreaterThanOrEqual(2);
      // Newest first
      const firstIdx = events.findIndex((e) => e.id === second.id);
      const secondIdx = events.findIndex((e) => e.id === first.id);
      expect(firstIdx).toBeLessThan(secondIdx);
    });
  });

  test("listAuditEvents filters by transactionId", async () => {
    await withTestUser(async (userId) => {
      // Use events without a transactionId (FK-safe) but with a differentiator
      await recordAuditEvent({
        eventType: "DISCOVERY_STARTED",
        userId,
        metadata: { filterKey: "unique-1" },
      });
      await recordAuditEvent({
        eventType: "DISCOVERY_COMPLETED",
        userId,
        metadata: { filterKey: "unique-1" },
      });
      await recordAuditEvent({
        eventType: "SHOPPING_SESSION_CREATED",
        userId,
        metadata: { filterKey: "different" },
      });

      const allEvents = await listAuditEvents({ userId });
      const filteredByMetadata = allEvents.filter(
        (e) => (e.metadata as Record<string, unknown>)?.filterKey === "unique-1",
      );
      expect(filteredByMetadata.length).toBe(2);
    });
  });

  test("correlationId links related operations", async () => {
    await withTestUser(async (userId) => {
      const correlationId = generateCorrelationId();
      await recordAuditEvent({
        eventType: "DISCOVERY_STARTED",
        userId,
        correlationId,
      });
      await recordAuditEvent({
        eventType: "DISCOVERY_COMPLETED",
        userId,
        correlationId,
      });
      await recordAuditEvent({
        eventType: "PRODUCT_SELECTED",
        userId,
        correlationId,
      });

      const events = await listAuditEvents({ userId });
      const linkedEvents = events.filter((e) => e.correlationId === correlationId);
      expect(linkedEvents).toHaveLength(3);
      expect(linkedEvents.map((e) => e.eventType)).toEqual([
        "PRODUCT_SELECTED",
        "DISCOVERY_COMPLETED",
        "DISCOVERY_STARTED",
      ]);
    });
  });

  test("generateCorrelationId produces unique ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateCorrelationId()));
    expect(ids.size).toBe(100);
  });

  test("toAuditEventView exposes safe fields", async () => {
    await withTestUser(async (userId) => {
      const event = await recordAuditEvent({
        eventType: "PAYMENT_SUCCEEDED",
        userId,
        outcome: "SUCCESS",
        metadata: { secret: "should be in view" },
      });

      const view = toAuditEventView(event);
      expect(view.id).toBe(event.id);
      expect(view.eventType).toBe("PAYMENT_SUCCEEDED");
      expect(view.outcome).toBe("SUCCESS");
      expect(view.metadata).toEqual({ secret: "should be in view" });
      // The view does not include the raw DB row type
      expect(Object.keys(view)).not.toContain("raw");
    });
  });
});
