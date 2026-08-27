/**
 * Part B shopping service (API side).
 *
 * Orchestrates the agent's commerce-intelligence pipeline, persists the session
 * + ranked candidates + recommendations to Postgres, and — only on explicit
 * user selection — hands the chosen product to Part A's `createPurchaseTransaction`
 * (the authoritative financial gate). The service never bypasses that gate and
 * never creates a payment itself.
 *
 * Discovery (`discoverProducts`) is injected so the service is testable without
 * launching a browser; the default uses the real agent.
 */

import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  type Availability,
  type NormalizedProduct,
  NoProductsFoundError,
  type ProductCandidate,
  type Recommendation,
  ShoppingError,
  type ShoppingIntent,
  type ShoppingSessionDraft,
  type SupportedCurrency,
  discoverProducts,
  executeShoppingRequest,
  fulfillSelection,
  getSessionCheckoutTotal,
  parseShoppingRequest,
  selectProduct,
  splitStoreInput,
  type ShoppingOrchestratorDeps,
} from "@cartwright/agent";

import { env } from "@cartwright/env/server";
import {
  expireShoppingSession,
  findSessionByIdempotency,
  getCandidatesForSession,
  getShoppingSessionById,
  getRecommendationsForSession,
  getShoppingSessionForUser,
  insertProductCandidates,
  insertRecommendations,
  insertShoppingSession,
  insertShoppingSessionIdempotent,
  listExpiredActiveShoppingSessions,
  updateShoppingSession,
} from "@cartwright/db/repositories/shopping.repository";
import {
  assertExpireShoppingSession,
  assertShoppingSessionTransition,
  canExpireShoppingSession,
  canTransitionShoppingSession,
} from "./shopping-session.state";
import {
  cleanupBrowserSessionsForShoppingSession,
  getOwnedBrowserSession,
  type BrowserSessionCloseAdapter,
} from "./browser-session.service";
import { resolveAuthoritativeAmount } from "../payments/amount-authority";
import type {
  NewProductCandidateRow,
  NewRecommendationRow,
  ProductCandidateRow,
  RecommendationRow,
  ShoppingSessionRow,
} from "@cartwright/db/schema";

import { createPurchaseTransaction } from "../transactions/transaction.service";
import { createBrowserSession } from "./browser-session.service";
import { recordAuditEvent } from "../audit/audit.service";
import type { ShoppingSessionView, SelectProductOutput } from "./shopping.types";

function resolveAgentBrowserMode(): "local" | "browserbase" {
  if (env.SHOPPING_AGENT_BROWSER) return env.SHOPPING_AGENT_BROWSER;
  return env.NODE_ENV === "production" ? "browserbase" : "local";
}

function buildLlm(mode: "local" | "browserbase") {
  if (
    mode === "local" &&
    env.AGENT_LLM_BASE_URL &&
    env.AGENT_LLM_MODEL
  ) {
    return {
      baseURL: env.AGENT_LLM_BASE_URL,
      model: env.AGENT_LLM_MODEL,
      apiKey: env.AGENT_LLM_API_KEY,
      ...(env.AGENT_LLM_API_KEY_FALLBACK && {
        apiKeys: [env.AGENT_LLM_API_KEY, env.AGENT_LLM_API_KEY_FALLBACK].filter(
          Boolean,
        ) as string[],
      }),
      ...(env.AGENT_LLM_REASONING_EFFORT && {
        reasoningEffort: env.AGENT_LLM_REASONING_EFFORT,
      }),
      ...(env.AGENT_LLM_RESPONSE_FORMAT && {
        responseFormatMode: env.AGENT_LLM_RESPONSE_FORMAT,
      }),
      debug: env.AGENT_DEBUG !== undefined,
    };
  }
  return undefined;
}

