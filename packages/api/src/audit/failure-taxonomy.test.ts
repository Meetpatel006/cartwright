import { describe, expect, test } from "bun:test";

import {
  classifyError,
  classifyFailure,
  sanitizeErrorForResponse,
  type FailureCode,
} from "./failure-taxonomy";

describe("failure taxonomy", () => {
  describe("classifyFailure", () => {
    test("validates a known failure code", () => {
      const c = classifyFailure("VALIDATION_FAILURE");
      expect(c.code).toBe("VALIDATION_FAILURE");
      expect(c.retryable).toBe(false);
      expect(c.httpStatus).toBe(400);
      expect(c.auditRequired).toBe(true);
    });

    test("marks external provider transient as retryable", () => {
      expect(classifyFailure("EXTERNAL_PROVIDER_TRANSIENT").retryable).toBe(true);
    });

    test("marks database transient as retryable", () => {
      expect(classifyFailure("DATABASE_TRANSIENT").retryable).toBe(true);
    });

    test("marks no-products-found as retryable", () => {
      expect(classifyFailure("NO_PRODUCTS_FOUND").retryable).toBe(true);
    });

    test("marks webhook processing failed as retryable", () => {
      expect(classifyFailure("WEBHOOK_PROCESSING_FAILED").retryable).toBe(true);
    });

    test("marks session expired as non-retryable", () => {
      expect(classifyFailure("SESSION_EXPIRED").retryable).toBe(false);
    });

    test("marks payment failed as non-retryable", () => {
      expect(classifyFailure("PAYMENT_FAILED").retryable).toBe(false);
    });

    test("marks policy blocked as non-retryable", () => {
      expect(classifyFailure("POLICY_BLOCKED").retryable).toBe(false);
    });

    test("marks price changed as non-retryable", () => {
      expect(classifyFailure("PRICE_CHANGED").retryable).toBe(false);
    });

    test("returns INTERNAL_FAILURE for unknown codes", () => {
      const c = classifyFailure("UNKNOWN_CODE");
      expect(c.code).toBe("INTERNAL_FAILURE");
      expect(c.httpStatus).toBe(500);
    });

    test("returns INTERNAL_FAILURE for undefined", () => {
      const c = classifyFailure(undefined);
      expect(c.code).toBe("INTERNAL_FAILURE");
    });

    test("all failure codes have valid HTTP status", () => {
      const codes: FailureCode[] = [
        "VALIDATION_FAILURE", "AUTHORIZATION_FAILURE", "OWNERSHIP_FAILURE",
        "INVALID_STATE_TRANSITION", "POLICY_BLOCKED", "POLICY_BUDGET_EXHAUSTED",
        "PRICE_CHANGED", "CURRENCY_MISMATCH", "AMOUNT_MISMATCH",
        "SESSION_EXPIRED", "SESSION_NOT_FOUND", "SESSION_CONFLICT",
        "PRODUCT_NOT_IN_SESSION", "PRODUCT_FILTERED_OUT", "NO_PRODUCTS_FOUND",
        "BROWSER_SESSION_UNAVAILABLE", "BROWSER_SESSION_FORBIDDEN",
        "BROWSER_SESSION_INACTIVE", "BROWSER_OPERATION_FAILED",
        "AGENT_TIMEOUT", "AGENT_CANCELLED",
        "EXTERNAL_PROVIDER_TRANSIENT", "EXTERNAL_PROVIDER_PERMANENT",
        "PAYMENT_FAILED", "PAYMENT_PENDING", "PAYMENT_VERIFICATION_FAILED",
        "DUPLICATE_PAYMENT",
        "WEBHOOK_VERIFICATION_FAILED", "WEBHOOK_PROCESSING_FAILED",
        "WEBHOOK_PAYLOAD_INVALID",
        "DATABASE_TRANSIENT", "DATABASE_CONSTRAINT",
        "INTERNAL_FAILURE", "TIMEOUT", "CONFIGURATION_MISSING",
      ];
      for (const code of codes) {
        const c = classifyFailure(code);
        expect(c.httpStatus).toBeGreaterThanOrEqual(200);
        expect(c.httpStatus).toBeLessThanOrEqual(599);
        expect(c.userMessage.length).toBeGreaterThan(0);
        expect(typeof c.retryable).toBe("boolean");
        expect(typeof c.mayTransitionState).toBe("boolean");
      }
    });
  });

  describe("classifyError", () => {
    test("extracts code from error objects", () => {
      const error = new Error("test") as Error & { code: string };
      error.code = "VALIDATION_FAILURE";
      const c = classifyError(error);
      expect(c.code).toBe("VALIDATION_FAILURE");
    });

    test("defaults to INTERNAL_FAILURE for errors without code", () => {
      const c = classifyError(new Error("something broke"));
      expect(c.code).toBe("INTERNAL_FAILURE");
    });

    test("handles non-Error values", () => {
      expect(classifyError("string error").code).toBe("INTERNAL_FAILURE");
      expect(classifyError(null).code).toBe("INTERNAL_FAILURE");
      expect(classifyError(undefined).code).toBe("INTERNAL_FAILURE");
    });
  });

  describe("sanitizeErrorForResponse", () => {
    test("returns stable user message for known error", () => {
      const error = new Error("SQL connection refused") as Error & { code: string };
      error.code = "DATABASE_TRANSIENT";
      const result = sanitizeErrorForResponse(error);
      expect(result.code).toBe("DATABASE_TRANSIENT");
      expect(result.message).toBe("A temporary database error occurred.");
      expect(result.httpStatus).toBe(503);
    });

    test("does not leak internal error details", () => {
      const error = new Error("SQL connect ECONNREFUSED 10.0.0.1:5432") as Error & { code: string };
      error.code = "DATABASE_TRANSIENT";
      const result = sanitizeErrorForResponse(error);
      expect(result.message).not.toContain("ECONNREFUSED");
      expect(result.message).not.toContain("10.0.0.1");
    });

    test("never exposes stack traces", () => {
      const error = new Error("secret failure");
      error.stack = "Error: secret failure\n    at /internal/path/file.ts:42:10";
      const result = sanitizeErrorForResponse(error);
      expect(result.message).not.toContain("file.ts");
      expect(result.message).not.toContain("at /");
    });
  });
});
