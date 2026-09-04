"use client";

import { cn } from "@cartwright/ui/lib/utils";

import type { Recommendation } from "@/app/shopper/shopper-client";
import { formatCurrency } from "@/components/shopper/formatters";

export default function RecommendationCard({
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
  const { product } = rec;
  const isTop = rec.isTopRecommendation;
  const ratingScore = product.rating == null ? null : Math.round((product.rating / 5) * 100);

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-border/80 space-y-4",
        isSelected ? "border-emerald-500/80 ring-1 ring-emerald-500/30" : ""
      )}
    >
      {/* Top row: Store Name + Rank Badge */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-semibold text-muted-foreground capitalize">
          {product.merchant}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
            isTop
              ? "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
              : "border-border bg-muted text-foreground"
          )}
        >
          {isTop ? "Top Choice" : `#${rank} Match`}
        </span>
      </div>

      {/* Product Title & Price */}
      <div className="space-y-1.5">
        <h3 className="text-sm font-bold text-foreground tracking-tight leading-snug line-clamp-2">
          {product.canonicalTitle}
        </h3>
        <div className="text-xl font-bold font-mono tracking-tight text-foreground pt-1">
          {formatCurrency(product.amountInMinor, product.currency)}
        </div>
      </div>

      {/* Availability & Confidence */}
      <div className="space-y-2 pt-3 border-t border-border text-xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Stock</span>
          <span className="font-medium text-foreground capitalize">
            {product.availability.replace(/_/g, " ")}
          </span>
        </div>

        <div className="flex items-center justify-between text-muted-foreground">
          <span>Confidence</span>
          <span className="font-mono text-foreground">
            {Math.round(product.confidence * 100)}%
          </span>
        </div>

        <div className="flex items-center justify-between text-muted-foreground">
          <span>Verified listing rating</span>
          <span className="font-mono text-foreground">
            {ratingScore == null ? "Not available" : `${ratingScore}/100`}
          </span>
        </div>
        {product.rating != null && (
          <div className="text-[11px] text-muted-foreground">
            {product.rating.toFixed(1)}/5 from {product.reviewCount == null ? "an unknown number of" : product.reviewCount.toLocaleString("en-IN")} observed reviews
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
            "w-full h-9 text-xs font-semibold rounded-lg transition-colors",
            isSelected
              ? "bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/50 cursor-default"
              : isLocked
              ? "border border-border bg-muted/40 text-muted-foreground cursor-not-allowed"
              : isTop
              ? "bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
              : "border border-border bg-muted hover:bg-muted hover:border-border text-foreground cursor-pointer"
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
