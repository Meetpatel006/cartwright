import { describe, expect, test } from "bun:test";

import { findStorePreset } from "./store-presets";

describe("India store presets", () => {
  test("uses Nike India's current storefront instead of the redirecting global URL", () => {
    expect(findStorePreset("nike")).toMatchObject({
      name: "Nike India",
      baseUrl: "https://www.nike.in",
      searchMode: "act",
      actBaseUrl: "https://www.nike.in",
    });
    expect(findStorePreset("nike-in")).toEqual(findStorePreset("nike"));
  });

  test("keeps the built-in Amazon preset on the Indian storefront", () => {
    expect(findStorePreset("amazon")).toMatchObject({
      name: "Amazon India",
      baseUrl: "https://www.amazon.in",
      searchUrlTemplate: "https://www.amazon.in/s?k={query}",
    });
  });
});
