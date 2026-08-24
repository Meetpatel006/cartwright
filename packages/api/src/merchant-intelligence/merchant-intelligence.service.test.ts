import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

import { db } from "@cartwright/db";
import { user as userTable } from "@cartwright/db/schema";
import { updateTransaction } from "@cartwright/db/repositories/transaction.repository";
import type { ProductCandidate } from "@cartwright/agent";

import { runShoppingSession, selectProductForSession } from "../shopping/shopping.service";
import { cancelTransaction } from "../transactions/transaction.service";
import {
  getFunnel,
  getInsights,
  getOverview,
  getProducts,
  resolveTimeWindow,
} from "./merchant-intelligence.service";

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

describe("merchant intelligence service (db-backed)", () => {
  beforeAll(cleanupAllTestData);
  afterAll(cleanupAllTestData);

  test("resolveTimeWindow rejects start >= end and spans over the max window", () => {
    expect(() => resolveTimeWindow({ start: "2024-01-05", end: "2024-01-01" })).toThrow();
    expect(() =>
      resolveTimeWindow({ start: "2000-01-01", end: "2025-01-01" }),
    ).toThrow(/cannot exceed/);
    const window = resolveTimeWindow({ preset: "24h" });
    expect(window.end.getTime() - window.start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  test("empty data => zero funnel counts, no products, no insights", async () => {
    await withTestUser(async (userId) => {
      const overview = await getOverview(userId);
      expect(overview.funnel.counts).toEqual({
        sessionsTotal: 0,
        discovered: 0,
        recommended: 0,
        selected: 0,
        purchaseRequested: 0,
        approved: 0,
        paymentSucceeded: 0,
        policyBlocked: 0,
        cancelled: 0,
      });
      expect(overview.topProducts).toHaveLength(0);
      expect(overview.insights).toHaveLength(0);
    });
  });

  test("discovery -> recommendation without selection stops the funnel there", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Cheap", rawPrice: "₹50", evidence: { priceValue: 50 } }),
        candidate({ title: "Pricey", rawPrice: "₹5000", evidence: { priceValue: 5000 } }),
      ];
      await runShoppingSession({ userId, query: "phone under 100" }, { discover });

      const funnel = await getFunnel(userId);
      // Both candidates are normalized (discovered); only "Cheap" fits the
      // ₹100 budget and reaches a recommendation.
      expect(funnel.counts.discovered).toBe(2);
      expect(funnel.counts.recommended).toBe(1);
      expect(funnel.counts.selected).toBe(0);
      expect(funnel.counts.purchaseRequested).toBe(0);
    });
  });

  test("explicit selection advances selected + purchaseRequested", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Cheap", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];
      const out = await runShoppingSession({ userId, query: "phone under 100" }, { discover });
      const productId = out.recommendations[0]!.product.id;

      await selectProductForSession({ userId, sessionId: out.sessionId, productId });

      const funnel = await getFunnel(userId);
      expect(funnel.counts.selected).toBe(1);
      expect(funnel.counts.purchaseRequested).toBe(1);
    });
  });

  test("full conversion: a successful payment is reflected in the funnel and product performance", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Cheap", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];
      const out = await runShoppingSession({ userId, query: "phone under 100" }, { discover });
      const productId = out.recommendations[0]!.product.id;

      const { purchase } = await selectProductForSession({
        userId,
        sessionId: out.sessionId,
        productId,
      });
      // Fixture only: fabricate the terminal payment outcome directly at the
      // DB layer (this is a test setup shortcut, not a Part C write path —
      // Part C never calls `updateTransaction` in production code).
      await updateTransaction(purchase.transactionId, { status: "PAYMENT_SUCCEEDED" });

      const funnel = await getFunnel(userId);
      expect(funnel.counts.paymentSucceeded).toBe(1);
      expect(funnel.overallConversionRate).toBe(1);

      const { products } = await getProducts(userId);
      const p = products.find((row) => row.productId === productId);
      expect(p).toBeDefined();
      expect(p!.timesConverted).toBe(1);
      expect(p!.conversionRate).toBe(1);
    });
  });

  test("a failed payment counts as approved but not paymentSucceeded", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Cheap", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];
      const out = await runShoppingSession({ userId, query: "phone under 100" }, { discover });
      const productId = out.recommendations[0]!.product.id;
      const { purchase } = await selectProductForSession({
        userId,
        sessionId: out.sessionId,
        productId,
      });
      await updateTransaction(purchase.transactionId, { status: "PAYMENT_FAILED" });

      const funnel = await getFunnel(userId);
      expect(funnel.counts.approved).toBe(1);
      expect(funnel.counts.paymentSucceeded).toBe(0);
    });
  });

  test("a cancelled transaction (real Part A cancel flow) is counted, not converted", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Cheap", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];
      const out = await runShoppingSession({ userId, query: "phone under 100" }, { discover });
      const productId = out.recommendations[0]!.product.id;
      const { purchase } = await selectProductForSession({
        userId,
        sessionId: out.sessionId,
        productId,
      });
      await cancelTransaction(purchase.transactionId, userId);

      const funnel = await getFunnel(userId);
      expect(funnel.counts.cancelled).toBe(1);
      expect(funnel.counts.paymentSucceeded).toBe(0);
    });
  });

  test("duplicate/idempotent shopping requests do not inflate discovery/recommendation counts", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Cheap", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];
      await runShoppingSession(
        { userId, query: "phone under 100", idempotencyKey: "dup-key" },
        { discover },
      );
      await runShoppingSession(
        { userId, query: "phone under 100", idempotencyKey: "dup-key" },
        { discover },
      );

      const funnel = await getFunnel(userId);
      expect(funnel.counts.sessionsTotal).toBe(1);
      expect(funnel.counts.discovered).toBe(1);
      expect(funnel.counts.recommended).toBe(1);
    });
  });

  test("the same product discovered across multiple sessions is aggregated by its stable id", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Same Product", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];
      await runShoppingSession({ userId, query: "phone under 100" }, { discover });
      await runShoppingSession({ userId, query: "phone under 100" }, { discover });

      const { products } = await getProducts(userId);
      expect(products).toHaveLength(1);
      expect(products[0]!.timesDiscovered).toBe(2);
      expect(products[0]!.timesRecommended).toBe(2);
    });
  });

  test("an underperforming-recommendation insight fires only once the sample threshold is met", async () => {
    await withTestUser(async (userId) => {
      const discover = async (): Promise<ProductCandidate[]> => [
        candidate({ title: "Ignored Widget", rawPrice: "₹50", evidence: { priceValue: 50 } }),
      ];

      // Below the minimum sample size (5): no insight yet.
      for (let i = 0; i < 4; i++) {
        await runShoppingSession({ userId, query: `query ${i}` }, { discover });
      }
      let insights = await getInsights(userId);
      expect(
        insights.insights.filter((ins) => ins.type === "underperforming_recommendation"),
      ).toHaveLength(0);

      // One more run reaches the threshold, still with zero selections.
      await runShoppingSession({ userId, query: "query 5" }, { discover });
      insights = await getInsights(userId);
      const flagged = insights.insights.filter(
        (ins) => ins.type === "underperforming_recommendation",
      );
      expect(flagged).toHaveLength(1);
      expect(flagged[0]!.evidence.sampleSize).toBe(5);
      expect(flagged[0]!.confidence).toBe("low");
    });
  });

  test("cross-user isolation: one user's data never appears in another user's intelligence", async () => {
    await withTestUser(async (userA) => {
      await withTestUser(async (userB) => {
        const discover = async (): Promise<ProductCandidate[]> => [
          candidate({ title: "A-only product", rawPrice: "₹50", evidence: { priceValue: 50 } }),
        ];
        await runShoppingSession({ userId: userA, query: "phone under 100" }, { discover });

        const overviewA = await getOverview(userA);
        const overviewB = await getOverview(userB);

        expect(overviewA.funnel.counts.discovered).toBe(1);
        expect(overviewB.funnel.counts.discovered).toBe(0);
        expect(overviewB.topProducts).toHaveLength(0);
      });
    });
  });
});
