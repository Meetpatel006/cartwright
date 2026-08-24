import { describe, expect, test } from "bun:test";

import { reconcilePayment } from "./payment-reconciliation";

describe("reconcilePayment", () => {
  test("matches when captured equals authorized in the same currency", () => {
    expect(
      reconcilePayment({
        authorizedAmountInMinor: 100_00,
        authorizedCurrency: "INR",
        capturedAmountInMinor: 100_00,
        capturedCurrency: "INR",
      }),
    ).toEqual({ status: "matched", discrepancyInMinor: 0 });
  });

  test("flags a currency mismatch", () => {
    const result = reconcilePayment({
      authorizedAmountInMinor: 100_00,
      authorizedCurrency: "INR",
      capturedAmountInMinor: 100_00,
      capturedCurrency: "USD",
    });
    expect(result.status).toBe("mismatch");
    expect(result.reason).toContain("currency");
  });

  test("flags an amount mismatch within the same currency", () => {
    const result = reconcilePayment({
      authorizedAmountInMinor: 100_00,
      authorizedCurrency: "INR",
      capturedAmountInMinor: 110_00,
      capturedCurrency: "INR",
    });
    expect(result.status).toBe("mismatch");
    expect(result.discrepancyInMinor).toBe(10_00);
    expect(result.reason).toContain("differs");
  });

  test("currency comparison is case-insensitive", () => {
    expect(
      reconcilePayment({
        authorizedAmountInMinor: 4999,
        authorizedCurrency: "usd",
        capturedAmountInMinor: 4999,
        capturedCurrency: "USD",
      }).status,
    ).toBe("matched");
  });

  test("works for non-INR currencies (USD cents)", () => {
    expect(
      reconcilePayment({
        authorizedAmountInMinor: 4999,
        authorizedCurrency: "USD",
        capturedAmountInMinor: 4999,
        capturedCurrency: "USD",
      }).status,
    ).toBe("matched");
  });
});
