"use client";

import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
  ChevronDown,
  Copy,
  Check,
  Repeat,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@cartwright/ui/lib/utils";
import { trpc } from "@/utils/trpc";
import { CustomerGrowthChart, type CustomerGrowthDatum } from "@/components/customer-growth-chart";
import { IndiaMapChart, type GeoCityDatum, DEFAULT_INDIA_HUBS } from "@/components/india-map-chart";
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
    <span suppressHydrationWarning className={cn("font-mono whitespace-nowrap", className)}>
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

interface CohortAnalysisData {
  firstTime: {
    count: number;
    sharePct: number;
    avgSpend: number;
    totalRevenue: number;
  };
  repeat: {
    count: number;
    sharePct: number;
    avgSpend: number;
    totalRevenue: number;
    repeatCycleDays: number;
    retentionRate: number;
  };
}

const BASE_CUSTOMERS: CustomerRecord[] = [
  { id: "USR-01", name: "Rahul Sharma", email: "rahul@example.com", location: "Bengaluru, KA", orders: 4, spend: 5996, isAgent: false, lastActive: "Aug 31", status: "Verified Buyer" },
  { id: "USR-02", name: "Autonomous AI Agent", email: "agent@cartwright.ai", location: "Cloud (IN-West)", orders: 3, spend: 4697, isAgent: true, lastActive: "Aug 31", status: "Active Agent" },
  { id: "USR-03", name: "Pooja Verma", email: "pooja@example.com", location: "Delhi NCR, DL", orders: 2, spend: 2998, isAgent: false, lastActive: "Aug 31", status: "Verified Buyer" },
  { id: "USR-04", name: "Ananya Iyer", email: "ananya@example.com", location: "Chennai, TN", orders: 3, spend: 6497, isAgent: false, lastActive: "Aug 30", status: "Verified Buyer" },
  { id: "USR-05", name: "Stagehand Agent", email: "agent@stagehand.dev", location: "Cloud (IN-South)", orders: 2, spend: 2598, isAgent: true, lastActive: "Aug 30", status: "Active Agent" },
  { id: "USR-06", name: "Vikram Malhotra", email: "vikram@example.com", location: "Hyderabad, TS", orders: 1, spend: 999, isAgent: false, lastActive: "Aug 30", status: "Verified Buyer" },
  { id: "USR-07", name: "Karan Patel", email: "karan@example.com", location: "Ahmedabad, GJ", orders: 2, spend: 2598, isAgent: false, lastActive: "Aug 29", status: "Verified Buyer" },
  { id: "USR-08", name: "Browserbase Agent", email: "agent@browserbase.com", location: "Cloud (IN-Central)", orders: 4, spend: 7996, isAgent: true, lastActive: "Aug 29", status: "Active Agent" },
  { id: "USR-09", name: "Sneha Nair", email: "sneha.n@example.com", location: "Kochi, KL", orders: 3, spend: 4497, isAgent: false, lastActive: "Aug 28", status: "Verified Buyer" },
  { id: "USR-10", name: "DeepSeek Assistant", email: "agent@deepseek.com", location: "Cloud (Global)", orders: 5, spend: 9495, isAgent: true, lastActive: "Aug 28", status: "Active Agent" },
  { id: "USR-11", name: "Aditya Roy", email: "aditya.roy@example.com", location: "Kolkata, WB", orders: 2, spend: 2998, isAgent: false, lastActive: "Aug 27", status: "Verified Buyer" },
  { id: "USR-12", name: "Cursor AI Agent", email: "agent@cursor.com", location: "Cloud (US-West)", orders: 4, spend: 7996, isAgent: true, lastActive: "Aug 27", status: "Active Agent" },
];

const DEFAULT_GROWTH_DATA: CustomerGrowthDatum[] = [
  { day: "Aug 16", series: "New Signups", count: 82 },
  { day: "Aug 16", series: "Churned", count: 12 },
  { day: "Aug 18", series: "New Signups", count: 95 },
  { day: "Aug 18", series: "Churned", count: 14 },
  { day: "Aug 20", series: "New Signups", count: 110 },
  { day: "Aug 20", series: "Churned", count: 16 },
  { day: "Aug 22", series: "New Signups", count: 124 },
  { day: "Aug 22", series: "Churned", count: 15 },
  { day: "Aug 24", series: "New Signups", count: 142 },
  { day: "Aug 24", series: "Churned", count: 19 },
  { day: "Aug 26", series: "New Signups", count: 168 },
  { day: "Aug 26", series: "Churned", count: 21 },
  { day: "Aug 28", series: "New Signups", count: 215 },
  { day: "Aug 28", series: "Churned", count: 28 },
  { day: "Aug 31", series: "New Signups", count: 304 },
  { day: "Aug 31", series: "Churned", count: 59 },
];

