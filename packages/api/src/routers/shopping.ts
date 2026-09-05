import { z } from "zod";

import {
  getCandidatesForSession,
  getRecommendationsForSession,
  getShoppingSessionForUser,
  listSessionsForUser,
} from "@cartwright/db/repositories/shopping.repository";

import { protectedProcedure, router } from "../index";
import { generateCorrelationId } from "../audit/audit.service";
import { getLiveFrame } from "@cartwright/agent";
import {
  parseShoppingIntent,
  createShoppingSession,
  runShoppingSession,
  selectProductForSession,
} from "../shopping/shopping.service";

/**
 * Part B shopping router.
 *
 * `run` triggers discovery + ranking and persists a session. `select` is the
 * ONLY mutation that can lead to a real purchase — it builds a Part B purchase
 * plan and hands it to Part A's `createPurchaseTransaction` (the authoritative
 * financial gate). No router procedure here ever authorizes a payment directly.
 */
export const shoppingRouter = router({
  create: protectedProcedure
    .input(z.object({ query: z.string().min(3), idempotencyKey: z.string().min(1).optional() }))
    .mutation(({ ctx, input }) =>
      createShoppingSession({
        userId: ctx.session.user.id,
        query: input.query,
        idempotencyKey: input.idempotencyKey,
      }),
    ),

  parseIntent: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        store: z.string().min(1).optional(),
        browserMode: z.enum(["local", "browserbase"]).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return parseShoppingIntent({
        query: input.query,
        store: input.store,
        browserMode: input.browserMode,
      });
    }),

  run: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().min(1).optional().describe("Existing session ID to update in-place"),
        query: z.string().min(3).describe('e.g. "wireless headphones under $100"'),
        store: z.string().min(1).optional().describe('store preset or URL, e.g. "raven"'),
        /** Browser backend for the agent run: local Chrome (free) or Browserbase cloud. */
        browserMode: z.enum(["local", "browserbase"]).optional(),
        /** Client idempotency key; reused to dedupe repeated shopping requests. */
        idempotencyKey: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const correlationId = generateCorrelationId();
      return runShoppingSession({
        userId: ctx.session.user.id,
        sessionId: input.sessionId,
        query: input.query,
        store: input.store,
        browserMode: input.browserMode,
        idempotencyKey: input.idempotencyKey,
        correlationId,
      });
    }),

  /**
   * Live feed of the agent's browser for the CURRENT user. Returns the latest
   * JPEG frame captured from the browser the agent is driving (local Chrome or
   * Browserbase), or null when no run is active. The web UI polls this while a
   * search is in flight to show what the agent sees in real time.
   */
  liveFeed: protectedProcedure.query(({ ctx }) => {
    return { frame: getLiveFrame(ctx.session.user.id) ?? null };
  }),

  /**
   * List all stored shopping sessions for the authenticated user, ordered by
   * newest first. Gives the UI ChatGPT-style chat/session history by UUID.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await listSessionsForUser(ctx.session.user.id);
    return rows.map((s) => {
      const intent = s.intent as Record<string, unknown> | undefined;
      const selectedPlan = s.selectedPlan as Record<string, unknown> | undefined;
      const store =
        (typeof intent?.store === "string" && intent.store ? intent.store : undefined) ??
        (typeof selectedPlan?.merchant === "string" && selectedPlan.merchant ? selectedPlan.merchant : undefined) ??
        (Array.isArray(intent?.preferredMerchants) && typeof intent.preferredMerchants[0] === "string" ? intent.preferredMerchants[0] : undefined);
      return {
        sessionId: s.id,
        rawQuery: s.rawQuery,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        transactionId: s.transactionId,
        store,
      };
    });
  }),

  get: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const session = await getShoppingSessionForUser(
        input.sessionId,
        ctx.session.user.id,
      );
      if (!session) {
        return null;
      }
      const [candidateRows, recommendationRows] = await Promise.all([
        getCandidatesForSession(session.id),
        getRecommendationsForSession(session.id),
      ]);
      return {
        sessionId: session.id,
        status: session.status,
        rawQuery: session.rawQuery,
        intent: session.intent,
        selectedPlan: session.selectedPlan,
        transactionId: session.transactionId,
        createdAt: session.createdAt.toISOString(),
        candidates: candidateRows.map((r) => ({
          productId: r.productId,
          merchant: r.merchant,
          title: r.title,
          amountInMinor: r.amountInMinor,
          currency: r.currency,
          productUrl: r.productUrl,
          rating: r.rating,
          reviewCount: r.reviewCount,
          availability: r.availability,
          confidence: r.confidence,
          rankingScore: r.rankingScore,
          filteredOut: r.filteredOut,
          rejected: r.rejected,
          reason: r.reason,
        })),
        recommendations: recommendationRows.map((r) => ({
          productId: r.productId,
          rankingScore: r.rankingScore,
          rankingFactors: r.rankingFactors,
          explanation: r.explanation,
          isTop: r.isTop,
          selected: r.selected,
        })),
      };
    }),

  select: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        productId: z.string().min(1),
        paymentMode: z.enum(["merchant", "cartwright"]).optional(),
        /** Client idempotency key for the resulting purchase request. */
        idempotencyKey: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const correlationId = generateCorrelationId();
      return selectProductForSession({
        userId: ctx.session.user.id,
        sessionId: input.sessionId,
        productId: input.productId,
        paymentMode: input.paymentMode,
        idempotencyKey: input.idempotencyKey,
        correlationId,
      });
    }),
});
