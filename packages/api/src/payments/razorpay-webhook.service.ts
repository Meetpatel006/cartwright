import { env } from "@cartwright/env/server";
import { verifyWebhookSignature } from "@cartwright/agent";
import type { TransactionRow } from "@cartwright/db/schema";
import {
  getTransactionByRazorpayOrderId,
  updateTransaction,
} from "@cartwright/db/repositories/transaction.repository";
import { settleReservation } from "@cartwright/db/repositories/spending.repository";

import { recordAuditEvent } from "../audit/audit.service";
import { failTransaction } from "../transactions/transaction.service";
import { PaymentVerificationError } from "../transactions/transaction.errors";

interface WebhookPaymentEntity {
  order_id?: string;
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
}

interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    payment?: { entity?: WebhookPaymentEntity };
    order?: { entity?: WebhookPaymentEntity };
  };
}

export interface WebhookHandleResult {
  handled: boolean;
  transactionId?: string;
  reason?: string;
}

/**
 * Handle a raw Razorpay webhook delivery. Kept free of HTTP concerns (the route
 * only supplies the raw body + signature). Idempotent: a payment already
 * settled is recorded as a duplicate and not re-settled.
 */
export async function handleRazorpayWebhook(
  rawBody: string,
  signature: string | null,
): Promise<WebhookHandleResult> {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new PaymentVerificationError("Razorpay webhook secret is not configured.");
  }
  if (!signature) {
    throw new PaymentVerificationError("Missing Razorpay webhook signature.");
  }
  if (!verifyWebhookSignature(secret, rawBody, signature)) {
    throw new PaymentVerificationError("Razorpay webhook signature verification failed.");
  }

  let body: RazorpayWebhookBody;
  try {
    body = JSON.parse(rawBody) as RazorpayWebhookBody;
  } catch {
    throw new PaymentVerificationError("Malformed Razorpay webhook body.");
  }

  const event = body.event ?? "unknown";
  const payment = body.payload?.payment?.entity;
  const orderId = payment?.order_id ?? body.payload?.order?.entity?.id;
  const paymentId = payment?.id;

  await recordAuditEvent({
    eventType: "WEBHOOK_RECEIVED",
    reason: event,
    metadata: { orderId: orderId ?? null, paymentId: paymentId ?? null },
  });

  if (!orderId) {
    return { handled: false, reason: "No order id in webhook payload." };
  }

  const transaction = await getTransactionByRazorpayOrderId(orderId);
  if (!transaction) {
    return { handled: false, reason: "No transaction for this order." };
  }

  // Idempotency: already processed -> ignore duplicate delivery.
  if (transaction.status === "PAYMENT_SUCCEEDED" || transaction.razorpayPaymentId === paymentId) {
    await recordAuditEvent({
      eventType: "DUPLICATE_PAYMENT_IGNORED",
      transactionId: transaction.id,
      userId: transaction.userId,
      reason: "Webhook already processed",
    });
    return { handled: true, transactionId: transaction.id, reason: "Already processed" };
  }

  if (paymentId && payment) {
    if (
      payment.amount !== undefined &&
      payment.amount !== transaction.amountInMinor
    ) {
      await failTransaction(transaction, "Webhook amount does not match the transaction.");
      throw new PaymentVerificationError("Webhook amount does not match the transaction.");
    }
    if (payment.currency && payment.currency !== transaction.currency) {
      await failTransaction(transaction, "Webhook currency does not match the transaction.");
      throw new PaymentVerificationError("Webhook currency does not match the transaction.");
    }
  }

  const success = await finalizeSettlement(transaction, paymentId);
  return { handled: success, transactionId: transaction.id };
}

async function finalizeSettlement(
  transaction: TransactionRow,
  paymentId: string | undefined,
): Promise<boolean> {
  const updated = await updateTransaction(transaction.id, {
    status: "PAYMENT_SUCCEEDED",
    razorpayPaymentId: paymentId ?? null,
    approvedAmountInMinor: transaction.amountInMinor,
  });
  if (!updated) return false;
  await recordAuditEvent({
    eventType: "PAYMENT_SUCCEEDED",
    transactionId: transaction.id,
    userId: transaction.userId,
    reason: "Settled via Razorpay webhook",
    metadata: { razorpayPaymentId: paymentId ?? null, amountInMinor: transaction.amountInMinor },
  });
  await settleReservation(transaction.id);
  return true;
}
