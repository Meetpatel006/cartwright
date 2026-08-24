/**
 * Repository for retained browser / merchant-checkout sessions.
 *
 * Plain async functions over `db` — no classes, mirroring the other
 * repositories. This is the durable, server-authoritative store for browser
 * session metadata, ownership, and lifecycle status. The actual browser lives
 * with the provider; this layer only records the handle needed to recover it
 * and enforces who may touch it.
 */

import { and, eq, lt } from "drizzle-orm";

import { db } from "../index";
import {
  type BrowserSessionRow,
  type NewBrowserSessionRow,
  browserSessions,
} from "../schema";

export async function insertBrowserSession(
  row: NewBrowserSessionRow,
): Promise<BrowserSessionRow> {
  const [created] = await db.insert(browserSessions).values(row).returning();
  if (!created) throw new Error("Failed to insert browser session");
  return created;
}

export async function getBrowserSessionById(
  id: string,
): Promise<BrowserSessionRow | undefined> {
  const rows = await db
    .select()
    .from(browserSessions)
    .where(eq(browserSessions.id, id))
    .limit(1);
  return rows[0];
}

export async function getBrowserSessionByProviderSessionId(
  providerSessionId: string,
): Promise<BrowserSessionRow | undefined> {
  const rows = await db
    .select()
    .from(browserSessions)
    .where(eq(browserSessions.providerSessionId, providerSessionId))
    .limit(1);
  return rows[0];
}

/**
 * Ownership + liveness check. Returns the session only when it belongs to
 * `userId` AND is still `active`. Expired/closed sessions are intentionally
 * not returned, so callers cannot reuse or reopen them.
 */
export async function getOwnedActiveBrowserSession(
  id: string,
  userId: string,
): Promise<BrowserSessionRow | undefined> {
  const rows = await db
    .select()
    .from(browserSessions)
    .where(
      and(
        eq(browserSessions.id, id),
        eq(browserSessions.ownerUserId, userId),
        eq(browserSessions.status, "active"),
      ),
    )
    .limit(1);
  return rows[0];
}

/** Active sessions whose TTL has elapsed — candidates for cleanup. */
export async function listExpiredActiveBrowserSessions(
  before: Date,
): Promise<BrowserSessionRow[]> {
  return db
    .select()
    .from(browserSessions)
    .where(
      and(
        eq(browserSessions.status, "active"),
        lt(browserSessions.expiresAt, before),
      ),
    );
}

/** Active browser sessions tied to a given shopping session. */
export async function listActiveBrowserSessionsByShoppingSession(
  shoppingSessionId: string,
): Promise<BrowserSessionRow[]> {
  return db
    .select()
    .from(browserSessions)
    .where(
      and(
        eq(browserSessions.shoppingSessionId, shoppingSessionId),
        eq(browserSessions.status, "active"),
      ),
    );
}

/** Generic status/metadata patch. */
export async function updateBrowserSession(
  id: string,
  patch: Partial<NewBrowserSessionRow>,
): Promise<BrowserSessionRow | undefined> {
  const [updated] = await db
    .update(browserSessions)
    .set(patch)
    .where(eq(browserSessions.id, id))
    .returning();
  return updated;
}

/** Mark a session closed (browser disposed). Idempotent at the row level. */
export async function closeBrowserSession(
  id: string,
): Promise<BrowserSessionRow | undefined> {
  return updateBrowserSession(id, {
    status: "closed",
    closedAt: new Date(),
  });
}

/** Mark a session expired (no longer usable). Idempotent at the row level. */
export async function expireBrowserSession(
  id: string,
): Promise<BrowserSessionRow | undefined> {
  return updateBrowserSession(id, { status: "expired" });
}
