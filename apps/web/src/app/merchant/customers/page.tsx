"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import {
  Search,
  Bot,
  User,
  Store,
  Users,
  UserCheck,
  UserPlus,
  IndianRupee,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Repeat,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@cartwright/ui/lib/utils";
import { useMerchantContext } from "@/components/merchant/use-merchant-context";
import { FormattedAmount } from "@/components/merchant/formatted-amount";
import { SelectMenu } from "@cartwright/ui/components/select-menu";
import { CustomerGrowthChart, type CustomerGrowthDatum } from "@/components/customer-growth-chart";
import { IndiaMapChart, type GeoCityDatum } from "@/components/india-map-chart";
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
  type CustomerStats,
  type CohortAnalysisData,
} from "@/utils/tracker-api";

interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  location: string;
  orders: number;
  spend: number;
  isAgent: boolean;
  lastActive: string;
  status?: string;
}

export default function MerchantCustomersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Merchant Account & Multi-Site Binding
  const { accountQuery, activeMerchantId, activeSiteId, selectedSiteId, setSelectedSiteId, siteIds: userSiteIds } = useMerchantContext();

  // Dynamic Customer Metrics state from API
  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);

  const [growthData, setGrowthData] = useState<CustomerGrowthDatum[]>([]);
  const [geoHubs, setGeoHubs] = useState<GeoCityDatum[]>([]);
  const [cohortData, setCohortData] = useState<CohortAnalysisData | null>(null);
  const [telemetryCustomers, setTelemetryCustomers] = useState<CustomerRecord[]>([]);

  useEffect(() => {
    async function loadCustomersTelemetry() {
      if (!activeMerchantId) return;
      try {
        const data = await fetchTrackerStats(activeSiteId);
        if (data.customerStats) {
          setCustomerStats(data.customerStats);
        }
        if (data.customerGrowthTimeSeries && data.customerGrowthTimeSeries.length > 0) {
          setGrowthData(data.customerGrowthTimeSeries);
        }
        if (data.geoDistribution && Array.isArray(data.geoDistribution) && data.geoDistribution.length > 0) {
          const coordsMap: Record<string, { x: number; y: number; stateId: string }> = {
            "Bengaluru": { x: 360, y: 792, stateId: "INKA" },
            "Delhi NCR": { x: 344, y: 321, stateId: "INDL" },
            "Mumbai": { x: 236, y: 602, stateId: "INMH" },
            "Hyderabad": { x: 398, y: 648, stateId: "INTG" },
            "Pune": { x: 260, y: 625, stateId: "INMH" },
            "Chennai": { x: 418, y: 778, stateId: "INTN" },
            "Ahmedabad": { x: 220, y: 485, stateId: "INGJ" },
            "Jaipur": { x: 295, y: 375, stateId: "INRJ" },
            "Kolkata": { x: 605, y: 530, stateId: "INWB" },
            "Chandigarh": { x: 328, y: 250, stateId: "INCH" },
            "Kochi": { x: 340, y: 880, stateId: "INKL" },
            "Indore": { x: 310, y: 520, stateId: "INMP" },
            "Lucknow": { x: 435, y: 385, stateId: "INUP" },
            "Surat": { x: 225, y: 535, stateId: "INGJ" },
            "Nagpur": { x: 385, y: 550, stateId: "INMH" },
            "Coimbatore": { x: 345, y: 835, stateId: "INTN" },
            "Bhopal": { x: 350, y: 495, stateId: "INMP" },
            "Visakhapatnam": { x: 485, y: 650, stateId: "INAP" },
            "Vadodara": { x: 240, y: 505, stateId: "INGJ" },
            "Ludhiana": { x: 310, y: 235, stateId: "INPB" },
          };

          const mappedHubs: GeoCityDatum[] = data.geoDistribution.map((g: any) => {
            const matched = coordsMap[g.city] || coordsMap[g.city.split(",")[0].trim()] || { x: 350, y: 500, stateId: "IN" };
            return {
              city: g.city.split(",")[0].trim(),
              state: g.state || "India",
              stateId: matched.stateId,
              orders: g.orders,
              share: g.share,
              revenue: g.revenue,
              coords: { x: matched.x, y: matched.y },
            };
          });

          if (mappedHubs.length > 0) {
            setGeoHubs(mappedHubs);
          }
        }
        if (data.cohortAnalysis) {
          setCohortData(data.cohortAnalysis);
        }
        if (data.orders && Array.isArray(data.orders) && data.orders.length > 0) {
          const custMap = new Map<string, CustomerRecord>();
          data.orders.forEach((o: any, idx: number) => {
            // Group by stable buyer key (distinct_id) so each buyer — including
            // every AI agent — gets its own row instead of collapsing by name.
            const isAgent = o.actor === "agent";
            const key = String(o.buyerKey || o.customer || `row-${idx}`);
            const baseName = o.customer || (isAgent ? "Autonomous AI Agent" : `Customer #${idx + 1}`);
            const name = isAgent && o.buyerKey ? `${baseName} ·${String(o.buyerKey).slice(-6)}` : baseName;
            const email = o.email || "—";
            const id = `USR-${String(custMap.size + 1).padStart(4, "0")}`;
            const location = o.city ? `${o.city}, IN` : "—";

            if (!custMap.has(key)) {
              custMap.set(key, {
                id,
                name,
                email,
                location,
                orders: 1,
                spend: Number(o.amount) || 0,
                isAgent,
                lastActive: o.date ? o.date.split("T")[0] : "Recently",
                status: isAgent ? "Active Agent" : "Verified Buyer",
              });
            } else {
              const existing = custMap.get(key)!;
              existing.orders += 1;
              existing.spend += Number(o.amount) || 0;
            }
          });
          const derived = Array.from(custMap.values());
          if (derived.length > 0) {
            setTelemetryCustomers(derived);
          }
        }
      } catch (err) {
        console.error("Failed to load customer telemetry:", err);
      }
    }
    loadCustomersTelemetry();
  }, [activeMerchantId, activeSiteId]);

  // Customer rows come exclusively from telemetry returned by the API.
  const allCustomers = useMemo(() => {
    return telemetryCustomers;
  }, [telemetryCustomers]);

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredCustomers = useMemo(() => {
    return allCustomers.filter((c) => {
      const q = searchTerm.toLowerCase().trim();
      if (q) {
        const match =
          c.id.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.location.toLowerCase().includes(q);
        if (!match) return false;
      }

      if (typeFilter === "AGENT" && !c.isAgent) return false;
      if (typeFilter === "HUMAN" && c.isAgent) return false;

      return true;
    });
  }, [allCustomers, searchTerm, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedCustomers = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, safeCurrentPage, pageSize]);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Customers</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Buyer profiles, geographic distribution, retention metrics, and customer lifetime value.
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

      {/* 6 Customer KPI Stats in Clean Interior-Border Grid */}
      <div className="w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1. Total Customers */}
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-r lg:border-r lg:border-b border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Total Customers</span>
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              {customerStats?.totalCustomers.toLocaleString() ?? "—"}
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-emerald-500 font-medium whitespace-nowrap">{customerStats ? `↗ +${customerStats.totalGrowthPct}%` : "—"}</span>
              <span className="text-muted-foreground truncate">Steady user growth</span>
            </div>
          </div>

          {/* 2. Active Customers */}
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-r-0 lg:border-r lg:border-b border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Active Customers</span>
              <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              {customerStats?.activeCustomers.toLocaleString() ?? "—"}
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-emerald-500 font-medium whitespace-nowrap">{customerStats ? `↗ +${customerStats.activeRetentionPct}%` : "—"}</span>
              <span className="text-muted-foreground truncate">High retention rate</span>
            </div>
          </div>

          {/* 3. 1st-Time Shoppers */}
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-r lg:border-r-0 lg:border-b border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>1st-Time Shoppers</span>
              <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              {cohortData?.firstTime.count.toLocaleString() ?? "—"}
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1 text-muted-foreground">
              <span className="text-blue-400 font-medium whitespace-nowrap">{cohortData ? `${cohortData.firstTime.sharePct}%` : "—"}</span>
              <span className="text-muted-foreground/60 font-normal">·</span>
              <span className="truncate flex items-center gap-1">
                <span>Avg Spend:</span>
                {cohortData ? <FormattedAmount amount={cohortData.firstTime.avgSpend} /> : "—"}
              </span>
            </div>
          </div>

          {/* 4. Repeat Buyers */}
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r-0 lg:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Repeat Buyers</span>
              <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              {cohortData?.repeat.count.toLocaleString() ?? "—"}
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-emerald-500 font-medium whitespace-nowrap">{cohortData ? `↗ ${cohortData.repeat.sharePct}%` : "—"}</span>
              <span className="text-muted-foreground truncate">From customer telemetry</span>
            </div>
          </div>

          {/* 5. CLV (LTV) */}
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r lg:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>CLV (LTV)</span>
              <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              {customerStats ? <FormattedAmount amount={customerStats.customerLifetimeValue} /> : "—"}
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-emerald-500 font-medium whitespace-nowrap">{customerStats ? `↗ +${customerStats.clvGrowthPct}%` : "—"}</span>
              <span className="text-muted-foreground truncate">From customer telemetry</span>
            </div>
          </div>

          {/* 6. New Customers */}
          <div className="p-4 sm:p-5 flex flex-col justify-between">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>New Customers</span>
              <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              {customerStats?.newCustomers.toLocaleString() ?? "—"}
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-emerald-500 font-medium whitespace-nowrap">{customerStats ? `↗ +${customerStats.newAcquisitionPct}%` : "—"}</span>
              <span className="text-muted-foreground truncate">From customer telemetry</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top 2 Insights Grid: Customer Growth & Geographic Distribution (Map of India) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Growth: New Signups & Churn over Time */}
        <CustomerGrowthChart
          data={growthData}
          totalNew={customerStats?.newCustomers ?? 0}
          totalChurn={customerStats?.churnedCustomers ?? 0}
          title="Customer Growth"
        />

        {/* Geographic Distribution: India Map with Metro Hubs */}
        <IndiaMapChart
          hubs={geoHubs}
          title="Geographic Distribution"
        />
      </div>

      {/* Customer Directory Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
        {/* Left: Icon Box + Title */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Customer Directory
            </h2>
          </div>
        </div>

        {/* Right: Search + Filters + View Toggle (List / Board) */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative w-60 max-sm:w-full" suppressHydrationWarning>
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search customers..."
              suppressHydrationWarning
              spellCheck={false}
              autoComplete="off"
              className="h-9 w-full rounded-lg border border-border bg-muted pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Type / Channel Filter */}
          <SelectMenu
            value={typeFilter}
            onChange={(val) => {
              setTypeFilter(val);
              setCurrentPage(1);
            }}
            options={[
              { value: "ALL", label: "All Customers" },
              { value: "HUMAN", label: "Human" },
              { value: "AGENT", label: "AI Agent" },
            ]}
          />

          {/* Reset Filters button if any active */}
          {(typeFilter !== "ALL" || searchTerm) && (
            <button
              type="button"
              onClick={() => {
                setTypeFilter("ALL");
                setSearchTerm("");
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
      {filteredCustomers.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-muted/40 text-center">
          <Users className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {searchTerm ? `No customers matching "${searchTerm}"` : "No customers found"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verified buyer profiles and order spend across channels will appear here.
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
                  <TableHead className="px-4 py-3.5">Customer ID</TableHead>
                  <TableHead className="px-4 py-3.5">Customer</TableHead>
                  <TableHead className="px-4 py-3.5">Channel / Type</TableHead>
                  <TableHead className="px-4 py-3.5">Location</TableHead>
                  <TableHead className="px-4 py-3.5">Orders</TableHead>
                  <TableHead className="px-4 py-3.5">Total Spend</TableHead>
                  <TableHead className="px-4 py-3.5 text-right">Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border font-medium">
                {paginatedCustomers.map((c, index) => {
                  const rowNumber = (safeCurrentPage - 1) * pageSize + index + 1;
                  const isCopied = copiedId === c.id;
                  const isDetailActive = selectedCustomerId === c.id;

                  return (
                    <Fragment key={c.id}>
                      <TableRow
                        onClick={() => setSelectedCustomerId(isDetailActive ? null : c.id)}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-accent/40",
                          isDetailActive ? "bg-accent/50" : ""
                        )}
                      >
                        {/* Row Number */}
                        <TableCell className="px-4 py-4 font-mono text-xs text-muted-foreground font-medium">
                          {String(rowNumber).padStart(2, "0")}
                        </TableCell>

                        {/* Customer ID */}
                        <TableCell className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-foreground">
                              {c.id}
                            </span>
                            <Button
                              type="button"
                              onClick={(e) => handleCopy(c.id, e)}
                              variant="ghost"
                              size="icon-xs"
                              className="text-muted-foreground hover:text-foreground cursor-pointer"
                              title="Copy Customer ID"
                            >
                              {isCopied ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </TableCell>

                        {/* Customer Name & Email */}
                        <TableCell className="px-4 py-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-foreground whitespace-nowrap">
                              {c.name}
                            </span>
                            <span className="text-xs text-muted-foreground font-normal">
                              {c.email}
                            </span>
                          </div>
                        </TableCell>

                        {/* Channel / Type (Pill Badges) */}
                        <TableCell className="px-4 py-4 whitespace-nowrap">
                          {c.isAgent ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-400">
                              <Bot className="h-3 w-3" />
                              <span>AI Agent</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
                              <User className="h-3 w-3" />
                              <span>Human</span>
                            </span>
                          )}
                        </TableCell>

                        {/* Location */}
                        <TableCell className="px-4 py-4 text-xs text-muted-foreground whitespace-nowrap">
                          {c.location}
                        </TableCell>

                        {/* Orders */}
                        <TableCell className="px-4 py-4 font-mono font-medium text-foreground whitespace-nowrap">
                          {c.orders}
                        </TableCell>

                        {/* Total Spend */}
                        <TableCell className="px-4 py-4 whitespace-nowrap font-mono font-semibold text-emerald-400">
                          <FormattedAmount amount={c.spend} />
                        </TableCell>

                        {/* Last Active */}
                        <TableCell className="px-4 py-4 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {c.lastActive}
                        </TableCell>
                      </TableRow>

                      {/* Inline Customer Details subrow on row click */}
                      {isDetailActive && (
                        <TableRow className="bg-accent/40 border-b border-border hover:bg-accent/40">
                          <TableCell colSpan={8} className="px-6 py-4">
                            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted border border-border">
                                    {c.isAgent ? (
                                      <Bot className="h-4 w-4 text-purple-400" />
                                    ) : (
                                      <User className="h-4 w-4 text-blue-400" />
                                    )}
                                  </div>
                                  <div>
                                    <span className="font-semibold text-sm text-foreground">{c.name}</span>
                                    <span className="ml-2 font-mono text-xs text-muted-foreground">({c.id})</span>
                                  </div>
                                </div>
                                <span className="text-xs text-muted-foreground font-mono">Last Active: {c.lastActive}</span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border text-xs">
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">Email Address</span>
                                  <span className="font-medium text-foreground">{c.email}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">Geographic Location</span>
                                  <span className="font-medium text-foreground">{c.location}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">Total Purchases</span>
                                  <span className="font-mono font-semibold text-foreground">{c.orders} orders</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">Cumulative Lifetime Spend</span>
                                  <span className="font-mono font-semibold text-emerald-400">
                                    <FormattedAmount amount={c.spend} />
                                  </span>
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
      {filteredCustomers.length > 0 && (
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
                {Math.min(safeCurrentPage * pageSize, filteredCustomers.length)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-foreground">
                {filteredCustomers.length}
              </span>{" "}
              customers
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
  );
}
