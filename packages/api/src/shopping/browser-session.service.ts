/**
 * Browser-session lifecycle service (API side).
 *
 * The durable, server-authoritative record of every retained browser /
 * merchant-checkout session lives in the `browser_sessions` table (via
 * `@cartwright/db`). This service is the only writer/reader of that state and
 * the place where ownership, expiry, and idempotent cleanup are enforced.
 *
 * The actual browser lives with the provider (local Chrome in this process, or
 * a Browserbase cloud session). Disposing the live browser is delegated to an
 * injectable `closeProvider` adapter (the agent's `closeMerchantPaymentSession`
 * in production) so the logic here is fully testable and never coupled to a
 * specific browser backend.
 */

import { closeMerchantPaymentSession } from "@cartwright/agent";
import type { BrowserSessionRow } from "@cartwright/db/schema";
import {
  closeBrowserSession as repoCloseBrowserSession,
  expireBrowserSession as repoExpireBrowserSession,
  getBrowserSessionById,
  getOwnedActiveBrowserSession,
  insertBrowserSession,
  listActiveBrowserSessionsByShoppingSession,
  listExpiredActiveBrowserSessions,
} from "@cartwright/db/repositories/browser-session.repository";
import { recordAuditEvent } from "../audit/audit.service";

/** Disposes the live browser identified by `providerSessionId`. */
export type BrowserSessionCloseAdapter = (
  providerSessionId: string,
  provider: string,
) => Promise<void>;

export class BrowserSessionError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "BrowserSessionError";
    this.code = code;
  }
}

export interface CreateBrowserSessionInput {
  ownerUserId: string;
  provider: string;
  providerSessionId: string;
  shoppingSessionId?: string;
  transactionId?: string;
  expiresAt?: Date;
}

export interface CloseOptions {
  /** Override the live-browser teardown (tests inject a fake). */
  closeProvider?: BrowserSessionCloseAdapter;
}

/**
 * Persist a newly retained browser session. The `providerSessionId` is the
 * handle needed to recover/reconnect the underlying browser (a Browserbase
 * session id, or the local registry key).
 */
export async function createBrowserSession(
  input: CreateBrowserSessionInput,
): Promise<BrowserSessionRow> {
  return insertBrowserSession({
    ownerUserId: input.ownerUserId,
    provider: input.provider,
    providerSessionId: input.providerSessionId,
    shoppingSessionId: input.shoppingSessionId,
    transactionId: input.transactionId,
    expiresAt: input.expiresAt,
  });
}

/**
 * Load an owned, *active* browser session. Throws a typed `BrowserSessionError`
 * when the session is missing, belongs to another user, or is no longer active
 * (expired/closed) — so callers can never reuse or reopen a dead session.
 */
export async function getOwnedBrowserSession(
  id: string,
  userId: string,
): Promise<BrowserSessionRow> {
  const session = await getOwnedActiveBrowserSession(id, userId);
  if (session) return session;

  const any = await getBrowserSessionById(id);
  if (!any) {
    throw new BrowserSessionError("Browser session not found.", "BROWSER_SESSION_NOT_FOUND");
  }
  if (any.ownerUserId !== userId) {
    throw new BrowserSessionError(
      "Browser session does not belong to this user.",
      "BROWSER_SESSION_FORBIDDEN",
    );
  }
  throw new BrowserSessionError(
    `Browser session is ${any.status} and cannot be used.`,
    "BROWSER_SESSION_INACTIVE",
  );
}

/**
 * Reconnect metadata for an owned, active session. The returned
 * `providerSessionId` is the durable handle a Browserbase reconnect would use
 * (per Stagehand's `browserbaseSessionID` + `keepAlive`).
 */
export async function reconnectBrowserSession(
  id: string,
  userId: string,
): Promise<BrowserSessionRow> {
  return getOwnedBrowserSession(id, userId);
}

/**
 * Close a browser session: marks the row `closed` and disposes the live
 * browser (best-effort). Idempotent — once `closed`, repeated calls return the
 * row without re-invoking the provider teardown. Ownership is enforced when
 * `userId` is supplied.
 */
