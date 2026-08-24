import { describe, expect, test } from "bun:test";

import { PaymentVerificationError } from "../transactions/transaction.errors";
import {
  classifyWebhookError,
  classifyWebhookOutcome,
} from "./razorpay-webhook.service";

describe("webhook HTTP classification (Task 3: retry safety)", () => {
  test("successful processing ACKs with 2xx so Razorpay stops retrying", () => {
    const mapped = classifyWebhookOutcome({
      handled: true,
      transactionId: "txn_1",
    });
    expect(mapped.status).toBe(200);
    expect(mapped.body.received).toBe(true);
  });

  test("permanent non-retryable payload (no matching transaction) also ACKs 2xx", () => {
    const mapped = classifyWebhookOutcome({
      handled: false,
      reason: "No transaction for this order.",
    });
    expect(mapped.status).toBe(200);
  });

  test("signature verification failures are 400, not 2xx and not 5xx", () => {
    const mapped = classifyWebhookError(
      new PaymentVerificationError("Razorpay webhook signature verification failed."),
    );
    expect(mapped.status).toBe(400);
    expect(mapped.body.received).toBe(false);
  });

  test("a transient database error returns 5xx so Razorpay RETRIES", () => {
    // This is the exact regression Task 3 guards against: returning 2xx here
    // permanently drops the payment settlement.
    const mapped = classifyWebhookError(new Error("connect ECONNREFUSED db"));
    expect(mapped.status).toBe(500);
    expect(mapped.body.received).toBe(false);
    // The body must never leak internal error details to the caller.
    expect(JSON.stringify(mapped.body)).not.toContain("ECONNREFUSED");
  });

  test("non-error throwables are still mapped to 5xx", () => {
    expect(classifyWebhookError("boom").status).toBe(500);
    expect(classifyWebhookError(undefined).status).toBe(500);
  });
});
