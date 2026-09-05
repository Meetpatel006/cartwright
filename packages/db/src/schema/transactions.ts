import { relations } from "drizzle-orm";
import { integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Canonical transaction lifecycle. Every transition is validated by the
 * transaction state machine in `@cartwright/api`; string literals never
 * drive transitions directly.
 */
export const transactionStatus = pgEnum("transaction_status", [
  "CREATED",
  "POLICY_CHECKING",
  "POLICY_BLOCKED",
  "AWAITING_APPROVAL",
  "APPROVED",
  "PAYMENT_PROCESSING",
  "PAYMENT_SUCCEEDED",
  "PAYMENT_FAILED",
  "PRICE_CHANGED",
  "CANCELLED",
]);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Merchant id when known (e.g. a configured merchant account). */
    merchantId: text("merchant_id"),
    /** Human-readable merchant name from the shopping proposal. */
    merchantName: text("merchant_name"),
    /** Server-authoritative charged amount, in integer minor units. */
    amountInMinor: integer("amount_in_minor").notNull(),
    currency: text("currency").notNull(),
    /** Amount the user approved / that the policy cleared, in minor units. */
    approvedAmountInMinor: integer("approved_amount_in_minor"),
    status: transactionStatus("status").notNull().default("CREATED"),
    /** Browserbase/Stagehand checkout session id when the merchant UI path is used. */
    browserSessionId: text("browser_session_id"),
    razorpayOrderId: text("razorpay_order_id").unique(),
    razorpayPaymentId: text("razorpay_payment_id").unique(),
    /** Merchant's own order id captured from its confirmation page
     *  (merchant_ui path). Independent cross-verification key — never a
     *  Razorpay id, so it lives in its own column. */
    merchantOrderId: text("merchant_order_id"),
    /** Card/wallet method used for the merchant-UI drive. Card PAN/CVV are
     *  never stored — only the method label. */
    paymentMethod: text("payment_method"),
    /** Client-supplied idempotency key; unique per user to dedupe retries. */
    idempotencyKey: text("idempotency_key").notNull(),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    /** When the AWAITING_APPROVAL state is no longer actionable. */
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    uniqueIndex("transactions_user_idempotency_unq").on(
      table.userId,
      table.idempotencyKey,
    ),
    uniqueIndex("transactions_razorpay_order_unq").on(table.razorpayOrderId),
  ],
);

export const transactionRelations = relations(transactions, ({ one }) => ({
  user: one(user, {
    fields: [transactions.userId],
    references: [user.id],
  }),
}));

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
