import { describe, expect, test } from "bun:test";

import { resolveAuthoritativeAmount } from "./amount-authority";

describe("resolveAuthoritativeAmount (Task 2: selection-time authority)", () => {
  test("no live reading keeps the provisional discovered amount", () => {
    const resolved = resolveAuthoritativeAmount({
      expectedAmountInMinor: 100_000,
      expectedCurrency: "INR",
      live: null,
    });
    expect(resolved).toEqual({
      amountInMinor: 100_000,
      currency: "INR",
      source: "provisional",
      changed: false,
    });
  });

  test("an understated discovery price is replaced by the higher verified total", () => {
    // Agent reported ₹800, real checkout shows ₹1,000 → charge ₹1,000.
    const resolved = resolveAuthoritativeAmount({
      expectedAmountInMinor: 80_000,
      expectedCurrency: "INR",
      live: { amountInMinor: 100_000, currency: "INR" },
    });
    expect(resolved.source).toBe("verified");
    expect(resolved.amountInMinor).toBe(100_000);
    expect(resolved.changed).toBe(true);
    expect(resolved.blockedReason).toBeUndefined();
  });

  test("an inflated discovery price is corrected DOWN to the verified total", () => {
    // Agent reported ₹1,200, real checkout shows ₹1,000 → do not over-reserve.
    const resolved = resolveAuthoritativeAmount({
      expectedAmountInMinor: 120_000,
      expectedCurrency: "INR",
      live: { amountInMinor: 100_000, currency: "INR" },
    });
    expect(resolved.source).toBe("verified");
    expect(resolved.amountInMinor).toBe(100_000);
    expect(resolved.changed).toBe(true);
  });

  test("equal amounts are verified but unchanged", () => {
    const resolved = resolveAuthoritativeAmount({
      expectedAmountInMinor: 100_000,
      expectedCurrency: "INR",
      live: { amountInMinor: 100_000, currency: "INR" },
    });
    expect(resolved.source).toBe("verified");
    expect(resolved.changed).toBe(false);
  });

  test("a currency switch blocks selection instead of comparing across currencies", () => {
    const resolved = resolveAuthoritativeAmount({
      expectedAmountInMinor: 100_00,
      expectedCurrency: "INR",
      live: { amountInMinor: 10_00, currency: "USD" },
    });
    expect(resolved.blockedReason).toBeDefined();
    expect(resolved.blockedReason).toContain("USD");
    expect(resolved.source).toBe("provisional");
  });

  test("currency comparison is case-insensitive", () => {
    const resolved = resolveAuthoritativeAmount({
      expectedAmountInMinor: 4999,
      expectedCurrency: "usd",
      live: { amountInMinor: 5999, currency: "USD" },
    });
    expect(resolved.source).toBe("verified");
    expect(resolved.amountInMinor).toBe(5999);
  });

  test("works for non-INR currencies end to end", () => {
    const resolved = resolveAuthoritativeAmount({
      expectedAmountInMinor: 1234_00,
      expectedCurrency: "EUR",
      live: { amountInMinor: 1299_00, currency: "eur" },
    });
    expect(resolved.currency).toBe("EUR");
    expect(resolved.amountInMinor).toBe(1299_00);
    expect(resolved.changed).toBe(true);
  });
});
