/**
 * Deterministic product ranking.
 *
 * Ranking is intentionally NOT an LLM decision. It is a fixed, documented
 * scoring model: every product earns a signed `impact` from a small set of
 * explicit signals, and the sum (clamped to >= 0) is the score. Identical
 * inputs always produce identical output and identical explanations.
 *
 * SCORING MODEL (weights are constants so the model is self-documenting):
 *   budgetFit          : within-budget products score 20–30; over-budget -40.
 *   constraintMatch    : +8 per constraint actually verifiable in the data.
 *   availability        : in_stock +10, limited +5, unknown +2, out_of_stock -20.
 *   merchantPreference  : preferred merchant +12; excluded -30 (usually filtered).
 *   dataConfidence      : (confidence - 0.6) * 20  → high confidence bonus, low penalty.
 *
 * Design notes:
 *  - "Price alone does not automatically win": budgetFit is capped at 30 of the
 *    total, so constraints/availability/merchant/policy can outweigh a cheaper
 *    but worse-fitting product.
 *  - "Missing or low-confidence data is penalized": dataConfidence subtracts
 *    for products we trust less.
 *  - Every factor carries a `reason` that cites the real product data, so
 *    explanations never invent properties.
 */

import type {
  NormalizedProduct,
  RankingFactor,
  RankingResult,
  ShoppingIntent,
} from "../commerce/types";

export const RANKING_WEIGHTS = {
  budgetFitWithinMin: 20,
  budgetFitBonusPerRatio: 10,
  budgetFitOver: -40,
  constraintMatchPerVerified: 8,
  availabilityInStock: 10,
  availabilityLimited: 5,
  availabilityUnknown: 2,
  availabilityOutOfStock: -20,
  merchantPreferred: 12,
  merchantExcluded: -30,
  confidenceSlope: 20,
  confidenceAnchor: 0.6,
} as const;

function merchantMatches(merchant: string, token: string): boolean {
  const m = merchant.toLowerCase();
  const t = token.toLowerCase();
  return m.includes(t) || t.includes(m);
}

/** Whether a single constraint token is verifiable in the product's data. */
function verifyConstraint(
  token: string,
  product: NormalizedProduct,
): { verified: boolean; reason: string } {
  const haystack = `${product.canonicalTitle} ${Object.values(product.attributes).join(" ")}`.toLowerCase();
  switch (token) {
    case "in_stock":
      return product.availability === "out_of_stock"
        ? { verified: false, reason: "Product is not in stock" }
        : { verified: true, reason: "Product is in stock" };
    case "refurbished":
      return haystack.includes("refurb")
        ? { verified: true, reason: "Listing mentions refurbished" }
        : { verified: false, reason: "Refurbished status could not be confirmed" };
    case "new":
      return haystack.includes("new")
        ? { verified: true, reason: "Listing mentions new" }
        : { verified: false, reason: "New condition could not be confirmed" };
    case "warranty":
      return haystack.includes("warranty")
        ? { verified: true, reason: "Listing mentions warranty" }
        : { verified: false, reason: "Warranty could not be confirmed" };
    default:
      // Unverifiable constraints (e.g. free_shipping) get no credit and are
      // surfaced honestly rather than assumed true.
      return { verified: false, reason: `Constraint "${token}" could not be verified from product data` };
  }
}

function budgetFitFactor(product: NormalizedProduct, intent: ShoppingIntent): RankingFactor {
  if (intent.budgetInMinor === null) {
    return { name: "budget_fit", impact: 0, reason: "No budget specified; budget fit not scored" };
  }
  const ratio = product.amountInMinor / intent.budgetInMinor;
  if (ratio > 1) {
    return {
      name: "budget_fit",
      impact: RANKING_WEIGHTS.budgetFitOver,
      reason: `Price ${product.amountInMinor} ${product.currency} is over the ${intent.budgetInMinor} budget`,
    };
  }
  const bonus = Math.round((1 - ratio) * RANKING_WEIGHTS.budgetFitBonusPerRatio);
  const impact = RANKING_WEIGHTS.budgetFitWithinMin + bonus;
  return {
    name: "budget_fit",
    impact,
    reason: `Price ${product.amountInMinor} ${product.currency} is within the ${intent.budgetInMinor} budget`,
  };
}

