/**
 * Read-only aggregation queries backing Part C (Merchant Growth & Commerce
 * Intelligence). Every query is scoped by `userId` and a bounded
 * `[start, end)` time window on `shopping_sessions.created_at` — there is no
 * unbounded "since the beginning of time" query in this module.
 *
 * This file issues SELECT statements only. It never inserts, updates, or
 * deletes a row in `transactions`, `spending_reservations`, or
 * `payment_policies` — Part C must never be able to mutate money state.
 */

import { and, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "../index";
import {
  productCandidates,
  recommendations,
  shoppingSessions,
  transactions,
} from "../schema";

export interface TimeWindowBounds {
  start: Date;
  end: Date;
}

export interface RawFunnelCounts {
  sessionsTotal: number;
  selected: number;
  purchaseRequested: number;
  approved: number;
  paymentSucceeded: number;
  policyBlocked: number;
  cancelled: number;
}

/** Transaction statuses that imply the transaction was approved (the state
 * machine is forward-only and never regresses, so reaching any of these
 * implies APPROVED was reached at some point in the transaction's history). */
const APPROVED_OR_BEYOND = sql`('APPROVED', 'PAYMENT_PROCESSING', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED')`;

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseInt(value, 10) || 0;
  return 0;
}

/**
 * Session/transaction-scoped funnel counts (one row per query). `discovered`
 * and `recommended` are counted separately (see `countDiscovered` /
 * `countRecommended`) because they are item-level, not session-level, counts.
 */
export async function getSessionFunnelCounts(
  userId: string,
  window: TimeWindowBounds,
): Promise<RawFunnelCounts> {
  const [row] = await db
    .select({
      sessionsTotal: sql<string>`count(*)`,
      selected: sql<string>`count(*) filter (where ${shoppingSessions.status} in ('selected', 'converted'))`,
      purchaseRequested: sql<string>`count(*) filter (where ${shoppingSessions.status} = 'converted')`,
      approved: sql<string>`count(*) filter (where ${transactions.status} in ${APPROVED_OR_BEYOND})`,
      paymentSucceeded: sql<string>`count(*) filter (where ${transactions.status} = 'PAYMENT_SUCCEEDED')`,
      policyBlocked: sql<string>`count(*) filter (where ${transactions.status} = 'POLICY_BLOCKED')`,
      cancelled: sql<string>`count(*) filter (where ${transactions.status} = 'CANCELLED')`,
    })
    .from(shoppingSessions)
    .leftJoin(
      transactions,
      and(
        eq(transactions.id, shoppingSessions.transactionId),
        eq(transactions.userId, shoppingSessions.userId),
      ),
    )
    .where(
      and(
        eq(shoppingSessions.userId, userId),
        gte(shoppingSessions.createdAt, window.start),
        lt(shoppingSessions.createdAt, window.end),
      ),
    );

  return {
    sessionsTotal: toNumber(row?.sessionsTotal),
    selected: toNumber(row?.selected),
    purchaseRequested: toNumber(row?.purchaseRequested),
    approved: toNumber(row?.approved),
    paymentSucceeded: toNumber(row?.paymentSucceeded),
    policyBlocked: toNumber(row?.policyBlocked),
    cancelled: toNumber(row?.cancelled),
  };
}

/** Item-level discovery count: non-rejected candidates across the user's sessions in-window. */
export async function countDiscovered(
  userId: string,
  window: TimeWindowBounds,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(productCandidates)
    .innerJoin(shoppingSessions, eq(shoppingSessions.id, productCandidates.sessionId))
    .where(
      and(
        eq(shoppingSessions.userId, userId),
        eq(productCandidates.rejected, false),
        gte(shoppingSessions.createdAt, window.start),
        lt(shoppingSessions.createdAt, window.end),
      ),
    );
  return toNumber(row?.count);
}

/** Item-level recommendation count across the user's sessions in-window. */
export async function countRecommended(
  userId: string,
  window: TimeWindowBounds,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(recommendations)
    .innerJoin(shoppingSessions, eq(shoppingSessions.id, recommendations.sessionId))
    .where(
      and(
        eq(shoppingSessions.userId, userId),
        gte(shoppingSessions.createdAt, window.start),
        lt(shoppingSessions.createdAt, window.end),
      ),
    );
  return toNumber(row?.count);
}

