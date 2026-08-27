/**
 * Turn a natural-language shopping request into a structured `ShoppingIntent`.
 *
 * This is the first stage of the Part B pipeline. It is fully deterministic and
 * pure (no LLM, no network) so it can be unit-tested exhaustively. The LLM is
 * only used later, by the discovery layer, to read the *page* — never to invent
 * the user's constraints.
 *
 * Reuses the Part A/agent `parseBudget` for currency-aware budget extraction so
 * the two layers agree on minor-unit math.
 */

import { parseBudget } from "./budget";
import type { ShoppingIntent } from "../commerce/types";
import { ShoppingRequestValidationError } from "../errors";

export interface ParseShoppingRequestInput {
  query: string;
  /** Optional target store preset key or URL. */
  store?: string;
  /** Currency assumed when the query carries no symbol (store default). */
  defaultCurrency?: string;
  /**
   * Budget used when the query expresses none. `null` = no budget (budget
   * filtering is then skipped). Defaults to null to avoid silently authorizing
   * an unlimited spend.
   */
  fallbackBudgetInMinor?: number | null;
}

// Brand/store tokens we recognize for "from/avoid <merchant>" extraction. Kept
// intentionally small and explicit; unknown merchants are simply not captured as
// preferences (they can still be discovered).
const MERCHANT_TOKENS = [
  "amazon",
  "flipkart",
  "myntra",
  "nike",
  "adidas",
  "apple",
  "samsung",
  "raven",
  "raven scents",
  "sony",
  "boAt",
  "puma",
  "levi",
  "zara",
  "dell",
  "lenovo",
  "xiaomi",
  "mi",
  "oneplus",
  "google",
];

const CATEGORY_HINTS: Array<{ re: RegExp; category: string }> = [
  { re: /\b(phone|iphone|smartphone|headphone|earbud|earphone|laptop|tablet|tv|television|camera|speaker|smartwatch|watch|console|charger|keyboard|monitor|router|drone|gadget)\b/i, category: "electronics" },
  { re: /\b(shirt|tshirt|t-shirt|tee|dress|jacket|jeans|socks|hoodie|pants|trouser|sneaker|shoes|shoe|footwear|sweater|coat|top|blouse)\b/i, category: "apparel" },
  { re: /\b(furniture|lamp|mattress|sofa|chair|table|desk|kitchen|decor|bed|bookshelf|cushion)\b/i, category: "home" },
  { re: /\b(perfume|fragrance|makeup|cosmetic|skincare|serum|lipstick|lotion)\b/i, category: "beauty" },
  { re: /\b(coffee|tea|snack|grocery|chocolate|protein|supplement)\b/i, category: "grocery" },
  { re: /\b(book|novel|textbook|manga|comic)\b/i, category: "books" },
  { re: /\b(toy|lego|puzzle|game|board game)\b/i, category: "toys" },
];

const CONSTRAINT_PATTERNS: Array<{ re: RegExp; token: string }> = [
  { re: /\b(refurbished|renewed|pre-owned|secondhand|used)\b/i, token: "refurbished" },
  { re: /\b(brand new|new only|factory new)\b/i, token: "new" },
  { re: /\b(with warranty|warranty|guarantee)\b/i, token: "warranty" },
  { re: /\b(in stock|available now|ready to ship)\b/i, token: "in_stock" },
  { re: /\b(free shipping|free delivery|free ship)\b/i, token: "free_shipping" },
  { re: /\b(organic|natural)\b/i, token: "organic" },
  { re: /\b(vegan)\b/i, token: "vegan" },
  { re: /\b(waterproof|water resistant)\b/i, token: "waterproof" },
];

/** Extract requested quantity. Returns 1 when nothing explicit is found. */
export function extractQuantity(query: string): number {
  const pair = /\b(pair|couple|duo)\b/i.test(query) ? 2 : 1;
  const digit =
    query.match(/\b(\d+)\s*(?:x|pack|set|pieces|pcs|count)\b/i) ??
    query.match(/\b(\d+)\s*-?\s*(?:pack|set)\b/i) ??
    query.match(/\bpack of\s*(\d+)\b/i) ??
    query.match(/\bset of\s*(\d+)\b/i) ??
    query.match(/\bbuy\s*(\d+)\b/i) ??
    query.match(/\bx\s*(\d+)\b/i) ??
    query.match(/\b(\d+)\s*x\b/i);
  if (digit) {
    const n = Number.parseInt(digit[1]!, 10);
    if (Number.isInteger(n) && n >= 1 && n <= 999) return n;
  }
  if (/\bdozen\b/i.test(query)) return 12;
  return pair;
}

