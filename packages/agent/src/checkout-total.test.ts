import { describe, expect, test } from "bun:test";

import { parseCheckoutTotal } from "./checkout-total";

describe("parseCheckoutTotal (currency-aware)", () => {
  test("reads an INR total with thousands separators", () => {
    expect(parseCheckoutTotal("order total: ₹1,298")).toEqual({
      amountInMinor: 129_800,
      currency: "INR",
    });
  });

  test("reads 'Rs.' / 'INR' spellings and 2-decimal paise", () => {
    expect(parseCheckoutTotal("Rs. 1,298.00")).toEqual({
      amountInMinor: 129_800,
      currency: "INR",
    });
    expect(parseCheckoutTotal("INR 500")).toEqual({
      amountInMinor: 50_000,
      currency: "INR",
    });
  });

  test("reads a USD total in cents", () => {
    expect(parseCheckoutTotal("Total $49.99")).toEqual({
      amountInMinor: 4_999,
      currency: "USD",
    });
  });

  test("reads a EUR total in cents", () => {
    expect(parseCheckoutTotal("Betrag: €29.90")).toEqual({
      amountInMinor: 2_990,
      currency: "EUR",
    });
  });

  test("reads a GBP total in pence", () => {
    expect(parseCheckoutTotal("£19.99")).toEqual({
      amountInMinor: 1_999,
      currency: "GBP",
    });
  });

  test("reads a JPY total with zero minor-unit decimals", () => {
    expect(parseCheckoutTotal("合計 ¥1,000")).toEqual({
      amountInMinor: 1_000,
      currency: "JPY",
    });
  });

  test("reads a CHF total in rappen", () => {
    expect(parseCheckoutTotal("CHF 12.50")).toEqual({
      amountInMinor: 1_250,
      currency: "CHF",
    });
  });

  test("returns null when no currency symbol is present", () => {
    expect(parseCheckoutTotal("Your order is ready")).toBeNull();
    expect(parseCheckoutTotal("")).toBeNull();
  });

  test("returns null for a non-positive amount", () => {
    expect(parseCheckoutTotal("₹0.00")).toBeNull();
  });

  test("honors the page currency instead of assuming INR", () => {
    // The old implementation always reported INR here; we must honor USD.
    expect(parseCheckoutTotal("Total $13.00 Tax $1.00")).toEqual({
      amountInMinor: 1_300,
      currency: "USD",
    });
  });
});
