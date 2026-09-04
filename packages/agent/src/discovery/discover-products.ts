/**
 * Discovery boundary: wrap the browser-automation layer (`runShoppingAgent`)
 * and convert its output into typed `ProductCandidate`s.
 *
 * This is an EXTERNAL boundary (LLM + live web). We therefore validate each
 * extracted product with Zod before it enters core logic, and we fail loudly
 * (with typed errors) when discovery returns nothing or clearly malformed data.
 * We never silently synthesize placeholder products.
 */

import { z } from "zod";

import { runShoppingAgent, type AgentBrowserMode, type ShoppingResult } from "../shopping-agent";
import { isRegisteredLocalMerchant } from "../local-merchant";
import type { CustomModelEndpoint } from "../custom-llm";
import type { ProductCandidate } from "../commerce/types";
import {
  NoProductsFoundError,
  ProductDataValidationError,
} from "../errors";

/** Zod guard for the agent's extracted `Product` shape at the boundary. */
export const AgentProductSchema = z.object({
  name: z.union([z.string(), z.number()]),
  price: z.union([z.string(), z.number()]).nullable(),
  priceValue: z.union([z.string(), z.number()]).nullable().optional(),
  currency: z.union([z.string(), z.number(), z.null()]).optional(),
  rating: z.union([z.string(), z.number(), z.null()]).optional(),
  reviewCount: z.union([z.string(), z.number(), z.null()]).optional(),
  availability: z.union([z.string(), z.number(), z.null()]).optional(),
  url: z.union([z.string(), z.number(), z.null()]).optional(),
});

export interface DiscoverProductsParams {
  query: string;
  /** Single store preset/URL. Ignored when `stores` is provided. */
  store?: string;
  /** Multiple stores to fan out across (multi-merchant discovery). */
  stores?: string[];
  budgetInMinor: number | null;
  currency: string;
  mode: AgentBrowserMode;
  browserbaseApiKey?: string;
  llm?: CustomModelEndpoint;
  /** Record the browser session to packages/agent/recordings/. Defaults to true
   *  (the agent records every run unless explicitly disabled). */
  recordSession?: boolean;
  /** Key (typically user id) under which live-feed frames are published for
   *  the web UI's live view. Omit to disable live streaming. */
  liveFeedKey?: string;
  /** AbortSignal for top-level timeout/cancellation. */
  signal?: AbortSignal;
}

export interface DiscoverResult {
  candidates: ProductCandidate[];
  raw: ShoppingResult;
}

function firstNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const match = String(value ?? "").match(/[0-9][0-9,]*(?:\.[0-9]+)?/);
  if (!match) return undefined;
  const parsed = Number.parseFloat(match[0].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toCandidate(product: z.infer<typeof AgentProductSchema>, source: string): ProductCandidate {
  return {
    source,
    merchant: source,
    title: String(product.name),
    rawPrice: String(product.price ?? ""),
    currency: product.currency == null ? null : String(product.currency),
    productUrl: product.url == null ? null : String(product.url),
    availabilityText: product.availability == null ? null : String(product.availability),
    evidence: {
      priceValue: firstNumber(product.priceValue),
      rating: firstNumber(product.rating),
      reviewCount: firstNumber(product.reviewCount),
      currency: product.currency == null ? undefined : String(product.currency),
    },
  };
}

/** Split a store input like "amazon,flipkart" or "amazon+raven" into stores. */
export function splitStoreInput(store?: string): string[] | undefined {
  if (!store) return undefined;
  if (/^https?:\/\//i.test(store.trim())) return undefined; // a URL is a single store
  const parts = store
    .split(/[+,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : undefined;
}

/**
 * Run discovery. Supports multi-merchant fan-out: when `stores` is provided (or
 * the `store` string lists several), the agent runs once per store and the
 * candidates are merged. Returns validated candidates; throws a typed error
 * when no store yields anything usable.
 */
export async function discoverProducts(params: DiscoverProductsParams): Promise<DiscoverResult> {
  const stores = params.stores?.length
    ? params.stores
    : params.store
      ? [params.store]
      : [undefined];

  const allCandidates: ProductCandidate[] = [];
  let firstResult: ShoppingResult | undefined;
  let lastError: string | undefined;
  let sawMatches = false;

  console.log("[discovery] start:", {
    query: JSON.stringify(params.query),
    stores,
    budgetInMinor: params.budgetInMinor,
    currency: params.currency,
    mode: params.mode,
  });

  for (const store of stores) {
    // Multi-item baskets ("2 Gardenia and 3 Bad Boy") only make sense on
    // registered local merchants with a deterministic catalog; external stores
    // use the generic search flow.
    const basket = store ? parseQueryBasket(params.query, store) : undefined;
    console.log("[discovery] run agent:", { store, basket: basket ?? null });
    const result = await runShoppingAgent({
      query: params.query,
      store,
      budgetInMinor: params.budgetInMinor ?? 0,
      currency: params.currency,
      mode: params.mode,
      browserbaseApiKey: params.browserbaseApiKey,
      llm: params.llm,
      basket,
      // Discovery-only for the human-in-the-loop: do NOT add anything to the cart
      // here. Surface the matching options, retain the browser session, and let
      // the human's explicit selection drive the add-to-cart via fulfillSelection
      // (so only the chosen item is ever added).
      checkout: false,
      retainSession: true,
      recordSession: params.recordSession,
      liveFeedKey: params.liveFeedKey,
      signal: params.signal,
    });

    if (!firstResult) firstResult = result;
    if (result.error) {
      console.warn(`[discovery] agent error for store "${result.store}":`, result.error);
      lastError ??= result.error;
    }

    const rawMatches = result.matches ?? [];
    console.log(
      `[discovery] store "${result.store}" returned ${rawMatches.length} raw match(es)`,
      rawMatches.length > 0 ? rawMatches.map((m) => ({ name: m.name, price: m.price })) : [],
    );

    let validatedCount = 0;

    for (const raw of rawMatches) {
      sawMatches = true;
      const parsed = AgentProductSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(
          `[discovery] schema rejected product from "${result.store}":`,
          JSON.stringify(raw),
          JSON.stringify(parsed.error.issues),
        );
        continue; // skip malformed; surface below if all fail
      }
      allCandidates.push(toCandidate(parsed.data, result.store));
      validatedCount++;
    }
    console.log(`[discovery] store "${result.store}" validated ${validatedCount}/${rawMatches.length} match(es)`);
  }

  console.log("[discovery] done:", {
    candidates: allCandidates.length,
    sawMatches,
    lastError: lastError ?? null,
  });

  if (allCandidates.length === 0) {
    if (sawMatches) {
      throw new ProductDataValidationError(
        "Discovery returned products but none passed schema validation.",
        { rejectedCount: 0 },
      );
    }
    throw new NoProductsFoundError(
      lastError ?? "No products were found for this request.",
    );
  }

  // `raw` is the first store's result; the service only uses its `sessionId`
  // (meaningful for single-store runs; multi-merchant runs resolve to 'none').
  return { candidates: allCandidates, raw: firstResult! };
}

/**
 * Parse a free-form shopping query into basket items — GENERICALLY, with no
 * hard-coded product names. Splits multi-item queries ("2 Gardenia and 3 Bad
 * Boy", "gold edition + dark ocean"), strips budget clauses ("under 5000",
 * "below Rs. 3,000"), and reads quantities from prefixes ("2 gardenia",
 * "2x gold") or suffixes ("gardenia x2"). Item NAMES are resolved later
 * against the store's live catalog (fuzzy match), so any product the merchant
 * sells works. Only applies to registered local merchants (see
 * src/local-merchant.ts) — external stores always get the search flow.
 */
function parseQueryBasket(query: string, store: string | undefined) {
  if (!isRegisteredLocalMerchant(store)) return undefined;

  const NUMBER_WORDS: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
  };

  const items: Array<{ name: string; quantity: number }> = [];
  const parts = query
    .split(/\s*(?:\band\b|&|,|\+)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    let text = part;
    let quantity = 1;

    // Strip budget clauses: "under 5000", "below Rs. 3,000", "under $100"
    text = text.replace(
      /\b(?:under|below|less than|max(?:imum)?|upto|up to)\s*(?:rs\.?|inr|₹|\$)?\s*[\d,]+(?:\.\d+)?/gi,
      " ",
    );

    // Leading quantity: "2 gardenia", "2x gold edition", "two bad boy"
    const lead = text.match(/^\s*(\d{1,2}|one|two|three|four|five|six)\s*[x*]?\s+/i);
    if (lead) {
      const leadToken = lead[1]!;
      quantity = /^\d+$/.test(leadToken)
        ? Number(leadToken)
        : (NUMBER_WORDS[leadToken.toLowerCase()] ?? 1);
      text = text.slice(lead[0]!.length);
    } else {
      // Trailing quantity marker: "gold edition x2"
      const trail = text.match(/\s+[x*]\s*(\d{1,2})\s*$/i);
      if (trail) {
        quantity = Number(trail[1]);
        text = text.slice(0, trail.index);
      }
    }

    const name = text.replace(/\s+/g, " ").trim();
    if (!name || !Number.isInteger(quantity) || quantity < 1) continue;
    items.push({ name, quantity });
  }
  return items.length ? items : undefined;
}
