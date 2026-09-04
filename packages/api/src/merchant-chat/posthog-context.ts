/**
 * PostHog Context Builder for Merchant Chat
 *
 * Uses the shared PostHog client (packages/api/src/posthog/client.ts)
 * to query live merchant telemetry and format it as LLM context.
 *
 * This module NEVER touches the API key directly — it delegates to the
 * shared queryHogQL which reads from validated env vars.
 */

import { queryHogQL, buildFilterClause, isPostHogConfigured } from "../posthog/client";

// ── Types ──────────────────────────────────────────────────────────────

export interface PostHogContext {
  period: {
    label: string;
    days: number;
  };
  kpis: {
    totalOrders: number;
    grossRevenue: number;
    avgOrderValue: number;
    agentOrders: number;
    humanOrders: number;
    totalViews: number;
    conversionRate: number;
    fulfillmentRate: number;
  };
  funnel: {
    visits: number;
    productViews: number;
    cartAdds: number;
    checkouts: number;
    purchases: number;
  };
  dailySeries: Array<{
    date: string;
    visits: number;
    productViews: number;
    cartAdds: number;
    checkouts: number;
    purchases: number;
    failedPurchases: number;
  }>;
  topSearchQueries: Array<{ query: string; searches: number }>;
  recentOrders: Array<{
    date: string;
    product: string;
    amount: number;
    city: string;
    status: string;
    actor: string;
  }>;
}

// ── Public API ─────────────────────────────────────────────────────────

export async function fetchPostHogContext(
  merchantId: string,
  siteId?: string,
): Promise<PostHogContext | null> {
  if (!isPostHogConfigured()) {
    return null;
  }

  const filter = buildFilterClause(merchantId, { siteId, range: "30d" });
  // Live analytics is supplemental context; it must not make chat wait on a
  // degraded PostHog service when the DB-backed context is still available.
  const queryOptions = { timeoutMs: 5_000 };

  const [kpiRes, seriesRes, funnelRes, searchRes, ordersRes] = await Promise.all([
    queryHogQL(`
      SELECT
        count() AS total_orders,
        sum(toFloat(properties.order_total_amount)) AS total_revenue,
        avg(toFloat(properties.order_total_amount)) AS avg_order_value,
        countIf(properties.actor_type = 'agent') AS agent_orders
      FROM events
      WHERE event = 'cartwright_purchase_completed'
        AND ${filter}
    `, queryOptions),
    queryHogQL(`
      SELECT
        formatDateTime(toDate(timestamp), '%Y-%m-%d') AS day,
        countIf(event = 'cartwright_page_viewed') AS visits,
        countIf(event = 'cartwright_product_viewed') AS product_views,
        countIf(event = 'cartwright_add_to_cart') AS cart_adds,
        countIf(event = 'cartwright_checkout_started') AS checkouts,
        countIf(event = 'cartwright_purchase_completed') AS purchases,
        countIf(event = 'cartwright_purchase_failed') AS failed_purchases
      FROM events
      WHERE ${filter}
      GROUP BY day
      ORDER BY day ASC
    `, queryOptions),
    queryHogQL(`
      SELECT
        countIf(event = 'cartwright_page_viewed') AS visits,
        countIf(event = 'cartwright_product_viewed') AS product_views,
        countIf(event = 'cartwright_add_to_cart') AS cart_adds,
        countIf(event = 'cartwright_checkout_started') AS checkouts,
        countIf(event = 'cartwright_purchase_completed') AS purchases
      FROM events
      WHERE ${filter}
    `, queryOptions),
    queryHogQL(`
      SELECT
        properties.search_query AS query,
        count() AS searches
      FROM events
      WHERE event = 'cartwright_search_performed'
        AND properties.search_query IS NOT NULL
        AND ${filter}
      GROUP BY query
      ORDER BY searches DESC
      LIMIT 10
    `, queryOptions),
    queryHogQL(`
      SELECT
        timestamp,
        toFloat(properties.order_total_amount) AS amount,
        properties.city AS city,
        properties.actor_type AS actor_type,
        coalesce(
          JSONExtractString(properties.order, 'items', 1, 'title'),
          properties.product_title,
          properties.title,
          'Unknown product'
        ) AS product_title,
        properties.order_status AS order_status
      FROM events
      WHERE event = 'cartwright_purchase_completed'
        AND ${filter}
      ORDER BY timestamp DESC
      LIMIT 20
    `, queryOptions),
  ]);

  // Parse KPIs
  const kpiRow = kpiRes?.[0];
  const totalOrders = kpiRow ? Number(kpiRow[0]) || 0 : 0;
  const grossRevenue = kpiRow ? Math.round(Number(kpiRow[1]) || 0) : 0;
  const avgOrderValue = kpiRow ? Math.round(Number(kpiRow[2]) || 0) : 0;
  const agentOrders = kpiRow ? Number(kpiRow[3]) || 0 : 0;

  // Parse funnel
  const fnRow = funnelRes?.[0] || [0, 0, 0, 0, 0];
  const visits = Number(fnRow[0]) || 0;
  const productViews = Number(fnRow[1]) || 0;
  const cartAdds = Number(fnRow[2]) || 0;
  const checkouts = Number(fnRow[3]) || 0;
  const purchases = Number(fnRow[4]) || totalOrders;

  const dailySeries = (seriesRes || []).map((row) => ({
    date: String(row[0] || ""),
    visits: Number(row[1]) || 0,
    productViews: Number(row[2]) || 0,
    cartAdds: Number(row[3]) || 0,
    checkouts: Number(row[4]) || 0,
    purchases: Number(row[5]) || 0,
    failedPurchases: Number(row[6]) || 0,
  }));

  // Parse search queries
  const topSearchQueries = (searchRes || []).map((row) => ({
    query: String(row[0] || ""),
    searches: Number(row[1]) || 0,
  }));

  // Parse recent orders
  const recentOrders = (ordersRes || []).map((row) => ({
    date: row[0] ? new Date(String(row[0])).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—",
    amount: Number(row[1]) || 0,
    city: String(row[2] || "—"),
    actor: String(row[3] || "—"),
    product: String(row[4] || "Unknown"),
    status: String(row[5] || "—"),
  }));

  return {
    period: { label: "Last 30 days", days: 30 },
    kpis: {
      totalOrders,
      grossRevenue,
      avgOrderValue,
      agentOrders,
      humanOrders: Math.max(0, totalOrders - agentOrders),
      totalViews: visits,
      conversionRate: visits > 0 ? Number(((totalOrders / visits) * 100).toFixed(2)) : 0,
      fulfillmentRate: totalOrders > 0 ? Number(((totalOrders / (totalOrders + 1)) * 100).toFixed(1)) : 0,
    },
    funnel: { visits, productViews, cartAdds, checkouts, purchases },
    dailySeries,
    topSearchQueries,
    recentOrders,
  };
}

