import { z } from "zod";

import { env } from "@cartwright/env/server";
import {
  createOrder,
  fetchOrder,
  fetchPayment,
  parseBudget,
  approveMerchantPayment,
  runShoppingAgent,
  verifyPaymentSignature,
  type AgentBrowserMode,
  type CheckoutResult,
  type Product,
} from "@cartwright/agent";

import { publicProcedure, router } from "../index";
import { evaluatePaymentPolicy } from "../payment-policy";
import {
  bindWalletReservation,
  releaseExpiredWalletReservations,
  releaseWalletReservation,
  reservationForSession,
  reserveWallet,
  settleWalletReservation,
} from "../wallet-ledger";

export interface PurchaseGateResult {
  status:
    | "awaiting_approval"
    | "payment_submitted"
    | "merchant_action_required"
    | "insufficient_balance"
    | "not_configured"
    | "no_match"
    | "error";
  message: string;
  orderId?: string;
  /** Public Razorpay key id used by checkout.js; never expose the secret. */
  keyId?: string;
  amountInMinor?: number;
  currency?: string;
  /** What the charged amount was derived from — for the audit trail. */
  basis?: "checkout_total" | "basket_total" | "product_price";
  paymentProvider?: "razorpay" | "unknown";
  paymentSource?: "merchant_ui" | "agent_razorpay";
  policyDecision?: "auto_approve" | "user_approval" | "blocked";
  autoApprovalLimitInMinor?: number;
  policyReason?: string;
  walletReservationId?: string;
  walletRemainingInMinor?: number;
}

/**
 * Parse a human-readable amount like "$49.99", "₹7,995.00" or "1.299,00 €"
 * into minor units + ISO currency. Returns null when nothing parseable.
 */
function parseDisplayAmount(raw: string): { amountInMinor: number; currency: string } | null {
  if (!raw) return null;
  const symbolMap: Record<string, string> = {
    "₹": "INR", "rs": "INR", "inr": "INR",
    "$": "USD", "usd": "USD",
    "€": "EUR", "eur": "EUR",
    "£": "GBP", "gbp": "GBP",
    "¥": "JPY", "jpy": "JPY",
    "chf": "CHF",
  };
  let currency = "USD";
  for (const [sym, code] of Object.entries(symbolMap)) {
    if (raw.toLowerCase().includes(sym)) {
      currency = code;
      break;
    }
  }
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let num = raw.replace(/[^0-9.,]/g, "");
  if (!num) return null;
  if (hasComma && hasDot) {
    // dot = thousands, comma = decimal: "1.299,00"
    num = num.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    // "1,299" (thousands) vs "1,299.00"? treat ",XX" (2 digits) as decimal
    num = /,\d{2}$/.test(raw) ? num.replace(",", ".") : num.replace(/,/g, "");
  }
  const major = Number.parseFloat(num);
  if (Number.isNaN(major)) return null;
  return { amountInMinor: Math.round(major * 100), currency };
}

interface PurchaseRequest {
  picked: Product;
  /** Currency of the original query/budget (e.g. "USD"). */
  queryCurrency: string;
  /** Merchant the agent shopped on (for the audit trail). */
  store: string;
  /** Browserbase session id, if any (for replay/audit). */
  sessionId?: string;
  /** On-site add-to-cart / checkout result, if the agent reached checkout. */
  checkout?: CheckoutResult;
}

/**
 * Apply the purchase permission gate — bounded by the observed amount and
 * wallet balance. The merchant owns payment order creation and verification;
 * Cartwright never substitutes a second payment order.
 */
