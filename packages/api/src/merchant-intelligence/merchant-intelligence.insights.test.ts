import { describe, expect, test } from "bun:test";

import { generateInsights, LOW_SELECTION_RATE } from "./merchant-intelligence.insights";
import type { ProductPerformance, RecommendationPositionPerformance } from "./merchant-intelligence.types";

const window = { start: new Date("2024-01-01"), end: new Date("2024-01-08") };

function product(over: Partial<ProductPerformance>): ProductPerformance {
  return {
    productId: "p1",
    title: "Widget",
    merchant: "Acme",
    amountInMinor: 1000,
    currency: "INR",
    timesDiscovered: 0,
    timesRecommended: 0,
    timesSelected: 0,
    timesConverted: 0,
    selectionRate: null,
    conversionRate: null,
    ...over,
  };
}

describe("generateInsights — underperforming recommendation", () => {
  test("no insight below the minimum sample size, even with a 0% selection rate", () => {
    const insights = generateInsights({
      products: [product({ timesRecommended: 3, timesSelected: 0, selectionRate: 0 })],
      recommendationPositions: [],
      timeWindow: window,
    });
    expect(insights).toHaveLength(0);
  });

  test("no insight when the selection rate is healthy", () => {
    const insights = generateInsights({
      products: [
        product({ timesRecommended: 20, timesSelected: 10, selectionRate: 0.5 }),
      ],
      recommendationPositions: [],
      timeWindow: window,
    });
    expect(insights.filter((i) => i.type === "underperforming_recommendation")).toHaveLength(0);
  });

  test("generates an opportunity insight with exact evidence once threshold + sample size are met", () => {
    const insights = generateInsights({
      products: [
        product({
          title: "Dark Ocean",
          timesRecommended: 25,
          timesSelected: 1,
          selectionRate: 1 / 25,
        }),
      ],
      recommendationPositions: [],
      timeWindow: window,
    });
    expect(insights).toHaveLength(1);
    const insight = insights[0]!;
    expect(insight.type).toBe("underperforming_recommendation");
    expect(insight.severity).toBe("opportunity");
    expect(insight.summary).toContain("Dark Ocean");
    expect(insight.summary).toContain("25");
    expect(insight.evidence.sampleSize).toBe(25);
    expect(insight.evidence.currentValue).toBeCloseTo(1 / 25, 5);
    expect(insight.evidence.comparisonValue).toBe(LOW_SELECTION_RATE);
    expect(insight.evidence.timeWindow).toEqual(window);
    expect(insight.calculation).toContain("timesSelected (1)");
    expect(insight.confidence).toBe("medium"); // sample size 25 is in [15, 40) => medium
  });
});

describe("generateInsights — selection to purchase drop-off", () => {
  test("no insight when conversion rate is healthy", () => {
    const insights = generateInsights({
      products: [
        product({ timesRecommended: 10, timesSelected: 10, timesConverted: 8, conversionRate: 0.8 }),
      ],
      recommendationPositions: [],
      timeWindow: window,
    });
    expect(insights.filter((i) => i.type === "selection_purchase_dropoff")).toHaveLength(0);
  });

  test("flags a low conversion rate with sufficient sample", () => {
    const insights = generateInsights({
      products: [
        product({
          title: "Gadget",
          timesRecommended: 10,
          timesSelected: 10,
          timesConverted: 2,
          conversionRate: 0.2,
        }),
      ],
      recommendationPositions: [],
      timeWindow: window,
    });
    const insight = insights.find((i) => i.type === "selection_purchase_dropoff");
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe("warning");
    expect(insight!.evidence.sampleSize).toBe(10);
  });
});

describe("generateInsights — rank position gap", () => {
  function pos(over: Partial<RecommendationPositionPerformance>): RecommendationPositionPerformance {
    return { isTop: true, recommendedCount: 0, selectedCount: 0, selectionRate: null, ...over };
  }

  test("no insight when either bucket is missing or empty", () => {
    const insights = generateInsights({
      products: [],
      recommendationPositions: [pos({ isTop: true, recommendedCount: 10, selectedCount: 1, selectionRate: 0.1 })],
      timeWindow: window,
    });
    expect(insights).toHaveLength(0);
  });

  test("no insight when the gap is below the threshold", () => {
    const insights = generateInsights({
      products: [],
      recommendationPositions: [
        pos({ isTop: true, recommendedCount: 20, selectedCount: 4, selectionRate: 0.2 }),
        pos({ isTop: false, recommendedCount: 20, selectedCount: 5, selectionRate: 0.22 }),
      ],
      timeWindow: window,
    });
    expect(insights).toHaveLength(0);
  });

  test("flags a meaningful gap between top and non-top selection rates", () => {
    const insights = generateInsights({
      products: [],
      recommendationPositions: [
        pos({ isTop: true, recommendedCount: 20, selectedCount: 2, selectionRate: 0.1 }),
        pos({ isTop: false, recommendedCount: 20, selectedCount: 6, selectionRate: 0.3 }),
      ],
      timeWindow: window,
    });
    expect(insights).toHaveLength(1);
    const insight = insights[0]!;
    expect(insight.type).toBe("rank_position_selection_gap");
    expect(insight.evidence.currentValue).toBe(0.3);
    expect(insight.evidence.comparisonValue).toBe(0.1);
    expect(insight.summary).not.toMatch(/causes?/i);
  });
});
