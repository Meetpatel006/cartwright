"use client";

import { useEffect, useState, useMemo } from "react";
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
            "Bengaluru, KA": { x: 360, y: 792, stateId: "INKA" },
            "Delhi NCR": { x: 344, y: 321, stateId: "INDL" },
            "Delhi NCR, DL": { x: 344, y: 321, stateId: "INDL" },
            "Mumbai": { x: 236, y: 602, stateId: "INMH" },
            "Mumbai, MH": { x: 236, y: 602, stateId: "INMH" },
            "Hyderabad": { x: 398, y: 648, stateId: "INTG" },
            "Hyderabad, TS": { x: 398, y: 648, stateId: "INTG" },
            "Chennai": { x: 418, y: 778, stateId: "INTN" },
            "Chennai, TN": { x: 418, y: 778, stateId: "INTN" },
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
            const name = o.customer || (o.isAgent ? "Autonomous AI Agent" : `Customer #${idx + 1}`);
            const email = o.email || "—";
            const id = `USR-${String(idx + 1).padStart(4, "0")}`;
            const isAgent = Boolean(o.isAgent || (o.method || "").toLowerCase().includes("agent"));
            const location = o.city ? `${o.city}, IN` : "—";

            if (!custMap.has(name)) {
              custMap.set(name, {
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
              const existing = custMap.get(name)!;
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

      {/* Big Unified Card for Customer Directory Table & Controls (Matching Orders Layout) */}
      <Card className="rounded-xl border border-border bg-card p-5 space-y-4">
        {/* Card Header with Integrated Search & Filter Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Customer Directory
              </h2>
            </div>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
            {/* Search */}
            <div className="relative w-64 max-sm:w-full" suppressHydrationWarning>
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground z-10 pointer-events-none" />
              <Input
                placeholder="Search customers, emails, cities..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                suppressHydrationWarning
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-lg bg-background pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground"
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

            {(typeFilter !== "ALL" || searchTerm) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setTypeFilter("ALL");
                  setSearchTerm("");
                  setCurrentPage(1);
                }}
                className="h-9 rounded-lg border-border bg-muted/60 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Customers Table View */}
        {filteredCustomers.length === 0 ? (
          <Empty className="h-64 rounded-xl border border-border bg-background">
            <EmptyHeader>
              <EmptyMedia variant="default">
                <Users className="h-8 w-8 text-muted-foreground/40" />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-medium text-foreground">
                {searchTerm ? `No customers matching "${searchTerm}"` : "No customers found"}
              </EmptyTitle>
              <EmptyDescription className="text-xs text-muted-foreground max-w-sm">
                Verified buyer profiles and order spend across channels will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <TooltipProvider delay={100}>
            <Table className="w-full text-xs text-left">
              <TableHeader className="border-b border-border bg-muted/40 text-muted-foreground font-medium text-[11px] uppercase tracking-wider">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 px-4 py-3 font-mono text-muted-foreground">#</TableHead>
                  <TableHead className="px-4 py-3">Customer ID</TableHead>
                  <TableHead className="px-4 py-3">Customer</TableHead>
                  <TableHead className="px-4 py-3">Channel / Type</TableHead>
                  <TableHead className="px-4 py-3">Location</TableHead>
                  <TableHead className="px-4 py-3">Orders</TableHead>
                  <TableHead className="px-4 py-3">Total Spend</TableHead>
                  <TableHead className="px-4 py-3 text-right">Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border font-normal">
                {paginatedCustomers.map((c, index) => {
                  const rowNumber = (safeCurrentPage - 1) * pageSize + index + 1;
                  const isCopied = copiedId === c.id;

                  return (
                    <TableRow
                      key={c.id}
                      className="hover:bg-muted/40 transition-colors group cursor-default"
                    >
                      <TableCell className="px-4 py-3.5 font-mono text-muted-foreground text-[11px]">
                        {String(rowNumber).padStart(2, "0")}
                      </TableCell>

                      <TableCell className="px-4 py-3.5">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                onClick={(e) => handleCopy(c.id, e)}
                                aria-label={`Copy customer ID ${c.id}`}
                                className="inline-flex items-center gap-1.5 font-mono font-medium text-foreground hover:text-primary transition-colors cursor-pointer group/copy"
                              >
                                <span>{c.id}</span>
                                {isCopied ? (
                                  <Check className="h-3 w-3 text-emerald-500" />
                                ) : (
                                  <Copy className="h-3 w-3 opacity-0 group-hover/copy:opacity-100 transition-opacity text-muted-foreground" />
                                )}
                              </button>
                            }
                          />
                          <TooltipContent side="top" className="text-xs">
                            {isCopied ? "Copied ID!" : "Click to copy Customer ID"}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>

                      <TableCell className="px-4 py-3.5">
                        <div className="font-medium text-foreground">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground font-normal">{c.email}</div>
                      </TableCell>

                      <TableCell className="px-4 py-3.5">
                        {c.isAgent ? (
                          <Badge variant="outline" className="gap-1.5 rounded-md border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-[11px] font-medium text-purple-400">
                            <Bot className="size-3" /> AI Agent
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1.5 rounded-md border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-400">
                            <User className="size-3" /> Human
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="px-4 py-3.5 text-muted-foreground">{c.location}</TableCell>

                      <TableCell className="px-4 py-3.5 font-mono font-medium text-foreground">
                        {c.orders}
                      </TableCell>

                      <TableCell className="px-4 py-3.5 font-mono font-semibold text-emerald-500">
                        <FormattedAmount amount={c.spend} />
                      </TableCell>

                      <TableCell className="px-4 py-3.5 text-right font-mono text-muted-foreground">
                        {c.lastActive}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination Footer (Matching Orders Page) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
              {/* Left: Summary & Rows per page */}
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  Showing{" "}
                  <span className="font-semibold text-foreground">
                    {filteredCustomers.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}
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
              <div className="flex items-center gap-2 self-end sm:self-auto">
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
          </TooltipProvider>
        )}
      </Card>
    </div>
  );
}
