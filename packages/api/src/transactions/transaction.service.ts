import { env } from "@cartwright/env/server";
import {
  type RazorpayConfig,
  createOrder,
  fetchOrder,
  fetchPayment,
  verifyPaymentSignature,
} from "@cartwright/agent";
import type { TransactionRow } from "@cartwright/db/schema";
import {
  getTransactionById,
  insertTransaction,
  listTransactions,
  updateTransaction,
} from "@cartwright/db/repositories/transaction.repository";
import {
  ensurePolicy,
  incrementConsumed,
} from "@cartwright/db/repositories/payment-policy.repository";
import {
  insertReservation,
  releaseReservation,
  settleReservation,
} from "@cartwright/db/repositories/spending.repository";

import { recordAuditEvent } from "../audit/audit.service";
import {
  evaluateUserPaymentPolicy,
  type PolicyEvaluationResult,
} from "../payments/payment-policy.service";
import { findTransactionByIdempotency } from "@cartwright/db/repositories/transaction.repository";
import { reconcilePayment } from "../payments/payment-reconciliation";
import {
  InvalidTransactionStateError,
  PaymentVerificationError,
  PriceChangedError,
  TransactionAlreadyProcessedError,
  TransactionNotFoundError,
  TransactionOwnershipError,
} from "./transaction.errors";
import { assertTransition, type TransactionStatus } from "./transaction.state";
import type {
  PaymentSource,
  PurchaseProposal,
  TransactionListView,
  TransactionResult,
} from "./transaction.types";

const APPROVAL_TTL_MINUTES = 15;

/**
 * Transition a transaction to PRICE_CHANGED, release its reservation, and throw.
 * Centralises the 3-step rejection that was duplicated across transaction and
 * payment-approval services.
 */
export async function rejectTransactionPriceChanged(
  transaction: TransactionRow,
  reason: string,
): Promise<never> {
  await applyTransition(transaction, "PRICE_CHANGED", {
    reason,
    audit: { eventType: "PRICE_CHANGED", reason },
  });
  await releaseReservation(transaction.id);
  throw new PriceChangedError(reason);
}

function getRazorpayConfig(): RazorpayConfig | null {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return null;
  return { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET };
}

function isTestModeSafe(config: RazorpayConfig): boolean {
  return env.RAZORPAY_MODE === "test" && config.keyId.startsWith("rzp_test_");
}

export function resolvePaymentSource(browserSessionId?: string | null): PaymentSource {
  if (browserSessionId) return "merchant_ui";
  if (
    env.AGENT_RAZORPAY_ORDER_FALLBACK === "true" &&
    env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") &&
    env.RAZORPAY_MODE === "test"
  ) {
    return "agent_razorpay";
  }
  return "none";
}

/** Map a transaction row to the client view. Policy decision is recomputed for display. */
export async function mapToResult(transaction: TransactionRow): Promise<TransactionResult> {
  let policy: PolicyEvaluationResult;
  try {
    policy = await evaluateUserPaymentPolicy({
      userId: transaction.userId,
      amountInMinor: transaction.amountInMinor,
      currency: transaction.currency,
      merchantName: transaction.merchantName ?? undefined,
    });
  } catch {
    policy = {
      decision: transaction.status === "POLICY_BLOCKED" ? "blocked" : "user_approval",
      reason: transaction.failureReason ?? "",
      maxTransactionAmount: 0,
      maxTotalSpending: 0,
      currency: transaction.currency,
      autoApprovalLimitInMinor: env.PAYMENT_AUTO_APPROVAL_LIMIT_PAISE,
    };
  }
  return {
    transactionId: transaction.id,
    status: transaction.status,
    amountInMinor: transaction.amountInMinor,
    currency: transaction.currency,
    approvedAmountInMinor: transaction.approvedAmountInMinor,
    policyDecision: policy.decision,
    policyReason: transaction.failureReason ?? policy.reason,
    autoApprovalLimitInMinor: policy.autoApprovalLimitInMinor,
    maxTotalSpending: policy.maxTotalSpending,
    paymentSource: resolvePaymentSource(transaction.browserSessionId),
    failureReason: transaction.failureReason,
    browserSessionId: transaction.browserSessionId,
  };
}

