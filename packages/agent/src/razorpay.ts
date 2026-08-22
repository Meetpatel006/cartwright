import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
}

export const RazorpayOrderSchema = z.object({
  id: z.string(),
  amount: z.number(),
  currency: z.string(),
  status: z.string(),
  receipt: z.string().optional(),
});

export type RazorpayOrder = z.infer<typeof RazorpayOrderSchema>;

export const RazorpayPaymentSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  amount: z.number(),
  currency: z.string(),
  status: z.string(),
  captured: z.boolean().optional(),
});

export type RazorpayPayment = z.infer<typeof RazorpayPaymentSchema>;

function authHeader(config: RazorpayConfig): string {
  // Razorpay uses Basic auth: base64(key_id:key_secret)
  const token = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Create a Razorpay order. In TEST mode this is a simulation — no real money moves.
 * @param amountInMinor e.g. ₹7,995 => 799500 (minor units of `currency`)
 * @param currency ISO 4217 code, e.g. "INR", "USD"
 */
export async function createOrder(
  config: RazorpayConfig,
  options: {
    amountInMinor: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  },
): Promise<RazorpayOrder> {
  const response = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: authHeader(config),
    },
    body: JSON.stringify({
      amount: options.amountInMinor,
      currency: options.currency,
      receipt: options.receipt,
      notes: options.notes ?? {},
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Razorpay order creation failed (${response.status}): ${body}`);
  }

  return RazorpayOrderSchema.parse(await response.json());
}

/** Fetch an order to confirm its (test-mode) state after approval. */
export async function fetchOrder(config: RazorpayConfig, orderId: string): Promise<RazorpayOrder> {
  const response = await fetch(`${RAZORPAY_API_BASE}/orders/${orderId}`, {
    headers: { authorization: authHeader(config) },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Razorpay order fetch failed (${response.status}): ${body}`);
  }

  return RazorpayOrderSchema.parse(await response.json());
}

/** Verify the signature returned by Razorpay Standard Checkout. */
export function verifyPaymentSignature(
  config: RazorpayConfig,
  input: { orderId: string; paymentId: string; signature: string },
): boolean {
  const expected = createHmac("sha256", config.keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(input.signature, "utf8");
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

/** Fetch a payment so the server can confirm its final status after signature verification. */
export async function fetchPayment(config: RazorpayConfig, paymentId: string): Promise<RazorpayPayment> {
  const response = await fetch(`${RAZORPAY_API_BASE}/payments/${paymentId}`, {
    headers: { authorization: authHeader(config) },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Razorpay payment fetch failed (${response.status}): ${body}`);
  }

  return RazorpayPaymentSchema.parse(await response.json());
}
