"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, Fragment } from "react";
import {
  Search,
  List as ListIcon,
  LayoutGrid,
  ShoppingBag,
  ShieldCheck,
  X,
  Copy,
  Check,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

import { trpc } from "@/utils/trpc";
import { cn } from "@cartwright/ui/lib/utils";
import { Checkbox } from "@cartwright/ui/components/checkbox";
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

function FormattedAmount({
  minor,
  currency,
  className,
}: {
  minor: number;
  currency: string;
  className?: string;
}) {
  const parts = useMemo(() => {
    try {
      const activeCurrency = currency || "INR";
      const formatter = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: activeCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const formattedParts = formatter.formatToParts(minor / 100);
      const currencySymbol =
        formattedParts.find((p) => p.type === "currency")?.value ||
        (activeCurrency === "INR" ? "₹" : "$");
      const numberValue = formattedParts
        .filter((p) => p.type !== "currency")
        .map((p) => p.value)
        .join("")
        .trim();
      return { symbol: currencySymbol, number: numberValue };
    } catch {
      return {
        symbol: currency === "USD" ? "$" : "₹",
        number: (minor / 100).toFixed(2),
      };
    }
  }, [minor, currency]);

  return (
    <span className={cn("font-mono text-sm whitespace-nowrap", className)}>
      <span className="font-normal text-zinc-400 mr-0.5">{parts.symbol}</span>
      <span className="font-bold text-zinc-100">{parts.number}</span>
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
              "inline-flex w-auto items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/90 text-xs font-medium text-zinc-200 shadow-xs transition-colors hover:border-zinc-700 hover:bg-zinc-800/80 focus:border-zinc-700 focus:outline-none cursor-pointer whitespace-nowrap shrink-0",
              size === "sm" ? "h-7 px-2.5" : "h-9 px-3",
              className
            )}
          >
            <span>{selected ? selected.label : placeholder}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          </button>
        }
      />
      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="z-50 w-max min-w-full rounded-xl border border-zinc-800 bg-[#18181b] p-1 shadow-2xl text-xs text-zinc-200 backdrop-blur-md"
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
                    ? "bg-zinc-800 text-white font-semibold"
                    : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
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

function formatDate(dateInput: string | Date): string {
  try {
    const d = new Date(dateInput);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return "";
  }
}

