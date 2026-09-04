"use client";

import {
  CheckCircle2,
  ChevronRight,
  XCircle,
} from "lucide-react";

import { cn } from "@cartwright/ui/lib/utils";
import { formatCurrency } from "@/components/shopper/formatters";
import type { TransactionStatus, TransactionView } from "@/app/shopper/shopper-client";

export default function TransactionPanel(props: {
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
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header with status badge */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-xs font-semibold text-muted-foreground">Order Verification</span>
          <p className="font-mono text-xs text-muted-foreground">ID: {purchase.transactionId}</p>
        </div>

        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            isApproved
              ? "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
              : isPendingApproval
              ? "border-amber-500/40 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400"
              : isBlocked
              ? "border-rose-500/40 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400"
              : "border-border bg-muted text-foreground"
          )}
        >
          {status?.replace(/_/g, " ")}
        </span>
      </div>

      {/* Flat Clean Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-border">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Order Amount</span>
          <p className="font-mono font-bold text-base text-foreground">
            {formatCurrency(purchase.amountInMinor, currency)}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Policy Gate</span>
          <p className="font-semibold text-sm text-foreground capitalize">
            {purchase.policyDecision.replace(/_/g, " ")}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Spending Cap</span>
          <p className="font-mono text-sm text-foreground">
            {formatCurrency(purchase.maxTotalSpending, currency)}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Auto Limit</span>
          <p className="font-mono text-sm text-foreground">
            {formatCurrency(purchase.autoApprovalLimitInMinor, currency)}
          </p>
        </div>
      </div>

      {/* Policy reason — only shown when actionable (blocked or awaiting approval).
          Hidden after approval/payment so a stale "exceeds limit" note does not
          appear on a fully-settled transaction. */}
      {purchase.policyReason &&
        (status === "POLICY_BLOCKED" || status === "AWAITING_APPROVAL") && (
          <p className="text-sm sm:text-base font-medium text-foreground leading-relaxed pt-1">
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
              className="h-9 px-4 text-xs font-bold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer transition-colors"
            >
              {props.approveBusy ? "Approving..." : "Approve & Permit Purchase"}
            </button>
          )}

          {status === "APPROVED" && paymentSource === "merchant_ui" && (
            <button
              type="button"
              onClick={props.onApprove}
              disabled={props.approveBusy}
              className="h-9 px-4 text-xs font-bold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer transition-colors"
            >
              {props.approveBusy ? "Executing on Merchant..." : "Execute Checkout on Merchant"}
            </button>
          )}

          {status === "APPROVED" && paymentSource === "agent_razorpay" && !props.merchantResult && (
            <button
              type="button"
              onClick={props.onStartPayment}
              disabled={props.initiateBusy}
              className="h-9 px-4 text-xs font-bold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer transition-colors"
            >
              {props.initiateBusy ? "Creating order..." : "Continue to Razorpay Checkout"}
            </button>
          )}

          {status === "PAYMENT_PROCESSING" && props.razorpayReady && (
            <button
              type="button"
              onClick={props.onOpenCheckout}
              disabled={props.verifyBusy}
              className="h-9 px-4 text-xs font-bold rounded-lg bg-emerald-400 hover:bg-emerald-300 text-primary-foreground cursor-pointer transition-colors"
            >
              {props.verifyBusy ? "Verifying payment..." : "Open Razorpay Test Checkout"}
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
          pipelineSteps = standardSteps
            .filter((s) => s.key === "CREATED" || s.key === "POLICY_CHECKING")
            .map((s) =>
              s.key === "CREATED"
                ? { ...s, state: "completed" as const }
                : { ...s, label: "Policy Blocked", state: "blocked" as const },
            );
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
          <div className="space-y-2 border-t border-border pt-3">
            <span className="text-[11px] font-semibold text-muted-foreground block">Execution Pipeline</span>

            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {pipelineSteps.map((step, i) => (
                <div key={step.key} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-mono transition-all",
                      step.state === "completed"
                        ? "border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-medium"
                        : step.state === "current"
                        ? "border border-purple-500/50 bg-purple-100 dark:bg-purple-600 text-purple-800 dark:text-foreground font-bold ring-1 ring-purple-400/40"
                        : step.state === "blocked"
                        ? "border border-rose-500/60 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold"
                        : "border border-border bg-muted/40 text-muted-foreground font-normal"
                    )}
                  >
                    {step.state === "completed" && <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />}
                    {step.state === "blocked" && <XCircle className="h-3 w-3 text-rose-400 shrink-0" />}
                    {step.state === "current" && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping shrink-0" />
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
                          : "text-muted-foreground"
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
