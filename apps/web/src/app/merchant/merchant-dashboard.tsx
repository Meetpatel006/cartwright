"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Code2,
  Loader2,
  Plus,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@cartwright/ui/lib/utils";
import { trpc } from "@/utils/trpc";
import { FormattedAmount } from "@/components/merchant/formatted-amount";
import { Card, CardHeader, CardTitle } from "@cartwright/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cartwright/ui/components/table";
import {
  fetchTrackerStats,
  DEFAULT_STATS,
  type LiveStats,
  type OrderItem,
  type FunnelItem,
  type TimeSeriesItem,
  type SearchQueryItem,
  type StatsPreset,
} from "@/utils/tracker-api";
import {
  computeOrderTrend,
  computeAOVTrend,
  computeAgentShareTrend,
  type TrendResult,
} from "@/utils/metrics";

type Preset = StatsPreset;

const PRESET_LABEL: Record<Preset, string> = {
  "24h": "24H",
  "7d": "7D",
  "15d": "15D",
  "30d": "30D",
};

function formatPct(rate: number | null): string {
  return rate === null ? "—" : `${rate.toFixed(1)}%`;
}

function TrendBadge({ trend }: { trend: TrendResult }) {
  if (trend.direction === "flat") return null;
  return (
    <span
      className={cn(
        "text-[10px] font-mono",
        trend.direction === "up" ? "text-emerald-500" : "text-red-500"
      )}
    >
      {trend.label}
    </span>
  );
}

