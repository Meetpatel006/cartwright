import { env } from "@cartwright/env/server";

import { countAuditEventsSince } from "@cartwright/db/repositories/audit.repository";
import {
  getEffectivePolicy,
  type EffectivePolicy,
} from "@cartwright/db/repositories/payment-policy.repository";

/** The decision the policy authority may return for a proposed payment. */
export type PaymentDecision = "auto_approve" | "user_approval" | "blocked";

export interface PolicyEvaluationInput {
  userId: string;
  amountInMinor: number;
  currency: string;
  merchantName?: string;
}

export interface PolicyEvaluationResult {
  decision: PaymentDecision;
  reason: string;
  maxTransactionAmount: number;
  maxTotalSpending: number;
  currency: string;
  autoApprovalLimitInMinor: number;
}

function normalizeMerchant(name: string | undefined): string | undefined {
  return name?.trim().toLowerCase() || undefined;
}

/**
 * Convert an integer minor-unit amount (paise, cents, …) to a human-readable
 * currency string, e.g. 649500 INR → "₹6,495.00".
 */
function formatMinor(amountInMinor: number, currency: string): string {
  const major = amountInMinor / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(major);
}

/**
 * Evaluate the user's payment policy for a proposed amount.
 *
 * The AI may propose merchant/amount/currency, but this function is the only
 * authority that decides whether the proposal is allowed. It never returns
 * `approved = true` on behalf of the user — `auto_approve` still requires an
 * explicit payment initiation, and `user_approval` requires the user action.
 *
 * Returns `decision: "blocked"` for any failing rule (with a reason) rather
 * than throwing, so the caller can transition the transaction to POLICY_BLOCKED
 * and persist an audit trail.
 */
export async function evaluateUserPaymentPolicy(
  input: PolicyEvaluationInput,
): Promise<PolicyEvaluationResult> {
  const policy: EffectivePolicy = await getEffectivePolicy(input.userId);

  if (input.currency.toUpperCase() !== policy.currency.toUpperCase()) {
    return blocked(
      policy,
      `Currency ${input.currency} is not allowed for this user (policy currency ${policy.currency}).`,
    );
  }

  if (!Number.isInteger(input.amountInMinor) || input.amountInMinor <= 0) {
    return blocked(policy, "Amount must be a positive integer in minor currency units.");
  }

  const merchant = normalizeMerchant(input.merchantName);
  if (merchant && policy.blockedMerchants.includes(merchant)) {
    return blocked(policy, `Merchant "${input.merchantName}" is blocked by policy.`);
  }
  if (input.amountInMinor > policy.maxTransactionAmount) {
    return blocked(
      policy,
      `Amount of ${formatMinor(input.amountInMinor, policy.currency)} exceeds the per-transaction limit of ${formatMinor(policy.maxTransactionAmount, policy.currency)}.`,
    );
  }

  if (policy.frequencyLimit && policy.frequencyLimit > 0) {
    const recent = await countAuditEventsSince(
      input.userId,
      "USER_APPROVED",
      new Date(Date.now() - 60 * 60 * 1000),
    );
    if (recent >= policy.frequencyLimit) {
      return blocked(policy, "Approval frequency limit reached; try again later.");
    }
  }

  let decision: PaymentDecision = "auto_approve";
  let reason: string;

  // Global env-based auto-approval limit (Test Mode) and Live Mode gating.
  if (env.RAZORPAY_MODE === "live") {
    decision = "user_approval";
    reason = "Live payments always require explicit user approval.";
  } else if (input.amountInMinor > env.PAYMENT_AUTO_APPROVAL_LIMIT_PAISE) {
    decision = "user_approval";
    reason = `Payment of ${formatMinor(input.amountInMinor, policy.currency)} exceeds the automatic approval limit of ${formatMinor(env.PAYMENT_AUTO_APPROVAL_LIMIT_PAISE, policy.currency)}.`;
  } else {
    reason = `Test Mode payment of ${formatMinor(input.amountInMinor, policy.currency)} is within the automatic approval limit of ${formatMinor(env.PAYMENT_AUTO_APPROVAL_LIMIT_PAISE, policy.currency)}.`;
  }

  if (policy.requireUserApproval && decision === "auto_approve") {
    decision = "user_approval";
    reason = "Policy requires explicit user approval for every purchase.";
  }

  return {
    decision,
    reason,
    maxTransactionAmount: policy.maxTransactionAmount,
    maxTotalSpending: policy.maxTotalSpending,
    currency: policy.currency,
    autoApprovalLimitInMinor: env.PAYMENT_AUTO_APPROVAL_LIMIT_PAISE,
  };
}

function blocked(policy: EffectivePolicy, reason: string): PolicyEvaluationResult {
  return {
    decision: "blocked",
    reason,
    maxTransactionAmount: policy.maxTransactionAmount,
    maxTotalSpending: policy.maxTotalSpending,
    currency: policy.currency,
    autoApprovalLimitInMinor: env.PAYMENT_AUTO_APPROVAL_LIMIT_PAISE,
  };
}
