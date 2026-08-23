import { and, desc, eq } from "drizzle-orm";

import { db } from "../index";
import {
  type NewTransactionRow,
  type TransactionRow,
  transactions,
} from "../schema";

export async function insertTransaction(
  row: NewTransactionRow,
): Promise<TransactionRow> {
  const [created] = await db.insert(transactions).values(row).returning();
  if (!created) {
    throw new Error("Failed to insert transaction row");
  }
  return created;
}

export async function getTransactionById(
  id: string,
): Promise<TransactionRow | undefined> {
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  return rows[0];
}

export async function getTransactionByRazorpayOrderId(
  razorpayOrderId: string,
): Promise<TransactionRow | undefined> {
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.razorpayOrderId, razorpayOrderId))
    .limit(1);
  return rows[0];
}

export async function getTransactionByRazorpayPaymentId(
  razorpayPaymentId: string,
): Promise<TransactionRow | undefined> {
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.razorpayPaymentId, razorpayPaymentId))
    .limit(1);
  return rows[0];
}

/**
 * Idempotency lookup: same key submitted again by the same user returns the
 * original transaction instead of creating a duplicate.
 */
export async function findTransactionByIdempotency(
  userId: string,
  idempotencyKey: string,
): Promise<TransactionRow | undefined> {
  const rows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function updateTransaction(
  id: string,
  patch: Partial<NewTransactionRow>,
): Promise<TransactionRow | undefined> {
  const [updated] = await db
    .update(transactions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(transactions.id, id))
    .returning();
  return updated;
}

/** List a user's transactions, most recent first. */
export async function listTransactions(userId: string): Promise<TransactionRow[]> {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt));
}
