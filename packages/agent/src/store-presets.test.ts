import { describe, expect, test } from "bun:test";

import { findStorePreset } from "./store-presets";

describe("India store presets", () => {
  test("uses Nike India's current storefront instead of the redirecting global URL", () => {
    expect(findStorePreset("nike")).toMatchObject({
      name: "Nike India",
      baseUrl: "https://www.nike.in",
      searchMode: "act",
      actBaseUrl: "https://www.nike.in/nike_store/c/2",
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

  test("resolves local-merchant and raven scents store presets", () => {
    const expected = {
      name: "Raven Scents",
      baseUrl: "http://localhost:5173",
      searchMode: "act",
      actBaseUrl: "http://localhost:5173/shop",
    };

    expect(findStorePreset("raven")).toMatchObject(expected);
    expect(findStorePreset("raven-scents")).toMatchObject(expected);
    expect(findStorePreset("raven scents")).toMatchObject(expected);
    expect(findStorePreset("local-merchant")).toMatchObject(expected);
    expect(findStorePreset("local merchant")).toMatchObject(expected);
  });
});
