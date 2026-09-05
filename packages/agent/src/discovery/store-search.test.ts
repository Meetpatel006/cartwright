import { describe, expect, test } from "bun:test";

import { searchStorefront } from "./store-search";

describe("searchStorefront", () => {
  test("uses an observed search input and deterministic browser controls", async () => {
    const calls: string[] = [];
    const page = {
      locator: (selector: string) => ({
        isVisible: async () => selector === "[data-at=search-input]",
        fill: async (query: string) => calls.push(`fill:${selector}:${query}`),
      }),
      keyPress: async (key: string) => calls.push(`key:${key}`),
    };
    const context = { setActivePage: async () => calls.push("active-page") };
    const stagehand = {
      observe: async () => ({
        data: [
          { selector: "button", description: "Search", method: "click" },
          { selector: "[data-at=search-input]", description: "Search input", method: "fill" },
        ],
      }),
    };

    await searchStorefront(page as never, context as never, stagehand as never, "running shoes");

    expect(calls).toEqual([
      "active-page",
      "fill:[data-at=search-input]:running shoes",
      "key:Enter",
    ]);
  });

  test("fails clearly when a merchant has no search control", async () => {
    const page = {};
    const context = { setActivePage: async () => {} };
    const stagehand = { observe: async () => ({ data: [] }) };

    await expect(
      searchStorefront(page as never, context as never, stagehand as never, "running shoes"),
    ).rejects.toThrow("does not expose a usable product search input");
  });
});