function candidateRowFromProduct(
  product: NormalizedProduct,
  sessionId: string,
  rankingScore: number | null,
  rankingFactors: unknown,
): NewProductCandidateRow {
  return {
    sessionId,
    productId: product.id,
    merchant: product.merchant,
    title: product.canonicalTitle,
    amountInMinor: product.amountInMinor,
    currency: product.currency,
    productUrl: product.productUrl,
    availability: product.availability,
    confidence: product.confidence,
    source: product.merchant,
    rankingScore,
    rankingFactors,
    filteredOut: false,
    rejected: false,
    reason: null,
  };
}

function rowToNormalizedProduct(row: {
  productId: string;
  merchant: string | null;
  title: string;
  amountInMinor: number;
  currency: string;
  productUrl: string | null;
  availability: string | null;
  confidence: number | null;
}): NormalizedProduct {
  return {
    id: row.productId,
    merchant: row.merchant ?? "",
    canonicalTitle: row.title,
    amountInMinor: row.amountInMinor,
    currency: row.currency as SupportedCurrency,
    productUrl: row.productUrl,
    availability: (row.availability as Availability) ?? "unknown",
    confidence: row.confidence ?? 1,
    attributes: {},
    confidenceReasons: [],
  };
}

function buildRecommendationsFromDb(
  recommendationRows: RecommendationRow[],
  candidateRows: ProductCandidateRow[],
): Recommendation[] {
  const byProductId = new Map(
    candidateRows
      .filter((r) => !r.filteredOut && !r.rejected)
      .map((r) => [r.productId, r]),
  );
  return recommendationRows.map((r) => {
    const candidate = byProductId.get(r.productId);
    let product: NormalizedProduct;
    if (candidate) {
      product = rowToNormalizedProduct({
        productId: candidate.productId,
        merchant: candidate.merchant,
        title: candidate.title,
        amountInMinor: candidate.amountInMinor,
        currency: candidate.currency,
        productUrl: candidate.productUrl,
        availability: candidate.availability,
        confidence: candidate.confidence,
      });
    } else {
      product = {
        id: r.productId,
        merchant: "",
        canonicalTitle: r.productId,
        amountInMinor: 0,
        currency: "USD",
        productUrl: null,
        availability: "unknown",
        confidence: 1,
        attributes: {},
        confidenceReasons: [],
      };
    }
    return {
      product,
      rankingScore: r.rankingScore,
      rankingFactors: r.rankingFactors as never,
      explanation: r.explanation,
      isTopRecommendation: r.isTop,
    };
  });
}

function mapSessionToView(
  session: ShoppingSessionRow,
  recommendations: Recommendation[],
): ShoppingSessionView {
  return {
    sessionId: session.id,
    status: session.status,
    rawQuery: session.rawQuery,
    intent: session.intent as unknown as ShoppingIntent,
    recommendations,
    createdAt: session.createdAt.toISOString(),
  };
}

export interface ShoppingServiceDeps {
  /** Injected discovery for tests; defaults to the real agent. */
  discover?: (intent: ShoppingIntent) => Promise<ProductCandidate[]>;
  /**
   * Injected independent checkout-total reader for tests; defaults to the real
   * agent's `getSessionCheckoutTotal`. Used at selection time to make the
   * charged amount server-authoritative instead of trusting the discovery
   * price (Task 2).
   */
  readLiveCheckoutTotal?: (
    providerSessionId: string,
  ) => Promise<{ amountInMinor: number; currency: string } | null>;
  /**
   * Injected selection-driven add-to-cart for tests; defaults to the real
   * agent's `fulfillSelection`. Drives the retained browser session to the
   * human-selected product and adds ONLY that item (human-in-the-loop rule:
   * "only the chosen items are added"). Best-effort — a missing/expired session
   * degrades to a no-op so the purchase transaction is still created.
   */
  fulfillSelection?: (
    providerSessionId: string,
    productUrl: string,
    options: {
      proceedToCheckout: boolean;
      providerSessionId: string;
      provider?: string;
      browserbaseApiKey?: string;
    },
  ) => Promise<{ driven: boolean; reason?: string; checkout?: unknown }>;
}

