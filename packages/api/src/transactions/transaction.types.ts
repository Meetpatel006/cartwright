import type { PaymentDecision } from "../payment-policy";
import type { TransactionStatus } from "./transaction.state";

/** How a transaction's payment is actually executed. */
export type PaymentSource = "agent_razorpay" | "merchant_ui" | "none";

/** A purchase proposal from the shopping agent, validated server-side. */
export interface PurchaseProposal {
  userId: string;
  /** Client idempotency key (unique per user) to dedupe retries. */
  idempotencyKey: string;
  merchantName?: string;
  merchantId?: string;
  /** Server-derived charged amount, integer minor units. */
  amountInMinor: number;
  currency: string;
  /** Browserbase/Stagehand checkout session for the merchant-UI path. */
  browserSessionId?: string;
}

/**
 * The view returned to clients. The backend is the source of truth — clients
 * never compute status/amounts, only display what the server returns.
 */
export interface TransactionResult {
  transactionId: string;
  status: TransactionStatus;
  amountInMinor: number;
  currency: string;
  approvedAmountInMinor: number | null;
  policyDecision: PaymentDecision;
  policyReason: string;
  autoApprovalLimitInMinor: number;
  maxTotalSpending: number;
  paymentSource: PaymentSource;
  failureReason?: string | null;
  browserSessionId?: string | null;
}

/**
 * Compact, display-oriented view used by the transaction list (no policy
 * recomputation). Includes the identifiers and display fields a list needs.
 */
export interface TransactionListView {
  transactionId: string;
  merchantName: string | null;
  merchantId: string | null;
  amountInMinor: number;
  currency: string;
  status: TransactionStatus;
  paymentSource: PaymentSource;
  failureReason: string | null;
  createdAt: Date;
}
