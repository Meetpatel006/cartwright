/**
 * Part C — Merchant Growth & Commerce Intelligence.
 *
 * Domain types for the intelligence layer. Part C is READ-ONLY with respect
 * to money and to Part A/B state: it only ever issues `SELECT` queries against
 * `shopping_sessions`, `product_candidates`, `recommendations`, and
 * `transactions`. It never creates a transaction, never mutates payment
 * status, and never bypasses the authoritative amount resolution in
 * `payments/amount-authority.ts` or the policy gate in
 * `payments/payment-policy.service.ts`.
 *
 * All metrics are scoped to a single user (`ctx.session.user.id`) — the owner
 * of the shopping sessions being analyzed. There is no separate
 * merchant-owner identity in this schema (`transactions.merchantName` /
 * `product_candidates.merchant` are free-text store names, not authenticated
 * tenants), so "merchant intelligence" here means: intelligence about the
 * shopping/commerce funnel the AUTHENTICATED USER generated across the
 * merchants they shopped at. Ownership is therefore enforced the same way
 * Part A/B already do it — every query is scoped by `userId`, which is never
 * accepted as untrusted client input.
 */

/** Inclusive-start / exclusive-end UTC bounds for every analytics query. */
export interface TimeWindow {
  start: Date;
  end: Date;
}

/** Client-facing time window input: a bounded preset or an explicit range. */
export type TimeWindowInput =
  | { preset: "24h" | "7d" | "30d" }
  | { start: string; end: string };

/**
 * The commerce funnel, mapped 1:1 to real persisted state.
 *
 * Stage         | Source                              | Counting rule
 * ------------- | ----------------------------------- | -------------------------------------------------------
 * discovered    | product_candidates (rejected=false) | row count, scoped to sessions owned by user in window
 * recommended   | recommendations                     | row count, scoped to sessions owned by user in window
 * selected      | shopping_sessions.status            | sessions with status IN (selected, converted) — exactly
 *               |                                      | one selection per session by construction (Part B)
 * purchaseRequested | shopping_sessions.status        | sessions with status = converted (transactionId set)
 * approved      | transactions.status (via session)   | status IN (APPROVED, PAYMENT_PROCESSING,
 *               |                                      | PAYMENT_SUCCEEDED, PAYMENT_FAILED) — the state machine
 *               |                                      | is forward-only, so reaching any of these implies the
 *               |                                      | transaction was approved at some point
 * paymentSucceeded | transactions.status              | status = PAYMENT_SUCCEEDED
 * policyBlocked | transactions.status                 | status = POLICY_BLOCKED
 * cancelled     | transactions.status                 | status = CANCELLED
 *
 * `selected` can exceed `purchaseRequested` only when a session was left
 * stranded mid-selection (e.g. the process crashed between marking the
 * session `selected` and `createPurchaseTransaction` returning) — a real,
 * not-invented, drop-off signal.
 */
export interface FunnelCounts {
  sessionsTotal: number;
  discovered: number;
  recommended: number;
  selected: number;
  purchaseRequested: number;
  approved: number;
  paymentSucceeded: number;
  policyBlocked: number;
  cancelled: number;
}

/** Deterministic conversion/drop-off rates derived from `FunnelCounts`. */
export interface FunnelMetrics {
  counts: FunnelCounts;
  timeWindow: TimeWindow;
  /** recommended / discovered, or null when discovered = 0 (undefined rate). */
  discoveryToRecommendationRate: number | null;
  /** selected / recommended. */
  recommendationToSelectionRate: number | null;
  /** purchaseRequested / selected. */
  selectionToPurchaseRate: number | null;
  /** approved / purchaseRequested. */
  purchaseToApprovalRate: number | null;
  /** paymentSucceeded / approved. */
  approvalToPaymentRate: number | null;
  /** paymentSucceeded / purchaseRequested — overall checkout conversion. */
  overallConversionRate: number | null;
}

/** Raw per-product aggregate counts, exactly as read from the database. */
export interface ProductPerformanceCounts {
  productId: string;
  title: string;
  merchant: string | null;
  amountInMinor: number;
  currency: string;
  timesDiscovered: number;
  timesRecommended: number;
  timesSelected: number;
  timesConverted: number;
}

/** Per-product performance with derived, deterministic rates. */
export interface ProductPerformance extends ProductPerformanceCounts {
  /** timesSelected / timesRecommended, null when never recommended. */
  selectionRate: number | null;
  /** timesConverted / timesSelected, null when never selected. */
  conversionRate: number | null;
}

/** Aggregate recommendation performance bucketed by top-of-list vs the rest. */
export interface RecommendationPositionPerformance {
  isTop: boolean;
  recommendedCount: number;
  selectedCount: number;
  selectionRate: number | null;
}

export type InsightType =
  | "underperforming_recommendation"
  | "selection_purchase_dropoff"
  | "rank_position_selection_gap";

export type InsightSeverity = "info" | "opportunity" | "warning";
export type InsightConfidence = "low" | "medium" | "high";

/**
 * Structured, explainable insight. Every field traces back to a real
 * computed metric — no free-text "AI advice" is ever injected. `calculation`
 * is a human-readable description of exactly how `evidence` was derived, so a
 * reviewer can reproduce the number by hand.
 */
export interface MerchantInsight {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  summary: string;
  evidence: {
    metric: string;
    currentValue: number;
    comparisonValue?: number;
    sampleSize: number;
    timeWindow: TimeWindow;
  };
  calculation: string;
  confidence: InsightConfidence;
}

export interface MerchantIntelligenceOverview {
  timeWindow: TimeWindow;
  funnel: FunnelMetrics;
  topProducts: ProductPerformance[];
  insights: MerchantInsight[];
}