async function gatePurchase(req: PurchaseRequest): Promise<PurchaseGateResult> {
  // 1. Derive the charge from the REAL checkout when we have it, else the pick.
  const summaryTotal = req.checkout?.orderSummary?.total;
  const parsed = summaryTotal ? parseDisplayAmount(summaryTotal) : null;
  let amountInMinor: number;
  let currency: string;
  let basis: PurchaseGateResult["basis"];

  if (parsed && parsed.amountInMinor > 0) {
    amountInMinor = parsed.amountInMinor;
    currency = parsed.currency;
    basis = req.checkout?.orderSummarySource === "basket" ? "basket_total" : "checkout_total";
  } else {
    amountInMinor = Math.round(req.picked.priceValue * 100);
    currency = req.queryCurrency;
    basis = "product_price";
  }

  const policy = evaluatePaymentPolicy({
    amountInMinor,
    currency,
    walletBalanceInMinor: env.WALLET_BALANCE_PAISE,
    walletCurrency: env.WALLET_CURRENCY,
    autoApprovalLimitInMinor: env.PAYMENT_AUTO_APPROVAL_LIMIT_PAISE,
    mode: env.RAZORPAY_MODE,
  });
  releaseExpiredWalletReservations();

  if (policy.decision === "blocked") {
    return {
      status: policy.reason.includes("wallet spending balance") ? "insufficient_balance" : "error",
      message: `${policy.reason} Purchase blocked.`,
      amountInMinor,
      currency,
      basis,
      policyDecision: policy.decision,
      autoApprovalLimitInMinor: policy.autoApprovalLimitInMinor,
      policyReason: policy.reason,
    };
  }

  const merchantGate = req.checkout?.paymentGate;
  const reservation = reserveWallet({
    amountInMinor,
    currency,
    walletBalanceInMinor: env.WALLET_BALANCE_PAISE,
    walletCurrency: env.WALLET_CURRENCY,
  });
  if (!reservation.ok) {
    return {
      status: "insufficient_balance",
      message: `${reservation.reason} Purchase blocked.`,
      amountInMinor,
      currency,
      basis,
      policyDecision: "blocked",
      autoApprovalLimitInMinor: policy.autoApprovalLimitInMinor,
      policyReason: reservation.reason,
    };
  }
  if (!merchantGate) {
    if (env.AGENT_RAZORPAY_ORDER_FALLBACK === "true") {
      if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
        releaseWalletReservation(reservation.reservationId);
        return {
          status: "not_configured",
          message: "The agent Razorpay adapter is enabled, but Razorpay test keys are not configured.",
          amountInMinor,
          currency,
          basis,
          policyDecision: policy.decision,
          autoApprovalLimitInMinor: policy.autoApprovalLimitInMinor,
          policyReason: policy.reason,
        };
      }
      if (env.RAZORPAY_MODE !== "test" || !env.RAZORPAY_KEY_ID.startsWith("rzp_test_")) {
        releaseWalletReservation(reservation.reservationId);
        return {
          status: "error",
          message: "Refusing the agent Razorpay adapter: only rzp_test_ keys are allowed while RAZORPAY_MODE is test.",
          amountInMinor,
          currency,
          basis,
          policyDecision: policy.decision,
          autoApprovalLimitInMinor: policy.autoApprovalLimitInMinor,
          policyReason: policy.reason,
        };
      }
      try {
        const order = await createOrder(
          { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET },
          {
            amountInMinor,
            currency,
            receipt: `cartwright-agent-${Date.now()}`,
            notes: {
              merchant: req.store,
              source: "cartwright-agent-razorpay-adapter",
              mode: "test",
              basis: basis ?? "product_price",
            },
          },
        );
        return {
          status: "awaiting_approval",
          message: `Razorpay TEST order ${order.id} created by the explicit agent adapter for ${currency} ${(amountInMinor / 100).toLocaleString()}. This is not the merchant UI checkout; it uses the configured merchant/test account and still requires the Checkout approval button.`,
          orderId: order.id,
          keyId: env.RAZORPAY_KEY_ID,
          amountInMinor,
          currency,
          basis,
          paymentSource: "agent_razorpay",
          policyDecision: policy.decision,
          autoApprovalLimitInMinor: policy.autoApprovalLimitInMinor,
          policyReason: policy.reason,
          walletReservationId: reservation.reservationId,
          walletRemainingInMinor: reservation.remainingInMinor,
        };
      } catch (error) {
        releaseWalletReservation(reservation.reservationId);
        return {
          status: "error",
          message: `Could not create the agent Razorpay Test order: ${error instanceof Error ? error.message : "unknown error"}`,
          amountInMinor,
          currency,
          basis,
          policyDecision: policy.decision,
          autoApprovalLimitInMinor: policy.autoApprovalLimitInMinor,
          policyReason: policy.reason,
        };
      }
    }
    releaseWalletReservation(reservation.reservationId);
    return {
      status: "error",
      message: "No merchant payment gate was detected from the black-box checkout. No Razorpay order was created and no payment was attempted.",
      amountInMinor,
      currency,
      basis,
      policyDecision: policy.decision,
      autoApprovalLimitInMinor: policy.autoApprovalLimitInMinor,
      policyReason: policy.reason,
    };
  }
  if (req.sessionId) bindWalletReservation(req.sessionId, reservation.reservationId);
  if (policy.decision === "auto_approve" && merchantGate.provider === "razorpay" && req.sessionId) {
      const opened = await approveMerchantPayment(req.sessionId, { completeTestPayment: true });
      if (opened.status !== "submitted") releaseWalletReservation(reservation.reservationId);
      return {
        status: opened.status === "submitted" ? "payment_submitted" : "error",
        message: `${opened.message} Policy: ${policy.reason}`,
        amountInMinor,
        currency,
        basis,
        paymentProvider: merchantGate.provider,
        policyDecision: policy.decision,
        autoApprovalLimitInMinor: policy.autoApprovalLimitInMinor,
        policyReason: policy.reason,
        walletReservationId: reservation.reservationId,
        walletRemainingInMinor: reservation.remainingInMinor,
      };
  }
  return {
    status: "merchant_action_required",
    message: `Merchant payment gate detected (${merchantGate.provider}) as “${merchantGate.label}”. ${policy.reason} Cartwright did not create a second Razorpay order. The merchant checkout must create and verify its own order after explicit payment approval.`,
    amountInMinor,
    currency,
    basis,
    paymentProvider: merchantGate.provider,
    policyDecision: policy.decision,
    autoApprovalLimitInMinor: policy.autoApprovalLimitInMinor,
    policyReason: policy.reason,
    walletReservationId: reservation.reservationId,
    walletRemainingInMinor: reservation.remainingInMinor,
  };
}

