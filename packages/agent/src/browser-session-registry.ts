/**
 * In-process registry of *live* browser sessions.
 *
 * This is intentionally process-local: a live Stagehand/Chrome instance only
 * exists in the process that launched it. It is NOT the source of truth for
 * ownership, expiry, or cleanup — that lives in the database-backed
 * `browser_sessions` table (see `@cartwright/db`). This registry is purely the
 * mechanism that lets the API recover the live handle (to read a checkout total
 * or drive a payment) using the `providerSessionId` stored on that row.
 *
 * After a process restart the registry is empty, but the durable `browser_sessions`
 * rows remain, so ownership/expiry/cleanup logic still works without depending
 * on this in-memory structure.
 */

import type { MerchantPaymentSession } from "./shopping-agent";

export class LiveBrowserSessionRegistry {
  private readonly sessions = new Map<string, MerchantPaymentSession>();

  register(id: string, session: MerchantPaymentSession): void {
    this.sessions.set(id, session);
  }

  get(id: string): MerchantPaymentSession | undefined {
    return this.sessions.get(id);
  }

  remove(id: string): MerchantPaymentSession | undefined {
    const session = this.sessions.get(id);
    this.sessions.delete(id);
    return session;
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  /** Live instance ids still held in THIS process (for best-effort cleanup). */
  keys(): string[] {
    return [...this.sessions.keys()];
  }
}

/** Shared singleton used by the agent's retained-session functions. */
export const liveBrowserSessionRegistry = new LiveBrowserSessionRegistry();
