import { describe, expect, test } from "bun:test";

import {
  CONFIDENCE_THRESHOLDS,
  deriveConfidence,
  describeRateCalculation,
  hasSufficientSample,
  MIN_SAMPLE_SIZE,
} from "./merchant-intelligence.explainability";

describe("hasSufficientSample", () => {
  test("below MIN_SAMPLE_SIZE is insufficient", () => {
    expect(hasSufficientSample(MIN_SAMPLE_SIZE - 1)).toBe(false);
  });
  test("at or above MIN_SAMPLE_SIZE is sufficient", () => {
    expect(hasSufficientSample(MIN_SAMPLE_SIZE)).toBe(true);
  });
});

describe("deriveConfidence", () => {
  test("low sample size => low confidence", () => {
    expect(deriveConfidence(MIN_SAMPLE_SIZE)).toBe("low");
    expect(deriveConfidence(CONFIDENCE_THRESHOLDS.medium - 1)).toBe("low");
  });
  test("medium sample size => medium confidence", () => {
    expect(deriveConfidence(CONFIDENCE_THRESHOLDS.medium)).toBe("medium");
    expect(deriveConfidence(CONFIDENCE_THRESHOLDS.high - 1)).toBe("medium");
  });
  test("sufficient sample size => high confidence", () => {
    expect(deriveConfidence(CONFIDENCE_THRESHOLDS.high)).toBe("high");
    expect(deriveConfidence(1000)).toBe("high");
  });
});

describe("describeRateCalculation", () => {
  test("produces a reproducible, human-readable string", () => {
    expect(describeRateCalculation("selected", "recommended", 1, 20)).toBe(
      "selected (1) / recommended (20) = 5.0%",
    );
  });

  test("handles a zero denominator without dividing by zero", () => {
    expect(describeRateCalculation("selected", "recommended", 0, 0)).toBe(
      "selected (0) / recommended (0) = undefined%",
    );
  });
});
