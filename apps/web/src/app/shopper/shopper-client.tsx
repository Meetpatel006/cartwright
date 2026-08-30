"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
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

function formatCurrency(minor: number, currency = "INR"): string {
  try {
    const activeCurrency = currency || "INR";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: activeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `₹${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

interface ShopperPageProps {
  initialSessionId?: string;
}

export default function ShopperPage({ initialSessionId }: ShopperPageProps) {
  const [query, setQuery] = useState("wireless headphones under 5000");
  const [store, setStore] = useState("raven");
  const [browserMode, setBrowserMode] = useState<"local" | "browserbase">("local");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initialSessionId ?? null);

  const loadedSession = useQuery(
    trpc.shopping.get.queryOptions(
      { sessionId: selectedSessionId ?? "" },
      { enabled: Boolean(selectedSessionId) }
    )
  );

  const run = useMutation({
    ...trpc.shopping.run.mutationOptions(),
    onSuccess: (data) => {
      setSelectedSessionId(data.sessionId);
    },
  });

  const select = useMutation(trpc.shopping.select.mutationOptions());
  const approve = useMutation(trpc.transactions.approve.mutationOptions());
  const initiatePayment = useMutation(trpc.transactions.initiatePayment.mutationOptions());
  const verifyPayment = useMutation(trpc.transactions.verifyPayment.mutationOptions());
  const [razorpayReady, setRazorpayReady] = useState(false);

  // Live view of the agent's browser: polled screenshot frames streamed from
  // the server while the run is in flight.
  const liveFeed = useQuery(
    trpc.shopping.liveFeed.queryOptions(undefined, {
      refetchInterval: 700,
      enabled: run.isPending,
    }),
  );

  const rawRunResult = run.data as ShoppingRunResult | undefined;

  // Map loaded historical DB session into ShoppingRunResult shape if selected
  const historicalResult: ShoppingRunResult | undefined = loadedSession.data
    ? {
        sessionId: loadedSession.data.sessionId,
        status: loadedSession.data.status,
        rawQuery: loadedSession.data.rawQuery,
        intent: loadedSession.data.intent as unknown as ShoppingIntent,
        recommendations: (loadedSession.data.candidates ?? []).map((c, i) => ({
          product: {
            id: c.productId,
            merchant: c.merchant ?? "",
            canonicalTitle: c.title,
            amountInMinor: c.amountInMinor,
            currency: c.currency as any,
            productUrl: c.productUrl,
            availability: (c.availability as any) ?? "unknown",
            confidence: c.confidence ?? 1,
            attributes: {},
            confidenceReasons: [],
          },
          rankingScore: 100 - i,
          rankingFactors: [],
          explanation: [c.reason || "Loaded from saved database session"],
          isTopRecommendation: i === 0,
        })),
        createdAt: loadedSession.data.createdAt,
      }
    : undefined;

  const runResult = selectedSessionId ? historicalResult : (rawRunResult ?? historicalResult);

  const loadedPurchase = useQuery(
    trpc.transactions.get.queryOptions(
      { transactionId: loadedSession.data?.transactionId ?? "" },
      { enabled: Boolean(loadedSession.data?.transactionId) }
    )
  );

  const selectData: SelectResult | undefined =
    (select.data as SelectResult | undefined) ??
    (loadedSession.data?.selectedPlan
      ? {
          plan: loadedSession.data.selectedPlan as unknown as PurchasePlan,
          purchase: (loadedPurchase.data as unknown as TransactionView) ?? {
            transactionId: loadedSession.data.transactionId ?? "",
            status: (loadedSession.data.status === "converted"
              ? "PAYMENT_SUCCEEDED"
              : loadedSession.data.status === "expired"
              ? "PRICE_CHANGED"
              : "APPROVED") as TransactionStatus,
            amountInMinor: (loadedSession.data.selectedPlan as any).expectedAmountInMinor ?? 0,
            currency: (loadedSession.data.selectedPlan as any).currency ?? "INR",
            approvedAmountInMinor: (loadedSession.data.selectedPlan as any).expectedAmountInMinor ?? null,
            policyDecision: "auto_approve",
            policyReason: "Session completed",
            autoApprovalLimitInMinor: 0,
            maxTotalSpending: 0,
            paymentSource: "merchant_ui",
          },
        }
      : undefined);

  // Once a selection has been converted into a purchase, the session is
  // terminal — re-selecting would 409. Lock the recommendation buttons.
  const selectionLocked = Boolean(
    selectData ||
    loadedSession.data?.status === "expired" ||
    loadedSession.data?.status === "converted"
  );

  const baseView = approve.data?.result ?? selectData?.purchase ?? (loadedPurchase.data as unknown as TransactionView) ?? null;
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
    select.reset();
    setSelectedSessionId(null);
    const key = crypto.randomUUID();
    setIdempotencyKey(key);
    run.mutate({ query, store: store.trim() || undefined, browserMode, idempotencyKey: key });
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

  useEffect(() => {
    setSelectedSessionId(initialSessionId ?? null);
    if (!initialSessionId) {
      run.reset();
      select.reset();
      approve.reset();
      initiatePayment.reset();
      verifyPayment.reset();
    }
  }, [initialSessionId]);

  useEffect(() => {
    if (loadedSession.data) {
      if (loadedSession.data.rawQuery) {
        setQuery(loadedSession.data.rawQuery);
      }
      if (loadedSession.data.intent && typeof loadedSession.data.intent === "object" && "store" in loadedSession.data.intent) {
        setStore((loadedSession.data.intent as any).store ?? "");
      }
    }
  }, [loadedSession.data]);

  const hasSessionData = Boolean(runResult || run.isPending || selectData || selectedSessionId);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="bg-gradient-to-r from-zinc-900 to-zinc-500 bg-clip-text text-3xl font-bold text-transparent dark:from-white dark:to-zinc-400">
            Agentic Shopping
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Describe what you want and your budget. Discover products, track live agent state, view session recordings, and manage purchase gates.
          </p>
        </div>
      </header>

      <form className="mb-8 grid gap-2" onSubmit={onSubmit}>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='e.g. "wireless headphones under 5000 from sony" (budgets are in ₹)'
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
        <div className="flex items-center gap-2" role="group" aria-label="Browser backend">
          <span className="text-xs text-muted-foreground">Browser:</span>
          {(["local", "browserbase"] as const).map((mode) => (
            <Button
              key={mode}
              type="button"
              variant={browserMode === mode ? "default" : "outline"}
              size="sm"
              onClick={() => setBrowserMode(mode)}
            >
              {mode === "local" ? "Local Chrome" : "Browserbase (cloud)"}
            </Button>
          ))}
        </div>
      </form>

      {hasSessionData && (
        <DifferentiationStatePanel
          runResult={runResult}
          selectData={selectData}
          effectivePurchase={effectivePurchase}
          status={status}
          paymentSource={paymentSource}
          browserMode={browserMode}
          store={store}
          query={query}
        />
      )}

      {run.isPending && (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            {browserMode === "browserbase"
              ? "Running the agent on a Browserbase cloud session… watch it live at browserbase.com/sessions."
              : "Running the agent on local Chrome… the session is recorded to packages/agent/recordings/."}
          </p>
          <Card className="mb-6 overflow-hidden">
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <span
                  className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500"
                  aria-hidden
                />
                Live agent view
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {liveFeed.data?.frame ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={liveFeed.data.frame}
                  alt="Live view of the agent's browser"
                  className="block w-full bg-black"
                />
              ) : (
                <div className="flex h-56 items-center justify-center bg-zinc-950 text-sm text-zinc-400">
                  Waiting for the agent's first frame…
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {run.isError && (
        <Card className="mb-4 border-red-500/50">
          <CardHeader>
            <CardTitle className="text-red-500">Agent error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {run.error instanceof Error ? run.error.message : String(run.error)}
          </CardContent>
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
              busy={select.isPending || selectionLocked}
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

/* -------------------------------------------------------------------------- */
/*  Differentiation State Management & Video Panel                            */
/* -------------------------------------------------------------------------- */

interface DifferentiationStatePanelProps {
  runResult?: ShoppingRunResult;
  selectData?: SelectResult;
  effectivePurchase: TransactionView | null;
  status: TransactionStatus | undefined;
  paymentSource: TransactionView["paymentSource"] | undefined;
  browserMode: "local" | "browserbase";
  store: string;
  query: string;
}

function DifferentiationStatePanel({
  runResult,
  selectData,
  effectivePurchase,
  status,
  paymentSource,
  browserMode,
  store,
}: DifferentiationStatePanelProps) {
  const [recordings, setRecordings] = useState<string[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<string>("");
  const [loadingVideos, setLoadingVideos] = useState(false);

  useEffect(() => {
    setLoadingVideos(true);
    fetch("/api/recordings")
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.recordings)) {
          setRecordings(data.recordings);
          if (data.recordings.length > 0) {
            setSelectedRecording(data.recordings[0]);
          }
        }
      })
      .catch((err) => console.error("Failed to load recordings", err))
      .finally(() => setLoadingVideos(false));
  }, [runResult?.sessionId]);

  const sessionState = selectData
    ? "converted"
    : runResult
    ? (runResult.status || "recommended")
    : "created";

  const sessionSteps = [
    { key: "created", label: "Session Created" },
    { key: "recommended", label: "Products Recommended" },
    { key: "selected", label: "Product Selected" },
    { key: "converted", label: "Converted to Purchase" },
  ];

  const paymentSteps: TransactionStatus[] = [
    "CREATED",
    "POLICY_CHECKING",
    "AWAITING_APPROVAL",
    "APPROVED",
    "PAYMENT_PROCESSING",
    "PAYMENT_SUCCEEDED",
  ];

  return (
    <Card className="mb-8 border-purple-500/30 bg-gradient-to-br from-purple-950/10 via-background to-blue-950/10 shadow-md">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-purple-700 dark:text-purple-300">
              <span className="flex h-2.5 w-2.5 rounded-full bg-purple-500 animate-pulse" />
              Differentiation: State Management & Session Video
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Session state tracking, product state, payment process state, and video recording of what the agent should do.
            </p>
          </div>
          <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-600 dark:text-purple-300">
            State System Active
          </span>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 text-sm">
        {/* 1. Recorded Video Section */}
        <div className="rounded-lg border p-4 bg-card/60">
          <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
              Agent Action Video Recording
            </h3>
            {recordings.length > 1 && (
              <select
                value={selectedRecording}
                onChange={(e) => setSelectedRecording(e.target.value)}
                className="rounded border border-input bg-background px-2 py-1 text-xs"
              >
                {recordings.map((rec) => (
                  <option key={rec} value={rec}>
                    {rec}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedRecording ? (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-md border bg-black shadow-inner">
                <video
                  key={selectedRecording}
                  src={`/api/recordings/${encodeURIComponent(selectedRecording)}`}
                  controls
                  className="w-full max-h-96 object-contain"
                />
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <span>📹 Recorded video of agent session:</span>
                <code className="font-mono">{selectedRecording}</code>
              </p>
            </div>
          ) : (
            <div className="flex h-36 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              {loadingVideos
                ? "Loading session videos..."
                : "No recorded video files found. Run a local agent session to record video."}
            </div>
          )}
        </div>

        {/* 2. Session State Management */}
        <div className="rounded-lg border p-4 bg-card/60">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Session State Management
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            {sessionSteps.map((step, idx) => {
              const activeIndex =
                sessionState === "expired"
                  ? selectData
                    ? 2
                    : runResult?.recommendations?.length
                    ? 1
                    : 0
                  : sessionSteps.findIndex((s) => s.key === sessionState);
              const isPastOrCurrent = idx <= activeIndex;
              const isCurrent = step.key === sessionState || (sessionState === "expired" && idx === activeIndex);
              return (
                <div
                  key={step.key}
                  className={`rounded-md border p-2 text-center text-xs transition-colors ${
                    isCurrent
                      ? "border-emerald-500 bg-emerald-500/10 font-bold text-emerald-600 dark:text-emerald-400"
                      : isPastOrCurrent
                      ? "border-emerald-500/30 bg-emerald-500/5 text-muted-foreground"
                      : "border-zinc-300 dark:border-zinc-800 opacity-50"
                  }`}
                >
                  <div className="text-[10px] opacity-70">Step {idx + 1}</div>
                  <div>{step.label}</div>
                </div>
              );
            })}
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs border-t pt-2">
            <div>
              <dt className="text-muted-foreground">Active Session State</dt>
              <dd className="font-semibold capitalize text-emerald-600 dark:text-emerald-400">{sessionState}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Session ID</dt>
              <dd className="font-mono truncate">{runResult?.sessionId ?? "Pending"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Browser Backend</dt>
              <dd className="capitalize">{browserMode}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Target Store</dt>
              <dd className="capitalize">{runResult?.intent?.store || store || "Default"}</dd>
            </div>
          </dl>
        </div>

        {/* 3. Product State Management */}
        <div className="rounded-lg border p-4 bg-card/60">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            Product State Management
          </h3>
          {runResult ? (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <div>
                  <span className="text-muted-foreground">Discovered Candidates: </span>
                  <span className="font-semibold">{runResult.recommendations.length} items</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Selection State: </span>
                  <span className={`font-semibold ${selectData ? "text-green-600" : "text-amber-600"}`}>
                    {selectData ? `Selected (${selectData.plan.merchant})` : "Awaiting User Selection"}
                  </span>
                </div>
              </div>
              {selectData ? (
                <div className="rounded border bg-background/50 p-2">
                  <p className="font-medium text-foreground">Selected Plan State:</p>
                  <p className="text-muted-foreground">{selectData.plan.productId} @ {selectData.plan.merchant}</p>
                  <p className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(selectData.plan.expectedAmountInMinor, selectData.plan.currency)}
                  </p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {runResult.recommendations.slice(0, 3).map((rec, i) => (
                    <div key={rec.product.id} className="flex items-center justify-between rounded border p-2">
                      <div>
                        <p className="font-medium truncate max-w-xs">{rec.product.canonicalTitle}</p>
                        <p className="text-[10px] text-muted-foreground">
                          State: Ranked #{i + 1} | Stock: {rec.product.availability}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(rec.product.amountInMinor, rec.product.currency)}</p>
                        <p className="text-[10px] text-muted-foreground">Conf: {Math.round(rec.product.confidence * 100)}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No active product state available. Search to populate product states.</p>
          )}
        </div>

        {/* 4. Payment Process State Management */}
        <div className="rounded-lg border p-4 bg-card/60">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
            Payment Process & Gate State
          </h3>
          {effectivePurchase ? (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded border p-2">
                  <dt className="text-muted-foreground">Transaction State</dt>
                  <dd className="font-bold text-purple-600 dark:text-purple-400">{status}</dd>
                </div>
                <div className="rounded border p-2">
                  <dt className="text-muted-foreground">Payment Source</dt>
                  <dd className="font-medium capitalize">{paymentSource}</dd>
                </div>
                <div className="rounded border p-2">
                  <dt className="text-muted-foreground">Proposed / Approved</dt>
                  <dd className="font-medium">
                    {formatCurrency(effectivePurchase.amountInMinor, effectivePurchase.currency)} /{" "}
                    {effectivePurchase.approvedAmountInMinor != null
                      ? formatCurrency(effectivePurchase.approvedAmountInMinor, effectivePurchase.currency)
                      : "—"}
                  </dd>
                </div>
                <div className="rounded border p-2">
                  <dt className="text-muted-foreground">Policy Decision</dt>
                  <dd className="font-medium capitalize">{effectivePurchase.policyDecision.replace(/_/g, " ")}</dd>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1 border-t pt-2">
                {paymentSteps.map((pStep, i) => {
                  const currentIdx = status ? paymentSteps.indexOf(status) : -1;
                  const isCurrent = status === pStep;
                  const isDone = currentIdx >= i;
                  return (
                    <div key={pStep} className="flex items-center gap-1">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-mono ${
                          isCurrent
                            ? "bg-purple-600 text-white font-bold"
                            : isDone
                            ? "bg-purple-500/20 text-purple-700 dark:text-purple-300"
                            : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                        }`}
                      >
                        {pStep.replace(/_/g, " ")}
                      </span>
                      {i < paymentSteps.length - 1 && <span className="text-zinc-400 text-[10px]">→</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Payment gate is idle. Select a product recommendation to initialize transaction state.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
