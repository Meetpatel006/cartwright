/**
 * Scheduled cleanup mechanism for Part B shopping + browser sessions.
 *
 * Both `cleanupExpiredShoppingSessions` and `cleanupExpiredBrowserSessions`
 * are DB-driven and idempotent, so a sweep can be run on any interval
 * (a long-lived process via `startCleanupScheduler`, or an external cron that
 * hits an endpoint calling `runAllCleanup`). Repeated runs are safe: already
 * expired/closed rows are never re-processed.
 */

import { cleanupExpiredBrowserSessions } from "./browser-session.service";
import { cleanupExpiredShoppingSessions } from "./shopping.service";

export interface CleanupReport {
  shoppingSessions: number;
  browserSessions: number;
}

/** Run a single cleanup pass over both shopping and browser sessions. */
export async function runAllCleanup(
  now: Date = new Date(),
): Promise<CleanupReport> {
  const shoppingSessions = await cleanupExpiredShoppingSessions(now);
  const browserSessions = await cleanupExpiredBrowserSessions(now);
  return { shoppingSessions, browserSessions };
}

let timer: ReturnType<typeof setInterval> | null = null;
let timerRefCount = 0;

/** Start the periodic cleanup sweep. Safe to call multiple times. */
export function startCleanupScheduler(
  intervalMs: number = 5 * 60_000,
): () => void {
  timerRefCount += 1;
  if (!timer) {
    timer = setInterval(() => {
      runAllCleanup().catch(() => {
        /* a failed sweep must not crash the process; the next one retries */
      });
    }, intervalMs);
    // Don't keep the event loop alive solely for the sweeper.
    if (typeof timer.unref === "function") timer.unref();
  }
  return stopCleanupScheduler;
}

/** Stop the periodic cleanup sweep (reference-counted). */
export function stopCleanupScheduler(): void {
  timerRefCount = Math.max(0, timerRefCount - 1);
  if (timerRefCount === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}