function requireOwned(transaction: TransactionRow | undefined, userId: string): TransactionRow {
  if (!transaction) throw new TransactionNotFoundError();
  if (transaction.userId !== userId) throw new TransactionOwnershipError();
  return transaction;
}

async function applyTransition(
  transaction: TransactionRow,
  to: TransactionStatus,
  opts?: {
    reason?: string;
    correlationId?: string;
    audit?: {
      eventType: Parameters<typeof recordAuditEvent>[0]["eventType"];
      reason?: string;
      metadata?: Record<string, unknown>;
      outcome?: "SUCCESS" | "FAILURE" | "PENDING" | "TIMEOUT" | "CANCELLED" | "SKIPPED";
      failureClassification?: string;
    };
  },
): Promise<TransactionRow> {
  assertTransition(transaction.status, to);
  const updated = await updateTransaction(transaction.id, {
    status: to,
    ...(opts?.reason ? { failureReason: opts.reason } : {}),
  });
  if (!updated) throw new TransactionNotFoundError();
  if (opts?.audit) {
    await recordAuditEvent({
      eventType: opts.audit.eventType,
      transactionId: transaction.id,
      userId: transaction.userId,
      correlationId: opts.correlationId,
      previousState: transaction.status,
      resultingState: to,
      reason: opts.audit.reason,
      outcome: opts.audit.outcome,
      failureClassification: opts.audit.failureClassification,
      metadata: opts.audit.metadata,
    });
  }
  return updated;
}

/**
 * Move a transaction to the terminal PAYMENT_FAILED state and release any
 * spending reservation. Safe to call from APPROVED (transitions through
 * PAYMENT_PROCESSING first) or PAYMENT_PROCESSING. If the transaction is in
 * some other (terminal or unexpected) state it only records an audit note so
 * a failed verification can never leave the trail silent.
 */
export async function failTransaction(
  transaction: TransactionRow,
  reason: string,
): Promise<TransactionRow> {
  let current = transaction;
  if (current.status === "APPROVED") {
    current = await applyTransition(current, "PAYMENT_PROCESSING");
  }
  if (current.status === "PAYMENT_PROCESSING") {
    current = await applyTransition(current, "PAYMENT_FAILED", {
      reason,
      audit: { eventType: "PAYMENT_FAILED", reason, outcome: "FAILURE", failureClassification: "PAYMENT_FAILED" },
    });
    await releaseReservation(current.id);
    await recordAuditEvent({
      eventType: "RESERVATION_RELEASED",
      transactionId: current.id,
      userId: transaction.userId,
      outcome: "SUCCESS",
      metadata: { releaseReason: reason },
    });
  } else {
    await recordAuditEvent({
      eventType: "PAYMENT_FAILED",
      transactionId: current.id,
      userId: current.userId,
      reason,
    });
  }
  return current;
}

/**
 * Create a persisted transaction from a purchase proposal, evaluate the policy
 * server-side, reserve spending, and transition to the correct state. Idempotent
 * per (user, idempotencyKey): a repeated key returns the original transaction.
 */
