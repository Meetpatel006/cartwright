import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { shoppingSessions } from "./shopping";
import { transactions } from "./transactions";

/**
 * Retained browser / merchant-checkout sessions.
 *
 * The agent may keep a browser open after discovery so a payment can later be
 * driven through the merchant's own UI. This table is the **durable, server-
 * authoritative record** of those sessions: ownership, the provider handle
 * needed to recover/reconnect the underlying browser, status, and lifecycle
 * timestamps. The live browser itself remains the provider's responsibility
 * (local Chrome in this process, or a Browserbase cloud session); this row only
 * stores metadata and the provider session id — never secrets.
 *
 * Lifecycle:
 *   active  → a usable retained session
 *   expired → past its TTL / invalidated (e.g. its shopping session expired)
 *   closed  → the browser was disposed (payment completed or explicitly closed)
 *
 * `expired`/`closed` sessions must never be reused or reopened.
 */
export const browserSessionStatus = pgEnum("browser_session_status", [
  "active",
  "expired",
  "closed",
]);

export const browserSessions = pgTable(
  "browser_sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    /** Owning user. One user must never access another's browser session. */
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Which backend holds the actual browser: "local" or "browserbase". */
    provider: text("provider").notNull(),
    /**
     * Provider-side session handle.
     *  - local:     the process-local registry key for the live Stagehand/Chrome
     *  - browserbase: the durable `stagehand.browserbaseSessionID` (reconnectable
     *    via Stagehand's `browserbaseSessionID` with `keepAlive: true`).
     */
    providerSessionId: text("provider_session_id").notNull(),
    /** Shopping session that opened this retained browser (if any). */
    shoppingSessionId: text("shopping_session_id").references(
      () => shoppingSessions.id,
      { onDelete: "cascade" },
    ),
    /** Transaction this browser session was eventually used for (if any). */
    transactionId: text("transaction_id").references(() => transactions.id, {
      onDelete: "cascade",
    }),
    status: browserSessionStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** When this retained session is no longer usable. */
    expiresAt: timestamp("expires_at"),
    /** When the underlying browser was actually disposed. */
    closedAt: timestamp("closed_at"),
  },
  (table) => [
    index("browser_sessions_owner_idx").on(table.ownerUserId),
    index("browser_sessions_provider_session_idx").on(table.providerSessionId),
    index("browser_sessions_shopping_idx").on(table.shoppingSessionId),
  ],
);

export type BrowserSessionRow = typeof browserSessions.$inferSelect;
export type NewBrowserSessionRow = typeof browserSessions.$inferInsert;
