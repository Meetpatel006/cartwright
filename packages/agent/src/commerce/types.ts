/**
 * Part B domain models — the "Agentic Shopping & Commerce Intelligence" layer.
 *
 * These types are the stable contract between the orchestrator, the ranking /
 * recommendation engines, the persistence layer, and the API. They deliberately
 * reuse Part A conventions (integer minor-unit money, ISO-4217 currency) so a
 * normalized product can be handed to Part A's transaction gate without any
 * unit juggling.
 *
 * Naming note: the existing shopping agent exports its own `ShoppingRequest`
 * (the *discovery* input: budget + browser mode + store). Part B's parsed
 * user intent is called `ShoppingIntent` to avoid clashing with it. The
 * orchestrator maps an `ShoppingIntent` → the agent's `ShoppingRequest`.
 */

/** Stable ISO-4217 list we trust for normalization. Anything else is rejected. */
export const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "JPY", "CHF"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Typed availability so ranking/filtering never compare free-text strings. */
export type Availability = "in_stock" | "limited" | "out_of_stock" | "unknown";

/**
 * The parsed natural-language shopping request (Part B's view of user intent).
 * Produced by the request parser; never trusted to carry a final amount.
 */
export interface ShoppingIntent {
  /** Original natural-language query, preserved verbatim for audit. */
  rawQuery: string;
  /** Optional structured category guess (e.g. "electronics"); informational. */
  category: string | null;
  /**
   * Hard budget cap in minor units (e.g. 8000000 = ₹80,000.00). `null` means the
   * user expressed no budget, so budget filtering is skipped (not treated as
   * "unlimited approval" — Part A still gates the final amount).
   */
  budgetInMinor: number | null;
  /** ISO-4217 currency of the budget / expected prices. */
  currency: string;
  /** Requested quantity. Defaults to 1; used by downstream commerce only. */
  requestedQuantity: number;
  /** Merchants the user explicitly wants (allow-list). Lower-cased names. */
  preferredMerchants: string[];
  /** Merchants the user explicitly rejects (block-list). Lower-cased names. */
  excludedMerchants: string[];
  /**
   * Free-form product constraints parsed from the query (e.g. "with warranty",
   * "new only"). Kept as strings; the ranker rewards matches against product
   * attributes where possible and surfaces them in explanations.
   */
  constraints: string[];
  /** Target store preset key or URL, if the user named one. */
  store?: string;
}

/**
 * A single product discovered by the browser-automation layer, normalized into
 * a machine-safe shape. This is the *external boundary* output: it is validated
 * with Zod before entering core logic.
 */
export interface ProductCandidate {
  /** Where it came from (store preset key or hostname). */
  source: string;
  /** Merchant display name (usually the store name). */
  merchant: string;
  /** Product title as advertised. */
  title: string;
  /** Raw displayed price string exactly as seen (e.g. "₹7,995.00"). */
  rawPrice: string;
  /** ISO-4217 currency if the source reported one; may be missing. */
  currency: string | null;
  /** Absolute product page URL, if known. */
  productUrl: string | null;
  /** Human availability text from the page (best-effort). */
  availabilityText: string | null;
  /** Raw evidence the discovery layer used (opaque; never trusted as truth). */
  evidence: Record<string, unknown>;
}

/**
 * A candidate after normalization: canonical title, integer minor-unit amount,
 * typed availability, and a data-confidence score (0..1). The confidence lets
 * the ranker penalize products with missing/low-quality data instead of
 * silently trusting them.
 */
export interface NormalizedProduct {
  /** Stable id derived from (merchant + canonical title + url). */
  id: string;
  merchant: string;
  canonicalTitle: string;
  amountInMinor: number;
  currency: SupportedCurrency;
  productUrl: string | null;
  availability: Availability;
  /** 0..1 — how complete/trustworthy the source data was. */
  confidence: number;
  /** Attributes extracted from the candidate (lowercased keys/values). */
  attributes: Record<string, string>;
  /** Why confidence was assigned (for audit/explanation). */
  confidenceReasons: string[];
}

/** A single deterministic scoring signal contributing to a ranking. */
export interface RankingFactor {
  /** Stable signal name, e.g. "budget_fit". */
  name: string;
  /** Signed contribution to the total score (negative = penalty). */
  impact: number;
  /** Human-readable reason referencing the actual product data. */
  reason: string;
}

/** Result of ranking one normalized product. */
export interface RankingResult {
  productId: string;
  /** Total deterministic score (clamped to >= 0). */
  score: number;
  factors: RankingFactor[];
}

/**
 * A recommendation pairs a normalized product with its ranking and an
 * explanation derived *only* from the actual ranking factors — the system never
 * invents product properties.
 */
export interface Recommendation {
  product: NormalizedProduct;
  rankingScore: number;
  rankingFactors: RankingFactor[];
  /** One line per factor; every line cites real data. */
  explanation: string[];
  /** True when this is the top-ranked product. */
  isTopRecommendation: boolean;
}

/**
 * The structured output of Part B. Crucially, a purchase plan is NOT a payment
 * instruction: it records what the user selected and the evidence behind it.
 * Only Part A's `createPurchaseTransaction` turns a selection into a real,
 * policy-gated transaction.
 */
export interface PurchasePlan {
  productId: string;
  merchant: string;
  productUrl: string | null;
  expectedAmountInMinor: number;
  currency: string;
  /** Ranking score the product earned (for transparency). */
  rankingScore: number;
  /** Human reasons the product ranked where it did. */
  recommendationReasons: string[];
  /** Raw evidence supporting the amount/merchant. */
  evidence: Record<string, unknown>;
  /** Constraints that were applied during filtering/ranking. */
  constraintsApplied: string[];
  /** When the plan was created (ISO timestamp). */
  selectedAt: string;
}

/**
 * In-memory draft produced by the orchestrator before persistence. The API
 * service persists this and (on explicit selection) builds a Part A
 * `PurchaseProposal`. Keeping it separate from persistence avoids a circular
 * dependency: the orchestrator (agent pkg) never imports the api or db pkgs.
 */
export interface ShoppingSessionDraft {
  intent: ShoppingIntent;
  candidates: ProductCandidate[];
  normalized: NormalizedProduct[];
  /** Candidates that failed normalization, with the reason (kept for audit). */
  rejectedCandidates: Array<{ candidate: ProductCandidate; reason: string }>;
  recommendations: Recommendation[];
  /** ids dropped by filtering, with the reason. */
  filteredOut: Array<{ productId: string; reason: string }>;
  createdAt: string;
}
