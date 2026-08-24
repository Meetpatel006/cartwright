import { env } from "@cartwright/env/server";
import {
  approveMerchantPayment,
  getSessionCheckoutTotal,
} from "@cartwright/agent";
import { releaseReservation, settleReservation } from "@cartwright/db/repositories/spending.repository";
import type { TransactionRow } from "@cartwright/db/schema";
import { updateTransaction } from "@cartwright/db/repositories/transaction.repository";

import { recordAuditEvent } from "../audit/audit.service";
import {
  BrowserSessionError,
  closeBrowserSession,
  getOwnedBrowserSession,
  type BrowserSessionCloseAdapter,
} from "../shopping/browser-session.service";
import { evaluateUserPaymentPolicy } from "./payment-policy.service";
import { evaluatePriceRevalidation } from "./price-revalidation";
import { evaluateMerchantPaymentOutcome } from "./merchant-payment-outcome";
import {
  InvalidTransactionStateError,
  PriceChangedError,
  TransactionNotFoundError,
} from "../transactions/transaction.errors";
import { assertTransition } from "../transactions/transaction.state";
import {
  failTransaction,
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
 * Injectable adapters (tests inject fakes; production uses the real agent).
 * Every default is the real production implementation.
 */
export interface ApproveTransactionDeps {
  driveMerchantPayment?: typeof approveMerchantPayment;
  readLiveCheckoutTotal?: typeof getSessionCheckoutTotal;
  closeProvider?: BrowserSessionCloseAdapter;
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
  deps: ApproveTransactionDeps = {},
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
    // Centralised state machine: AWAITING_APPROVAL/APPROVED -> PRICE_CHANGED.
    assertTransition(transaction.status, "PRICE_CHANGED");
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

  // Best-effort live merchant price re-confirmation (item 4). The currency-aware
  // decision (block on a higher price, or on a currency that no longer matches
  // the approved transaction) lives in a pure, unit-tested helper. An unreadable
  // page never blocks payment.
  if (transaction.browserSessionId) {
    const live = await reconfirmMerchantPrice(transaction, deps.readLiveCheckoutTotal);
    const { priceChanged, reason } = evaluatePriceRevalidation({
      approvedAmountInMinor: transaction.amountInMinor,
      approvedCurrency: transaction.currency,
      live,
    });
    if (priceChanged) {
      // Centralised state machine: AWAITING_APPROVAL/APPROVED -> PRICE_CHANGED.
      assertTransition(transaction.status, "PRICE_CHANGED");
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
      throw new PriceChangedError(reason!);
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
    // Ownership + liveness are enforced here: a session that is missing,
    // foreign, expired, or already closed cannot be used to drive a payment.
    const browserSession = await loadOwnedBrowserSession(
      transaction.browserSessionId,
      input.userId,
    );

    // Reserve the state BEFORE driving the payment: APPROVED ->
    // PAYMENT_PROCESSING, so a concurrent second approval click can never
    // double-submit. The transition is validated by the centralised machine.
    assertTransition("APPROVED", "PAYMENT_PROCESSING");
    const processing = await updateTransaction(transaction.id, {
      status: "PAYMENT_PROCESSING",
    });
    if (!processing) throw new TransactionNotFoundError();

    const drive = deps.driveMerchantPayment ?? approveMerchantPayment;
    const merchantResult = await drive(browserSession.providerSessionId, {
      method: input.method ?? "card",
      completeTestPayment: true,
      provider: browserSession.provider,
      ...(browserSession.provider === "browserbase" && {
        browserbaseApiKey: env.BROWSERBASE_API_KEY,
      }),
    });

    // Task 1 fix: the agent's returned status is NEVER proof of payment.
    // Success requires an independent, server-captured signal (the merchant's
    // own order-confirmation page). The outcome decides the terminal state:
    //   confirmed -> PAYMENT_SUCCEEDED + settle
    //   pending   -> stays PAYMENT_PROCESSING with an HONEST audit event and a
    //                held reservation (never a fake success)
    //   failed    -> failTransaction() => PAYMENT_FAILED + release
    const decision = evaluateMerchantPaymentOutcome(merchantResult);
    const closeOpts = { closeProvider: deps.closeProvider };

    if (decision.outcome === "confirmed") {
      assertTransition("PAYMENT_PROCESSING", "PAYMENT_SUCCEEDED");
      const settledRow = await updateTransaction(transaction.id, {
        status: "PAYMENT_SUCCEEDED",
        approvedAmountInMinor: transaction.amountInMinor,
      });
      if (!settledRow) throw new TransactionNotFoundError();
      await settleReservation(transaction.id);
      await recordAuditEvent({
        eventType: "PAYMENT_SUCCEEDED",
        transactionId: transaction.id,
        userId: input.userId,
        reason: decision.reason,
        metadata: {
          merchantStatus: merchantResult.status,
          provider: merchantResult.provider ?? null,
          orderConfirmation: merchantResult.orderConfirmation ?? null,
        },
      });
      await closeBrowserSession(transaction.browserSessionId, input.userId, closeOpts);
      return {
        result: await getTransactionForUser(transaction.id, input.userId),
        merchantResult,
      };
    }

    if (decision.outcome === "pending") {
      await recordAuditEvent({
        eventType: "PAYMENT_VERIFICATION_STARTED",
        transactionId: transaction.id,
        userId: input.userId,
        reason: decision.reason,
        metadata: {
          merchantStatus: merchantResult.status,
          provider: merchantResult.provider ?? null,
        },
      });
      await closeBrowserSession(transaction.browserSessionId, input.userId, closeOpts);
      return {
        result: await getTransactionForUser(transaction.id, input.userId),
        merchantResult,
      };
    }

    // outcome === "failed": real terminal failure + reservation release
    // (failTransaction also records the PAYMENT_FAILED audit event).
    await failTransaction(
      { ...processing, status: "PAYMENT_PROCESSING" },
      decision.reason,
    );
    await closeBrowserSession(transaction.browserSessionId, input.userId, closeOpts);
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
  readLiveCheckoutTotal?: typeof getSessionCheckoutTotal,
): Promise<{ amountInMinor: number; currency: string } | null> {
  const read = readLiveCheckoutTotal ?? getSessionCheckoutTotal;
  try {
    const browserSession = await getOwnedBrowserSession(
      transaction.browserSessionId!,
      transaction.userId,
    );
    return await read(browserSession.providerSessionId);
  } catch {
    // Missing/foreign/expired browser session → don't block on re-price.
    return null;
  }
}

/**
 * Resolve an owned, active browser session for the merchant-UI drive path.
 * A foreign, expired, or missing session is a hard failure (cannot pay through
 * someone else's or a dead browser), surfaced as a transaction-state error.
 */
async function loadOwnedBrowserSession(
  browserSessionId: string,
  userId: string,
) {
  try {
    return await getOwnedBrowserSession(browserSessionId, userId);
  } catch (error) {
    if (error instanceof BrowserSessionError) {
      throw new InvalidTransactionStateError(
        `Merchant checkout session unavailable: ${error.code}`,
      );
    }
    throw error;
  }
}
