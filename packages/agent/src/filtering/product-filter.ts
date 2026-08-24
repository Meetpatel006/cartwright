/**
 * Deterministic pre-ranking filter.
 *
 * Part B may exclude products using the user's stated constraints. This is a
 * *soft* safety net only: it never authorizes a payment. Every exclusion is
 * recorded with a reason so the UI and audit trail can show exactly why a
 * product dropped out. The authoritative financial gate remains Part A.
 *
 * Filtering rules (all deterministic):
 *  - currency mismatch  → drop (prevents comparing ₹ to $ against a budget)
 *  - over budget         → drop
 *  - excluded merchant   → drop (user/intent block-list)
 *  - out of stock        → drop (cannot be purchased)
 */

import type { NormalizedProduct, ShoppingIntent } from "../commerce/types";

export interface FilterResult {
  kept: NormalizedProduct[];
  filteredOut: Array<{ productId: string; reason: string }>;
}

function merchantMatches(merchant: string, token: string): boolean {
  const m = merchant.toLowerCase();
  const t = token.toLowerCase();
  return m.includes(t) || t.includes(m);
}

export function filterCandidates(
  products: NormalizedProduct[],
  intent: ShoppingIntent,
): FilterResult {
  const kept: NormalizedProduct[] = [];
  const filteredOut: Array<{ productId: string; reason: string }> = [];

  for (const product of products) {
    if (product.currency !== intent.currency) {
      filteredOut.push({
        productId: product.id,
        reason: `Currency ${product.currency} does not match requested ${intent.currency}`,
      });
      continue;
    }

    if (intent.budgetInMinor !== null && product.amountInMinor > intent.budgetInMinor) {
      filteredOut.push({
        productId: product.id,
        reason: `Price ${product.amountInMinor} ${product.currency} exceeds budget ${intent.budgetInMinor}`,
      });
      continue;
    }

    const blocked = intent.excludedMerchants.some((token) => merchantMatches(product.merchant, token));
    if (blocked) {
      filteredOut.push({
        productId: product.id,
        reason: `Merchant "${product.merchant}" is excluded by your request`,
      });
      continue;
    }

    if (product.availability === "out_of_stock") {
      filteredOut.push({
        productId: product.id,
        reason: `Product is out of stock`,
      });
      continue;
    }

    kept.push(product);
  }

  return { kept, filteredOut };
}