/**
 * Decide which browser backend the shopping agent runs on:
 * - SHOPPING_AGENT_BROWSER env flag wins when set ("local" | "browserbase")
 * - otherwise: "browserbase" in production, free local Chrome in development/test
 */
function resolveAgentBrowserMode(): AgentBrowserMode {
  if (env.SHOPPING_AGENT_BROWSER) return env.SHOPPING_AGENT_BROWSER;
  return env.NODE_ENV === "production" ? "browserbase" : "local";
}

function parseRavenBasket(query: string, store: string | undefined) {
  if (store?.toLowerCase() !== "raven") return undefined;
  const gardeniaMatch = query.match(/(?:(\d+)\s+)?gardenia/i);
  const darkOceanMatch = query.match(/(?:(\d+)\s+)?dark\s+ocean/i);
  const badBoyMatch = query.match(/(?:(\d+)\s+)?bad\s+boy/i);
  if (!gardeniaMatch && !darkOceanMatch && !badBoyMatch) return undefined;
  return [
    ...(gardeniaMatch ? [{ name: "Gardenia", quantity: Number(gardeniaMatch[1] ?? 1) }] : []),
    ...(darkOceanMatch ? [{ name: "Dark Ocean", quantity: Number(darkOceanMatch[1] ?? 1) }] : []),
    ...(badBoyMatch ? [{ name: "Bad Boy", quantity: Number(badBoyMatch[1] ?? 1) }] : []),
  ];
}

