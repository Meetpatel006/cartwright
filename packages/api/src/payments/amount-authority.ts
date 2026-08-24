/**
 * Pure amount-authority decision used at SELECTION time (before
 * `createPurchaseTransaction`) — the missing half of Task 2.
 *
 * The discovered candidate price is PROVISIONAL (LLM/browser-extracted). When a
 * retained browser session exists, the API independently re-reads the real
 * checkout total server-side (`getSessionCheckoutTotal`) and this helper decides
 * which amount is authoritative:
 *
 *  - No live reading          → keep the provisional amount (policy still gates
 *                               it); an unreadable page must never hard-block a
 *                               legitimate purchase.
 *  - Currency changed         → BLOCK. Amounts are never compared across
 *                               currencies, and a switched currency means the
 *                               discovered price cannot be trusted.
 *  - Same currency            → the VERIFIED live total replaces the discovered
 *                               price (higher OR lower), so an understated
 *                               extraction can no longer slip under the budget,
 *                               and a price drop is honoured instead of
 *                               over-reserving the user's budget.
 */

export interface VerifiedTotal {
  amountInMinor: number;
  currency: string;
}

export interface ResolveAmountInput {
  expectedAmountInMinor: number;
  expectedCurrency: string;
  /** Independently re-read checkout total, or null when unavailable. */
  live: VerifiedTotal | null;
}

export interface ResolvedAuthoritativeAmount {
  amountInMinor: number;
  currency: string;
  /** "verified" when the live checkout total was used, else "provisional". */
  source: "verified" | "provisional";
  /** True when the authoritative amount differs from the discovered price. */
  changed: boolean;
  /** Set when selection must be blocked (currency changed / unsafe compare). */
  blockedReason?: string;
}

export function resolveAuthoritativeAmount(
  input: ResolveAmountInput,
): ResolvedAuthoritativeAmount {
  const expectedCurrency = input.expectedCurrency.toUpperCase();

  if (!input.live) {
    return {
      amountInMinor: input.expectedAmountInMinor,
      currency: expectedCurrency,
      source: "provisional",
      changed: false,
    };
  }

  const liveCurrency = input.live.currency.toUpperCase();
  if (liveCurrency !== expectedCurrency) {
    return {
      amountInMinor: input.expectedAmountInMinor,
      currency: expectedCurrency,
      source: "provisional",
      changed: false,
      blockedReason:
        `Merchant checkout currency changed from ${expectedCurrency} to ${liveCurrency}; ` +
        "the discovered price can no longer be safely authorised.",
    };
  }

  return {
    amountInMinor: input.live.amountInMinor,
    currency: liveCurrency,
    source: "verified",
    changed: input.live.amountInMinor !== input.expectedAmountInMinor,
  };
}
