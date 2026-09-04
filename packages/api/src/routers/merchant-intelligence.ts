import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
  getFunnel,
  getInsights,
  getProducts,
  getRecommendationPositions,
} from "../merchant-intelligence/merchant-intelligence.service";
import {
  createMerchantSite,
  removeMerchantSite,
  setPrimarySite,
} from "../merchant-intelligence/merchant-account.service";
import {
  cachedMerchantAccount,
  cachedMerchantOverview,
  invalidateMerchantCache,
} from "../trpc-cache";

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
  /** Account + overview reads go through the server cache (see trpc-cache.ts). */
  getAccount: protectedProcedure.query(async ({ ctx }) => {
    return cachedMerchantAccount(ctx.session.user.id, ctx.session.user.name);
  }),

  createSite: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await createMerchantSite(ctx.session.user.id);
    // New storefront must appear immediately on every merchant page.
    await invalidateMerchantCache(ctx.session.user.id);
    return result;
  }),

  setPrimarySite: protectedProcedure
    .input(z.object({ siteId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await setPrimarySite(ctx.session.user.id, input.siteId);
      await invalidateMerchantCache(ctx.session.user.id);
      return result;
    }),

  removeSite: protectedProcedure
    .input(z.object({ siteId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await removeMerchantSite(ctx.session.user.id, input.siteId);
      await invalidateMerchantCache(ctx.session.user.id);
      return result;
    }),

  overview: protectedProcedure
    .input(z.object({ window: timeWindowInput }).optional())
    .query(async ({ ctx, input }) => {
      return cachedMerchantOverview(ctx.session.user.id, input?.window);
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
