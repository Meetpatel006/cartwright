/**
 * Pure, currency-aware decision for the live-merchant price re-validation that
 * runs inside `approveTransaction`. Kept side-effect free (no DB, no agent) so
 * it can be unit-tested exhaustively.
 *
 * The decision:
 *  - An unreadable live price (`live === null`) never blocks the payment.
 *  - A HIGHER live price than approved → price changed (block).
 *  - A DIFFERENT currency than the approved transaction → price changed (block),
 *    because we cannot safely compare amounts across currencies.
 *  - Same currency and a lower/equal live price → not changed (proceed).
 */

export interface PriceRevalidationInput {
  approvedAmountInMinor: number;
  approvedCurrency: string;
  /** Live merchant total, or null when it could not be read. */
  live: { amountInMinor: number; currency: string } | null;
}

export interface PriceRevalidationResult {
  priceChanged: boolean;
  reason?: string;
}

export function evaluatePriceRevalidation(
  input: PriceRevalidationInput,
): PriceRevalidationResult {
  const { approvedAmountInMinor, approvedCurrency, live } = input;
  if (!live) return { priceChanged: false };

  const liveCurrency = live.currency.toUpperCase();
  const txnCurrency = approvedCurrency.toUpperCase();
  const currencyMismatch = liveCurrency !== txnCurrency;
  const higherPrice = !currencyMismatch && live.amountInMinor > approvedAmountInMinor;

  if (currencyMismatch || higherPrice) {
    const reason = currencyMismatch
      ? `Merchant currency changed from ${approvedCurrency} to ${live.currency}; the approved price cannot be re-validated safely.`
      : `Merchant price increased to ${live.amountInMinor} ${live.currency} (approved ${approvedAmountInMinor} ${approvedCurrency}).`;
    return { priceChanged: true, reason };
  }

  return { priceChanged: false };
}
