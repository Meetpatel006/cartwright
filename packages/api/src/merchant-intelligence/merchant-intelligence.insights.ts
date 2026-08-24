/**
 * Deterministic, rule-based insight generation for Part C.
 *
 * Every insight is generated from a fixed, documented threshold applied to a
 * real computed metric — there is no free-text generator and no
 * `Math.random()`. Insights only ever describe an OBSERVED ASSOCIATION
 * ("was associated with"), never a causal claim ("causes").
 */

import { randomUUID } from "node:crypto";

import {
  deriveConfidence,
  describeRateCalculation,
  hasSufficientSample,
} from "./merchant-intelligence.explainability";
import type {
  MerchantInsight,
  ProductPerformance,
  RecommendationPositionPerformance,
  TimeWindow,
} from "./merchant-intelligence.types";

/** A product recommended at least this often, with a selection rate at or below
 * `LOW_SELECTION_RATE`, is flagged as an underperforming recommendation. */
export const LOW_SELECTION_RATE = 0.1;

/** A product selected at least once, with a conversion rate at or below this,
 * is flagged as a selection→purchase drop-off. */
export const LOW_CONVERSION_RATE = 0.34;

/** Minimum absolute percentage-point gap between top and non-top selection
 * rates before a rank-position insight is generated. */
export const MIN_RANK_GAP_PP = 5;

function underperformingRecommendationInsights(
  products: ProductPerformance[],
  timeWindow: TimeWindow,
): MerchantInsight[] {
  const insights: MerchantInsight[] = [];
  for (const p of products) {
    if (!hasSufficientSample(p.timesRecommended)) continue;
    if (p.selectionRate === null || p.selectionRate > LOW_SELECTION_RATE) continue;

    insights.push({
      id: randomUUID(),
      type: "underperforming_recommendation",
      severity: "opportunity",
      title: `"${p.title}" is recommended often but rarely selected`,
      summary:
        `${p.title} was recommended ${p.timesRecommended} time(s) but selected ` +
        `${p.timesSelected} time(s) in this window (observed selection rate ` +
        `${(p.selectionRate * 100).toFixed(1)}%).`,
      evidence: {
        metric: "recommendation_to_selection_rate",
        currentValue: p.selectionRate,
        comparisonValue: LOW_SELECTION_RATE,
        sampleSize: p.timesRecommended,
        timeWindow,
      },
      calculation: describeRateCalculation(
        "timesSelected",
        "timesRecommended",
        p.timesSelected,
        p.timesRecommended,
      ),
      confidence: deriveConfidence(p.timesRecommended),
    });
  }
  return insights;
}

function selectionPurchaseDropoffInsights(
  products: ProductPerformance[],
  timeWindow: TimeWindow,
): MerchantInsight[] {
  const insights: MerchantInsight[] = [];
  for (const p of products) {
    if (!hasSufficientSample(p.timesSelected)) continue;
    if (p.conversionRate === null || p.conversionRate > LOW_CONVERSION_RATE) continue;

    insights.push({
      id: randomUUID(),
      type: "selection_purchase_dropoff",
      severity: "warning",
      title: `"${p.title}" has a high selection-to-purchase drop-off`,
      summary:
        `${p.title} was selected ${p.timesSelected} time(s) but only converted to a ` +
        `successful payment ${p.timesConverted} time(s) in this window (observed ` +
        `conversion rate ${(p.conversionRate * 100).toFixed(1)}%).`,
      evidence: {
        metric: "selection_to_conversion_rate",
        currentValue: p.conversionRate,
        comparisonValue: LOW_CONVERSION_RATE,
        sampleSize: p.timesSelected,
        timeWindow,
      },
      calculation: describeRateCalculation(
        "timesConverted",
        "timesSelected",
        p.timesConverted,
        p.timesSelected,
      ),
      confidence: deriveConfidence(p.timesSelected),
    });
  }
  return insights;
}

function rankPositionInsights(
  positions: RecommendationPositionPerformance[],
  timeWindow: TimeWindow,
): MerchantInsight[] {
  const top = positions.find((p) => p.isTop);
  const rest = positions.find((p) => !p.isTop);
  if (!top || !rest) return [];
  if (top.selectionRate === null || rest.selectionRate === null) return [];

  const sampleSize = top.recommendedCount + rest.recommendedCount;
  if (!hasSufficientSample(sampleSize)) return [];

  const gapPp = (rest.selectionRate - top.selectionRate) * 100;
  if (gapPp < MIN_RANK_GAP_PP) return [];

  return [
    {
      id: randomUUID(),
      type: "rank_position_selection_gap",
      severity: "info",
      title: "Lower-ranked recommendations were selected more often than #1",
      summary:
        `The #1-ranked recommendation had an observed selection rate of ` +
        `${(top.selectionRate * 100).toFixed(1)}%, versus ` +
        `${(rest.selectionRate * 100).toFixed(1)}% for the rest of the list, in this ` +
        `window. This is reported strictly as an observed association between rank ` +
        `position and selection, with no claim of a causal relationship.`,
      evidence: {
        metric: "rank_position_selection_rate",
        currentValue: rest.selectionRate,
        comparisonValue: top.selectionRate,
        sampleSize,
        timeWindow,
      },
      calculation:
        `top: ${describeRateCalculation("selected", "recommended", top.selectedCount, top.recommendedCount)}; ` +
        `rest: ${describeRateCalculation("selected", "recommended", rest.selectedCount, rest.recommendedCount)}`,
      confidence: deriveConfidence(sampleSize),
    },
  ];
}

export function generateInsights(input: {
  products: ProductPerformance[];
  recommendationPositions: RecommendationPositionPerformance[];
  timeWindow: TimeWindow;
}): MerchantInsight[] {
  return [
    ...underperformingRecommendationInsights(input.products, input.timeWindow),
    ...selectionPurchaseDropoffInsights(input.products, input.timeWindow),
    ...rankPositionInsights(input.recommendationPositions, input.timeWindow),
  ];
}
