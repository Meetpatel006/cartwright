"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, Wallet, IndianRupee, Shield, CreditCard, Copy, Check } from "lucide-react";
import { cn } from "@cartwright/ui/lib/utils";
import { trpc } from "@/utils/trpc";
import { FormattedAmount } from "@/components/merchant/formatted-amount";
import { StatusBadge } from "./status-badge";
import { KPICard } from "./kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cartwright/ui/components/table";

export function ShopperTab() {
  const txQuery = useQuery({ ...trpc.transactions.list.queryOptions() });
  const policyQuery = useQuery({ ...trpc.policies.get.queryOptions() });
  const transactions = txQuery.data || [];
  const policy = policyQuery.data;
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const totalSpent = transactions.reduce((s: number, t: any) => s + (t.amountInMinor || 0) / 100, 0);
    const consumed = (policy?.consumedInMinor ?? 0) / 100;
    const budgetCap = (policy?.maxTotalSpending ?? 0) / 100;
    const budgetRemaining = budgetCap > 0 ? Math.max(0, budgetCap - consumed) : 0;
    const perOrderLimit = (policy?.maxTransactionAmount ?? 0) / 100;
    const paidCount = transactions.filter((t: any) => ["PAYMENT_SUCCEEDED", "APPROVED", "PAID", "DELIVERED"].includes((t.status || "").toUpperCase())).length;
    const pendingCount = transactions.filter((t: any) => ["CREATED", "POLICY_CHECKING", "AWAITING_APPROVAL", "PAYMENT_PROCESSING"].includes((t.status || "").toUpperCase())).length;
    return { totalSpent, budgetCap, budgetRemaining, consumed, perOrderLimit, totalTx: transactions.length, paidCount, pendingCount };
  }, [transactions, policy]);

  const recentTx = useMemo(() => transactions.slice(0, 6), [transactions]);
  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (txQuery.isLoading || policyQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 sm:p-5 space-y-3 border-b sm:border-b-0 sm:border-r border-border/60 last:border-0">
              <div className="h-3 w-24 animate-pulse rounded bg-muted/60" />
              <div className="h-7 w-20 animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted/60" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="h-5 w-40 animate-pulse rounded bg-muted/60" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 w-full animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  if (txQuery.isError || policyQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-rose-500">Failed to load shopping data.</p>
        <p className="text-xs text-muted-foreground mt-1">Try refreshing the page.</p>
      </div>
    );
  }

  if (transactions.length === 0 && !policy) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShoppingCart className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <h2 className="text-sm font-semibold text-foreground">No shopping activity yet</h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">Start shopping with the AI agent to see your transactions and spending policy here.</p>
        <a href="/shopper" className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 transition-colors mt-4">
          <ShoppingCart className="h-3.5 w-3.5" /> Start Shopping
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-4 w-4 text-purple-400" />
        <h2 className="text-sm font-semibold text-foreground">Shopper Overview</h2>
      </div>

      <div className="w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4">
          <KPICard
            label="Total Spent"
            icon={<Wallet className="h-3.5 w-3.5 text-muted-foreground" />}
            value={<FormattedAmount amount={stats.totalSpent} />}
            subtext={`${stats.paidCount} paid · ${stats.pendingCount} pending`}
            className="border-b sm:border-b-0 sm:border-r border-border/60"
          />
          <KPICard
            label="Budget Remaining"
            icon={<IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />}
            value={
              stats.budgetCap > 0 ? (
                <FormattedAmount amount={stats.budgetRemaining} />
              ) : (
                <span className="text-muted-foreground text-lg">No limit</span>
              )
            }
            subtext={
              stats.budgetCap > 0 ? (
                <span>
                  <FormattedAmount amount={stats.consumed} /> of <FormattedAmount amount={stats.budgetCap} /> spent
                </span>
              ) : (
                <a href="/policy" className="text-purple-400 hover:text-purple-300 transition-colors">
                  Set spending cap →
                </a>
              )
            }
            className="border-b sm:border-b-0 sm:border-r border-border/60"
          />
          <KPICard
            label="Per-Order Limit"
            icon={<Shield className="h-3.5 w-3.5 text-muted-foreground" />}
            value={stats.perOrderLimit > 0 ? <FormattedAmount amount={stats.perOrderLimit} /> : <span className="text-muted-foreground text-lg">No limit</span>}
            subtext={<span className={cn("font-medium", policy?.requireUserApproval ? "text-amber-500" : "text-emerald-500")}>{policy?.requireUserApproval ? "Manual approval" : "Autonomous"}</span>}
            className="border-b sm:border-b-0 sm:border-r-0 lg:border-r border-border/60"
          />
          <KPICard
            label="Transactions"
            icon={<CreditCard className="h-3.5 w-3.5 text-muted-foreground" />}
            value={stats.totalTx}
            subtext={`${stats.paidCount} completed`}
          />
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground">
              <CreditCard className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Recent Transactions</h2>
          </div>
          <a href="/transactions" className="text-[11px] text-purple-400 hover:text-purple-300 font-medium transition-colors">View all →</a>
        </div>
        {recentTx.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-border bg-background text-center">
            <CreditCard className="mb-2 h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs font-medium text-foreground">No transactions yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-left text-xs">
              <TableHeader className="border-border bg-muted/40 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 py-2.5 font-mono">#</TableHead>
                  <TableHead className="px-4 py-2.5">Transaction ID</TableHead>
                  <TableHead className="px-4 py-2.5">Merchant</TableHead>
                  <TableHead className="px-4 py-2.5">Item</TableHead>
                  <TableHead className="px-4 py-2.5 text-right">Amount</TableHead>
                  <TableHead className="px-4 py-2.5 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {recentTx.map((tx: any, idx: number) => {
                  const txId = tx.transactionId || tx.id;
                  const prod = tx.items || tx.rawQuery || "—";
                  const isCopied = copiedId === txId;
                  return (
                    <TableRow key={txId || idx} className="hover:bg-muted/30">
                      <TableCell className="px-4 py-3 font-mono text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-foreground">{(txId || "").slice(0, 12)}</span>
                          <button type="button" aria-label={`Copy transaction ID ${txId}`} onClick={(e) => handleCopy(txId, e)} className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground">
                            {isCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">{tx.merchantName || "—"}</TableCell>
                      <TableCell className="max-w-[180px] truncate px-4 py-3 text-muted-foreground">{prod}</TableCell>
                      <TableCell className="px-4 py-3 text-right font-mono font-semibold text-emerald-500"><FormattedAmount amount={(tx.amountInMinor || 0) / 100} /></TableCell>
                      <TableCell className="px-4 py-3 text-right"><StatusBadge status={tx.status} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
