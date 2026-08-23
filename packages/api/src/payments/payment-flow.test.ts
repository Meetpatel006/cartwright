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
import { getPolicyRow } from "@cartwright/db/repositories/payment-policy.repository";
import { getReservationByTransactionId } from "@cartwright/db/repositories/spending.repository";
import { getTransactionById } from "@cartwright/db/repositories/transaction.repository";

import {
  cancelTransaction,
  createPurchaseTransaction,
  getTransactionForUser,
  verifyPayment,
} from "../transactions/transaction.service";
import {
  PriceChangedError,
  TransactionOwnershipError,
} from "../transactions/transaction.errors";
import { approveTransaction } from "../payments/payment-approval.service";
import { handleRazorpayWebhook } from "./razorpay-webhook.service";

/** Stable secret matching the one pinned in test-setup.ts. */
const WEBHOOK_SECRET = "test-webhook-secret";

/** Wipe every test user (and cascaded rows) so runs never collide with debris
 *  left behind by a previously timed-out run. */
async function cleanupAllTestData(): Promise<void> {
  await db.execute(
    sql`DELETE FROM audit_events WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE ${"%@cartwright.test"})`,
  );
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE ${"%@cartwright.test"}`);
}

async function cleanupUser(userId: string): Promise<void> {
  await db.delete(auditEvents).where(eq(auditEvents.userId, userId));
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

describe("payment flow (db-backed)", () => {
  beforeAll(cleanupAllTestData);
  afterAll(cleanupAllTestData);

  test("auto-approves a small Test Mode amount and reserves budget", async () => {
    await withTestUser(async (userId) => {
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: "auto-1",
        amountInMinor: 100_000,
        currency: "INR",
        merchantName: "TestMart",
      });
      expect(res.status).toBe("APPROVED");
      expect(res.policyDecision).toBe("auto_approve");

      const reservation = await getReservationByTransactionId(res.transactionId);
      expect(reservation).toBeDefined();
      expect(reservation?.status).toBe("RESERVED");

      const policy = await getPolicyRow(userId);
      expect(policy?.consumedInMinor).toBe(100_000);
    });
  });

  test("requires user approval above the automatic limit", async () => {
    await withTestUser(async (userId) => {
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: "await-1",
        amountInMinor: 200_000,
        currency: "INR",
        merchantName: "TestMart",
      });
      expect(res.status).toBe("AWAITING_APPROVAL");
      expect(res.policyDecision).toBe("user_approval");
    });
  });

  test("blocks an amount that exceeds the per-transaction limit and reserves nothing", async () => {
    await withTestUser(async (userId) => {
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: "block-1",
        amountInMinor: 2_000_000,
        currency: "INR",
        merchantName: "TestMart",
      });
      expect(res.status).toBe("POLICY_BLOCKED");

      const policy = await getPolicyRow(userId);
      expect(policy?.consumedInMinor).toBe(0);
      const reservation = await getReservationByTransactionId(res.transactionId);
      expect(reservation).toBeUndefined();
    });
  });

  test("a user cannot read another user's transaction (ownership enforced)", async () => {
    await withTestUser(async (userId) => {
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: "own-1",
        amountInMinor: 100_000,
        currency: "INR",
      });

      const otherId = randomUUID();
      await db.insert(userTable).values({
        id: otherId,
        name: "Other",
        email: `other-${otherId}@cartwright.test`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      try {
        await expect(
          getTransactionForUser(res.transactionId, otherId),
        ).rejects.toBeInstanceOf(TransactionOwnershipError);
      } finally {
        await cleanupUser(otherId);
      }
    });
  });

  test("idempotent per (user, idempotencyKey): a retry returns the original transaction", async () => {
    await withTestUser(async (userId) => {
      const first = await createPurchaseTransaction({
        userId,
        idempotencyKey: "idem-1",
        amountInMinor: 100_000,
        currency: "INR",
      });
      // A tampered amount on retry must NOT create a new transaction.
      const second = await createPurchaseTransaction({
        userId,
        idempotencyKey: "idem-1",
        amountInMinor: 999_999,
        currency: "INR",
      });
      expect(second.transactionId).toBe(first.transactionId);

      const rows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.userId, userId));
      expect(rows.length).toBe(1);
    });
  });

  test("atomic reservation prevents overspend under concurrent requests", async () => {
    await withTestUser(async (userId) => {
      const [a, b] = await Promise.all([
        createPurchaseTransaction({
          userId,
          idempotencyKey: "cc-1",
          amountInMinor: 600_000,
          currency: "INR",
        }),
        createPurchaseTransaction({
          userId,
          idempotencyKey: "cc-2",
          amountInMinor: 600_000,
          currency: "INR",
        }),
      ]);

      const statuses = [a.status, b.status];
      // Budget is 1,000,000 paise; two 600k requests must not both reserve.
      expect(statuses.filter((s) => s === "POLICY_BLOCKED").length).toBe(1);
      expect(
        statuses.filter((s) => s === "AWAITING_APPROVAL" || s === "APPROVED").length,
      ).toBe(1);

      const policy = await getPolicyRow(userId);
      expect(policy?.consumedInMinor).toBe(600_000);

      const reservations = await db
        .select()
        .from(spendingReservations)
        .where(eq(spendingReservations.userId, userId));
      expect(reservations.length).toBe(1);
    });
  });

  test("re-validates policy on approval; rejects when the limit dropped (price changed)", async () => {
    await withTestUser(async (userId) => {
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: "pc-1",
        amountInMinor: 200_000,
        currency: "INR",
      });
      expect(res.status).toBe("AWAITING_APPROVAL");

      // Admin/backend lowers the per-transaction limit below the amount.
      await db
        .update(paymentPolicies)
        .set({ maxTransactionAmount: 100_000 })
        .where(eq(paymentPolicies.userId, userId));

      await expect(
        approveTransaction({ transactionId: res.transactionId, userId }),
      ).rejects.toBeInstanceOf(PriceChangedError);

      const after = await getTransactionById(res.transactionId);
      expect(after?.status).toBe("PRICE_CHANGED");

      // Reservation must be released so budget is restored.
      const policy = await getPolicyRow(userId);
      expect(policy?.consumedInMinor).toBe(0);
    });
  });

  test("cancel releases the reservation and restores budget", async () => {
    await withTestUser(async (userId) => {
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: "cancel-1",
        amountInMinor: 100_000,
        currency: "INR",
      });
      expect(res.status).toBe("APPROVED");

      const cancelled = await cancelTransaction(res.transactionId, userId);
      expect(cancelled.status).toBe("CANCELLED");

      const policy = await getPolicyRow(userId);
      expect(policy?.consumedInMinor).toBe(0);

      const reservation = await getReservationByTransactionId(res.transactionId);
      expect(reservation?.status).toBe("RELEASED");
    });
  });

  test("verifyPayment is idempotent for an already-settled transaction", async () => {
    await withTestUser(async (userId) => {
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: "dupv-1",
        amountInMinor: 100_000,
        currency: "INR",
      });
      // Simulate a prior successful settlement.
      const paymentId = `pay_dup_${randomUUID()}`;
      await db
        .update(transactions)
        .set({ status: "PAYMENT_SUCCEEDED", razorpayPaymentId: paymentId })
        .where(eq(transactions.id, res.transactionId));

      // A verification of an already-settled transaction is a no-op (no network
      // fetch) and returns the same settled result.
      const result = await verifyPayment(
        {
          transactionId: res.transactionId,
          orderId: "ord_dup",
          paymentId,
          signature: "ignored",
        },
        userId,
      );
      expect(result.status).toBe("PAYMENT_SUCCEEDED");

      const again = await verifyPayment(
        {
          transactionId: res.transactionId,
          orderId: "ord_dup",
          paymentId,
          signature: "ignored",
        },
        userId,
      );
      expect(again.status).toBe("PAYMENT_SUCCEEDED");
    });
  });

  test("webhook settles once and ignores duplicate deliveries", async () => {
    await withTestUser(async (userId) => {
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: "wh-1",
        amountInMinor: 100_000,
        currency: "INR",
      });
      expect(res.status).toBe("APPROVED");

      const orderId = `order_${randomUUID()}`;
      const paymentId = `pay_${randomUUID()}`;
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
      expect(first.transactionId).toBe(res.transactionId);

      const settled = await getTransactionById(res.transactionId);
      expect(settled?.status).toBe("PAYMENT_SUCCEEDED");

      // Duplicate delivery is idempotent (no double settlement).
      const second = await handleRazorpayWebhook(rawBody, signature);
      expect(second.handled).toBe(true);
      expect(second.reason).toContain("Already processed");
    });
  });
});