export interface RawProductPerformanceRow {
  productId: string;
  title: string;
  merchant: string | null;
  amountInMinor: number;
  currency: string;
  timesDiscovered: number;
  timesRecommended: number;
  timesSelected: number;
  timesConverted: number;
}

/**
 * Per-product performance, aggregated entirely in Postgres (GROUP BY +
 * conditional COUNT DISTINCT) — no row-by-row JavaScript aggregation.
 *
 * `timesSelected` / `timesConverted` are derived from
 * `shopping_sessions.selected_plan->>'productId'`, the only place Part B
 * records which product a session's selection resolved to; there is no
 * separate write path this module needs (or is allowed) to create.
 */
export async function getProductPerformance(
  userId: string,
  window: TimeWindowBounds,
): Promise<RawProductPerformanceRow[]> {
  const selectedMatch = sql`(${shoppingSessions.status} in ('selected', 'converted') and ${shoppingSessions.selectedPlan} ->> 'productId' = ${productCandidates.productId})`;
  const convertedMatch = sql`(${transactions.status} = 'PAYMENT_SUCCEEDED' and ${shoppingSessions.selectedPlan} ->> 'productId' = ${productCandidates.productId})`;

  const rows = await db
    .select({
      productId: productCandidates.productId,
      title: sql<string>`max(${productCandidates.title})`,
      merchant: sql<string | null>`max(${productCandidates.merchant})`,
      amountInMinor: sql<string>`max(${productCandidates.amountInMinor})`,
      currency: sql<string>`max(${productCandidates.currency})`,
      timesDiscovered: sql<string>`count(distinct ${productCandidates.sessionId})`,
      timesRecommended: sql<string>`count(distinct ${recommendations.id})`,
      timesSelected: sql<string>`count(distinct case when ${selectedMatch} then ${shoppingSessions.id} end)`,
      timesConverted: sql<string>`count(distinct case when ${convertedMatch} then ${shoppingSessions.id} end)`,
    })
    .from(productCandidates)
    .innerJoin(shoppingSessions, eq(shoppingSessions.id, productCandidates.sessionId))
    .leftJoin(
      recommendations,
      and(
        eq(recommendations.sessionId, productCandidates.sessionId),
        eq(recommendations.productId, productCandidates.productId),
      ),
    )
    .leftJoin(transactions, eq(transactions.id, shoppingSessions.transactionId))
    .where(
      and(
        eq(shoppingSessions.userId, userId),
        eq(productCandidates.rejected, false),
        gte(shoppingSessions.createdAt, window.start),
        lt(shoppingSessions.createdAt, window.end),
      ),
    )
    .groupBy(productCandidates.productId);

  return rows.map((r) => ({
    productId: r.productId,
    title: r.title,
    merchant: r.merchant,
    amountInMinor: toNumber(r.amountInMinor),
    currency: r.currency,
    timesDiscovered: toNumber(r.timesDiscovered),
    timesRecommended: toNumber(r.timesRecommended),
    timesSelected: toNumber(r.timesSelected),
    timesConverted: toNumber(r.timesConverted),
  }));
}

export interface RawRecommendationPositionRow {
  isTop: boolean;
  recommendedCount: number;
  selectedCount: number;
}

/**
 * Recommendation performance bucketed by `is_top` (the only ranking-position
 * signal persisted by Part B). Used to compare the observed selection rate of
 * the top-ranked recommendation against the rest, without claiming causation.
 */
export async function getRecommendationPositionPerformance(
  userId: string,
  window: TimeWindowBounds,
): Promise<RawRecommendationPositionRow[]> {
  const selectedMatch = sql`(${shoppingSessions.status} in ('selected', 'converted') and ${shoppingSessions.selectedPlan} ->> 'productId' = ${recommendations.productId})`;

  const rows = await db
    .select({
      isTop: recommendations.isTop,
      recommendedCount: sql<string>`count(*)`,
      selectedCount: sql<string>`count(distinct case when ${selectedMatch} then ${recommendations.id} end)`,
    })
    .from(recommendations)
    .innerJoin(shoppingSessions, eq(shoppingSessions.id, recommendations.sessionId))
    .where(
      and(
        eq(shoppingSessions.userId, userId),
        gte(shoppingSessions.createdAt, window.start),
        lt(shoppingSessions.createdAt, window.end),
      ),
    )
    .groupBy(recommendations.isTop);

  return rows.map((r) => ({
    isTop: r.isTop,
    recommendedCount: toNumber(r.recommendedCount),
    selectedCount: toNumber(r.selectedCount),
  }));
}