/** Strip a known merchant token from `query` (case-insensitive, multi-word safe). */
function findMerchantToken(text: string): string | null {
  const lower = text.toLowerCase();
  // Longest-first so "raven scents" wins over "raven".
  for (const token of [...MERCHANT_TOKENS].sort((a, b) => b.length - a.length)) {
    if (lower.includes(token)) return token;
  }
  return null;
}

/** Pull preferred/excluded merchants from prepositional phrases. */
export function extractMerchantPreferences(query: string): {
  preferred: string[];
  excluded: string[];
} {
  const preferred: string[] = [];
  const excluded: string[] = [];

  const preferredPatterns = [
    // Negative lookbehind keeps "not from <m>" / "no from <m>" out of preferences.
    /(?<!not\s)(?<!no\s)\b(?:from|on|at|via|only on|only from|only at|shop\s+at|shop\s+on)\s+([a-z][a-z0-9 ]{1,24}?)(?=\s+(?:under|below|less than|max|upto|up to|with|in stock|and|,|\.|$))/i,
    /\bonly\s+([a-z][a-z0-9 ]{1,24}?)(?=\s+(?:under|below|less than|max|upto|up to|with|in stock|and|,|\.|$))/i,
  ];
  const excludedPatterns = [
    /\b(?:not from|avoid|excluding|exclude|no[n]?\s+from|not on|stay away from|never\s+from)\s+([a-z][a-z0-9 ]{1,24}?)(?=\s+(?:under|below|less than|max|upto|up to|with|in stock|and|,|\.|$))/i,
  ];

  for (const pattern of preferredPatterns) {
    const m = query.match(pattern);
    if (m) {
      const token = findMerchantToken(m[1]!);
      if (token && !preferred.includes(token)) preferred.push(token);
    }
  }
  for (const pattern of excludedPatterns) {
    const m = query.match(pattern);
    if (m) {
      const token = findMerchantToken(m[1]!);
      if (token && !excluded.includes(token)) excluded.push(token);
    }
  }
  return { preferred, excluded };
}

/** Extract free-form product constraints into normalized tokens. */
export function extractConstraints(query: string): string[] {
  const found = new Set<string>();
  for (const { re, token } of CONSTRAINT_PATTERNS) {
    if (re.test(query)) found.add(token);
  }
  return [...found];
}

/** Best-effort category guess. Returns null when nothing matches. */
export function extractCategory(query: string): string | null {
  for (const { re, category } of CATEGORY_HINTS) {
    if (re.test(query)) return category;
  }
  return null;
}

/**
 * Parse the full intent. Throws `ShoppingRequestValidationError` only when the
 * query is empty/whitespace — everything else degrades gracefully (missing
 * budget → null budget; missing merchant → no preference).
 */
export function parseShoppingRequest(input: ParseShoppingRequestInput): ShoppingIntent {
  const query = input.query?.trim();
  if (!query) {
    throw new ShoppingRequestValidationError("Shopping query must not be empty.");
  }

  const defaultCurrency = input.defaultCurrency ?? "USD";
  const budget = parseBudget(query, defaultCurrency);
  const budgetInMinor = budget?.amountInMinor ?? (input.fallbackBudgetInMinor ?? null);
  // Hard-INR product: budgets are ALWAYS interpreted in the caller's currency
  // (INR), even when the query contains "$"/"dollars" — India-only deployment.
  const currency = defaultCurrency;

  const { preferred, excluded } = extractMerchantPreferences(query);

  return {
    rawQuery: query,
    category: extractCategory(query),
    budgetInMinor,
    currency,
    requestedQuantity: extractQuantity(query),
    preferredMerchants: preferred,
    excludedMerchants: excluded,
    constraints: extractConstraints(query),
    store: input.store,
  };
}
