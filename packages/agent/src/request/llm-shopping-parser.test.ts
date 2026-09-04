import { describe, expect, test } from "bun:test";

import {
  parseShoppingRequestWithLLM,
  type LLMIntentParserDeps,
} from "./llm-shopping-parser";
import { ShoppingRequestValidationError } from "../errors";

describe("parseShoppingRequestWithLLM — conversational & generalized prompt extraction", () => {
  test("extracts store, clean search query, brands, budget, and min rating from a complex prompt", async () => {
    const mockLlmGenerate = async () => ({
      store: "amazon",
      cleanSearchQuery: "mechanical keyboard",
      brands: ["Keychron", "Royal Kludge"],
      category: "electronics",
      budgetInMinor: 500_000,
      currency: "INR",
      minRating: 3.5,
      requestedQuantity: 1,
      constraints: ["mechanical"],
    });

    const deps: LLMIntentParserDeps = {
      extractWithLlm: mockLlmGenerate,
    };

    const intent = await parseShoppingRequestWithLLM(
      {
        query:
          "Go to Amazon, search about keyboard and then particular brand Keychron or Royal Kludge, and also other product under 5,000 budget or something with that particular 3.5 star",
        defaultCurrency: "INR",
      },
      deps,
    );

    expect(intent.rawQuery).toBe(
      "Go to Amazon, search about keyboard and then particular brand Keychron or Royal Kludge, and also other product under 5,000 budget or something with that particular 3.5 star",
    );
    expect(intent.store).toBe("amazon");
    expect(intent.cleanSearchQuery).toBe("mechanical keyboard");
    expect(intent.brands).toEqual(["Keychron", "Royal Kludge"]);
    expect(intent.budgetInMinor).toBe(500_000);
    expect(intent.currency).toBe("INR");
    expect(intent.minRating).toBe(3.5);
    expect(intent.requestedQuantity).toBe(1);
    expect(intent.constraints).toContain("mechanical");
  });

  test("extracts multi-quantity, constraints and rating for gaming mouse", async () => {
    const mockLlmGenerate = async () => ({
      store: "flipkart",
      cleanSearchQuery: "wireless gaming mouse",
      brands: ["Logitech", "Razer"],
      category: "electronics",
      budgetInMinor: 200_000,
      currency: "INR",
      minRating: 4.0,
      requestedQuantity: 2,
      constraints: ["wireless", "rgb"],
    });

    const intent = await parseShoppingRequestWithLLM(
      {
        query:
          "Please buy 2 wireless gaming mice on Flipkart from Logitech or Razer under 2k with RGB and 4 star rating",
        defaultCurrency: "INR",
      },
      { extractWithLlm: mockLlmGenerate },
    );

    expect(intent.store).toBe("flipkart");
    expect(intent.cleanSearchQuery).toBe("wireless gaming mouse");
    expect(intent.brands).toEqual(["Logitech", "Razer"]);
    expect(intent.requestedQuantity).toBe(2);
    expect(intent.budgetInMinor).toBe(200_000);
    expect(intent.minRating).toBe(4.0);
    expect(intent.constraints).toContain("wireless");
    expect(intent.constraints).toContain("rgb");
  });

  test("handles store URL in prompt", async () => {
    const mockLlmGenerate = async () => ({
      store: "https://ravenscents.com",
      cleanSearchQuery: "vanilla perfume",
      brands: ["Raven Scents"],
      category: "beauty",
      budgetInMinor: 150_000,
      currency: "INR",
      minRating: null,
      requestedQuantity: 1,
      constraints: [],
    });

    const intent = await parseShoppingRequestWithLLM(
      {
        query: "Look on https://ravenscents.com for vanilla perfume under 1500",
        defaultCurrency: "INR",
      },
      { extractWithLlm: mockLlmGenerate },
    );

    expect(intent.store).toBe("https://ravenscents.com");
    expect(intent.cleanSearchQuery).toBe("vanilla perfume");
    expect(intent.budgetInMinor).toBe(150_000);
  });

  test("gracefully falls back to deterministic regex parser if LLM fails", async () => {
    const mockFailingLlm = async () => {
      throw new Error("LLM rate limit / network error");
    };

    const intent = await parseShoppingRequestWithLLM(
      {
        query: "wireless headphones under 5000",
        defaultCurrency: "INR",
      },
      { extractWithLlm: mockFailingLlm },
    );

    // Fallback extracts what it can via regex without failing the request
    expect(intent.budgetInMinor).toBe(500_000);
    expect(intent.currency).toBe("INR");
    expect(intent.rawQuery).toBe("wireless headphones under 5000");
    expect(intent.cleanSearchQuery).toBeDefined();
  });

  test("gracefully falls back to deterministic regex parser if LLM returns null/empty", async () => {
    const mockNullLlm = async () => null;

    const intent = await parseShoppingRequestWithLLM(
      {
        query: "espresso coffee maker under 15000 from sony",
        defaultCurrency: "INR",
      },
      { extractWithLlm: mockNullLlm },
    );

    expect(intent.budgetInMinor).toBe(1_500_000);
    expect(intent.currency).toBe("INR");
    expect(intent.preferredMerchants).toContain("sony");
  });

  test("extracts slang phrasing, brand choices, and k-suffix budget", async () => {
    const mockLlmGenerate = async () => ({
      store: null,
      cleanSearchQuery: "noise cancelling earbuds",
      brands: ["Sony", "Bose"],
      category: "electronics",
      budgetInMinor: 800_000,
      currency: "INR",
      minRating: null,
      requestedQuantity: 1,
      constraints: ["noise_cancelling"],
    });

    const intent = await parseShoppingRequestWithLLM(
      {
        query: "yo find me some nice noise cancelling earbuds from sony or bose under 8k inr",
        defaultCurrency: "INR",
      },
      { extractWithLlm: mockLlmGenerate },
    );

    expect(intent.cleanSearchQuery).toBe("noise cancelling earbuds");
    expect(intent.brands).toEqual(["Sony", "Bose"]);
    expect(intent.budgetInMinor).toBe(800_000);
    expect(intent.currency).toBe("INR");
  });

  test("extracts merchant exclusions and feature constraints", async () => {
    const mockLlmGenerate = async () => ({
      store: null,
      cleanSearchQuery: "running shoes",
      brands: ["Nike", "Adidas"],
      category: "apparel",
      budgetInMinor: 600_000,
      currency: "INR",
      minRating: null,
      requestedQuantity: 1,
      constraints: ["cushion"],
      preferredMerchants: ["nike", "adidas"],
      excludedMerchants: ["flipkart"],
    });

    const intent = await parseShoppingRequestWithLLM(
      {
        query: "running shoes from nike or adidas not from flipkart under 6000 with good cushion",
        defaultCurrency: "INR",
      },
      { extractWithLlm: mockLlmGenerate },
    );

    expect(intent.cleanSearchQuery).toBe("running shoes");
    expect(intent.brands).toEqual(["Nike", "Adidas"]);
    expect(intent.excludedMerchants).toContain("flipkart");
    expect(intent.budgetInMinor).toBe(600_000);
    expect(intent.constraints).toContain("cushion");
  });

  test("rejects empty / whitespace-only query with typed error before calling LLM", async () => {
    let called = false;
    const mockLlm = async () => {
      called = true;
      return null;
    };

    expect(
      parseShoppingRequestWithLLM({ query: "   " }, { extractWithLlm: mockLlm }),
    ).rejects.toThrow(ShoppingRequestValidationError);

    expect(called).toBe(false);
  });
});
