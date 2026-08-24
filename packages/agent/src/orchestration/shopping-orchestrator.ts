/**
 * The Part B orchestrator.
 *
 * It coordinates the pipeline stages — discover → normalize → filter → rank →
 * recommend — and returns an in-memory `ShoppingSessionDraft`. It contains NO
 * business logic of its own beyond sequencing; every step is a small, tested
 * module. The orchestrator also exposes `selectProduct`, which turns a user's
 * explicit choice into a `PurchasePlan` (still NOT a payment).
 *
 * Crucially, the orchestrator never imports Part A (`@cartwright/api`) or the
 * DB package. The API service composes this with persistence and the Part A
 * transaction gate, avoiding a circular dependency.
 *
 * `discover` is injected so the orchestrator is fully testable without a
 * browser. The default implementation uses `discoverProducts` (real agent).
 */

import { normalizeProduct } from "../normalization/product-normalizer";
import { filterCandidates } from "../filtering/product-filter";
import { rankProduct, rankProducts } from "../ranking/product-ranker";
import { generateRecommendations } from "../commerce/recommendation";
import { createPurchasePlan } from "../commerce/purchase-plan";
import type {
  NormalizedProduct,
  ProductCandidate,
  PurchasePlan,
  ShoppingIntent,
  ShoppingSessionDraft,
} from "../commerce/types";
import { ProductNotInSessionError } from "../errors";

export interface ShoppingOrchestratorDeps {
  /** Returns discovered candidates for the intent. Injected for testability. */
  discover: (intent: ShoppingIntent) => Promise<ProductCandidate[]>;
  /** Clock injection for deterministic timestamps. */
  now?: () => string;
}

export const DEFAULT_ORCHESTRATOR_DEPS: Partial<ShoppingOrchestratorDeps> = {};

/**
 * Run the full Part B pipeline for a parsed intent and return a session draft.
 * Invalid candidates are normalized-tested and moved to `rejectedCandidates`
 * (with a reason) rather than crashing the whole run.
 */
export async function executeShoppingRequest(
  intent: ShoppingIntent,
  deps: ShoppingOrchestratorDeps,
): Promise<ShoppingSessionDraft> {
  const candidates = await deps.discover(intent);

  const normalized: NormalizedProduct[] = [];
  const rejectedCandidates: Array<{ candidate: ProductCandidate; reason: string }> = [];
  for (const candidate of candidates) {
    try {
      normalized.push(normalizeProduct(candidate, { defaultCurrency: intent.currency }));
    } catch (error) {
      rejectedCandidates.push({
        candidate,
        reason: error instanceof Error ? error.message : "Normalization failed",
      });
    }
  }

  const { kept, filteredOut } = filterCandidates(normalized, intent);
  const ranked = rankProducts(kept, intent);
  const recommendations = generateRecommendations(ranked, kept);

  return {
    intent,
    candidates,
    normalized,
    rejectedCandidates,
    recommendations,
    filteredOut,
    createdAt: (deps.now ?? (() => new Date().toISOString()))(),
  };
}

/**
 * Build a purchase plan for a product the user explicitly selected. The product
 * must be one discovered in this session (Part B never allows selecting an
 * arbitrary, unreviewed product). This is the ONLY place a PurchasePlan is
 * created; it contains no payment instruction.
 */
export function selectProduct(
  session: ShoppingSessionDraft,
  productId: string,
): PurchasePlan {
  const product = session.normalized.find((p) => p.id === productId);
  if (!product) {
    throw new ProductNotInSessionError(
      `Product "${productId}" was not part of this shopping session.`,
      { available: session.normalized.map((p) => p.id) },
    );
  }
  const ranking = rankProduct(product, session.intent);
  return createPurchasePlan(product, ranking, session.intent);
}