export async function closeBrowserSession(
  id: string,
  userId?: string,
  opts: CloseOptions = {},
): Promise<BrowserSessionRow | undefined> {
  const session = await getBrowserSessionById(id);
  if (!session) return undefined;
  if (userId && session.ownerUserId !== userId) {
    throw new BrowserSessionError(
      "Browser session does not belong to this user.",
      "BROWSER_SESSION_FORBIDDEN",
    );
  }
  // Only dispose when currently active; a second call is a safe no-op.
  if (session.status !== "active") return session;

  const closed = await repoCloseBrowserSession(id);
  const closeProvider = opts.closeProvider ?? closeMerchantPaymentSession;
  try {
    await closeProvider(session.providerSessionId, session.provider);
  } catch (error) {
    await recordAuditEvent({
      eventType: "BROWSER_OPERATION_FAILED",
      userId: session.ownerUserId,
      reason: error instanceof Error ? error.message : "Browser close failed",
      outcome: "FAILURE",
      failureClassification: "BROWSER_OPERATION_FAILED",
      metadata: { browserSessionId: id, provider: session.provider },
    });
  }
  return closed;
}

/**
 * Explicitly expire a session (e.g. when its parent shopping session expires).
 * Terminal: the session can never be reopened.
 */
export async function expireBrowserSession(
  id: string,
): Promise<BrowserSessionRow | undefined> {
  return repoExpireBrowserSession(id);
}

/**
 * Lazily expire every TTL-elapsed active session and dispose its live browser.
 *
 * Idempotent: rows are marked `expired` before teardown, so a repeated call
 * finds no `active` candidates and is a safe no-op. Cleanup is driven entirely
 * by the database, so it works after a process restart (when the in-process
 * live registry is empty) — a missing live browser is disposed gracefully.
 */
export async function cleanupExpiredBrowserSessions(
  now: Date = new Date(),
  opts: CloseOptions = {},
): Promise<number> {
  const expired = await listExpiredActiveBrowserSessions(now);
  const closeProvider = opts.closeProvider ?? closeMerchantPaymentSession;
  let disposed = 0;
  for (const session of expired) {
    // Mark expired first so a concurrent/retried sweep never double-processes.
    await repoExpireBrowserSession(session.id);
    try {
      await closeProvider(session.providerSessionId, session.provider);
    } catch {
      // Browser already gone — best-effort cleanup; the row is already expired.
    }
    await recordAuditEvent({
      eventType: "BROWSER_SESSION_EXPIRED",
      userId: session.ownerUserId,
      shoppingSessionId: session.shoppingSessionId,
      resultingState: "expired",
      outcome: "SUCCESS",
      metadata: { provider: session.provider },
    });
    disposed += 1;
  }
  return disposed;
}

/**
 * Expire and dispose every active browser session tied to a (now-expired)
 * shopping session. Used when a shopping session is lazily expired so its
 * retained browser is never left dangling. Idempotent: already-expired browser
 * rows are not re-processed.
 */
export async function cleanupBrowserSessionsForShoppingSession(
  shoppingSessionId: string,
  opts: CloseOptions = {},
): Promise<number> {
  const sessions = await listActiveBrowserSessionsByShoppingSession(shoppingSessionId);
  const closeProvider = opts.closeProvider ?? closeMerchantPaymentSession;
  let disposed = 0;
  for (const session of sessions) {
    await repoExpireBrowserSession(session.id);
    try {
      await closeProvider(session.providerSessionId, session.provider);
    } catch {
      // Browser already gone — best-effort cleanup; the row is already expired.
    }
    await recordAuditEvent({
      eventType: "BROWSER_SESSION_EXPIRED",
      userId: session.ownerUserId,
      shoppingSessionId: session.shoppingSessionId,
      resultingState: "expired",
      outcome: "SUCCESS",
      metadata: { provider: session.provider, cleanupReason: "shopping_session_expired" },
    });
    disposed += 1;
  }
  return disposed;
}

/**
 * Close every active browser retained for a shopping session after selection.
 * Unlike expiry cleanup, this preserves the intentional `closed` lifecycle
 * state so an already-converted session cannot be mistaken for an expired one.
 */
export async function closeBrowserSessionsForShoppingSession(
  shoppingSessionId: string,
  userId: string,
  opts: CloseOptions = {},
): Promise<number> {
  const sessions = await listActiveBrowserSessionsByShoppingSession(shoppingSessionId);
  let closed = 0;
  for (const session of sessions) {
    await closeBrowserSession(session.id, userId, opts);
    closed += 1;
  }
  return closed;
}
