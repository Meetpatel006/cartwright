/**
 * Server-side cache layer for the PostHog tracker-stats queries.
 *
 * The /api/tracker/stats route fans out 9 HogQL queries against PostHog on
 * every request — the slowest part of the merchant dashboards (orders,
 * sales, customers, dashboard overview).
 *
 * Migrated to the Next.js 16 Cache Components model: the query batch is a
 * `use cache` function whose arguments (merchantId, siteId, range) form the
 * cache key, so every merchant/site/range combination is isolated. cacheLife
 * keeps analytics fresh (5 min stale, 1 min background refresh) while repeat
 * dashboard loads are served from the Next data cache instead of PostHog.
 */

import { cacheLife, cacheTag } from "next/cache";

import { queryHogQL, buildFilterClause } from "@cartwright/api/posthog/client";

export type TrackerQueryResult = unknown[][] | null;
export type TrackerQueryBatch = TrackerQueryResult[];

async function runTrackerQueryBatch(
  merchantId: string,
  siteParam: string,
  range: string,
): Promise<TrackerQueryBatch> {
  // Build filter clause scoped strictly to the authenticated merchant & optional site
  const baseFilter = buildFilterClause(merchantId, { siteId: siteParam, range });

  // Fetch live metrics, funnel, daily time-series, and orders from PostHog
  // strictly for this site/merchant
  return Promise.all([
    queryHogQL(`
      SELECT 
        count() AS total_orders,
        sum(toFloat(properties.order_total_amount)) AS total_revenue,
        avg(toFloat(properties.order_total_amount)) AS avg_order_value,
        countIf(properties.actor_type = 'agent') AS agent_orders,
        avgIf(toFloat(properties.order_total_amount), properties.actor_type = 'agent') AS agent_aov,
        avgIf(toFloat(properties.order_total_amount), properties.actor_type != 'agent') AS human_aov,
        sumIf(toFloat(properties.order_total_amount), properties.actor_type = 'agent') AS agent_revenue
      FROM events
      WHERE event = 'cartwright_purchase_completed'
        AND ${baseFilter}
    `),
    queryHogQL(`
      SELECT count() AS failed_orders
      FROM events
      WHERE event = 'cartwright_purchase_failed'
        AND ${baseFilter}
    `),
    queryHogQL(`
      SELECT count() AS total_views
      FROM events
      WHERE event = 'cartwright_page_viewed'
        AND ${baseFilter}
    `),
    queryHogQL(`
      SELECT 
        countIf(event = 'cartwright_page_viewed') AS visits,
        countIf(event = 'cartwright_product_viewed') AS product_views,
        countIf(event = 'cartwright_add_to_cart') AS cart_adds,
        countIf(event = 'cartwright_checkout_started') AS checkouts,
        countIf(event = 'cartwright_purchase_completed') AS purchases
      FROM events
      WHERE ${baseFilter}
    `),
    queryHogQL(`
      SELECT 
        properties.search_query AS query,
        count() AS searches
      FROM events
      WHERE event = 'cartwright_search_performed'
        AND properties.search_query IS NOT NULL
        AND ${baseFilter}
      GROUP BY query
      ORDER BY searches DESC
      LIMIT 4
    `),
    queryHogQL(`
      SELECT 
        formatDateTime(timestamp, '%b %d') AS day_label,
        countIf(properties.actor_type = 'agent') AS agent_orders,
        countIf(properties.actor_type != 'agent') AS human_orders
      FROM events
      WHERE event = 'cartwright_purchase_completed'
        AND ${baseFilter}
      GROUP BY day_label
      ORDER BY min(timestamp) ASC
    `),
    queryHogQL(`
      SELECT 
        timestamp,
        distinct_id,
        properties.order_id AS order_id,
        toFloat(properties.order_total_amount) AS amount,
        properties.merchant_id AS merchant_id,
        properties.site_id AS site_id,
        properties.city AS city,
        properties.payment_method AS payment_method,
        properties.actor_type AS actor_type,
        coalesce(
          JSONExtractString(properties.order, 'items', 1, 'title'),
          properties.product_title,
          properties.title,
          'Unknown product'
        ) AS product_title,
        properties.order_status AS order_status,
        coalesce(
          properties.product_category,
          JSONExtractString(properties.product, 'category'),
          'Uncategorized'
        ) AS product_category,
        coalesce(properties.shopper_email, properties.email, '—') AS shopper_email,
        coalesce(properties.shopper_name, properties.name, '') AS shopper_name,
        coalesce(properties.state, '—') AS state
      FROM events
      WHERE event = 'cartwright_purchase_completed'
        AND ${baseFilter}
      ORDER BY timestamp DESC
      LIMIT 2000
    `),
    queryHogQL(`
      SELECT
        if(properties.actor_type = 'agent', 'agent', 'human') AS actor,
        countIf(event = 'cartwright_page_viewed') AS visits,
        countIf(event = 'cartwright_product_viewed') AS product_views,
        countIf(event = 'cartwright_add_to_cart') AS cart_adds,
        countIf(event = 'cartwright_checkout_started') AS checkouts,
        countIf(event = 'cartwright_purchase_completed') AS purchases
      FROM events
      WHERE ${baseFilter}
      GROUP BY actor
    `),
    queryHogQL(`
      SELECT
        properties.payment_method AS method,
        countIf(properties.actor_type = 'agent') AS agent_orders,
        countIf(properties.actor_type != 'agent') AS human_orders,
        sum(toFloat(properties.order_total_amount)) AS revenue
      FROM events
      WHERE event = 'cartwright_purchase_completed'
        AND ${baseFilter}
      GROUP BY method
    `),
  ]);
}

/**
 * Cached tracker-stats query batch (Cache Components model).
 *
 * `use cache` keyed by (merchantId, siteParam, range); `cacheTag` lets the
 * entry be purged on demand via revalidateTag("tracker-stats") should a new
 * purchase need to appear immediately.
 */
export async function getCachedTrackerQueries(
  merchantId: string,
  siteParam: string,
  range: string,
): Promise<TrackerQueryBatch> {
  "use cache";
  // 5 min stale/refresh window matching the client staleTime, so recomputes
  // happen at most once per 5 minutes per (merchant, site, range) key instead
  // of churning every minute (each recompute = a ~seconds-long PostHog batch).
  cacheLife({ stale: 300, revalidate: 300, expire: 1800 });
  cacheTag("tracker-stats");
  return runTrackerQueryBatch(merchantId, siteParam, range);
}
