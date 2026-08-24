import { describe, expect, test } from "bun:test";

import {
  detectCurrencyFromText,
  normalizeProduct,
  parsePriceToMinor,
} from "./product-normalizer";
import type { ProductCandidate } from "../commerce/types";
import { ProductNormalizationError } from "../errors";

function candidate(partial: Partial<ProductCandidate> & { title: string }): ProductCandidate {
  return {
    source: "amazon",
    merchant: "Amazon",
    rawPrice: "",
    currency: null,
    productUrl: "https://example.com/p/1",
    availabilityText: "In Stock",
    evidence: {},
    ...partial,
  };
}

describe("parsePriceToMinor", () => {
  test("parses western comma+decimal", () => {
    expect(parsePriceToMinor("$49.99", "USD")).toEqual({ amountInMinor: 4_999, currency: "USD" });
  });

  test("parses Indian grouping", () => {
    expect(parsePriceToMinor("₹7,995.00", "INR")).toEqual({ amountInMinor: 799_500, currency: "INR" });
    expect(parsePriceToMinor("₹1,29,900", "INR")).toEqual({ amountInMinor: 12_990_000, currency: "INR" });
  });

  test("parses bare integer as major units", () => {
    expect(parsePriceToMinor("7995", "INR")).toEqual({ amountInMinor: 799_500, currency: "INR" });
  });

  test("detects currency from symbol when none hinted", () => {
    expect(parsePriceToMinor("€120", null)).toEqual({ amountInMinor: 12_000, currency: "EUR" });
  });

  test("rejects empty / non-numeric input", () => {
    expect(parsePriceToMinor("", "USD")).toBeNull();
    expect(parsePriceToMinor("Price unavailable", "USD")).toBeNull();
  });
});

describe("detectCurrencyFromText", () => {
  test("maps known symbols and tokens", () => {
    expect(detectCurrencyFromText("₹100")).toBe("INR");
    expect(detectCurrencyFromText("rs 200")).toBe("INR");
    expect(detectCurrencyFromText("$10")).toBe("USD");
    expect(detectCurrencyFromText("¥500")).toBe("JPY");
    expect(detectCurrencyFromText("no symbol here")).toBeNull();
  });
});

describe("normalizeProduct", () => {
  test("uses structured major-unit value when present", () => {
    const p = normalizeProduct(
      candidate({ title: "Test Phone", rawPrice: "", evidence: { priceValue: 499.99 }, currency: "USD" }),
      { defaultCurrency: "USD" },
    );
    expect(p.amountInMinor).toBe(49_999);
    expect(p.currency).toBe("USD");
    expect(p.confidence).toBeGreaterThan(0.8);
  });

  test("parses displayed price text as a fallback", () => {
    const p = normalizeProduct(
      candidate({ title: "Mug", rawPrice: "₹349", currency: "INR" }),
      { defaultCurrency: "USD" },
    );
    expect(p.amountInMinor).toBe(34_900);
    expect(p.currency).toBe("INR");
  });

  test("rejects a missing/invalid amount", () => {
    expect(() =>
      normalizeProduct(
        candidate({ title: "Ghost", rawPrice: "Price unavailable", currency: "USD" }),
        { defaultCurrency: "USD" },
      ),
    ).toThrow(ProductNormalizationError);
  });

  test("rejects an unsupported/unresolvable currency", () => {
    expect(() =>
      normalizeProduct(
        candidate({ title: "Crypto", rawPrice: "10 XXC", currency: null }),
        { defaultCurrency: "ZZZ" },
      ),
    ).toThrow(ProductNormalizationError);
  });

  test("handles missing availability as unknown", () => {
    const p = normalizeProduct(
      candidate({ title: "NoStock", rawPrice: "$10", availabilityText: null }),
      { defaultCurrency: "USD" },
    );
    expect(p.availability).toBe("unknown");
  });

  test("maps 'out of stock' availability", () => {
    const p = normalizeProduct(
      candidate({ title: "Sold", rawPrice: "$10", availabilityText: "Out of stock" }),
      { defaultCurrency: "USD" },
    );
    expect(p.availability).toBe("out_of_stock");
  });

  test("penalizes missing product URL in confidence", () => {
    const withUrl = normalizeProduct(
      candidate({ title: "Has", rawPrice: "$10", productUrl: "https://x.com/p", evidence: { priceValue: 10 } }),
      { defaultCurrency: "USD" },
    );
    const withoutUrl = normalizeProduct(
      candidate({ title: "NoUrl", rawPrice: "$10", productUrl: null, evidence: { priceValue: 10 } }),
      { defaultCurrency: "USD" },
    );
    expect(withoutUrl.confidence).toBeLessThan(withUrl.confidence);
  });

  test("produces a stable id for the same identity", () => {
    const a = normalizeProduct(candidate({ title: "iPhone", rawPrice: "$100", productUrl: "https://x.com/1" }), { defaultCurrency: "USD" });
    const b = normalizeProduct(candidate({ title: "iPhone", rawPrice: "$100", productUrl: "https://x.com/1" }), { defaultCurrency: "USD" });
    expect(a.id).toBe(b.id);
  });
});