export async function createPurchaseTransaction(
  proposal: PurchaseProposal,
): Promise<TransactionResult> {
  const existing = await findTransactionByIdempotency(proposal.userId, proposal.idempotencyKey);
  if (existing) return mapToResult(existing);

  // Normalize + validate the amount is server-derived (never trusted from AI as final).
  const amountInMinor = Math.trunc(proposal.amountInMinor);
  const currency = proposal.currency.toUpperCase();

  const transaction = await insertTransaction({
    userId: proposal.userId,
    merchantId: proposal.merchantId ?? null,
    merchantName: proposal.merchantName ?? null,
    amountInMinor,
    currency,
    browserSessionId: proposal.browserSessionId ?? null,
    idempotencyKey: proposal.idempotencyKey,
    status: "CREATED",
    expiresAt: new Date(Date.now() + APPROVAL_TTL_MINUTES * 60_000),
  });

  await recordAuditEvent({
    eventType: "PURCHASE_REQUESTED",
    transactionId: transaction.id,
    userId: proposal.userId,
    correlationId: proposal.correlationId,
    metadata: {
      amountInMinor,
      currency,
      merchantName: proposal.merchantName ?? null,
      browserSessionId: proposal.browserSessionId ?? null,
    },
  });
  await recordAuditEvent({
    eventType: "TRANSACTION_CREATED",
    transactionId: transaction.id,
    userId: proposal.userId,
    correlationId: proposal.correlationId,
    metadata: { status: "CREATED" },
  });

  let current = await applyTransition(transaction, "POLICY_CHECKING", {
    correlationId: proposal.correlationId,
    audit: { eventType: "POLICY_CHECK_STARTED" },
  });

  const policy = await evaluateUserPaymentPolicy({
    userId: proposal.userId,
    amountInMinor,
    currency,
    merchantName: proposal.merchantName ?? undefined,
  });

  if (policy.decision === "blocked") {
    current = await applyTransition(current, "POLICY_BLOCKED", {
      reason: policy.reason,
      correlationId: proposal.correlationId,
      audit: { eventType: "POLICY_CHECK_FAILED", reason: policy.reason, outcome: "FAILURE", failureClassification: "POLICY_BLOCKED" },
    });
    return mapToResult(current);
  }

  // Reserve spending atomically (row-locked UPDATE). On budget exhaustion, block.
  const policyRow = await ensurePolicy(proposal.userId);
  const reserved = await incrementConsumed(proposal.userId, amountInMinor);
  if (!reserved) {
    current = await applyTransition(current, "POLICY_BLOCKED", {
      reason: `Payment exceeds the remaining spending budget (${policyRow.maxTotalSpending} ${policy.currency}).`,
      correlationId: proposal.correlationId,
      audit: {
        eventType: "POLICY_CHECK_FAILED",
        reason: "Spending budget exhausted",
        outcome: "FAILURE",
        failureClassification: "POLICY_BUDGET_EXHAUSTED",
      },
    });
    return mapToResult(current);
  }

  await insertReservation({
    userId: proposal.userId,
    transactionId: transaction.id,
    amountInMinor,
    currency,
    status: "RESERVED",
  });

  if (policy.decision === "user_approval") {
    current = await applyTransition(current, "AWAITING_APPROVAL", {
      correlationId: proposal.correlationId,
      audit: {
        eventType: "USER_APPROVAL_REQUIRED",
        reason: policy.reason,
        metadata: { amountInMinor, currency },
      },
    });
  } else {
    current = await applyTransition(current, "APPROVED", {
      correlationId: proposal.correlationId,
      audit: {
        eventType: "POLICY_CHECK_PASSED",
        reason: policy.reason,
        metadata: { amountInMinor, currency },
      },
    });
  }

  await recordAuditEvent({
    eventType: "SPENDING_RESERVED",
    transactionId: transaction.id,
    userId: proposal.userId,
    correlationId: proposal.correlationId,
    metadata: { amountInMinor, currency },
  });

  return mapToResult(current);
}

/** Load a transaction for the authenticated user, enforcing ownership. */
export async function loadOwnedTransaction(
  transactionId: string,
  userId: string,
): Promise<TransactionRow> {
  const transaction = await getTransactionById(transactionId);
  return requireOwned(transaction, userId);
}

/** Load a transaction for the authenticated user and map it to the client view. */
export async function getTransactionForUser(
  transactionId: string,
  userId: string,
): Promise<TransactionResult> {
  const transaction = await loadOwnedTransaction(transactionId, userId);
  return mapToResult(transaction);
}

/** List a user's transactions (most recent first). */
export async function listTransactionsForUser(
  userId: string,
): Promise<TransactionRow[]> {
  return listTransactions(userId);
}

