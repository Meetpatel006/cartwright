import type { LiveStats, TimeSeriesItem, OrderItem } from "./tracker-api";

export interface TrendResult {
  value: number;
  label: string;
  direction: "up" | "down" | "flat";
}

/**
 * Compute real growth trend by comparing two periods of time-series data.
 * Splits the series in half and compares order totals.
 */
export function computeOrderTrend(timeSeries: TimeSeriesItem[]): TrendResult {
  if (timeSeries.length < 2) return { value: 0, label: "0%", direction: "flat" };

  const mid = Math.floor(timeSeries.length / 2);
  const firstHalf = timeSeries.slice(0, mid);
  const secondHalf = timeSeries.slice(mid);

  const firstTotal = firstHalf.reduce((sum, d) => sum + d.orders, 0);
  const secondTotal = secondHalf.reduce((sum, d) => sum + d.orders, 0);

  if (firstTotal === 0) return { value: secondTotal > 0 ? 100 : 0, label: secondTotal > 0 ? "+100%" : "0%", direction: secondTotal > 0 ? "up" : "flat" };

  const pct = ((secondTotal - firstTotal) / firstTotal) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return {
    value: rounded,
    label: `${rounded >= 0 ? "+" : ""}${rounded}%`,
    direction: rounded > 0 ? "up" : rounded < 0 ? "down" : "flat",
  };
}

/**
 * Compute revenue trend from time-series data (if revenue field exists).
 */
export function computeRevenueTrend(timeSeries: TimeSeriesItem[]): TrendResult {
  // Time series doesn't always have revenue, fall back to order trend
  return computeOrderTrend(timeSeries);
}

/**
 * Compute average order value trend by comparing recent vs older orders.
 */
export function computeAOVTrend(orders: OrderItem[]): TrendResult {
  if (orders.length < 2) return { value: 0, label: "0%", direction: "flat" };

  const mid = Math.floor(orders.length / 2);
  const recent = orders.slice(0, mid);
  const older = orders.slice(mid);

  const recentAvg = recent.reduce((s, o) => s + o.amount, 0) / recent.length;
  const olderAvg = older.reduce((s, o) => s + o.amount, 0) / older.length;

  if (olderAvg === 0) return { value: 0, label: "0%", direction: "flat" };

  const pct = ((recentAvg - olderAvg) / olderAvg) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return {
    value: rounded,
    label: `${rounded >= 0 ? "+" : ""}${rounded}%`,
    direction: rounded > 0 ? "up" : rounded < 0 ? "down" : "flat",
  };
}

/**
 * Compute AI agent share trend by comparing recent vs older orders.
 */
export function computeAgentShareTrend(orders: OrderItem[]): TrendResult {
  if (orders.length < 2) return { value: 0, label: "0%", direction: "flat" };

  const mid = Math.floor(orders.length / 2);
  const recent = orders.slice(0, mid);
  const older = orders.slice(mid);

  const recentAgentPct = (recent.filter((o) => o.actor === "agent").length / recent.length) * 100;
  const olderAgentPct = (older.filter((o) => o.actor === "agent").length / older.length) * 100;

  if (olderAgentPct === 0) return { value: recentAgentPct > 0 ? 100 : 0, label: "0%", direction: "flat" };

  const diff = recentAgentPct - olderAgentPct;
  const rounded = Math.round(diff * 10) / 10;
  return {
    value: rounded,
    label: `${rounded >= 0 ? "+" : ""}${rounded}%`,
    direction: rounded > 0 ? "up" : rounded < 0 ? "down" : "flat",
  };
}

/**
 * Compute conversion rate trend from funnel data.
 */
export function computeConversionTrend(currentRate: number, orders: OrderItem[]): TrendResult {
  // Without historical data, just report current rate as delta from 0
  // TODO: store historical conversion rates to compute real trend
  if (currentRate === 0) return { value: 0, label: "0%", direction: "flat" };
  return {
    value: currentRate,
    label: `${currentRate}%`,
    direction: "up",
  };
}

/**
 * Format agent revenue from stats (agentOrders * avgOrderValue).
 */
export function computeAgentRevenue(stats: LiveStats): number {
  return Math.round(stats.agentOrders * (stats.avgOrderValue || 0));
}

/**
 * Format prior AOV for comparison display.
 */
export function computePriorAOV(currentAOV: number, trendPct: number): number {
  if (trendPct === 0) return currentAOV;
  return Math.round(currentAOV / (1 + trendPct / 100));
}
