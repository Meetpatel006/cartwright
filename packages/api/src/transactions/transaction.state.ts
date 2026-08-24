import type { TransactionRow } from "@cartwright/db/schema";

import { InvalidTransactionStateError } from "./transaction.errors";

export type TransactionStatus = TransactionRow["status"];

/**
 * Valid transaction transitions. Transitions are validated centrally — no string
 * literal in the codebase may move a transaction between states without passing
 * through `assertTransition`.
 */
const VALID_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  CREATED: ["POLICY_CHECKING", "CANCELLED"],
  POLICY_CHECKING: ["POLICY_BLOCKED", "AWAITING_APPROVAL", "APPROVED", "CANCELLED"],
  POLICY_BLOCKED: [],
  AWAITING_APPROVAL: ["APPROVED", "CANCELLED", "PRICE_CHANGED"],
  APPROVED: ["PAYMENT_PROCESSING", "PRICE_CHANGED", "CANCELLED"],
  PAYMENT_PROCESSING: ["PAYMENT_SUCCEEDED", "PAYMENT_FAILED", "CANCELLED"],
  PAYMENT_SUCCEEDED: [],
  PAYMENT_FAILED: [],
  PRICE_CHANGED: [],
  CANCELLED: [],
};

export function canTransition(from: TransactionStatus, to: TransactionStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TransactionStatus, to: TransactionStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransactionStateError(
      `Illegal transaction transition: ${from} -> ${to}`,
    );
  }
}

export function isTerminal(status: TransactionStatus): boolean {
  return (VALID_TRANSITIONS[status]?.length ?? 0) === 0;
}

/** Re-exported so callers import domain errors from one place. */
export { InvalidTransactionStateError } from "./transaction.errors";