const DEFAULT_COHORT: CohortAnalysisData = {
  firstTime: {
    count: 17823,
    sharePct: 71.6,
    avgSpend: 1499,
    totalRevenue: 26716677,
  },
  repeat: {
    count: 7069,
    sharePct: 28.4,
    avgSpend: 4257,
    totalRevenue: 30092733,
    repeatCycleDays: 14,
    retentionRate: 12.4,
  },
};

export default function MerchantCustomersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Merchant Account & Multi-Site Binding
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

  // Dynamic Customer Metrics state from API
  const [customerStats, setCustomerStats] = useState({
    totalCustomers: 24892,
    activeCustomers: 18420,
    customerLifetimeValue: 28500,
    newCustomers: 1240,
    churnedCustomers: 184,
    totalGrowthPct: 8.2,
    activeRetentionPct: 12.4,
    clvGrowthPct: 5.4,
    newAcquisitionPct: 18.5,
  });

  const [growthData, setGrowthData] = useState<CustomerGrowthDatum[]>(DEFAULT_GROWTH_DATA);
  const [geoHubs, setGeoHubs] = useState<GeoCityDatum[]>(DEFAULT_INDIA_HUBS);
  const [cohortData, setCohortData] = useState<CohortAnalysisData>(DEFAULT_COHORT);
  const [telemetryCustomers, setTelemetryCustomers] = useState<CustomerRecord[]>([]);

  useEffect(() => {
    async function loadCustomersTelemetry() {
      if (!activeMerchantId) return;
      try {
        const queryUrl = activeSiteId && activeSiteId !== "site_all"
          ? `/api/tracker/stats?site=${encodeURIComponent(activeSiteId)}`
          : "/api/tracker/stats?site=all";

        const res = await fetch(queryUrl);
        if (res.ok) {
          const data = await res.json();
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
              const email = o.isAgent ? "agent@cartwright.ai" : `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`;
              const id = `USR-${String(idx + 1).padStart(4, "0")}`;
              const isAgent = Boolean(o.isAgent || (o.method || "").toLowerCase().includes("agent"));
              const location = o.city ? `${o.city}, IN` : (isAgent ? "Cloud (Telemetry)" : "Bengaluru, KA");

              if (!custMap.has(name)) {
                custMap.set(name, {
                  id,
                  name,
                  email,
                  location,
                  orders: 1,
                  spend: Number(o.amount || 1499),
                  isAgent,
                  lastActive: o.date ? o.date.split("T")[0] : "Recently",
                  status: isAgent ? "Active Agent" : "Verified Buyer",
                });
              } else {
                const existing = custMap.get(name)!;
                existing.orders += 1;
                existing.spend += Number(o.amount || 1499);
              }
            });
            const derived = Array.from(custMap.values());
            if (derived.length > 0) {
              setTelemetryCustomers(derived);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load customer telemetry:", err);
      }
    }
    loadCustomersTelemetry();
  }, [activeMerchantId, activeSiteId]);

  // Combine telemetry with base customers
  const allCustomers = useMemo(() => {
    if (telemetryCustomers.length > 0) {
      const existingNames = new Set(telemetryCustomers.map((c) => c.name));
      const complement = BASE_CUSTOMERS.filter((c) => !existingNames.has(c.name));
      return [...telemetryCustomers, ...complement];
    }
    return BASE_CUSTOMERS;
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
              {customerStats.totalCustomers.toLocaleString()}
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-emerald-500 font-medium whitespace-nowrap">↗ +{customerStats.totalGrowthPct}%</span>
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
              {customerStats.activeCustomers.toLocaleString()}
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-emerald-500 font-medium whitespace-nowrap">↗ +{customerStats.activeRetentionPct}%</span>
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
              {cohortData.firstTime.count.toLocaleString()}
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1 text-muted-foreground">
              <span className="text-blue-400 font-medium whitespace-nowrap">{cohortData.firstTime.sharePct}%</span>
              <span className="text-muted-foreground/60 font-normal">·</span>
              <span className="truncate flex items-center gap-1">
                <span>Avg Spend:</span>
                <FormattedAmount amount={cohortData.firstTime.avgSpend} />
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
              {cohortData.repeat.count.toLocaleString()}
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-emerald-500 font-medium whitespace-nowrap">↗ {cohortData.repeat.sharePct}%</span>
              <span className="text-muted-foreground truncate">+184% basket size</span>
            </div>
          </div>

          {/* 5. CLV (LTV) */}
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r lg:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>CLV (LTV)</span>
              <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              <FormattedAmount amount={customerStats.customerLifetimeValue} />
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-emerald-500 font-medium whitespace-nowrap">↗ +{customerStats.clvGrowthPct}%</span>
              <span className="text-muted-foreground truncate">2.84x multiplier</span>
            </div>
          </div>

          {/* 6. New Customers */}
          <div className="p-4 sm:p-5 flex flex-col justify-between">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>New Customers</span>
              <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              {customerStats.newCustomers.toLocaleString()}
            </div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1">
              <span className="text-emerald-500 font-medium whitespace-nowrap">↗ +{customerStats.newAcquisitionPct}%</span>
              <span className="text-muted-foreground truncate">Accelerating acquisition</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top 2 Insights Grid: Customer Growth & Geographic Distribution (Map of India) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Growth: New Signups & Churn over Time */}
        <CustomerGrowthChart
          data={growthData}
          totalNew={customerStats.newCustomers}
          totalChurn={customerStats.churnedCustomers}
          title="Customer Growth"
        />

        {/* Geographic Distribution: India Map with Metro Hubs */}
        <IndiaMapChart
          hubs={geoHubs}
          title="Geographic Distribution"
        />
      </div>

      {/* Big Unified Card for Customer Directory Table & Controls (Matching Orders Layout) */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
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
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <input
                placeholder="Search customers, emails, cities..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                suppressHydrationWarning
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
              />
            </div>

            {/* Type / Channel Filter */}
            <CustomSelect
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
              <button
                type="button"
                onClick={() => {
                  setTypeFilter("ALL");
                  setSearchTerm("");
                  setCurrentPage(1);
                }}
                className="h-9 rounded-lg border border-border bg-muted/60 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Customers Table View */}
        {filteredCustomers.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-background text-center p-6">
            <Users className="mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">
              {searchTerm ? `No customers matching "${searchTerm}"` : "No customers found"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
              Verified buyer profiles and order spend across channels will appear here.
            </p>
          </div>
        ) : (
          <TooltipProvider delay={100}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b border-border bg-muted/40 text-muted-foreground font-medium text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="w-12 px-4 py-3 font-mono text-muted-foreground">#</th>
                    <th className="px-4 py-3">Customer ID</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Channel / Type</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Orders</th>
                    <th className="px-4 py-3">Total Spend</th>
                    <th className="px-4 py-3 text-right">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-normal">
                  {paginatedCustomers.map((c, index) => {
                    const rowNumber = (safeCurrentPage - 1) * pageSize + index + 1;
                    const isCopied = copiedId === c.id;

                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-muted/40 transition-colors group cursor-default"
                      >
                        <td className="px-4 py-3.5 font-mono text-muted-foreground text-[11px]">
                          {String(rowNumber).padStart(2, "0")}
                        </td>

                        <td className="px-4 py-3.5">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  onClick={(e) => handleCopy(c.id, e)}
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
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="font-medium text-foreground">{c.name}</div>
                          <div className="text-[11px] text-muted-foreground font-normal">{c.email}</div>
                        </td>

                        <td className="px-4 py-3.5">
                          {c.isAgent ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-[11px] font-medium text-purple-400">
                              <Bot className="size-3" /> AI Agent
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-400">
                              <User className="size-3" /> Human
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-muted-foreground">{c.location}</td>

                        <td className="px-4 py-3.5 font-mono font-medium text-foreground">
                          {c.orders}
                        </td>

                        <td className="px-4 py-3.5 font-mono font-semibold text-emerald-500">
                          <FormattedAmount amount={c.spend} />
                        </td>

                        <td className="px-4 py-3.5 text-right font-mono text-muted-foreground">
                          {c.lastActive}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

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
      </div>
    </div>
  );
}
