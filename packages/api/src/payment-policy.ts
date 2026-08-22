export type PaymentMode = "test" | "live";
export type PaymentDecision = "auto_approve" | "user_approval" | "blocked";

export interface PaymentPolicyInput {
  amountInMinor: number;
  currency: string;
  walletBalanceInMinor: number;
  walletCurrency: string;
  autoApprovalLimitInMinor: number;
  mode: PaymentMode;
}

export interface PaymentPolicyResult {
  decision: PaymentDecision;
  amountInMinor: number;
  currency: string;
  autoApprovalLimitInMinor: number;
  reason: string;
}

/**
 * Decide whether a merchant payment may be opened automatically.
 *
 * This is a policy check only. It never creates an order, moves money, or
 * bypasses the merchant's payment provider. Test Mode may auto-approve below
 * the configured limit; Live Mode always requires a user approval.
 */
export function evaluatePaymentPolicy(input: PaymentPolicyInput): PaymentPolicyResult {
  const currency = input.currency.toUpperCase();
  const walletCurrency = input.walletCurrency.toUpperCase();

  if (!Number.isInteger(input.amountInMinor) || input.amountInMinor <= 0) {
    return {
      decision: "blocked",
      amountInMinor: input.amountInMinor,
      currency,
      autoApprovalLimitInMinor: input.autoApprovalLimitInMinor,
      reason: "Payment amount must be a positive integer in minor currency units.",
    };
  }

  if (currency !== walletCurrency) {
    return {
      decision: "blocked",
      amountInMinor: input.amountInMinor,
      currency,
      autoApprovalLimitInMinor: input.autoApprovalLimitInMinor,
      reason: `Wallet currency ${walletCurrency} cannot authorize a ${currency} payment.`,
    };
  }

  if (input.amountInMinor > input.walletBalanceInMinor) {
    return {
      decision: "blocked",
      amountInMinor: input.amountInMinor,
      currency,
      autoApprovalLimitInMinor: input.autoApprovalLimitInMinor,
      reason: "Payment exceeds the configured wallet spending balance.",
    };
  }

  if (input.mode === "test" && input.amountInMinor <= input.autoApprovalLimitInMinor) {
    return {
      decision: "auto_approve",
      amountInMinor: input.amountInMinor,
      currency,
      autoApprovalLimitInMinor: input.autoApprovalLimitInMinor,
      reason: "Test Mode payment is within the automatic approval limit.",
    };
  }

  return {
    decision: "user_approval",
    amountInMinor: input.amountInMinor,
    currency,
    autoApprovalLimitInMinor: input.autoApprovalLimitInMinor,
    reason:
      input.mode === "live"
        ? "Live payments always require explicit user approval."
        : "Payment exceeds the automatic approval limit.",
  };
}
