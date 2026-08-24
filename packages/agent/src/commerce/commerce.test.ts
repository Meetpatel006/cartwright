import { describe, expect, test } from "bun:test";

import { explainRanking, generateRecommendations } from "./recommendation";
import { createPurchasePlan } from "./purchase-plan";
import { rankProducts } from "../ranking/product-ranker";
import type { NormalizedProduct, ShoppingIntent } from "./types";

function mk(over: Partial<NormalizedProduct>): NormalizedProduct {
  return {
    id: over.id ?? `id-${Math.random().toString(36).slice(2)}`,
    merchant: "Amazon",
    canonicalTitle: "Product",
    amountInMinor: 100_00,
    currency: "USD",
    productUrl: "https://example.com/p",
    availability: "in_stock",
    confidence: 1,
    attributes: {},
    confidenceReasons: [],
    ...over,
  };
}

function intent(over: Partial<ShoppingIntent>): ShoppingIntent {
  return {
    rawQuery: "query",
    category: null,
    budgetInMinor: 1_000_00,
    currency: "USD",
    requestedQuantity: 1,
    preferredMerchants: [],
    excludedMerchants: [],
    constraints: [],
    ...over,
  };
}

describe("recommendation explanations", () => {
  test("explanations reference real ranking signals only", () => {
    const product = mk({ id: "a", canonicalTitle: "Alpha", availability: "in_stock" });
    const ranked = rankProducts([product], intent({ budgetInMinor: 500_00 }));
    const lines = explainRanking(ranked[0]!, product);
    expect(lines.length).toBeGreaterThan(0);
    // Every line must cite something concrete (price / availability / etc.).
    expect(lines.join(" ")).toMatch(/budget|stock|confidence|merchant|constraint/i);
  });

  test("does not invent properties — neutral factors are omitted", () => {
    const product = mk({ id: "a" });
    const ranked = rankProducts([product], intent({}));
    const lines = explainRanking(ranked[0]!, product);
    // With no budget/constraints/preferences, only confidence/availability show.
    expect(lines.join(" ")).not.toMatch(/matches \d+ of \d+ constraints \(Listing mentions warranty\)/);
  });

  test("non-top products explain how they compare to the top pick", () => {
    const top = mk({ id: "top", canonicalTitle: "Top", merchant: "Nike", amountInMinor: 90_00 });
    const other = mk({ id: "other", canonicalTitle: "Other", amountInMinor: 95_00 });
    const ranked = rankProducts([top, other], intent({ preferredMerchants: ["nike"], budgetInMinor: 1_000_00 }));
    const recs = generateRecommendations(ranked, [top, other]);
    expect(recs[0]!.isTopRecommendation).toBe(true);
    expect(recs[1]!.isTopRecommendation).toBe(false);
    expect(recs[1]!.explanation.some((l) => /Ranked below the top pick/.test(l))).toBe(true);
  });

  test("generateRecommendations preserves ranking order", () => {
    const a = mk({ id: "a", amountInMinor: 100_00 });
    const b = mk({ id: "b", amountInMinor: 200_00 });
    const ranked = rankProducts([a, b], intent({}));
    const recs = generateRecommendations(ranked, [a, b]);
    expect(recs.map((r) => r.product.id)).toEqual(ranked.map((r) => r.productId));
  });
});

describe("purchase plan", () => {
  test("references an existing normalized product and its evidence", () => {
    const product = mk({ id: "p1", canonicalTitle: "iPhone", merchant: "Apple", amountInMinor: 79_900_00, currency: "INR" });
    const ranked = rankProducts([product], intent({ budgetInMinor: 80_000_00, currency: "INR" }));
    const plan = createPurchasePlan(product, ranked[0]!, intent({ budgetInMinor: 80_000_00, currency: "INR" }));
    expect(plan.productId).toBe("p1");
    expect(plan.expectedAmountInMinor).toBe(79_900_00);
    expect(plan.currency).toBe("INR");
    expect(plan.merchant).toBe("Apple");
    expect(plan.evidence.amountInMinor).toBe(79_900_00);
  });

  test("amount comes from normalized evidence, not arbitrary input", () => {
    const product = mk({ id: "p", amountInMinor: 1234_00, currency: "USD" });
    const ranked = rankProducts([product], intent({}));
    const plan = createPurchasePlan(product, ranked[0]!, intent({}));
    expect(plan.expectedAmountInMinor).toBe(1234_00);
  });

  test("records applied constraints", () => {
    const product = mk({ id: "p" });
    const ranked = rankProducts([product], intent({ budgetInMinor: 500_00, excludedMerchants: ["amazon"], constraints: ["in_stock"] }));
    const plan = createPurchasePlan(product, ranked[0]!, intent({ budgetInMinor: 500_00, excludedMerchants: ["amazon"], constraints: ["in_stock"] }));
    expect(plan.constraintsApplied.some((c) => c.includes("Budget cap"))).toBe(true);
    expect(plan.constraintsApplied.some((c) => c.includes("amazon"))).toBe(true);
    expect(plan.constraintsApplied.some((c) => c.includes("in_stock"))).toBe(true);
  });

  test("plan is a plain data object referencing a product; it does not trigger payment", () => {
    const product = mk({ id: "p" });
    const ranked = rankProducts([product], intent({}));
    const plan = createPurchasePlan(product, ranked[0]!, intent({}));
    // Sanity: the plan type has no payment/order fields.
    expect((plan as unknown as Record<string, unknown>).razorpayOrderId).toBeUndefined();
    expect((plan as unknown as Record<string, unknown>).status).toBeUndefined();
    expect(typeof plan.selectedAt).toBe("string");
  });
});