/**
 * Run discovery + ranking for a query and persist the session. Idempotent per
 * (user, idempotencyKey): a repeated key returns the original session.
 */
export async function runShoppingSession(
  input: {
    userId: string;
    query: string;
    store?: string;
    /** Browser backend for this run. When omitted, falls back to
     *  SHOPPING_AGENT_BROWSER, then auto: "local" in dev, "browserbase" in prod. */
    browserMode?: "local" | "browserbase";
    idempotencyKey?: string;
    correlationId?: string;
  },
  deps: ShoppingServiceDeps = {},
): Promise<ShoppingSessionView> {
  if (input.idempotencyKey) {
    const existing = await findSessionByIdempotency(
      input.userId,
      input.idempotencyKey,
    );
    if (existing) {
      const recommendationRows = await getRecommendationsForSession(existing.id);
      const candidateRows = await getCandidatesForSession(existing.id);
      const recommendations = buildRecommendationsFromDb(
        recommendationRows,
        candidateRows,
      );
      return mapSessionToView(existing, recommendations);
    }
  }

  // Hardcoded INR: the product is India-only and stores (incl. amazon.com from
  // an India-geo session) display rupee prices, so budgets must parse as INR.
  const defaultCurrency = "INR";
  const intent = parseShoppingRequest({
    query: input.query,
    store: input.store,
    defaultCurrency,
    fallbackBudgetInMinor: null,
  });

  const mode = input.browserMode ?? resolveAgentBrowserMode();
  const stores = splitStoreInput(input.store);
  const discoveryState: { sessionId?: string; providerSessionId?: string } = {};

  const orchestratorDeps: ShoppingOrchestratorDeps = {
    discover:
      deps.discover ??
      (async (it) => {
        const { candidates, raw } = await discoverProducts({
          query: it.rawQuery,
          store: input.store,
          stores,
          budgetInMinor: it.budgetInMinor,
          currency: it.currency,
          mode,
          browserbaseApiKey:
            mode === "browserbase" ? env.BROWSERBASE_API_KEY : undefined,
          llm: buildLlm(mode),
          recordSession: true,
          liveFeedKey: input.userId,
        });
        discoveryState.sessionId = raw.sessionId;
        discoveryState.providerSessionId = raw.providerSessionId;
        return candidates;
      }),
  };

  let draft;
  try {
    draft = await executeShoppingRequest(intent, orchestratorDeps);
  } catch (error) {
    await recordAuditEvent({
      eventType: "DISCOVERY_FAILED",
      userId: input.userId,
      correlationId: input.correlationId,
      reason: error instanceof Error ? error.message : "Discovery failed",
      outcome: "FAILURE",
      failureClassification: "BROWSER_OPERATION_FAILED",
      metadata: { query: input.query, store: input.store ?? null },
    });
    // Surface typed agent failures as readable client errors instead of an
    // opaque 500. "No products found" is a normal outcome (e.g. the store
    // doesn't stock the requested item, or extraction came back empty), so it
    // maps to 422; other agent/browser failures keep the error message but use
    // BAD_GATEWAY so clients can distinguish them from request problems.
    if (error instanceof NoProductsFoundError) {
      throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: error.message });
    }
    if (error instanceof ShoppingError) {
      throw new TRPCError({ code: "BAD_GATEWAY", message: error.message });
    }
    throw error;
  }

  await recordAuditEvent({
    eventType: "DISCOVERY_COMPLETED",
    userId: input.userId,
    correlationId: input.correlationId,
    outcome: "SUCCESS",
    metadata: {
      candidateCount: draft.normalized.length,
      recommendationCount: draft.recommendations.length,
      filteredCount: draft.filteredOut.length,
      rejectedCount: draft.rejectedCandidates.length,
    },
  });

  const idempotencyKey = input.idempotencyKey;
  let session: ShoppingSessionRow;
  let isNewSession = true;

  // Shopping sessions are selectable only within a bounded window; past it the
  // session (and any retained browser) is lazily expired by the cleanup sweep.
  const sessionExpiry = new Date(
    Date.now() + env.SHOPPING_SESSION_TTL_MINUTES * 60_000,
  );

  if (idempotencyKey) {
    // DB-level idempotency: the unique index on (user_id, idempotency_key)
    // makes concurrent inserts of the same key deterministic — exactly one
    // session is created and the rest resolve to the canonical row.
    const result = await insertShoppingSessionIdempotent({
      userId: input.userId,
      rawQuery: intent.rawQuery,
      intent: intent as unknown as Record<string, unknown>,
      idempotencyKey,
      checkoutSessionId: discoveryState.sessionId,
      expiresAt: sessionExpiry,
    });
    session = result.session;
    isNewSession = result.created;
  } else {
    session = await insertShoppingSession({
      userId: input.userId,
      rawQuery: intent.rawQuery,
      intent: intent as unknown as Record<string, unknown>,
      status: "created",
      checkoutSessionId: discoveryState.sessionId,
      expiresAt: sessionExpiry,
    });
  }

  // Concurrent race: another request with the same key already owns this
  // session id. Do not re-persist candidates/recommendations against the
  // shared id; return the canonical existing session instead.
  if (idempotencyKey && !isNewSession) {
    const recommendationRows = await getRecommendationsForSession(session.id);
    const candidateRows = await getCandidatesForSession(session.id);
    const recommendations = buildRecommendationsFromDb(
      recommendationRows,
      candidateRows,
    );
    return mapSessionToView(session, recommendations);
  }

  const filteredIds = new Set(draft.filteredOut.map((f) => f.productId));
  const recommendationByProduct = new Map(
    draft.recommendations.map((r) => [r.product.id, r]),
  );

  const candidateRows: NewProductCandidateRow[] = draft.normalized.map((p) => {
    const rec = recommendationByProduct.get(p.id);
    const isFiltered = filteredIds.has(p.id);
    const row = candidateRowFromProduct(
      p,
      session.id,
      rec?.rankingScore ?? null,
      rec?.rankingFactors ?? null,
    );
    if (isFiltered) {
      const reason = draft.filteredOut.find((f) => f.productId === p.id)?.reason;
      row.filteredOut = true;
      row.reason = reason ?? "Filtered by pre-ranking rules";
    }
    return row;
  });

  const rejectedRows: NewProductCandidateRow[] = draft.rejectedCandidates.map(
    (r) => ({
      sessionId: session.id,
      productId: `rejected-${session.id}-${r.candidate.title}`,
      merchant: r.candidate.merchant,
      title: r.candidate.title,
      amountInMinor: 0,
      currency: r.candidate.currency ?? defaultCurrency,
      productUrl: r.candidate.productUrl,
      availability: null,
      confidence: 0,
      source: r.candidate.source ?? null,
      rankingScore: null,
      rankingFactors: null,
      filteredOut: false,
      rejected: true,
      reason: r.reason,
    }),
  );

  await insertProductCandidates([...candidateRows, ...rejectedRows]);

  const recommendationRows: NewRecommendationRow[] = draft.recommendations.map(
    (r) => ({
      sessionId: session.id,
      productId: r.product.id,
      rankingScore: r.rankingScore,
      rankingFactors: r.rankingFactors as unknown,
      explanation: r.explanation,
      isTop: r.isTopRecommendation,
      selected: false,
    }),
  );
  await insertRecommendations(recommendationRows);
  // Centralized lifecycle: created -> recommended. The machine is the single
  // authority; the repository only persists the validated status.
  assertShoppingSessionTransition(session.status, "recommended");
  await updateShoppingSession(session.id, { status: "recommended" });

  // Persist the retained browser session as a durable, owned record. The
  // shopping session's `checkoutSessionId` points at THIS record (the
  // lifecycle/ownership authority), not the raw provider handle.
  if (discoveryState.sessionId) {
    const ttlMs = env.BROWSER_SESSION_TTL_MINUTES * 60_000;
    const browserSession = await createBrowserSession({
      ownerUserId: input.userId,
      provider: mode,
      providerSessionId: discoveryState.providerSessionId ?? discoveryState.sessionId,
      shoppingSessionId: session.id,
      expiresAt: new Date(Date.now() + ttlMs),
    });
    await updateShoppingSession(session.id, {
      checkoutSessionId: browserSession.id,
    });
    await recordAuditEvent({
      eventType: "BROWSER_SESSION_CREATED",
      userId: input.userId,
      correlationId: input.correlationId,
      shoppingSessionId: session.id,
      outcome: "SUCCESS",
      metadata: { provider: mode, browserSessionId: browserSession.id },
    });
  }

  const persisted = await getShoppingSessionById(session.id);

  await recordAuditEvent({
    eventType: "SHOPPING_SESSION_CREATED",
    userId: input.userId,
    correlationId: input.correlationId,
    shoppingSessionId: session.id,
    resultingState: "recommended",
    outcome: "SUCCESS",
    metadata: {
      rawQuery: input.query,
      store: input.store ?? null,
      candidateCount: draft.normalized.length,
      recommendationCount: draft.recommendations.length,
    },
  });

  return mapSessionToView(persisted ?? session, draft.recommendations);
}