/** Map a transaction row to the compact list view (no policy recomputation). */
export function toTransactionListView(row: TransactionRow): TransactionListView {
  return {
    transactionId: row.id,
    merchantName: row.merchantName,
    merchantId: row.merchantId,
    amountInMinor: row.amountInMinor,
    currency: row.currency,
    status: row.status,
    paymentSource: resolvePaymentSource(row.browserSessionId),
    failureReason: row.failureReason,
    createdAt: row.createdAt,
  };
}

/**
 * Reload a transaction, re-validate the policy against the persisted amount, and
 * create a Razorpay order. The order amount/currency come from the transaction
 * row — never from the client.
 */
export async function initiatePayment(
  transactionId: string,
  userId: string,
): Promise<{ transactionId: string; orderId: string; keyId: string; amountInMinor: number; currency: string }> {
  const transaction = requireOwned(await getTransactionById(transactionId), userId);

  if (transaction.status !== "APPROVED") {
    throw new InvalidTransactionStateError(
      `Cannot initiate payment from status ${transaction.status}`,
    );
  }

  const config = getRazorpayConfig();
  if (!config || !isTestModeSafe(config)) {
    throw new PaymentVerificationError(
      "Razorpay Test Mode is not configured; cannot create a server-side order.",
    );
  }

  // Re-validate in case the policy/budget changed since approval.
  const recheck = await evaluateUserPaymentPolicy({
    userId,
    amountInMinor: transaction.amountInMinor,
    currency: transaction.currency,
    merchantName: transaction.merchantName ?? undefined,
  });
  if (recheck.decision === "blocked") {
    await rejectTransactionPriceChanged(transaction, recheck.reason);
  }

  const order = await createOrder(config, {
    amountInMinor: transaction.amountInMinor,
    currency: transaction.currency,
    receipt: `cartwright-${transaction.id}`,
    notes: {
      transactionId: transaction.id,
      merchant: transaction.merchantName ?? "unknown",
      source: "cartwright-server",
      mode: "test",
    },
  });

  // APPROVED -> PAYMENT_PROCESSING through the centralised state machine
  // (assertTransition inside applyTransition), then persist the order id.
  await applyTransition(transaction, "PAYMENT_PROCESSING");
  const updated = await updateTransaction(transaction.id, {
    razorpayOrderId: order.id,
  });
  if (!updated) throw new TransactionNotFoundError();

  await recordAuditEvent({
    eventType: "PAYMENT_ORDER_CREATED",
    transactionId: transaction.id,
    userId,
    metadata: {
      razorpayOrderId: order.id,
      amountInMinor: transaction.amountInMinor,
      currency: transaction.currency,
    },
  });

  return {
    transactionId: transaction.id,
    orderId: order.id,
    keyId: config.keyId,
    amountInMinor: transaction.amountInMinor,
    currency: transaction.currency,
  };
}

/**
 * Verify a Razorpay payment callback. Idempotent: a payment already settled
 * returns the existing result without double-settling. The client supplies the
 * transactionId so ownership is enforced before any money moves.
 */
