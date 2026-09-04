"use client";

import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, IndianRupee, TrendingUp, Package, Zap, Store, ShoppingBag } from "lucide-react";
import { cn } from "@cartwright/ui/lib/utils";
import { trpc } from "@/utils/trpc";
import { BarChartStacked } from "@/components/bar-chart-stacked";
import { FormattedAmount } from "@/components/merchant/formatted-amount";
import { Card } from "@cartwright/ui/components/card";
import { SelectMenu } from "@cartwright/ui/components/select-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cartwright/ui/components/table";
import { ConversionFunnel, InsightCard, SearchQueriesPanel, AgentRadarChart } from "@/components/dashboard/dashboard-widgets";
import { StatusBadge } from "./status-badge";
import { KPICard } from "./kpi-card";
import { fetchTrackerStats, DEFAULT_STATS, type LiveStats, type TimeSeriesItem, type OrderItem, type FunnelItem, type SearchQueryItem, type AgentComparisonDim } from "@/utils/tracker-api";
import { computeOrderTrend, computeAOVTrend, computeAgentShareTrend, computeAgentRevenue, computePriorAOV } from "@/utils/metrics";

export function MerchantTab() {
  const [stats, setStats] = useState<LiveStats>(DEFAULT_STATS);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [funnel, setFunnel] = useState<FunnelItem[]>([]);
  const [searchQueries, setSearchQueries] = useState<SearchQueryItem[]>([]);
  const [agentComparison, setAgentComparison] = useState<AgentComparisonDim[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState(false);

  const accountQuery = useQuery({ ...trpc.merchantIntelligence.getAccount.queryOptions() });
  const activeMerchantId = accountQuery.data?.merchantId || "";
  const userSiteIds = accountQuery.data?.siteIds && accountQuery.data.siteIds.length > 0
    ? accountQuery.data.siteIds
    : (accountQuery.data?.primarySiteId ? [accountQuery.data.primarySiteId] : []);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  useEffect(() => { if (accountQuery.data?.primarySiteId && !selectedSiteId) setSelectedSiteId(accountQuery.data.primarySiteId); }, [accountQuery.data, selectedSiteId]);
  const activeSiteId = selectedSiteId || accountQuery.data?.primarySiteId || userSiteIds[0] || "";

  const overviewQuery = useQuery({ ...trpc.merchantIntelligence.overview.queryOptions() });
  const topProducts = overviewQuery.data?.topProducts || [];
  const insights = overviewQuery.data?.insights || [];

  const orderTrend = useMemo(() => computeOrderTrend(timeSeries), [timeSeries]);
  const aovTrend = useMemo(() => computeAOVTrend(orders), [orders]);
  const agentShareTrend = useMemo(() => computeAgentShareTrend(orders), [orders]);
  const agentRevenue = useMemo(() => computeAgentRevenue(stats), [stats]);
  const priorAOV = useMemo(() => computePriorAOV(stats.avgOrderValue, aovTrend.value), [stats.avgOrderValue, aovTrend.value]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!activeMerchantId) return;
      setIsLoadingStats(true);
      setStatsError(false);
      const data = await fetchTrackerStats(activeSiteId);
      if (cancelled) return;
      if (data) {
        setStats(data.stats);
        setTimeSeries(data.timeSeries);
        setOrders(data.orders);
        setFunnel(data.funnel);
        setSearchQueries(data.searchQueries);
        setAgentComparison(data.agentComparison || []);
      } else {
        setStatsError(true);
      }
      setIsLoadingStats(false);
    }
    load();
    return () => { cancelled = true; };
  }, [activeMerchantId, selectedSiteId, activeSiteId]);

  const recentOrders = useMemo(() => orders.slice(0, 8), [orders]);

  // Fallback insights derived from live telemetry when the DB-backed
  // merchant-intelligence overview has no data yet.
  const displayInsights = useMemo(() => {
    if (insights.length > 0) return insights;
    const fallback: any[] = [];
    if (funnel.length >= 5) {
      const visits = funnel[0]?.count || 0;
      const purchases = funnel[4]?.count || 0;
      if (visits > 0 && purchases / visits < 0.05) {
        fallback.push({
          id: "telemetry-funnel",
          type: "selection_purchase_dropoff",
          severity: "warning",
          title: "Store visits rarely convert to purchases",
          summary: `${visits.toLocaleString()} visits produced ${purchases.toLocaleString()} purchases (${funnel[4]?.rate || "0%"} conversion) in this window.`,
          confidence: "medium",
        });
      }
    }
    if (stats.agentSharePct > 0 && stats.agentSharePct < 20) {
      fallback.push({
        id: "telemetry-agent",
        type: "underperforming_recommendation",
        severity: "opportunity",
        title: "AI agent drives a small share of orders",
        summary: `Only ${stats.agentSharePct}% of orders (${stats.agentOrders} of ${stats.totalOrders}) came from the AI agent. Promote agent checkout to lift autonomous volume.`,
        confidence: "medium",
      });
    }
    if (searchQueries.length > 0) {
      const top = searchQueries[0];
      fallback.push({
        id: "telemetry-search",
        type: "rank_position_selection_gap",
        severity: "info",
        title: `Top search: "${top.query}" (${top.searches} searches)`,
        summary: top.suggestion || "High intent keyword detected from visitor searches.",
        confidence: "low",
      });
    }
    return fallback;
  }, [insights, funnel, stats, searchQueries]);

  if (accountQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 sm:p-5 space-y-3 border-b sm:border-b-0 sm:border-r border-border/60 last:border-0">
              <div className="h-3 w-24 animate-pulse rounded bg-muted/60" />
              <div className="h-7 w-20 animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted/60" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-[280px] animate-pulse rounded-xl bg-muted/40" />
          <div className="h-[280px] animate-pulse rounded-xl bg-muted/40" />
        </div>
      </div>
    );
  }

  if (accountQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-rose-500">Failed to load merchant account.</p>
        <p className="text-xs text-muted-foreground mt-1">Try refreshing the page.</p>
      </div>
    );
  }

  if (!activeMerchantId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Store className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <h2 className="text-sm font-semibold text-foreground">No merchant storefront yet</h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">Set up your merchant storefront to see analytics, conversion metrics, and AI agent intelligence.</p>
        <a href="/merchant/orders" className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 transition-colors mt-4">
          <Store className="h-3.5 w-3.5" /> Setup Storefront
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-purple-400" />
          <h2 className="text-sm font-semibold text-foreground">Merchant Intelligence</h2>
        </div>
        {userSiteIds.length > 1 && (
          <SelectMenu value={activeSiteId} onChange={(val) => setSelectedSiteId(val)} options={[
            ...userSiteIds.map((sId: string, idx: number) => ({ value: sId, label: sId === accountQuery.data?.primarySiteId ? "Primary Storefront" : `Storefront ${idx + 1}` })),
            { value: "site_all", label: "All Storefronts" },
          ]} />
        )}
      </div>

      {/* KPI Cards */}
      <div className="w-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <KPICard
            label="Total Orders"
            icon={<Package className="h-3.5 w-3.5 text-muted-foreground" />}
            value={stats.totalOrders.toLocaleString()}
            trend={orderTrend}
            subtext={`${stats.agentOrders} Agent · ${stats.humanOrders} Human`}
            className="border-b sm:border-b-0 sm:border-r border-border/60"
          />
          <KPICard
            label="Gross Revenue"
            icon={<IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />}
            value={<FormattedAmount amount={stats.grossRevenue} />}
            trend={orderTrend}
            subtext={`₹${agentRevenue.toLocaleString("en-IN")} via AI`}
            className="border-b sm:border-b-0 sm:border-r border-border/60"
          />
          <KPICard
            label="Avg Order Value"
            icon={<TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />}
            value={<FormattedAmount amount={stats.avgOrderValue} />}
            trend={aovTrend}
            subtext={`vs ₹${priorAOV.toLocaleString("en-IN")} prior`}
            className="border-b sm:border-b-0 sm:border-r-0 lg:border-r border-border/60"
          />
          <KPICard
            label="AI Agent Share"
            icon={<Bot className="h-3.5 w-3.5 text-muted-foreground" />}
            value={`${stats.agentSharePct}%`}
            trend={agentShareTrend}
            subtext={`${stats.agentOrders} autonomous orders`}
            className="border-b sm:border-b-0 sm:border-r border-border/60"
          />
          <KPICard
            label="Conversion Rate"
            icon={<Zap className="h-3.5 w-3.5 text-muted-foreground" />}
            value={`${stats.conversionRate}%`}
            subtext={`${stats.totalOrders} purchases / views`}
          />
        </div>
      </div>

      {/* Stats fetch error */}
      {statsError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-500">
          Failed to load tracker stats. Showing cached or default data.
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConversionFunnel data={funnel.length > 0 ? funnel : [
          { stage: "Store Visits", count: 0, rate: "100%", drop: "—" },
          { stage: "Product Views", count: 0, rate: "0%", drop: "—" },
          { stage: "Cart Additions", count: 0, rate: "0%", drop: "—" },
          { stage: "Checkout Started", count: 0, rate: "0%", drop: "—" },
          { stage: "Purchases", count: 0, rate: "0%", drop: "—" },
        ]} />
        <BarChartStacked data={timeSeries} totalOrders={stats.totalOrders} agentOrders={stats.agentOrders} humanOrders={stats.humanOrders} />
      </div>

      {/* Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SearchQueriesPanel data={searchQueries} />
        <AgentRadarChart agentSharePct={stats.agentSharePct} data={agentComparison} />
      </div>

      {/* Products + Insights (with telemetry fallback when DB insights are empty) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between pb-3">
            <h2 className="text-sm font-semibold text-foreground">Top Products</h2>
            <span className="text-[11px] text-muted-foreground">{topProducts.length} products</span>
          </div>
          {topProducts.length === 0 ? <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">No product data yet</div> : (
            <div className="space-y-2">
              {topProducts.slice(0, 5).map((p: any, i: number) => (
                <div key={p.productId || i} className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground font-medium truncate max-w-[65%]">{p.title}</span>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono shrink-0">
                      <span>{p.timesSelected || 0} sel</span>
                      <span>{p.conversionRate != null ? `${(p.conversionRate * 100).toFixed(1)}%` : "—"} conv</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
                    <span>{p.merchant || "—"}</span>
                    <span>{p.selectionRate != null ? `${(p.selectionRate * 100).toFixed(1)}%` : "—"} selection</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between pb-3">
            <h2 className="text-sm font-semibold text-foreground">Merchant Insights</h2>
            <span className="text-[11px] text-muted-foreground">{displayInsights.length} insights</span>
          </div>
          {displayInsights.length === 0 ? <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">No insights available</div> : (
            <div className="space-y-2">{displayInsights.slice(0, 4).map((ins: any) => <InsightCard key={ins.id} insight={ins} />)}</div>
          )}
        </div>
      </div>

      {/* Recent Orders */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground">
            <ShoppingBag className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Recent Store Orders</h2>
        </div>
        <a href="/merchant/orders" className="text-[11px] text-purple-400 hover:text-purple-300 font-medium transition-colors">View all →</a>
      </div>
      {recentOrders.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-border bg-muted/40 text-center">
          <ShoppingBag className="mb-2 h-6 w-6 text-muted-foreground/40" />
          <p className="text-xs font-medium text-foreground">No orders yet</p>
        </div>
      ) : (
        <Card className="rounded-xl border border-border p-0 overflow-hidden shadow-none ring-0">
          <Table className="text-left text-xs">
            <TableHeader>
              <TableRow className="border-border text-[11px] font-semibold tracking-wider text-muted-foreground hover:bg-transparent">
                <TableHead className="px-4 py-3.5 font-mono">#</TableHead>
                <TableHead className="px-4 py-3.5">Order ID</TableHead>
                <TableHead className="px-4 py-3.5">Customer</TableHead>
                <TableHead className="px-4 py-3.5">Items</TableHead>
                <TableHead className="px-4 py-3.5">Payment</TableHead>
                <TableHead className="px-4 py-3.5 text-right">Amount</TableHead>
                <TableHead className="px-4 py-3.5 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {recentOrders.map((o, idx) => (
                <TableRow key={`${o.id}-${idx}`} className="hover:bg-muted/30">
                  <TableCell className="px-4 py-4 font-mono text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="px-4 py-4 whitespace-nowrap font-mono font-medium text-foreground">{o.id.slice(0, 14)}</TableCell>
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">{o.customer}</span>
                      {o.actor === "agent" && <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.2 text-[10px] font-semibold text-purple-400">AI Bot</span>}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[220px] px-4 py-4"><span className="line-clamp-1 font-medium text-foreground">{o.items}</span></TableCell>
                  <TableCell className="px-4 py-4 text-muted-foreground">{o.method}</TableCell>
                  <TableCell className="px-4 py-4 text-right font-mono font-semibold text-emerald-500"><FormattedAmount amount={o.amount} /></TableCell>
                  <TableCell className="px-4 py-4 text-right"><StatusBadge status={o.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
