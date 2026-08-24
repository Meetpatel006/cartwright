/**
 * Build a structured `PurchasePlan` from a selected normalized product.
 *
 * A purchase plan is the final output of Part B. It is deliberately NOT a
 * payment instruction: it records what the user picked and the evidence behind
 * the amount/merchant. Only Part A's `createPurchaseTransaction` (the server-
 * authoritative gate) turns a selection into a real, policy-gated transaction.
 * This module never imports Part A and never creates a Razorpay order.
 */

import type {
  NormalizedProduct,
  PurchasePlan,
  RankingResult,
  ShoppingIntent,
} from "./types";

/** Reasons that actually moved the score (impact != 0), for transparency. */
function rankingReasons(ranking: RankingResult): string[] {
  return ranking.factors
    .filter((f) => f.impact !== 0)
    .map((f) => f.reason);
}

function constraintsApplied(intent: ShoppingIntent): string[] {
  const applied: string[] = [];
  applied.push(`Currency: ${intent.currency}`);
  if (intent.budgetInMinor !== null) applied.push(`Budget cap: ${intent.budgetInMinor} ${intent.currency}`);
  if (intent.excludedMerchants.length) applied.push(`Excluded merchants: ${intent.excludedMerchants.join(", ")}`);
  if (intent.preferredMerchants.length) applied.push(`Preferred merchants: ${intent.preferredMerchants.join(", ")}`);
  for (const c of intent.constraints) applied.push(`Constraint: ${c}`);
  return applied;
}

/**
 * Create a purchase plan for the selected product. The amount comes strictly
 * from the normalized product's evidence (never from the client or the AI as
 * final truth — Part A re-derives it server-side when the transaction is made).
 */
export function createPurchasePlan(
  product: NormalizedProduct,
  ranking: RankingResult,
  intent: ShoppingIntent,
): PurchasePlan {
  return {
    productId: product.id,
    merchant: product.merchant,
    productUrl: product.productUrl,
    expectedAmountInMinor: product.amountInMinor,
    currency: product.currency,
    rankingScore: ranking.score,
    recommendationReasons: rankingReasons(ranking),
    evidence: {
      derivedFrom: "normalized_product",
      canonicalTitle: product.canonicalTitle,
      amountInMinor: product.amountInMinor,
      currency: product.currency,
      merchant: product.merchant,
      productUrl: product.productUrl,
      availability: product.availability,
      confidence: product.confidence,
    },
    constraintsApplied: constraintsApplied(intent),
    selectedAt: new Date().toISOString(),
  };
}
