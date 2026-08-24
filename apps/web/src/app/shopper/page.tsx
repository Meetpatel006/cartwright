"use client";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Button } from "@cartwright/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@cartwright/ui/components/card";
import { Input } from "@cartwright/ui/components/input";
import { trpc } from "@/utils/trpc";

/* -------------------------------------------------------------------------- */
/*  Local shapes (mirror the API + agent outputs)                             */
/* -------------------------------------------------------------------------- */

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

interface RankingFactor {
  name: string;
  impact: number;
  reason: string;
}

interface NormalizedProduct {
  id: string;
  merchant: string;
  canonicalTitle: string;
  amountInMinor: number;
  currency: string;
  productUrl: string | null;
  availability: "in_stock" | "limited" | "out_of_stock" | "unknown";
  confidence: number;
  attributes: Record<string, string>;
  confidenceReasons: string[];
}

interface Recommendation {
  product: NormalizedProduct;
  rankingScore: number;
  rankingFactors: RankingFactor[];
  explanation: string[];
  isTopRecommendation: boolean;
}

interface ShoppingIntent {
  rawQuery: string;
  category: string | null;
  budgetInMinor: number | null;
  currency: string;
  requestedQuantity: number;
  preferredMerchants: string[];
  excludedMerchants: string[];
  constraints: string[];
  store?: string;
}

interface ShoppingRunResult {
  sessionId: string;
  status: string;
  rawQuery: string;
  intent: ShoppingIntent;
  recommendations: Recommendation[];
  createdAt: string;
}

interface PurchasePlan {
  productId: string;
  merchant: string;
  productUrl: string | null;
  expectedAmountInMinor: number;
  currency: string;
  rankingScore: number;
  recommendationReasons: string[];
  evidence: Record<string, unknown>;
  constraintsApplied: string[];
  selectedAt: string;
}

