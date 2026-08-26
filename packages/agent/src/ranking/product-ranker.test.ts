import { describe, expect, test } from "bun:test";

import { filterCandidates } from "../filtering/product-filter";
import { rankProducts, rankProduct } from "./product-ranker";
import type { NormalizedProduct, ShoppingIntent } from "../commerce/types";

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

describe("filterCandidates", () => {
  test("drops products over budget", () => {
    const products = [mk({ id: "a", amountInMinor: 1_500_00 }), mk({ id: "b", amountInMinor: 500_00 })];
    const { kept, filteredOut } = filterCandidates(products, intent({ budgetInMinor: 1_000_00 }));
    expect(kept.map((p) => p.id)).toEqual(["b"]);
    expect(filteredOut[0]!.reason).toMatch(/exceeds budget/);
  });

  test("drops a blocked merchant", () => {
    const products = [mk({ id: "a", merchant: "Amazon" }), mk({ id: "b", merchant: "Ebay" })];
    const { kept, filteredOut } = filterCandidates(
      products,
      intent({ excludedMerchants: ["amazon"] }),
    );
    expect(kept.map((p) => p.id)).toEqual(["b"]);
    expect(filteredOut[0]!.reason).toMatch(/excluded/);
  });

  test("drops out-of-stock products", () => {
    const products = [mk({ id: "a", availability: "out_of_stock" }), mk({ id: "b", availability: "in_stock" })];
    const { kept } = filterCandidates(products, intent({}));
    expect(kept.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("rankProducts — signals", () => {
  test("a product matching more constraints ranks higher", () => {
    const base = { currency: "USD" as const, amountInMinor: 100_00, availability: "in_stock" as const, confidence: 1 };
    const more = mk({ id: "more", canonicalTitle: "Alpha", ...base, attributes: { availability_text: "in stock" } });
    const fewer = mk({ id: "fewer", canonicalTitle: "Beta", ...base });
    const ranked = rankProducts(
      [fewer, more],
      intent({ constraints: ["in_stock", "warranty"] }),
    );
    // 'more' has an availability_text matching 'in_stock'; 'fewer' matches none.
    expect(ranked[0]!.productId).toBe("more");
  });

  test("price alone does not automatically win", () => {
    const cheap = mk({
      id: "cheap",
      canonicalTitle: "Cheap",
      amountInMinor: 50_00,
      availability: "unknown",
      confidence: 0.6,
      merchant: "UnknownShop",
    });
    const better = mk({
      id: "better",
      canonicalTitle: "Better",
      amountInMinor: 90_00,
      availability: "in_stock",
      confidence: 1,
      merchant: "Nike",
    });
    const ranked = rankProducts(
      [cheap, better],
      intent({ budgetInMinor: 1_000_00, preferredMerchants: ["nike"], constraints: ["in_stock"] }),
    );
    expect(ranked[0]!.productId).toBe("better");
  });

  test("ranking is deterministic for identical inputs", () => {
    const products = [
      mk({ id: "x", amountInMinor: 100_00 }),
      mk({ id: "y", amountInMinor: 200_00 }),
      mk({ id: "z", amountInMinor: 150_00 }),
    ];
    const a = rankProducts(products, intent({}));
    const b = rankProducts(products, intent({}));
    expect(a).toEqual(b);
  });

  test("every factor name appears in the factors list", () => {
    const result = rankProduct(mk({ id: "p" }), intent({ constraints: ["in_stock"], preferredMerchants: ["amazon"] }));
    const names = result.factors.map((f) => f.name);
    expect(names).toContain("budget_fit");
    expect(names).toContain("constraint_match");
    expect(names).toContain("availability");
    expect(names).toContain("merchant_preference");
    expect(names).toContain("data_confidence");
  });

  test("low-confidence data is penalized", () => {
    const high = rankProduct(mk({ id: "h", confidence: 1 }), intent({}));
    const low = rankProduct(mk({ id: "l", confidence: 0.4 }), intent({}));
    expect(low.score).toBeLessThan(high.score);
    const confFactor = low.factors.find((f) => f.name === "data_confidence")!;
    expect(confFactor.impact).toBeLessThan(0);
  });

  test("preferred merchant boosts score; excluded merchant hurts", () => {
    const preferred = rankProduct(mk({ id: "p", merchant: "Nike" }), intent({ preferredMerchants: ["nike"] }));
    const neutral = rankProduct(mk({ id: "n", merchant: "Other" }), intent({ preferredMerchants: ["nike"] }));
    expect(preferred.score).toBeGreaterThan(neutral.score);

    const excluded = rankProduct(mk({ id: "e", merchant: "Amazon" }), intent({ excludedMerchants: ["amazon"] }));
    const merchantFactor = excluded.factors.find((f) => f.name === "merchant_preference")!;
    expect(merchantFactor.impact).toBeLessThan(0);
  });

  test("score is never negative", () => {
    const terrible = rankProduct(
      mk({ id: "t", amountInMinor: 9_999_00, availability: "out_of_stock", confidence: 0.2, merchant: "Blocked" }),
      intent({ budgetInMinor: 1_000_00, excludedMerchants: ["blocked"] }),
    );
    expect(terrible.score).toBeGreaterThanOrEqual(0);
  });
});
