"use client";

import { useEffect, useState, useMemo } from "react";
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
                "absolute pointer-events-none z-30 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md transition-all duration-150 animate-in fade-in zoom-in-95 min-w-[150px]",
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

      {/* Big Unified Card for Catalog Sales & Performance Table */}
      <Card className="rounded-xl border border-border bg-card p-5 space-y-4">
        {/* Card Header with Integrated Search & Category Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Catalog Sales & Performance
              </h2>
            </div>
          </div>

          {/* Search & Category Filter Controls */}
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
            {/* Search */}
            <div className="relative w-64 max-sm:w-full">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground z-10 pointer-events-none" />
              <Input
                placeholder="Search products or categories..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg bg-background pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground"
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

            {(categoryFilter !== "ALL" || searchQuery) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCategoryFilter("ALL");
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

        {/* Catalog Sales Table */}
        <div className="overflow-x-auto rounded-lg border border-border/80">
          <Table className="w-full text-xs text-left">
            <TableHeader className="border-b border-border bg-muted/40 text-muted-foreground font-medium text-[11px]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3">Product Name</TableHead>
                <TableHead className="px-3 py-3">Category</TableHead>
                <TableHead className="px-3 py-3 text-right">Units Sold</TableHead>
                <TableHead className="px-3 py-3 text-right">Gross Sales</TableHead>
                <TableHead className="px-4 py-3">Revenue Share</TableHead>
                <TableHead className="px-3 py-3 text-right">Avg Price (ASP)</TableHead>
                <TableHead className="px-4 py-3 text-right">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border font-normal">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span>Loading real-time catalog sales...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <Empty className="py-12">
                      <EmptyHeader>
                        <EmptyMedia variant="default">
                          <Package className="h-6 w-6 text-muted-foreground/60" />
                        </EmptyMedia>
                        <EmptyTitle className="text-xs font-medium text-foreground">
                          No matching products found
                        </EmptyTitle>
                        <EmptyDescription className="text-[11px] text-muted-foreground">
                          Try adjusting your search query or category filters.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedProducts.map((p, idx) => (
                  <TableRow key={idx} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="px-4 py-3 font-medium text-foreground max-w-[280px] truncate">
                      {p.title}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-muted-foreground">
                      <Badge variant="outline" className="rounded-md border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {p.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-3 py-3 font-mono text-right text-foreground">
                      <span>{p.units.toLocaleString()}</span>
                      <span className="text-[10px] text-muted-foreground block">
                        {p.agentUnits} AI · {p.humanUnits} Hum
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-3 font-mono text-right font-semibold text-foreground">
                      <FormattedAmount amount={p.revenue} />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-purple-500 transition-all duration-300"
                            style={{ width: `${Math.min(100, p.share * 2)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground">{p.share}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3 font-mono text-right text-muted-foreground">
                      <FormattedAmount amount={p.asp} />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Badge variant="outline" className="gap-0.5 rounded-full border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                        <ArrowUpRight className="h-3 w-3 inline" />
                        {p.trend}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination & Controls Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <SelectMenu
              value={pageSize}
              onChange={(val) => {
                setPageSize(Number(val));
                setCurrentPage(1);
              }}
              options={[
                { value: 5, label: "5" },
                { value: 10, label: "10" },
                { value: 20, label: "20" },
              ]}
              size="sm"
            />
            <span className="text-muted-foreground/80 pl-2">
              Showing{" "}
              <strong className="text-foreground">
                {filteredProducts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-
                {Math.min(currentPage * pageSize, filteredProducts.length)}
              </strong>{" "}
              of <strong className="text-foreground">{filteredProducts.length}</strong> products
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-7 w-7 p-0 rounded-md border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 font-mono text-xs text-foreground">
              {currentPage} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 w-7 p-0 rounded-md border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
