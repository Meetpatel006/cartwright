/**
 * Domain errors for the transaction/payment flow. These are mapped to tRPC /
 * HTTP responses at the boundary (see `mapDomainError`).
 */

export class TransactionNotFoundError extends Error {
  readonly code = "TRANSACTION_NOT_FOUND";
  constructor(message = "Transaction not found") {
    super(message);
    this.name = "TransactionNotFoundError";
  }
}

export class TransactionOwnershipError extends Error {
  readonly code = "OWNERSHIP";
  constructor(message = "This transaction does not belong to the authenticated user") {
    super(message);
    this.name = "TransactionOwnershipError";
  }
}

export class InvalidTransactionStateError extends Error {
  readonly code = "INVALID_STATE";
  constructor(message = "Invalid transaction state transition") {
    super(message);
    this.name = "InvalidTransactionStateError";
  }
}

export class PaymentPolicyViolationError extends Error {
  readonly code = "POLICY_VIOLATION";
  constructor(message = "Payment policy violation") {
    super(message);
    this.name = "PaymentPolicyViolationError";
  }
}

export class TransactionAlreadyProcessedError extends Error {
  readonly code = "ALREADY_PROCESSED";
  constructor(message = "Transaction has already been processed") {
    super(message);
    this.name = "TransactionAlreadyProcessedError";
  }
}

export class DuplicatePaymentError extends Error {
  readonly code = "DUPLICATE_PAYMENT";
  constructor(message = "This payment has already been processed") {
    super(message);
    this.name = "DuplicatePaymentError";
  }
}

export class PaymentVerificationError extends Error {
  readonly code = "VERIFICATION_FAILED";
  constructor(message = "Payment verification failed") {
    super(message);
    this.name = "PaymentVerificationError";
  }
}

export class PriceChangedError extends Error {
  readonly code = "PRICE_CHANGED";
  constructor(message = "Current merchant amount exceeds the approved amount") {
    super(message);
    this.name = "PriceChangedError";
  }
}

export const DOMAIN_ERROR_CODES = new Set([
  "TRANSACTION_NOT_FOUND",
  "OWNERSHIP",
  "INVALID_STATE",
  "POLICY_VIOLATION",
  "ALREADY_PROCESSED",
  "DUPLICATE_PAYMENT",
  "VERIFICATION_FAILED",
  "PRICE_CHANGED",
]);
