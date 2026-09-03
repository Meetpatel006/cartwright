"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import {
  Search,
  DollarSign,
  TrendingUp,
  CreditCard,
  Percent,
  Layers,
  Store,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Package,
  IndianRupee,
  Bot,
  ShieldCheck,
  Wallet,
  Receipt,
} from "lucide-react";
import { cn } from "@cartwright/ui/lib/utils";
import { useMerchantContext } from "@/components/merchant/use-merchant-context";
import { FormattedAmount } from "@/components/merchant/formatted-amount";
import { SelectMenu } from "@cartwright/ui/components/select-menu";
import { BarChartStacked } from "@/components/bar-chart-stacked";
import { fetchTrackerStats } from "@/utils/tracker-api";
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
// Payment Channel Radar / Distribution
interface ChannelDimension {
  key: string;
  label: string;
  aiShare: number;
  humanShare: number;
}

function PaymentChannelRadar({
  dimensions = [],
}: {
  dimensions?: ChannelDimension[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const cx = 190;
  const cy = 125;
  const radius = 75;
  const numSides = dimensions.length;

  if (dimensions.length === 0) {
    return (
      <Card className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Payment &amp; Channel Efficiency</h2>
        <p className="mt-4 text-xs text-muted-foreground">No channel efficiency data reported by the API.</p>
      </Card>
    );
  }

  const getCoordinates = (index: number, score: number) => {
    const angle = (index * 2 * Math.PI) / numSides - Math.PI / 2;
    const r = (radius * score) / 100;
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

  const aiPolygonPoints = dimensions.map((dim, i) => {
    const { x, y } = getCoordinates(i, dim.aiShare);
    return `${x},${y}`;
  }).join(" ");

  const humanPolygonPoints = dimensions.map((dim, i) => {
    const { x, y } = getCoordinates(i, dim.humanShare);
    return `${x},${y}`;
  }).join(" ");

  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const hoveredDim = hoveredIdx !== null ? dimensions[hoveredIdx] : null;

  return (
    <Card className="rounded-xl border border-border bg-card text-card-foreground p-5 flex flex-col justify-between relative overflow-hidden">
      <div>
        {/* Header with Dual-Series Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Payment & Channel Efficiency</h2>
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

        {/* Hexagonal Radar SVG */}
        <div className="relative flex items-center justify-center pt-2 pb-1">
          <svg viewBox="0 0 380 250" className="w-full max-w-[380px] h-[230px] overflow-visible select-none">
            {gridLevels.map((lvl, idx) => {
              const gridPoints = dimensions.map((_, i) => {
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

            {dimensions.map((_, i) => {
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

            {/* Vertices & Labels */}
            {dimensions.map((dim, i) => {
              const aiCoords = getCoordinates(i, dim.aiShare);
              const humanCoords = getCoordinates(i, dim.humanShare);
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
                "absolute pointer-events-none z-30 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-none transition-all duration-150 animate-in fade-in zoom-in-95 min-w-[150px]",
                hoveredIdx === 0 && "top-2 left-1/2 -translate-x-1/2",
                (hoveredIdx === 1 || hoveredIdx === 2) && "top-1/4 right-3",
                hoveredIdx === 3 && "bottom-2 left-1/2 -translate-x-1/2",
                (hoveredIdx === 4 || hoveredIdx === 5) && "top-1/4 left-3"
              )}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" />
                    <span className="text-muted-foreground text-[11px]">AI Agent</span>
                  </div>
                  <span className="font-mono font-bold text-foreground text-xs">{hoveredDim.aiShare}%</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-muted-foreground text-[11px]">Human</span>
                  </div>
                  <span className="font-mono font-bold text-foreground text-xs">{hoveredDim.humanShare}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

interface LiveStats {
  totalOrders: number;
  grossRevenue: number;
  avgOrderValue: number;
  fulfillmentRate: number;
  conversionRate: number;
  agentOrders: number;
  agentSharePct: number;
  humanOrders: number;
}

interface ProductSalesItem {
  title: string;
  category: string;
  units: number;
  agentUnits: number;
  humanUnits: number;
  revenue: number;
  share: number;
  asp: number;
  trend: string;
}

interface TelemetryOrder {
  items?: string;
  category?: string;
  amount?: number;
  actor?: "agent" | "shopper";
}

const DEFAULT_STATS: LiveStats = {
  totalOrders: 0,
  grossRevenue: 0,
  avgOrderValue: 0,
  fulfillmentRate: 0,
  conversionRate: 0,
  agentOrders: 0,
  agentSharePct: 0,
  humanOrders: 0,
};

export default function MerchantSalesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const [stats, setStats] = useState<LiveStats>(DEFAULT_STATS);
  const [timeSeries, setTimeSeries] = useState<Array<{ day: string; series: "Human" | "AI Agent"; orders: number }>>([]);
  const [orders, setOrders] = useState<TelemetryOrder[]>([]);
  const [channelDimensions, setChannelDimensions] = useState<ChannelDimension[]>([]);
  const [loading, setLoading] = useState(true);

  // Merchant Account & Multi-Site Binding
  const { accountQuery, activeMerchantId, activeSiteId, selectedSiteId, setSelectedSiteId, siteIds: userSiteIds } = useMerchantContext();

  useEffect(() => {
    async function loadPostHogSales() {
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
        setOrders(data.orders ?? []);
        setChannelDimensions(
          (data.channelEfficiency || []).map((d: any) => ({
            key: String(d.key || d.label),
            label: String(d.label),
            aiShare: Number(d.ai) || 0,
            humanShare: Number(d.hu) || 0,
          })),
        );
      } catch (err) {
        console.error("Failed to load sales data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadPostHogSales();
  }, [activeMerchantId, activeSiteId]);

  // Derive product sales only from orders returned by the telemetry API.
  const catalogProducts: ProductSalesItem[] = useMemo(() => {
    const products = new Map<string, ProductSalesItem>();
    for (const order of orders) {
      const title = order.items || "Unknown product";
      const current = products.get(title) ?? {
        title,
        category: order.category || "Uncategorized",
        units: 0,
        agentUnits: 0,
        humanUnits: 0,
        revenue: 0,
        share: 0,
        asp: 0,
        trend: "—",
      };
      current.units += 1;
      current.revenue += Number(order.amount) || 0;
      if (order.actor === "agent") current.agentUnits += 1;
      else current.humanUnits += 1;
      current.asp = Math.round(current.revenue / current.units);
      products.set(title, current);
    }

    const totalRevenue = Array.from(products.values()).reduce((sum, product) => sum + product.revenue, 0);
    return Array.from(products.values())
      .map((product) => ({ ...product, share: totalRevenue > 0 ? Number(((product.revenue / totalRevenue) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  // Filtering
  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of catalogProducts) {
      const key = p.category.toUpperCase();
      if (!seen.has(key)) seen.set(key, p.category);
    }
    return [
      { value: "ALL", label: "All Categories" },
      ...Array.from(seen.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [catalogProducts]);

  const filteredProducts = useMemo(() => {
    return catalogProducts.filter((p) => {
      const matchSearch =
        searchQuery === "" ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase());

      const matchCategory =
        categoryFilter === "ALL" || p.category.toUpperCase() === categoryFilter.toUpperCase();

      return matchSearch && matchCategory;
    });
  }, [catalogProducts, searchQuery, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Sales</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monitor gross sales performance, revenue channels, average order values, and product performance.
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
          {/* 1. Gross Revenue */}
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

          {/* 2. Net Sales */}
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Total Orders</span>
              <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              <span>{stats.totalOrders.toLocaleString("en-IN")}</span>
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-muted-foreground font-medium whitespace-nowrap">API data</span>
              <span className="text-muted-foreground truncate">Completed orders</span>
            </div>
          </div>

          {/* 3. Average Order Value */}
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r-0 lg:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Avg Order Value</span>
              <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              <FormattedAmount amount={stats.avgOrderValue} />
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-muted-foreground font-medium whitespace-nowrap">API data</span>
              <span className="text-muted-foreground truncate">Current selected storefront</span>
            </div>
          </div>

          {/* 4. AI-Driven Sales */}
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>AI-Driven Orders</span>
              <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              <span>{stats.agentOrders.toLocaleString("en-IN")}</span>
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-muted-foreground font-medium whitespace-nowrap">API data</span>
              <span className="text-muted-foreground truncate">{stats.agentSharePct}% channel volume</span>
            </div>
          </div>

          {/* 5. Settlement Rate */}
          <div className="p-4 sm:p-5 flex flex-col justify-between">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Settlement Rate</span>
              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              {stats.fulfillmentRate}%
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-muted-foreground font-medium whitespace-nowrap">API data</span>
              <span className="text-muted-foreground truncate">Fulfillment rate</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top 2 Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChartStacked
          title="15-Day Gross Sales Revenue Trend"
          data={timeSeries}
          totalOrders={stats.totalOrders}
          agentOrders={stats.agentOrders}
          humanOrders={stats.humanOrders}
          grossRevenue={stats.grossRevenue}
          avgOrderValue={stats.avgOrderValue}
          valueType="revenue"
        />
        <PaymentChannelRadar dimensions={channelDimensions} />
      </div>

      {/* Catalog Sales & Performance Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
        {/* Left: Icon Box + Title */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Catalog Sales & Performance
            </h2>
          </div>
        </div>

        {/* Right: Search + Category Filter + Reset + View Toggle (List / Board) */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative w-60 max-sm:w-full" suppressHydrationWarning>
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search products..."
              suppressHydrationWarning
              spellCheck={false}
              autoComplete="off"
              className="h-9 w-full rounded-lg border border-border bg-muted pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Category Filter */}
          <SelectMenu
            value={categoryFilter}
            onChange={(val) => {
              setCategoryFilter(val);
              setCurrentPage(1);
            }}
            options={categoryOptions}
          />

          {/* Reset Filters button if any active */}
          {(categoryFilter !== "ALL" || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setCategoryFilter("ALL");
                setSearchQuery("");
                setCurrentPage(1);
              }}
              className="h-9 rounded-lg border border-border bg-muted px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              title="Reset filters"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Content Section */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground">
          <div className="flex flex-col items-center justify-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Loading real-time catalog sales...</span>
          </div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-muted/40 text-center">
          <Package className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {searchQuery ? `No products matching "${searchQuery}"` : "No matching products found"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Try adjusting your search query or category filters.
          </p>
        </div>
      ) : (
        /* Table View */
        <TooltipProvider delay={100}>
          <Card className="rounded-xl border border-border p-0 overflow-hidden shadow-none ring-0">
            <Table className="text-left text-xs">
              <TableHeader>
                <TableRow className="border-border text-[11px] font-semibold tracking-wider text-muted-foreground hover:bg-transparent">
                  <TableHead className="w-12 px-4 py-3.5 font-mono text-muted-foreground">#</TableHead>
                  <TableHead className="px-4 py-3.5">Product Name</TableHead>
                  <TableHead className="px-4 py-3.5">Category</TableHead>
                  <TableHead className="px-4 py-3.5 text-right">Units Sold</TableHead>
                  <TableHead className="px-4 py-3.5 text-right">Gross Sales</TableHead>
                  <TableHead className="px-4 py-3.5">Revenue Share</TableHead>
                  <TableHead className="px-4 py-3.5 text-right">Avg Price (ASP)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border font-medium">
                {paginatedProducts.map((p, idx) => {
                  const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                  const isDetailActive = selectedProductId === p.title;

                  return (
                    <Fragment key={p.title || idx}>
                      <TableRow
                        onClick={() => setSelectedProductId(isDetailActive ? null : p.title)}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-accent/40",
                          isDetailActive ? "bg-accent/50" : ""
                        )}
                      >
                        <TableCell className="px-4 py-4 font-mono text-xs text-muted-foreground font-medium">
                          {String(rowNumber).padStart(2, "0")}
                        </TableCell>

                        <TableCell className="px-4 py-4">
                          <div className="font-bold text-sm text-foreground whitespace-nowrap">
                            {p.title}
                          </div>
                        </TableCell>

                        <TableCell className="px-4 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                            {p.category}
                          </span>
                        </TableCell>

                        <TableCell className="px-4 py-4 font-mono text-right whitespace-nowrap">
                          <span className="font-bold text-foreground">{p.units.toLocaleString()}</span>
                          <span className="text-[11px] text-muted-foreground font-normal block">
                            {p.agentUnits} AI · {p.humanUnits} Hum
                          </span>
                        </TableCell>

                        <TableCell className="px-4 py-4 font-mono font-semibold text-right text-emerald-400 whitespace-nowrap">
                          <FormattedAmount amount={p.revenue} />
                        </TableCell>

                        <TableCell className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-purple-500 transition-all duration-300"
                                style={{ width: `${Math.min(100, p.share * 2)}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs text-muted-foreground font-medium">
                              {p.share}%
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="px-4 py-4 font-mono text-right text-muted-foreground whitespace-nowrap">
                          <FormattedAmount amount={p.asp} />
                        </TableCell>
                      </TableRow>

                      {/* Inline Product Detail Subrow */}
                      {isDetailActive && (
                        <TableRow className="bg-accent/40 border-b border-border hover:bg-accent/40">
                          <TableCell colSpan={7} className="px-6 py-4">
                            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted border border-border">
                                    <Package className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <div>
                                    <span className="font-semibold text-sm text-foreground">{p.title}</span>
                                    <span className="ml-2 inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                      {p.category}
                                    </span>
                                  </div>
                                </div>
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                                  <ArrowUpRight className="h-3 w-3" />
                                  {p.trend} Growth
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border text-xs">
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">Total Units Sold</span>
                                  <span className="font-mono font-semibold text-foreground">{p.units.toLocaleString()} units</span>
                                  <span className="text-[10px] text-muted-foreground block font-mono mt-0.5">
                                    {p.agentUnits} AI Agent / {p.humanUnits} Shopper
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">Gross Revenue</span>
                                  <span className="font-mono font-semibold text-emerald-400">
                                    <FormattedAmount amount={p.revenue} />
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">Average Selling Price</span>
                                  <span className="font-mono font-medium text-foreground">
                                    <FormattedAmount amount={p.asp} />
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">Catalog Revenue Share</span>
                                  <span className="font-mono font-semibold text-foreground">{p.share}%</span>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TooltipProvider>
      )}

      {/* Separate Bottom Pagination Bar matching TransactionsList */}
      {filteredProducts.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
          {/* Left: Count & Page Size Selector */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div>
              Showing{" "}
              <span className="font-semibold text-foreground">
                {(currentPage - 1) * pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-foreground">
                {Math.min(currentPage * pageSize, filteredProducts.length)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-foreground">
                {filteredProducts.length}
              </span>{" "}
              products
            </div>

            <div className="h-3.5 w-px bg-accent hidden sm:block" />

            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Rows per page:</span>
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
                  { value: 100, label: "100" },
                ]}
              />
            </div>
          </div>

          {/* Right: Pagination Navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
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
                      currentPage === pageNum
                        ? "bg-muted text-foreground shadow-none"
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
              disabled={currentPage >= totalPages}
              className="h-8 px-2.5 rounded-lg border border-border bg-background text-xs text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
