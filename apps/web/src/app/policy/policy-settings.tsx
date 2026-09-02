"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Search,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@cartwright/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@cartwright/ui/components/dialog";
import { cn } from "@cartwright/ui/lib/utils";
import { trpc } from "@/utils/trpc";
import { formatRupees, MerchantLogo, parseInputToRupees } from "@/components/policy/policy-helpers";

type ActiveDialog = "merchants" | null;
type EditingStat = "singleTx" | "lifetime" | "velocity" | null;

export default function PolicySettings() {
  const policy = useQuery(trpc.policies.get.queryOptions());

  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [editingStat, setEditingStat] = useState<EditingStat>(null);

  // Form values in whole Rupees (major currency units)
  const [maxTxRupees, setMaxTxRupees] = useState<string>("");
  const [maxTotalRupees, setMaxTotalRupees] = useState<string>("");
  const [currency, setCurrency] = useState("INR");
  const [requireUserApproval, setRequireUserApproval] = useState(false);
  const [blockedMerchants, setBlockedMerchants] = useState<string[]>([]);
  const [frequencyLimit, setFrequencyLimit] = useState<string>("");

  // Merchant dialog input states
  const [merchantInput, setMerchantInput] = useState("");

  const [tableSearch, setTableSearch] = useState("");
  const [tableFilter, setTableFilter] = useState<"ALL" | "blacklist">("ALL");

  const [seeded, setSeeded] = useState(false);

  const syncFormFromData = () => {
    if (!policy.data) return;
    setMaxTxRupees(String(policy.data.maxTransactionAmount / 100));
    setMaxTotalRupees(String(policy.data.maxTotalSpending / 100));
    setCurrency(policy.data.currency || "INR");
    setRequireUserApproval(Boolean(policy.data.requireUserApproval));
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
        setEditingStat(null);
        toast.success("Spending policy guardrails updated successfully");
      },
      onError: (err) => {
        toast.error(`Failed to update policy: ${err.message}`);
      },
    })
  );

  const currentSavedTx = (policy.data?.maxTransactionAmount ?? 0) / 100;
  const currentSavedTotal = (policy.data?.maxTotalSpending ?? 0) / 100;
  const consumedRupees = (policy.data?.consumedInMinor ?? 0) / 100;
  const utilizationPercent =
    currentSavedTotal > 0
      ? Math.min(100, Math.round((consumedRupees / currentSavedTotal) * 100))
      : 0;

  const handleSaveSingleTx = (customVal?: number) => {
    const val = customVal !== undefined ? customVal : parseInputToRupees(maxTxRupees);
    if (val <= 0) {
      toast.error("Single order limit must be greater than 0");
      return;
    }
    setMaxTxRupees(String(val));
    update.mutate({
      maxTransactionAmount: Math.round(val * 100),
      maxTotalSpending: policy.data?.maxTotalSpending ?? 0,
      currency: policy.data?.currency || "INR",
      requireUserApproval: Boolean(policy.data?.requireUserApproval),
      blockedMerchants: policy.data?.blockedMerchants ?? [],
      frequencyLimit: policy.data?.frequencyLimit ?? null,
    });
  };

  const handleSaveLifetime = (customVal?: number) => {
    const val = customVal !== undefined ? customVal : parseInputToRupees(maxTotalRupees);
    if (val <= 0) {
      toast.error("Lifetime budget cap must be greater than 0");
      return;
    }
    const valInPaisa = Math.round(val * 100);
    if (valInPaisa < (policy.data?.consumedInMinor ?? 0)) {
      toast.error(
        `Lifetime budget cannot be lower than spent amount (${formatRupees(consumedRupees)})`
      );
      return;
    }
    setMaxTotalRupees(String(val));
    update.mutate({
      maxTransactionAmount: policy.data?.maxTransactionAmount ?? 0,
      maxTotalSpending: valInPaisa,
      currency: policy.data?.currency || "INR",
      requireUserApproval: Boolean(policy.data?.requireUserApproval),
      blockedMerchants: policy.data?.blockedMerchants ?? [],
      frequencyLimit: policy.data?.frequencyLimit ?? null,
    });
  };

  const handleToggleApproval = (requireApproval: boolean) => {
    setRequireUserApproval(requireApproval);
    update.mutate({
      maxTransactionAmount: policy.data?.maxTransactionAmount ?? 0,
      maxTotalSpending: policy.data?.maxTotalSpending ?? 0,
      currency: policy.data?.currency || "INR",
      requireUserApproval: requireApproval,
      blockedMerchants: policy.data?.blockedMerchants ?? [],
      frequencyLimit: policy.data?.frequencyLimit ?? null,
    });
  };

  const handleSaveVelocity = (customVal?: string) => {
    const rawVal = customVal !== undefined ? customVal : frequencyLimit;
    const trimmed = rawVal.trim();
    const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
    if (parsed !== null && (isNaN(parsed) || parsed <= 0)) {
      toast.error("Velocity limit must be a positive number or blank for unlimited");
      return;
    }
    setFrequencyLimit(trimmed);
    update.mutate({
      maxTransactionAmount: policy.data?.maxTransactionAmount ?? 0,
      maxTotalSpending: policy.data?.maxTotalSpending ?? 0,
      currency: policy.data?.currency || "INR",
      requireUserApproval: Boolean(policy.data?.requireUserApproval),
      blockedMerchants: policy.data?.blockedMerchants ?? [],
      frequencyLimit: parsed,
    });
  };

  const startEditingSingleTx = () => {
    setMaxTxRupees(String((policy.data?.maxTransactionAmount ?? 0) / 100));
    setEditingStat("singleTx");
  };

  const startEditingLifetime = () => {
    setMaxTotalRupees(String((policy.data?.maxTotalSpending ?? 0) / 100));
    setEditingStat("lifetime");
  };

  const startEditingVelocity = () => {
    setFrequencyLimit(
      policy.data?.frequencyLimit !== null && policy.data?.frequencyLimit !== undefined
        ? String(policy.data.frequencyLimit)
        : ""
    );
    setEditingStat("velocity");
  };

  const handleOpenDialog = (dialog: ActiveDialog) => {
    syncFormFromData();
    setActiveDialog(dialog);
  };

  const handleCloseDialog = () => {
    syncFormFromData();
    setActiveDialog(null);
  };

  const handleSaveNewMerchantRule = (customName?: string) => {
    const target = (customName ?? merchantInput).trim().toLowerCase();
    if (!target) {
      toast.error("Please enter a merchant name or keyword");
      return;
    }
    const currentBlocked = policy.data?.blockedMerchants ?? [];
    let newBlocked = [...currentBlocked];
    if (!newBlocked.includes(target)) newBlocked.push(target);

    update.mutate({
      maxTransactionAmount: policy.data?.maxTransactionAmount ?? 0,
      maxTotalSpending: policy.data?.maxTotalSpending ?? 0,
      currency: policy.data?.currency || "INR",
      requireUserApproval: Boolean(policy.data?.requireUserApproval),
      blockedMerchants: newBlocked,
      frequencyLimit: policy.data?.frequencyLimit ?? null,
    });
  };

  const handleDeleteRuleDirect = (name: string) => {
    if (!policy.data) return;
    const newBlocked = (policy.data.blockedMerchants ?? []).filter((m) => m !== name);

    update.mutate({
      maxTransactionAmount: policy.data.maxTransactionAmount,
      maxTotalSpending: policy.data.maxTotalSpending,
      currency: policy.data.currency || "INR",
      requireUserApproval: Boolean(policy.data.requireUserApproval),
      blockedMerchants: newBlocked,
      frequencyLimit: policy.data.frequencyLimit,
    });
  };

  const savedBlocked = policy.data?.blockedMerchants ?? [];

  const combinedRules = useMemo(() => {
    const rules = savedBlocked.map((name) => ({ name, type: "blacklist" as const }));

    return rules.filter((rule) => {
      const matchesSearch = rule.name.toLowerCase().includes(tableSearch.trim().toLowerCase());
      const matchesFilter =
        tableFilter === "ALL" ? true : rule.type === tableFilter;
      return matchesSearch && matchesFilter;
    });
  }, [savedBlocked, tableSearch, tableFilter]);

  return (
    <div className="w-full text-foreground px-6 sm:px-8 pt-10 sm:pt-12 pb-24">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Policy Telemetry & Guardrail Stats Cards */}
        {policy.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/40" />
            <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/40" />
            <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/40" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Stat 1: Single Order Limit */}
            <div className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Single Order Limit</span>
                {editingStat !== "singleTx" && (
                  <button
                    type="button"
                    onClick={startEditingSingleTx}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Click to edit single order limit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {editingStat === "singleTx" ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <span className="text-2xl font-bold font-mono tracking-tight text-muted-foreground">₹</span>
                    <input
                      type="text"
                      value={maxTxRupees}
                      onChange={(e) => setMaxTxRupees(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveSingleTx();
                        if (e.key === "Escape") setEditingStat(null);
                      }}
                      placeholder="10000"
                      className="w-full bg-transparent pb-0.5 font-mono text-2xl font-bold tracking-tight text-foreground focus:outline-none border-none"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSaveSingleTx()}
                      disabled={update.isPending}
                      className="p-1 rounded-md text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/50 transition-colors cursor-pointer"
                      title="Save limit (Enter)"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMaxTxRupees(String((policy.data?.maxTransactionAmount ?? 0) / 100));
                        setEditingStat(null);
                      }}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                      title="Cancel (Esc)"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={startEditingSingleTx}
                  className="cursor-pointer group/val"
                  title="Click to edit single order limit"
                >
                  <span className="text-2xl font-bold font-mono tracking-tight text-foreground group-hover/val:text-foreground">
                    {formatRupees(currentSavedTx)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                <span>Per checkout cap</span>
                <span className="text-emerald-400 font-medium">Active</span>
              </div>
            </div>

            {/* Stat 2: Lifetime Budget */}
            <div className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Lifetime Budget Cap</span>
                {editingStat !== "lifetime" && (
                  <button
                    type="button"
                    onClick={startEditingLifetime}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Click to edit lifetime budget"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {editingStat === "lifetime" ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <span className="text-2xl font-bold font-mono tracking-tight text-muted-foreground">₹</span>
                    <input
                      type="text"
                      value={maxTotalRupees}
                      onChange={(e) => setMaxTotalRupees(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveLifetime();
                        if (e.key === "Escape") setEditingStat(null);
                      }}
                      placeholder="50000"
                      className="w-full bg-transparent pb-0.5 font-mono text-2xl font-bold tracking-tight text-foreground focus:outline-none border-none"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSaveLifetime()}
                      disabled={update.isPending}
                      className="p-1 rounded-md text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/50 transition-colors cursor-pointer"
                      title="Save budget (Enter)"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMaxTotalRupees(String((policy.data?.maxTotalSpending ?? 0) / 100));
                        setEditingStat(null);
                      }}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                      title="Cancel (Esc)"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={startEditingLifetime}
                  className="cursor-pointer group/val"
                  title="Click to edit lifetime budget"
                >
                  <span className="text-2xl font-bold font-mono tracking-tight text-foreground group-hover/val:text-foreground">
                    {formatRupees(currentSavedTotal)}
                  </span>
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                <div className="h-1 w-full rounded-full bg-accent overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-500 rounded-full",
                      utilizationPercent > 85 ? "bg-amber-400" : "bg-emerald-400"
                    )}
                    style={{ width: `${Math.max(4, utilizationPercent)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                  <span>Spent: {formatRupees(consumedRupees)}</span>
                  <span>{utilizationPercent}%</span>
                </div>
              </div>
            </div>

            {/* Stat 3: Hourly Velocity & Checkout Mode */}
            <div className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Hourly Velocity & Mode</span>
                {editingStat !== "velocity" && (
                  <button
                    type="button"
                    onClick={startEditingVelocity}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Click to edit velocity limit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {editingStat === "velocity" ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={frequencyLimit}
                      onChange={(e) => setFrequencyLimit(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveVelocity();
                        if (e.key === "Escape") setEditingStat(null);
                      }}
                      placeholder="Unlimited"
                      className="w-full bg-transparent pb-0.5 font-mono text-2xl font-bold tracking-tight text-foreground placeholder:text-muted-foreground focus:outline-none border-none"
                      autoFocus
                    />
                    <span className="text-sm font-mono font-semibold text-muted-foreground shrink-0">/hr</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSaveVelocity()}
                      disabled={update.isPending}
                      className="p-1 rounded-md text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/50 transition-colors cursor-pointer"
                      title="Save velocity (Enter)"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFrequencyLimit(
                          policy.data?.frequencyLimit ? String(policy.data.frequencyLimit) : ""
                        );
                        setEditingStat(null);
                      }}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                      title="Cancel (Esc)"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div
                    onClick={startEditingVelocity}
                    className="cursor-pointer group/val"
                    title="Click to edit velocity limit"
                  >
                    <span className="text-2xl font-bold font-mono tracking-tight text-foreground group-hover/val:text-foreground">
                      {policy.data?.frequencyLimit ? `${policy.data.frequencyLimit}/hr` : "Unlimited"}
                    </span>
                  </div>

                  <div className="inline-flex items-center gap-1 p-0.5 rounded-lg border border-border bg-muted">
                    <button
                      type="button"
                      onClick={() => handleToggleApproval(false)}
                      disabled={update.isPending}
                      className={cn(
                        "flex items-center rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                        !policy.data?.requireUserApproval
                          ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title="Autonomous checkout within limits"
                    >
                      Autonomous
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleApproval(true)}
                      disabled={update.isPending}
                      className={cn(
                        "flex items-center rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                        policy.data?.requireUserApproval
                          ? "bg-amber-950/80 text-amber-300 border border-amber-500/40"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title="Require manual user approval before checkout"
                    >
                      Manual
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                <span>Rolling 60m rate limit</span>
                <span className="text-[11px] font-mono">
                  {policy.data?.requireUserApproval ? (
                    <span className="text-amber-400 font-medium">Requires Approval</span>
                  ) : (
                    <span className="text-emerald-400 font-medium">Auto-Pass</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Merchant Rules Section Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
          {/* Left: Title */}
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Merchant Rules
            </h2>
          </div>

          {/* Right: Search + Filter + View Toggle (List / Board) + Add Rule */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative w-48 sm:w-56">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Search merchant rules..."
                className="h-9 w-full rounded-lg border border-border bg-muted pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Status Filter Toggle */}
            <div className="inline-flex h-9 items-center rounded-lg bg-muted p-0.5">
              <button
                type="button"
                onClick={() => setTableFilter("ALL")}
                className={cn(
                  "inline-flex h-full items-center rounded-md px-3 text-xs font-semibold transition-colors cursor-pointer",
                  tableFilter === "ALL"
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTableFilter("blacklist")}
                className={cn(
                  "inline-flex h-full items-center rounded-md px-3 text-xs font-semibold transition-colors cursor-pointer",
                  tableFilter === "blacklist"
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Blocked
              </button>
            </div>

            {/* Add Rule Button */}
            <Button
              type="button"
              onClick={() => handleOpenDialog("merchants")}
              className="h-9 px-3.5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Rule</span>
            </Button>
          </div>
        </div>

        {/* Rules Content: Board Grid View */}
        {combinedRules.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-muted/40 text-center">
            <Building2 className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {tableSearch ? `No rules matching "${tableSearch}"` : "No merchant rules configured"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
              All verified store checkouts are permitted under default pre-authorization guardrails.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenDialog("merchants")}
              className="mt-3 h-7.5 px-3 text-xs border-border text-foreground hover:bg-accent cursor-pointer"
            >
              Add First Rule
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {combinedRules.map((rule) => {
              return (
                <div
                  key={`${rule.type}-${rule.name}`}
                  className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-border space-y-4"
                >
                  {/* Top Row: Merchant Logo, Name & Delete Action */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <MerchantLogo name={rule.name} className="h-4 w-4 mt-0.5" />
                      <div className="min-w-0 space-y-0.5">
                        <h3 className="text-base font-bold text-foreground tracking-tight font-mono capitalize truncate">
                          {rule.name}
                        </h3>
                        <p className="text-xs text-muted-foreground font-sans leading-relaxed break-words">
                          "Instantly aborts pre-authorization checkout"
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRuleDirect(rule.name)}
                      disabled={update.isPending}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400 hover:bg-accent/60 rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                      title="Remove rule"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Policy Details */}
                  <div className="space-y-2.5 pt-3 border-t border-border text-xs">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Enforcement Gate</span>
                      <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-rose-400">
                        Blocked merchant
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Action Effect</span>
                      <span className="font-mono text-[11px] text-foreground">
                        "ABORT_REJECT"
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Merchant Rule Dialog */}
      <Dialog open={activeDialog === "merchants"} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="sm:max-w-sm" showCloseButton={true}>
          <DialogTitle>Add Merchant Rule</DialogTitle>
          <input
            type="text"
            value={merchantInput}
            onChange={(e) => setMerchantInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSaveNewMerchantRule();
              }
            }}
            placeholder="Merchant name..."
            className="h-10 w-full rounded-lg border border-border bg-muted/60 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            autoFocus
          />
          <DialogFooter>
            <Button
              type="button"
              size="sm"
              onClick={() => handleSaveNewMerchantRule()}
              disabled={update.isPending || !merchantInput.trim()}
              className="h-8 px-4 text-xs font-bold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer disabled:opacity-50"
            >
              {update.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