/**
 * Formats PostHog context into a structured text block for the LLM system prompt.
 */
export function formatPostHogContext(data: PostHogContext): string {
  const parts: string[] = [];

  parts.push("## Live Store Analytics (PostHog)\n");
  parts.push(`### Reporting Period`);
  parts.push(`- ${data.period.label} (${data.period.days} days)`);
  parts.push("");

  parts.push("### Key Metrics");
  parts.push(`- Total orders (30d): ${data.kpis.totalOrders}`);
  parts.push(`- Gross revenue: ₹${data.kpis.grossRevenue.toLocaleString()}`);
  parts.push(`- Average order value: ₹${data.kpis.avgOrderValue.toLocaleString()}`);
  parts.push(`- AI agent orders: ${data.kpis.agentOrders} (${data.kpis.totalOrders > 0 ? Math.round((data.kpis.agentOrders / data.kpis.totalOrders) * 100) : 0}%)`);
  parts.push(`- Human orders: ${data.kpis.humanOrders}`);
  parts.push(`- Store page views: ${data.kpis.totalViews}`);
  parts.push(`- Visit → Purchase conversion: ${data.kpis.conversionRate}%`);
  parts.push("");

  parts.push("### Conversion Funnel");
  parts.push(`- Store Visits: ${data.funnel.visits}`);
  parts.push(`- Product Views: ${data.funnel.productViews} (${data.funnel.visits > 0 ? ((data.funnel.productViews / data.funnel.visits) * 100).toFixed(1) : 0}% of visits)`);
  parts.push(`- Cart Additions: ${data.funnel.cartAdds} (${data.funnel.productViews > 0 ? ((data.funnel.cartAdds / data.funnel.productViews) * 100).toFixed(1) : 0}% of views)`);
  parts.push(`- Checkout Started: ${data.funnel.checkouts}`);
  parts.push(`- Purchases: ${data.funnel.purchases}`);
  parts.push("");

  if (data.dailySeries.length > 0) {
    parts.push("### Daily Trend (one row per day)");
    parts.push("| Date | Visits | Product views | Cart adds | Checkouts | Purchases | Failed purchases |");
    parts.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const day of data.dailySeries) {
      parts.push(
        `| ${day.date} | ${day.visits} | ${day.productViews} | ${day.cartAdds} | ${day.checkouts} | ${day.purchases} | ${day.failedPurchases} |`,
      );
    }
    parts.push("");
  }

  if (data.topSearchQueries.length > 0) {
    parts.push("### Top Customer Search Queries");
    for (const s of data.topSearchQueries.slice(0, 8)) {
      parts.push(`- "${s.query}" — ${s.searches} searches`);
    }
    parts.push("");
  }

  if (data.recentOrders.length > 0) {
    parts.push("### Recent Orders (last 20)");
    for (const o of data.recentOrders.slice(0, 10)) {
      parts.push(`- ${o.date} | ${o.product} | ₹${o.amount} | ${o.city} | ${o.status} | ${o.actor}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}
