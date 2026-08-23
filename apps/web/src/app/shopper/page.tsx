"use client";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Button } from "@cartwright/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@cartwright/ui/components/card";
import { Input } from "@cartwright/ui/components/input";
import { trpc } from "@/utils/trpc";

type TransactionStatus =
  | "CREATED"
  | "POLICY_CHECKING"
  | "POLICY_BLOCKED"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "PAYMENT_PROCESSING"
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_FAILED"
  | "PRICE_CHANGED"
  | "DUPLICATE_REQUEST"
  | "CANCELLED";

interface TransactionView {
  transactionId: string;
  status: TransactionStatus;
  amountInMinor: number;
  currency: string;
  approvedAmountInMinor: number | null;
  policyDecision: "auto_approve" | "user_approval" | "blocked";
  policyReason: string;
  autoApprovalLimitInMinor: number;
  maxTotalSpending: number;
  paymentSource: "agent_razorpay" | "merchant_ui" | "none";
  failureReason?: string | null;
  browserSessionId?: string | null;
}

interface ShopResult {
  sessionId?: string;
  query: string;
  store: string;
  currency: string;
  matches: Array<{ name: string; price: string; priceValue: number; url?: string; rating?: number; availability?: string }>;
  picked?: { name: string; price: string; priceValue: number; url?: string };
  basket?: Array<{ name: string; quantity: number; price: string; priceValue: number; currency: string; url?: string }>;
  checkout?: {
    status: string;
    steps: Array<{ action: string; status: string; detail?: string }>;
    orderSummary?: { items?: Array<{ name: string; price: string }>; subtotal?: string; tax?: string; shipping?: string; total?: string };
    orderSummarySource?: "merchant" | "basket";
    paymentGate?: { provider: "razorpay" | "unknown"; label: string };
    error?: string;
  };
  error?: string;
  purchase: TransactionView | null;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

/** Format a minor-unit amount in the given ISO currency (e.g. 799500 "INR" => "₹7,995.00"). */
function formatCurrency(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toLocaleString()}`;
  }
}

export default function ShopperPage() {
  const [query, setQuery] = useState("wireless headphones under $100");
  const [store, setStore] = useState("raven");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const shop = useMutation(trpc.agent.shop.mutationOptions());
  const approve = useMutation(trpc.transactions.approve.mutationOptions());
  const initiatePayment = useMutation(trpc.transactions.initiatePayment.mutationOptions());
  const verifyPayment = useMutation(trpc.transactions.verifyPayment.mutationOptions());
  const [razorpayReady, setRazorpayReady] = useState(false);

  const result = shop.data as ShopResult | undefined;
  const purchase = result?.purchase ?? null;
  const currency = result?.currency ?? "USD";
  const basketItemCount = result?.basket?.reduce((count, item) => count + item.quantity, 0) ?? 0;
  const [payMethod, setPayMethod] = useState<"card" | "wallet">("card");

  // Effective transaction view after approval/payment mutations.
  const baseView = approve.data?.result ?? purchase;
  const effectivePurchase: TransactionView | null =
    verifyPayment.data ??
    (initiatePayment.data && baseView
      ? {
          ...baseView,
          status: "PAYMENT_PROCESSING",
          amountInMinor: initiatePayment.data.amountInMinor,
          currency: initiatePayment.data.currency,
        }
      : baseView);
  const status: TransactionStatus | undefined = effectivePurchase?.status;
  const paymentSource = effectivePurchase?.paymentSource;
  const merchantResult = approve.data?.merchantResult;

  useEffectLoadRazorpay(setRazorpayReady);

  const openAgentRazorpayCheckout = () => {
    const init = initiatePayment.data;
    if (!init || !init.orderId || !init.keyId || !window.Razorpay) return;
    const checkout = new window.Razorpay({
      key: init.keyId,
      amount: init.amountInMinor,
      currency: init.currency ?? currency,
      name: result?.store ?? "Cartwright",
      description: result?.basket?.length
        ? `Cartwright basket: ${basketItemCount} items`
        : result?.picked
          ? `Cartwright purchase: ${result.picked.name}`
          : "Cartwright test purchase",
      order_id: init.orderId,
      handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        if (!effectivePurchase) return;
        verifyPayment.mutate({
          transactionId: effectivePurchase.transactionId,
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        });
      },
      theme: { color: "#111827" },
    });
    checkout.open();
  };

  const startPayment = () => {
    if (!effectivePurchase || status !== "APPROVED") return;
    initiatePayment.mutate({ transactionId: effectivePurchase.transactionId });
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Shopping Agent</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Ask for any product and budget — the agent browses the store, adds the pick to cart, and
        gates any purchase through a policy-controlled transaction. Approve purchases explicitly;
        the backend is the source of truth.
      </p>

      <form
        className="mb-8 grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setIdempotencyKey(crypto.randomUUID());
          shop.mutate({ query, store: store.trim() || undefined, idempotencyKey });
        }}
      >
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='e.g. "wireless headphones under $100"'
          />
          <Button type="submit" disabled={shop.isPending}>
            {shop.isPending ? "Agent is shopping…" : "Shop"}
          </Button>
        </div>
        <Input
          value={store}
          onChange={(event) => setStore(event.target.value)}
          placeholder='Store preset or URL, e.g. "raven"'
          aria-label="Store preset or URL"
        />
      </form>

      {shop.isPending && (
        <p className="text-sm text-muted-foreground">
          Launching a cloud browser session… watch it live at{" "}
          <a className="underline" href="https://www.browserbase.com/sessions" target="_blank" rel="noreferrer">
            browserbase.com/sessions
          </a>
        </p>
      )}

      {shop.isError && (
        <Card className="border-red-500/50">
          <CardHeader>
            <CardTitle className="text-red-500">Agent error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{String(shop.error)}</CardContent>
        </Card>
      )}

      {result && (
        <div className="grid gap-4">
          {result.error && <p className="text-sm text-red-500">{result.error}</p>}

          {result.basket?.length ? (
            <section className="rounded-lg border p-4">
              <h2 className="mb-2 font-medium">
                Requested basket ({basketItemCount} items) · {result.store}
              </h2>
              <ul className="grid gap-1 text-sm">
                {result.basket.map((item) => (
                  <li key={`${item.name}-${item.quantity}`} className="flex justify-between gap-4">
                    <span>{item.name} × {item.quantity}</span>
                    <span className="text-muted-foreground">{item.price} each</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : result.matches.length > 0 && (
            <section className="rounded-lg border p-4">
              <h2 className="mb-2 font-medium">
                Matches under budget ({result.matches.length}) · {result.store}
              </h2>
              <ul className="grid gap-1 text-sm">
                {result.matches.map((product) => (
                  <li key={`${product.name}-${product.priceValue}`} className="flex justify-between gap-4">
                    <span>
                      {product.name}
                      {product.rating !== undefined && <span className="ml-2 text-muted-foreground">★ {product.rating}</span>}
                    </span>
                    <span className="text-muted-foreground">{product.price}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.picked && (
            <Card>
              <CardHeader>
                <CardTitle>{result.basket?.length ? "Checkout ready" : "Pick of the run"}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                {!result.basket?.length && (
                  <p>
                    <span className="font-medium">{result.picked.name}</span> —{" "}
                    {formatCurrency(result.picked.priceValue * 100, currency)}
                    {result.picked.url && (
                      <>
                        {" "}
                        <a className="underline" href={result.picked.url} target="_blank" rel="noreferrer">
                          view
                        </a>
                      </>
                    )}
                  </p>
                )}
                {result.checkout && (
                  <div className="rounded-md border p-3 text-xs">
                    <p className="mb-1 font-medium uppercase tracking-wide">
                      On-site checkout · {result.checkout.status.replace(/_/g, " ")}
                    </p>
                    {result.checkout.steps.length > 0 && (
                      <ul className="grid gap-0.5 text-muted-foreground">
                        {result.checkout.steps.map((step) => (
                          <li key={step.action} className="flex justify-between gap-2">
                            <span>{step.action.replace(/_/g, " ")}</span>
                            <span>{step.status}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {result.checkout.orderSummary?.total && (
                      <p className="mt-1">
                        {result.checkout.orderSummarySource === "basket" ? "Basket total" : "Order total"}: {result.checkout.orderSummary.total}
                      </p>
                    )}
                    {result.checkout.paymentGate && (
                      <p className="mt-1 text-muted-foreground">
                        Merchant gate: {result.checkout.paymentGate.provider} · {result.checkout.paymentGate.label}
                      </p>
                    )}
                    {result.checkout.error && (
                      <p className={`mt-1 ${result.checkout.status === "failed" ? "text-red-500" : "text-muted-foreground"}`}>
                        {result.checkout.error}
                      </p>
                    )}
                  </div>
                )}

                {purchase && (
                  <TransactionPanel
                    purchase={effectivePurchase}
                    currency={currency}
                    status={status}
                    paymentSource={paymentSource}
                    merchantResult={merchantResult}
                    payMethod={payMethod}
                    setPayMethod={setPayMethod}
                    approveBusy={approve.isPending}
                    initiateBusy={initiatePayment.isPending}
                    verifyBusy={verifyPayment.isPending}
                    razorpayReady={razorpayReady}
                    onApprove={() =>
                      approve.mutate({
                        transactionId: purchase.transactionId,
                        method: payMethod,
                      })
                    }
                    onStartPayment={startPayment}
                    onOpenCheckout={openAgentRazorpayCheckout}
                    approveMessage={approve.data?.merchantResult?.message}
                    verifyMessage={verifyPayment.data ? "Payment verified." : verifyPayment.error ? String(verifyPayment.error) : undefined}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function TransactionPanel(props: {
  purchase: TransactionView | null;
  currency: string;
  status: TransactionStatus | undefined;
  paymentSource: TransactionView["paymentSource"] | undefined;
  merchantResult?: { status: string; message: string; provider?: string };
  payMethod: "card" | "wallet";
  setPayMethod: (m: "card" | "wallet") => void;
  approveBusy: boolean;
  initiateBusy: boolean;
  verifyBusy: boolean;
  razorpayReady: boolean;
  onApprove: () => void;
  onStartPayment: () => void;
  onOpenCheckout: () => void;
  approveMessage?: string;
  verifyMessage?: string;
}) {
  const { purchase, currency, status, paymentSource } = props;
  if (!purchase) return null;

  const blocked = status === "POLICY_BLOCKED" || status === "PRICE_CHANGED" || status === "CANCELLED" || status === "PAYMENT_FAILED";
  const tone = blocked
    ? "border-red-500/50 bg-red-500/5 text-red-600 dark:text-red-400"
    : "border-green-500/50 bg-green-500/5";

  return (
    <div className={`rounded-md border p-3 ${tone}`}>
      <p className="font-medium uppercase tracking-wide">{status?.replace(/_/g, " ")}</p>
      <p className="text-xs text-muted-foreground">Transaction: {purchase.transactionId}</p>

      <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
        <dt className="text-muted-foreground">Proposed amount</dt>
        <dd>{formatCurrency(purchase.amountInMinor, currency)}</dd>
        <dt className="text-muted-foreground">Approved amount</dt>
        <dd>{purchase.approvedAmountInMinor != null ? formatCurrency(purchase.approvedAmountInMinor, currency) : "—"}</dd>
        <dt className="text-muted-foreground">Spending limit</dt>
        <dd>{formatCurrency(purchase.maxTotalSpending, currency)}</dd>
        <dt className="text-muted-foreground">Auto-approve limit</dt>
        <dd>{formatCurrency(purchase.autoApprovalLimitInMinor, currency)}</dd>
        <dt className="text-muted-foreground">Policy</dt>
        <dd>{purchase.policyDecision.replace(/_/g, " ")}</dd>
      </dl>

      {purchase.policyReason && <p className="mt-2 text-xs text-muted-foreground">{purchase.policyReason}</p>}
      {purchase.failureReason && <p className="mt-1 text-xs text-red-500">{purchase.failureReason}</p>}

      {/* Blocked: nothing more to do. */}
      {blocked && null}

      {/* Merchant-UI payment method picker (shown whenever the merchant UI will be driven). */}
      {(status === "AWAITING_APPROVAL" || (status === "APPROVED" && paymentSource === "merchant_ui")) &&
        paymentSource === "merchant_ui" && (
          <div className="mt-3 flex gap-2" role="group" aria-label="Payment method">
            <Button variant={props.payMethod === "card" ? "default" : "outline"} onClick={() => props.setPayMethod("card")}>
              Card
            </Button>
            <Button variant={props.payMethod === "wallet" ? "default" : "outline"} onClick={() => props.setPayMethod("wallet")}>
              Wallet
            </Button>
          </div>
        )}

      {/* Awaiting user approval. */}
      {status === "AWAITING_APPROVAL" && (
        <Button className="mt-3" onClick={props.onApprove} disabled={props.approveBusy}>
          {props.approveBusy ? "Approving…" : "Approve transaction"}
        </Button>
      )}

      {/* Approved + merchant UI: a deliberate user action executes the merchant payment. */}
      {status === "APPROVED" && paymentSource === "merchant_ui" && (
        <Button className="mt-3" onClick={props.onApprove} disabled={props.approveBusy}>
          {props.approveBusy ? "Paying at merchant…" : "Approve & pay at merchant"}
        </Button>
      )}

      {/* Approved: agent_razorpay path still needs a server-side Razorpay order. */}
      {status === "APPROVED" && paymentSource === "agent_razorpay" && !props.merchantResult && (
        <Button className="mt-3" onClick={props.onStartPayment} disabled={props.initiateBusy}>
          {props.initiateBusy ? "Creating Razorpay order…" : "Continue to Razorpay TEST checkout"}
        </Button>
      )}

      {/* Razorpay checkout (after order created). */}
      {status === "PAYMENT_PROCESSING" && props.razorpayReady && (
        <Button className="mt-3" onClick={props.onOpenCheckout} disabled={props.verifyBusy}>
          {props.verifyBusy ? "Verifying payment…" : props.razorpayReady ? "Open Razorpay TEST checkout" : "Loading Razorpay…"}
        </Button>
      )}

      {/* Merchant UI submission result. */}
      {props.merchantResult && (
        <p className={`mt-2 ${props.merchantResult.status === "opened" || props.merchantResult.status === "submitted" ? "text-green-600" : "text-red-500"}`}>
          {props.merchantResult.message}
        </p>
      )}

      {props.verifyMessage && (
        <p className={`mt-2 ${status === "PAYMENT_SUCCEEDED" ? "text-green-600" : "text-red-500"}`}>{props.verifyMessage}</p>
      )}
    </div>
  );
}

/** Load the Razorpay checkout.js script once. */
function useEffectLoadRazorpay(setReady: (ready: boolean) => void) {
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return;
    ref.current = true;
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]');
    if (existing) {
      setReady(Boolean(window.Razorpay));
      existing.addEventListener("load", () => setReady(true), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () => setReady(true);
    document.body.appendChild(script);
  }, [setReady]);
}
