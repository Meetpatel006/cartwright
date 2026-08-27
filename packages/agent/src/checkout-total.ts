/**
 * Currency-aware parsing of a merchant checkout total from page text.
 *
 * This is the logic that backs `getSessionCheckoutTotal` in `shopping-agent.ts`,
 * extracted into a pure, browser-free module so it can be unit-tested without a
 * live Stagehand session. It deliberately does NOT assume INR: it reads the
 * actual currency symbol/ISO code present on the page and reports the amount in
 * that currency's own MINOR units (paise for ₹, cents for $, etc.), so price
 * re-validation works for any merchant currency.
 */

import { CURRENCY_DECIMALS, CURRENCY_HINTS } from "./request/budget";

/** A currency symbol or ISO code as it may appear on a checkout page. */
const CHECKOUT_CURRENCY_TOKEN = /(₹|rs\.?|inr|\$|usd|eur|€|gbp|£|¥|jpy|chf)/i;

/** Map a currency token/symbol to an ISO 4217 code via the agent's hint list. */
export function normalizeCheckoutCurrency(token: string): string {
  const t = token.trim().toLowerCase();
  for (const { re, code } of CURRENCY_HINTS) {
    if (re.test(t)) return code;
  }
  return token.toUpperCase();
}

/**
 * Parse a checkout total from merchant page text. Returns the amount in the
 * currency's MINOR units plus the detected ISO 4217 currency, or null when the
 * total is unreadable. The first currency token on the page wins; the numeric
 * amount immediately following it is taken as the total.
 */
export function parseCheckoutTotal(
  text: string,
): { amountInMinor: number; currency: string } | null {
  const symMatch = text.match(CHECKOUT_CURRENCY_TOKEN);
  if (!symMatch || symMatch.index === undefined) return null;
  const currency = normalizeCheckoutCurrency(symMatch[1]!);

  // The amount immediately following the matched currency token.
  const after = text.slice(symMatch.index);
  const amountMatch = after.match(/([\d,]+(?:\.\d{1,2})?)/);
  if (!amountMatch) return null;

  const num = Number.parseFloat(amountMatch[1]!.replace(/,/g, ""));
  if (Number.isNaN(num) || num <= 0) return null;

  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  return { amountInMinor: Math.round(num * 10 ** decimals), currency };
}
