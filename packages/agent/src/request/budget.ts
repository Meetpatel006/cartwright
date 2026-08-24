/**
 * Currency-aware budget parsing, extracted from `shopping-agent.ts` so the
 * Part B request parser (and its pure unit tests) can reuse it without loading
 * the Stagehand/Browserbase runtime. `shopping-agent.ts` re-exports this to keep
 * the `@cartwright/agent` public surface stable.
 */

export interface ParsedBudget {
  /** Numeric budget in the currency's MINOR units (e.g. 5000 for $50.00, 1000000 for ₹10,000). */
  amountInMinor: number;
  /** ISO 4217 currency code, e.g. "USD", "INR", "EUR". */
  currency: string;
}

export const CURRENCY_HINTS: Array<{ re: RegExp; code: string }> = [
  { re: /(?:₹|rs\.?|inr)/i, code: "INR" },
  { re: /(?:\$|usd)/i, code: "USD" },
  { re: /(?:€|eur)/i, code: "EUR" },
  { re: /(?:£|gbp)/i, code: "GBP" },
  { re: /(?:¥|jpy)/i, code: "JPY" },
  { re: /chf/i, code: "CHF" },
];

/** Minor-unit exponent per ISO currency (e.g. INR=2 → ₹1 = 100 paise). */
export const CURRENCY_DECIMALS: Record<string, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  CHF: 2,
};

function detectCurrency(query: string, defaultCurrency = "USD"): string {
  for (const { re, code } of CURRENCY_HINTS) if (re.test(query)) return code;
  // No explicit symbol — callers may provide the merchant's known currency.
  return defaultCurrency;
}

/**
 * Parse a budget from a natural-language query.
 * Handles: "$50", "under $100", "under 10k inr", "below ₹30000", "less than 500 usd".
 * Returns the value in MINOR units (major × 100) plus the detected ISO currency,
 * or null when no budget is found.
 */
export function parseBudget(query: string, defaultCurrency = "USD"): ParsedBudget | null {
  const match = query.match(
    /(?:under|below|less than|max|upto|up to)\s*(?:rs\.?|₹|inr|\$|usd|eur|€|gbp|£|¥|chf)?\s*([\d.,]+)\s*(k|lakh|l|cr|m|million)?\s*(?:rs\.?|₹|inr|\$|usd|eur|€|gbp|£|¥|chf)?/i,
  );
  if (!match || match[1] === undefined) return null;
  const value = Number.parseFloat(match[1].replace(/,/g, ""));
  if (Number.isNaN(value)) return null;
  const suffix = match[2]?.toLowerCase();
  const multiplier =
    suffix === "k" ? 1_000 : suffix === "lakh" || suffix === "l" ? 100_000 :
    suffix === "cr" ? 10_000_000 : suffix === "m" || suffix === "million" ? 1_000_000 : 1;
  return {
    amountInMinor: Math.round(value * multiplier * 100),
    currency: detectCurrency(query, defaultCurrency),
  };
}
