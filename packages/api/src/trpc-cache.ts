/**
 * Server-side cache layer for tRPC read procedures (Next.js 16 Cache
 * Components model).
 *
 * Reads that fan out into multiple DB queries / derivations (merchant
 * account, intelligence overview) are wrapped in `use cache` functions whose
 * arguments — the caller's userId (+ any window) — form the cache key, so
 * each user's data is cached separately and identical dashboard loads are
 * served from the Next data cache instead of re-querying the DB.
 *
 * Every cached entry is tagged with a per-user tag so the owning mutations
 * can purge it immediately with revalidateTag (registering a storefront,
 * switching the primary site, …). User-scoped transactional reads
 * (transactions.list, policies.get, shopping sessions) are intentionally NOT
 * cached here — they change on nearly every purchase/payment step and are
 * already served from the client-side TanStack cache, which those flows
 * invalidate synchronously.
 *
 * These wrappers only ever run inside the Next.js web app (tRPC route
 * handler / server). Service modules used directly by unit tests are not
 * imported here and never see next/cache.
 */

import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { getOrCreateMerchantAccount } from "./merchant-intelligence/merchant-account.service";
import { getOverview } from "./merchant-intelligence/merchant-intelligence.service";
import type { TimeWindowInput } from "./merchant-intelligence/merchant-intelligence.types";

/**
 * Freshness for cached reads: serve stale for up to 5 minutes while the
 * owning mutations invalidate immediately, and refresh in the background at
 * most once a minute.
 */
const READ_CACHE_LIFETIME = { stale: 300, revalidate: 300, expire: 1800 } as const;

// ── Per-user tags ─────────────────────────────────────────────────────

/** Tag attached to a user's merchant account + intelligence cache entries. */
export function merchantCacheTag(userId: string): string {
  return `merchant:${userId}`;
}

/**
 * Purge a user's merchant account + overview cache entries on-demand.
 * `{ expire: 0 }` makes the next read a blocking cache miss, so a freshly
 * registered / re-ordered storefront appears immediately.
 */
export function invalidateMerchantCache(userId: string): void {
  revalidateTag(merchantCacheTag(userId), { expire: 0 });
}

// ── Merchant account & overview ───────────────────────────────────────

/**
 * Cached getOrCreateMerchantAccount — one entry per (userId, name). Name is
 * part of the key so a profile display-name change still yields a fresh
 * entry, while site registrations purge via `merchant:${userId}`.
 */
export async function cachedMerchantAccount(
  userId: string,
  userName?: string | null,
) {
  "use cache";
  cacheLife(READ_CACHE_LIFETIME);
  cacheTag(merchantCacheTag(userId));
  return getOrCreateMerchantAccount(userId, userName);
}

/**
 * Cached merchant intelligence overview (funnel + top products + insights —
 * five DB queries + derivations). Keyed per user and time window; shares the
 * merchant tag so account mutations invalidate it too.
 */
export async function cachedMerchantOverview(
  userId: string,
  windowInput?: TimeWindowInput | null,
) {
  "use cache";
  cacheLife(READ_CACHE_LIFETIME);
  cacheTag(merchantCacheTag(userId));
  return getOverview(userId, windowInput);
}
