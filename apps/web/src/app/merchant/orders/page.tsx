"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Search,
  Bot,
  Sparkles,
  ShoppingBag,
  ShoppingCart,
  Globe,
  Store,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  TrendingUp,
  Truck,
  Package,
} from "lucide-react";
import { cn } from "@cartwright/ui/lib/utils";
import { useMerchantContext } from "@/components/merchant/use-merchant-context";
import { FormattedAmount } from "@/components/merchant/formatted-amount";
import { SelectMenu } from "@cartwright/ui/components/select-menu";
import { BarChartStacked } from "@/components/bar-chart-stacked";
import { Button } from "@cartwright/ui/components/button";
import { Card } from "@cartwright/ui/components/card";
import { Badge } from "@cartwright/ui/components/badge";
import { Input } from "@cartwright/ui/components/input";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@cartwright/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cartwright/ui/components/table";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@cartwright/ui/components/tooltip";
import {
  fetchTrackerStats,
  DEFAULT_STATS,
  type LiveStats,
  type OrderItem,
  type TimeSeriesItem,
} from "@/utils/tracker-api";
function getStatusDetails(status: string) {
  const norm = (status || "").toUpperCase();
  switch (norm) {
    case "CONFIRMED":
    case "PAID":
    case "PAYMENT_SUCCEEDED":
    case "APPROVED":
    case "DELIVERED":
      return {
        statusLabel: "Paid",
        statusTone: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
        fulfillmentLabel: "Delivered",
        fulfillmentTone: "bg-blue-500/10 border-blue-500/30 text-blue-500",
        progressPercent: 100,
      };
    case "IN_TRANSIT":
    case "PROCESSING":
    case "PAYMENT_PROCESSING":
      return {
        statusLabel: "Processing",
        statusTone: "bg-amber-500/10 border-amber-500/30 text-amber-500",
        fulfillmentLabel: "In Transit",
        fulfillmentTone: "bg-amber-500/10 border-amber-500/30 text-amber-500",
        progressPercent: 80,
      };
    case "PENDING":
    case "CREATED":
      return {
        statusLabel: "Pending",
        statusTone: "bg-amber-500/10 border-amber-500/30 text-amber-500",
        fulfillmentLabel: "Pending",
        fulfillmentTone: "bg-muted border-border text-muted-foreground",
        progressPercent: 40,
      };
    case "FAILED":
    case "CANCELLED":
    default:
      return {
        statusLabel: "Failed",
        statusTone: "bg-rose-500/10 border-rose-500/30 text-rose-500",
        fulfillmentLabel: "Cancelled",
        fulfillmentTone: "bg-rose-500/10 border-rose-500/30 text-rose-500",
        progressPercent: 0,
      };
  }
}

