import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
  getFunnel,
  getInsights,
  getOverview,
  getProducts,
  getRecommendationPositions,
} from "../merchant-intelligence/merchant-intelligence.service";
import {
  createMerchantSite,
  getOrCreateMerchantAccount,
  setPrimarySite,
} from "../merchant-intelligence/merchant-account.service";

/**
 * Part C — Merchant Growth & Commerce Intelligence.
 *
 * Read-only analytics over the authenticated user's own shopping/purchase
 * data (Part A/B). Every procedure is `protectedProcedure` and always scopes
 * queries to `ctx.session.user.id` — the client can never pass a `userId` or
 * `merchantId` to read someone else's intelligence.
 */
const timeWindowInput = z
  .union([
    z.object({ preset: z.enum(["24h", "7d", "30d"]) }),
    z.object({ start: z.string().min(1), end: z.string().min(1) }),
  ])
  .optional();

export const merchantIntelligenceRouter = router({
  getAccount: protectedProcedure.query(async ({ ctx }) => {
    return getOrCreateMerchantAccount(ctx.session.user.id, ctx.session.user.name);
  }),

  createSite: protectedProcedure.mutation(async ({ ctx }) => {
    return createMerchantSite(ctx.session.user.id);
  }),

  setPrimarySite: protectedProcedure
    .input(z.object({ siteId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return setPrimarySite(ctx.session.user.id, input.siteId);
    }),

  overview: protectedProcedure
    .input(z.object({ window: timeWindowInput }).optional())
    .query(async ({ ctx, input }) => {
      return getOverview(ctx.session.user.id, input?.window);
    }),

  funnel: protectedProcedure
    .input(z.object({ window: timeWindowInput }).optional())
    .query(async ({ ctx, input }) => {
      return getFunnel(ctx.session.user.id, input?.window);
    }),

  products: protectedProcedure
    .input(z.object({ window: timeWindowInput }).optional())
    .query(async ({ ctx, input }) => {
      return getProducts(ctx.session.user.id, input?.window);
    }),

  recommendationPositions: protectedProcedure
    .input(z.object({ window: timeWindowInput }).optional())
    .query(async ({ ctx, input }) => {
      return getRecommendationPositions(ctx.session.user.id, input?.window);
    }),

  insights: protectedProcedure
    .input(z.object({ window: timeWindowInput }).optional())
    .query(async ({ ctx, input }) => {
      return getInsights(ctx.session.user.id, input?.window);
    }),
});