/**
 * Read a shopping session for display, hiding expired sessions so they become
 * unreachable (the client sees `null`, as if it never existed). Ownership is
 * still enforced by the repository query.
 *
 * The TTL is enforced here too: a session whose `expiresAt` has elapsed is
 * lazily expired (and its retained browser cleaned up) even if the background
 * sweep has not ticked, so expiry never depends on the scheduler alone.
 */
export async function getReachableShoppingSession(
  sessionId: string,
  userId: string,
): Promise<ShoppingSessionRow | undefined> {
  const session = await getShoppingSessionForUser(sessionId, userId);
  if (!session) return undefined;
  if (session.status === "expired") return undefined;

  if (
    session.expiresAt &&
    session.expiresAt.getTime() <= Date.now() &&
    canExpireShoppingSession(session.status)
  ) {
    const previousStatus = session.status;
    await expireShoppingSession(session.id);
    await cleanupBrowserSessionsForShoppingSession(session.id);
    await recordAuditEvent({
      eventType: "SHOPPING_SESSION_EXPIRED",
      userId,
      shoppingSessionId: session.id,
      previousState: previousStatus,
      resultingState: "expired",
      outcome: "SUCCESS",
    });
    return undefined;
  }

  return session;
}

/**
 * Lazily expire shopping sessions that have passed their `expiresAt` and are
 * still actionable (`created` / `recommended` / `selected`). Each expired
 * session also triggers cleanup of its retained browser session(s). Driven by
 * the scheduler (see `cleanup-scheduler.ts`). Idempotent: already-expired or
 * terminal (`converted`) rows are never touched.
 */