export async function verifyPayment(
  input: {
    transactionId: string;
    orderId: string;
    paymentId: string;
    signature: string;
  },
  userId: string,
): Promise<TransactionResult> {
  const transaction = requireOwned(await getTransactionById(input.transactionId), userId);

  if (transaction.status === "PAYMENT_SUCCEEDED") {
    await recordAuditEvent({
      eventType: "DUPLICATE_PAYMENT_IGNORED",
      transactionId: transaction.id,
      userId,
      reason: "Transaction already succeeded",
    });
    return mapToResult(transaction);
  }
  if (transaction.razorpayPaymentId === input.paymentId) {
    await recordAuditEvent({
      eventType: "DUPLICATE_PAYMENT_IGNORED",
      transactionId: transaction.id,
      userId,
      reason: "Payment id already processed",
    });
    return mapToResult(transaction);
  }

  const config = getRazorpayConfig();
  if (!config) throw new PaymentVerificationError("Razorpay is not configured.");

  if (!verifyPaymentSignature(config, input)) {
    await failTransaction(transaction, "Razorpay signature verification failed.");
    throw new PaymentVerificationError("Razorpay signature verification failed.");
  }

  await recordAuditEvent({
    eventType: "PAYMENT_VERIFICATION_STARTED",
    transactionId: transaction.id,
    userId,
    metadata: { orderId: input.orderId, paymentId: input.paymentId },
  });

  let payment: Awaited<ReturnType<typeof fetchPayment>>;
  let order: Awaited<ReturnType<typeof fetchOrder>>;
  try {
    [payment, order] = await Promise.all([
      fetchPayment(config, input.paymentId),
      fetchOrder(config, input.orderId),
    ]);
  } catch (error) {
    await failTransaction(
      transaction,
      error instanceof Error ? error.message : "Could not fetch Razorpay payment.",
    );
    throw new PaymentVerificationError(
      error instanceof Error ? error.message : "Could not fetch Razorpay payment.",
    );
  }

  if (payment.order_id !== input.orderId || order.id !== input.orderId) {
    await failTransaction(transaction, "Payment does not belong to this order.");
    throw new PaymentVerificationError("Payment does not belong to this order.");
  }
  if (payment.status !== "captured" && order.status !== "paid") {
    await failTransaction(transaction, `Payment is ${payment.status}; not captured.`);
    throw new PaymentVerificationError(`Payment is ${payment.status}; not captured.`);
  }
  // Amount/currency must match the persisted transaction — never the client's claim.
  if (payment.amount !== transaction.amountInMinor || payment.currency !== transaction.currency) {
    await failTransaction(transaction, "Payment amount/currency does not match the transaction.");
    throw new PaymentVerificationError("Payment amount/currency does not match the transaction.");
  }

  // Reconcile the captured amount against the authorized amount for the audit trail.
  const reconciliation = reconcilePayment({
    authorizedAmountInMinor: transaction.amountInMinor,
    authorizedCurrency: transaction.currency,
    capturedAmountInMinor: payment.amount,
    capturedCurrency: payment.currency,
  });

  let current = transaction;
  if (current.status === "APPROVED") {
    current = await applyTransition(current, "PAYMENT_PROCESSING");
  }    current = await applyTransition(current, "PAYMENT_SUCCEEDED", {
    audit: {
      eventType: "PAYMENT_SUCCEEDED",
      outcome: "SUCCESS",
      metadata: {
        razorpayPaymentId: payment.id,
        amountInMinor: payment.amount,
        reconciliation: {
          status: reconciliation.status,
          discrepancyInMinor: reconciliation.discrepancyInMinor,
          authorizedAmountInMinor: transaction.amountInMinor,
          capturedAmountInMinor: payment.amount,
          currency: payment.currency,
        },
      },
    },
  });
  // Record the actually captured amount (not just the authorized one).
  await updateTransaction(current.id, {
    razorpayPaymentId: payment.id,
    approvedAmountInMinor: payment.amount,
  });
  await settleReservation(current.id);
  await recordAuditEvent({
    eventType: "RESERVATION_SETTLED",
    transactionId: current.id,
    userId: transaction.userId,
    outcome: "SUCCESS",
    metadata: { amountInMinor: payment.amount, currency: payment.currency },
  });

  return mapToResult(current);
}

/** Cancel an in-flight transaction and release any reservation. */
export async function cancelTransaction(
  transactionId: string,
  userId: string,
): Promise<TransactionResult> {
  const transaction = requireOwned(await getTransactionById(transactionId), userId);

  if (transaction.status === "PAYMENT_SUCCEEDED" || transaction.status === "PAYMENT_FAILED") {
    throw new TransactionAlreadyProcessedError();
  }

  const current = await applyTransition(transaction, "CANCELLED", {
    audit: { eventType: "TRANSACTION_CANCELLED" },
  });
  await releaseReservation(transaction.id);
  await recordAuditEvent({
    eventType: "RESERVATION_RELEASED",
    transactionId: transaction.id,
    userId,
    outcome: "SUCCESS",
    metadata: { releaseReason: "transaction_cancelled" },
  });
  return mapToResult(current);
}
