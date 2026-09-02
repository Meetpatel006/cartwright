"use client";

import { useMemo } from "react";
import { cn } from "@cartwright/ui/lib/utils";

export function FormattedAmount({
  minor,
  currency,
  className,
}: {
  minor: number;
  currency: string;
  className?: string;
}) {
  const parts = useMemo(() => {
    try {
      const activeCurrency = currency || "INR";
      const formatter = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: activeCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const formattedParts = formatter.formatToParts(minor / 100);
      const currencySymbol =
        formattedParts.find((p) => p.type === "currency")?.value ||
        (activeCurrency === "INR" ? "₹" : "$");
      const numberValue = formattedParts
        .filter((p) => p.type !== "currency")
        .map((p) => p.value)
        .join("")
        .trim();
      return { symbol: currencySymbol, number: numberValue };
    } catch {
      return {
        symbol: currency === "USD" ? "$" : "₹",
        number: (minor / 100).toFixed(2),
      };
    }
  }, [minor, currency]);

  return (
    <span className={cn("font-mono text-sm whitespace-nowrap", className)}>
      <span className="font-normal text-muted-foreground mr-0.5">{parts.symbol}</span>
      <span className="font-bold text-foreground">{parts.number}</span>
    </span>
  );
}

export function formatDate(dateInput: string | Date): string {
  try {
    const d = new Date(dateInput);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return "";
  }
}

export function getStatusDetails(status: string) {
  const norm = (status || "").toUpperCase();
  switch (norm) {
    case "PAYMENT_SUCCEEDED":
    case "APPROVED":
      return {
        statusLabel: "Paid",
        statusTone: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-500/40 dark:text-emerald-400",
        dotColor: "bg-emerald-400",
        fulfillmentLabel: "Delivered",
        fulfillmentTone: "bg-muted border-border text-foreground",
        progressPercent: 100,
        boardColumn: "Delivered",
      };
    case "PAYMENT_PROCESSING":
      return {
        statusLabel: "Paid",
        statusTone: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-500/40 dark:text-emerald-400",
        dotColor: "bg-emerald-400",
        fulfillmentLabel: "In Transit",
        fulfillmentTone: "bg-muted border-border text-foreground",
        progressPercent: 80,
        boardColumn: "In Transit",
      };
    case "POLICY_CHECKING":
    case "AWAITING_APPROVAL":
    case "ACTIVE":
    case "CREATED":
      return {
        statusLabel: "Pending",
        statusTone: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/60 dark:border-amber-500/40 dark:text-amber-400",
        dotColor: "bg-amber-400",
        fulfillmentLabel: norm === "AWAITING_APPROVAL" ? "Awaiting Approval" : "Processing",
        fulfillmentTone: "bg-muted border-border text-foreground",
        progressPercent: norm === "AWAITING_APPROVAL" ? 40 : 20,
        boardColumn: "Pending",
      };
    case "PAYMENT_FAILED":
    case "POLICY_BLOCKED":
    case "PRICE_CHANGED":
    case "CANCELLED":
    default:
      return {
        statusLabel: "Failed",
        statusTone: "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/60 dark:border-rose-500/40 dark:text-rose-400",
        dotColor: "bg-rose-400",
        fulfillmentLabel: norm === "CANCELLED" ? "Cancelled" : norm === "PRICE_CHANGED" ? "Price Changed" : "Blocked",
        fulfillmentTone: "bg-muted border-border text-foreground",
        progressPercent: 0,
        boardColumn: "Failed",
      };
  }
}

export function SegmentedProgressBar({ percent }: { percent: number }) {
  const totalBars = 5;
  const filledBars = Math.round((percent / 100) * totalBars);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: totalBars }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-3.5 w-1 rounded-full transition-colors",
              i < filledBars ? "bg-primary" : "bg-muted"
            )}
          />
        ))}
      </div>
      <span className="font-mono text-xs font-semibold text-foreground">
        {percent}%
      </span>
    </div>
  );
}
