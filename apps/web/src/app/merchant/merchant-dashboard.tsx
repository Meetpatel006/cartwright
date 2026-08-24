"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cartwright/ui/components/card";
import { trpc } from "@/utils/trpc";

type Preset = "24h" | "7d" | "30d";

const PRESET_LABEL: Record<Preset, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

function formatPct(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

function formatCurrency(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toLocaleString()}`;
  }
}

const SEVERITY_TONE: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-600",
  opportunity: "bg-amber-500/10 text-amber-600",
  warning: "bg-red-500/10 text-red-600",
};

const CONFIDENCE_TONE: Record<string, string> = {
  low: "bg-gray-500/10 text-gray-600",
  medium: "bg-blue-500/10 text-blue-600",
  high: "bg-green-500/10 text-green-600",
};

type FunnelCountKey =
  | "discovered"
  | "recommended"
  | "selected"
  | "purchaseRequested"
  | "approved"
  | "paymentSucceeded";

const FUNNEL_STAGES: Array<{ key: FunnelCountKey; label: string }> = [
  { key: "discovered", label: "Discovered" },
  { key: "recommended", label: "Recommended" },
  { key: "selected", label: "Selected" },
  { key: "purchaseRequested", label: "Purchase requested" },
  { key: "approved", label: "Approved" },
  { key: "paymentSucceeded", label: "Payment succeeded" },
];

export default function MerchantDashboard() {
  const [preset, setPreset] = useState<Preset>("7d");

  const overview = useQuery(
    trpc.merchantIntelligence.overview.queryOptions({ window: { preset } }),
  );

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Merchant Intelligence</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Read-only, server-derived intelligence over your own shopping funnel — from
        discovery through payment. Nothing here can change a transaction or approve a
        payment; it only observes what Part A/B already recorded.
      </p>

      <div className="mb-6 flex gap-2">
        {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPreset(p)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              p === preset
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {PRESET_LABEL[p]}
          </button>
        ))}
      </div>

      {overview.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {overview.error && (
        <p className="text-sm text-red-500">Could not load merchant intelligence.</p>
      )}

      {overview.data && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Funnel (observed)</CardTitle>
              <CardDescription>
                Counts are exact — every number traces back to a database query, never
                estimated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {FUNNEL_STAGES.map((stage) => (
                  <div key={stage.key} className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">{stage.label}</div>
                    <div className="text-xl font-semibold">
                      {overview.data.funnel.counts[stage.key]}
                    </div>
                  </div>
                ))}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <div>
                  Discovery → recommendation:{" "}
                  {formatPct(overview.data.funnel.discoveryToRecommendationRate)}
                </div>
                <div>
                  Recommendation → selection:{" "}
                  {formatPct(overview.data.funnel.recommendationToSelectionRate)}
                </div>
                <div>
                  Selection → purchase: {formatPct(overview.data.funnel.selectionToPurchaseRate)}
                </div>
                <div>
                  Purchase → approval: {formatPct(overview.data.funnel.purchaseToApprovalRate)}
                </div>
                <div>
                  Approval → payment: {formatPct(overview.data.funnel.approvalToPaymentRate)}
                </div>
                <div className="font-medium text-foreground">
                  Overall conversion: {formatPct(overview.data.funnel.overallConversionRate)}
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Top products (observed)</CardTitle>
              <CardDescription>Ranked by how often they were recommended.</CardDescription>
            </CardHeader>
            <CardContent>
              {overview.data.topProducts.length === 0 && (
                <p className="text-sm text-muted-foreground">No products in this window.</p>
              )}
              <div className="grid gap-2">
                {overview.data.topProducts.map((p) => (
                  <div key={p.productId} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{p.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(p.amountInMinor, p.currency)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Discovered {p.timesDiscovered}×</span>
                      <span>Recommended {p.timesRecommended}×</span>
                      <span>Selected {p.timesSelected}×</span>
                      <span>Converted {p.timesConverted}×</span>
                      <span>Selection rate: {formatPct(p.selectionRate)}</span>
                      <span>Conversion rate: {formatPct(p.conversionRate)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Insights (derived)</CardTitle>
              <CardDescription>
                Deterministic, threshold-based observations — not causal claims, and not
                generated by a language model. Each insight cites its exact evidence.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {overview.data.insights.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No insights meet the sample-size threshold in this window.
                </p>
              )}
              <div className="grid gap-2">
                {overview.data.insights.map((insight) => (
                  <div key={insight.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{insight.title}</span>
                      <div className="flex gap-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            SEVERITY_TONE[insight.severity] ?? "bg-gray-500/10 text-gray-600"
                          }`}
                        >
                          {insight.severity}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            CONFIDENCE_TONE[insight.confidence] ?? "bg-gray-500/10 text-gray-600"
                          }`}
                        >
                          {insight.confidence} confidence
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-muted-foreground">{insight.summary}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Evidence: {insight.evidence.metric} ={" "}
                      {(insight.evidence.currentValue * 100).toFixed(1)}%
                      {insight.evidence.comparisonValue !== undefined &&
                        ` (threshold ${(insight.evidence.comparisonValue * 100).toFixed(1)}%)`}
                      , sample size {insight.evidence.sampleSize}.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{insight.calculation}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
