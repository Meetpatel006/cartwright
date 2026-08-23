import { relations } from "drizzle-orm";
import { integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { transactions } from "./transactions";

/**
 * Durable spending reservation tied to a transaction. Replaces the previous
 * in-memory wallet ledger. One reservation per transaction.
 */
export const reservationStatus = pgEnum("reservation_status", [
  "RESERVED",
  "SETTLED",
  "RELEASED",
]);

export const spendingReservations = pgTable(
  "spending_reservations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    amountInMinor: integer("amount_in_minor").notNull(),
    currency: text("currency").notNull(),
    status: reservationStatus("status").notNull().default("RESERVED"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("spending_reservations_txn_unq").on(table.transactionId),
  ],
);

export const spendingReservationRelations = relations(
  spendingReservations,
  ({ one }) => ({
    transaction: one(transactions, {
      fields: [spendingReservations.transactionId],
      references: [transactions.id],
    }),
  }),
);

export type SpendingReservationRow = typeof spendingReservations.$inferSelect;
export type NewSpendingReservationRow = typeof spendingReservations.$inferInsert;
