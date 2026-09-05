"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@cartwright/ui/components/button";
import type {
  PurchasePlan,
  Recommendation,
  ShoppingIntent,
  ShoppingSessionView,
  SelectProductOutput,
} from "@cartwright/api/shopping/shopping.types";
import type { TransactionResult } from "@cartwright/api/transactions/transaction.types";
import { trpc } from "@/utils/trpc";
import { cn } from "@cartwright/ui/lib/utils";
import { SessionWebPreview } from "@/components/session-web-preview";
import RecommendationCard from "@/components/shopper/recommendation-card";
import TransactionPanel from "@/components/shopper/transaction-panel";
import { availabilityTone, formatCurrency } from "@/components/shopper/formatters";
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
  Sparkles,
} from "lucide-react";

export type TransactionStatus =
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

export type { PurchasePlan, Recommendation, ShoppingIntent } from "@cartwright/api/shopping/shopping.types";
export type TransactionView = TransactionResult;
type ShoppingRunResult = ShoppingSessionView;
type SelectResult = SelectProductOutput;

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const BROWSER_MODE_STORAGE_KEY = "cartwright:browserMode";

/** Mode the user picked, surviving the /shopper -> /shopper/[id] remount. */
function readPersistedBrowserMode(): "local" | "browserbase" {
  if (typeof window === "undefined") return "local";
  try {
    const param = new URLSearchParams(window.location.search).get("browser");
    if (param === "browserbase" || param === "local") {
      window.sessionStorage.setItem(BROWSER_MODE_STORAGE_KEY, param);
      return param;
    }
    if (window.sessionStorage.getItem(BROWSER_MODE_STORAGE_KEY) === "browserbase") {
      return "browserbase";
    }
  } catch {
    /* storage/URL unavailable (SSR) — fall through to local */
  }
  return "local";
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

interface ShopperPageProps {
  initialSessionId?: string;
}

export default function ShopperPage({ initialSessionId }: ShopperPageProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState("wireless headphones under 5000");
  // The create->run flow navigates to /shopper/[id], which remounts this
  // component and resets useState — silently dropping a "Cloud" pick back to
  // "local". Persist the choice in sessionStorage (written on every toggle and
  // read on mount) so the auto-run on the session page uses the mode the user
  // actually picked. The ?browser= URL param is kept for shareable links and
  // takes precedence when present.
  const [browserMode, setBrowserModeState] = useState<"local" | "browserbase">(readPersistedBrowserMode);
  const setBrowserMode = (mode: "local" | "browserbase") => {
    try {
      window.sessionStorage.setItem(BROWSER_MODE_STORAGE_KEY, mode);
    } catch {
      /* storage unavailable — state still updates for this view */
    }
    setBrowserModeState(mode);
  };
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initialSessionId ?? null);

  const loadedSession = useQuery(
    trpc.shopping.get.queryOptions(
      { sessionId: selectedSessionId ?? "" },
      {
        enabled: Boolean(selectedSessionId),
        refetchInterval: (query) =>
          query.state.data?.status === "processing" ? 1500 : false,
      }
    )
  );

  const run = useMutation({
    ...trpc.shopping.run.mutationOptions(),
    onSuccess: (data) => {
      setSelectedSessionId(data.sessionId);
      const targetPath = `/shopper/${data.sessionId}`;
      if (pathname !== targetPath) {
        router.push(`${targetPath}?browser=${browserMode}` as any, { scroll: false });
      }
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
            rating: c.rating ?? null,
            reviewCount: c.reviewCount ?? null,
            availability: (c.availability as any) ?? "unknown",
            confidence: c.confidence ?? 1,
            attributes: {},
            confidenceReasons: [],
          },
          rankingScore: c.rankingScore ?? 0,
          rankingFactors: [],
          explanation: [c.reason || "Loaded from saved database session"],
          isTopRecommendation: i === 0,
        })),
        createdAt: loadedSession.data.createdAt,
      }
    : undefined;

  // A route session has a cached DB snapshot, but the current run response is
  // newer and contains the recommendations that were just discovered. Only
  // use that response when it belongs to the active session; otherwise keep
  // showing the selected historical session.
  const runResult =
    rawRunResult && (!selectedSessionId || rawRunResult.sessionId === selectedSessionId)
      ? rawRunResult
      : historicalResult;

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
  const [isBrowserSidebarOpen, setIsBrowserSidebarOpen] = useState(false);
  const [dismissedClarifications, setDismissedClarifications] = useState<Record<string, boolean>>({});

  const createSession = useMutation(trpc.shopping.create.mutationOptions());
  const [pendingClarification, setPendingClarification] = useState<{
    query: string;
    questions: ApprovalQuestion[];
    parsedIntent?: ShoppingIntent;
  } | null>(null);

  // Selecting a product is the user's explicit purchase action. When the
  // server policy has already approved that transaction and the retained
  // merchant checkout is available, finish the merchant's Razorpay Test Mode
  // checkout automatically. Transactions requiring user approval stay on the
  // approval button, and server-side guards remain authoritative.
  const autoMerchantPaymentRef = useRef<string | null>(null);
  const selectedPurchase =
    (select.data?.purchase as TransactionView | undefined) ??
    (loadedPurchase.data as unknown as TransactionView | undefined);
  useEffect(() => {
    const purchase = selectedPurchase;
    if (
      !purchase ||
      purchase.status !== "APPROVED" ||
      purchase.paymentSource !== "merchant_ui" ||
      approve.isPending ||
      approve.error ||
      approve.data?.result.transactionId === purchase.transactionId ||
      autoMerchantPaymentRef.current === purchase.transactionId
    ) {
      return;
    }

    autoMerchantPaymentRef.current = purchase.transactionId;
    approve.mutate({ transactionId: purchase.transactionId, method: payMethod });
  }, [selectedPurchase, approve.isPending, approve.error, approve.data, payMethod]);

  // Session purchases use Cartwright's provider-independent Test Mode gateway.
  // Policy approval still happens first; merchant checkout is never involved.
  const gatewayPurchase =
    (approve.data?.result as TransactionView | undefined) ?? selectedPurchase;
  const gatewayStartRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !gatewayPurchase ||
      gatewayPurchase.status !== "APPROVED" ||
      gatewayPurchase.paymentSource !== "agent_razorpay" ||
      initiatePayment.isPending ||
      initiatePayment.data?.transactionId === gatewayPurchase.transactionId ||
      gatewayStartRef.current === gatewayPurchase.transactionId
    ) return;

    gatewayStartRef.current = gatewayPurchase.transactionId;
    initiatePayment.mutate({ transactionId: gatewayPurchase.transactionId });
  }, [gatewayPurchase, initiatePayment.isPending, initiatePayment.data]);

  const startedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    const session = loadedSession.data;
    if (!initialSessionId || !session || session.status !== "created" || run.isPending) return;
    if (startedSessionRef.current === initialSessionId) return;
    startedSessionRef.current = initialSessionId;
    run.mutate({
      sessionId: initialSessionId,
      query: session.rawQuery,
      browserMode,
      idempotencyKey,
    });
  }, [initialSessionId, loadedSession.data, run.isPending, browserMode, idempotencyKey]);

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

  // Open the real Razorpay Test Mode modal as soon as the server-created order
  // is ready. The card fields and confirmation remain visible in the checkout;
  // only the merchant checkout was removed from the session flow.
  const openedGatewayOrderRef = useRef<string | null>(null);
  useEffect(() => {
    const order = initiatePayment.data;
    if (!order || !razorpayReady || openedGatewayOrderRef.current === order.orderId) return;
    openedGatewayOrderRef.current = order.orderId;
    openAgentRazorpayCheckout();
  }, [initiatePayment.data, razorpayReady]);

  const startPayment = () => {
    if (!effectivePurchase || status !== "APPROVED") return;
    initiatePayment.mutate({ transactionId: effectivePurchase.transactionId });
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanQ = query.trim();
    if (!cleanQ || run.isPending || createSession.isPending) return;

    select.reset();
    setSelectedSessionId(null);
    setPendingClarification(null);

    // Persist the picked backend before navigating: the session page remounts
    // this component and its auto-run must reuse this exact mode.
    try {
      window.sessionStorage.setItem(BROWSER_MODE_STORAGE_KEY, browserMode);
    } catch {
      /* storage unavailable — URL param still carries the mode */
    }

    const key = crypto.randomUUID();
    setIdempotencyKey(key);
    createSession.mutate({ query: cleanQ, idempotencyKey: key }, {
      onSuccess: ({ sessionId }) => {
        setSelectedSessionId(sessionId);
        router.push(`/shopper/${sessionId}?browser=${browserMode}`, { scroll: false });
      },
    });
  };

  const onSelect = (productId: string) => {
    if (!runResult) return;
    approve.reset();
    initiatePayment.reset();
    const candidate = runResult.recommendations?.find((r) => r.product.id === productId);
    const merchantName = candidate?.product?.merchant || targetStoreDisplay;
    const isLocalStore =
      merchantName.toLowerCase().includes("raven") ||
      merchantName.toLowerCase().includes("local-merchant") ||
      merchantName.toLowerCase().includes("local merchant");
    select.mutate({
      sessionId: runResult.sessionId,
      productId,
      paymentMode: isLocalStore ? "merchant" : "cartwright",
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const sessionState =
    (loadedSession.data?.status === "processing" ? "created" : loadedSession.data?.status) ??
    (status === "PAYMENT_SUCCEEDED"
      ? "converted"
      : selectData
      ? "selected"
      : runResult && (runResult.recommendations?.length ?? 0) > 0
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
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted text-foreground mx-auto mb-3">
                <ShoppingBag className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-bold text-foreground tracking-tight">
                What can Cartwright Agent find for you?
              </h2>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
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
                <div className="relative rounded-xl border border-border bg-card p-4 transition-all focus-within:border-border focus-within:ring-1 focus-within:ring-border space-y-2.5">
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
                      className="w-full resize-none border-none bg-transparent p-0 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 leading-relaxed font-normal"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                      <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
                        <button
                          type="button"
                          onClick={() => setBrowserMode("local")}
                          className={cn(
                            "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer",
                            browserMode === "local"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
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
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Cloud
                        </button>
                      </div>

                      <button
                        type="submit"
                        disabled={run.isPending || createSession.isPending || !query.trim()}
                        className="h-8 w-8 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                        title={createSession.isPending ? "Creating session…" : run.isPending ? "Searching…" : "Run Agent"}
                      >
                        {createSession.isPending ? (
                          <span className="h-3.5 w-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ArrowUp className="h-4 w-4 stroke-[2.5]" />
                        )}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Quick Prompt Suggestion Pills with SVG Icons */}
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className="text-muted-foreground font-medium">Try:</span>
                  {[
                    { label: "Wireless Headphones on Amazon under ₹5k", icon: Headphones, q: "wireless headphones on amazon under 5000" },
                    { label: "Gardenia Perfume on Raven Scents under ₹5k", icon: Sparkles, q: "gardenia perfume on raven scents under 5000" },
                    { label: "Nike Running Shoes under ₹6k", icon: Footprints, q: "running shoes from nike under 6000" },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setQuery(item.q)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
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
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-border">
                {/* Left: Icon Box + Title */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted text-foreground shrink-0">
                    <ShoppingBag className="h-4 w-4" />
                  </div>
                  <h1 className="text-xl font-bold tracking-tight text-foreground capitalize truncate max-w-lg">
                    {loadedSession.data?.rawQuery || query || "Shopping Session"}
                  </h1>
                  {/* Backend that actually executed this run (echoed by the server). */}
                  {runResult?.browserMode && (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shrink-0",
                        runResult.browserMode === "browserbase"
                          ? "border-sky-500/40 bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400"
                          : "border-border bg-muted text-muted-foreground"
                      )}
                      title={
                        runResult.browserMode === "browserbase"
                          ? "This run executed on Browserbase cloud"
                          : "This run executed on local Chrome"
                      }
                    >
                      {run.isPending
                        ? `Running on ${runResult.browserMode === "browserbase" ? "Cloud" : "Local"}…`
                        : runResult.browserMode === "browserbase"
                          ? "Cloud · Browserbase"
                          : "Local Chrome"}
                    </span>
                  )}
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
                      if (pathname !== "/shopper") {
                        router.push("/shopper", { scroll: false });
                      }
                    }}
                    className="h-9 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:border-border hover:bg-muted hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New Search</span>
                  </button>

                  {!isBrowserSidebarOpen && (
                    <button
                      type="button"
                      onClick={() => setIsBrowserSidebarOpen(true)}
                      className="h-9 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:border-border hover:bg-muted hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5"
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
                <div className="rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 p-4 text-xs text-rose-700 dark:text-rose-300">
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
              {runResult && (runResult.recommendations?.length ?? 0) > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-foreground tracking-tight">
                      Discovered Products ({runResult.recommendations?.length ?? 0})
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      Ranked by price match & merchant policy
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {(runResult.recommendations ?? []).map((rec, index) => {
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
                  <h2 className="text-base font-bold text-foreground tracking-tight">
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
              {run.isPending && (!runResult || (runResult.recommendations?.length ?? 0) === 0) && (
                <div className="rounded-2xl border border-border bg-muted p-8 text-center space-y-3">
                  <div className="h-6 w-6 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mx-auto" />
                  <p className="text-sm font-semibold text-foreground">Agent Navigating Stores</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
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
              <div className="relative rounded-xl border border-border bg-card p-4 transition-all focus-within:border-border focus-within:ring-1 focus-within:ring-border space-y-2.5">
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
                    className="w-full resize-none border-none bg-transparent p-0 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 leading-relaxed font-normal"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                    <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
                      <button
                        type="button"
                        onClick={() => setBrowserMode("local")}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer",
                          browserMode === "local"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
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
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Cloud
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={run.isPending || !query.trim()}
                      className="h-8 w-8 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
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
                  <span className="text-muted-foreground font-medium">Parsed Constraints:</span>
                  <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-[11px] text-foreground">
                    Budget: {intent.budgetInMinor ? formatCurrency(intent.budgetInMinor, intent.currency || "INR") : "No limit"}
                  </span>
                  {intent.category && (
                    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] text-foreground">
                      {intent.category}
                    </span>
                  )}
                  {(intent as any).brand && (
                    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] text-foreground">
                      Brand: {(intent as any).brand}
                    </span>
                  )}
                  {Array.isArray(intent.preferredMerchants) && intent.preferredMerchants.map((m) => (
                    <span key={m} className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
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
          "h-full border-l border-border bg-card flex flex-col shrink-0 transition-all duration-300 z-10",
          isBrowserSidebarOpen
            ? "w-80 md:w-96 lg:w-[420px] xl:w-[480px]"
            : "w-0 opacity-0 overflow-hidden border-l-0"
        )}
      >
        <SessionWebPreview
          url={
            runResult?.recommendations?.[0]?.product?.productUrl ||
            (typeof targetStoreDisplay === "string" && targetStoreDisplay.startsWith("http")
              ? targetStoreDisplay
              : targetStoreDisplay.toLowerCase() === "raven" ||
                targetStoreDisplay.toLowerCase().includes("raven") ||
                targetStoreDisplay.toLowerCase().includes("local-merchant") ||
                targetStoreDisplay.toLowerCase().includes("local merchant")
              ? (process.env.NEXT_PUBLIC_LOCAL_MERCHANT_URL || "http://localhost:5173")
              : targetStoreDisplay.toLowerCase().includes("boat")
              ? "https://www.boat-lifestyle.com"
              : "https://www.boat-lifestyle.com")
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
