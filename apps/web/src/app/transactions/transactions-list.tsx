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
} from "lucide-react";

import { trpc } from "@/utils/trpc";
import AuditTrailPanel from "@/components/transactions/audit-trail-panel";
import {
  FormattedAmount,
  formatDate,
  getStatusDetails,
  SegmentedProgressBar,
} from "@/components/transactions/transaction-ui";
import { cn } from "@cartwright/ui/lib/utils";
import { Checkbox } from "@cartwright/ui/components/checkbox";
import { Button } from "@cartwright/ui/components/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@cartwright/ui/components/tooltip";
import { SelectMenu } from "@cartwright/ui/components/select-menu";
import { Card } from "@cartwright/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cartwright/ui/components/table";

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
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Past Orders
            </h1>
          </div>

          {/* Right: Search + Filters + View Toggle (List / Board) */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative w-60 max-sm:w-full">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search orders..."
                className="h-9 w-full rounded-lg border border-border bg-muted pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Store / Merchant Filter */}
            <SelectMenu
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
            <SelectMenu
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
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                title="Reset filters"
              >
                Reset
              </button>
            )}

            {/* View Mode Toggle: List / Board */}
            <div className="inline-flex h-9 items-center rounded-lg bg-muted p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "inline-flex h-full items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors",
                  viewMode === "list"
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:text-foreground"
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
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:text-foreground"
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
          <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground">
            Loading orders...
          </div>
        ) : list.error ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-red-400">
            Could not load orders. Please try refreshing.
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-muted/40 text-center">
            <ShoppingBag className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {searchQuery ? `No orders matching "${searchQuery}"` : "No orders found"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Autonomous purchases and transactions will appear here.
            </p>
          </div>
        ) : viewMode === "list" ? (
          /* Table View */
          <TooltipProvider delay={100}>
            <Card className="rounded-xl border border-border p-0">
              <Table className="text-left text-xs">
                  <TableHeader>
                    <TableRow className="border-border text-[11px] font-semibold tracking-wider text-muted-foreground hover:bg-transparent">
                      <TableHead className="w-12 px-4 py-3.5 font-mono text-muted-foreground">#</TableHead>
                      <TableHead className="px-4 py-3.5">Transaction ID</TableHead>
                      <TableHead className="px-4 py-3.5">Merchant</TableHead>
                      <TableHead className="px-4 py-3.5">Items / Query</TableHead>
                      <TableHead className="px-4 py-3.5">Status</TableHead>
                      <TableHead className="px-4 py-3.5">Fulfillment</TableHead>
                      <TableHead className="px-4 py-3.5">Progress</TableHead>
                      <TableHead className="px-4 py-3.5">Error / Details</TableHead>
                      <TableHead className="px-4 py-3.5">Amount</TableHead>
                      <TableHead className="px-4 py-3.5 text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border font-medium">
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
                          <TableRow
                            onClick={() => setSelectedTxId(isDetailActive ? null : tx.transactionId)}
                            className={cn(
                              "cursor-pointer transition-colors hover:bg-accent/40",
                              isDetailActive ? "bg-accent/50" : isRowSelected ? "bg-muted/50" : ""
                            )}
                          >
                            {/* Row Number */}
                            <TableCell className="px-4 py-4 font-mono text-xs text-muted-foreground font-medium">
                              {rowNumber}
                            </TableCell>

                            {/* Real Transaction ID */}
                            <TableCell className="px-4 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-foreground">
                                  {tx.transactionId.slice(0, 8)}…
                                </span>
                                <Button
                                  type="button"
                                  onClick={(e) => handleCopy(tx.transactionId, e)}
                                  variant="ghost"
                                  size="icon-xs"
                                  className="text-muted-foreground hover:text-foreground"
                                  title="Copy Transaction UUID"
                                >
                                  {isCopied ? (
                                    <Check className="h-3 w-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>

                            {/* Merchant */}
                            <TableCell className="px-4 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-sm text-foreground whitespace-nowrap">
                                  {merchant}
                                </span>
                                {subtitle && (
                                  <span className="text-xs text-muted-foreground font-normal">
                                    {subtitle}
                                  </span>
                                )}
                              </div>
                            </TableCell>

                            {/* Real Items / Search Query */}
                            <TableCell className="max-w-[260px] px-4 py-4 text-foreground">
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <div className="cursor-default">
                                      <span className="line-clamp-2 leading-snug font-normal text-foreground hover:text-foreground transition-colors">
                                        {itemsText}
                                      </span>
                                    </div>
                                  }
                                />
                                <TooltipContent side="top" className="max-w-md bg-popover border border-border text-foreground text-xs p-3 rounded-lg space-y-2 shadow-md">
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">
                                      Item / Product
                                    </span>
                                    <p className="font-semibold text-foreground leading-snug text-xs break-words">
                                      {itemsText}
                                    </p>
                                  </div>
                                  {tx.rawQuery && tx.rawQuery !== itemsText && (
                                    <div className="pt-2 border-t border-border">
                                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">
                                        Search Query
                                      </span>
                                      <p className="text-foreground text-xs font-normal break-words">
                                        &quot;{tx.rawQuery}&quot;
                                      </p>
                                    </div>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>

                            {/* Status (e.g. Paid / Pending / Failed) */}
                            <TableCell className="px-4 py-4 whitespace-nowrap">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                                  details.statusTone
                                )}
                              >
                                {details.statusLabel}
                              </span>
                            </TableCell>

                            {/* Fulfillment (e.g. Delivered / In Transit / Processing / Cancelled) */}
                            <TableCell className="px-4 py-4 whitespace-nowrap">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                                  details.fulfillmentTone
                                )}
                              >
                                {details.fulfillmentLabel}
                              </span>
                            </TableCell>

                            {/* Progress Segments */}
                            <TableCell className="px-4 py-4 whitespace-nowrap">
                              <SegmentedProgressBar percent={details.progressPercent} />
                            </TableCell>

                            {/* Error / Failure Details (Swapped with Payment) */}
                            <TableCell className="max-w-[240px] px-4 py-4">
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
                                  <TooltipContent side="top" className="max-w-md bg-rose-50 dark:bg-rose-950/95 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-100 text-xs p-3 rounded-lg shadow-md">
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-300 font-bold">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        <span>Failure / Policy Error</span>
                                      </div>
                                      <p className="text-xs text-rose-700 dark:text-rose-100 leading-relaxed font-medium">{tx.failureReason}</p>
                                      <p className="text-[10px] text-rose-500 dark:text-rose-300/70 font-mono">Status: {tx.status}</p>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>

                            {/* Amount */}
                            <TableCell className="px-4 py-4 whitespace-nowrap">
                              <FormattedAmount minor={tx.amountInMinor} currency={tx.currency} />
                            </TableCell>

                            {/* Date */}
                            <TableCell className="px-4 py-4 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                              {formatDate(tx.createdAt)}
                            </TableCell>
                          </TableRow>

                          {/* Inline Audit Trail Subrow */}
                          {isDetailActive && (
                            <TableRow className="bg-accent/50 border-b border-border hover:bg-accent/50">
                              <TableCell colSpan={10} className="pl-16 pr-6 py-4">
                                <AuditTrailPanel audit={audit} />
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
                      "group relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-border cursor-pointer space-y-3.5",
                      isDetailActive
                        ? "border-border bg-accent/40 ring-1 ring-border/30"
                        : isRowSelected
                        ? "border-border bg-muted"
                        : ""
                    )}
                  >
                    {/* Top Row: Order ID + Status Pill + Number */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-foreground">
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

                      <span className="font-mono text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                        #{rowNumber}
                      </span>
                    </div>

                    {/* Merchant & Subtitle */}
                    <div>
                      <h3 className="text-sm font-bold text-foreground tracking-tight">
                        {merchant}
                      </h3>
                      {subtitle && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          {subtitle}
                        </p>
                      )}
                    </div>

                    {/* Items / Query Section */}
                    <div>
                      <span className="text-xs text-muted-foreground block mb-0.5">Items / Query</span>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <p className="text-xs font-semibold text-foreground line-clamp-1">
                              {itemsText}
                            </p>
                          }
                        />
                        <TooltipContent
                          side="top"
                          className="max-w-md bg-popover border border-border text-foreground text-xs p-3 rounded-lg space-y-2 shadow-md"
                        >
                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">
                              Item / Product
                            </span>
                            <p className="font-semibold text-foreground leading-snug text-xs break-words">
                              {itemsText}
                            </p>
                          </div>
                          {tx.rawQuery && tx.rawQuery !== itemsText && (
                            <div className="pt-2 border-t border-border">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">
                                Search Query
                              </span>
                              <p className="text-foreground text-xs font-normal break-words">
                                &quot;{tx.rawQuery}&quot;
                              </p>
                            </div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Fulfillment */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
                      <span className="text-muted-foreground">Fulfillment</span>
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
                      <span className="text-muted-foreground">Progress</span>
                      <SegmentedProgressBar percent={details.progressPercent} />
                    </div>

                    {/* Error / Details */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Error / Details</span>
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
                            className="max-w-xs bg-rose-50 dark:bg-rose-950/95 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-100 text-xs p-2.5 rounded-lg shadow-md"
                          >
                            <p className="font-semibold text-rose-600 dark:text-rose-300 mb-1">Failure Reason</p>
                            <p className="text-rose-700 dark:text-rose-100">{tx.failureReason}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* Bottom: Date and Amount */}
                    <div className="flex items-center justify-between pt-2.5 border-t border-border text-xs">
                      <span className="font-mono text-muted-foreground">
                        {formatDate(tx.createdAt)}
                      </span>
                      <FormattedAmount minor={tx.amountInMinor} currency={tx.currency} />
                    </div>

                    {/* Inline Audit Trail in Board Card */}
                    {isDetailActive && (
                      <div
                        className="pt-3 border-t border-border"
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
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div>
                Showing{" "}
                <span className="font-semibold text-foreground">
                  {(safeCurrentPage - 1) * pageSize + 1}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-foreground">
                  {Math.min(safeCurrentPage * pageSize, filteredTransactions.length)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-foreground">
                  {filteredTransactions.length}
                </span>{" "}
                orders
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
                className="h-9 px-3 rounded-lg border border-border bg-muted text-xs text-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                <span>Previous</span>
              </Button>

              <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
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
                          ? "bg-accent text-foreground"
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
                className="h-9 px-3 rounded-lg border border-border bg-muted text-xs text-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
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