export const agentRouter = router({
  shop: publicProcedure
    .input(
      z.object({
        query: z.string().min(3).describe('e.g. "wireless headphones under $100"'),
        store: z.string().min(1).optional().describe('store preset or URL, e.g. "raven"'),
      }),
    )
    .mutation(async ({ input }) => {
      const budget = parseBudget(
        input.query,
        input.store?.toLowerCase() === "raven" ? "INR" : env.WALLET_CURRENCY,
      ) ?? {
        amountInMinor: env.WALLET_BALANCE_PAISE,
        currency: env.WALLET_CURRENCY,
      };

      const mode = resolveAgentBrowserMode();
      const basket = parseRavenBasket(input.query, input.store);
      const result = await runShoppingAgent({
        query: input.query,
        store: input.store,
        basket,
        preserveCheckoutSession: true,
        budgetInMinor: budget.amountInMinor,
        currency: budget.currency,
        mode,
        browserbaseApiKey:
          mode === "browserbase" ? env.BROWSERBASE_API_KEY : undefined,
        llm:
          mode === "local" &&
          env.AGENT_LLM_BASE_URL &&
          env.AGENT_LLM_MODEL
            ? {
                baseURL: env.AGENT_LLM_BASE_URL,
                model: env.AGENT_LLM_MODEL,
                apiKey: env.AGENT_LLM_API_KEY,
                ...(env.AGENT_LLM_API_KEY_FALLBACK && {
                  apiKeys: [env.AGENT_LLM_API_KEY, env.AGENT_LLM_API_KEY_FALLBACK].filter(
                    Boolean,
                  ) as string[],
                }),
                debug: env.AGENT_DEBUG !== undefined,
                ...(env.AGENT_LLM_EXTRA_BODY && {
                  extraBody: JSON.parse(env.AGENT_LLM_EXTRA_BODY) as Record<string, unknown>,
                }),
              }
            : undefined,
      });

      if (!result.picked) {
        const purchase: PurchaseGateResult = {
          status: result.error ? "error" : "no_match",
          message:
            result.error ??
            "No products under budget were found on this run.",
        };
        return { ...result, purchase };
      }

      const purchase = await gatePurchase({
        picked: result.picked,
        queryCurrency: result.currency,
        store: result.store,
        sessionId: result.sessionId,
        checkout: result.checkout,
      });
      return { ...result, purchase };
    }),
  approveMerchantPayment: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const result = await approveMerchantPayment(input.sessionId);
      const reservationId = reservationForSession(input.sessionId);
      if (result.status === "failed" || result.status === "expired" || result.status === "not_found") {
        releaseWalletReservation(reservationId);
      }
      return result;
    }),
  verifyPayment: publicProcedure
    .input(
      z.object({
        orderId: z.string().min(1),
        paymentId: z.string().min(1),
        signature: z.string().min(1),
        sessionId: z.string().min(1).optional(),
        reservationId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
        return { status: "not_configured" as const, message: "Razorpay test keys are not configured." };
      }

      const config = { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET };
      if (!verifyPaymentSignature(config, input)) {
        if (input.sessionId) releaseWalletReservation(reservationForSession(input.sessionId));
        return { status: "verification_failed" as const, message: "Razorpay signature verification failed." };
      }

      try {
        const [payment, order] = await Promise.all([
          fetchPayment(config, input.paymentId),
          fetchOrder(config, input.orderId),
        ]);
        if (payment.order_id !== input.orderId || order.id !== input.orderId) {
          return { status: "verification_failed" as const, message: "Payment does not belong to this order." };
        }
        if (payment.status !== "captured" && order.status !== "paid") {
          return { status: "pending" as const, message: `Payment is ${payment.status}.` };
        }
        settleWalletReservation(input.reservationId ?? (input.sessionId ? reservationForSession(input.sessionId) : undefined));
        return {
          status: "paid" as const,
          message: `Razorpay TEST payment ${payment.id} verified and captured.`,
          orderId: input.orderId,
          paymentId: payment.id,
        };
      } catch (error) {
        return {
          status: "verification_failed" as const,
          message: error instanceof Error ? error.message : "Could not verify Razorpay payment.",
        };
      }
    }),
});
