import { NextRequest, NextResponse } from "next/server";

import {
  classifyWebhookError,
  classifyWebhookOutcome,
  handleRazorpayWebhook,
} from "@cartwright/api/payments/razorpay-webhook.service";

/**
 * Razorpay webhook endpoint. This route does only three things:
 *   1. receive the raw request body,
 *   2. extract the signature header,
 *   3. delegate to the webhook service (signature verification, idempotency,
 *      transaction update, audit, reservation settlement).
 *
 * Retry safety (Task 3) — the status code is the contract with Razorpay:
 *   - success / permanent non-retryable payload  → 2xx (stop retrying)
 *   - PaymentVerificationError (bad signature)   → 400 (distinct, not retried
 *     as if successful)
 *   - ANY unexpected error (transient DB outage, bug) → 500 so Razorpay
 *     RETRIES instead of silently dropping the payment confirmation.
 *
 * No payment/business logic lives here; the status mapping lives in the
 * service (`classifyWebhookOutcome` / `classifyWebhookError`) where it is
 * unit-tested.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  try {
    const result = await handleRazorpayWebhook(rawBody, signature);
    const mapped = classifyWebhookOutcome(result);
    return NextResponse.json(mapped.body, { status: mapped.status });
  } catch (error) {
    const mapped = classifyWebhookError(error);
    if (mapped.status >= 500) {
      console.error("[razorpay:webhook] unexpected error", error);
    }
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
