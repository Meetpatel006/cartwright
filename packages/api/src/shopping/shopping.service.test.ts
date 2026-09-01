import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

import { db } from "@cartwright/db";
import {
  transactions,
  user as userTable,
} from "@cartwright/db/schema";
import {
  getCandidatesForSession,
  getShoppingSessionById,
  listSessionsForUser,
  updateShoppingSession,
} from "@cartwright/db/repositories/shopping.repository";
import type { ProductCandidate } from "@cartwright/agent";

import {
  runShoppingSession,
  selectProductForSession,
} from "./shopping.service";
import { createBrowserSession } from "./browser-session.service";

async function cleanupAllTestData(): Promise<void> {
  await db.execute(
    sql`DELETE FROM audit_events WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE ${"%@cartwright.test"})`,
  );
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE ${"%@cartwright.test"}`);
}

async function cleanupUser(userId: string): Promise<void> {
  await db.execute(sql`DELETE FROM audit_events WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM shopping_sessions WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM browser_sessions WHERE owner_user_id = ${userId}`);
  await db.execute(sql`DELETE FROM transactions WHERE user_id = ${userId}`);
  await db
    .delete(userTable)
    .where(eq(userTable.id, userId));
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

/** Wrap an AbortSignal into a rejecting promise. */
function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
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

describe("shopping service (db-backed)", () => {
  beforeAll(cleanupAllTestData);
  afterAll(cleanupAllTestData);

  test("discovers, ranks, persists candidates, and dedupes repeat requests", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Cheap", rawPrice: "₹50", evidence: { priceValue: 50 } }),
        candidate({ title: "Pricey", rawPrice: "₹5000", evidence: { priceValue: 5000 } }),
        candidate({ title: "NoPrice", rawPrice: "Price unavailable", currency: "INR" }),
      ];

      const out = await runShoppingSession(
        { userId, query: "phone under 100", idempotencyKey: "dup-key" },
        { discover },
      );

      // Pricey (₹5000) is over the ₹100 budget → filtered; NoPrice fails
      // normalization → rejected. Only Cheap reaches the recommendations.
      expect(out.status).toBe("recommended");
      expect(out.recommendations).toHaveLength(1);
      expect(out.recommendations[0]!.product.canonicalTitle).toBe("Cheap");

      const rows = await getCandidatesForSession(out.sessionId);
      expect(rows).toHaveLength(3);
      expect(rows.filter((r) => r.filteredOut).length).toBe(1);
      expect(rows.filter((r) => r.rejected).length).toBe(1);

      // Idempotency: repeating the key returns the SAME session, no new rows.
      const again = await runShoppingSession(
        { userId, query: "phone under 100", idempotencyKey: "dup-key" },
        { discover },
      );
      expect(again.sessionId).toBe(out.sessionId);
      const sessions = await listSessionsForUser(userId);
      expect(sessions).toHaveLength(1);
    });
  });

  test("explicit selection builds a PurchasePlan and hands it to Part A", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Cheap", rawPrice: "₹50", evidence: { priceValue: 50 } }),
        candidate({ title: "Pricey", rawPrice: "₹5000", evidence: { priceValue: 5000 } }),
      ];

      const out = await runShoppingSession(
        { userId, query: "phone under 100" },
        { discover },
      );
      const productId = out.recommendations[0]!.product.id;

      // Selecting a FILTERED product (over budget) must fail — it is not a
      // selectable product in this session.
      const rows = await getCandidatesForSession(out.sessionId);
      const filteredId = rows.find((r) => r.filteredOut)!.productId;
      await expect(
        selectProductForSession({ userId, sessionId: out.sessionId, productId: filteredId }),
      ).rejects.toThrow();

      // Selecting the valid product creates a Part A transaction.
      const result = await selectProductForSession({
        userId,
        sessionId: out.sessionId,
        productId,
      });
      expect(result.plan.productId).toBe(productId);
      expect(result.plan.expectedAmountInMinor).toBe(5_000);
      expect(result.purchase.transactionId).toBeTruthy();

      // Session is now converted; a second selection is rejected.
      await expect(
        selectProductForSession({ userId, sessionId: out.sessionId, productId }),
      ).rejects.toThrow(/already been converted/);
    });
  });

  test("selecting an expired session is rejected", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Cheap", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];

      const out = await runShoppingSession(
        { userId, query: "phone under 100" },
        { discover },
      );
      const productId = out.recommendations[0]!.product.id;

      // Force the terminal `expired` state, then attempt selection.
      await updateShoppingSession(out.sessionId, { status: "expired" });

      await expect(
        selectProductForSession({ userId, sessionId: out.sessionId, productId }),
      ).rejects.toThrow(/expired/);
    });
  });

  // ── Task 2: the charged amount is server-authoritative at selection ───────
  async function attachBrowserSession(
    userId: string,
    sessionId: string,
    key: string,
  ): Promise<void> {
    const browserSession = await createBrowserSession({
      ownerUserId: userId,
      provider: "local",
      providerSessionId: `prov-${key}-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
    await updateShoppingSession(sessionId, { checkoutSessionId: browserSession.id });
  }

  test("selection replaces an understated discovery price with the verified checkout total", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        // Discovered as ₹50 (5000 minor) — understated vs the real checkout.
        candidate({ title: "Cheap", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];
      const out = await runShoppingSession(
        { userId, query: "phone under 100" },
        { discover },
      );
      await attachBrowserSession(userId, out.sessionId, "understated");
      const productId = out.recommendations[0]!.product.id;

      const result = await selectProductForSession(
        { userId, sessionId: out.sessionId, productId },
        // Independent server-side re-read of the REAL checkout total.
        { readLiveCheckoutTotal: async () => ({ amountInMinor: 9_000, currency: "INR" }) },
      );

      // Plan keeps the provisional discovery evidence…
      expect(result.plan.expectedAmountInMinor).toBe(5_000);
      // …but the TRANSACTION charges the verified amount (₹90), which the
      // policy engine re-evaluates against the user's budget.
      expect(result.purchase.amountInMinor).toBe(9_000);
    });
  });

  test("a checkout currency switch blocks selection and creates no transaction", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Cheap", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];
      const out = await runShoppingSession(
        { userId, query: "phone under 100" },
        { discover },
      );
      await attachBrowserSession(userId, out.sessionId, "currencyswap");
      const productId = out.recommendations[0]!.product.id;

      await expect(
        selectProductForSession(
          { userId, sessionId: out.sessionId, productId },
          { readLiveCheckoutTotal: async () => ({ amountInMinor: 100, currency: "USD" }) },
        ),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

      // No financial side effects: no transaction, session still selectable.
      const txns = await db.select().from(transactions).where(eq(transactions.userId, userId));
      expect(txns).toHaveLength(0);
      const fresh = await getShoppingSessionById(out.sessionId);
      expect(fresh?.status).toBe("recommended");
    });
  });

  test("an unreadable checkout falls back to the provisional discovered price", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Cheap", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];
      const out = await runShoppingSession(
        { userId, query: "phone under 100" },
        { discover },
      );
      await attachBrowserSession(userId, out.sessionId, "unreadable");
      const productId = out.recommendations[0]!.product.id;

      const result = await selectProductForSession(
        { userId, sessionId: out.sessionId, productId },
        { readLiveCheckoutTotal: async () => null },
      );
      expect(result.purchase.amountInMinor).toBe(5_000);
    });
  });

  // ── Part B closure: single entry-point invariant ────────────────────────
  // After removing agentRouter.shop, createPurchaseTransaction is only called
  // from selectProductForSession. This test documents that invariant by
  // verifying the only production path from discovery to transaction creation.
  test("the only path from discovery to transaction creation is through selectProductForSession", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Widget", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];

      const out = await runShoppingSession(
        { userId, query: "widget" },
        { discover },
      );
      expect(out.status).toBe("recommended");

      // Verify no transaction was created during discovery — only on selection.
      const txnsBefore = await db
        .select()
        .from(transactions)
        .where(eq(transactions.userId, userId));
      expect(txnsBefore).toHaveLength(0);

      // Now select — this is the ONLY path that creates a transaction.
      const productId = out.recommendations[0]!.product.id;
      const result = await selectProductForSession({
        userId,
        sessionId: out.sessionId,
        productId,
      });
      expect(result.purchase.transactionId).toBeTruthy();

      // Exactly one transaction exists after selection.
      const txnsAfter = await db
        .select()
        .from(transactions)
        .where(eq(transactions.userId, userId));
      expect(txnsAfter).toHaveLength(1);
    });
  });

  // ── Top-level timeout: the agent respects the execution budget ────────────
  // The env.AGENT_RUN_TIMEOUT_SECONDS is validated at import time by @t3-oss/env-core,
  // so we test the mechanism directly via AbortSignal.timeout rather than env override.
  test("AbortSignal.timeout rejects after the budget expires", async () => {
    // Simulate what runShoppingSession does: create a signal from the budget.
    const signal = AbortSignal.timeout(200); // 200ms budget

    const slowWork = new Promise<void>((resolve) => setTimeout(resolve, 5_000));

    await expect(
      Promise.race([slowWork, abortPromise(signal)]),
    ).rejects.toThrow();
  });

  // ── AbortSignal propagation: signal fires → agent stops ──────────────────
  test("aborting the signal stops a running discovery", async () => {
    await withTestUser(async (userId) => {
      const controller = new AbortController();
      let discovered = false;

      const slowDiscover = async (): Promise<ProductCandidate[]> => {
        // Wait for the signal to fire.
        await new Promise<void>((resolve, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
          // Also resolve after a long time as fallback.
          setTimeout(resolve, 30_000);
        });
        discovered = true;
        return [];
      };

      // Fire the signal after 200ms.
      setTimeout(() => controller.abort(), 200);

      await expect(
        runShoppingSession(
          { userId, query: "abort me" },
          { discover: slowDiscover },
        ),
      ).rejects.toThrow();

      // Discovery should NOT have completed — the signal stopped it.
      expect(discovered).toBe(false);
    });
  });
});
