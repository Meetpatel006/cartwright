/**
 * Confidence derivation for Part C insights.
 *
 * Confidence is derived deterministically from sample size ONLY — never from
 * an LLM, never fabricated. The thresholds are explicit and documented so a
 * reviewer can reproduce the classification by hand.
 */

import type { InsightConfidence } from "./merchant-intelligence.types";

/** Below this sample size, no insight should be generated at all (too noisy to be meaningful). */
export const MIN_SAMPLE_SIZE = 5;

/** Sample-size thresholds for confidence buckets (inclusive lower bounds). */
export const CONFIDENCE_THRESHOLDS = {
  low: MIN_SAMPLE_SIZE, // [5, 15)
  medium: 15, // [15, 40)
  high: 40, // [40, ∞)
} as const;

export function deriveConfidence(sampleSize: number): InsightConfidence {
  if (sampleSize >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (sampleSize >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}

/** Whether a sample is large enough to generate an insight from at all. */
export function hasSufficientSample(sampleSize: number): boolean {
  return sampleSize >= MIN_SAMPLE_SIZE;
}

/** Builds a human-reproducible calculation description for evidence. */
export function describeRateCalculation(
  numeratorLabel: string,
  denominatorLabel: string,
  numerator: number,
  denominator: number,
): string {
  const pct = denominator > 0 ? ((numerator / denominator) * 100).toFixed(1) : "undefined";
  return `${numeratorLabel} (${numerator}) / ${denominatorLabel} (${denominator}) = ${pct}%`;
}
