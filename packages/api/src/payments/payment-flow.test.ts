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
  InvalidTransactionStateError,
  PriceChangedError,
  TransactionOwnershipError,
} from "../transactions/transaction.errors";
import { approveTransaction } from "../payments/payment-approval.service";
import { handleRazorpayWebhook } from "./razorpay-webhook.service";
import { createBrowserSession } from "../shopping/browser-session.service";

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

  // ── Task 1: merchant-UI path must reach a REAL terminal state ─────────────
  // The agent's returned status is never proof of payment; success requires the
  // independently captured merchant order-confirmation page. These tests drive
  // approveTransaction through its injected adapters (the production defaults
  // are the real agent functions) against the real DB state machine.
  test("merchant-UI payment with independent confirmation reaches PAYMENT_SUCCEEDED", async () => {
    await withTestUser(async (userId) => {
      const browserSession = await createBrowserSession({
        ownerUserId: userId,
        provider: "local",
        providerSessionId: `prov-confirm-${userId}`,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: "mui-ok-1",
        amountInMinor: 100_000,
        currency: "INR",
        browserSessionId: browserSession.id,
      });
      expect(res.status).toBe("APPROVED");

      const result = await approveTransaction(
        { transactionId: res.transactionId, userId },
        {
          readLiveCheckoutTotal: async () => null,
          closeProvider: async () => {},
          driveMerchantPayment: async () => ({
            status: "submitted" as const,
            message: "submitted; awaiting merchant server confirmation.",
            orderConfirmation: {
              url: "http://localhost:5173/order-confirmation",
              title: "Order Confirmed | Raven Scents",
              text: "Thank you for your order",
              orderId: "RVN52FLH8XO1",
              amount: null,
              statusText: "Order Confirmed",
            },
          }),
        },
      );

      // Real terminal state, not a stranded PAYMENT_PROCESSING row.
      expect(result.result.status).toBe("PAYMENT_SUCCEEDED");

      const reservation = await getReservationByTransactionId(res.transactionId);
      expect(reservation?.status).toBe("SETTLED");

      const events = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.transactionId, res.transactionId));
      const success = events.find((e) => e.eventType === "PAYMENT_SUCCEEDED");
      expect(success).toBeDefined();
      // The audit must cite the INDEPENDENT confirmation, not the agent's word.
      expect(success?.reason).toContain("Independently confirmed");
    });
  });

  test("merchant-UI drive failure reaches PAYMENT_FAILED and releases the reservation", async () => {
    await withTestUser(async (userId) => {
      const browserSession = await createBrowserSession({
        ownerUserId: userId,
        provider: "local",
        providerSessionId: `prov-fail-${userId}`,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: "mui-fail-1",
        amountInMinor: 100_000,
        currency: "INR",
        browserSessionId: browserSession.id,
      });

      // The old code recorded PAYMENT_SUCCEEDED for exactly this outcome.
      const result = await approveTransaction(
        { transactionId: res.transactionId, userId },
        {
          readLiveCheckoutTotal: async () => null,
          closeProvider: async () => {},
          driveMerchantPayment: async () => ({
            status: "not_found" as const,
            message: "Merchant checkout session was not found or has expired.",
          }),
        },
      );

      expect(result.result.status).toBe("PAYMENT_FAILED");
      expect(result.result.failureReason).toContain("did not complete");

      const reservation = await getReservationByTransactionId(res.transactionId);
      expect(reservation?.status).toBe("RELEASED");

      const policy = await getPolicyRow(userId);
      expect(policy?.consumedInMinor).toBe(0);

      const events = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.transactionId, res.transactionId));
      expect(events.some((e) => e.eventType === "PAYMENT_FAILED")).toBe(true);
      // And no false success anywhere in the trail.
      expect(events.some((e) => e.eventType === "PAYMENT_SUCCEEDED")).toBe(false);
    });
  });

  test("submitted-but-unconfirmed stays PAYMENT_PROCESSING with the reservation held", async () => {
    await withTestUser(async (userId) => {
      const browserSession = await createBrowserSession({
        ownerUserId: userId,
        provider: "local",
        providerSessionId: `prov-pend-${userId}`,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: "mui-pend-1",
        amountInMinor: 100_000,
        currency: "INR",
        browserSessionId: browserSession.id,
      });

      const result = await approveTransaction(
        { transactionId: res.transactionId, userId },
        {
          readLiveCheckoutTotal: async () => null,
          closeProvider: async () => {},
          driveMerchantPayment: async () => ({
            status: "submitted" as const,
            message: "submitted",
            orderConfirmation: null,
          }),
        },
      );

      // Honest pending state — no fake success, no premature settle.
      expect(result.result.status).toBe("PAYMENT_PROCESSING");
      const reservation = await getReservationByTransactionId(res.transactionId);
      expect(reservation?.status).toBe("RESERVED");

      const events = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.transactionId, res.transactionId));
      expect(events.some((e) => e.eventType === "PAYMENT_PENDING")).toBe(true);
      expect(events.some((e) => e.eventType === "PAYMENT_SUCCEEDED")).toBe(false);
    });
  });

  // ── Part D: provisional amount authority invariant ─────────────────────────
  // When the live merchant checkout total is unavailable at approval time,
  // the price revalidation permits the transaction to proceed with the
  // previously-approved amount. This is SAFE because:
  //   1. The amount was already validated by the policy engine at creation
  //      time (maxTransactionAmount, maxTotalSpending, currency).
  //   2. The amount was already validated again at approval time (policy
  //      re-check in approveTransaction).
  //   3. The approval re-validates policy against the same persisted amount.
  // A live read failure does NOT bypass the policy — it just means the
  // re-validation cannot detect a price increase since approval.
  test("provisional amount fallback is policy-gated: approval with unavailable live checkout uses previously approved amount", async () => {
    await withTestUser(async (userId) => {
      const browserSession = await createBrowserSession({
        ownerUserId: userId,
        provider: "local",
        providerSessionId: `prov-auth-${userId}`,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });

      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: `auth-inv-1`,
        amountInMinor: 100_000,
        currency: "INR",
        browserSessionId: browserSession.id,
      });

      // The transaction was created with the amount above (auto-approved
      // because it's within the test limit). The policy already validated it.
      expect(res.status).toBe("APPROVED");
      expect(res.amountInMinor).toBe(100_000);

      // At approval time, the live checkout total is unavailable.
      // Price revalidation must NOT block — it falls back to the approved amount.
      const result = await approveTransaction(
        { transactionId: res.transactionId, userId },
        {
          // Simulate: live checkout total unavailable (agent session gone)
          readLiveCheckoutTotal: async () => null,
          closeProvider: async () => {},
          driveMerchantPayment: async () => ({
            status: "submitted" as const,
            message: "submitted",
            orderConfirmation: null,
          }),
        },
      );

      // Payment proceeds using the previously-approved amount.
      // The amount is NOT re-verified from the merchant page (it can't be),
      // but the policy already validated it at creation AND approval time.
      expect(result.result.amountInMinor).toBe(100_000);

      // Verify the policy was indeed the gate: if we try with an amount
      // that exceeds the policy limit, it would have been blocked at creation.
      await expect(
        createPurchaseTransaction({
          userId,
          idempotencyKey: `auth-inv-blocked`,
          amountInMinor: 2_000_000, // Exceeds limit
          currency: "INR",
          browserSessionId: browserSession.id,
        }),
      ).resolves.toMatchObject({ status: "POLICY_BLOCKED" });
    });
  });

  test("a second approval click cannot re-drive a processed merchant payment", async () => {
    await withTestUser(async (userId) => {
      const browserSession = await createBrowserSession({
        ownerUserId: userId,
        provider: "local",
        providerSessionId: `prov-replay-${userId}`,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });
      const res = await createPurchaseTransaction({
        userId,
        idempotencyKey: "mui-replay-1",
        amountInMinor: 100_000,
        currency: "INR",
        browserSessionId: browserSession.id,
      });

      let drives = 0;
      const deps = {
        readLiveCheckoutTotal: async () => null,
        closeProvider: async () => {},
        driveMerchantPayment: async () => {
          drives += 1;
          return {
            status: "not_found" as const,
            message: "gone",
          };
        },
      };

      await approveTransaction({ transactionId: res.transactionId, userId }, deps);
      expect(drives).toBe(1);

      // The first drive moved the row to PAYMENT_PROCESSING/PAYMENT_FAILED, so
      // a replay is rejected by the entry-state guard before any browser work.
      await expect(
        approveTransaction({ transactionId: res.transactionId, userId }, deps),
      ).rejects.toBeInstanceOf(InvalidTransactionStateError);
      expect(drives).toBe(1);
    });
  });
});