function SegmentedProgressBar({ percent }: { percent: number }) {
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
              i < filledBars ? "bg-emerald-500" : "bg-muted"
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

interface DimensionComparison {
  key: string;
  label: string;
  desc: string;
  aiScore: number;
  humanScore: number;
}

function getComparisonDimensions(agentSharePct: number, apiDims?: DimensionComparison[]): DimensionComparison[] {
  if (apiDims && apiDims.length > 0) return apiDims;
  if (agentSharePct > 0) {
    return [
      { key: "volume", label: "Volume", desc: "Share of orders", aiScore: agentSharePct, humanScore: 100 - agentSharePct },
      { key: "conversion", label: "Conversion", desc: "Share of orders", aiScore: agentSharePct, humanScore: 100 - agentSharePct },
    ];
  }
  // No telemetry yet — the API reported no agent comparison data.
  return [];
}

function AgentRadarChart({
  agentOrders = 0,
  agentSharePct = 0,
  dimensions,
}: {
  agentOrders?: number;
  humanOrders?: number;
  agentSharePct?: number;
  dimensions?: DimensionComparison[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const comparisonDimensions = getComparisonDimensions(agentSharePct, dimensions);

  if (comparisonDimensions.length === 0) {
    return (
      <Card className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Agent Intelligence</h2>
        <p className="mt-4 text-xs text-muted-foreground">No agent comparison data reported by the API.</p>
      </Card>
    );
  }

  const cx = 190;
  const cy = 125;
  const radius = 75;
  const numSides = comparisonDimensions.length;

  const getCoordinates = (index: number, valueScore: number) => {
    const angle = (index * 2 * Math.PI) / numSides - Math.PI / 2;
    const r = (radius * valueScore) / 100;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const getLabelCoordinates = (index: number) => {
    const angle = (index * 2 * Math.PI) / numSides - Math.PI / 2;
    const labelRadius = radius + 24;
    return {
      x: cx + labelRadius * Math.cos(angle),
      y: cy + labelRadius * Math.sin(angle),
    };
  };

  const aiPolygonPoints = comparisonDimensions.map((dim, i) => {
    const { x, y } = getCoordinates(i, dim.aiScore);
    return `${x},${y}`;
  }).join(" ");

  const humanPolygonPoints = comparisonDimensions.map((dim, i) => {
    const { x, y } = getCoordinates(i, dim.humanScore);
    return `${x},${y}`;
  }).join(" ");

  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const hoveredDim = hoveredIdx !== null ? comparisonDimensions[hoveredIdx] : null;

  return (
    <Card className="rounded-xl border border-border bg-card text-card-foreground p-5 flex flex-col justify-between relative overflow-hidden">
      <div>
        {/* Header with Dual-Series Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Autonomous Agent Intelligence</h2>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-muted-foreground">Human</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              <span className="text-muted-foreground">AI Agent</span>
            </div>
          </div>
        </div>

        {/* Unified Dual-Series Hexagonal Radar SVG */}
        <div className="relative flex items-center justify-center pt-2 pb-1">
          <svg viewBox="0 0 380 250" className="w-full max-w-[380px] h-[230px] overflow-visible select-none">
            {gridLevels.map((lvl, idx) => {
              const gridPoints = comparisonDimensions.map((_, i) => {
                const { x, y } = getCoordinates(i, lvl * 100);
                return `${x},${y}`;
              }).join(" ");
              return (
                <polygon
                  key={idx}
                  points={gridPoints}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={idx === gridLevels.length - 1 ? "1.2" : "0.8"}
                  strokeDasharray={idx === gridLevels.length - 1 ? "none" : "3,3"}
                  className="text-border"
                />
              );
            })}

            {comparisonDimensions.map((_, i) => {
              const { x, y } = getCoordinates(i, 100);
              return (
                <line
                  key={i}
                  x1={cx}
                  y1={cy}
                  x2={x}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-border"
                />
              );
            })}

            {/* Human Polygon */}
            <polygon
              points={humanPolygonPoints}
              fill="rgba(59, 130, 246, 0.14)"
              stroke="#3b82f6"
              strokeWidth="1.75"
              strokeDasharray="4,2"
              className="transition-all duration-300"
            />

            {/* AI Agent Polygon */}
            <polygon
              points={aiPolygonPoints}
              fill="rgba(168, 85, 247, 0.20)"
              stroke="#a855f7"
              strokeWidth="2"
              className="transition-all duration-300"
            />

            {/* Vertices & Dots */}
            {comparisonDimensions.map((dim, i) => {
              const aiCoords = getCoordinates(i, dim.aiScore);
              const humanCoords = getCoordinates(i, dim.humanScore);
              const labelPos = getLabelCoordinates(i);
              const isHovered = hoveredIdx === i;

              let textAnchor: "middle" | "start" | "end" = "middle";
              if (i === 1 || i === 2) textAnchor = "start";
              if (i === 4 || i === 5) textAnchor = "end";

              return (
                <g key={i}>
                  <text
                    x={labelPos.x}
                    y={labelPos.y + (i === 0 ? -4 : i === 3 ? 12 : 4)}
                    textAnchor={textAnchor}
                    className={cn(
                      "text-[11px] font-medium transition-colors cursor-pointer select-none",
                      isHovered ? "fill-purple-400 font-semibold" : "fill-muted-foreground"
                    )}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    {dim.label}
                  </text>

                  <circle
                    cx={humanCoords.x}
                    cy={humanCoords.y}
                    r={isHovered ? 4.5 : 3}
                    fill={isHovered ? "#93c5fd" : "#3b82f6"}
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-background pointer-events-none transition-all duration-150"
                  />

                  <circle
                    cx={aiCoords.x}
                    cy={aiCoords.y}
                    r={isHovered ? 6 : 4}
                    fill={isHovered ? "#c084fc" : "#a855f7"}
                    stroke="currentColor"
                    strokeWidth={isHovered ? "2" : "1"}
                    className="transition-all duration-200 text-background pointer-events-none"
                  />

                  <circle
                    cx={aiCoords.x}
                    cy={aiCoords.y}
                    r={18}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />
                </g>
              );
            })}
          </svg>

          {/* Minimal Tooltip */}
          {hoveredDim && hoveredIdx !== null && (
            <div
              className={cn(
                "absolute pointer-events-none z-30 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md transition-all duration-150 animate-in fade-in zoom-in-95 min-w-[150px]",
                hoveredIdx === 0 && "top-2 left-1/2 -translate-x-1/2",
                (hoveredIdx === 1 || hoveredIdx === 2) && "top-1/4 right-3",
                hoveredIdx === 3 && "bottom-2 left-1/2 -translate-x-1/2",
                (hoveredIdx === 4 || hoveredIdx === 5) && "top-1/4 left-3"
              )}
            >
              <div className="space-y-1">
                {/* AI Agent Row */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" />
                    <span className="text-muted-foreground text-[11px]">AI Agent</span>
                  </div>
                  <span className="font-mono font-bold text-foreground text-xs">{hoveredDim.aiScore}%</span>
                </div>
                {/* Human Row */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-muted-foreground text-[11px]">Human</span>
                  </div>
                  <span className="font-mono font-bold text-foreground text-xs">{hoveredDim.humanScore}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function MerchantOrdersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [stats, setStats] = useState<LiveStats>(DEFAULT_STATS);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [agentComparison, setAgentComparison] = useState<DimensionComparison[]>([]);
  const [loading, setLoading] = useState(true);

  // Merchant Account & Data-Site Binding
  const { accountQuery, activeMerchantId, activeSiteId, selectedSiteId, setSelectedSiteId, siteIds: userSiteIds } = useMerchantContext();

  useEffect(() => {
    async function loadPostHogData() {
      if (!activeMerchantId) return;
      setLoading(true);
      try {
        const data = await fetchTrackerStats(activeSiteId);
        if (data.stats) {
          setStats(data.stats);
        }
        if (data.timeSeries) {
          setTimeSeries(data.timeSeries);
        }
        if (data.orders) {
          setOrders(data.orders);
        }
        setAgentComparison(
          (data.agentComparison || []).map((d: any) => ({
            key: d.key,
            label: d.label,
            desc: d.label,
            aiScore: d.ai,
            humanScore: d.hu,
          })),
        );
      } catch (err) {
        console.error("Failed to fetch live PostHog stats:", err);
      } finally {
        setLoading(false);
      }
    }
    loadPostHogData();
  }, [activeMerchantId, selectedSiteId, activeSiteId]);

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const match =
          o.id.toLowerCase().includes(q) ||
          o.customer.toLowerCase().includes(q) ||
          o.items.toLowerCase().includes(q) ||
          o.city.toLowerCase().includes(q) ||
          o.method.toLowerCase().includes(q);
        if (!match) return false;
      }

      if (statusFilter !== "ALL") {
        const details = getStatusDetails(o.status);
        if (details.statusLabel.toUpperCase() !== statusFilter.toUpperCase()) {
          return false;
        }
      }

      return true;
    });
  }, [orders, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedOrders = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, safeCurrentPage, pageSize]);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Orders</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monitor real-time purchases, fulfillment status, and customer orders across all channels.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Storefront Site Selector */}
            {userSiteIds.length > 1 ? (
              <SelectMenu
                value={activeSiteId}
                onChange={(val) => {
                  setSelectedSiteId(val);
                  setCurrentPage(1);
                }}
                options={[
                  ...userSiteIds.map((sId, idx) => ({
                    value: sId,
                    label: sId === accountQuery.data?.primarySiteId
                      ? `Primary Storefront`
                      : `Storefront ${idx + 1}`,
                  })),
                  { value: "site_all", label: "All Storefronts" },
                ]}
              />
            ) : userSiteIds.length === 1 ? (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground">
                <Store className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Primary Storefront</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* KPI Stats in Clean Interior-Border Grid */}
      <div className="w-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {/* 1. Total Orders */}
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Total Orders</span>
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              {stats.totalOrders.toLocaleString()}
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-emerald-500 font-medium whitespace-nowrap">↗ +14.8%</span>
              <span className="text-muted-foreground truncate">{stats.agentOrders} Agent · {stats.humanOrders} Human</span>
            </div>
          </div>

          {/* 2. Gross Revenue */}
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Gross Revenue</span>
              <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              <FormattedAmount amount={stats.grossRevenue} />
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-muted-foreground font-medium whitespace-nowrap">API data</span>
              <span className="text-muted-foreground truncate">{stats.agentOrders} orders via AI</span>
            </div>
          </div>

          {/* 3. Average Order Value */}
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r-0 lg:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Avg Order Value</span>
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              <FormattedAmount amount={stats.avgOrderValue} />
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-emerald-500 font-medium whitespace-nowrap">↗ +5.2%</span>
              <span className="text-muted-foreground truncate">Current selected storefront</span>
            </div>
          </div>

          {/* 4. AI Agent Volume */}
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>AI Agent Volume</span>
              <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              {stats.agentOrders.toLocaleString()} <span className="text-xs font-normal text-muted-foreground font-sans">orders</span>
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-muted-foreground font-medium whitespace-nowrap">API data</span>
              <span className="text-muted-foreground truncate">{stats.agentSharePct}% of volume</span>
            </div>
          </div>

          {/* 5. Fulfillment Rate */}
          <div className="p-4 sm:p-5 flex flex-col justify-between">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Fulfillment Rate</span>
              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              {stats.fulfillmentRate}%
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-emerald-500 font-medium whitespace-nowrap">↗ +1.2%</span>
              <span className="text-muted-foreground truncate">{Math.round(stats.totalOrders * (stats.fulfillmentRate / 100))} delivered</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top 2 Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChartStacked
          data={timeSeries}
          totalOrders={stats.totalOrders}
          agentOrders={stats.agentOrders}
          humanOrders={stats.humanOrders}
        />
        <AgentRadarChart
          agentOrders={stats.agentOrders}
          humanOrders={stats.humanOrders}
          agentSharePct={stats.agentSharePct}
          dimensions={agentComparison}
        />
      </div>

      {/* Past Orders Table & Controls */}
      <div className="space-y-4">
        {/* Card Header with Integrated Search & Filter Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Past Orders
              </h2>
            </div>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
            {/* Search */}
            <div className="relative w-64 max-sm:w-full">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground z-10 pointer-events-none" />
              <Input
                placeholder="Search orders, customers, items..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg bg-background pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Status Filter */}
            <SelectMenu
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setCurrentPage(1);
              }}
              options={[
                { value: "ALL", label: "All Statuses" },
                { value: "PAID", label: "Paid" },
                { value: "PROCESSING", label: "Processing" },
                { value: "PENDING", label: "Pending" },
                { value: "FAILED", label: "Failed" },
              ]}
            />

            {(statusFilter !== "ALL" || searchQuery) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter("ALL");
                  setSearchQuery("");
                  setCurrentPage(1);
                }}
                className="h-9 rounded-lg border-border bg-muted/60 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Orders Table */}
        {filteredOrders.length === 0 ? (
          <Empty className="h-64 rounded-xl border border-border bg-muted/40">
            <EmptyHeader>
              <EmptyMedia variant="default">
                <ShoppingCart className="h-8 w-8 text-muted-foreground/40" />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-medium text-foreground">
                {searchQuery ? `No orders matching "${searchQuery}"` : "No orders found"}
              </EmptyTitle>
              <EmptyDescription className="text-xs text-muted-foreground max-w-sm">
                Live transactions recorded with telemetry and payment signatures will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          /* Table View */
          <TooltipProvider delay={100}>
            <Card className="rounded-xl border border-border p-0 overflow-hidden shadow-none ring-0">
            <Table className="w-full text-xs text-left">
              <TableHeader>
                <TableRow className="border-border text-[11px] font-semibold tracking-wider text-muted-foreground hover:bg-transparent">
                  <TableHead className="w-12 px-4 py-3.5 font-mono text-muted-foreground">#</TableHead>
                  <TableHead className="px-4 py-3.5">Order ID</TableHead>
                  <TableHead className="px-4 py-3.5">Date & Time</TableHead>
                  <TableHead className="px-4 py-3.5">Customer & City</TableHead>
                  <TableHead className="px-4 py-3.5">Items Purchased</TableHead>
                  <TableHead className="px-4 py-3.5">Fulfillment</TableHead>
                  <TableHead className="px-4 py-3.5">Progress</TableHead>
                  <TableHead className="px-4 py-3.5">Payment</TableHead>
                  <TableHead className="px-4 py-3.5">Total Amount</TableHead>
                  <TableHead className="px-4 py-3.5 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {paginatedOrders.map((o, index) => {
                  const rowNumber = (safeCurrentPage - 1) * pageSize + index + 1;
                  const isCopied = copiedId === o.id;
                  const details = getStatusDetails(o.status);

                  return (
                    <TableRow
                      key={`${o.id}-${index}`}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="px-4 py-4 font-mono text-xs text-muted-foreground">
                        {rowNumber}
                      </TableCell>

                      {/* Order ID + Copy */}
                      <TableCell className="px-4 py-4 whitespace-nowrap">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                onClick={(e) => handleCopy(o.id, e)}
                                aria-label="Copy order ID"
                                className="inline-flex items-center gap-1.5 font-mono font-medium text-foreground hover:text-primary transition-colors cursor-pointer group/copy"
                              >
                                <span>{o.id.slice(0, 14)}</span>
                                {isCopied ? (
                                  <Check className="h-3 w-3 text-emerald-500" />
                                ) : (
                                  <Copy className="h-3 w-3 opacity-0 group-hover/copy:opacity-100 transition-opacity text-muted-foreground" />
                                )}
                              </button>
                            }
                          />
                          <TooltipContent side="top" className="text-xs">
                            {isCopied ? "Copied ID!" : "Click to copy Order ID"}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>

                      <TableCell className="px-4 py-4 text-muted-foreground font-mono whitespace-nowrap">
                        {o.date}
                      </TableCell>

                      <TableCell className="px-4 py-4">
                        <div className="font-medium text-foreground flex items-center gap-1.5 whitespace-nowrap">
                          {o.customer}
                          {o.actor === "agent" && (
                            <Badge variant="outline" className="rounded-full border-purple-500/20 bg-purple-500/10 px-1.5 py-0.2 text-[10px] font-semibold text-purple-400">
                              AI Bot
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{o.city}</div>
                      </TableCell>

                      {/* Item with Tooltip */}
                      <TableCell className="px-4 py-4 max-w-[240px]">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <div className="cursor-default">
                                <span className="line-clamp-1 font-medium text-foreground hover:text-purple-400 transition-colors">
                                  {o.items}
                                </span>
                              </div>
                            }
                          />
                          <TooltipContent side="top" className="max-w-xs bg-popover border border-border text-foreground text-xs p-3 rounded-lg shadow-xl">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">Purchased Item</span>
                            <p className="font-semibold text-foreground">{o.items}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>

                      <TableCell className="px-4 py-4 whitespace-nowrap">
                        <Badge variant="outline" className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", details.fulfillmentTone)}>
                          {details.fulfillmentLabel}
                        </Badge>
                      </TableCell>

                      <TableCell className="px-4 py-4 whitespace-nowrap">
                        <SegmentedProgressBar percent={details.progressPercent} />
                      </TableCell>

                      <TableCell className="px-4 py-4 text-muted-foreground whitespace-nowrap">
                        {o.method}
                      </TableCell>

                      <TableCell className="px-4 py-4 font-mono font-semibold text-emerald-500 whitespace-nowrap">
                        <FormattedAmount amount={o.amount} />
                      </TableCell>

                      <TableCell className="px-4 py-4 text-right whitespace-nowrap">
                        <Badge variant="outline" className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium border", details.statusTone)}>
                          {details.statusLabel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </Card>
          </TooltipProvider>
        )}

        {/* Pagination Controls Bar */}
        {filteredOrders.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
            {/* Left: Count & Page Size Selector */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div>
                Showing{" "}
                <span className="font-semibold text-foreground">
                  {(safeCurrentPage - 1) * pageSize + 1}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-foreground">
                  {Math.min(safeCurrentPage * pageSize, filteredOrders.length)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-foreground">
                  {filteredOrders.length}
                </span>{" "}
                orders
              </div>

              <div className="h-3.5 w-px bg-border hidden sm:block" />

              <div className="flex items-center gap-1.5">
                <span>Rows per page:</span>
                <SelectMenu
                  value={pageSize}
                  onChange={(val) => {
                    setPageSize(Number(val));
                    setCurrentPage(1);
                  }}
                  size="sm"
                  options={[
                    { value: 5, label: "5" },
                    { value: 10, label: "10" },
                    { value: 20, label: "20" },
                    { value: 50, label: "50" },
                  ]}
                />
              </div>
            </div>

            {/* Right: Navigation Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className="h-8 px-2.5 rounded-lg border border-border bg-background text-xs text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                <span>Previous</span>
              </Button>

              <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                {Array.from({ length: totalPages }).map((_, i) => {
                  const pageNum = i + 1;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={cn(
                        "h-7 min-w-7 rounded-md px-2 text-xs font-semibold transition-colors cursor-pointer",
                        safeCurrentPage === pageNum
                          ? "bg-muted text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="h-8 px-2.5 rounded-lg border border-border bg-background text-xs text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
