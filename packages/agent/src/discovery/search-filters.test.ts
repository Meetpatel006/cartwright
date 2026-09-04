import { describe, expect, test } from "bun:test";

import { buildOnSiteSearchFilterInstructions } from "./search-filters";

describe("buildOnSiteSearchFilterInstructions", () => {
  test("turns budget, rating, and feature constraints into independent browser actions", () => {
    expect(buildOnSiteSearchFilterInstructions({
      budgetInMinor: 200_000,
      currency: "INR",
      minRating: 4,
      constraints: ["low_latency", "wired"],
    })).toEqual([
      "Use the visible price filter to set the maximum price to 2000 INR. Do not select a product or add anything to a cart.",
      "Use the visible customer-rating filter to show products rated 4 stars or higher. Do not select a product or add anything to a cart.",
      'If this results page has a visible filter for "low latency", apply it. If it has no matching filter, leave the current results unchanged. Do not select a product or add anything to a cart.',
      'If this results page has a visible filter for "wired", apply it. If it has no matching filter, leave the current results unchanged. Do not select a product or add anything to a cart.',
    ]);
  });

  test("does not invent a rating filter for an explicit any-rating request", () => {
    expect(buildOnSiteSearchFilterInstructions({
      budgetInMinor: 200_000,
      currency: "INR",
      minRating: null,
    })).toEqual([
      "Use the visible price filter to set the maximum price to 2000 INR. Do not select a product or add anything to a cart.",
    ]);
  });
});
