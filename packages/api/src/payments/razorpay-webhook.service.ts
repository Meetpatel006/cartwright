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
import { reconcilePayment } from "./payment-reconciliation";

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

export interface WebhookHttpResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Map a successful processing result to the HTTP response. `handled === false`
 * covers permanent, non-retryable payloads (no order id / no matching
 * transaction): ACKing them with 2xx is correct because a retry would fail the
 * same way.
 */
export function classifyWebhookOutcome(result: WebhookHandleResult): WebhookHttpResponse {
  return { status: 200, body: { received: true, ...result } };
}

/**
 * Map a thrown error to the HTTP response (Task 3 / retry safety):
 *  - PaymentVerificationError (bad/missing signature, malformed body) → 400.
 *    Distinct from success and NOT retried as-if-successful.
 *  - ANY other error (transient DB outage, bug) → 500 so Razorpay RETRIES the
 *    delivery instead of permanently dropping the payment confirmation.
 */
export function classifyWebhookError(error: unknown): WebhookHttpResponse {
  if (error instanceof PaymentVerificationError) {
    return {
      status: 400,
      body: { received: false, error: error.message },
    };
  }
  return {
    status: 500,
    body: { received: false, error: "internal_error" },
  };
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

  const success = await finalizeSettlement(transaction, payment);
  return { handled: success, transactionId: transaction.id };
}

async function finalizeSettlement(
  transaction: TransactionRow,
  payment: WebhookPaymentEntity | undefined,
): Promise<boolean> {
  // The amount actually captured by the provider (falls back to the authorized
  // amount when the webhook omits the payment entity). In the normal path the
  // gate above has already rejected amount/currency mismatches, so this equals
  // the authorized amount.
  const capturedAmountInMinor = payment?.amount ?? transaction.amountInMinor;
  const capturedCurrency = payment?.currency ?? transaction.currency;

  const reconciliation = reconcilePayment({
    authorizedAmountInMinor: transaction.amountInMinor,
    authorizedCurrency: transaction.currency,
    capturedAmountInMinor,
    capturedCurrency,
  });

  const updated = await updateTransaction(transaction.id, {
    status: "PAYMENT_SUCCEEDED",
    razorpayPaymentId: payment?.id ?? null,
    approvedAmountInMinor: capturedAmountInMinor,
  });
  if (!updated) return false;
  await recordAuditEvent({
    eventType: "PAYMENT_SUCCEEDED",
    transactionId: transaction.id,
    userId: transaction.userId,
    reason: "Settled via Razorpay webhook",
    metadata: {
      razorpayPaymentId: payment?.id ?? null,
      amountInMinor: capturedAmountInMinor,
      reconciliation: {
        status: reconciliation.status,
        discrepancyInMinor: reconciliation.discrepancyInMinor,
        authorizedAmountInMinor: transaction.amountInMinor,
        capturedAmountInMinor,
        currency: capturedCurrency,
      },
    },
  });
  await settleReservation(transaction.id);
  return true;
}
