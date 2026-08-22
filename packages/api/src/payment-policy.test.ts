import { describe, expect, test } from "bun:test";

import { evaluatePaymentPolicy } from "./payment-policy";

const base = {
  currency: "INR",
  walletBalanceInMinor: 1_000_000,
  walletCurrency: "INR",
  autoApprovalLimitInMinor: 150_000,
  mode: "test" as const,
};

describe("payment policy", () => {
  test("auto-approves a Test Mode payment at or below ₹1,500", () => {
    expect(evaluatePaymentPolicy({ ...base, amountInMinor: 150_000 }).decision).toBe("auto_approve");
  });

  test("requires user approval above the automatic limit", () => {
    expect(evaluatePaymentPolicy({ ...base, amountInMinor: 150_001 }).decision).toBe("user_approval");
  });

  test("never auto-approves Live Mode payments", () => {
    expect(evaluatePaymentPolicy({ ...base, mode: "live", amountInMinor: 1_000 }).decision).toBe("user_approval");
  });

  test("blocks payments over the wallet spending balance", () => {
    const result = evaluatePaymentPolicy({ ...base, amountInMinor: 1_000_001 });
    expect(result.decision).toBe("blocked");
    expect(result.reason).toContain("wallet spending balance");
  });

  test("blocks cross-currency payments instead of silently converting", () => {
    expect(evaluatePaymentPolicy({ ...base, currency: "USD", amountInMinor: 100 }).decision).toBe("blocked");
  });
});
