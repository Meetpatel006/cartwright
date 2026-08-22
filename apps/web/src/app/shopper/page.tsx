"use client";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button } from "@cartwright/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@cartwright/ui/components/card";
import { Input } from "@cartwright/ui/components/input";
import { trpc } from "@/utils/trpc";

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
  purchase: {
    status: string;
    message: string;
    orderId?: string;
    keyId?: string;
    amountInMinor?: number;
    currency?: string;
    basis?: string;
    policyDecision?: "auto_approve" | "user_approval" | "blocked";
    autoApprovalLimitInMinor?: number;
    policyReason?: string;
    walletReservationId?: string;
    walletRemainingInMinor?: number;
    paymentSource?: "merchant_ui" | "agent_razorpay";
  };
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
  const shop = useMutation(trpc.agent.shop.mutationOptions());
  const approveMerchantPayment = useMutation(trpc.agent.approveMerchantPayment.mutationOptions());
  const verifyPayment = useMutation(trpc.agent.verifyPayment.mutationOptions());
  const [razorpayReady, setRazorpayReady] = useState(false);

  const result = shop.data as ShopResult | undefined;
  const currency = result?.currency ?? "USD";
  const basketItemCount = result?.basket?.reduce((count, item) => count + item.quantity, 0) ?? 0;

  useEffect(() => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]');
    if (existing) {
      setRazorpayReady(Boolean(window.Razorpay));
      existing.addEventListener("load", () => setRazorpayReady(true), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () => setRazorpayReady(true);
    document.body.appendChild(script);
  }, []);

  const openAgentRazorpayCheckout = () => {
    if (!result?.purchase.orderId || !result.purchase.keyId || !result.purchase.amountInMinor || !window.Razorpay) return;
    const checkout = new window.Razorpay({
      key: result.purchase.keyId,
      amount: result.purchase.amountInMinor,
      currency: result.purchase.currency ?? currency,
      name: result.store,
      description: result.basket?.length
        ? `Cartwright basket: ${basketItemCount} items`
        : result.picked
          ? `Cartwright purchase: ${result.picked.name}`
          : "Cartwright test purchase",
      order_id: result.purchase.orderId,
      handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        verifyPayment.mutate({
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
          reservationId: result.purchase.walletReservationId,
          sessionId: result.sessionId,
        });
      },
      theme: { color: "#111827" },
    });
    checkout.open();
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Shopping Agent</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Ask for any product and budget — the agent browses the store in a cloud browser,
        adds the pick to cart, and gates any purchase through a human-approval step.
        Works on any store, not just one.
      </p>

      <form
        className="mb-8 grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          shop.mutate({ query, store: store.trim() || undefined });
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
          Launching a cloud browser session… watch it live at
          {" "}
          <a
            className="underline"
            href="https://www.browserbase.com/sessions"
            target="_blank"
            rel="noreferrer"
          >
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
          {result.error && (
            <p className="text-sm text-red-500">{result.error}</p>
          )}

          {result.basket?.length ? (
            <section className="rounded-lg border p-4">
              <h2 className="mb-2 font-medium">
                Requested basket ({basketItemCount} items) · {result.store}
              </h2>
              <ul className="grid gap-1 text-sm">
                {result.basket.map((item) => (
                  <li key={`${item.name}-${item.quantity}`} className="flex justify-between gap-4">
                    <span>{item.name} × {item.quantity}</span>
                    <span className="text-muted-foreground">
                      {item.price} each
                    </span>
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
                  <li
                    key={`${product.name}-${product.priceValue}`}
                    className="flex justify-between gap-4"
                  >
                    <span>
                      {product.name}
                      {product.rating !== undefined && (
                        <span className="ml-2 text-muted-foreground">
                          ★ {product.rating}
                        </span>
                      )}
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
                        <a
                          className="underline"
                          href={result.picked.url}
                          target="_blank"
                          rel="noreferrer"
                        >
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

                <div
                  className={`rounded-md border p-3 ${
                    result.purchase.status === "insufficient_balance" ||
                    result.purchase.status === "error"
                      ? "border-red-500/50 bg-red-500/5 text-red-600 dark:text-red-400"
                      : "border-green-500/50 bg-green-500/5"
                  }`}
                >
                  <p className="font-medium uppercase tracking-wide">
                    {result.purchase.status.replace(/_/g, " ")}
                  </p>
                  <p>{result.purchase.message}</p>
                  {result.purchase.paymentSource && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Payment source: {result.purchase.paymentSource === "agent_razorpay" ? "agent Razorpay adapter" : "merchant checkout"}
                    </p>
                  )}
                  {result.purchase.policyReason && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Policy: {result.purchase.policyReason}
                      {result.purchase.autoApprovalLimitInMinor !== undefined && (
                        <> · auto limit {formatCurrency(result.purchase.autoApprovalLimitInMinor, result.currency)}</>
                      )}
                    </p>
                  )}
                  {result.purchase.walletRemainingInMinor !== undefined && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Wallet capacity remaining: {formatCurrency(result.purchase.walletRemainingInMinor, result.currency)}
                    </p>
                  )}
                  {result.purchase.status === "merchant_action_required" && result.sessionId && (
                    <Button
                      className="mt-3"
                      onClick={() => approveMerchantPayment.mutate({ sessionId: result.sessionId! })}
                      disabled={approveMerchantPayment.isPending}
                    >
                      {approveMerchantPayment.isPending ? "Opening merchant checkout…" : "Approve merchant payment"}
                    </Button>
                  )}
                  {result.purchase.status === "awaiting_approval" && result.purchase.orderId && (
                    <Button
                      className="mt-3"
                      onClick={openAgentRazorpayCheckout}
                      disabled={!razorpayReady || verifyPayment.isPending}
                    >
                      {verifyPayment.isPending
                        ? "Verifying payment…"
                        : razorpayReady
                          ? "Open Razorpay TEST checkout"
                          : "Loading Razorpay…"}
                    </Button>
                  )}
                  {approveMerchantPayment.data && (
                    <p className={`mt-2 ${approveMerchantPayment.data.status === "opened" ? "text-green-600" : "text-red-500"}`}>
                      {approveMerchantPayment.data.message}
                    </p>
                  )}
                  {verifyPayment.data && (
                    <p className={`mt-2 ${verifyPayment.data.status === "paid" ? "text-green-600" : "text-red-500"}`}>
                      {verifyPayment.data.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
