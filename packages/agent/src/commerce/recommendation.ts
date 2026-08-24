/**
 * Turn ranking results into user-facing recommendations with explanations.
 *
 * Critical invariant: explanations are generated FROM the actual ranking
 * factors, never from an LLM. Every explanation line cites real product data
 * (price, availability, matched constraints). The system never invents a
 * product property it did not observe.
 */

import type {
  NormalizedProduct,
  RankingFactor,
  RankingResult,
  Recommendation,
} from "./types";

/**
 * Build explanation lines for one product from its ranking factors. Only
 * factors that actually moved the score (impact != 0) are surfaced, so the
 * user sees the real reasons — not padding.
 */
export function explainRanking(result: RankingResult, _product: NormalizedProduct): string[] {
  const lines: string[] = [];
  for (const factor of result.factors as RankingFactor[]) {
    if (factor.impact === 0) continue;
    const sign = factor.impact > 0 ? "✓" : "✗";
    lines.push(`${sign} ${factor.reason}`);
  }
  if (lines.length === 0) {
    lines.push("No strong ranking signals — neutral score.");
  }
  return lines;
}

/**
 * Generate recommendations from a ranked list. `ranked` is expected to be
 * already sorted (highest score first). Each recommendation explains *why* it
 * ranked where it did, and non-top items explicitly note how they compare to
 * the top pick (so the UI can show why a product "lost").
 */
export function generateRecommendations(
  ranked: RankingResult[],
  products: NormalizedProduct[],
): Recommendation[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const top = ranked[0];

  return ranked.map((result, index) => {
    const product = byId.get(result.productId);
    if (!product) {
      throw new Error(`Ranking referenced unknown product id "${result.productId}"`);
    }
    const explanation = explainRanking(result, product);
    if (top && result.productId !== top.productId) {
      explanation.push(
        `Ranked below the top pick (score ${result.score} vs top ${top.score}).`,
      );
    }
    return {
      product,
      rankingScore: result.score,
      rankingFactors: result.factors,
      explanation,
      isTopRecommendation: index === 0,
    };
  });
}
