/**
 * Centralized failure taxonomy for Part D.
 *
 * Every failure in the system must map to exactly one code from this taxonomy.
 * The code determines:
 *  - Whether the failure is retryable
 *  - Whether the failure may cause a state transition
 *  - How the failure is surfaced in audit events
 *  - What HTTP behavior is appropriate at API boundaries
 *
 * This module is pure — no DB, no side effects — so it can be imported and
 * tested anywhere.
 */

export type FailureCode =
  // Validation
  | "VALIDATION_FAILURE"
  // Authorization / ownership
  | "AUTHORIZATION_FAILURE"
  | "OWNERSHIP_FAILURE"
  // State machine
  | "INVALID_STATE_TRANSITION"
  // Policy
  | "POLICY_BLOCKED"
  | "POLICY_BUDGET_EXHAUSTED"
  // Price / amount
  | "PRICE_CHANGED"
  | "CURRENCY_MISMATCH"
  | "AMOUNT_MISMATCH"
  // Shopping session
  | "SESSION_EXPIRED"
  | "SESSION_NOT_FOUND"
  | "SESSION_CONFLICT"
  // Product selection
  | "PRODUCT_NOT_IN_SESSION"
  | "PRODUCT_FILTERED_OUT"
  | "NO_PRODUCTS_FOUND"
  // Browser / agent
  | "BROWSER_SESSION_UNAVAILABLE"
  | "BROWSER_SESSION_FORBIDDEN"
  | "BROWSER_SESSION_INACTIVE"
  | "BROWSER_OPERATION_FAILED"
  | "AGENT_TIMEOUT"
  | "AGENT_CANCELLED"
  // External provider
  | "EXTERNAL_PROVIDER_TRANSIENT"
  | "EXTERNAL_PROVIDER_PERMANENT"
  // Payment
  | "PAYMENT_FAILED"
  | "PAYMENT_PENDING"
  | "PAYMENT_VERIFICATION_FAILED"
  | "DUPLICATE_PAYMENT"
  // Webhook
  | "WEBHOOK_VERIFICATION_FAILED"
  | "WEBHOOK_PROCESSING_FAILED"
  | "WEBHOOK_PAYLOAD_INVALID"
  // Database
  | "DATABASE_TRANSIENT"
  | "DATABASE_CONSTRAINT"
  // Internal
  | "INTERNAL_FAILURE"
  | "TIMEOUT"
  | "CONFIGURATION_MISSING";

export interface FailureClassification {
  code: FailureCode;
  /** Whether the operation may be safely retried. */
  retryable: boolean;
  /** Whether the failure implies a state transition occurred. */
  mayTransitionState: boolean;
  /** Whether an audit event should be emitted. */
  auditRequired: boolean;
  /** Stable user-facing message key (no secrets, no internal details). */
  userMessage: string;
  /** HTTP status code appropriate for API boundary mapping. */
  httpStatus: number;
}

