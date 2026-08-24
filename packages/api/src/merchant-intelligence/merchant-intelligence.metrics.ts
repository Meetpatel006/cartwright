/**
 * Deterministic metric calculations for Part C. Pure functions only — no DB
 * access, no I/O, no randomness. Every rate is a plain division with an
 * explicit divide-by-zero guard (returns `null`, meaning "undefined", never
 * `0` or `NaN`, which would misleadingly imply "measured and zero").
 */

import type {
  FunnelCounts,
  FunnelMetrics,
  ProductPerformance,
  ProductPerformanceCounts,
  RecommendationPositionPerformance,
  TimeWindow,
} from "./merchant-intelligence.types";
import type {
  RawFunnelCounts,
  RawProductPerformanceRow,
  RawRecommendationPositionRow,
} from "@cartwright/db/repositories/merchant-intelligence.repository";

/** `numerator / denominator`, or `null` when the denominator is 0. */
export function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function buildFunnelCounts(
  raw: RawFunnelCounts,
  discovered: number,
  recommended: number,
): FunnelCounts {
  return {
    sessionsTotal: raw.sessionsTotal,
    discovered,
    recommended,
    selected: raw.selected,
    purchaseRequested: raw.purchaseRequested,
    approved: raw.approved,
    paymentSucceeded: raw.paymentSucceeded,
    policyBlocked: raw.policyBlocked,
    cancelled: raw.cancelled,
  };
}

export function computeFunnelMetrics(
  counts: FunnelCounts,
  timeWindow: TimeWindow,
): FunnelMetrics {
  return {
    counts,
    timeWindow,
    discoveryToRecommendationRate: safeRate(counts.recommended, counts.discovered),
    recommendationToSelectionRate: safeRate(counts.selected, counts.recommended),
    selectionToPurchaseRate: safeRate(counts.purchaseRequested, counts.selected),
    purchaseToApprovalRate: safeRate(counts.approved, counts.purchaseRequested),
    approvalToPaymentRate: safeRate(counts.paymentSucceeded, counts.approved),
    overallConversionRate: safeRate(counts.paymentSucceeded, counts.purchaseRequested),
  };
}

export function computeProductPerformance(
  raw: RawProductPerformanceRow[],
): ProductPerformance[] {
  return raw.map((row: ProductPerformanceCounts) => ({
    ...row,
    selectionRate: safeRate(row.timesSelected, row.timesRecommended),
    conversionRate: safeRate(row.timesConverted, row.timesSelected),
  }));
}

export function computeRecommendationPositionPerformance(
  raw: RawRecommendationPositionRow[],
): RecommendationPositionPerformance[] {
  return raw.map((row) => ({
    isTop: row.isTop,
    recommendedCount: row.recommendedCount,
    selectedCount: row.selectedCount,
    selectionRate: safeRate(row.selectedCount, row.recommendedCount),
  }));
}
