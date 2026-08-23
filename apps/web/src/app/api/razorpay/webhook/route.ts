import { NextRequest, NextResponse } from "next/server";

import { handleRazorpayWebhook } from "@cartwright/api/payments/razorpay-webhook.service";
import { PaymentVerificationError } from "@cartwright/api/transactions/transaction.errors";

/**
 * Razorpay webhook endpoint. This route does only three things:
 *   1. receive the raw request body,
 *   2. extract the signature header,
 *   3. delegate to the webhook service (signature verification, idempotency,
 *      transaction update, audit, reservation settlement).
 *
 * No payment/business logic lives here.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  try {
    const result = await handleRazorpayWebhook(rawBody, signature);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    if (error instanceof PaymentVerificationError) {
      // Signature/verification failures are explicitly 400 so they are distinct
      // from successful processing (which Razorpay treats as 2xx = stop retry).
      return NextResponse.json({ received: false, error: error.message }, { status: 400 });
    }
    // Unexpected errors are still acknowledged as received to avoid retry storms,
    // but logged server-side.
    console.error("[razorpay:webhook] unexpected error", error);
    return NextResponse.json({ received: true, error: "accepted" }, { status: 200 });
  }
}