const CLASSIFICATIONS: Record<FailureCode, FailureClassification> = {
  VALIDATION_FAILURE: {
    code: "VALIDATION_FAILURE",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "Invalid input provided.",
    httpStatus: 400,
  },
  AUTHORIZATION_FAILURE: {
    code: "AUTHORIZATION_FAILURE",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "Authentication required.",
    httpStatus: 401,
  },
  OWNERSHIP_FAILURE: {
    code: "OWNERSHIP_FAILURE",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "You do not have access to this resource.",
    httpStatus: 403,
  },
  INVALID_STATE_TRANSITION: {
    code: "INVALID_STATE_TRANSITION",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "This operation is not allowed in the current state.",
    httpStatus: 409,
  },
  POLICY_BLOCKED: {
    code: "POLICY_BLOCKED",
    retryable: false,
    mayTransitionState: true,
    auditRequired: true,
    userMessage: "This payment is blocked by your spending policy.",
    httpStatus: 403,
  },
  POLICY_BUDGET_EXHAUSTED: {
    code: "POLICY_BUDGET_EXHAUSTED",
    retryable: false,
    mayTransitionState: true,
    auditRequired: true,
    userMessage: "Spending budget exhausted.",
    httpStatus: 403,
  },
  PRICE_CHANGED: {
    code: "PRICE_CHANGED",
    retryable: false,
    mayTransitionState: true,
    auditRequired: true,
    userMessage: "The price has changed since this was approved.",
    httpStatus: 409,
  },
  CURRENCY_MISMATCH: {
    code: "CURRENCY_MISMATCH",
    retryable: false,
    mayTransitionState: true,
    auditRequired: true,
    userMessage: "The currency has changed unexpectedly.",
    httpStatus: 409,
  },
  AMOUNT_MISMATCH: {
    code: "AMOUNT_MISMATCH",
    retryable: false,
    mayTransitionState: true,
    auditRequired: true,
    userMessage: "The charged amount does not match the authorized amount.",
    httpStatus: 409,
  },
  SESSION_EXPIRED: {
    code: "SESSION_EXPIRED",
    retryable: false,
    mayTransitionState: true,
    auditRequired: true,
    userMessage: "This session has expired.",
    httpStatus: 410,
  },
  SESSION_NOT_FOUND: {
    code: "SESSION_NOT_FOUND",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "Session not found.",
    httpStatus: 404,
  },
  SESSION_CONFLICT: {
    code: "SESSION_CONFLICT",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "A session with this identifier already exists.",
    httpStatus: 409,
  },
  PRODUCT_NOT_IN_SESSION: {
    code: "PRODUCT_NOT_IN_SESSION",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "The selected product is not part of this session.",
    httpStatus: 400,
  },
  PRODUCT_FILTERED_OUT: {
    code: "PRODUCT_FILTERED_OUT",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "This product was filtered out during ranking.",
    httpStatus: 400,
  },
  NO_PRODUCTS_FOUND: {
    code: "NO_PRODUCTS_FOUND",
    retryable: true,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "No matching products were found.",
    httpStatus: 404,
  },
  BROWSER_SESSION_UNAVAILABLE: {
    code: "BROWSER_SESSION_UNAVAILABLE",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "Browser checkout session is not available.",
    httpStatus: 409,
  },
  BROWSER_SESSION_FORBIDDEN: {
    code: "BROWSER_SESSION_FORBIDDEN",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "Browser session does not belong to this user.",
    httpStatus: 403,
  },
  BROWSER_SESSION_INACTIVE: {
    code: "BROWSER_SESSION_INACTIVE",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "Browser session is no longer active.",
    httpStatus: 410,
  },
  BROWSER_OPERATION_FAILED: {
    code: "BROWSER_OPERATION_FAILED",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "Browser operation failed.",
    httpStatus: 502,
  },
  AGENT_TIMEOUT: {
    code: "AGENT_TIMEOUT",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "The operation timed out.",
    httpStatus: 408,
  },
  AGENT_CANCELLED: {
    code: "AGENT_CANCELLED",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "The operation was cancelled.",
    httpStatus: 499,
  },
  EXTERNAL_PROVIDER_TRANSIENT: {
    code: "EXTERNAL_PROVIDER_TRANSIENT",
    retryable: true,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "An external service is temporarily unavailable.",
    httpStatus: 503,
  },
  EXTERNAL_PROVIDER_PERMANENT: {
    code: "EXTERNAL_PROVIDER_PERMANENT",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "An external service rejected the request.",
    httpStatus: 502,
  },
  PAYMENT_FAILED: {
    code: "PAYMENT_FAILED",
    retryable: false,
    mayTransitionState: true,
    auditRequired: true,
    userMessage: "Payment processing failed.",
    httpStatus: 402,
  },
  PAYMENT_PENDING: {
    code: "PAYMENT_PENDING",
    retryable: false,
    mayTransitionState: true,
    auditRequired: true,
    userMessage: "Payment is pending confirmation.",
    httpStatus: 202,
  },
  PAYMENT_VERIFICATION_FAILED: {
    code: "PAYMENT_VERIFICATION_FAILED",
    retryable: false,
    mayTransitionState: true,
    auditRequired: true,
    userMessage: "Payment verification failed.",
    httpStatus: 400,
  },
  DUPLICATE_PAYMENT: {
    code: "DUPLICATE_PAYMENT",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "This payment has already been processed.",
    httpStatus: 409,
  },
  WEBHOOK_VERIFICATION_FAILED: {
    code: "WEBHOOK_VERIFICATION_FAILED",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "Webhook verification failed.",
    httpStatus: 400,
  },
  WEBHOOK_PROCESSING_FAILED: {
    code: "WEBHOOK_PROCESSING_FAILED",
    retryable: true,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "Webhook processing failed.",
    httpStatus: 500,
  },
  WEBHOOK_PAYLOAD_INVALID: {
    code: "WEBHOOK_PAYLOAD_INVALID",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "Webhook payload is invalid.",
    httpStatus: 400,
  },
  DATABASE_TRANSIENT: {
    code: "DATABASE_TRANSIENT",
    retryable: true,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "A temporary database error occurred.",
    httpStatus: 503,
  },
  DATABASE_CONSTRAINT: {
    code: "DATABASE_CONSTRAINT",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "A data constraint was violated.",
    httpStatus: 409,
  },
  INTERNAL_FAILURE: {
    code: "INTERNAL_FAILURE",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "An internal error occurred.",
    httpStatus: 500,
  },
  TIMEOUT: {
    code: "TIMEOUT",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "The operation timed out.",
    httpStatus: 408,
  },
  CONFIGURATION_MISSING: {
    code: "CONFIGURATION_MISSING",
    retryable: false,
    mayTransitionState: false,
    auditRequired: true,
    userMessage: "A required configuration is missing.",
    httpStatus: 500,
  },
};

/**
 * Look up the classification for a failure code.
 * Returns a default INTERNAL_FAILURE classification for unknown codes.
 */
export function classifyFailure(code: string | undefined): FailureClassification {
  if (code && code in CLASSIFICATIONS) {
    return CLASSIFICATIONS[code as FailureCode];
  }
  return CLASSIFICATIONS.INTERNAL_FAILURE;
}

/**
 * Map a domain error to a failure code and classification.
 * The error's `code` property is used when available; otherwise the error
 * type name is inspected for a known pattern.
 */
export function classifyError(error: unknown): FailureClassification & { originalCode?: string } {
  const code = getErrorCode(error);
  const classification = classifyFailure(code);
  return { ...classification, originalCode: code };
}

/** Extract a stable error code from an error object, if present. */
export function getErrorCode(error: unknown): string | undefined {
  if (error instanceof Error) {
    const code = (error as unknown as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/**
 * Sanitize an error for user-facing API responses.
 * Returns a stable message and error code; internal details stay out of the
 * response body and are available only in audit logs.
 */
export function sanitizeErrorForResponse(error: unknown): {
  code: string;
  message: string;
  httpStatus: number;
} {
  const classification = classifyError(error);
  return {
    code: classification.code,
    message: classification.userMessage,
    httpStatus: classification.httpStatus,
  };
}
