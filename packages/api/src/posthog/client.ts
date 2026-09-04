/**
 * Shared PostHog HogQL Client
 *
 * Single source of truth for all PostHog queries across the app.
 * Used by:
 *   - /api/tracker/stats (server-side API route)
 *   - merchant-chat service (LLM context builder)
 *
 * Security:
 * - API key read from validated env vars only (@cartwright/env/server)
 * - Merchant/site IDs sanitized before HogQL injection
 * - API key never logged or included in error messages
 * - All queries scoped to the authenticated merchant
 */

import { env } from "@cartwright/env/server";

// ── SQL Safety ─────────────────────────────────────────────────────────

/** Strip anything that isn't alphanumeric, underscore, or hyphen. */
export function safeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "");
}

// ── HogQL Query Runner ─────────────────────────────────────────────────

/**
 * Execute a HogQL query against PostHog.
 * Returns the results array or null on failure / missing config.
 * Never throws — callers should handle null gracefully.
 */
export async function queryHogQL(sql: string): Promise<unknown[][] | null> {
  const host = env.POSTHOG_HOST;
  const apiKey = env.POSTHOG_PERSONAL_API_KEY;
  const projectId = env.POSTHOG_PROJECT_ID;

  if (!host || !apiKey || !projectId) {
    return null;
  }

  try {
    const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: { kind: "HogQLQuery", query: sql },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error(`[posthog] HogQL query failed: ${res.status}`);
      return null;
    }

    const json = (await res.json()) as { results?: unknown[][] };
    return json.results ?? null;
  } catch (err) {
    console.error(`[posthog] query error: ${(err as Error).message}`);
    return null;
  }
}

// ── Filter Builder ─────────────────────────────────────────────────────

const RANGE_INTERVALS: Record<string, string> = {
  "24h": "24 hour",
  "7d": "7 day",
  "15d": "15 day",
  "30d": "30 day",
};

/**
 * Build a WHERE clause scoped to a merchant (and optionally a site).
 * All IDs are sanitized before interpolation.
 */
export function buildFilterClause(
  merchantId: string,
  opts?: { siteId?: string; range?: string },
): string {
  const safeMerchant = safeId(merchantId);
  const interval = RANGE_INTERVALS[opts?.range ?? "30d"] ?? RANGE_INTERVALS["30d"];

  const parts = [
    `timestamp >= now() - interval ${interval}`,
    `(properties.merchant_id = '${safeMerchant}' OR properties.merchant = '${safeMerchant}')`,
  ];

  if (opts?.siteId && opts.siteId !== "site_all" && opts.siteId !== "all") {
    const safeSite = safeId(opts.siteId);
    parts.push(`(properties.site_id = '${safeSite}' OR properties.site = '${safeSite}')`);
  }

  return parts.join(" AND ");
}

/**
 * Returns true if PostHog is configured (host + key + project all present).
 */
export function isPostHogConfigured(): boolean {
  return Boolean(env.POSTHOG_HOST && env.POSTHOG_PERSONAL_API_KEY && env.POSTHOG_PROJECT_ID);
}
