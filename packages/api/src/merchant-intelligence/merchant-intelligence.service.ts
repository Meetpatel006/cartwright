/**
 * Part C orchestration: validates the time window, reads through the
 * read-only repository, computes deterministic metrics, and generates
 * explainable insights.
 *
 * This module is READ-ONLY with respect to commerce state. It has no import
 * of `transaction.service`'s mutating exports, no import of
 * `payment-policy.service`, no import of Razorpay client code, and never
 * calls `createPurchaseTransaction` or any transaction-mutating function.
 * Ownership is enforced by always querying with the caller's own `userId` —
 * this module never accepts a `userId`/`merchantId` to scope a query to
 * someone else's data; the router only ever passes `ctx.session.user.id`.
 */

import { TRPCError } from "@trpc/server";

import {
  countDiscovered,
  countRecommended,
  getProductPerformance,
  getRecommendationPositionPerformance,
  getSessionFunnelCounts,
} from "@cartwright/db/repositories/merchant-intelligence.repository";

import {
  buildFunnelCounts,
  computeFunnelMetrics,
  computeProductPerformance,
  computeRecommendationPositionPerformance,
} from "./merchant-intelligence.metrics";
import { generateInsights } from "./merchant-intelligence.insights";
import type {
  FunnelMetrics,
  MerchantIntelligenceOverview,
  MerchantInsight,
  ProductPerformance,
  RecommendationPositionPerformance,
  TimeWindow,
  TimeWindowInput,
} from "./merchant-intelligence.types";

/** Maximum span of a custom time window, to bound query cost. */
export const MAX_WINDOW_DAYS = 180;

const PRESET_TO_MS: Record<"24h" | "7d" | "30d", number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/**
 * Resolves and validates a client-supplied time window into concrete UTC
 * bounds. Defaults to the last 7 days when nothing is supplied. Always
 * enforces `start < end` and a maximum span of `MAX_WINDOW_DAYS`.
 */
export function resolveTimeWindow(input?: TimeWindowInput | null): TimeWindow {
  const now = new Date();

  if (!input || (typeof input === "object" && "preset" in input && !input.preset)) {
    return { start: new Date(now.getTime() - PRESET_TO_MS["7d"]), end: now };
  }

  if ("preset" in input) {
    return { start: new Date(now.getTime() - PRESET_TO_MS[input.preset]), end: now };
  }

  const start = new Date(input.start);
  const end = new Date(input.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid time window dates." });
  }
  if (start >= end) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Time window start must be before end.",
    });
  }
  const spanMs = end.getTime() - start.getTime();
  if (spanMs > MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Time window cannot exceed ${MAX_WINDOW_DAYS} days.`,
    });
  }
  return { start, end };
}

export async function getFunnel(userId: string, windowInput?: TimeWindowInput | null): Promise<FunnelMetrics> {
  const timeWindow = resolveTimeWindow(windowInput);
  const [raw, discovered, recommended] = await Promise.all([
    getSessionFunnelCounts(userId, timeWindow),
    countDiscovered(userId, timeWindow),
    countRecommended(userId, timeWindow),
  ]);
  const counts = buildFunnelCounts(raw, discovered, recommended);
  return computeFunnelMetrics(counts, timeWindow);
}

export async function getProducts(
  userId: string,
  windowInput?: TimeWindowInput | null,
): Promise<{ timeWindow: TimeWindow; products: ProductPerformance[] }> {
  const timeWindow = resolveTimeWindow(windowInput);
  const raw = await getProductPerformance(userId, timeWindow);
  return { timeWindow, products: computeProductPerformance(raw) };
}

export async function getRecommendationPositions(
  userId: string,
  windowInput?: TimeWindowInput | null,
): Promise<{ timeWindow: TimeWindow; positions: RecommendationPositionPerformance[] }> {
  const timeWindow = resolveTimeWindow(windowInput);
  const raw = await getRecommendationPositionPerformance(userId, timeWindow);
  return { timeWindow, positions: computeRecommendationPositionPerformance(raw) };
}

export async function getInsights(
  userId: string,
  windowInput?: TimeWindowInput | null,
): Promise<{ timeWindow: TimeWindow; insights: MerchantInsight[] }> {
  const timeWindow = resolveTimeWindow(windowInput);
  const [rawProducts, rawPositions] = await Promise.all([
    getProductPerformance(userId, timeWindow),
    getRecommendationPositionPerformance(userId, timeWindow),
  ]);
  const products = computeProductPerformance(rawProducts);
  const recommendationPositions = computeRecommendationPositionPerformance(rawPositions);
  const insights = generateInsights({ products, recommendationPositions, timeWindow });
  return { timeWindow, insights };
}

export async function getOverview(
  userId: string,
  windowInput?: TimeWindowInput | null,
): Promise<MerchantIntelligenceOverview> {
  const timeWindow = resolveTimeWindow(windowInput);
  const [raw, discovered, recommended, rawProducts, rawPositions] = await Promise.all([
    getSessionFunnelCounts(userId, timeWindow),
    countDiscovered(userId, timeWindow),
    countRecommended(userId, timeWindow),
    getProductPerformance(userId, timeWindow),
    getRecommendationPositionPerformance(userId, timeWindow),
  ]);

  const funnel = computeFunnelMetrics(buildFunnelCounts(raw, discovered, recommended), timeWindow);
  const products = computeProductPerformance(rawProducts);
  const recommendationPositions = computeRecommendationPositionPerformance(rawPositions);
  const insights = generateInsights({ products, recommendationPositions, timeWindow });

  const topProducts = [...products]
    .sort((a, b) => b.timesRecommended - a.timesRecommended)
    .slice(0, 10);

  return { timeWindow, funnel, topProducts, insights };
}
