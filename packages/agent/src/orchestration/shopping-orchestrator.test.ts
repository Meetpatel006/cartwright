import { describe, expect, test } from "bun:test";

import { executeShoppingRequest, selectProduct, type ShoppingOrchestratorDeps } from "./shopping-orchestrator";
import type { ProductCandidate, ShoppingIntent } from "../commerce/types";
import { ProductNotInSessionError } from "../errors";

function candidate(partial: Partial<ProductCandidate> & { title: string; rawPrice: string }): ProductCandidate {
  return {
    source: "Amazon",
    merchant: "Amazon",
    currency: "USD",
    productUrl: "https://example.com/p",
    availabilityText: "In Stock",
    evidence: {},
    ...partial,
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

describe("executeShoppingRequest", () => {
  test("runs the full pipeline and produces recommendations", async () => {
    const candidates: ProductCandidate[] = [
      candidate({ title: "Cheap", rawPrice: "$50", evidence: { priceValue: 50 } }),
      candidate({ title: "Premium", rawPrice: "$900", evidence: { priceValue: 900 } }),
    ];
    const deps: ShoppingOrchestratorDeps = { discover: async () => candidates };
    const session = await executeShoppingRequest(intent({}), deps);

    expect(session.normalized).toHaveLength(2);
    expect(session.recommendations).toHaveLength(2);
    expect(session.recommendations[0]!.isTopRecommendation).toBe(true);
    // Cheaper product should rank first when all else equal.
    expect(session.recommendations[0]!.product.canonicalTitle).toBe("Cheap");
  });

  test("filters over-budget products and records the reason", async () => {
    const candidates: ProductCandidate[] = [
      candidate({ title: "Ok", rawPrice: "$100", evidence: { priceValue: 100 } }),
      candidate({ title: "TooPricey", rawPrice: "$5000", evidence: { priceValue: 5000 } }),
    ];
    const deps: ShoppingOrchestratorDeps = { discover: async () => candidates };
    const session = await executeShoppingRequest(intent({ budgetInMinor: 1_000_00 }), deps);

    expect(session.recommendations.map((r) => r.product.canonicalTitle)).toEqual(["Ok"]);
    expect(session.filteredOut).toHaveLength(1);
    expect(session.filteredOut[0]!.reason).toMatch(/exceeds budget/);
  });

  test("routes unnormalizable candidates to rejectedCandidates", async () => {
    const bad: ProductCandidate = candidate({ title: "NoPrice", rawPrice: "Price unavailable", currency: "USD" });
    const good: ProductCandidate = candidate({ title: "Good", rawPrice: "$10", evidence: { priceValue: 10 } });
    const deps: ShoppingOrchestratorDeps = { discover: async () => [bad, good] };
    const session = await executeShoppingRequest(intent({}), deps);

    expect(session.normalized).toHaveLength(1);
    expect(session.rejectedCandidates.some((r) => r.candidate.title === "NoPrice")).toBe(true);
  });

  test("empty discovery yields no recommendations", async () => {
    const deps: ShoppingOrchestratorDeps = { discover: async () => [] };
    const session = await executeShoppingRequest(intent({}), deps);
    expect(session.normalized).toHaveLength(0);
    expect(session.recommendations).toHaveLength(0);
  });
});

describe("selectProduct", () => {
  test("creates a purchase plan from a session product", async () => {
    const good = candidate({ title: "Good", rawPrice: "$10", evidence: { priceValue: 10 } });
    const deps: ShoppingOrchestratorDeps = { discover: async () => [good] };
    const session = await executeShoppingRequest(intent({ budgetInMinor: 100_00 }), deps);
    const productId = session.normalized[0]!.id;

    const plan = selectProduct(session, productId);
    expect(plan.productId).toBe(productId);
    expect(plan.expectedAmountInMinor).toBe(1_000);
    expect(plan.currency).toBe("USD");
  });

  test("rejects selection of a product not in the session", async () => {
    const good = candidate({ title: "Good", rawPrice: "$10", evidence: { priceValue: 10 } });
    const deps: ShoppingOrchestratorDeps = { discover: async () => [good] };
    const session = await executeShoppingRequest(intent({}), deps);
    expect(() => selectProduct(session, "ghost")).toThrow(ProductNotInSessionError);
  });
});
