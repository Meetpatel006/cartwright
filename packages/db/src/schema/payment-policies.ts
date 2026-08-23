import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Per-user payment policy. When a row does not exist we synthesize one from
 * the global environment defaults (see payment-policy.repository), so every
 * user always has an effective policy.
 *
 * `consumedInMinor` is a running total of currently-held (reserved) plus
 * settled spending for the user. It is mutated atomically by the spending
 * reservation repository so concurrent reservations cannot exceed
 * `maxTotalSpending` — the UPDATE takes a row lock and serializes.
 */
export const paymentPolicies = pgTable(
  "payment_policies",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Max single transaction amount, in integer minor units. */
    maxTransactionAmount: integer("max_transaction_amount").notNull(),
    /** Max total (held + settled) spending, in integer minor units. */
    maxTotalSpending: integer("max_total_spending").notNull(),
    currency: text("currency").notNull(),
    requireUserApproval: boolean("require_user_approval").notNull().default(false),
    /** Merchant names explicitly allowed; empty => allow all (unless blocked). */
    allowedMerchants: text("allowed_merchants").array().notNull().default([]),
    blockedMerchants: text("blocked_merchants").array().notNull().default([]),
    /** Max approvals per rolling hour; null => unlimited. */
    frequencyLimit: integer("frequency_limit"),
    /** Running reserved + settled total, in integer minor units. */
    consumedInMinor: integer("consumed_in_minor").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("payment_policies_user_unq").on(table.userId)],
);

export const paymentPolicyRelations = relations(paymentPolicies, ({ one }) => ({
  user: one(user, {
    fields: [paymentPolicies.userId],
    references: [user.id],
  }),
}));

export type PaymentPolicyRow = typeof paymentPolicies.$inferSelect;
export type NewPaymentPolicyRow = typeof paymentPolicies.$inferInsert;
