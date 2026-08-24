import { describe, expect, test } from "bun:test";

import { evaluatePriceRevalidation } from "./price-revalidation";

describe("evaluatePriceRevalidation (currency-aware)", () => {
  test("an unreadable live price never blocks the payment", () => {
    expect(
      evaluatePriceRevalidation({
        approvedAmountInMinor: 100_00,
        approvedCurrency: "INR",
        live: null,
      }),
    ).toEqual({ priceChanged: false });
  });

  test("a higher same-currency price is flagged as changed", () => {
    const result = evaluatePriceRevalidation({
      approvedAmountInMinor: 100_00,
      approvedCurrency: "INR",
      live: { amountInMinor: 110_00, currency: "INR" },
    });
    expect(result.priceChanged).toBe(true);
    expect(result.reason).toContain("increased");
  });

  test("a lower same-currency price is allowed", () => {
    expect(
      evaluatePriceRevalidation({
        approvedAmountInMinor: 100_00,
        approvedCurrency: "INR",
        live: { amountInMinor: 90_00, currency: "INR" },
      }),
    ).toEqual({ priceChanged: false });
  });

  test("an equal same-currency price is allowed", () => {
    expect(
      evaluatePriceRevalidation({
        approvedAmountInMinor: 100_00,
        approvedCurrency: "INR",
        live: { amountInMinor: 100_00, currency: "INR" },
      }),
    ).toEqual({ priceChanged: false });
  });

  test("a currency mismatch is flagged even when the amount is lower", () => {
    const result = evaluatePriceRevalidation({
      approvedAmountInMinor: 100_00,
      approvedCurrency: "INR",
      live: { amountInMinor: 10_00, currency: "USD" },
    });
    expect(result.priceChanged).toBe(true);
    expect(result.reason).toContain("currency changed");
  });

  test("currency comparison is case-insensitive", () => {
    const result = evaluatePriceRevalidation({
      approvedAmountInMinor: 100_00,
      approvedCurrency: "usd",
      live: { amountInMinor: 110_00, currency: "USD" },
    });
    expect(result.priceChanged).toBe(true);
    expect(result.reason).toContain("increased");
  });

  test("a higher price in the SAME non-INR currency is flagged", () => {
    const result = evaluatePriceRevalidation({
      approvedAmountInMinor: 4999,
      approvedCurrency: "USD",
      live: { amountInMinor: 5999, currency: "USD" },
    });
    expect(result.priceChanged).toBe(true);
    expect(result.reason).toContain("USD");
  });
});
