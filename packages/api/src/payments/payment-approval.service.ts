import { approveMerchantPayment, getSessionCheckoutTotal } from "@cartwright/agent";
import { releaseReservation, settleReservation } from "@cartwright/db/repositories/spending.repository";
import type { TransactionRow } from "@cartwright/db/schema";
import { updateTransaction } from "@cartwright/db/repositories/transaction.repository";

import { recordAuditEvent } from "../audit/audit.service";
import { evaluateUserPaymentPolicy } from "./payment-policy.service";
import {
  InvalidTransactionStateError,
  PriceChangedError,
  TransactionNotFoundError,
} from "../transactions/transaction.errors";
import { assertTransition } from "../transactions/transaction.state";
import {
  getTransactionForUser,
  loadOwnedTransaction,
} from "../transactions/transaction.service";
import type { TransactionResult } from "../transactions/transaction.types";

export type MerchantApprovalResult = Awaited<ReturnType<typeof approveMerchantPayment>>;

export interface ApproveTransactionInput {
  transactionId: string;
  userId: string;
  method?: "card" | "wallet";
}

export interface ApproveTransactionOutput {
  result: TransactionResult;
  merchantResult?: MerchantApprovalResult;
}

/**
 * Approve a transaction that is awaiting user approval.
 *
 * Enforces, in order: ownership, AWAITING_APPROVAL state, not expired,
 * policy still passes (re-validation after the price may have changed), then
 * transitions to APPROVED. For the merchant-UI path it then drives the retained
 * Browserbase checkout session and settles the reservation. A blocked
 * transaction can never become approved.
 */
export async function approveTransaction(
  input: ApproveTransactionInput,
): Promise<ApproveTransactionOutput> {
  const transaction = await loadOwnedTransaction(input.transactionId, input.userId);

  // Entry states:
  //  - AWAITING_APPROVAL: the policy required an explicit approval step.
  //  - APPROVED + merchant session: the policy auto-approved, but the
  //    merchant-UI payment still needs a deliberate user action to execute
  //    (no silent auto-pay), so the same endpoint is reused to run it.
  const fromAwaiting = transaction.status === "AWAITING_APPROVAL";
  const fromApprovedMerchantUi =
    transaction.status === "APPROVED" && !!transaction.browserSessionId;
  if (!fromAwaiting && !fromApprovedMerchantUi) {
    throw new InvalidTransactionStateError(
      `Approval/execution is only allowed from AWAITING_APPROVAL (or APPROVED with a merchant session). Current: ${transaction.status}.`,
    );
  }

  // Re-run the policy. If the price/budget changed, the transaction cannot proceed.
  const recheck = await evaluateUserPaymentPolicy({
    userId: input.userId,
    amountInMinor: transaction.amountInMinor,
    currency: transaction.currency,
    merchantName: transaction.merchantName ?? undefined,
  });
  if (recheck.decision === "blocked") {
    const updated = await updateTransaction(transaction.id, {
      status: "PRICE_CHANGED",
      failureReason: recheck.reason,
    });
    if (updated) {
      await recordAuditEvent({
        eventType: "PRICE_CHANGED",
        transactionId: transaction.id,
        userId: input.userId,
        reason: recheck.reason,
      });
    }
    await releaseReservation(transaction.id);
    throw new PriceChangedError(recheck.reason);
  }

  // Best-effort live merchant price re-confirmation (item 4). We only block when
  // a HIGHER price is confirmed; an unreadable page never blocks the payment.
  if (transaction.browserSessionId) {
    const live = await reconfirmMerchantPrice(transaction);
    if (
      live &&
      live.currency.toUpperCase() === transaction.currency.toUpperCase() &&
      live.amountInMinor > transaction.amountInMinor
    ) {
      const reason = `Merchant price increased to ${live.amountInMinor} ${live.currency} (approved ${transaction.amountInMinor} ${transaction.currency}).`;
      const updated = await updateTransaction(transaction.id, {
        status: "PRICE_CHANGED",
        failureReason: reason,
      });
      if (updated) {
        await recordAuditEvent({
          eventType: "PRICE_CHANGED",
          transactionId: transaction.id,
          userId: input.userId,
          reason,
        });
      }
      await releaseReservation(transaction.id);
      throw new PriceChangedError(reason);
    }
  }

  if (fromAwaiting) {
    if (transaction.expiresAt && transaction.expiresAt.getTime() < Date.now()) {
      await releaseReservation(transaction.id);
      throw new InvalidTransactionStateError("Approval window for this transaction has expired.");
    }
    // AWAITING_APPROVAL -> APPROVED
    assertTransition(transaction.status, "APPROVED");
    const approved = await updateTransaction(transaction.id, { status: "APPROVED" });
    if (!approved) throw new TransactionNotFoundError("Failed to approve transaction");

    await recordAuditEvent({
      eventType: "USER_APPROVED",
      transactionId: transaction.id,
      userId: input.userId,
      metadata: { amountInMinor: transaction.amountInMinor, currency: transaction.currency },
    });
  }

  // Merchant-UI path: drive the retained Browserbase checkout session to pay.
  if (transaction.browserSessionId) {
    const merchantResult = await approveMerchantPayment(transaction.browserSessionId, {
      method: input.method ?? "card",
      completeTestPayment: true,
    });
    await recordAuditEvent({
      eventType: "PAYMENT_SUCCEEDED",
      transactionId: transaction.id,
      userId: input.userId,
      reason: `Merchant UI payment submitted: ${merchantResult.status}`,
      metadata: { merchantStatus: merchantResult.status, provider: merchantResult.provider ?? null },
    });
    await settleReservation(transaction.id);
    // Move to PAYMENT_PROCESSING so a second approval click cannot re-submit.
    await updateTransaction(transaction.id, { status: "PAYMENT_PROCESSING" });
    return {
      result: await getTransactionForUser(transaction.id, input.userId),
      merchantResult,
    };
  }

  return { result: await getTransactionForUser(transaction.id, input.userId) };
}

/** Read the live merchant total for a retained session (null on any failure). */
async function reconfirmMerchantPrice(
  transaction: TransactionRow,
): Promise<{ amountInMinor: number; currency: string } | null> {
  try {
    return await getSessionCheckoutTotal(transaction.browserSessionId!);
  } catch {
    return null;
  }
}
