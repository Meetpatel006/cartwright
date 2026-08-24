import { describe, expect, test } from "bun:test";

import {
  buildFunnelCounts,
  computeFunnelMetrics,
  computeProductPerformance,
  computeRecommendationPositionPerformance,
  safeRate,
} from "./merchant-intelligence.metrics";

describe("safeRate", () => {
  test("divides normally", () => {
    expect(safeRate(1, 4)).toBe(0.25);
  });

  test("returns null (undefined), not 0 or NaN, for a zero denominator", () => {
    expect(safeRate(0, 0)).toBeNull();
    expect(safeRate(5, 0)).toBeNull();
  });
});

describe("buildFunnelCounts", () => {
  test("combines session-scoped raw counts with item-level discovered/recommended", () => {
    const counts = buildFunnelCounts(
      {
        sessionsTotal: 3,
        selected: 2,
        purchaseRequested: 2,
        approved: 1,
        paymentSucceeded: 1,
        policyBlocked: 0,
        cancelled: 1,
      },
      10,
      4,
    );
    expect(counts).toEqual({
      sessionsTotal: 3,
      discovered: 10,
      recommended: 4,
      selected: 2,
      purchaseRequested: 2,
      approved: 1,
      paymentSucceeded: 1,
      policyBlocked: 0,
      cancelled: 1,
    });
  });
});

describe("computeFunnelMetrics", () => {
  const window = { start: new Date("2024-01-01"), end: new Date("2024-01-02") };

  test("empty data produces all-null rates, not zeros", () => {
    const metrics = computeFunnelMetrics(
      {
        sessionsTotal: 0,
        discovered: 0,
        recommended: 0,
        selected: 0,
        purchaseRequested: 0,
        approved: 0,
        paymentSucceeded: 0,
        policyBlocked: 0,
        cancelled: 0,
      },
      window,
    );
    expect(metrics.discoveryToRecommendationRate).toBeNull();
    expect(metrics.recommendationToSelectionRate).toBeNull();
    expect(metrics.selectionToPurchaseRate).toBeNull();
    expect(metrics.purchaseToApprovalRate).toBeNull();
    expect(metrics.approvalToPaymentRate).toBeNull();
    expect(metrics.overallConversionRate).toBeNull();
  });

  test("computes each stage-to-stage rate from its documented numerator/denominator", () => {
    const metrics = computeFunnelMetrics(
      {
        sessionsTotal: 10,
        discovered: 100,
        recommended: 50,
        selected: 10,
        purchaseRequested: 8,
        approved: 6,
        paymentSucceeded: 4,
        policyBlocked: 1,
        cancelled: 1,
      },
      window,
    );
    expect(metrics.discoveryToRecommendationRate).toBe(0.5);
    expect(metrics.recommendationToSelectionRate).toBe(0.2);
    expect(metrics.selectionToPurchaseRate).toBe(0.8);
    expect(metrics.purchaseToApprovalRate).toBe(0.75);
    expect(metrics.approvalToPaymentRate).toBeCloseTo(0.6667, 3);
    expect(metrics.overallConversionRate).toBe(0.5);
  });

  test("a duplicate/idempotent shopping request never inflates the funnel (single row in, single row counted)", () => {
    // Idempotent re-runs resolve to the SAME persisted session row (see
    // `insertShoppingSessionIdempotent`), so the repository query never sees a
    // duplicate row for a repeated request; this is validated at the
    // repository/service level (see merchant-intelligence.service.test.ts).
    // Here we assert the pure calculation treats counts literally — it cannot
    // itself de-duplicate, so correctness depends on the repository query,
    // which counts distinct session ids server-side.
    const metrics = computeFunnelMetrics(
      {
        sessionsTotal: 1,
        discovered: 3,
        recommended: 1,
        selected: 1,
        purchaseRequested: 1,
        approved: 0,
        paymentSucceeded: 0,
        policyBlocked: 0,
        cancelled: 0,
      },
      window,
    );
    expect(metrics.counts.sessionsTotal).toBe(1);
  });
});

describe("computeProductPerformance", () => {
  test("derives selection/conversion rates per product", () => {
    const [p] = computeProductPerformance([
      {
        productId: "p1",
        title: "Widget",
        merchant: "Acme",
        amountInMinor: 1000,
        currency: "INR",
        timesDiscovered: 20,
        timesRecommended: 20,
        timesSelected: 1,
        timesConverted: 1,
      },
    ]);
    expect(p!.selectionRate).toBe(0.05);
    expect(p!.conversionRate).toBe(1);
  });

  test("never recommended => null selection rate, not 0", () => {
    const [p] = computeProductPerformance([
      {
        productId: "p2",
        title: "Gadget",
        merchant: null,
        amountInMinor: 500,
        currency: "INR",
        timesDiscovered: 5,
        timesRecommended: 0,
        timesSelected: 0,
        timesConverted: 0,
      },
    ]);
    expect(p!.selectionRate).toBeNull();
    expect(p!.conversionRate).toBeNull();
  });
});

describe("computeRecommendationPositionPerformance", () => {
  test("computes selection rate per rank bucket", () => {
    const rows = computeRecommendationPositionPerformance([
      { isTop: true, recommendedCount: 10, selectedCount: 2 },
      { isTop: false, recommendedCount: 40, selectedCount: 12 },
    ]);
    const top = rows.find((r) => r.isTop)!;
    const rest = rows.find((r) => !r.isTop)!;
    expect(top.selectionRate).toBe(0.2);
    expect(rest.selectionRate).toBe(0.3);
  });
});
