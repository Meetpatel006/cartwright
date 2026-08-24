import { jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { transactions } from "./transactions";

/** Append-only audit event types for the purchase flow. */
export const auditEventType = pgEnum("audit_event_type", [
  // Transaction / payment flow
  "PURCHASE_REQUESTED",
  "TRANSACTION_CREATED",
  "POLICY_CHECK_STARTED",
  "POLICY_CHECK_PASSED",
  "POLICY_CHECK_FAILED",
  "SPENDING_RESERVED",
  "USER_APPROVAL_REQUIRED",
  "USER_APPROVED",
  "USER_APPROVAL_REJECTED",
  "PRICE_CHECKED",
  "PRICE_CHANGED",
  "PAYMENT_ORDER_CREATED",
  "PAYMENT_VERIFICATION_STARTED",
  "PAYMENT_SUCCEEDED",
  "PAYMENT_FAILED",
  "PAYMENT_PENDING",
  "WEBHOOK_RECEIVED",
  "WEBHOOK_PROCESSED",
  "WEBHOOK_FAILED",
  "DUPLICATE_PAYMENT_IGNORED",
  "TRANSACTION_CANCELLED",
  // Shopping flow
  "SHOPPING_SESSION_CREATED",
  "DISCOVERY_STARTED",
  "DISCOVERY_COMPLETED",
  "DISCOVERY_FAILED",
  "SHOPPING_SESSION_EXPIRED",
  "PRODUCT_SELECTED",
  "AUTHORITATIVE_AMOUNT_RESOLVED",
  "PRICE_REVALIDATION_PASSED",
  "PRICE_REVALIDATION_FAILED",
  // Browser / agent flow
  "BROWSER_SESSION_CREATED",
  "BROWSER_SESSION_EXPIRED",
  "BROWSER_OPERATION_FAILED",
  "AGENT_TIMEOUT",
  "AGENT_CANCELLED",
  // Recovery
  "RECOVERY_ATTEMPTED",
  "RESERVATION_SETTLED",
  "RESERVATION_RELEASED",
]);

/** Outcome classification for audit events. */
export const auditOutcome = pgEnum("audit_outcome", [
  "SUCCESS",
  "FAILURE",
  "PENDING",
  "TIMEOUT",
  "CANCELLED",
  "SKIPPED",
]);

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  transactionId: text("transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  userId: text("user_id"),
  eventType: auditEventType("event_type").notNull(),
  /** Correlation id linking related operations across the same request/user flow. */
  correlationId: text("correlation_id"),
  /** Shopping session id when the event relates to Part B. */
  shoppingSessionId: text("shopping_session_id"),
  /** Entity state before the operation (e.g. transaction status, session status). */
  previousState: text("previous_state"),
  /** Entity state after the operation. */
  resultingState: text("resulting_state"),
  /** Structured outcome classification. */
  outcome: auditOutcome("outcome"),
  /** Failure taxonomy code when the event represents a failure. */
  failureClassification: text("failure_classification"),
  reason: text("reason"),
  /** Small, non-secret event metadata (no card data, no secrets). */
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AuditEventRow = typeof auditEvents.$inferSelect;
export type NewAuditEventRow = typeof auditEvents.$inferInsert;
