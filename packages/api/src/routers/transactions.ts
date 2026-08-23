import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { approveTransaction } from "../payments/payment-approval.service";
import { listAuditEvents } from "@cartwright/db/repositories/audit.repository";
import { toAuditEventView } from "../audit/audit.service";
import {
  cancelTransaction,
  getTransactionForUser,
  initiatePayment,
  listTransactionsForUser,
  toTransactionListView,
  verifyPayment,
} from "../transactions/transaction.service";

export const transactionsRouter = router({
  /**
   * Retrieve a transaction. Enforces ownership: a user can only read their own
   * transaction, identified by the server-issued transaction id.
   */
  get: protectedProcedure
    .input(z.object({ transactionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return getTransactionForUser(input.transactionId, ctx.session.user.id);
    }),

  /**
   * Approve a transaction that is awaiting user approval. Loads the transaction,
   * verifies ownership + AWAITING_APPROVAL + not expired, re-validates the
   * policy, then transitions to APPROVED. For the merchant-UI path it also
   * drives the retained Browserbase checkout session.
   */
  approve: protectedProcedure
    .input(
      z.object({
        transactionId: z.string().min(1),
        method: z.enum(["card", "wallet"]).optional().default("card"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return approveTransaction({
        transactionId: input.transactionId,
        userId: ctx.session.user.id,
        method: input.method,
      });
    }),

  /**
   * Reload an APPROVED transaction, re-validate the policy, and create a
   * server-side Razorpay order. The order amount/currency come from the
   * persisted transaction, never from the client.
   */
  initiatePayment: protectedProcedure
    .input(z.object({ transactionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return initiatePayment(input.transactionId, ctx.session.user.id);
    }),

  /**
   * Verify a Razorpay payment callback for a transaction the user owns.
   * Idempotent: a payment already settled returns the existing result.
   */
  verifyPayment: protectedProcedure
    .input(
      z.object({
        transactionId: z.string().min(1),
        orderId: z.string().min(1),
        paymentId: z.string().min(1),
        signature: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return verifyPayment(
        {
          transactionId: input.transactionId,
          orderId: input.orderId,
          paymentId: input.paymentId,
          signature: input.signature,
        },
        ctx.session.user.id,
      );
    }),

  /** Cancel an in-flight transaction and release any reservation. */
  cancel: protectedProcedure
    .input(z.object({ transactionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return cancelTransaction(input.transactionId, ctx.session.user.id);
    }),

  /** List the authenticated user's transactions, most recent first. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await listTransactionsForUser(ctx.session.user.id);
    return rows.map(toTransactionListView);
  }),

  /** List audit events for a transaction the user owns. */
  audit: protectedProcedure
    .input(z.object({ transactionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      // Enforce ownership before exposing the trail.
      await getTransactionForUser(input.transactionId, ctx.session.user.id);
      const events = await listAuditEvents({ transactionId: input.transactionId });
      return events.map(toAuditEventView);
    }),
});
