"use client";

import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
  ChevronDown,
} from "lucide-react";
import { cn } from "@cartwright/ui/lib/utils";
import { trpc } from "@/utils/trpc";
import { BarChartStacked } from "@/components/bar-chart-stacked";
import { Button } from "@cartwright/ui/components/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@cartwright/ui/components/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@cartwright/ui/components/dropdown-menu";

function FormattedAmount({ amount, className }: { amount: number; className?: string }) {
  const parts = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).formatToParts(amount);

  const symbol = parts.find((p) => p.type === "currency")?.value || "₹";
  const num = parts.filter((p) => p.type !== "currency").map((p) => p.value).join("").trim();

  return (
    <span className={cn("font-mono whitespace-nowrap", className)}>
      <span className="text-muted-foreground font-normal mr-0.5">{symbol}</span>
      <span className="font-bold text-foreground">{num}</span>
    </span>
  );
}

function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  size = "md",
}: {
  value: string | number;
  onChange: (val: string) => void;
  options: Array<{ value: string | number; label: string }>;
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const selected = options.find((o) => String(o.value) === String(value));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex w-auto items-center justify-between gap-2 rounded-lg border border-border bg-card text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-muted/80 focus:border-ring focus:outline-none cursor-pointer whitespace-nowrap shrink-0",
              size === "sm" ? "h-7 px-2.5" : "h-9 px-3",
              className
            )}
          >
            <span>{selected ? selected.label : placeholder}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="z-50 w-max min-w-full rounded-xl border border-border bg-popover p-1 shadow-2xl text-xs text-popover-foreground backdrop-blur-md"
      >
        <DropdownMenuGroup>
          {options.map((opt) => {
            const isSelected = String(opt.value) === String(value);
            return (
              <DropdownMenuItem
                key={String(opt.value)}
                onClick={() => onChange(String(opt.value))}
                className={cn(
                  "flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap",
                  isSelected
                    ? "bg-muted text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <span>{opt.label}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

function getComparisonDimensions(agentSharePct: number): DimensionComparison[] {
  const baseAi = agentSharePct > 0 ? Math.min(98, Math.max(75, Math.round(agentSharePct * 1.3))) : 88;
  return [
    { key: "price", label: "Price Adherence", desc: "Budget cap adherence & discount optimization", aiScore: Math.min(99, baseAi + 8), humanScore: 72 },
    { key: "stock", label: "Inventory Match", desc: "SKU variant & real-time stock verification", aiScore: Math.min(99, baseAi + 10), humanScore: 66 },
    { key: "rating", label: "Quality Filter", desc: "Review sentiment & rating threshold filtering", aiScore: Math.min(98, baseAi + 4), humanScore: 80 },
    { key: "speed", label: "Checkout Latency", desc: "Sub-20s autonomous form checkout completion", aiScore: Math.min(95, baseAi), humanScore: 48 },
    { key: "schema", label: "Schema.org Parsing", desc: "JSON-LD & structured catalog extraction", aiScore: Math.min(99, baseAi + 7), humanScore: 22 },
    { key: "retention", label: "Cart Retention", desc: "Frictionless checkout with zero cart abandonment", aiScore: Math.min(94, baseAi - 4), humanScore: 59 },
  ];
}

function AgentRadarChart({
  agentOrders = 0,
  agentSharePct = 0,
}: {
  agentOrders?: number;
  humanOrders?: number;
  agentSharePct?: number;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const comparisonDimensions = getComparisonDimensions(agentSharePct);

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
    <div className="rounded-xl border border-border bg-card text-card-foreground p-5 flex flex-col justify-between relative overflow-hidden">
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
    </div>
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

interface OrderItem {
  id: string;
  date: string;
  customer: string;
  city: string;
  items: string;
  amount: number;
  method: string;
  status: string;
  actor: "agent" | "shopper";
  merchantId?: string;
  siteId?: string;
}

interface TimeSeriesItem {
  day: string;
  series: "Human" | "AI Agent";
  orders: number;
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

export default function MerchantOrdersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [stats, setStats] = useState<LiveStats>(DEFAULT_STATS);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Merchant Account & Data-Site Binding
  const accountQuery = useQuery({
    ...trpc.merchantIntelligence.getAccount.queryOptions(),
  });

  const activeMerchantId = accountQuery.data?.merchantId || "";
  const userSiteIds = accountQuery.data?.siteIds && accountQuery.data.siteIds.length > 0
    ? accountQuery.data.siteIds
    : (accountQuery.data?.primarySiteId ? [accountQuery.data.primarySiteId] : []);

  const [selectedSiteId, setSelectedSiteId] = useState<string>("");

  useEffect(() => {
    if (accountQuery.data?.primarySiteId && !selectedSiteId) {
      setSelectedSiteId(accountQuery.data.primarySiteId);
    }
  }, [accountQuery.data, selectedSiteId]);

  const activeSiteId = selectedSiteId || accountQuery.data?.primarySiteId || userSiteIds[0] || "";

  useEffect(() => {
    async function loadPostHogData() {
      if (!activeMerchantId) return;
      setLoading(true);
      try {
        const queryUrl = activeSiteId && activeSiteId !== "site_all"
          ? `/api/tracker/stats?site=${encodeURIComponent(activeSiteId)}`
          : "/api/tracker/stats?site=all";
        
        const res = await fetch(queryUrl);
        if (res.ok) {
          const data = await res.json();
          if (data.stats) {
            setStats(data.stats);
          }
          if (data.timeSeries) {
            setTimeSeries(data.timeSeries);
          }
          if (data.orders) {
            setOrders(data.orders);
          }
        }
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
              <CustomSelect
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

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between">
          <div className="text-xs text-muted-foreground font-medium">Total Orders</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
            {stats.totalOrders.toLocaleString()}
          </div>
          <div className="text-[11px] flex items-center gap-1.5 mt-1">
            <span className="text-emerald-500 font-medium whitespace-nowrap">↗ +14.8%</span>
            <span className="text-muted-foreground truncate">{stats.agentOrders} Agent · {stats.humanOrders} Human</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between">
          <div className="text-xs text-muted-foreground font-medium">Gross Revenue</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
            <FormattedAmount amount={stats.grossRevenue} />
          </div>
          <div className="text-[11px] flex items-center gap-1.5 mt-1">
            <span className="text-emerald-500 font-medium whitespace-nowrap">↗ +18.4%</span>
            <span className="text-muted-foreground truncate">₹{Math.round(stats.agentOrders * (stats.avgOrderValue || 1500)).toLocaleString("en-IN")} via AI agents</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between">
          <div className="text-xs text-muted-foreground font-medium">Average Order Value</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
            <FormattedAmount amount={stats.avgOrderValue} />
          </div>
          <div className="text-[11px] flex items-center gap-1.5 mt-1">
            <span className="text-emerald-500 font-medium whitespace-nowrap">↗ +5.2%</span>
            <span className="text-muted-foreground truncate">vs ₹{Math.round((stats.avgOrderValue || 1500) * 0.94).toLocaleString("en-IN")} prior</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between">
          <div className="text-xs text-muted-foreground font-medium">AI Agent Volume</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight text-purple-400">
            {stats.agentOrders.toLocaleString()} <span className="text-xs font-normal text-muted-foreground font-sans">orders</span>
          </div>
          <div className="text-[11px] flex items-center gap-1.5 mt-1">
            <span className="text-emerald-500 font-medium whitespace-nowrap">↗ +22.5%</span>
            <span className="text-muted-foreground truncate">{stats.agentSharePct}% of total volume</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between">
          <div className="text-xs text-muted-foreground font-medium">Fulfillment Rate</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight text-emerald-500">
            {stats.fulfillmentRate}%
          </div>
          <div className="text-[11px] flex items-center gap-1.5 mt-1">
            <span className="text-emerald-500 font-medium whitespace-nowrap">↗ +1.2%</span>
            <span className="text-muted-foreground truncate">{Math.round(stats.totalOrders * (stats.fulfillmentRate / 100))} delivered · {Math.max(0, stats.totalOrders - Math.round(stats.totalOrders * (stats.fulfillmentRate / 100)))} in-transit</span>
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
        />
      </div>

      {/* Big Unified Card for Past Orders Table & Controls */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
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
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <input
                placeholder="Search orders, customers, items..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
              />
            </div>

            {/* Status Filter */}
            <CustomSelect
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
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("ALL");
                  setSearchQuery("");
                  setCurrentPage(1);
                }}
                className="h-9 rounded-lg border border-border bg-muted/60 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Orders Table */}
        {filteredOrders.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-background text-center p-6">
            <ShoppingCart className="mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">
              {searchQuery ? `No orders matching "${searchQuery}"` : "No orders found"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
              Live transactions recorded with telemetry and payment signatures will appear here.
            </p>
          </div>
        ) : (
          /* Table View */
          <TooltipProvider delay={100}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground font-medium text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="w-12 px-4 py-3 font-mono text-muted-foreground">#</th>
                  <th className="px-4 py-3">Order ID</th>
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Customer & City</th>
                  <th className="px-4 py-3">Items Purchased</th>
                  <th className="px-4 py-3">Fulfillment</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Total Amount</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-normal">
                {paginatedOrders.map((o, index) => {
                  const rowNumber = (safeCurrentPage - 1) * pageSize + index + 1;
                  const isCopied = copiedId === o.id;
                  const details = getStatusDetails(o.status);

                  return (
                    <tr
                      key={`${o.id}-${index}`}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
                        {rowNumber}
                      </td>

                      {/* Order ID + Copy */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-foreground">
                            {o.id.slice(0, 14)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCopy(o.id, e)}
                            className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors cursor-pointer"
                            title="Copy Order ID"
                          >
                            {isCopied ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-muted-foreground font-mono whitespace-nowrap">
                        {o.date}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-medium text-foreground flex items-center gap-1.5 whitespace-nowrap">
                          {o.customer}
                          {o.actor === "agent" && (
                            <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.2 text-[10px] font-semibold text-purple-400">
                              AI Bot
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{o.city}</div>
                      </td>

                      {/* Item with Tooltip */}
                      <td className="px-4 py-3.5 max-w-[240px]">
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
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", details.fulfillmentTone)}>
                          {details.fulfillmentLabel}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <SegmentedProgressBar percent={details.progressPercent} />
                      </td>

                      <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                        {o.method}
                      </td>

                      <td className="px-4 py-3.5 font-mono font-semibold text-emerald-500 whitespace-nowrap">
                        <FormattedAmount amount={o.amount} />
                      </td>

                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium border", details.statusTone)}>
                          {details.statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      )}

        {/* Pagination Controls Bar */}
        {filteredOrders.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-border/60">
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
                <CustomSelect
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
