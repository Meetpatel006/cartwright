/**
 * Pure payment reconciliation: compare the amount the server *authorized*
 * (the transaction's server-derived amount) against the amount the provider
 * actually *captured*, in a single currency-safe decision.
 *
 * Kept side-effect free (no DB, no provider) so it can be unit-tested and so
 * both the verify-callback and webhook settlement paths reconcile identically.
 *
 * Note: the transaction gate already *fails* a payment whose captured
 * amount/currency differs from the authorized one, so in the happy path this
 * returns `matched`. It still encodes the comparison explicitly so the
 * settlement audit trail records what was charged vs. what was approved.
 */

export type ReconciliationStatus = "matched" | "mismatch";

export interface ReconciliationInput {
  /** Amount the server authorized/expected, in minor units. */
  authorizedAmountInMinor: number;
  authorizedCurrency: string;
  /** Amount the provider actually captured/charged, in minor units. */
  capturedAmountInMinor: number;
  capturedCurrency: string;
}

export interface ReconciliationResult {
  status: ReconciliationStatus;
  /** Absolute amount difference in minor units (0 when matched). */
  discrepancyInMinor: number;
  reason?: string;
}

export function reconcilePayment(input: ReconciliationInput): ReconciliationResult {
  const authorizedCurrency = input.authorizedCurrency.toUpperCase();
  const capturedCurrency = input.capturedCurrency.toUpperCase();

  if (authorizedCurrency !== capturedCurrency) {
    return {
      status: "mismatch",
      discrepancyInMinor: input.authorizedAmountInMinor,
      reason: `Captured currency ${input.capturedCurrency} does not match authorized ${input.authorizedCurrency}.`,
    };
  }

  const discrepancyInMinor = Math.abs(
    input.authorizedAmountInMinor - input.capturedAmountInMinor,
  );
  if (discrepancyInMinor !== 0) {
    return {
      status: "mismatch",
      discrepancyInMinor,
      reason: `Captured ${input.capturedAmountInMinor} ${input.capturedCurrency} differs from authorized ${input.authorizedAmountInMinor} ${input.authorizedCurrency}.`,
    };
  }

  return { status: "matched", discrepancyInMinor: 0 };
}
