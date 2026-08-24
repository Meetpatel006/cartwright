/**
 * Part B typed errors.
 *
 * Every error carries a stable `code` (mirroring the convention used by Part A's
 * `transaction.errors.ts`) and an optional `context` object with useful
 * debugging detail. They are deliberately specific — "Something went wrong" is
 * banned — and they never leak secrets (no prices beyond the public budget, no
 * browser-session internals, no LLM keys).
 *
 * These are distinct from Part A's transaction errors; the API maps the Part B
 * `code` to a tRPC error separately.
 */

export class ShoppingError extends Error {
  readonly code: string;
  /** Non-sensitive internal context for logs/debugging. */
  readonly context?: Record<string, unknown>;
  constructor(code: string, message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
  }
}

/** The natural-language request could not be parsed into a valid intent. */
export class ShoppingRequestValidationError extends ShoppingError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("SHOPPING_REQUEST_INVALID", message, context);
  }
}

/** The discovery (browser automation) layer failed outright. */
export class ProductDiscoveryError extends ShoppingError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("PRODUCT_DISCOVERY_FAILED", message, context);
  }
}

/** Discovery returned no usable candidates at all. */
export class NoProductsFoundError extends ShoppingError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("NO_PRODUCTS_FOUND", message, context);
  }
}

/** A product candidate could not be normalized into the stable schema. */
export class ProductNormalizationError extends ShoppingError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("PRODUCT_NORMALIZATION_FAILED", message, context);
  }
}

/** The agent returned structurally invalid product data (Zod boundary failure). */
export class ProductDataValidationError extends ShoppingError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("PRODUCT_DATA_INVALID", message, context);
  }
}

/** A referenced merchant is not allowed (policy/intent block-list). */
export class MerchantValidationError extends ShoppingError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("MERCHANT_INVALID", message, context);
  }
}

/** A persisted shopping session is missing or past its validity window. */
export class ShoppingSessionExpiredError extends ShoppingError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("SHOPPING_SESSION_EXPIRED", message, context);
  }
}

/** The user selected a product that is not part of the session's recommendations. */
export class ProductNotInSessionError extends ShoppingError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("PRODUCT_NOT_IN_SESSION", message, context);
  }
}

/** A purchase plan referenced an amount/currency that could not be validated. */
export class PurchasePlanValidationError extends ShoppingError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("PURCHASE_PLAN_INVALID", message, context);
  }
}

export const PART_B_ERROR_CODES = new Set([
  "SHOPPING_REQUEST_INVALID",
  "PRODUCT_DISCOVERY_FAILED",
  "NO_PRODUCTS_FOUND",
  "PRODUCT_NORMALIZATION_FAILED",
  "PRODUCT_DATA_INVALID",
  "MERCHANT_INVALID",
  "SHOPPING_SESSION_EXPIRED",
  "PRODUCT_NOT_IN_SESSION",
  "PURCHASE_PLAN_INVALID",
]);
