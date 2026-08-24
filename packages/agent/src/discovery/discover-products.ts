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
import type { CustomModelEndpoint } from "../custom-llm";
import type { ProductCandidate } from "../commerce/types";
import {
  NoProductsFoundError,
  ProductDataValidationError,
} from "../errors";

/** Zod guard for the agent's extracted `Product` shape at the boundary. */
export const AgentProductSchema = z.object({
  name: z.string().min(1),
  price: z.string().min(1),
  priceValue: z.number().optional(),
  currency: z.string().optional(),
  rating: z.number().optional(),
  availability: z.string().optional(),
  url: z.string().optional(),
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
  /** AbortSignal for top-level timeout/cancellation. */
  signal?: AbortSignal;
}

export interface DiscoverResult {
  candidates: ProductCandidate[];
  raw: ShoppingResult;
}

function toCandidate(product: z.infer<typeof AgentProductSchema>, source: string): ProductCandidate {
  return {
    source,
    merchant: source,
    title: product.name,
    rawPrice: product.price,
    currency: product.currency ?? null,
    productUrl: product.url ?? null,
    availabilityText: product.availability ?? null,
    evidence: {
      priceValue: product.priceValue,
      rating: product.rating,
      currency: product.currency,
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

  for (const store of stores) {
    const basket = store ? parseRavenBasket(params.query, store) : undefined;
    const result = await runShoppingAgent({
      query: params.query,
      store,
      budgetInMinor: params.budgetInMinor ?? 0,
      currency: params.currency,
      mode: params.mode,
      browserbaseApiKey: params.browserbaseApiKey,
      llm: params.llm,
      basket,
      preserveCheckoutSession: true,
      signal: params.signal,
    });

    if (!firstResult) firstResult = result;
    if (result.error) lastError ??= result.error;

    for (const raw of result.matches ?? []) {
      sawMatches = true;
      const parsed = AgentProductSchema.safeParse(raw);
      if (!parsed.success) continue; // skip malformed; surface below if all fail
      allCandidates.push(toCandidate(parsed.data, result.store));
    }
  }

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

/** Mirror of the API helper: deterministic Raven basket from a query + store. */
function parseRavenBasket(query: string, store: string | undefined) {
  if (store?.toLowerCase() !== "raven") return undefined;
  const gardeniaMatch = query.match(/(?:(\d+)\s+)?gardenia/i);
  const darkOceanMatch = query.match(/(?:(\d+)\s+)?dark\s+ocean/i);
  const badBoyMatch = query.match(/(?:(\d+)\s+)?bad\s+boy/i);
  if (!gardeniaMatch && !darkOceanMatch && !badBoyMatch) return undefined;
  return [
    ...(gardeniaMatch ? [{ name: "Gardenia", quantity: Number(gardeniaMatch[1] ?? 1) }] : []),
    ...(darkOceanMatch ? [{ name: "Dark Ocean", quantity: Number(darkOceanMatch[1] ?? 1) }] : []),
    ...(badBoyMatch ? [{ name: "Bad Boy", quantity: Number(badBoyMatch[1] ?? 1) }] : []),
  ];
}
