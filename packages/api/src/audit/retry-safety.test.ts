import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

import { db } from "@cartwright/db";
import {
  paymentPolicies,
  spendingReservations,
  transactions,
  user as userTable,
} from "@cartwright/db/schema";
import { getTransactionById } from "@cartwright/db/repositories/transaction.repository";

import { createPurchaseTransaction, verifyPayment } from "../transactions/transaction.service";
import { handleRazorpayWebhook } from "../payments/razorpay-webhook.service";
import { cleanupExpiredShoppingSessions } from "../shopping/shopping.service";
import { insertShoppingSession } from "@cartwright/db/repositories/shopping.repository";

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

describe("retry safety (db-backed)", () => {
  beforeAll(cleanupAllTestData);
  afterAll(cleanupAllTestData);

  test("retry does not duplicate transaction", async () => {
    await withTestUser(async (userId) => {
      const first = await createPurchaseTransaction({
        userId,
        idempotencyKey: "retry-safe-1",
        amountInMinor: 100_000,
        currency: "INR",
        merchantName: "TestMart",
      });

      // Second call with same key returns same transaction
      const second = await createPurchaseTransaction({
        userId,
        idempotencyKey: "retry-safe-1",
        amountInMinor: 100_000,
        currency: "INR",
        merchantName: "TestMart",
      });

      expect(second.transactionId).toBe(first.transactionId);
      expect(second.status).toBe(first.status);

      // Only one transaction in DB
      const rows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.userId, userId));
      expect(rows).toHaveLength(1);

      // Only one reservation
      const reservations = await db
        .select()
        .from(spendingReservations)
        .where(eq(spendingReservations.userId, userId));
      expect(reservations).toHaveLength(1);
    });
  });

  test("retry does not duplicate reservation", async () => {
    await withTestUser(async (userId) => {
      await createPurchaseTransaction({
        userId,
        idempotencyKey: "retry-res-1",
        amountInMinor: 100_000,
        currency: "INR",
      });

      await createPurchaseTransaction({
        userId,
        idempotencyKey: "retry-res-1",
        amountInMinor: 100_000,
        currency: "INR",
      });

      const reservations = await db
        .select()
        .from(spendingReservations)
        .where(eq(spendingReservations.userId, userId));
      expect(reservations).toHaveLength(1);
      expect(reservations[0]?.status).toBe("RESERVED");
    });
  });

  test("repeated webhook remains safe", async () => {
    await withTestUser(async (userId) => {
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: "wh-retry-1",
        amountInMinor: 100_000,
        currency: "INR",
      });

      const orderId = `order_wh_retry_${randomUUID()}`;
      const paymentId = `pay_wh_retry_${randomUUID()}`;
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

      const first = await handleRazorpayWebhook(rawBody, signature);
      expect(first.handled).toBe(true);

      // Second delivery
      const second = await handleRazorpayWebhook(rawBody, signature);
      expect(second.handled).toBe(true);
      expect(second.reason).toContain("Already processed");

      // Still only one PAYMENT_SUCCEEDED
      const txn = await getTransactionById(res.transactionId);
      expect(txn?.status).toBe("PAYMENT_SUCCEEDED");

      const reservations = await db
        .select()
        .from(spendingReservations)
        .where(eq(spendingReservations.transactionId, res.transactionId));
      expect(reservations).toHaveLength(1);
      expect(reservations[0]?.status).toBe("SETTLED");
    });
  });

  test("verifyPayment is idempotent for already-settled transaction", async () => {
    await withTestUser(async (userId) => {
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: "verify-idem-1",
        amountInMinor: 100_000,
        currency: "INR",
      });

      const paymentId = `pay_verify_${randomUUID()}`;
      await db
        .update(transactions)
        .set({ status: "PAYMENT_SUCCEEDED", razorpayPaymentId: paymentId })
        .where(eq(transactions.id, res.transactionId));

      const result = await verifyPayment(
        { transactionId: res.transactionId, orderId: "ord", paymentId, signature: "ignored" },
        userId,
      );
      expect(result.status).toBe("PAYMENT_SUCCEEDED");

      const again = await verifyPayment(
        { transactionId: res.transactionId, orderId: "ord", paymentId, signature: "ignored" },
        userId,
      );
      expect(again.status).toBe("PAYMENT_SUCCEEDED");
    });
  });

  test("cleanup is idempotent", async () => {
    await withTestUser(async (userId) => {
      await insertShoppingSession({
        userId,
        rawQuery: "test cleanup",
        intent: { budget: 100 },
        status: "recommended",
        expiresAt: new Date(Date.now() - 10_000), // expired
      });

      const first = await cleanupExpiredShoppingSessions(new Date());
      expect(first).toBeGreaterThanOrEqual(1);

      // Second run finds nothing actionable
      const second = await cleanupExpiredShoppingSessions(new Date());
      expect(second).toBe(0);
    });
  });
});