export async function cleanupExpiredShoppingSessions(
  now: Date = new Date(),
  opts: { closeProvider?: BrowserSessionCloseAdapter } = {},
): Promise<number> {
  const expired = await listExpiredActiveShoppingSessions(now);
  let expiredCount = 0;
  for (const session of expired) {
    // Validate the transition through the centralized machine before writing.
    const previousStatus = session.status;
    assertExpireShoppingSession(session.status);
    await expireShoppingSession(session.id);
    await cleanupBrowserSessionsForShoppingSession(session.id, opts);
    await recordAuditEvent({
      eventType: "SHOPPING_SESSION_EXPIRED",
      userId: session.userId,
      shoppingSessionId: session.id,
      previousState: previousStatus,
      resultingState: "expired",
      outcome: "SUCCESS",
    });
    expiredCount += 1;
  }
  return expiredCount;
}

/**
 * Explicitly select a product from a session. Rebuilds a minimal draft from the
 * persisted candidates (filtered/rejected rows are excluded, so a user can only
 * select a product that actually passed the soft filters), builds the Part B
 * PurchasePlan, then hands it to Part A's transaction gate.
 */
export async function selectProductForSession(
  input: {
    userId: string;
    sessionId: string;
    productId: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
  deps: ShoppingServiceDeps = {},
): Promise<SelectProductOutput> {
  let session = await getShoppingSessionForUser(input.sessionId, input.userId);
  if (!session) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Shopping session not found.",
    });
  }

  // Enforce the TTL at selection time, not just in the background sweep: a
  // session whose `expiresAt` has elapsed is lazily expired here and rejected,
  // even if the cleanup scheduler has not ticked yet.
  if (
    session.expiresAt &&
    session.expiresAt.getTime() <= Date.now() &&
    canExpireShoppingSession(session.status)
  ) {
    await expireShoppingSession(session.id);
    await cleanupBrowserSessionsForShoppingSession(session.id);
    // Reflect the new status locally so the lifecycle guard below rejects the
    // selection with the correct user-facing "expired" error.
    session = { ...session, status: "expired" };
  }

  // Centralized lifecycle guard: only a `recommended` session may be selected.
  // `converted`/`expired` (and any other non-selectable state) are rejected by
  // the state machine, with the original user-facing messages preserved.
  if (!canTransitionShoppingSession(session.status, "selected")) {      await recordAuditEvent({
        eventType: "PRODUCT_SELECTED",
        userId: input.userId,
        correlationId: input.correlationId,
        shoppingSessionId: session.id,
        previousState: session.status,
        outcome: "FAILURE",
        failureClassification: session.status === "expired" ? "SESSION_EXPIRED" : "INVALID_STATE_TRANSITION",
        reason: session.status === "converted"
          ? "Session already converted"
          : `Session in non-selectable state: ${session.status}`,
      });
    const message =
      session.status === "converted"
        ? "This shopping session has already been converted to a purchase."
        : session.status === "expired"
          ? "This shopping session has expired and can no longer be used."
          : "This shopping session is not in a selectable state.";
    throw new TRPCError({
      code: session.status === "converted" ? "CONFLICT" : "PRECONDITION_FAILED",
      message,
    });
  }

  const candidateRows = await getCandidatesForSession(session.id);
  const normalized = candidateRows
    .filter((r) => !r.filteredOut && !r.rejected)
    .map((r) =>
      rowToNormalizedProduct({
        productId: r.productId,
        merchant: r.merchant,
        title: r.title,
        amountInMinor: r.amountInMinor,
        currency: r.currency,
        productUrl: r.productUrl,
        availability: r.availability,
        confidence: r.confidence,
      }),
    );

  const draft: ShoppingSessionDraft = {
    intent: session.intent as unknown as ShoppingIntent,
    candidates: [],
    normalized,
    rejectedCandidates: [],
    recommendations: [],
    filteredOut: [],
    createdAt: session.createdAt.toISOString(),
  };

  const plan = selectProduct(draft, input.productId);

  // ── Selection-gated add-to-cart (human-in-the-loop) ───────────────────────
  // Discovery (`shop`) deliberately did NOT add anything to the cart — it only
  // retained the browser session at the search-results page. Now that the human
  // has explicitly chosen a product, drive that retained session to the selected
  // product and add ONLY it to the cart. This enforces the rule "only the
  // matching items are added" and ensures the live checkout-total re-read below
  // reflects the chosen product (not a cheaper auto-pick). Best-effort: a
  // missing/expired session is not fatal — the policy engine still gates the
  // provisional discovered amount. The outcome is folded into the PRODUCT_SELECTED
  // audit event below so no new audit-event type is required.
  let selectionAddToCart: { driven: boolean; status?: string; reason?: string } | undefined;
  if (session.checkoutSessionId && plan.productUrl) {
    try {
      const ownedSession = await getOwnedBrowserSession(session.checkoutSessionId, input.userId);
      const fulfill = deps.fulfillSelection ?? fulfillSelection;
      const r = await fulfill(ownedSession.providerSessionId, plan.productUrl, {
        proceedToCheckout: true,
        providerSessionId: ownedSession.providerSessionId,
        provider: ownedSession.provider,
        browserbaseApiKey: env.BROWSERBASE_API_KEY,
      });
      selectionAddToCart = {
        driven: r.driven,
        status: (r.checkout as { status?: string } | undefined)?.status,
        reason: r.reason,
      };
      if (!r.driven) {
        console.warn(
          `[shopping] selection add-to-cart not driven on retained session: ${r.reason ?? "unknown"}`,
        );
      }
    } catch (error) {
      // Selection add is best-effort: never block the purchase transaction.
      selectionAddToCart = {
        driven: false,
        reason: error instanceof Error ? error.message : "unknown error",
      };
      console.warn(
        `[shopping] selection add-to-cart failed (falling back to provisional amount): ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  // ── Amount authority (Task 2) ──────────────────────────────────────────────
  // `plan.expectedAmountInMinor` is PROVISIONAL (LLM/browser-extracted during
  // discovery). If the session retained a browser, independently re-read the
  // REAL checkout total server-side and let the verified amount replace the
  // discovered one before it reaches the financial gate. A currency switch is
  // a hard block — amounts are never compared across currencies.
  let chargedAmountInMinor = plan.expectedAmountInMinor;
  let chargedCurrency = plan.currency;
  if (session.checkoutSessionId) {
    try {
      const browserSession = await getOwnedBrowserSession(
        session.checkoutSessionId,
        input.userId,
      );
      const read = deps.readLiveCheckoutTotal ?? getSessionCheckoutTotal;
      const live = await read(browserSession.providerSessionId);
      const resolved = resolveAuthoritativeAmount({
        expectedAmountInMinor: plan.expectedAmountInMinor,
        expectedCurrency: plan.currency,
        live,
      });
      if (resolved.blockedReason) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: resolved.blockedReason,
        });
      }
      chargedAmountInMinor = resolved.amountInMinor;
      chargedCurrency = resolved.currency;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      // Live checkout unreadable / session unavailable → fall back to the
      // provisional discovered amount; the policy engine still gates it.
    }
  }

  // Record the authoritative amount resolution for the audit trail.
  if (session.checkoutSessionId) {
    await recordAuditEvent({
      eventType: "AUTHORITATIVE_AMOUNT_RESOLVED",
      userId: input.userId,
      correlationId: input.correlationId,
      shoppingSessionId: session.id,
      metadata: {
        discoveredAmount: plan.expectedAmountInMinor,
        chargedAmountInMinor,
        source: chargedAmountInMinor !== plan.expectedAmountInMinor ? "verified" : "provisional",
      },
    });
  }

  assertShoppingSessionTransition(session.status, "selected");
  await updateShoppingSession(session.id, {
    status: "selected",
    selectedPlan: plan as unknown as Record<string, unknown>,
  });

  const purchase = await createPurchaseTransaction({
    userId: input.userId,
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
    merchantName: plan.merchant,
    amountInMinor: chargedAmountInMinor,
    currency: chargedCurrency,
    browserSessionId: session.checkoutSessionId ?? undefined,
    correlationId: input.correlationId,
  });

  // Centralized lifecycle: selected -> converted (handed to Part A's gate).
  assertShoppingSessionTransition("selected", "converted");
  await updateShoppingSession(session.id, {
    status: "converted",
    transactionId: purchase.transactionId,
  });

  await recordAuditEvent({
    eventType: "PRODUCT_SELECTED",
    userId: input.userId,
    correlationId: input.correlationId,
    shoppingSessionId: session.id,
    transactionId: purchase.transactionId,
    resultingState: "converted",
    outcome: "SUCCESS",
    metadata: {
      productId: input.productId,
      transactionId: purchase.transactionId,
      chargedAmountInMinor,
      chargedCurrency,
      // Human-in-the-loop traceability: which item actually landed in the cart.
      selectionAddToCart: selectionAddToCart ?? null,
    },
  });

  return { plan, purchase };
}
