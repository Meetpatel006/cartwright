"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ShieldAlert,
  Building2,
  Lock,
  Save,
  Plus,
  X,
  Sparkles,
  Info,
  CheckCircle2,
  Ban,
  Gauge,
  SlidersHorizontal,
  Pencil,
  Trash2,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@cartwright/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cartwright/ui/components/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cartwright/ui/components/table";
import { cn } from "@cartwright/ui/lib/utils";
import { trpc } from "@/utils/trpc";

function formatRupees(amountInMajor: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amountInMajor);
}

function parseInputToRupees(val: string): number {
  const clean = val.replace(/[^0-9.]/g, "");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

const TX_PRESETS = [
  { label: "₹2,500", value: 2500, tier: "Micro" },
  { label: "₹5,000", value: 5000, tier: "Standard" },
  { label: "₹10,000", value: 10000, tier: "Recommended" },
  { label: "₹25,000", value: 25000, tier: "Elevated" },
  { label: "₹50,000", value: 50000, tier: "High Cap" },
  { label: "₹1,50,000", value: 150000, tier: "Max Wallet" },
];

const TOTAL_PRESETS = [
  { label: "₹10,000", value: 10000 },
  { label: "₹25,000", value: 25000 },
  { label: "₹50,000", value: 50000 },
  { label: "₹1,00,000", value: 100000 },
  { label: "₹2,50,000", value: 250000 },
];

const SUGGESTED_WHITELIST = [
  { name: "Flipkart", id: "flipkart" },
  { name: "Amazon India", id: "amazon india" },
  { name: "Nike India", id: "nike india" },
  { name: "Myntra", id: "myntra" },
  { name: "Zomato", id: "zomato" },
  { name: "Swiggy", id: "swiggy" },
  { name: "Croma", id: "croma" },
];

export default function PolicySettings() {
  const policy = useQuery(trpc.policies.get.queryOptions());

  type ActiveDialog = "limits" | "safety" | "merchants" | null;

  // Active dialog state
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);

  // Form values in whole Rupees (major currency units)
  const [maxTxRupees, setMaxTxRupees] = useState<string>("");
  const [maxTotalRupees, setMaxTotalRupees] = useState<string>("");
  const [currency, setCurrency] = useState("INR");
  const [requireUserApproval, setRequireUserApproval] = useState(false);
  const [allowedMerchants, setAllowedMerchants] = useState<string[]>([]);
  const [blockedMerchants, setBlockedMerchants] = useState<string[]>([]);
  const [frequencyLimit, setFrequencyLimit] = useState<string>("");

  // Merchant dialog input states (action selection + name input)
  const [merchantAction, setMerchantAction] = useState<"whitelist" | "blacklist">("whitelist");
  const [merchantInput, setMerchantInput] = useState("");

  const [seeded, setSeeded] = useState(false);

  const syncFormFromData = () => {
    if (!policy.data) return;
    setMaxTxRupees(String(policy.data.maxTransactionAmount / 100));
    setMaxTotalRupees(String(policy.data.maxTotalSpending / 100));
    setCurrency(policy.data.currency || "INR");
    setRequireUserApproval(Boolean(policy.data.requireUserApproval));
    setAllowedMerchants(policy.data.allowedMerchants ?? []);
    setBlockedMerchants(policy.data.blockedMerchants ?? []);
    setFrequencyLimit(
      policy.data.frequencyLimit === null || policy.data.frequencyLimit === undefined
        ? ""
        : String(policy.data.frequencyLimit)
    );
    setMerchantInput("");
  };

  useEffect(() => {
    if (policy.data && !seeded) {
      syncFormFromData();
      setSeeded(true);
    }
  }, [policy.data, seeded]);

  const update = useMutation(
    trpc.policies.update.mutationOptions({
      onSuccess: () => {
        policy.refetch();
        setActiveDialog(null);
        toast.success("Spending policy guardrails updated successfully");
      },
      onError: (err) => {
        toast.error(`Failed to update policy: ${err.message}`);
      },
    })
  );

  const numMaxTx = parseInputToRupees(maxTxRupees);
  const numMaxTotal = parseInputToRupees(maxTotalRupees);
  const currentSavedTx = (policy.data?.maxTransactionAmount ?? 0) / 100;
  const currentSavedTotal = (policy.data?.maxTotalSpending ?? 0) / 100;
  const consumedRupees = (policy.data?.consumedInMinor ?? 0) / 100;
  const utilizationPercent =
    currentSavedTotal > 0
      ? Math.min(100, Math.round((consumedRupees / currentSavedTotal) * 100))
      : 0;

  const handleOpenDialog = (dialog: ActiveDialog, initialAction?: "whitelist" | "blacklist") => {
    syncFormFromData();
    if (initialAction) {
      setMerchantAction(initialAction);
    }
    setActiveDialog(dialog);
  };

  const handleCloseDialog = () => {
    syncFormFromData();
    setActiveDialog(null);
  };

  const handleAddMerchantRule = (name?: string, forcedAction?: "whitelist" | "blacklist") => {
    const target = (name ?? merchantInput).trim().toLowerCase();
    if (!target) return;
    const action = forcedAction ?? merchantAction;

    if (action === "whitelist") {
      if (!allowedMerchants.includes(target)) {
        setAllowedMerchants((prev) => [...prev, target]);
      }
      setBlockedMerchants((prev) => prev.filter((m) => m !== target));
    } else {
      if (!blockedMerchants.includes(target)) {
        setBlockedMerchants((prev) => [...prev, target]);
      }
      setAllowedMerchants((prev) => prev.filter((m) => m !== target));
    }

    if (!name) setMerchantInput("");
  };

  const handleRemoveMerchantRule = (name: string, action: "whitelist" | "blacklist") => {
    if (action === "whitelist") {
      setAllowedMerchants((prev) => prev.filter((m) => m !== name));
    } else {
      setBlockedMerchants((prev) => prev.filter((m) => m !== name));
    }
  };

  const handleDeleteRuleDirect = (name: string, type: "whitelist" | "blacklist") => {
    if (!policy.data) return;
    const newAllowed =
      type === "whitelist"
        ? (policy.data.allowedMerchants ?? []).filter((m) => m !== name)
        : policy.data.allowedMerchants ?? [];
    const newBlocked =
      type === "blacklist"
        ? (policy.data.blockedMerchants ?? []).filter((m) => m !== name)
        : policy.data.blockedMerchants ?? [];

    update.mutate({
      maxTransactionAmount: policy.data.maxTransactionAmount,
      maxTotalSpending: policy.data.maxTotalSpending,
      currency: policy.data.currency || "INR",
      requireUserApproval: Boolean(policy.data.requireUserApproval),
      allowedMerchants: newAllowed,
      blockedMerchants: newBlocked,
      frequencyLimit: policy.data.frequencyLimit,
    });
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const txPaisa = Math.round(numMaxTx * 100);
    const totalPaisa = Math.round(numMaxTotal * 100);

    if (txPaisa <= 0) {
      toast.error("Max per-order limit must be greater than 0");
      return;
    }
    if (totalPaisa <= 0) {
      toast.error("Total budget cap must be greater than 0");
      return;
    }
    if (totalPaisa < (policy.data?.consumedInMinor ?? 0)) {
      toast.error(
        `Total budget cannot be set lower than already consumed spending (${formatRupees(
          consumedRupees
        )})`
      );
      return;
    }

    update.mutate({
      maxTransactionAmount: txPaisa,
      maxTotalSpending: totalPaisa,
      currency: "INR",
      requireUserApproval,
      allowedMerchants,
      blockedMerchants,
      frequencyLimit:
        frequencyLimit.trim() === "" ? null : Number.parseInt(frequencyLimit, 10),
    });
  };

  const [tableSearch, setTableSearch] = useState("");
  const [tableFilter, setTableFilter] = useState<"ALL" | "whitelist" | "blacklist">("ALL");

  const savedAllowed = policy.data?.allowedMerchants ?? [];
  const savedBlocked = policy.data?.blockedMerchants ?? [];
  const totalRulesCount = savedAllowed.length + savedBlocked.length;

  const combinedRules = useMemo(() => {
    const rules: Array<{ name: string; type: "whitelist" | "blacklist" }> = [
      ...savedAllowed.map((name) => ({ name, type: "whitelist" as const })),
      ...savedBlocked.map((name) => ({ name, type: "blacklist" as const })),
    ];

    return rules.filter((rule) => {
      const matchesSearch = rule.name.toLowerCase().includes(tableSearch.trim().toLowerCase());
      const matchesFilter =
        tableFilter === "ALL" ? true : rule.type === tableFilter;
      return matchesSearch && matchesFilter;
    });
  }, [savedAllowed, savedBlocked, tableSearch, tableFilter]);

  return (
    <div className="min-h-full bg-background text-foreground p-6 md:p-8 pb-24">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Telemetry Summary Stats (Free & Borderless) */}
        {policy.isLoading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 py-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-zinc-900/40" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {/* Stat 1: Per-Order Ceiling */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Per-Order Ceiling
                  </span>
                  <span className="rounded border border-zinc-700/80 bg-zinc-800/80 px-2 py-0.5 text-[10px] font-semibold font-mono text-zinc-300">
                    Instant Check
                  </span>
                </div>
                <div className="text-2xl font-bold font-mono tracking-tight text-zinc-100">
                  {formatRupees(currentSavedTx)}
                </div>
                <p className="text-[11px] text-zinc-500">
                  Single orders above this amount require intervention.
                </p>
              </div>

              {/* Stat 2: Lifetime Budget & Utilization */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Total Budget Cap
                  </span>
                  <span className="font-mono text-xs font-semibold text-zinc-400">
                    {utilizationPercent}% Used
                  </span>
                </div>
                <div className="text-2xl font-bold font-mono tracking-tight text-zinc-100">
                  {formatRupees(currentSavedTotal)}
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-500 rounded-full",
                        utilizationPercent > 85 ? "bg-zinc-300" : "bg-zinc-400"
                      )}
                      style={{ width: `${utilizationPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                    <span>Spent: {formatRupees(consumedRupees)}</span>
                    <span>Rem: {formatRupees(Math.max(0, currentSavedTotal - consumedRupees))}</span>
                  </div>
                </div>
              </div>

              {/* Stat 3: Autonomy & Velocity Mode */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Checkout Gate
                  </span>
                  <span className="rounded border border-zinc-700/80 bg-zinc-800/80 px-2 py-0.5 text-[10px] font-semibold font-mono text-zinc-300">
                    {policy.data?.frequencyLimit ? `${policy.data.frequencyLimit}/hr velocity` : "Unlimited"}
                  </span>
                </div>
                <div className="text-lg font-bold text-zinc-100 flex items-center gap-2 py-0.5">
                  {policy.data?.requireUserApproval ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-zinc-400" />
                      <span>Explicit Confirmation</span>
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-zinc-200" />
                      <span>Autonomous Execution</span>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500">
                  {policy.data?.requireUserApproval
                    ? "Agent pauses and requires manual approval before checkout."
                    : "Agent automates checkout immediately if within policy."}
                </p>
              </div>
            </div>

            {/* Horizontal Divider */}
            <div className="border-b border-zinc-800/80" />
          </div>
        )}

        {/* Overview Header */}
        <div>
          <h2 className="text-sm font-bold text-zinc-100 tracking-tight">Active Policy Parameters</h2>
          <p className="text-xs text-zinc-400">Current guardrail configuration enforced on AI shopper checkout.</p>
        </div>

        {/* Parameter Cards: Spending Limits & Safety Controls */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Card 1: Spending Limits */}
          <div className="rounded-xl border border-zinc-800/80 bg-[#161616]/90 shadow-2xl overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/60 p-4 sm:p-5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-300 shadow-xs">
                    <Gauge className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                      Spending Limits
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      INR (₹) budget ceilings & caps
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenDialog("limits")}
                  className="h-7.5 px-3 text-xs rounded-md border-zinc-700 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 gap-1.5 cursor-pointer"
                >
                  <Pencil className="h-3 w-3" />
                  <span>Edit Limits</span>
                </Button>
              </div>

              <div className="divide-y divide-zinc-800/60 text-xs font-mono">
                <div className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-800/20 transition-colors">
                  <span className="text-zinc-400 font-sans">Per-Order Cap</span>
                  <span className="font-bold text-sm text-zinc-100">{formatRupees(currentSavedTx)}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-800/20 transition-colors">
                  <span className="text-zinc-400 font-sans">Total Lifetime Budget</span>
                  <span className="font-bold text-sm text-zinc-100">{formatRupees(currentSavedTotal)}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-800/20 transition-colors">
                  <span className="text-zinc-400 font-sans">Available Balance</span>
                  <span className="font-bold text-sm text-zinc-200">
                    {formatRupees(Math.max(0, currentSavedTotal - consumedRupees))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Security & Safety Controls */}
          <div className="rounded-xl border border-zinc-800/80 bg-[#161616]/90 shadow-2xl overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/60 p-4 sm:p-5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-300 shadow-xs">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                      Safety Controls
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Execution gates & rate limiting
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenDialog("safety")}
                  className="h-7.5 px-3 text-xs rounded-md border-zinc-700 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 gap-1.5 cursor-pointer"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  <span>Configure Safety</span>
                </Button>
              </div>

              <div className="divide-y divide-zinc-800/60 text-xs">
                <div className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-800/20 transition-colors">
                  <span className="text-zinc-400">Approval Gate</span>
                  <span className="font-semibold text-xs text-zinc-100">
                    {policy.data?.requireUserApproval ? "Manual Confirmation Required" : "Autonomous Checkout"}
                  </span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-800/20 transition-colors">
                  <span className="text-zinc-400">Hourly Velocity Limit</span>
                  <span className="font-mono font-bold text-xs text-zinc-100">
                    {policy.data?.frequencyLimit ? `${policy.data.frequencyLimit} max / hr` : "Unlimited"}
                  </span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-800/20 transition-colors">
                  <span className="text-zinc-400">Enforcement Mode</span>
                  <span className="font-semibold text-xs text-zinc-200">Strict Pre-Authorization</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Header Bar (Outside card on page surface) */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
          {/* Left: Icon Box + Title */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-300 shadow-xs">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Merchant Rules
              </h2>
            </div>
          </div>

          {/* Right: Filters + Add Action */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter Mode Toggle */}
            <div className="inline-flex h-9 items-center rounded-lg border border-zinc-800 bg-zinc-900/90 p-0.5">
              <button
                type="button"
                onClick={() => setTableFilter("ALL")}
                className={cn(
                  "inline-flex h-full items-center rounded-md px-3 text-xs font-semibold transition-colors cursor-pointer",
                  tableFilter === "ALL"
                    ? "bg-zinc-800 text-white shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTableFilter("whitelist")}
                className={cn(
                  "inline-flex h-full items-center rounded-md px-3 text-xs font-semibold transition-colors cursor-pointer",
                  tableFilter === "whitelist"
                    ? "bg-zinc-800 text-white shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                Cleared
              </button>
              <button
                type="button"
                onClick={() => setTableFilter("blacklist")}
                className={cn(
                  "inline-flex h-full items-center rounded-md px-3 text-xs font-semibold transition-colors cursor-pointer",
                  tableFilter === "blacklist"
                    ? "bg-zinc-800 text-white shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                Blocked
              </button>
            </div>

            {/* Add Rule Button */}
            <Button
              type="button"
              onClick={() => handleOpenDialog("merchants")}
              className="h-9 px-3.5 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Rule</span>
            </Button>
          </div>
        </div>

        {/* Table Card (Contains only table) */}
        <div className="rounded-xl border border-zinc-800/80 bg-[#161616]/90 shadow-2xl overflow-hidden">
          <Table>
            <TableHeader className="bg-zinc-950/60">
              <TableRow className="border-b border-zinc-800/80 text-[11px] font-semibold tracking-wider text-zinc-400 hover:bg-transparent">
                <TableHead className="w-12 px-4 py-3.5 font-mono text-zinc-500">#</TableHead>
                <TableHead className="px-4 py-3.5">Merchant / Keyword</TableHead>
                <TableHead className="px-4 py-3.5">Clearance Status</TableHead>
                <TableHead className="px-4 py-3.5 hidden sm:table-cell">Policy Effect</TableHead>
                <TableHead className="px-4 py-3.5 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-zinc-800/60 font-medium">
              {combinedRules.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-12 px-4 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Building2 className="h-8 w-8 text-zinc-600 mb-1" />
                      <p className="text-sm font-semibold text-zinc-200">
                        {tableSearch ? `No rules matching "${tableSearch}"` : "No merchant rules configured"}
                      </p>
                      <p className="text-xs text-zinc-500 max-w-sm">
                        All verified store checkouts are permitted under default pre-authorization guardrails.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDialog("merchants")}
                        className="mt-2 h-7 px-3 text-xs border-zinc-700 text-zinc-300 cursor-pointer"
                      >
                        Add First Rule
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                combinedRules.map((rule, idx) => {
                  const isWhitelist = rule.type === "whitelist";
                  return (
                    <TableRow
                      key={`${rule.type}-${rule.name}`}
                      className="transition-colors hover:bg-zinc-800/40"
                    >
                      {/* Row Index */}
                      <TableCell className="px-4 py-3.5 font-mono text-xs text-zinc-500">
                        {idx + 1}
                      </TableCell>

                      {/* Merchant Name */}
                      <TableCell className="px-4 py-3.5">
                        <span className="font-bold text-sm text-zinc-100 font-mono capitalize">
                          {rule.name}
                        </span>
                      </TableCell>

                      {/* Status Badge */}
                      <TableCell className="px-4 py-3.5">
                        {isWhitelist ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span>Cleared (Whitelist)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-950/60 px-2.5 py-0.5 text-[11px] font-medium text-rose-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                            <span>Restricted (Blacklist)</span>
                          </span>
                        )}
                      </TableCell>

                      {/* Policy Effect */}
                      <TableCell className="px-4 py-3.5 text-xs text-zinc-400 hidden sm:table-cell">
                        {isWhitelist
                          ? "Permits autonomous purchase within spending caps"
                          : "Instantly aborts pre-authorization checkout"}
                      </TableCell>

                      {/* Action */}
                      <TableCell className="px-4 py-3.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRuleDirect(rule.name, rule.type)}
                          disabled={update.isPending}
                          className="h-7 w-7 p-0 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800/60 rounded-md transition-colors cursor-pointer"
                          title="Remove rule"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>


      {/* 1. Spending Limits Dialog */}
      <Dialog open={activeDialog === "limits"} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="top-[20%] translate-y-0 sm:max-w-lg max-w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl p-0">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-zinc-300" />
              <span className="text-sm font-bold text-zinc-100">Edit Spending Limits</span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">Currency: INR (₹)</span>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Per Tx */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300">
                  Max Per Transaction (₹)
                </label>
                <span className="text-xs font-mono font-semibold text-zinc-200">
                  {formatRupees(numMaxTx)}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-zinc-500 text-sm font-semibold">
                  ₹
                </span>
                <input
                  type="text"
                  value={maxTxRupees}
                  onChange={(e) => setMaxTxRupees(e.target.value)}
                  placeholder="e.g. 10000"
                  className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950/60 pl-8 pr-3 font-mono text-xs font-semibold text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                />
              </div>

              {/* Presets */}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {TX_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setMaxTxRupees(String(p.value))}
                    className={cn(
                      "rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors cursor-pointer",
                      numMaxTx === p.value
                        ? "border-zinc-600 bg-zinc-800 text-zinc-100 font-semibold"
                        : "border-zinc-800/80 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Total Budget */}
            <div className="space-y-2 pt-3 border-t border-zinc-800/60">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300">
                  Total Lifetime Budget Cap (₹)
                </label>
                <span className="text-xs font-mono font-semibold text-zinc-200">
                  {formatRupees(numMaxTotal)}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-zinc-500 text-sm font-semibold">
                  ₹
                </span>
                <input
                  type="text"
                  value={maxTotalRupees}
                  onChange={(e) => setMaxTotalRupees(e.target.value)}
                  placeholder="e.g. 50000"
                  className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950/60 pl-8 pr-3 font-mono text-xs font-semibold text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                />
              </div>

              {/* Presets */}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {TOTAL_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setMaxTotalRupees(String(p.value))}
                    className={cn(
                      "rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors cursor-pointer",
                      numMaxTotal === p.value
                        ? "border-zinc-600 bg-zinc-800 text-zinc-100 font-semibold"
                        : "border-zinc-800/80 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-800 bg-zinc-950/40 px-5 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCloseDialog}
              className="h-8 px-3 text-xs rounded-lg border-zinc-700 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={update.isPending}
              className="h-8 px-3.5 text-xs font-bold rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 shadow-sm cursor-pointer"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              <span>{update.isPending ? "Applying..." : "Save Limits"}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 2. Safety Controls Dialog */}
      <Dialog open={activeDialog === "safety"} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="top-[20%] translate-y-0 sm:max-w-lg max-w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl p-0">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-zinc-300" />
              <span className="text-sm font-bold text-zinc-100">Configure Safety Controls</span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">Autonomous Policy</span>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Approval Toggle */}
            <div
              onClick={() => setRequireUserApproval((prev) => !prev)}
              className={cn(
                "group flex items-start justify-between p-3.5 rounded-lg border transition-all cursor-pointer",
                requireUserApproval
                  ? "border-zinc-700 bg-zinc-800/60"
                  : "border-zinc-800/80 bg-zinc-950/40 hover:border-zinc-700"
              )}
            >
              <div className="space-y-0.5 pr-3">
                <span className="text-xs font-bold text-zinc-100 block">
                  Require Explicit Confirmation
                </span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Require manual click approval before completing checkout. Disable for fully autonomous agent purchasing.
                </p>
              </div>
              <div
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out mt-0.5",
                  requireUserApproval ? "bg-zinc-200" : "bg-zinc-700"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 rounded-full shadow-xs transform ring-0 transition duration-200 ease-in-out",
                    requireUserApproval
                      ? "translate-x-4 bg-zinc-950"
                      : "translate-x-0 bg-zinc-400"
                  )}
                />
              </div>
            </div>

            {/* Velocity Cap */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-200">
                  Hourly Velocity Limit
                </label>
                <span className="text-[11px] font-mono text-zinc-400">
                  {frequencyLimit ? `${frequencyLimit} Orders / Hr` : "Unlimited"}
                </span>
              </div>
              <input
                type="number"
                min="1"
                max="100"
                value={frequencyLimit}
                onChange={(e) => setFrequencyLimit(e.target.value)}
                placeholder="e.g. 10 (Leave blank for unlimited)"
                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
              />
              <p className="text-[11px] text-zinc-500">
                Guards against rapid repeating purchases or looped checkout attempts within 60 minutes.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-800 bg-zinc-950/40 px-5 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCloseDialog}
              className="h-8 px-3 text-xs rounded-lg border-zinc-700 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={update.isPending}
              className="h-8 px-3.5 text-xs font-bold rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 shadow-sm cursor-pointer"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              <span>{update.isPending ? "Applying..." : "Save Safety Rules"}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 3. Combined Merchant Rules Dialog (Search Bar Clean Design) */}
      <Dialog open={activeDialog === "merchants"} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="top-[20%] translate-y-0 sm:max-w-xl max-w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl p-0">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-zinc-300" />
              <span className="text-sm font-bold text-zinc-100">Add Merchant Rule</span>
            </div>
          </div>

          {/* Search-Bar Style Input Row */}
          <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3 bg-zinc-950/40">
            <Plus className="size-4 shrink-0 text-zinc-400" />
            <input
              type="text"
              value={merchantInput}
              onChange={(e) => setMerchantInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddMerchantRule();
                }
              }}
              placeholder={
                merchantAction === "whitelist"
                  ? "Type store to allow (e.g. nike india, flipkart, amazon)..."
                  : "Type vendor keyword to block (e.g. untrusted-vendor)..."
              }
              className="flex h-6 w-full bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 outline-none"
            />
            <Button
              type="button"
              size="sm"
              variant={merchantAction === "whitelist" ? "secondary" : "destructive"}
              onClick={() => handleAddMerchantRule()}
              className="h-7 px-3 text-xs rounded-md shrink-0 cursor-pointer"
            >
              {merchantAction === "whitelist" ? "Clear Store" : "Block Vendor"}
            </Button>
          </div>

          {/* Action Rule Bar (Same style as suggestions) */}
          <div className="px-5 py-2 border-b border-zinc-800/60 flex items-center gap-2 flex-wrap bg-zinc-950/20">
            <span className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1">
              <SlidersHorizontal className="h-3 w-3 text-zinc-400" />
              <span>Action Rule:</span>
            </span>
            <button
              type="button"
              onClick={() => setMerchantAction("whitelist")}
              className={cn(
                "rounded-md border px-2.5 py-0.5 text-[11px] transition-colors cursor-pointer flex items-center gap-1.5",
                merchantAction === "whitelist"
                  ? "border-zinc-600 bg-zinc-800 text-zinc-100 font-semibold"
                  : "border-zinc-800/80 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              )}
            >
              <CheckCircle2 className="h-3 w-3 text-zinc-300" />
              <span>Cleared (Whitelist)</span>
            </button>
            <button
              type="button"
              onClick={() => setMerchantAction("blacklist")}
              className={cn(
                "rounded-md border px-2.5 py-0.5 text-[11px] transition-colors cursor-pointer flex items-center gap-1.5",
                merchantAction === "blacklist"
                  ? "border-zinc-600 bg-zinc-800 text-zinc-100 font-semibold"
                  : "border-zinc-800/80 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              )}
            >
              <Ban className="h-3 w-3 text-zinc-400" />
              <span>Restricted (Blacklist)</span>
            </button>
          </div>

          {/* Suggestions Bar */}
          {merchantAction === "whitelist" && (
            <div className="px-5 py-2 border-b border-zinc-800/60 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-zinc-400" />
                <span>Suggestions:</span>
              </span>
              {SUGGESTED_WHITELIST.filter((s) => !allowedMerchants.includes(s.id)).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleAddMerchantRule(s.id, "whitelist")}
                  className="rounded-md border border-zinc-800/80 bg-zinc-800/40 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 cursor-pointer"
                >
                  + {s.name}
                </button>
              ))}
            </div>
          )}

          {/* Clean Active Rules Chip Cloud */}
          <div className="px-5 py-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
              <span>Active Rules ({allowedMerchants.length + blockedMerchants.length})</span>
              <span className="font-mono text-zinc-500">
                {allowedMerchants.length} Allowed · {blockedMerchants.length} Blocked
              </span>
            </div>

            <div className="min-h-12 max-h-36 overflow-y-auto flex flex-wrap items-center gap-1.5 pt-0.5">
              {allowedMerchants.length === 0 && blockedMerchants.length === 0 ? (
                <div className="text-xs text-zinc-500 py-1">
                  No specific merchant rules configured. All verified stores permitted.
                </div>
              ) : (
                <>
                  {allowedMerchants.map((m) => (
                    <span
                      key={`modal-allowed-${m}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800/90 px-2.5 py-1 font-mono text-xs font-semibold text-zinc-200 capitalize shadow-2xs"
                    >
                      <CheckCircle2 className="h-3 w-3 text-zinc-400" />
                      <span>{m}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMerchantRule(m, "whitelist")}
                        className="text-zinc-400 hover:text-zinc-100 p-0.5 cursor-pointer ml-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {blockedMerchants.map((m) => (
                    <span
                      key={`modal-blocked-${m}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800/90 px-2.5 py-1 font-mono text-xs font-semibold text-zinc-300 capitalize shadow-2xs"
                    >
                      <Ban className="h-3 w-3 text-zinc-400" />
                      <span>{m}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMerchantRule(m, "blacklist")}
                        className="text-zinc-400 hover:text-zinc-100 p-0.5 cursor-pointer ml-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-zinc-800 bg-zinc-950/40 px-5 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCloseDialog}
              className="h-8 px-3 text-xs rounded-lg border-zinc-700 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={update.isPending}
              className="h-8 px-3.5 text-xs font-bold rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 shadow-sm cursor-pointer"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              <span>{update.isPending ? "Applying..." : "Save Merchant Rules"}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}







