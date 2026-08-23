import { jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { transactions } from "./transactions";

/** Append-only audit event types for the purchase flow. */
export const auditEventType = pgEnum("audit_event_type", [
  "PURCHASE_REQUESTED",
  "TRANSACTION_CREATED",
  "POLICY_CHECK_STARTED",
  "POLICY_CHECK_PASSED",
  "POLICY_CHECK_FAILED",
  "SPENDING_RESERVED",
  "USER_APPROVAL_REQUIRED",
  "USER_APPROVED",
  "PRICE_CHECKED",
  "PRICE_CHANGED",
  "PAYMENT_ORDER_CREATED",
  "PAYMENT_VERIFICATION_STARTED",
  "PAYMENT_SUCCEEDED",
  "PAYMENT_FAILED",
  "WEBHOOK_RECEIVED",
  "DUPLICATE_PAYMENT_IGNORED",
  "TRANSACTION_CANCELLED",
]);

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  transactionId: text("transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  userId: text("user_id"),
  eventType: auditEventType("event_type").notNull(),
  reason: text("reason"),
  /** Small, non-secret event metadata (no card data, no secrets). */
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AuditEventRow = typeof auditEvents.$inferSelect;
export type NewAuditEventRow = typeof auditEvents.$inferInsert;
