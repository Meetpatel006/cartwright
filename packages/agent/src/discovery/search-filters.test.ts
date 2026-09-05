import { describe, expect, test } from "bun:test";

import {
  applyOnSiteSearchFilters,
  buildOnSiteSearchFilterInstructions,
} from "./search-filters";

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

  test("only acts on facets that the current provider exposes", async () => {
    const observations: string[] = [];
    const actions: string[] = [];
    const page = {
      waitForLoadState: async () => {},
    };
    const context = {
      setActivePage: async () => {},
    };
    const stagehand = {
      observe: async (instruction: string) => {
        observations.push(instruction);
        return {
          data: instruction.includes("price filter")
            ? [{ selector: "[data-price-filter]", description: "Price", method: "fill" }]
            : [],
        };
      },
      act: async (action: { selector: string }) => {
        actions.push(action.selector);
        return { data: { success: true, actions: [{}] } };
      },
    };

    await applyOnSiteSearchFilters(
      page as never,
      context as never,
      stagehand as never,
      {
        budgetInMinor: 200_000,
        currency: "INR",
        minRating: 4,
        constraints: ["low_latency"],
      },
    );

    expect(observations).toHaveLength(3);
    expect(actions).toEqual([
      "[data-price-filter]",
    ]);
  });

  test("does not fail discovery when a provider cannot inspect its filter controls", async () => {
    const actions: string[] = [];
    const page = { waitForLoadState: async () => {} };
    const context = { setActivePage: async () => {} };
    const stagehand = {
      observe: async () => {
        throw new Error("merchant blocked inspection");
      },
      act: async (action: { selector: string }) => {
        actions.push(action.selector);
        return { data: { success: true, actions: [{}] } };
      },
    };

    await applyOnSiteSearchFilters(
      page as never,
      context as never,
      stagehand as never,
      { budgetInMinor: 200_000, currency: "INR" },
    );

    expect(actions).toEqual([]);
  });
});
