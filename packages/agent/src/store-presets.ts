/**
 * Store search presets — pure-data accelerators for well-known storefronts.
 *
 * The agent core is store-agnostic: any store NOT listed here (or any full
 * URL) falls through to the natural-language "drive the search box" path, so
 * these presets only exist to skip LLM calls by constructing a known search
 * URL directly. They carry no automation logic.
 *
 * Built-ins self-register when this module is imported (the agent core imports
 * it). Additional presets can be added at runtime via `registerStorePreset`.
 */

export interface StorePreset {
  /** Display name */
  name: string;
  /** Base URL of the store (e.g. "https://www.nike.com") */
  baseUrl: string;
  /** How to reach search results. "url" = construct search URL from pattern. */
  searchMode: "url" | "act";
  /** When searchMode is "url", a template with {query} placeholder. */
  searchUrlTemplate?: string;
  /** When searchMode is "act", the URL to navigate to before driving the search box */
  actBaseUrl?: string;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, StorePreset>();

/** Register one preset (key is lowercased; later registrations win). */
export function registerStorePreset(key: string, preset: StorePreset): void {
  registry.set(key.trim().toLowerCase(), preset);
}

/** Register many presets at once. */
export function registerStorePresets(presets: Record<string, StorePreset>): void {
  for (const [key, preset] of Object.entries(presets)) registerStorePreset(key, preset);
}

/** Look a preset up by key ("amazon-in") — case-insensitive. */
export function findStorePreset(storeKey: string | undefined): StorePreset | undefined {
  if (!storeKey) return undefined;
  return registry.get(storeKey.trim().toLowerCase());
}

/** All registered presets keyed by store key. */
export function getStorePresets(): Record<string, StorePreset> {
  return Object.fromEntries(registry);
}

// ── Built-in presets ─────────────────────────────────────────────────────────

const BUILT_IN_PRESETS: Record<string, StorePreset> = {
  nike: {
    name: "Nike India",
    // nike.com/in now redirects to the India catalogue landing page and drops
    // its query. Start on Nike India's canonical storefront and use its search control.
    baseUrl: "https://www.nike.in",
    searchMode: "act",
    actBaseUrl: "https://www.nike.in",
  },
  "nike-in": {
    name: "Nike India",
    baseUrl: "https://www.nike.in",
    searchMode: "act",
    actBaseUrl: "https://www.nike.in",
  },
  amazon: {
    name: "Amazon India",
    baseUrl: "https://www.amazon.in",
    searchMode: "url",
    searchUrlTemplate: "https://www.amazon.in/s?k={query}",
  },
  "amazon-in": {
    name: "Amazon India",
    baseUrl: "https://www.amazon.in",
    searchMode: "url",
    searchUrlTemplate: "https://www.amazon.in/s?k={query}",
  },
  adidas: {
    name: "Adidas India",
    baseUrl: "https://www.adidas.co.in",
    searchMode: "url",
    searchUrlTemplate: "https://www.adidas.co.in/search?q={query}",
  },
  flipkart: {
    name: "Flipkart",
    baseUrl: "https://www.flipkart.com",
    // Verified 2026-08-25 (live fetch): /search?q= renders full SSR results
    // ("Showing 1 – 40 of N results"), so drive it directly instead of the
    // slower natural-language search-box flow. Optional params: &page=N&sort=…
    searchMode: "url",
    searchUrlTemplate: "https://www.flipkart.com/search?q={query}",
  },
};

registerStorePresets(BUILT_IN_PRESETS);