export default function MerchantDashboard() {
  const [preset, setPreset] = useState<Preset>("15d");
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState<"universal" | "nextjs">("universal");
  const queryClient = useQueryClient();

  const accountQuery = useQuery({
    ...trpc.merchantIntelligence.getAccount.queryOptions(),
  });

  const [selectedSiteId, setSelectedSiteId] = useState<string>("");

  const activeMerchantId = accountQuery.data?.merchantId || "";
  const availableSiteIds =
    accountQuery.data?.siteIds && accountQuery.data.siteIds.length > 0
      ? accountQuery.data.siteIds
      : accountQuery.data?.primarySiteId
        ? [accountQuery.data.primarySiteId]
        : [];

  const activeSiteId =
    selectedSiteId ||
    accountQuery.data?.primarySiteId ||
    availableSiteIds[0] ||
    "";

  useEffect(() => {
    if (accountQuery.data?.primarySiteId && !selectedSiteId) {
      setSelectedSiteId(accountQuery.data.primarySiteId);
    }
  }, [accountQuery.data, selectedSiteId]);

  const createSiteMutation = useMutation({
    ...trpc.merchantIntelligence.createSite.mutationOptions(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: trpc.merchantIntelligence.getAccount.queryKey(),
      });
      if (data.siteIds && data.siteIds.length > 0) {
        const newest = data.siteIds[data.siteIds.length - 1]!;
        setSelectedSiteId(newest);
        toast.success(`New Storefront Site generated: ${newest}`);
      }
    },
    onError: (err) => {
      toast.error(`Failed to generate new site: ${err.message}`);
    },
  });

  // --- Stats fetch state ---
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [stats, setStats] = useState<LiveStats>(DEFAULT_STATS);
  const [funnelData, setFunnelData] = useState<FunnelItem[]>([]);
  const [zeroResultQueries, setZeroResultQueries] = useState<SearchQueryItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesItem[]>([]);

  useEffect(() => {
    if (!activeMerchantId) return;
    let cancelled = false;

    setStatsLoading(true);
    setStatsError(null);

    fetchTrackerStats(activeSiteId, preset)
      .then((data) => {
        if (cancelled) return;
        setStats(data.stats);
        setFunnelData(data.funnel ?? []);
        setZeroResultQueries(data.searchQueries ?? []);
        setOrders(data.orders ?? []);
        setTimeSeries(data.timeSeries ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatsError(err instanceof Error ? err.message : "Failed to load stats");
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeMerchantId, activeSiteId, preset]);

  const trends = useMemo(
    () => ({
      orders: computeOrderTrend(timeSeries),
      aov: computeAOVTrend(orders),
      agentShare: computeAgentShareTrend(orders),
    }),
    [timeSeries, orders]
  );

  const productMatrix = useMemo(() => {
    const products = new Map<string, { title: string; orders: number; revenue: number }>();
    for (const order of orders) {
      const title = order.items || "Unknown product";
      const current = products.get(title) ?? { title, orders: 0, revenue: 0 };
      current.orders += 1;
      current.revenue += order.amount || 0;
      products.set(title, current);
    }
    return Array.from(products.values()).sort((a, b) => b.orders - a.orders);
  }, [orders]);

  const agentActivity = useMemo(
    () => timeSeries.filter((item) => item.series === "AI Agent"),
    [timeSeries]
  );

  const snippet =
    platform === "universal"
      ? `<!-- Cartwright Universal Storefront Tracker -->
<script
  src="https://your-domain.com/tracker/v1.js"
  data-merchant="${activeMerchantId}"
  data-site="${activeSiteId}"
  async>
</script>`
      : `// Next.js layout.tsx
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://your-domain.com/tracker/v1.js"
          data-merchant="${activeMerchantId}"
          data-site="${activeSiteId}"
          strategy="afterInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success("Snippet copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Loading state ---
  if (accountQuery.isLoading) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-xs">Loading merchant account…</span>
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (accountQuery.isError) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="size-4 text-red-500 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-red-500">Failed to load merchant account</p>
            <p className="text-[11px] text-muted-foreground mt-1">{accountQuery.error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6 text-foreground">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Storefront telemetry, conversion funnel, and shopping metrics.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg border border-border">
          {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                p === preset
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {PRESET_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards — loading skeleton */}
      {statsLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse">
              <div className="h-3 bg-muted rounded w-16" />
              <div className="h-7 bg-muted rounded w-24 mt-3" />
              <div className="h-2 bg-muted rounded w-20 mt-2" />
            </div>
          ))}
        </div>
      ) : statsError ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="size-4 text-red-500 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-red-500">Failed to load tracker stats</p>
            <p className="text-[11px] text-muted-foreground mt-1">{statsError}</p>
          </div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Gross Revenue</div>
              <div className="text-2xl font-bold font-mono text-foreground mt-2">
                <FormattedAmount amount={stats.grossRevenue} />
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[11px] text-muted-foreground">From tracker telemetry</span>
                <TrendBadge trend={trends.orders} />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Conversion Rate</div>
              <div className="text-2xl font-bold font-mono text-foreground mt-2">
                {formatPct(stats.conversionRate)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Current selected storefront</div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Average Order Value</div>
              <div className="text-2xl font-bold font-mono text-foreground mt-2">
                <FormattedAmount amount={stats.avgOrderValue} />
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[11px] text-muted-foreground">{stats.totalOrders} total orders</span>
                <TrendBadge trend={trends.aov} />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">AI Agent Share</div>
              <div className="text-2xl font-bold font-mono text-purple-500 mt-2">
                {formatPct(stats.agentSharePct)}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[11px] text-muted-foreground">From tracker telemetry</span>
                <TrendBadge trend={trends.agentShare} />
              </div>
            </div>
          </div>

          {/* Tracker Script Card */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <div className="flex items-center gap-2">
                <Code2 className="size-4 text-muted-foreground" />
                <h2 className="text-xs font-semibold text-foreground">Storefront Tracker Snippet</h2>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted cursor-pointer"
              >
                {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3 text-muted-foreground" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-muted-foreground mb-1 block font-medium">Merchant ID (Permanent)</label>
                <div className="flex items-center gap-1.5 rounded-md border border-input bg-muted/30 px-2.5 py-1.5 font-mono text-xs text-foreground">
                  <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{activeMerchantId}</span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-muted-foreground block font-medium">Active Storefront Site ID</label>
                  <button
                    type="button"
                    onClick={() => createSiteMutation.mutate()}
                    disabled={createSiteMutation.isPending}
                    className="text-[11px] text-purple-400 hover:text-purple-300 font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="size-3" />
                    {createSiteMutation.isPending ? "Generating..." : "Generate New Site"}
                  </button>
                </div>
                <select
                  value={activeSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-xs text-foreground focus:border-ring focus:outline-none cursor-pointer"
                >
                  {availableSiteIds.map((sId) => (
                    <option key={sId} value={sId}>
                      {sId} {sId === accountQuery.data?.primarySiteId ? "(Primary)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="relative rounded-md border border-border bg-muted/40 p-2.5 font-mono text-[11px] text-foreground">
              <pre className="overflow-x-auto whitespace-pre-wrap">{snippet}</pre>
            </div>
          </div>

          {/* 5-Stage Conversion Funnel */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <h2 className="text-xs font-semibold text-foreground">Conversion Funnel</h2>
              <span className="text-xs font-mono text-muted-foreground">Total Conv: <strong className="text-foreground">{formatPct(stats.conversionRate)}</strong></span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              {funnelData.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground sm:col-span-5">
                  No conversion funnel data reported by the API.
                </p>
              ) : funnelData.map((f, i) => (
                <div key={f.stage} className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col justify-between">
                  <div>
                    <div className="text-[11px] text-muted-foreground">{f.stage}</div>
                    <div className="text-lg font-bold font-mono text-foreground mt-1">{f.count.toLocaleString()}</div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/80 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{f.rate}</span>
                    {i > 0 && <span className="text-red-500 font-mono">{f.drop}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2 Column: Agent Intel + Search Demand */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                <h2 className="text-xs font-semibold text-foreground">AI Agent Prompt Samples</h2>
                <span className="text-[11px] text-purple-400 font-mono">{agentActivity.reduce((total, item) => total + item.orders, 0)} orders</span>
              </div>

              <div className="space-y-2">
                {agentActivity.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                    No AI-agent activity reported for this storefront.
                  </p>
                ) : agentActivity.map((activity) => (
                  <div key={activity.day} className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-purple-400 font-medium">{activity.day}</span>
                      <span className="text-muted-foreground font-mono">{activity.orders} orders</span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">AI-agent orders recorded by tracker telemetry.</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                <h2 className="text-xs font-semibold text-foreground">0-Result Search Demand</h2>
                <span className="text-[11px] text-muted-foreground">Missed demand</span>
              </div>

              <div className="space-y-2">
                {zeroResultQueries.map((gap, i) => (
                  <div key={i} className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-foreground font-medium">"{gap.query}"</span>
                      <span className="font-mono text-muted-foreground text-[11px]">{gap.searches} queries</span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">{gap.suggestion}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Product Merchandising Table */}
          <Card className="rounded-xl border border-border p-0">
            <CardHeader className="border-b border-border p-4">
              <CardTitle className="text-xs font-semibold text-foreground">Catalog Conversion Rates</CardTitle>
            </CardHeader>

            <Table className="text-left text-xs">
              <TableHeader className="border-border bg-muted/50 text-[11px] font-medium text-muted-foreground">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 py-2.5">Product</TableHead>
                  <TableHead className="px-3 py-2.5">Orders</TableHead>
                  <TableHead className="px-3 py-2.5">Revenue</TableHead>
                  <TableHead className="px-4 py-2.5 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {productMatrix.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No product conversion data reported by the API.
                    </TableCell>
                  </TableRow>
                ) : productMatrix.map((p) => (
                  <TableRow key={p.title} className="hover:bg-muted/50">
                    <TableCell className="px-4 py-3 font-medium text-foreground">{p.title}</TableCell>
                    <TableCell className="px-3 py-3 font-mono text-foreground">{p.orders}</TableCell>
                    <TableCell className="px-3 py-3 font-mono text-muted-foreground"><FormattedAmount amount={p.revenue} /></TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <span className="text-[11px] text-muted-foreground font-medium">{p.orders > 0 ? "Tracked" : "No activity"}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
