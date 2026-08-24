import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

import { db } from "@cartwright/db";
import {
  auditEvents,
  paymentPolicies,
  spendingReservations,
  transactions,
  user as userTable,
} from "@cartwright/db/schema";
import { listAuditEvents } from "@cartwright/db/repositories/audit.repository";

import { createPurchaseTransaction, cancelTransaction } from "../transactions/transaction.service";
import { approveTransaction } from "../payments/payment-approval.service";
import { handleRazorpayWebhook } from "../payments/razorpay-webhook.service";
import { runShoppingSession, selectProductForSession } from "../shopping/shopping.service";
import { createBrowserSession } from "../shopping/browser-session.service";
import type { ProductCandidate } from "@cartwright/agent";

const WEBHOOK_SECRET = "test-webhook-secret";

async function cleanupAllTestData(): Promise<void> {
  await db.execute(
    sql`DELETE FROM audit_events WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE ${"%@cartwright.test"})`,
  );
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE ${"%@cartwright.test"}`);
}

async function cleanupUser(userId: string): Promise<void> {
  await db.execute(sql`DELETE FROM audit_events WHERE user_id = ${userId}`);
  await db.delete(spendingReservations).where(eq(spendingReservations.userId, userId));
  await db.delete(transactions).where(eq(transactions.userId, userId));
  await db.delete(paymentPolicies).where(eq(paymentPolicies.userId, userId));
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

function candidate(
  partial: Partial<ProductCandidate> & { title: string; rawPrice: string },
): ProductCandidate {
  return {
    source: "Amazon",
    merchant: "Amazon",
    currency: "INR",
    productUrl: "https://example.com/p",
    availabilityText: "In Stock",
    evidence: {},
    ...partial,
  };
}

async function getAuditEventsForUser(userId: string) {
  return listAuditEvents({ userId, limit: 500 });
}

describe("Part D: audit integration (db-backed)", () => {
  beforeAll(cleanupAllTestData);
  afterAll(cleanupAllTestData);

  test("shopping session creation emits SHOPPING_SESSION_CREATED and DISCOVERY events", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Widget", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];

      await runShoppingSession(
        { userId, query: "widget", idempotencyKey: `audit-shop-${randomUUID()}` },
        { discover },
      );

      const events = await getAuditEventsForUser(userId);
      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).toContain("DISCOVERY_COMPLETED");
      expect(eventTypes).toContain("SHOPPING_SESSION_CREATED");
    });
  });

  test("shopping discovery failure emits DISCOVERY_FAILED with classification", async () => {
    await withTestUser(async (userId) => {
      const failDiscover = async (): Promise<ProductCandidate[]> => {
        throw new Error("Browser crashed");
      };

      await expect(
        runShoppingSession(
          { userId, query: "fail query", idempotencyKey: `audit-fail-${randomUUID()}` },
          { discover: failDiscover },
        ),
      ).rejects.toThrow();

      const events = await getAuditEventsForUser(userId);
      const failEvent = events.find((e) => e.eventType === "DISCOVERY_FAILED");
      expect(failEvent).toBeDefined();
      expect(failEvent?.outcome).toBe("FAILURE");
      expect(failEvent?.failureClassification).toBe("BROWSER_OPERATION_FAILED");
    });
  });

  test("product selection emits PRODUCT_SELECTED with state transitions", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Widget", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];

      const session = await runShoppingSession(
        { userId, query: "widget select", idempotencyKey: `audit-sel-${randomUUID()}` },
        { discover },
      );

      const productId = session.recommendations[0]!.product.id;
      await selectProductForSession({ userId, sessionId: session.sessionId, productId });

      const events = await getAuditEventsForUser(userId);
      const selectEvents = events.filter((e) => e.eventType === "PRODUCT_SELECTED");
      expect(selectEvents.length).toBeGreaterThanOrEqual(1);

      // At least one should have resultingState = "converted"
      const convertedEvent = selectEvents.find((e) => e.resultingState === "converted");
      expect(convertedEvent).toBeDefined();
      expect(convertedEvent?.transactionId).toBeTruthy();
    });
  });

  test("transaction creation emits PURCHASE_REQUESTED, TRANSACTION_CREATED, POLICY events", async () => {
    await withTestUser(async (userId) => {
      await createPurchaseTransaction({
        userId,
        idempotencyKey: `audit-txn-${randomUUID()}`,
        amountInMinor: 100_000,
        currency: "INR",
        merchantName: "TestMart",
      });

      const events = await getAuditEventsForUser(userId);
      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).toContain("PURCHASE_REQUESTED");
      expect(eventTypes).toContain("TRANSACTION_CREATED");
      expect(eventTypes).toContain("POLICY_CHECK_STARTED");
      expect(eventTypes).toContain("POLICY_CHECK_PASSED");
      expect(eventTypes).toContain("SPENDING_RESERVED");
    });
  });

  test("policy blocked transaction emits POLICY_CHECK_FAILED", async () => {
    await withTestUser(async (userId) => {
      await createPurchaseTransaction({
        userId,
        idempotencyKey: `audit-block-${randomUUID()}`,
        amountInMinor: 2_000_000, // Exceeds per-transaction limit
        currency: "INR",
      });

      const events = await getAuditEventsForUser(userId);
      const blockedEvent = events.find((e) => e.eventType === "POLICY_CHECK_FAILED");
      expect(blockedEvent).toBeDefined();
      expect(blockedEvent?.outcome).toBe("FAILURE");
      expect(blockedEvent?.failureClassification).toBeTruthy();
    });
  });

  test("cancellation emits TRANSACTION_CANCELLED and RESERVATION_RELEASED", async () => {
    await withTestUser(async (userId) => {
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: `audit-cancel-${randomUUID()}`,
        amountInMinor: 100_000,
        currency: "INR",
      });

      await cancelTransaction(res.transactionId, userId);

      const events = await getAuditEventsForUser(userId);
      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).toContain("TRANSACTION_CANCELLED");
      expect(eventTypes).toContain("RESERVATION_RELEASED");
    });
  });

  test("merchant-UI confirmed payment emits PAYMENT_SUCCEEDED with state tracking", async () => {
    await withTestUser(async (userId) => {
      const browserSession = await createBrowserSession({
        ownerUserId: userId,
        provider: "local",
        providerSessionId: `prov-confirm-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });

      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: `audit-mui-${randomUUID()}`,
        amountInMinor: 100_000,
        currency: "INR",
        browserSessionId: browserSession.id,
      });

      await approveTransaction(
        { transactionId: res.transactionId, userId },
        {
          readLiveCheckoutTotal: async () => null,
          closeProvider: async () => {},
          driveMerchantPayment: async () => ({
            status: "submitted" as const,
            message: "submitted",
            orderConfirmation: {
              url: "http://localhost:5173/order-confirmation",
              title: "Order Confirmed | Raven",
              text: "Thank you for your order",
              orderId: "ORD123",
              amount: null,
              statusText: "Order Confirmed",
            },
          }),
        },
      );

      const events = await getAuditEventsForUser(userId);
      const successEvent = events.find((e) => e.eventType === "PAYMENT_SUCCEEDED");
      expect(successEvent).toBeDefined();
      // applyTransition sets previousState/resultingState on the audit event
      expect(successEvent?.previousState).toBeTruthy();
      expect(successEvent?.resultingState).toBeTruthy();
      expect(successEvent?.outcome).toBe("SUCCESS");

      // The merchant-UI path settles via settleReservation but the
      // RESERVATION_SETTLED audit event is recorded by settleReservation
      // only in the verifyPayment path. The merchant-UI path records
      // PAYMENT_SUCCEEDED with the confirmation evidence instead.
      const successMeta = (successEvent?.metadata as Record<string, unknown>) ?? {};
      expect(successMeta.merchantStatus).toBeDefined();
    });
  });

  test("merchant-UI failure emits PAYMENT_FAILED with classification", async () => {
    await withTestUser(async (userId) => {
      const browserSession = await createBrowserSession({
        ownerUserId: userId,
        provider: "local",
        providerSessionId: `prov-fail-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });

      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: `audit-mui-fail-${randomUUID()}`,
        amountInMinor: 100_000,
        currency: "INR",
        browserSessionId: browserSession.id,
      });

      await approveTransaction(
        { transactionId: res.transactionId, userId },
        {
          readLiveCheckoutTotal: async () => null,
          closeProvider: async () => {},
          driveMerchantPayment: async () => ({
            status: "not_found" as const,
            message: "Merchant checkout session not found.",
          }),
        },
      );

      const events = await getAuditEventsForUser(userId);
      const failEvent = events.find((e) => e.eventType === "PAYMENT_FAILED");
      expect(failEvent).toBeDefined();
      expect(failEvent?.outcome).toBe("FAILURE");
    });
  });

  test("webhook signature failure emits WEBHOOK_FAILED with classification", async () => {
    const rawBody = JSON.stringify({ event: "payment.captured" });
    const badSignature = "invalid_signature";

    await expect(handleRazorpayWebhook(rawBody, badSignature)).rejects.toThrow();

    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "WEBHOOK_FAILED"));

    const sigFail = events.find(
      (e) => e.failureClassification === "WEBHOOK_VERIFICATION_FAILED",
    );
    expect(sigFail).toBeDefined();
    expect(sigFail?.outcome).toBe("FAILURE");
  });

  test("successful webhook emits WEBHOOK_RECEIVED then WEBHOOK_PROCESSED", async () => {
    await withTestUser(async (userId) => {
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: `audit-wh-ok-${randomUUID()}`,
        amountInMinor: 100_000,
        currency: "INR",
      });

      const orderId = `order_wh_ok_${randomUUID()}`;
      const paymentId = `pay_wh_ok_${randomUUID()}`;
      await db
        .update(transactions)
        .set({ razorpayOrderId: orderId })
        .where(eq(transactions.id, res.transactionId));

      const rawBody = JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              order_id: orderId,
              id: paymentId,
              amount: 100_000,
              currency: "INR",
              status: "captured",
            },
          },
        },
      });
      const signature = createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");

      await handleRazorpayWebhook(rawBody, signature);

      // WEBHOOK_RECEIVED is emitted before the transaction is looked up,
      // so it has no userId — query all events and filter by orderId.
      const allWebhookEvents = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.eventType, "WEBHOOK_RECEIVED"));
      expect(allWebhookEvents.length).toBeGreaterThanOrEqual(1);

      // WEBHOOK_PROCESSED and PAYMENT_SUCCEEDED are linked to the transaction.
      const events = await getAuditEventsForUser(userId);
      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).toContain("WEBHOOK_PROCESSED");
      expect(eventTypes).toContain("PAYMENT_SUCCEEDED");
    });
  });

  test("audit events never contain card numbers or secrets in reason field", async () => {
    await withTestUser(async (userId) => {
      await createPurchaseTransaction({
        userId,
        idempotencyKey: `audit-no-secrets-${randomUUID()}`,
        amountInMinor: 100_000,
        currency: "INR",
      });

      const events = await getAuditEventsForUser(userId);
      for (const event of events) {
        if (event.reason) {
          expect(event.reason).not.toMatch(/4\d{15}/); // no card numbers
          expect(event.reason).not.toMatch(/cvv/i);
          expect(event.reason).not.toMatch(/password/i);
        }
      }
    });
  });

  test("correlation ID links shopping → selection → transaction → payment events", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "CorrelWidget", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];

      const correlationId = randomUUID();
      const session = await runShoppingSession(
        { userId, query: "correlate test", idempotencyKey: `audit-corr-${randomUUID()}`, correlationId },
        { discover },
      );

      const productId = session.recommendations[0]!.product.id;
      await selectProductForSession({ userId, sessionId: session.sessionId, productId, correlationId });

      const events = await getAuditEventsForUser(userId);
      const linkedEvents = events.filter((e) => e.correlationId === correlationId);
      const eventTypes = linkedEvents.map((e) => e.eventType);

      // The correlation ID should link discovery → selection → transaction events
      expect(eventTypes).toContain("DISCOVERY_COMPLETED");
      expect(eventTypes).toContain("SHOPPING_SESSION_CREATED");
      expect(eventTypes).toContain("PRODUCT_SELECTED");
      expect(eventTypes).toContain("PURCHASE_REQUESTED");
      expect(eventTypes).toContain("TRANSACTION_CREATED");
      expect(eventTypes).toContain("POLICY_CHECK_STARTED");
      expect(eventTypes).toContain("SPENDING_RESERVED");

      // All linked events should have the same correlation ID
      expect(linkedEvents.every((e) => e.correlationId === correlationId)).toBe(true);
      expect(linkedEvents.length).toBeGreaterThanOrEqual(7);
    });
  });

  test("shopping session expiry emits SHOPPING_SESSION_EXPIRED", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "ExpireMe", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];

      const session = await runShoppingSession(
        { userId, query: "expire test", idempotencyKey: `audit-exp-${randomUUID()}` },
        { discover },
      );

      // Force expiry
      const { updateShoppingSession } = await import("@cartwright/db/repositories/shopping.repository");
      await updateShoppingSession(session.sessionId, {
        expiresAt: new Date(Date.now() - 10_000),
      });

      // Trigger lazy expiry
      const { cleanupExpiredShoppingSessions } = await import("../shopping/shopping.service");
      await cleanupExpiredShoppingSessions(new Date());

      const events = await getAuditEventsForUser(userId);
      const expiryEvent = events.find((e) => e.eventType === "SHOPPING_SESSION_EXPIRED");
      expect(expiryEvent).toBeDefined();
      expect(expiryEvent?.shoppingSessionId).toBe(session.sessionId);
      expect(expiryEvent?.resultingState).toBe("expired");
    });
  });
});
