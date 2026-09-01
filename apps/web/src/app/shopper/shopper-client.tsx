"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@cartwright/ui/components/button";
import { trpc } from "@/utils/trpc";
import { cn } from "@cartwright/ui/lib/utils";
import { SessionWebPreview } from "@/components/session-web-preview";
import { ApprovalCard, type ApprovalQuestion } from "@/components/approval-card";
import {
  ShoppingBag,
  ArrowUp,
  Headphones,
  Coffee,
  Footprints,
  Globe,
  PanelRight,
  X,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Video,
  Plus,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from "lucide-react";

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
  clarifyingQuestions?: ApprovalQuestion[];
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
/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

interface ShopperPageProps {
  initialSessionId?: string;
}

export default function ShopperPage({ initialSessionId }: ShopperPageProps) {
  const [query, setQuery] = useState("wireless headphones under 5000");
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
  const intent = (runResult?.intent ?? loadedSession.data?.intent) as ShoppingIntent | undefined;
  const [payMethod, setPayMethod] = useState<"card" | "wallet">("card");
  const [isBrowserSidebarOpen, setIsBrowserSidebarOpen] = useState(true);
  const [dismissedClarifications, setDismissedClarifications] = useState<Record<string, boolean>>({});

  const parseIntent = useMutation(trpc.shopping.parseIntent.mutationOptions());
  const [pendingClarification, setPendingClarification] = useState<{
    query: string;
    questions: ApprovalQuestion[];
    parsedIntent?: ShoppingIntent;
  } | null>(null);

  const activeSessionKey = runResult?.sessionId || "initial";
  const clarifyingQuestions: ApprovalQuestion[] = useMemo(() => {
    return intent?.clarifyingQuestions ?? [];
  }, [intent]);

  const showClarifications =
    clarifyingQuestions.length > 0 &&
    !dismissedClarifications[activeSessionKey] &&
    !selectData;

  const handleClarificationSubmitted = (answers: Record<number, number[]>) => {
    const additions: string[] = [];
    clarifyingQuestions.forEach((q, idx) => {
      const picked = answers[idx] ?? [];
      picked.forEach((optIdx) => {
        const option = q.options[optIdx];
        if (
          option &&
          !option.toLowerCase().includes("no strict") &&
          !option.toLowerCase().includes("search all") &&
          !option.toLowerCase().includes("flexible") &&
          !option.toLowerCase().includes("no preference") &&
          !option.toLowerCase().includes("any /") &&
          !option.toLowerCase().includes("any top") &&
          !option.toLowerCase().includes("any brand")
        ) {
          additions.push(option);
        }
      });
    });

    setDismissedClarifications((prev) => ({ ...prev, [activeSessionKey]: true }));

    if (additions.length > 0) {
      const currentQuery = query.trim() || runResult?.rawQuery || "";
      const refined = `${currentQuery} ${additions.join(" ")}`.trim();
      setQuery(refined);
      run.mutate({
        sessionId: selectedSessionId ?? runResult?.sessionId,
        query: refined,
        browserMode,
      });
    }
  };

  const handlePreSearchClarificationSubmitted = (answers: Record<number, number[]>) => {
    if (!pendingClarification) return;
    const additions: string[] = [];
    pendingClarification.questions.forEach((q, idx) => {
      const picked = answers[idx] ?? [];
      picked.forEach((optIdx) => {
        const option = q.options[optIdx];
        if (
          option &&
          !option.toLowerCase().includes("no strict") &&
          !option.toLowerCase().includes("search all") &&
          !option.toLowerCase().includes("flexible") &&
          !option.toLowerCase().includes("no preference") &&
          !option.toLowerCase().includes("any /") &&
          !option.toLowerCase().includes("any top") &&
          !option.toLowerCase().includes("any brand")
        ) {
          additions.push(option);
        }
      });
    });

    const activeId = selectedSessionId ?? runResult?.sessionId;
    const base = pendingClarification.query;
    const refined = additions.length > 0 ? `${base} ${additions.join(" ")}`.trim() : base;
    setQuery(refined);
    setPendingClarification(null);

    const key = crypto.randomUUID();
    setIdempotencyKey(key);
    run.mutate({
      sessionId: activeId,
      query: refined,
      browserMode,
      idempotencyKey: key,
    });
  };

  const handlePreSearchDismiss = () => {
    if (!pendingClarification) return;
    const activeId = selectedSessionId ?? runResult?.sessionId;
    const base = pendingClarification.query;
    setPendingClarification(null);
    const key = crypto.randomUUID();
    setIdempotencyKey(key);
    run.mutate({
      sessionId: activeId,
      query: base,
      browserMode,
      idempotencyKey: key,
    });
  };

  // Video session recordings query
  const recordingsQuery = useQuery({
    queryKey: ["recordings"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/recordings");
        if (!res.ok) return { recordings: [] as string[] };
        return (await res.json()) as { recordings: string[] };
      } catch {
        return { recordings: [] as string[] };
      }
    },
    refetchInterval: run.isPending ? 3000 : 15000,
  });

  const availableRecordings = recordingsQuery.data?.recordings ?? [];
  const [selectedRecording, setSelectedRecording] = useState<string | null>(null);
  const activeRecordingFile = selectedRecording ?? availableRecordings[0] ?? null;
  const videoUrl = activeRecordingFile ? `/api/recordings/${encodeURIComponent(activeRecordingFile)}` : null;

  // Real-time activity logs for the WebPreviewConsole
  const sessionLogs = useMemo(() => {
    const logs: Array<{ level: "log" | "warn" | "error"; message: string; timestamp: Date }> = [
      {
        level: "log",
        message: "Cartwright Agent initialized",
        timestamp: new Date(runResult?.createdAt || Date.now() - 30_000),
      },
    ];

    if (run.isPending) {
      logs.push({
        level: "log",
        message: `Searching catalogs for query: "${query}"`,
        timestamp: new Date(Date.now() - 15_000),
      });
      logs.push({
        level: "log",
        message: "Navigating store and extracting product candidates...",
        timestamp: new Date(Date.now() - 5_000),
      });
    }

    if (runResult?.recommendations?.length) {
      logs.push({
        level: "log",
        message: `Extracted & ranked ${runResult.recommendations.length} matching products`,
        timestamp: new Date(),
      });
    }

    if (run.isError) {
      logs.push({
        level: "error",
        message: run.error instanceof Error ? run.error.message : String(run.error),
        timestamp: new Date(),
      });
    }

    if (selectData) {
      logs.push({
        level: "log",
        message: `Selected product: ${selectData.plan.merchant} (${formatCurrency(selectData.plan.expectedAmountInMinor, selectData.plan.currency)})`,
        timestamp: new Date(selectData.plan.selectedAt),
      });
    }

    if (status === "PAYMENT_SUCCEEDED") {
      logs.push({
        level: "log",
        message: "Payment successfully settled via Razorpay/Merchant UI",
        timestamp: new Date(),
      });
    } else if (status === "PAYMENT_FAILED" || status === "POLICY_BLOCKED") {
      logs.push({
        level: "error",
        message: effectivePurchase?.policyReason || "Transaction blocked or failed",
        timestamp: new Date(),
      });
    }

    return logs;
  }, [runResult, run.isPending, run.isError, run.error, query, selectData, status, effectivePurchase]);

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

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanQ = query.trim();
    if (!cleanQ || run.isPending || parseIntent.isPending) return;

    select.reset();
    setSelectedSessionId(null);
    setPendingClarification(null);

    try {
      const res = await parseIntent.mutateAsync({ query: cleanQ, browserMode });
      const clarifyingQuestions = (res.intent as ShoppingIntent)?.clarifyingQuestions ?? [];

      if (clarifyingQuestions.length > 0) {
        setPendingClarification({
          query: cleanQ,
          questions: clarifyingQuestions,
          parsedIntent: res.intent as ShoppingIntent,
        });
        return;
      }
    } catch (err) {
      console.warn("Fast intent parse fallback to direct run:", err);
    }

    const key = crypto.randomUUID();
    setIdempotencyKey(key);
    run.mutate({ query: cleanQ, browserMode, idempotencyKey: key });
  };

  const onSelect = (productId: string) => {
    if (!runResult) return;
    select.mutate({
      sessionId: runResult.sessionId,
      productId,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const sessionState =
    loadedSession.data?.status ??
    (status === "PAYMENT_SUCCEEDED"
      ? "converted"
      : selectData
      ? "selected"
      : runResult && runResult.recommendations.length > 0
      ? "recommended"
      : run.isPending
      ? "created"
      : "created");

  const sessionStepKeys = ["created", "recommended", "selected", "converted"];
  const activeSessionStepIndex = sessionStepKeys.indexOf(sessionState);

  const paymentSteps: TransactionStatus[] = [
    "CREATED",
    "POLICY_CHECKING",
    "AWAITING_APPROVAL",
    "APPROVED",
    "PAYMENT_PROCESSING",
    "PAYMENT_SUCCEEDED",
  ];

  const currentSessionId = selectedSessionId ?? runResult?.sessionId ?? loadedSession.data?.sessionId ?? "Pending";
  const targetStoreDisplay = runResult?.intent?.store || (loadedSession.data?.intent as any)?.store || "All Stores";
  const discoveredCandidatesCount = loadedSession.data?.candidates?.length ?? runResult?.recommendations?.length ?? 0;

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
    }
  }, [loadedSession.data]);

  return (
    <div className="relative flex flex-1 h-full w-full overflow-hidden text-foreground">
      {/* Left/Center Main Workspace Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden p-6 sm:p-8">
        {!runResult && !run.isPending ? (
          /* Empty / Welcome State: Centered Interface matching max-w-4xl */
          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-4xl mx-auto my-auto space-y-6 overflow-y-auto">
            <div className="text-center space-y-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-300 shadow-xl mx-auto mb-3">
                <ShoppingBag className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                What can Cartwright Agent find for you?
              </h2>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Describe the item and budget below. The agent will autonomously browse stores, compare prices, and prepare a gated checkout.
              </p>
            </div>

            {pendingClarification ? (
              <div className="flex flex-col items-center justify-center w-full space-y-4 animate-in fade-in zoom-in-95 duration-200">
                <ApprovalCard
                  questions={pendingClarification.questions}
                  labels={{
                    skip: "Skip & Search",
                    continue: "Next",
                    send: "Search Products",
                    sentMessage: "Searching with Firecrawl...",
                    customPlaceholder: "Other specific preference...",
                  }}
                  onDismiss={handlePreSearchDismiss}
                  onSubmitted={handlePreSearchClarificationSubmitted}
                />
              </div>
            ) : (
              /* Centered AI Prompt Input Container */
              <div className="w-full space-y-3">
                <div className="relative rounded-xl border border-zinc-800/80 bg-[#161616]/90 p-4 shadow-2xl transition-all focus-within:border-zinc-700/80 focus-within:ring-1 focus-within:ring-zinc-700/50 space-y-2.5">
                  <form onSubmit={onSubmit} className="space-y-2.5">
                    <textarea
                      rows={2}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          onSubmit(e);
                        }
                      }}
                      placeholder="Ask Cartwright AI to find, evaluate and purchase anything... (e.g. wireless headphones under 5000 from sony)"
                      className="w-full resize-none border-none bg-transparent p-0 text-sm sm:text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-0 leading-relaxed font-normal"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                      <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/90 p-0.5">
                        <button
                          type="button"
                          onClick={() => setBrowserMode("local")}
                          className={cn(
                            "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer",
                            browserMode === "local"
                              ? "bg-zinc-800 text-white shadow-xs"
                              : "text-zinc-400 hover:text-zinc-200"
                          )}
                        >
                          Local Chrome
                        </button>
                        <button
                          type="button"
                          onClick={() => setBrowserMode("browserbase")}
                          className={cn(
                            "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer",
                            browserMode === "browserbase"
                              ? "bg-zinc-800 text-white shadow-xs"
                              : "text-zinc-400 hover:text-zinc-200"
                          )}
                        >
                          Cloud
                        </button>
                      </div>

                      <button
                        type="submit"
                        disabled={run.isPending || parseIntent.isPending || !query.trim()}
                        className="h-8 w-8 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 flex items-center justify-center shadow-xs transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                        title={parseIntent.isPending ? "Analyzing…" : run.isPending ? "Searching…" : "Run Agent"}
                      >
                        {parseIntent.isPending ? (
                          <span className="h-3.5 w-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ArrowUp className="h-4 w-4 stroke-[2.5]" />
                        )}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Quick Prompt Suggestion Pills with SVG Icons */}
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className="text-zinc-500 font-medium">Try:</span>
                  {[
                    { label: "Wireless Headphones on Amazon under ₹5k", icon: Headphones, q: "wireless headphones on amazon under 5000" },
                    { label: "Espresso Coffee Machine on Raven under ₹15k", icon: Coffee, q: "espresso coffee maker on raven under 15000" },
                    { label: "Nike Running Shoes under ₹6k", icon: Footprints, q: "running shoes from nike under 6000" },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setQuery(item.q)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800/80 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800 transition-colors cursor-pointer shadow-xs"
                      >
                        <Icon className="h-3.5 w-3.5 text-zinc-400" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Active Search / Results View with Docked Bottom Input matching max-w-7xl */
          <div className="w-full max-w-7xl mx-auto flex flex-col flex-1 h-full min-h-0 justify-between">
            {/* Scrollable Results & Policy Gate */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-1 pb-4">
              {/* Top Header Bar matching Policy & Transactions */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-zinc-800/60">
                {/* Left: Icon Box + Title */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-300 shadow-xs shrink-0">
                    <ShoppingBag className="h-4 w-4" />
                  </div>
                  <h1 className="text-xl font-bold tracking-tight text-white capitalize truncate max-w-lg">
                    {loadedSession.data?.rawQuery || query || "Shopping Session"}
                  </h1>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSessionId(null);
                      run.reset();
                      select.reset();
                      approve.reset();
                    }}
                    className="h-9 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New Search</span>
                  </button>

                  {!isBrowserSidebarOpen && (
                    <button
                      type="button"
                      onClick={() => setIsBrowserSidebarOpen(true)}
                      className="h-9 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <PanelRight className="h-3.5 w-3.5" />
                      <span>Browser Session</span>
                      {run.isPending && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Error message */}
              {run.isError && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-xs text-rose-300">
                  <span className="font-bold">Search Error: </span>
                  {run.error instanceof Error ? run.error.message : String(run.error)}
                </div>
              )}

              {/* Human-in-the-loop Clarifying Questions (ApprovalCard) */}
              {showClarifications && (
                <div className="flex justify-center w-full py-2">
                  <ApprovalCard
                    questions={clarifyingQuestions}
                    labels={{
                      skip: "Skip",
                      continue: "Next",
                      send: "Refine Search",
                      sentMessage: "Refining search with answers...",
                      customPlaceholder: "Other specific preference...",
                    }}
                    onDismiss={() => setDismissedClarifications((prev) => ({ ...prev, [activeSessionKey]: true }))}
                    onSubmitted={handleClarificationSubmitted}
                  />
                </div>
              )}

              {/* Discovered Product Recommendations */}
              {runResult && runResult.recommendations.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      Discovered Products ({runResult.recommendations.length})
                    </h2>
                    <span className="text-xs text-zinc-400">
                      Ranked by price match & merchant policy
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {runResult.recommendations.map((rec, index) => {
                      const isSelected = selectData?.plan.productId === rec.product.id;
                      const isSelectingThis = select.isPending && select.variables?.productId === rec.product.id;
                      return (
                        <RecommendationCard
                          key={rec.product.id}
                          rank={index + 1}
                          rec={rec}
                          isSelectingThis={isSelectingThis}
                          isLocked={selectionLocked}
                          isSelected={isSelected}
                          onSelect={() => onSelect(rec.product.id)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bottom Section: Unified Purchase & Policy Verification Gate */}
              {selectData && (
                <div className="space-y-4">
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Purchase Authorization & Policy Gate
                  </h2>

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
                    paymentSteps={paymentSteps}
                    onApprove={() =>
                      approve.mutate({ transactionId: selectData.purchase.transactionId, method: payMethod })
                    }
                    onStartPayment={startPayment}
                    onOpenCheckout={openAgentRazorpayCheckout}
                    approveMessage={approve.data?.merchantResult?.message}
                    verifyMessage={
                      verifyPayment.data
                        ? "Payment verified successfully."
                        : verifyPayment.error
                        ? String(verifyPayment.error)
                        : undefined
                    }
                  />
                </div>
              )}

              {/* Live Navigation Feedback when waiting for recommendations */}
              {run.isPending && (!runResult || runResult.recommendations.length === 0) && (
                <div className="rounded-2xl border border-zinc-800/80 bg-[#141414] p-8 text-center space-y-3">
                  <div className="h-6 w-6 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mx-auto" />
                  <p className="text-sm font-semibold text-zinc-200">Agent Navigating Stores</p>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    Searching product catalogs, extracting specs, and applying policy rules. Follow the live session in the right sidebar.
                  </p>
                </div>
              )}
            </div>

            {/* Human-in-the-loop Pre-Search Clarification ApprovalCard */}
            {pendingClarification && (
              <div className="flex justify-center w-full py-2 animate-in fade-in zoom-in-95 duration-200">
                <ApprovalCard
                  questions={pendingClarification.questions}
                  labels={{
                    skip: "Skip & Search",
                    continue: "Next",
                    send: "Search Products",
                    sentMessage: "Searching with Firecrawl...",
                    customPlaceholder: "Other specific preference...",
                  }}
                  onDismiss={handlePreSearchDismiss}
                  onSubmitted={handlePreSearchClarificationSubmitted}
                />
              </div>
            )}

            {/* Docked Prompt Input Bar at Bottom */}
            <div className="w-full space-y-2 pt-3 shrink-0">
              <div className="relative rounded-xl border border-zinc-800/80 bg-[#161616]/90 p-4 shadow-2xl transition-all focus-within:border-zinc-700/80 focus-within:ring-1 focus-within:ring-zinc-700/50 space-y-2.5">
                <form onSubmit={onSubmit} className="space-y-2.5">
                  <textarea
                    rows={2}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onSubmit(e);
                      }
                    }}
                    placeholder="Refine search or ask Cartwright AI to find something else..."
                    className="w-full resize-none border-none bg-transparent p-0 text-sm sm:text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-0 leading-relaxed font-normal"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                    <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/90 p-0.5">
                      <button
                        type="button"
                        onClick={() => setBrowserMode("local")}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer",
                          browserMode === "local"
                            ? "bg-zinc-800 text-white shadow-xs"
                            : "text-zinc-400 hover:text-zinc-200"
                        )}
                      >
                        Local Chrome
                      </button>
                      <button
                        type="button"
                        onClick={() => setBrowserMode("browserbase")}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer",
                          browserMode === "browserbase"
                            ? "bg-zinc-800 text-white shadow-xs"
                            : "text-zinc-400 hover:text-zinc-200"
                        )}
                      >
                        Cloud
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={run.isPending || !query.trim()}
                      className="h-8 w-8 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 flex items-center justify-center shadow-xs transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                      title={run.isPending ? "Searching…" : "Run Agent"}
                    >
                      <ArrowUp className="h-4 w-4 stroke-[2.5]" />
                    </button>
                  </div>
                </form>
              </div>

              {/* Parsed Intent breakdown if active */}
              {intent && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-zinc-500 font-medium">Parsed Constraints:</span>
                  <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800/80 px-2.5 py-0.5 font-mono text-[11px] text-zinc-300">
                    Budget: {intent.budgetInMinor ? formatCurrency(intent.budgetInMinor, intent.currency) : "No limit"}
                  </span>
                  {intent.category && (
                    <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800/80 px-2.5 py-0.5 text-[11px] text-zinc-300">
                      {intent.category}
                    </span>
                  )}
                  {intent.preferredMerchants.map((m) => (
                    <span key={m} className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                      Store: {m}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar: Dedicated WebPreview using AI Elements */}
      <div
        className={cn(
          "h-full border-l border-zinc-800/80 bg-[#111111] flex flex-col shrink-0 transition-all duration-300 z-10",
          isBrowserSidebarOpen
            ? "w-80 md:w-96 lg:w-[420px] xl:w-[480px]"
            : "w-0 opacity-0 overflow-hidden border-l-0"
        )}
      >
        <SessionWebPreview
          url={
            runResult?.recommendations?.[0]?.product?.productUrl ||
            (targetStoreDisplay.startsWith("http")
              ? targetStoreDisplay
              : targetStoreDisplay.toLowerCase() === "raven"
              ? "https://ravenscents.com"
              : `https://${targetStoreDisplay.toLowerCase()}.in`)
          }
          liveFrame={liveFeed.data?.frame ?? null}
          videoUrl={videoUrl}
          isLivePending={run.isPending}
          onClose={() => setIsBrowserSidebarOpen(false)}
          availableRecordings={availableRecordings}
          selectedRecording={activeRecordingFile}
          onSelectRecording={setSelectedRecording}
          logs={sessionLogs}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function RecommendationCard({
  rank,
  rec,
  isSelectingThis,
  isLocked,
  isSelected,
  onSelect,
}: {
  rank: number;
  rec: Recommendation;
  isSelectingThis?: boolean;
  isLocked?: boolean;
  isSelected?: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { product } = rec;
  const isTop = rec.isTopRecommendation;

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-[#161616]/90 p-5 shadow-2xl transition-all hover:border-zinc-700/80 space-y-4",
        isSelected ? "border-emerald-500/80 ring-1 ring-emerald-500/30" : ""
      )}
    >
      {/* Top row: Store Name + Rank Badge */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-semibold text-zinc-400 capitalize">
          {product.merchant}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
            isTop
              ? "border-emerald-500/40 bg-emerald-950/60 text-emerald-400"
              : "border-zinc-700 bg-zinc-800/80 text-zinc-300"
          )}
        >
          {isTop ? "Top Choice" : `#${rank} Match`}
        </span>
      </div>

      {/* Product Title & Price */}
      <div className="space-y-1.5">
        <h3 className="text-sm font-bold text-white tracking-tight leading-snug line-clamp-2">
          {product.canonicalTitle}
        </h3>
        <div className="text-xl font-bold font-mono tracking-tight text-white pt-1">
          {formatCurrency(product.amountInMinor, product.currency)}
        </div>
      </div>

      {/* Availability & Confidence */}
      <div className="space-y-2 pt-3 border-t border-zinc-800/60 text-xs">
        <div className="flex items-center justify-between text-zinc-400">
          <span>Stock</span>
          <span className="font-medium text-zinc-200 capitalize">
            {product.availability.replace(/_/g, " ")}
          </span>
        </div>

        <div className="flex items-center justify-between text-zinc-400">
          <span>Confidence</span>
          <span className="font-mono text-zinc-300">
            {Math.round(product.confidence * 100)}%
          </span>
        </div>

        {rec.explanation.length > 0 && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 underline cursor-pointer"
            >
              {open ? "Hide details" : "Why this match?"}
            </button>
            {open && (
              <ul className="mt-1.5 space-y-1 text-[11px] text-zinc-400 bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/60">
                {rec.explanation.map((line, i) => (
                  <li key={i} className="leading-relaxed">
                    • {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Select button */}
      <div className="pt-1">
        <button
          type="button"
          onClick={onSelect}
          disabled={isLocked || isSelectingThis}
          className={cn(
            "w-full h-9 text-xs font-semibold rounded-lg shadow-xs transition-colors",
            isSelected
              ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 cursor-default"
              : isLocked
              ? "border border-zinc-800/60 bg-zinc-900/40 text-zinc-500 cursor-not-allowed"
              : isTop
              ? "bg-white hover:bg-zinc-200 text-zinc-950 font-bold cursor-pointer"
              : "border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-200 cursor-pointer"
          )}
        >
          {isSelected
            ? "Selected"
            : isSelectingThis
            ? "Requesting…"
            : isLocked
            ? "Select Product"
            : "Select & Request Purchase"}
        </button>
      </div>
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
  paymentSteps?: TransactionStatus[];
  onApprove: () => void;
  onStartPayment: () => void;
  onOpenCheckout: () => void;
  approveMessage?: string;
  verifyMessage?: string;
}) {
  const { purchase, currency, status, paymentSource, paymentSteps } = props;
  if (!purchase) return null;

  const isApproved = status === "APPROVED" || status === "PAYMENT_SUCCEEDED";
  const isPendingApproval = status === "AWAITING_APPROVAL";
  const isBlocked =
    status === "POLICY_BLOCKED" ||
    status === "PRICE_CHANGED" ||
    status === "CANCELLED" ||
    status === "PAYMENT_FAILED";

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-[#161616]/90 p-5 shadow-2xl space-y-4">
      {/* Header with status badge */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-xs font-semibold text-zinc-400">Order Verification</span>
          <p className="font-mono text-xs text-zinc-500">ID: {purchase.transactionId}</p>
        </div>

        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            isApproved
              ? "border-emerald-500/40 bg-emerald-950/60 text-emerald-400"
              : isPendingApproval
              ? "border-amber-500/40 bg-amber-950/60 text-amber-400"
              : isBlocked
              ? "border-rose-500/40 bg-rose-950/60 text-rose-400"
              : "border-zinc-700 bg-zinc-800 text-zinc-300"
          )}
        >
          {status?.replace(/_/g, " ")}
        </span>
      </div>

      {/* Flat Clean Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-zinc-800/60">
        <div className="space-y-1">
          <span className="text-xs text-zinc-400">Order Amount</span>
          <p className="font-mono font-bold text-base text-white">
            {formatCurrency(purchase.amountInMinor, currency)}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-zinc-400">Policy Gate</span>
          <p className="font-semibold text-sm text-zinc-200 capitalize">
            {purchase.policyDecision.replace(/_/g, " ")}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-zinc-400">Spending Cap</span>
          <p className="font-mono text-sm text-zinc-300">
            {formatCurrency(purchase.maxTotalSpending, currency)}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-zinc-400">Auto Limit</span>
          <p className="font-mono text-sm text-zinc-300">
            {formatCurrency(purchase.autoApprovalLimitInMinor, currency)}
          </p>
        </div>
      </div>

      {purchase.policyReason && (
        <p className="text-sm sm:text-base font-medium text-zinc-200 leading-relaxed pt-1">
          {purchase.policyReason}
        </p>
      )}

      {/* Action buttons (only rendered when active) */}
      {Boolean(
        status === "AWAITING_APPROVAL" ||
          (status === "APPROVED" && paymentSource === "merchant_ui") ||
          (status === "APPROVED" && paymentSource === "agent_razorpay" && !props.merchantResult) ||
          (status === "PAYMENT_PROCESSING" && props.razorpayReady) ||
          props.merchantResult ||
          props.verifyMessage
      ) && (
        <div className="pt-2 flex items-center gap-3">
          {status === "AWAITING_APPROVAL" && (
            <button
              type="button"
              onClick={props.onApprove}
              disabled={props.approveBusy}
              className="h-9 px-4 text-xs font-bold rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 shadow-xs cursor-pointer transition-colors"
            >
              {props.approveBusy ? "Approving…" : "Approve & Permit Purchase"}
            </button>
          )}

          {status === "APPROVED" && paymentSource === "merchant_ui" && (
            <button
              type="button"
              onClick={props.onApprove}
              disabled={props.approveBusy}
              className="h-9 px-4 text-xs font-bold rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 shadow-xs cursor-pointer transition-colors"
            >
              {props.approveBusy ? "Executing on Merchant…" : "Execute Checkout on Merchant"}
            </button>
          )}

          {status === "APPROVED" && paymentSource === "agent_razorpay" && !props.merchantResult && (
            <button
              type="button"
              onClick={props.onStartPayment}
              disabled={props.initiateBusy}
              className="h-9 px-4 text-xs font-bold rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 shadow-xs cursor-pointer transition-colors"
            >
              {props.initiateBusy ? "Creating order…" : "Continue to Razorpay Checkout"}
            </button>
          )}

          {status === "PAYMENT_PROCESSING" && props.razorpayReady && (
            <button
              type="button"
              onClick={props.onOpenCheckout}
              disabled={props.verifyBusy}
              className="h-9 px-4 text-xs font-bold rounded-lg bg-emerald-400 hover:bg-emerald-300 text-zinc-950 shadow-xs cursor-pointer transition-colors"
            >
              {props.verifyBusy ? "Verifying payment…" : "Open Razorpay Test Checkout"}
            </button>
          )}

          {props.merchantResult && (
            <p className="text-xs font-medium text-emerald-400">
              {props.merchantResult.message}
            </p>
          )}

          {props.verifyMessage && (
            <p className="text-xs font-medium text-emerald-400">
              {props.verifyMessage}
            </p>
          )}
        </div>
      )}

      {/* Financial Execution Pipeline */}
      {(() => {
        const standardSteps = [
          { key: "CREATED", label: "Created" },
          { key: "POLICY_CHECKING", label: "Policy Check" },
          { key: "AWAITING_APPROVAL", label: "Approval" },
          { key: "APPROVED", label: "Approved" },
          { key: "PAYMENT_PROCESSING", label: "Payment" },
          { key: "PAYMENT_SUCCEEDED", label: "Settled" },
        ];

        let pipelineSteps: { key: string; label: string; state: "completed" | "current" | "blocked" | "pending" }[];

        if (!status) {
          pipelineSteps = standardSteps.map((s) => ({ ...s, state: "pending" }));
        } else if (status === "POLICY_BLOCKED") {
          pipelineSteps = standardSteps.map((s) => {
            if (s.key === "CREATED") return { ...s, state: "completed" };
            if (s.key === "POLICY_CHECKING") return { ...s, label: "Policy Blocked", state: "blocked" };
            return { ...s, state: "pending" };
          });
        } else if (status === "PRICE_CHANGED" || status === "CANCELLED") {
          pipelineSteps = standardSteps.map((s) => {
            if (s.key === "CREATED" || s.key === "POLICY_CHECKING") return { ...s, state: "completed" };
            if (s.key === "AWAITING_APPROVAL")
              return { ...s, label: status === "PRICE_CHANGED" ? "Price Changed" : "Cancelled", state: "blocked" };
            return { ...s, state: "pending" };
          });
        } else if (status === "PAYMENT_FAILED") {
          pipelineSteps = standardSteps.map((s) => {
            if (s.key === "PAYMENT_PROCESSING") return { ...s, label: "Payment Failed", state: "blocked" };
            if (s.key === "PAYMENT_SUCCEEDED") return { ...s, state: "pending" };
            return { ...s, state: "completed" };
          });
        } else if (status === "PAYMENT_SUCCEEDED") {
          pipelineSteps = standardSteps.map((s) => ({ ...s, state: "completed" }));
        } else {
          const order = [
            "CREATED",
            "POLICY_CHECKING",
            "AWAITING_APPROVAL",
            "APPROVED",
            "PAYMENT_PROCESSING",
            "PAYMENT_SUCCEEDED",
          ];
          const currentIdx = order.indexOf(status);
          pipelineSteps = standardSteps.map((s, idx) => {
            if (idx < currentIdx) return { ...s, state: "completed" };
            if (idx === currentIdx) return { ...s, state: "current" };
            return { ...s, state: "pending" };
          });
        }

        return (
          <div className="space-y-2 border-t border-zinc-800/60 pt-3">
            <span className="text-[11px] font-semibold text-zinc-400 block">Execution Pipeline</span>

            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {pipelineSteps.map((step, i) => (
                <div key={step.key} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-mono transition-all",
                      step.state === "completed"
                        ? "border border-emerald-500/30 bg-emerald-950/30 text-emerald-400 font-medium"
                        : step.state === "current"
                        ? "border border-purple-500/50 bg-purple-600 text-white font-bold shadow-xs ring-1 ring-purple-400/40"
                        : step.state === "blocked"
                        ? "border border-rose-500/60 bg-rose-950/60 text-rose-300 font-bold shadow-xs"
                        : "border border-zinc-800/80 bg-zinc-900/40 text-zinc-600 font-normal"
                    )}
                  >
                    {step.state === "completed" && <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />}
                    {step.state === "blocked" && <XCircle className="h-3 w-3 text-rose-400 shrink-0" />}
                    {step.state === "current" && (
                      <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping shrink-0" />
                    )}
                    <span>{step.label}</span>
                  </div>
                  {i < pipelineSteps.length - 1 && (
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 mx-0.5",
                        step.state === "completed"
                          ? "text-emerald-400/70"
                          : step.state === "blocked"
                          ? "text-rose-400/70"
                          : "text-zinc-500"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
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

