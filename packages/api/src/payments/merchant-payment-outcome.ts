/**
 * Pure decision for what the DB may conclude from a merchant-UI payment drive
 * (`approveMerchantPayment`). This is the fix for the HIGH-severity Task 1 bug:
 * the agent's returned `status` alone must NEVER produce a PAYMENT_SUCCEEDED
 * audit/settlement. Success requires an independent, server-captured signal —
 * the merchant's own order-confirmation page captured through the retained
 * browser session (`orderConfirmation`).
 *
 * Outcomes:
 *  - "confirmed": the drive submitted AND the merchant's confirmation page was
 *    independently captured showing a successful/confirmed order → the caller
 *    may transition to PAYMENT_SUCCEEDED and settle the reservation.
 *  - "pending":   the drive submitted but no independent confirmation could be
 *    captured → the caller must keep PAYMENT_PROCESSING, hold the reservation,
 *    and record an honest verification-started audit (never fake success).
 *  - "failed":    the drive did not complete (not_found/expired/failed/opened,
 *    or an explicit failure on the confirmation page) → the caller must run
 *    `failTransaction` (PAYMENT_FAILED + release the reservation).
 */

/** Structural subset of the agent's drive result (keeps this module pure). */
export interface MerchantDriveResult {
  status: "opened" | "submitted" | "expired" | "not_found" | "failed";
  message: string;
  orderConfirmation?: {
    url: string;
    title: string;
    text: string;
    orderId: string | null;
    amount: string | null;
    statusText: string | null;
  } | null;
}

export type MerchantPaymentOutcome = "confirmed" | "pending" | "failed";

const POSITIVE_CONFIRMATION =
  /(order\s*confirmed|confirmed|successful|success|thank\s*you|thanks\s*for\s*(your|the)\s*order)/i;
const NEGATIVE_CONFIRMATION = /(failed|failure|declined|denied|error|cancelled|canceled)/i;

export interface MerchantPaymentDecision {
  outcome: MerchantPaymentOutcome;
  /** Human-readable, audit-safe reason describing the decision. */
  reason: string;
}

export function evaluateMerchantPaymentOutcome(
  result: MerchantDriveResult,
): MerchantPaymentDecision {
  // The drive never reached a submitted payment → nothing was paid.
  if (
    result.status === "not_found" ||
    result.status === "expired" ||
    result.status === "failed" ||
    result.status === "opened"
  ) {
    return {
      outcome: "failed",
      reason: `Merchant checkout did not complete (${result.status}): ${result.message}`,
    };
  }

  const confirmation = result.orderConfirmation;

  if (!confirmation) {
    // Submitted, but no independent confirmation could be captured. Per Task 1
    // (b): stay honestly pending — never mark success from the agent's word.
    return {
      outcome: "pending",
      reason: `Merchant UI payment submitted (${result.message}); awaiting independent confirmation.`,
    };
  }

  const haystack = [confirmation.statusText, confirmation.title, confirmation.text]
    .filter(Boolean)
    .join(" ");

  if (NEGATIVE_CONFIRMATION.test(haystack)) {
    return {
      outcome: "failed",
      reason: `Merchant confirmation page reports failure: ${confirmation.statusText ?? haystack}`.slice(
        0,
        300,
      ),
    };
  }

  const positivelyConfirmed =
    POSITIVE_CONFIRMATION.test(haystack) ||
    (confirmation.orderId !== null && POSITIVE_CONFIRMATION.test(confirmation.url));

  if (positivelyConfirmed) {
    return {
      outcome: "confirmed",
      reason: `Independently confirmed via merchant order page${confirmation.orderId ? ` (order ${confirmation.orderId})` : ""}.`,
    };
  }

  // A confirmation page was captured but says neither success nor failure —
  // not enough to settle money. Stay pending.
  return {
    outcome: "pending",
    reason: `Merchant UI payment submitted; confirmation page unclear ("${(confirmation.statusText ?? "").slice(0, 120)}"). Awaiting independent confirmation.`,
  };
}