function getStatusDetails(status: string) {
  const norm = (status || "").toUpperCase();
  switch (norm) {
    case "PAYMENT_SUCCEEDED":
    case "APPROVED":
      return {
        statusLabel: "Paid",
        statusTone: "bg-emerald-950/60 border-emerald-500/40 text-emerald-400",
        dotColor: "bg-emerald-400",
        fulfillmentLabel: "Delivered",
        fulfillmentTone: "bg-zinc-900 border-zinc-700/80 text-zinc-200",
        progressPercent: 100,
        boardColumn: "Delivered",
      };
    case "PAYMENT_PROCESSING":
      return {
        statusLabel: "Paid",
        statusTone: "bg-emerald-950/60 border-emerald-500/40 text-emerald-400",
        dotColor: "bg-emerald-400",
        fulfillmentLabel: "In Transit",
        fulfillmentTone: "bg-zinc-900 border-zinc-700/80 text-zinc-200",
        progressPercent: 80,
        boardColumn: "In Transit",
      };
    case "POLICY_CHECKING":
    case "AWAITING_APPROVAL":
    case "ACTIVE":
    case "CREATED":
      return {
        statusLabel: "Pending",
        statusTone: "bg-amber-950/60 border-amber-500/40 text-amber-400",
        dotColor: "bg-amber-400",
        fulfillmentLabel: norm === "AWAITING_APPROVAL" ? "Awaiting Approval" : "Processing",
        fulfillmentTone: "bg-zinc-900 border-zinc-700/80 text-zinc-200",
        progressPercent: norm === "AWAITING_APPROVAL" ? 40 : 20,
        boardColumn: "Pending",
      };
    case "PAYMENT_FAILED":
    case "POLICY_BLOCKED":
    case "PRICE_CHANGED":
    case "CANCELLED":
    default:
      return {
        statusLabel: "Failed",
        statusTone: "bg-rose-950/60 border-rose-500/40 text-rose-400",
        dotColor: "bg-rose-400",
        fulfillmentLabel: norm === "CANCELLED" ? "Cancelled" : norm === "PRICE_CHANGED" ? "Price Changed" : "Blocked",
        fulfillmentTone: "bg-zinc-900 border-zinc-700/80 text-zinc-200",
        progressPercent: 0,
        boardColumn: "Failed",
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
              i < filledBars ? "bg-white" : "bg-zinc-700/70"
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

function getEventBadge(eventType: string) {
  const norm = (eventType || "").toUpperCase();
  const isFailure =
    norm.includes("FAIL") ||
    norm.includes("BLOCK") ||
    norm.includes("REJECT") ||
    norm.includes("ERROR") ||
    norm.includes("CANCEL");

  if (isFailure) {
    return {
      dotBg: "bg-rose-500",
      ringColor: "ring-rose-500/20",
      textColor: "text-rose-400",
      badgeBg: "bg-rose-950/40 border-rose-800/50 text-rose-300",
    };
  }

  return {
    dotBg: "bg-zinc-500",
    ringColor: "ring-zinc-700/30",
    textColor: "text-zinc-300",
    badgeBg: "bg-zinc-900/90 border-zinc-750 border-zinc-700/60 text-zinc-300",
  };
}

function AuditTrailPanel({
  audit,
}: {
  transaction?: any;
  audit: any;
  onClose?: () => void;
}) {
  const [expandedPayloads, setExpandedPayloads] = useState<Record<string, boolean>>({});

  const togglePayload = (id: string) => {
    setExpandedPayloads((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const sortedEvents = useMemo(() => {
    if (!audit.data || !Array.isArray(audit.data)) return [];
    return [...audit.data].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [audit.data]);

  return (
    <div className="text-xs">
      {/* Timeline view */}
      {audit.isLoading ? (
        <div className="flex items-center gap-2 py-4 text-zinc-400 pl-4">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
          <span>Fetching event timeline…</span>
        </div>
      ) : sortedEvents.length === 0 ? (
        <p className="py-4 text-zinc-500 pl-4">No audit events recorded for this transaction.</p>
      ) : (
        <div className="space-y-0">
          {sortedEvents.map((event: any, idx: number) => {
            const eventId = String(event.id || idx);
            const style = getEventBadge(event.eventType);
            const hasMetadata =
              event.metadata && Object.keys(event.metadata).length > 0;
            const isPayloadOpen = Boolean(expandedPayloads[eventId]);
            const isLast = idx === sortedEvents.length - 1;

            return (
              <div key={eventId} className="relative flex items-start gap-3.5 pb-4 last:pb-0.5">
                {/* Continuous connecting vertical line to next dot */}
                {!isLast && (
                  <div className="absolute left-[5px] top-[14px] bottom-0 w-[1.5px] bg-zinc-600/70 z-0" />
                )}

                {/* Node Dot */}
                <div
                  className={cn(
                    "h-3 w-3 rounded-full ring-4 bg-zinc-800 transition-all shrink-0 mt-0.5 z-10",
                    style.dotBg,
                    style.ringColor
                  )}
                />

                {/* Event Content */}
                <div className="grow min-w-0">
                  <div
                    onClick={() => hasMetadata && togglePayload(eventId)}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 p-1 -m-1 rounded-lg transition-colors",
                      hasMetadata ? "cursor-pointer hover:bg-zinc-900/60" : "cursor-default"
                    )}
                    title={hasMetadata ? "Click to view event payload details" : undefined}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "font-mono font-semibold text-[11px] px-2 py-0.5 rounded-md border inline-flex items-center gap-1.5 transition-colors shrink-0",
                          style.badgeBg,
                          hasMetadata && "hover:border-zinc-500"
                        )}
                      >
                        <span>{event.eventType}</span>
                        {hasMetadata && (
                          <ChevronDown
                            className={cn(
                              "h-3 w-3 text-zinc-400 transition-transform duration-200",
                              isPayloadOpen ? "rotate-180" : "rotate-0"
                            )}
                          />
                        )}
                      </span>
                      {event.reason && (
                        <span className="text-zinc-300 font-medium text-xs truncate">
                          {event.reason}
                        </span>
                      )}
                    </div>

                    <span className="font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {/* Metadata payload expandable */}
                  {hasMetadata && isPayloadOpen && (
                    <div className="mt-2">
                      <pre className="rounded-lg bg-zinc-950/90 border border-zinc-800/80 p-3 font-mono text-[11px] text-zinc-300 overflow-x-auto leading-relaxed shadow-inner animate-in fade-in-0 duration-150">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TransactionsList() {
  const list = useQuery({
    ...trpc.transactions.list.queryOptions(),
    refetchOnMount: true,
  });
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [merchantFilter, setMerchantFilter] = useState<string>("ALL");

  const audit = useQuery(
    trpc.transactions.audit.queryOptions(
      { transactionId: selectedTxId! },
      { enabled: selectedTxId !== null },
    ),
  );

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const availableMerchants = useMemo(() => {
    if (!list.data) return [];
    const set = new Set<string>();
    for (const tx of list.data) {
      const name = tx.merchantName ?? tx.merchantId;
      if (name) set.add(name);
    }
    return Array.from(set).sort();
  }, [list.data]);

  const filteredTransactions = useMemo(() => {
    if (!list.data) return [];
    return list.data.filter((tx) => {
      // 1. Search Query
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const merchant = (tx.merchantName ?? tx.merchantId ?? "").toLowerCase();
        const id = tx.transactionId.toLowerCase();
        const items = (tx.items ?? tx.rawQuery ?? "").toLowerCase();
        const status = tx.status.toLowerCase();
        const failure = (tx.failureReason ?? "").toLowerCase();
        const matches =
          merchant.includes(q) ||
          id.includes(q) ||
          items.includes(q) ||
          status.includes(q) ||
          failure.includes(q);
        if (!matches) return false;
      }

      // 2. Status Filter
      if (statusFilter !== "ALL") {
        const details = getStatusDetails(tx.status);
        if (details.statusLabel.toUpperCase() !== statusFilter.toUpperCase()) {
          return false;
        }
      }

      // 3. Merchant / Store Filter
      if (merchantFilter !== "ALL") {
        const txMerchant = tx.merchantName ?? tx.merchantId;
        if (txMerchant !== merchantFilter) {
          return false;
        }
      }

      return true;
    });
  }, [list.data, searchQuery, statusFilter, merchantFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedTransactions = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, safeCurrentPage, pageSize]);

  const allSelected =
    paginatedTransactions.length > 0 &&
    paginatedTransactions.every((tx) => selectedRowIds.has(tx.transactionId));

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        for (const tx of paginatedTransactions) {
          next.delete(tx.transactionId);
        }
        return next;
      });
    } else {
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        for (const tx of paginatedTransactions) {
          next.add(tx.transactionId);
        }
        return next;
      });
    }
  };

  const handleToggleRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedTransaction = useMemo(() => {
    return list.data?.find((tx) => tx.transactionId === selectedTxId);
  }, [list.data, selectedTxId]);

  return (
    <div className="w-full text-foreground p-6 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Top Header Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: Icon Box + Title */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-300 shadow-xs">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Past Orders
            </h1>
          </div>

          {/* Right: Search + Filters + View Toggle (List / Board) */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative w-60 max-sm:w-full">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search orders..."
                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900/90 pl-9 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-700"
              />
            </div>

            {/* Store / Merchant Filter */}
            <CustomSelect
              value={merchantFilter}
              onChange={(val) => {
                setMerchantFilter(val);
                setCurrentPage(1);
              }}
              options={[
                { value: "ALL", label: "All Stores" },
                ...availableMerchants.map((m) => ({ value: m, label: m })),
              ]}
            />

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
                { value: "PENDING", label: "Pending" },
                { value: "FAILED", label: "Failed" },
              ]}
            />

            {/* Reset Filters button if any active */}
            {(statusFilter !== "ALL" || merchantFilter !== "ALL" || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("ALL");
                  setMerchantFilter("ALL");
                  setSearchQuery("");
                  setCurrentPage(1);
                }}
                className="h-9 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Reset filters"
              >
                Reset
              </button>
            )}

            {/* View Mode Toggle: List / Board */}
            <div className="inline-flex h-9 items-center rounded-lg border border-zinc-800 bg-zinc-900/90 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "inline-flex h-full items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors",
                  viewMode === "list"
                    ? "bg-zinc-800 text-white shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <ListIcon className="h-3.5 w-3.5" />
                <span>List</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("board")}
                className={cn(
                  "inline-flex h-full items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors",
                  viewMode === "board"
                    ? "bg-zinc-800 text-white shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Board</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content Section */}
        {list.isLoading ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/40 text-sm text-zinc-400">
            Loading orders...
          </div>
        ) : list.error ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/40 text-sm text-red-400">
            Could not load orders. Please try refreshing.
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/40 text-center">
            <ShoppingBag className="mb-2 h-8 w-8 text-zinc-600" />
            <p className="text-sm font-medium text-zinc-300">
              {searchQuery ? `No orders matching "${searchQuery}"` : "No orders found"}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Autonomous purchases and transactions will appear here.
            </p>
          </div>
        ) : viewMode === "list" ? (
          /* Table View */
          <TooltipProvider delay={100}>
            <div className="rounded-xl border border-zinc-800/80 bg-[#161616]/90 shadow-2xl">
              <div>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800/80 text-[11px] font-semibold tracking-wider text-zinc-400">
                      <th className="w-12 px-4 py-3.5 font-mono text-zinc-500">#</th>
                      <th className="px-4 py-3.5">Transaction ID</th>
                      <th className="px-4 py-3.5">Merchant</th>
                      <th className="px-4 py-3.5">Items / Query</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5">Fulfillment</th>
                      <th className="px-4 py-3.5">Progress</th>
                      <th className="px-4 py-3.5">Error / Details</th>
                      <th className="px-4 py-3.5">Amount</th>
                      <th className="px-4 py-3.5 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-medium">
                    {paginatedTransactions.map((tx, index) => {
                      const rowNumber = (safeCurrentPage - 1) * pageSize + index + 1;
                      const isRowSelected = selectedRowIds.has(tx.transactionId);
                      const isDetailActive = selectedTxId === tx.transactionId;
                      const merchant = tx.merchantName ?? tx.merchantId ?? "Merchant";
                      const subtitle = tx.merchantId ?? tx.currency;
                      const itemsText = tx.items || tx.rawQuery || (tx.merchantName ? `${tx.merchantName} Item` : "Selected Product");
                      const details = getStatusDetails(tx.status);
                      const isCopied = copiedId === tx.transactionId;

                      return (
                        <Fragment key={tx.transactionId}>
                          <tr
                            onClick={() => setSelectedTxId(isDetailActive ? null : tx.transactionId)}
                            className={cn(
                              "cursor-pointer transition-colors hover:bg-zinc-800/40",
                              isDetailActive ? "bg-zinc-800/50" : isRowSelected ? "bg-zinc-900/50" : ""
                            )}
                          >
                            {/* Row Number */}
                            <td className="px-4 py-4 font-mono text-xs text-zinc-500 font-medium">
                              {rowNumber}
                            </td>

                            {/* Real Transaction ID */}
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-zinc-100">
                                  {tx.transactionId.slice(0, 8)}…
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleCopy(tx.transactionId, e)}
                                  className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors"
                                  title="Copy Transaction UUID"
                                >
                                  {isCopied ? (
                                    <Check className="h-3 w-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              </div>
                            </td>

                            {/* Merchant */}
                            <td className="px-4 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-sm text-zinc-100 whitespace-nowrap">
                                  {merchant}
                                </span>
                                {subtitle && (
                                  <span className="text-xs text-zinc-500 font-normal">
                                    {subtitle}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Real Items / Search Query */}
                            <td className="px-4 py-4 text-zinc-300 max-w-[260px]">
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <div className="cursor-default">
                                      <span className="line-clamp-2 leading-snug font-normal text-zinc-200 hover:text-white transition-colors">
                                        {itemsText}
                                      </span>
                                    </div>
                                  }
                                />
                                <TooltipContent side="top" className="max-w-md bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs p-3 rounded-lg shadow-2xl space-y-2">
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-0.5">
                                      Item / Product
                                    </span>
                                    <p className="font-semibold text-zinc-100 leading-snug text-xs break-words">
                                      {itemsText}
                                    </p>
                                  </div>
                                  {tx.rawQuery && tx.rawQuery !== itemsText && (
                                    <div className="pt-2 border-t border-zinc-800">
                                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-0.5">
                                        Search Query
                                      </span>
                                      <p className="text-zinc-300 text-xs font-normal break-words">
                                        &quot;{tx.rawQuery}&quot;
                                      </p>
                                    </div>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </td>

                            {/* Status (e.g. Paid / Pending / Failed) */}
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                                  details.statusTone
                                )}
                              >
                                {details.statusLabel}
                              </span>
                            </td>

                            {/* Fulfillment (e.g. Delivered / In Transit / Processing / Cancelled) */}
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                                  details.fulfillmentTone
                                )}
                              >
                                {details.fulfillmentLabel}
                              </span>
                            </td>

                            {/* Progress Segments */}
                            <td className="px-4 py-4 whitespace-nowrap">
                              <SegmentedProgressBar percent={details.progressPercent} />
                            </td>

                            {/* Error / Failure Details (Swapped with Payment) */}
                            <td className="px-4 py-4 max-w-[240px]">
                              {tx.failureReason ? (
                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <div className="flex items-start gap-1.5 text-rose-400 cursor-default">
                                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                        <span className="line-clamp-2 text-xs font-medium leading-tight hover:text-rose-300 transition-colors">
                                          {tx.failureReason}
                                        </span>
                                      </div>
                                    }
                                  />
                                  <TooltipContent side="top" className="max-w-md bg-rose-950/95 border border-rose-800 text-rose-100 text-xs p-3 rounded-lg shadow-2xl">
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-1.5 text-rose-300 font-bold">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        <span>Failure / Policy Error</span>
                                      </div>
                                      <p className="text-xs text-rose-100 leading-relaxed font-medium">{tx.failureReason}</p>
                                      <p className="text-[10px] text-rose-300/70 font-mono">Status: {tx.status}</p>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-zinc-500 text-xs">—</span>
                              )}
                            </td>

                            {/* Amount */}
                            <td className="px-4 py-4 whitespace-nowrap">
                              <FormattedAmount minor={tx.amountInMinor} currency={tx.currency} />
                            </td>

                            {/* Date */}
                            <td className="px-4 py-4 text-right font-mono text-xs text-zinc-400 whitespace-nowrap">
                              {formatDate(tx.createdAt)}
                            </td>
                          </tr>

                          {/* Inline Audit Trail Subrow */}
                          {isDetailActive && (
                            <tr className="bg-zinc-800/50 border-b border-zinc-800/80">
                              <td colSpan={10} className="pl-16 pr-6 py-4">
                                <AuditTrailPanel audit={audit} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </TooltipProvider>
        ) : (
          /* Card Grid Board View */
          <TooltipProvider delay={100}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedTransactions.map((tx, index) => {
                const rowNumber = (safeCurrentPage - 1) * pageSize + index + 1;
                const isRowSelected = selectedRowIds.has(tx.transactionId);
                const isDetailActive = selectedTxId === tx.transactionId;
                const details = getStatusDetails(tx.status);
                const merchant = tx.merchantName ?? tx.merchantId ?? "Merchant";
                const subtitle = tx.merchantId ?? tx.currency ?? "";
                const itemsText =
                  tx.items ||
                  tx.rawQuery ||
                  (tx.merchantName ? `${tx.merchantName} Item` : "Selected Product");

                return (
                  <div
                    key={tx.transactionId}
                    onClick={() => setSelectedTxId(isDetailActive ? null : tx.transactionId)}
                    className={cn(
                      "group relative flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-[#161616]/90 p-5 shadow-2xl transition-all hover:border-zinc-700/80 cursor-pointer space-y-3.5",
                      isDetailActive
                        ? "border-zinc-500 bg-zinc-800/40 ring-1 ring-zinc-500/30"
                        : isRowSelected
                        ? "border-zinc-700 bg-zinc-900/60"
                        : ""
                    )}
                  >
                    {/* Top Row: Order ID + Status Pill + Number */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-zinc-100">
                          {tx.transactionId.slice(0, 8)}…
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                            details.statusTone
                          )}
                        >
                          {details.statusLabel}
                        </span>
                      </div>

                      <span className="font-mono text-xs font-semibold text-zinc-500 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800">
                        #{rowNumber}
                      </span>
                    </div>

                    {/* Merchant & Subtitle */}
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight">
                        {merchant}
                      </h3>
                      {subtitle && (
                        <p className="text-xs text-zinc-400 font-mono mt-0.5">
                          {subtitle}
                        </p>
                      )}
                    </div>

                    {/* Items / Query Section */}
                    <div>
                      <span className="text-xs text-zinc-500 block mb-0.5">Items / Query</span>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <p className="text-xs font-semibold text-zinc-200 line-clamp-1">
                              {itemsText}
                            </p>
                          }
                        />
                        <TooltipContent
                          side="top"
                          className="max-w-md bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs p-3 rounded-lg shadow-2xl space-y-2"
                        >
                          <div>
                            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-0.5">
                              Item / Product
                            </span>
                            <p className="font-semibold text-zinc-100 leading-snug text-xs break-words">
                              {itemsText}
                            </p>
                          </div>
                          {tx.rawQuery && tx.rawQuery !== itemsText && (
                            <div className="pt-2 border-t border-zinc-800">
                              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-0.5">
                                Search Query
                              </span>
                              <p className="text-zinc-300 text-xs font-normal break-words">
                                &quot;{tx.rawQuery}&quot;
                              </p>
                            </div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Fulfillment */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/60">
                      <span className="text-zinc-500">Fulfillment</span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                          details.fulfillmentTone
                        )}
                      >
                        {details.fulfillmentLabel}
                      </span>
                    </div>

                    {/* Progress */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Progress</span>
                      <SegmentedProgressBar percent={details.progressPercent} />
                    </div>

                    {/* Error / Details */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Error / Details</span>
                      {tx.failureReason ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <div className="flex items-center gap-1 text-rose-400 max-w-[190px]">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                <span className="truncate text-xs font-medium">
                                  {tx.failureReason}
                                </span>
                              </div>
                            }
                          />
                          <TooltipContent
                            side="top"
                            className="max-w-xs bg-rose-950/95 border border-rose-800 text-rose-100 text-xs p-2.5 rounded-lg shadow-xl"
                          >
                            <p className="font-semibold text-rose-300 mb-1">Failure Reason</p>
                            <p>{tx.failureReason}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </div>

                    {/* Bottom: Date and Amount */}
                    <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800/60 text-xs">
                      <span className="font-mono text-zinc-400">
                        {formatDate(tx.createdAt)}
                      </span>
                      <FormattedAmount minor={tx.amountInMinor} currency={tx.currency} />
                    </div>

                    {/* Inline Audit Trail in Board Card */}
                    {isDetailActive && (
                      <div
                        className="pt-3 border-t border-zinc-700/60"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <AuditTrailPanel audit={audit} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TooltipProvider>
        )}

        {/* Separate Bottom Pagination Bar for both views */}
        {filteredTransactions.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
            {/* Left: Count & Page Size Selector */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              <div>
                Showing{" "}
                <span className="font-semibold text-zinc-200">
                  {(safeCurrentPage - 1) * pageSize + 1}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-zinc-200">
                  {Math.min(safeCurrentPage * pageSize, filteredTransactions.length)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-zinc-200">
                  {filteredTransactions.length}
                </span>{" "}
                orders
              </div>

              <div className="h-3.5 w-px bg-zinc-800 hidden sm:block" />

              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400">Rows per page:</span>
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
                className="h-9 px-3 rounded-lg border border-zinc-800 bg-zinc-900/90 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                <span>Previous</span>
              </Button>

              <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/90 p-0.5">
                {Array.from({ length: totalPages }).map((_, i) => {
                  const pageNum = i + 1;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={cn(
                        "h-8 min-w-8 rounded-md px-2.5 text-xs font-semibold transition-colors",
                        safeCurrentPage === pageNum
                          ? "bg-zinc-800 text-white shadow-xs"
                          : "text-zinc-400 hover:text-zinc-200"
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
                className="h-9 px-3 rounded-lg border border-zinc-800 bg-zinc-900/90 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
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