function constraintFactor(product: NormalizedProduct, intent: ShoppingIntent): RankingFactor {
  if (intent.constraints.length === 0) {
    return { name: "constraint_match", impact: 0, reason: "No constraints specified" };
  }
  let verified = 0;
  const detail: string[] = [];
  for (const token of intent.constraints) {
    const result = verifyConstraint(token, product);
    if (result.verified) {
      verified++;
      detail.push(result.reason);
    }
  }
  const impact = verified * RANKING_WEIGHTS.constraintMatchPerVerified;
  return {
    name: "constraint_match",
    impact,
    reason:
      verified > 0
        ? `Matches ${verified} of ${intent.constraints.length} constraints (${detail.join("; ")})`
        : `None of the ${intent.constraints.length} constraints could be verified`,
  };
}

function availabilityFactor(product: NormalizedProduct): RankingFactor {
  switch (product.availability) {
    case "in_stock":
      return { name: "availability", impact: RANKING_WEIGHTS.availabilityInStock, reason: "Product is in stock" };
    case "limited":
      return { name: "availability", impact: RANKING_WEIGHTS.availabilityLimited, reason: "Product has limited stock" };
    case "unknown":
      return { name: "availability", impact: RANKING_WEIGHTS.availabilityUnknown, reason: "Availability unknown" };
    case "out_of_stock":
      return { name: "availability", impact: RANKING_WEIGHTS.availabilityOutOfStock, reason: "Product is out of stock" };
  }
}

function merchantFactor(product: NormalizedProduct, intent: ShoppingIntent): RankingFactor {
  if (intent.preferredMerchants.some((token) => merchantMatches(product.merchant, token))) {
    return { name: "merchant_preference", impact: RANKING_WEIGHTS.merchantPreferred, reason: `Merchant "${product.merchant}" is one you prefer` };
  }
  if (intent.excludedMerchants.some((token) => merchantMatches(product.merchant, token))) {
    return { name: "merchant_preference", impact: RANKING_WEIGHTS.merchantExcluded, reason: `Merchant "${product.merchant}" is excluded` };
  }
  return { name: "merchant_preference", impact: 0, reason: "No merchant preference applies" };
}

function confidenceFactor(product: NormalizedProduct): RankingFactor {
  const impact = Math.round((product.confidence - RANKING_WEIGHTS.confidenceAnchor) * RANKING_WEIGHTS.confidenceSlope);
  return {
    name: "data_confidence",
    impact,
    reason:
      impact >= 0
        ? `High data confidence (${product.confidence})`
        : `Low data confidence (${product.confidence}); ${product.confidenceReasons.join(", ")}`,
  };
}

/** Score a single product. Pure and deterministic. */
export function rankProduct(
  product: NormalizedProduct,
  intent: ShoppingIntent,
): RankingResult {
  const factors: RankingFactor[] = [
    budgetFitFactor(product, intent),
    constraintFactor(product, intent),
    availabilityFactor(product),
    merchantFactor(product, intent),
    confidenceFactor(product),
  ];
  const raw = factors.reduce((sum, f) => sum + f.impact, 0);
  const score = Math.max(0, raw);
  return { productId: product.id, score, factors };
}

/**
 * Rank all products and return them sorted by score (desc), then by price
 * (asc), then by title — a stable, deterministic ordering.
 */
export function rankProducts(
  products: NormalizedProduct[],
  intent: ShoppingIntent,
): RankingResult[] {
  const ranked = products.map((p) => rankProduct(p, intent));
  const byScore = new Map(ranked.map((r) => [r.productId, r]));
  const sortedProducts = [...products].sort((a, b) => {
    const ra = byScore.get(a.id)!;
    const rb = byScore.get(b.id)!;
    if (rb.score !== ra.score) return rb.score - ra.score;
    if (a.amountInMinor !== b.amountInMinor) return a.amountInMinor - b.amountInMinor;
    return a.canonicalTitle.localeCompare(b.canonicalTitle);
  });
  return sortedProducts.map((p) => byScore.get(p.id)!);
}