interface SelectResult {
  plan: PurchasePlan;
  purchase: TransactionView;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

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

function availabilityTone(availability: NormalizedProduct["availability"]): string {
  switch (availability) {
    case "in_stock":
      return "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400";
    case "limited":
      return "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "out_of_stock":
      return "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400";
    default:
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-500";
  }
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function ShopperPage() {
  const [query, setQuery] = useState("wireless headphones under $100");
  const [store, setStore] = useState("raven");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const run = useMutation(trpc.shopping.run.mutationOptions());
  const select = useMutation(trpc.shopping.select.mutationOptions());
  const approve = useMutation(trpc.transactions.approve.mutationOptions());
  const initiatePayment = useMutation(trpc.transactions.initiatePayment.mutationOptions());
  const verifyPayment = useMutation(trpc.transactions.verifyPayment.mutationOptions());
  const [razorpayReady, setRazorpayReady] = useState(false);

  const runResult = run.data as ShoppingRunResult | undefined;
  const selectData = select.data as SelectResult | undefined;

  const baseView = approve.data?.result ?? selectData?.purchase ?? null;
  const effectivePurchase: TransactionView | null =
    verifyPayment.data ??
    (initiatePayment.data && baseView
      ? { ...baseView, status: "PAYMENT_PROCESSING", amountInMinor: initiatePayment.data.amountInMinor, currency: initiatePayment.data.currency }
      : baseView);
  const status: TransactionStatus | undefined = effectivePurchase?.status;
  const paymentSource = effectivePurchase?.paymentSource;
  const merchantResult = approve.data?.merchantResult;
  const [payMethod, setPayMethod] = useState<"card" | "wallet">("card");

  useEffectLoadRazorpay(setRazorpayReady);

  const openAgentRazorpayCheckout = () => {
    const init = initiatePayment.data;
    if (!init || !init.orderId || !init.keyId || !window.Razorpay) return;
    const checkout = new window.Razorpay({
      key: init.keyId,
      amount: init.amountInMinor,
      currency: init.currency ?? effectivePurchase?.currency,
      name: "Cartwright",
      description: "Cartwright test purchase",
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

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const key = crypto.randomUUID();
    setIdempotencyKey(key);
    run.mutate({ query, store: store.trim() || undefined, idempotencyKey: key });
  };

  const onSelect = (productId: string) => {
    if (!runResult) return;
    select.mutate({
      sessionId: runResult.sessionId,
      productId,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const intent = runResult?.intent;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <h1 className="bg-gradient-to-r from-zinc-900 to-zinc-500 bg-clip-text text-3xl font-bold text-transparent dark:from-white dark:to-zinc-400">
          Agentic Shopping
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Describe what you want and your budget. The agent discovers products, normalizes prices,
          and ranks them with a transparent, deterministic model — every recommendation shows its
          reasoning. Only your explicit selection is sent to the purchase gate.
        </p>
      </header>

      <form className="mb-8 grid gap-2" onSubmit={onSubmit}>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='e.g. "wireless headphones under $100 from sony"'
          />
          <Button type="submit" disabled={run.isPending}>
            {run.isPending ? "Searching…" : "Search"}
          </Button>
        </div>
        <Input
          value={store}
          onChange={(event) => setStore(event.target.value)}
          placeholder='Store preset or URL, e.g. "raven"'
          aria-label="Store preset or URL"
        />
      </form>

      {run.isPending && (
        <p className="mb-4 text-sm text-muted-foreground">
          Launching a cloud browser session… watch it live at{" "}
          <a className="underline" href="https://www.browserbase.com/sessions" target="_blank" rel="noreferrer">
            browserbase.com/sessions
          </a>
        </p>
      )}

      {run.isError && (
        <Card className="mb-4 border-red-500/50">
          <CardHeader>
            <CardTitle className="text-red-500">Agent error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{String(run.error)}</CardContent>
        </Card>
      )}

      {intent && (
        <section className="mb-6 rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Parsed request
          </h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <Chip label="Query" value={intent.rawQuery} />
            <Chip
              label="Budget"
              value={intent.budgetInMinor != null ? formatCurrency(intent.budgetInMinor, intent.currency) : "No limit"}
            />
            <Chip label="Currency" value={intent.currency} />
            {intent.category && <Chip label="Category" value={intent.category} />}
            <Chip label="Quantity" value={String(intent.requestedQuantity)} />
            {intent.preferredMerchants.map((m) => (
              <Chip key={`pref-${m}`} label="Prefers" value={m} tone="green" />
            ))}
            {intent.excludedMerchants.map((m) => (
              <Chip key={`exc-${m}`} label="Excludes" value={m} tone="red" />
            ))}
            {intent.constraints.map((c) => (
              <Chip key={`con-${c}`} label="Constraint" value={c} tone="blue" />
            ))}
          </div>
        </section>
      )}

      {runResult && runResult.recommendations.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Ranked recommendations ({runResult.recommendations.length})
          </h2>
          {runResult.recommendations.map((rec, index) => (
            <RecommendationCard
              key={rec.product.id}
              rank={index + 1}
              rec={rec}
              busy={select.isPending}
              onSelect={() => onSelect(rec.product.id)}
            />
          ))}
        </section>
      )}

      {runResult && runResult.recommendations.length === 0 && !run.isPending && (
        <p className="text-sm text-muted-foreground">No products matched your request.</p>
      )}

      {selectData && (
        <section className="mt-8 grid gap-4">
          <PurchasePlanCard plan={selectData.plan} currency={selectData.purchase.currency} />
          <TransactionPanel
            purchase={effectivePurchase}
            currency={selectData.purchase.currency}
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
              approve.mutate({ transactionId: selectData.purchase.transactionId, method: payMethod })
            }
            onStartPayment={startPayment}
            onOpenCheckout={openAgentRazorpayCheckout}
            approveMessage={approve.data?.merchantResult?.message}
            verifyMessage={
              verifyPayment.data
                ? "Payment verified."
                : verifyPayment.error
                  ? String(verifyPayment.error)
                  : undefined
            }
          />
        </section>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function Chip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "red" | "blue";
}) {
  const tones = {
    neutral: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    green: "border-green-400/50 bg-green-500/10 text-green-700 dark:text-green-300",
    red: "border-red-400/50 bg-red-500/10 text-red-700 dark:text-red-300",
    blue: "border-blue-400/50 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      <span className="opacity-60">{label}:</span>
      <span className="capitalize">{value}</span>
    </span>
  );
}

function RecommendationCard({
  rank,
  rec,
  busy,
  onSelect,
}: {
  rank: number;
  rec: Recommendation;
  busy: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { product } = rec;
  const top = rec.isTopRecommendation;

  return (
    <Card className={top ? "border-green-500/50 ring-1 ring-green-500/20" : ""}>
      <CardContent className="grid gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                top ? "bg-green-500 text-white" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"
              }`}
            >
              {rank}
            </div>
            <div>
              <p className="font-medium leading-tight">{product.canonicalTitle}</p>
              <p className="text-xs text-muted-foreground">{product.merchant}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold">{formatCurrency(product.amountInMinor, product.currency)}</p>
            <span
              className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${availabilityTone(product.availability)}`}
            >
              {product.availability.replace(/_/g, " ")}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
            score {rec.rankingScore}
          </span>
          <ConfidenceBar confidence={product.confidence} />
          {product.productUrl && (
            <a className="underline" href={product.productUrl} target="_blank" rel="noreferrer">
              view product
            </a>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {open ? "Hide reasoning" : "Why this rank?"}
          </button>
          {open && (
            <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
              {rec.explanation.map((line, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="select-none opacity-50">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <Button size="sm" variant={top ? "default" : "outline"} disabled={busy} onClick={onSelect}>
            {busy ? "Requesting…" : "Select & request purchase"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const tone = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-1.5" title={`Data confidence: ${pct}%`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[10px] uppercase tracking-wide">conf {pct}%</span>
    </span>
  );
}

function PurchasePlanCard({ plan, currency }: { plan: PurchasePlan; currency: string }) {
  return (
    <Card className="border-blue-500/40">
      <CardHeader>
        <CardTitle className="text-base">Selection → purchase plan</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p>
          <span className="font-medium">{plan.merchant}</span> ·{" "}
          {formatCurrency(plan.expectedAmountInMinor, currency)}
          <span className="ml-2 text-xs text-muted-foreground">rank score {plan.rankingScore}</span>
        </p>
        {plan.recommendationReasons.length > 0 && (
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {plan.recommendationReasons.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        )}
        {plan.constraintsApplied.length > 0 && (
          <div className="text-xs">
            <p className="mb-1 font-medium text-muted-foreground">Constraints applied</p>
            <ul className="grid gap-0.5">
              {plan.constraintsApplied.map((c, i) => (
                <li key={i}>• {c}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          This plan is a structured selection only — the backend purchase gate is the source of truth.
        </p>
      </CardContent>
    </Card>
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

  const blocked =
    status === "POLICY_BLOCKED" ||
    status === "PRICE_CHANGED" ||
    status === "CANCELLED" ||
    status === "PAYMENT_FAILED";
  const tone = blocked
    ? "border-red-500/50 bg-red-500/5 text-red-600 dark:text-red-400"
    : "border-green-500/50 bg-green-500/5";

  return (
    <div className={`rounded-md border p-4 ${tone}`}>
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

      {status === "AWAITING_APPROVAL" && (
        <Button className="mt-3" onClick={props.onApprove} disabled={props.approveBusy}>
          {props.approveBusy ? "Approving…" : "Approve transaction"}
        </Button>
      )}

      {status === "APPROVED" && paymentSource === "merchant_ui" && (
        <Button className="mt-3" onClick={props.onApprove} disabled={props.approveBusy}>
          {props.approveBusy ? "Paying at merchant…" : "Approve & pay at merchant"}
        </Button>
      )}

      {status === "APPROVED" && paymentSource === "agent_razorpay" && !props.merchantResult && (
        <Button className="mt-3" onClick={props.onStartPayment} disabled={props.initiateBusy}>
          {props.initiateBusy ? "Creating Razorpay order…" : "Continue to Razorpay TEST checkout"}
        </Button>
      )}

      {status === "PAYMENT_PROCESSING" && props.razorpayReady && (
        <Button className="mt-3" onClick={props.onOpenCheckout} disabled={props.verifyBusy}>
          {props.verifyBusy ? "Verifying payment…" : "Open Razorpay TEST checkout"}
        </Button>
      )}

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
