import type { TransactionRow } from "@cartwright/db/schema";
import {
  findTransactionByIdempotency,
  getTransactionByRazorpayPaymentId,
} from "@cartwright/db/repositories/transaction.repository";

/**
 * Idempotency helpers. Uniqueness is also enforced by database constraints
 * (unique (user_id, idempotency_key); unique razorpay_payment_id), but we
 * check explicitly first so we can return a clear, deduplicated result instead
 * of surfacing a constraint violation.
 */

export async function findExistingTransaction(
  userId: string,
  idempotencyKey: string,
): Promise<TransactionRow | undefined> {
  return findTransactionByIdempotency(userId, idempotencyKey);
}

export async function findProcessedPayment(
  razorpayPaymentId: string,
): Promise<TransactionRow | undefined> {
  return getTransactionByRazorpayPaymentId(razorpayPaymentId);
}
