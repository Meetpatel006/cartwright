import { describe, expect, test } from "bun:test";

import {
  cleanFallbackSearchQuery,
  extractCategory,
  extractConstraints,
  extractMerchantPreferences,
  extractQuantity,
  parseShoppingRequest,
} from "./parse-shopping-request";
import { ShoppingRequestValidationError } from "../errors";

describe("parseShoppingRequest — budget extraction", () => {
  test("parses 'under $100' as 10000 USD minor units", () => {
    const intent = parseShoppingRequest({ query: "wireless headphones under $100" });
    expect(intent.budgetInMinor).toBe(10_000);
    expect(intent.currency).toBe("USD");
  });

  test("parses 'below ₹30000' as 3000000 INR minor units", () => {
    const intent = parseShoppingRequest({ query: "phone below ₹30000", defaultCurrency: "INR" });
    expect(intent.budgetInMinor).toBe(3_000_000);
    expect(intent.currency).toBe("INR");
  });

  test("parses 'k' suffix with explicit currency", () => {
    const intent = parseShoppingRequest({ query: "laptop under 10k inr", defaultCurrency: "INR" });
    expect(intent.budgetInMinor).toBe(1_000_000);
    expect(intent.currency).toBe("INR");
  });

  test("parses 'lakh' suffix", () => {
    const intent = parseShoppingRequest({ query: "sofa under 1.5 lakh inr" });
    expect(intent.budgetInMinor).toBe(15_000_000);
  });

  test("parses 'less than 500 usd'", () => {
    const intent = parseShoppingRequest({ query: "shoes less than 500 usd" });
    expect(intent.budgetInMinor).toBe(50_000);
  });

  test("no budget expressed yields null budget (never silently unlimited)", () => {
    const intent = parseShoppingRequest({ query: "find me a nice coffee mug" });
    expect(intent.budgetInMinor).toBeNull();
  });

  test("fallback budget is only used when query has none", () => {
    const withFallback = parseShoppingRequest({
      query: "find a mug",
      fallbackBudgetInMinor: 5_000,
    });
    expect(withFallback.budgetInMinor).toBe(5_000);

    const withBudget = parseShoppingRequest({
      query: "mug under $20",
      fallbackBudgetInMinor: 5_000,
    });
    expect(withBudget.budgetInMinor).toBe(2_000);
  });
});

describe("parseShoppingRequest — currency normalization", () => {
  test("defaults to the provided store currency when no symbol present", () => {
    const intent = parseShoppingRequest({
      query: "dark ocean under 1000",
      defaultCurrency: "INR",
    });
    expect(intent.currency).toBe("INR");
    expect(intent.budgetInMinor).toBe(100_000);
  });
});

describe("cleanFallbackSearchQuery", () => {
  test("removes shopping prose without removing the product requirements", () => {
    expect(
      cleanFallbackSearchQuery("wired earbuds with low latency under 2k on Flipkart, and also any rating will be fine"),
    ).toBe("wired earbuds with low latency");
  });
});

describe("parseShoppingRequest — quantity extraction", () => {
  test("extractQuantity handles common phrasings", () => {
    expect(extractQuantity("buy 3 t-shirts under $50")).toBe(3);
    expect(extractQuantity("pack of 2 socks")).toBe(2);
    expect(extractQuantity("x5 cables")).toBe(5);
    expect(extractQuantity("2 pack batteries")).toBe(2);
    expect(extractQuantity("a pair of shoes")).toBe(2);
    expect(extractQuantity("dozen eggs")).toBe(12);
    expect(extractQuantity("single mug")).toBe(1);
  });

  test("quantity is reflected on the intent", () => {
    const intent = parseShoppingRequest({ query: "pack of 3 gardenia under ₹2000" });
    expect(intent.requestedQuantity).toBe(3);
  });
});

describe("parseShoppingRequest — merchant preferences", () => {
  test("prefers an explicit 'from <merchant>'", () => {
    const { preferred, excluded } = extractMerchantPreferences("iphone from apple under $1000");
    expect(preferred).toContain("apple");
    expect(excluded).toHaveLength(0);
  });

  test("excludes an explicit 'not from <merchant>'", () => {
    const { preferred, excluded } = extractMerchantPreferences("headphones not from amazon under $100");
    expect(excluded).toContain("amazon");
    expect(preferred).toHaveLength(0);
  });

  test("'only nike' is a preference", () => {
    const { preferred } = extractMerchantPreferences("running shoes only nike under $200");
    expect(preferred).toContain("nike");
  });

  test("'avoid flipkart' is an exclusion", () => {
    const { excluded } = extractMerchantPreferences("tv avoid flipkart under ₹30000");
    expect(excluded).toContain("flipkart");
  });

  test("multi-word merchant 'raven scents' is captured whole", () => {
    const { preferred } = extractMerchantPreferences("perfume from raven scents under ₹2000");
    expect(preferred).toContain("raven scents");
  });
});

describe("parseShoppingRequest — constraints", () => {
  test("extracts known constraint tokens", () => {
    const constraints = extractConstraints("laptop with warranty refurbished under $500");
    expect(constraints).toContain("warranty");
    expect(constraints).toContain("refurbished");
  });

  test("'in stock' maps to in_stock token", () => {
    const constraints = extractConstraints("phone in stock under $300");
    expect(constraints).toContain("in_stock");
  });
});

describe("parseShoppingRequest — category", () => {
  test("guesses electronics vs apparel", () => {
    expect(extractCategory("buy an iphone under $800")).toBe("electronics");
    expect(extractCategory("running shoes under $100")).toBe("apparel");
    expect(extractCategory("random thing")).toBeNull();
  });
});

describe("parseShoppingRequest — validation", () => {
  test("rejects empty queries with a typed error", () => {
    expect(() => parseShoppingRequest({ query: "   " })).toThrow(ShoppingRequestValidationError);
  });

  test("preserves the raw query for audit", () => {
    const intent = parseShoppingRequest({ query: "  Dark Ocean under ₹1000  " });
    expect(intent.rawQuery).toBe("Dark Ocean under ₹1000");
  });
});
