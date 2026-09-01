/**
 * Repository for Part B shopping sessions and their ranked candidates /
 * recommendations. Plain async functions over the shared `db` — no classes,
 * mirroring the other repositories in this package. All other packages import
 * these, never `db` directly.
 */

import { and, desc, eq, inArray, lt } from "drizzle-orm";

import { db } from "../index";
import {
  type NewProductCandidateRow,
  type NewRecommendationRow,
  type NewShoppingSessionRow,
  type ProductCandidateRow,
  type RecommendationRow,
  type ShoppingSessionRow,
  productCandidates,
  recommendations,
  shoppingSessions,
} from "../schema";

export async function insertShoppingSession(
  row: NewShoppingSessionRow,
): Promise<ShoppingSessionRow> {
  const [created] = await db.insert(shoppingSessions).values(row).returning();
  if (!created) throw new Error("Failed to insert shopping session");
  return created;
}

export async function getShoppingSessionById(
  id: string,
): Promise<ShoppingSessionRow | undefined> {
  const rows = await db
    .select()
    .from(shoppingSessions)
    .where(eq(shoppingSessions.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Idempotent insert backed by the DB unique index on `(user_id, idempotency_key)`.
 *
 * The conflict is resolved at the database level (not just a pre-insert lookup),
 * so concurrent requests from the same user with the same key can never create
 * two sessions. When a row already exists for the pair, the original is returned
 * with `created: false`; otherwise the new row is returned with `created: true`.
 *
 * Key-less inserts (no idempotency key) never conflict — Postgres treats NULL
 * keys as distinct — and always create a new session.
 */
export async function insertShoppingSessionIdempotent(
  row: NewShoppingSessionRow,
): Promise<{ session: ShoppingSessionRow; created: boolean }> {
  const [inserted] = await db
    .insert(shoppingSessions)
    .values(row)
    .onConflictDoNothing({
      target: [shoppingSessions.userId, shoppingSessions.idempotencyKey],
    })
    .returning();

  if (inserted) {
    return { session: inserted, created: true };
  }

  // A conflicting row exists (or a concurrent insert won the race). Resolve to
  // the canonical existing session deterministically.
  if (!row.idempotencyKey) {
    // Defensive: a NULL key cannot conflict with the unique index, so reaching
    // here would indicate an unexpected non-returning insert.
    throw new Error("Idempotent shopping insert returned no row without a key");
  }
  const existing = await findSessionByIdempotency(
    row.userId,
    row.idempotencyKey,
  );
  if (!existing) {
    // Conflict fired but the row is already gone (e.g. concurrent delete). The
    // caller can safely retry; surface a clear, non-masking error.
    throw new Error(
      "Shopping session idempotency conflict resolved to no existing row",
    );
  }
  return { session: existing, created: false };
}

export async function getShoppingSessionForUser(
  id: string,
  userId: string,
): Promise<ShoppingSessionRow | undefined> {
  const rows = await db
    .select()
    .from(shoppingSessions)
    .where(and(eq(shoppingSessions.id, id), eq(shoppingSessions.userId, userId)))
    .limit(1);
  return rows[0];
}

/** Dedupe lookup: same user + idempotency key => reuse the existing session. */
export async function findSessionByIdempotency(
  userId: string,
  idempotencyKey: string,
): Promise<ShoppingSessionRow | undefined> {
  const rows = await db
    .select()
    .from(shoppingSessions)
    .where(
      and(
        eq(shoppingSessions.userId, userId),
        eq(shoppingSessions.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function updateShoppingSession(
  id: string,
  patch: Partial<NewShoppingSessionRow>,
): Promise<ShoppingSessionRow | undefined> {
  const [updated] = await db
    .update(shoppingSessions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(shoppingSessions.id, id))
    .returning();
  return updated;
}

/**
 * Move a session to the terminal `expired` state. This is a thin writer only —
 * the caller (the shopping service / cleanup) is responsible for validating the
 * transition through the centralized state machine in `@cartwright/api`.
 */
export async function expireShoppingSession(
  id: string,
): Promise<ShoppingSessionRow | undefined> {
  return updateShoppingSession(id, { status: "expired" });
}

export async function listSessionsForUser(
  userId: string,
): Promise<ShoppingSessionRow[]> {
  return db
    .select()
    .from(shoppingSessions)
    .where(eq(shoppingSessions.userId, userId))
    .orderBy(desc(shoppingSessions.createdAt));
}

/** Non-terminal sessions whose `expiresAt` has elapsed — cleanup candidates. */
export async function listExpiredActiveShoppingSessions(
  before: Date,
): Promise<ShoppingSessionRow[]> {
  return db
    .select()
    .from(shoppingSessions)
    .where(
      and(
        inArray(shoppingSessions.status, [
          "created",
          "processing",
          "recommended",
          "selected",
        ]),
        lt(shoppingSessions.expiresAt, before),
      ),
    );
}

export async function insertProductCandidates(
  rows: NewProductCandidateRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(productCandidates).values(rows);
}

export async function insertRecommendations(
  rows: NewRecommendationRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(recommendations).values(rows);
}

export async function getCandidatesForSession(
  sessionId: string,
): Promise<ProductCandidateRow[]> {
  return db
    .select()
    .from(productCandidates)
    .where(eq(productCandidates.sessionId, sessionId))
    .orderBy(desc(productCandidates.rankingScore));
}

export async function getRecommendationsForSession(
  sessionId: string,
): Promise<RecommendationRow[]> {
  return db
    .select()
    .from(recommendations)
    .where(eq(recommendations.sessionId, sessionId))
    .orderBy(desc(recommendations.rankingScore));
}
