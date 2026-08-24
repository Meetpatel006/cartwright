import { z } from "zod";

import { getCandidatesForSession } from "@cartwright/db/repositories/shopping.repository";

import { protectedProcedure, router } from "../index";
import {
  getReachableShoppingSession,
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
  run: protectedProcedure
    .input(
      z.object({
        query: z.string().min(3).describe('e.g. "wireless headphones under $100"'),
        store: z.string().min(1).optional().describe('store preset or URL, e.g. "raven"'),
        /** Client idempotency key; reused to dedupe repeated shopping requests. */
        idempotencyKey: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return runShoppingSession({
        userId: ctx.session.user.id,
        query: input.query,
        store: input.store,
        idempotencyKey: input.idempotencyKey,
      });
    }),

  get: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const session = await getReachableShoppingSession(
        input.sessionId,
        ctx.session.user.id,
      );
      if (!session) {
        return null;
      }
      const candidateRows = await getCandidatesForSession(session.id);
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
          availability: r.availability,
          confidence: r.confidence,
          filteredOut: r.filteredOut,
          rejected: r.rejected,
          reason: r.reason,
        })),
      };
    }),

  select: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        productId: z.string().min(1),
        /** Client idempotency key for the resulting purchase request. */
        idempotencyKey: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return selectProductForSession({
        userId: ctx.session.user.id,
        sessionId: input.sessionId,
        productId: input.productId,
        idempotencyKey: input.idempotencyKey,
      });
    }),
});
