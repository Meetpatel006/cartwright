"use client";

import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  ShoppingBag,
  IndianRupee,
  TrendingUp,
  Package,
  Zap,
  Lightbulb,
  AlertTriangle,
  Info,
  Store,
  ChevronDown,
  Shield,
  CreditCard,
  Wallet,
  ShoppingCart,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@cartwright/ui/lib/utils";
import { trpc } from "@/utils/trpc";
import { BarChartStacked } from "@/components/bar-chart-stacked";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@cartwright/ui/components/dropdown-menu";

// ─── Shared ──────────────────────────────────────────────────────────────────
function FormattedAmount({ amount, className }: { amount: number; className?: string }) {
  const parts = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).formatToParts(amount);
  const symbol = parts.find((p) => p.type === "currency")?.value || "₹";
  const num = parts.filter((p) => p.type !== "currency").map((p) => p.value).join("").trim();
  return (
    <span className={cn("font-mono whitespace-nowrap", className)}>
      <span className="text-muted-foreground font-normal mr-0.5">{symbol}</span>
      <span className="font-bold text-foreground">{num}</span>
    </span>
  );
}

function CustomSelect({ value, onChange, options, size = "md" }: {
  value: string | number; onChange: (val: string) => void;
  options: Array<{ value: string | number; label: string }>; size?: "sm" | "md";
}) {
  const selected = options.find((o) => String(o.value) === String(value));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={
        <button type="button" className={cn("inline-flex w-auto items-center justify-between gap-2 rounded-lg border border-border bg-card text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-muted/80 focus:border-ring focus:outline-none cursor-pointer whitespace-nowrap shrink-0", size === "sm" ? "h-7 px-2.5" : "h-9 px-3")}>
          <span>{selected ? selected.label : "Select"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      } />
      <DropdownMenuContent align="start" sideOffset={4} className="z-50 w-max min-w-full rounded-xl border border-border bg-popover p-1 shadow-2xl text-xs text-popover-foreground backdrop-blur-md">
        <DropdownMenuGroup>
          {options.map((opt) => {
            const isSel = String(opt.value) === String(value);
            return (
              <DropdownMenuItem key={String(opt.value)} onClick={() => onChange(String(opt.value))}
                className={cn("flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap", isSel ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
                <span>{opt.label}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Conversion Funnel ───────────────────────────────────────────────────────
function ConversionFunnel({ data }: { data: { stage: string; count: number; rate: string; drop: string }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between pb-3">
        <h2 className="text-sm font-semibold text-foreground">Conversion Funnel</h2>
        <span className="text-[11px] text-muted-foreground font-mono">Conv: <strong className="text-foreground">{data[data.length - 1]?.rate || "0%"}</strong></span>
      </div>
      <div className="space-y-2 pt-3">
        {data.map((stage, i) => {
          const w = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
          const last = i === data.length - 1;
          return (
            <div key={stage.stage}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground font-medium">{stage.stage}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-foreground">{stage.count.toLocaleString()}</span>
                  <span className="text-[10px] font-mono text-muted-foreground w-12 text-right">{stage.rate}</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-500", last ? "bg-emerald-500" : "bg-purple-500/70")} style={{ width: `${w}%` }} />
              </div>
              {!last && stage.drop !== "—" && <div className="text-[10px] text-red-500 font-mono mt-0.5 text-right">{stage.drop}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Search Queries ──────────────────────────────────────────────────────────
function SearchQueriesPanel({ data }: { data: { query: string; searches: number; suggestion: string }[] }) {
  if (data.length === 0) return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between pb-3"><h2 className="text-sm font-semibold text-foreground">Top Search Queries</h2></div>
      <div className="space-y-1">
        {[
          { query: "wireless headphones", searches: 234 },
          { query: "running shoes", searches: 189 },
          { query: "laptop stand", searches: 156 },
          { query: "mechanical keyboard", searches: 134 },
          { query: "usb c hub", searches: 112 },
          { query: "phone case iphone 15", searches: 98 },
          { query: "yoga mat thick", searches: 87 },
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between p-2 text-xs">
            <span className="text-foreground font-medium truncate max-w-[70%]">&ldquo;{item.query}&rdquo;</span>
            <span className="font-mono text-muted-foreground text-[11px]">{item.searches} searches</span>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between pb-3">
        <h2 className="text-sm font-semibold text-foreground">Top Search Queries</h2>
        <span className="text-[11px] text-muted-foreground">{data.length} queries</span>
      </div>
      <div className="space-y-1">
        {data.slice(0, 7).map((item, i) => (
          <div key={i} className="flex items-center justify-between p-2 text-xs">
            <span className="text-foreground font-medium truncate max-w-[70%]">&ldquo;{item.query}&rdquo;</span>
            <span className="font-mono text-muted-foreground text-[11px]">{item.searches} searches</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Agent Radar ─────────────────────────────────────────────────────────────
function AgentRadarChart({ agentSharePct = 0 }: { agentSharePct?: number }) {
  const [hIdx, setHIdx] = useState<number | null>(null);
  const base = agentSharePct > 0 ? Math.min(98, Math.max(75, Math.round(agentSharePct * 1.3))) : 88;
  const dims = [
    { key: "price", label: "Price Adherence", ai: Math.min(99, base + 8), hu: 72 },
    { key: "stock", label: "Inventory Match", ai: Math.min(99, base + 10), hu: 66 },
    { key: "rating", label: "Quality Filter", ai: Math.min(98, base + 4), hu: 80 },
    { key: "speed", label: "Checkout Latency", ai: Math.min(95, base), hu: 48 },
    { key: "schema", label: "Schema.org Parsing", ai: Math.min(99, base + 7), hu: 22 },
    { key: "retention", label: "Cart Retention", ai: Math.min(94, base - 4), hu: 59 },
  ];
  const cx = 190, cy = 125, r = 75, n = dims.length;
  const gc = (i: number, s: number) => { const a = (i * 2 * Math.PI) / n - Math.PI / 2; const rr = (r * s) / 100; return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) }; };
  const lc = (i: number) => { const a = (i * 2 * Math.PI) / n - Math.PI / 2; const lr = r + 24; return { x: cx + lr * Math.cos(a), y: cy + lr * Math.sin(a) }; };
  const aiPts = dims.map((d, i) => { const { x, y } = gc(i, d.ai); return `${x},${y}`; }).join(" ");
  const huPts = dims.map((d, i) => { const { x, y } = gc(i, d.hu); return `${x},${y}`; }).join(" ");
  const gl = [0.25, 0.5, 0.75, 1.0];
  const hd = hIdx !== null ? dims[hIdx] : null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <h2 className="text-sm font-semibold text-foreground">Agent Intelligence</h2>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /><span className="text-muted-foreground">Human</span></div>
          <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple-500" /><span className="text-muted-foreground">AI Agent</span></div>
        </div>
      </div>
      <div className="relative flex items-center justify-center pt-2 pb-1">
        <svg viewBox="0 0 380 250" className="w-full max-w-[380px] h-[230px] overflow-visible select-none">
          {gl.map((lvl, idx) => <polygon key={idx} points={dims.map((_, i) => { const { x, y } = gc(i, lvl * 100); return `${x},${y}`; }).join(" ")} fill="none" stroke="currentColor" strokeWidth={idx === gl.length - 1 ? "1.2" : "0.8"} strokeDasharray={idx === gl.length - 1 ? "none" : "3,3"} className="text-border" />)}
          {dims.map((_, i) => { const { x, y } = gc(i, 100); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="currentColor" strokeWidth="1" className="text-border" />; })}
          <polygon points={huPts} fill="rgba(59,130,246,0.14)" stroke="#3b82f6" strokeWidth="1.75" strokeDasharray="4,2" />
          <polygon points={aiPts} fill="rgba(168,85,247,0.20)" stroke="#a855f7" strokeWidth="2" />
          {dims.map((dim, i) => {
            const ai = gc(i, dim.ai), hu = gc(i, dim.hu), lp = lc(i), h = hIdx === i;
            let ta: "middle" | "start" | "end" = "middle";
            if (i === 1 || i === 2) ta = "start"; if (i === 4 || i === 5) ta = "end";
            return (
              <g key={i}>
                <text x={lp.x} y={lp.y + (i === 0 ? -4 : i === 3 ? 12 : 4)} textAnchor={ta} className={cn("text-[11px] font-medium cursor-pointer select-none transition-colors", h ? "fill-purple-400 font-semibold" : "fill-muted-foreground")} onMouseEnter={() => setHIdx(i)} onMouseLeave={() => setHIdx(null)}>{dim.label}</text>
                <circle cx={hu.x} cy={hu.y} r={h ? 4.5 : 3} fill={h ? "#93c5fd" : "#3b82f6"} stroke="currentColor" strokeWidth="1" className="text-background pointer-events-none" />
                <circle cx={ai.x} cy={ai.y} r={h ? 6 : 4} fill={h ? "#c084fc" : "#a855f7"} stroke="currentColor" strokeWidth={h ? "2" : "1"} className="text-background pointer-events-none" />
                <circle cx={ai.x} cy={ai.y} r={18} fill="transparent" className="cursor-pointer" onMouseEnter={() => setHIdx(i)} onMouseLeave={() => setHIdx(null)} />
              </g>
            );
          })}
        </svg>
        {hd && hIdx !== null && (
          <div className={cn("absolute pointer-events-none z-30 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in zoom-in-95 min-w-[150px]", hIdx === 0 && "top-2 left-1/2 -translate-x-1/2", (hIdx === 1 || hIdx === 2) && "top-1/4 right-3", hIdx === 3 && "bottom-2 left-1/2 -translate-x-1/2", (hIdx === 4 || hIdx === 5) && "top-1/4 left-3")}>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" /><span className="text-muted-foreground text-[11px]">AI Agent</span></div><span className="font-mono font-bold text-foreground text-xs">{hd.ai}%</span></div>
              <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" /><span className="text-muted-foreground text-[11px]">Human</span></div><span className="font-mono font-bold text-foreground text-xs">{hd.hu}%</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Insight Card ────────────────────────────────────────────────────────────
function InsightCard({ insight }: { insight: { id: string; type: string; severity: string; title: string; summary: string; confidence: string } }) {
  const iconMap: Record<string, typeof Lightbulb> = { underperforming_recommendation: Lightbulb, selection_purchase_dropoff: AlertTriangle, rank_position_selection_gap: Info };
  const toneMap: Record<string, string> = { opportunity: "border-amber-500/30 bg-amber-500/5", warning: "border-rose-500/30 bg-rose-500/5", info: "border-blue-500/30 bg-blue-500/5" };
  const iconToneMap: Record<string, string> = { opportunity: "text-amber-500", warning: "text-rose-500", info: "text-blue-500" };
  const Icon = iconMap[insight.type] || Lightbulb;
  return (
    <div className={cn("rounded-lg border p-3 space-y-1.5", toneMap[insight.severity] || toneMap.info)}>
      <div className="flex items-start gap-2">
        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", iconToneMap[insight.severity] || iconToneMap.info)} />
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground leading-tight">{insight.title}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{insight.summary}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pl-6">
        <span className="capitalize">{insight.confidence}</span><span>·</span><span className="capitalize">{insight.severity}</span>
      </div>
    </div>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface LiveStats { totalOrders: number; grossRevenue: number; avgOrderValue: number; fulfillmentRate: number; conversionRate: number; agentOrders: number; agentSharePct: number; humanOrders: number; }
interface TimeSeriesItem { day: string; series: "Human" | "AI Agent"; orders: number; }
interface OrderItem { id: string; date: string; customer: string; city: string; items: string; amount: number; method: string; status: string; actor: "agent" | "shopper"; }
const DEFAULT_STATS: LiveStats = { totalOrders: 0, grossRevenue: 0, avgOrderValue: 0, fulfillmentRate: 0, conversionRate: 0, agentOrders: 0, agentSharePct: 0, humanOrders: 0 };

// ─── Shopper Tab ─────────────────────────────────────────────────────────────
function ShopperTab() {
  const txQuery = useQuery({ ...trpc.transactions.list.queryOptions() });
  const policyQuery = useQuery({ ...trpc.policies.get.queryOptions() });
  const transactions = txQuery.data || [];
  const policy = policyQuery.data;
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const totalSpent = transactions.reduce((s: number, t: any) => s + (t.amountInMinor || 0) / 100, 0);
    const consumed = policy?.consumedInMinor ? policy.consumedInMinor / 100 : 0;
    const budgetCap = policy?.maxTotalSpending ? policy.maxTotalSpending / 100 : 0;
    const budgetRemaining = budgetCap > 0 ? Math.max(0, budgetCap - consumed) : 0;
    const perOrderLimit = policy?.maxTransactionAmount ? policy.maxTransactionAmount / 100 : 0;
    const paidCount = transactions.filter((t: any) => ["PAYMENT_SUCCEEDED", "APPROVED", "PAID", "DELIVERED"].includes((t.status || "").toUpperCase())).length;
    const pendingCount = transactions.filter((t: any) => ["CREATED", "POLICY_CHECKING", "AWAITING_APPROVAL", "PAYMENT_PROCESSING"].includes((t.status || "").toUpperCase())).length;
    return { totalSpent, budgetCap, budgetRemaining, consumed, perOrderLimit, totalTx: transactions.length, paidCount, pendingCount };
  }, [transactions, policy]);

  const recentTx = useMemo(() => transactions.slice(0, 6), [transactions]);
  const handleCopy = (id: string, e: React.MouseEvent) => { e.stopPropagation(); navigator.clipboard.writeText(id); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); };

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
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-4 w-4 text-purple-400" />
        <h2 className="text-sm font-semibold text-foreground">Shopper Overview</h2>
      </div>

      {/* KPI Cards */}
      <div className="w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4">
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between"><span>Total Spent</span><Wallet className="h-3.5 w-3.5 text-muted-foreground" /></div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight"><FormattedAmount amount={stats.totalSpent} /></div>
            <div className="text-[11px] mt-1"><span className="text-muted-foreground">{stats.paidCount} paid · {stats.pendingCount} pending</span></div>
          </div>
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between"><span>Budget Remaining</span><IndianRupee className="h-3.5 w-3.5 text-muted-foreground" /></div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              {stats.budgetCap > 0 ? <FormattedAmount amount={stats.budgetRemaining} /> : <span className="text-muted-foreground text-lg">No limit</span>}
            </div>
            {stats.budgetCap > 0 && (
              <div className="mt-2">
                <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all duration-500", stats.consumed / stats.budgetCap > 0.8 ? "bg-rose-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, (stats.consumed / stats.budgetCap) * 100)}%` }} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 font-mono"><FormattedAmount amount={stats.consumed} /> of <FormattedAmount amount={stats.budgetCap} /></div>
              </div>
            )}
          </div>
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r-0 lg:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between"><span>Per-Order Limit</span><Shield className="h-3.5 w-3.5 text-muted-foreground" /></div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">
              {stats.perOrderLimit > 0 ? <FormattedAmount amount={stats.perOrderLimit} /> : <span className="text-muted-foreground text-lg">No limit</span>}
            </div>
            <div className="text-[11px] mt-1">
              <span className={cn("font-medium", policy?.requireUserApproval ? "text-amber-500" : "text-emerald-500")}>{policy?.requireUserApproval ? "Manual approval" : "Autonomous"}</span>
            </div>
          </div>
          <div className="p-4 sm:p-5 flex flex-col justify-between">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between"><span>Transactions</span><CreditCard className="h-3.5 w-3.5 text-muted-foreground" /></div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">{stats.totalTx}</div>
            <div className="text-[11px] mt-1"><span className="text-muted-foreground">{stats.paidCount} completed</span></div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground"><CreditCard className="h-4 w-4" /></div>
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
            <table className="w-full text-xs text-left">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground font-medium text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 font-mono">#</th>
                  <th className="px-4 py-2.5">Transaction ID</th>
                  <th className="px-4 py-2.5">Merchant</th>
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentTx.map((tx: any, idx: number) => {
                  const norm = (tx.status || "").toUpperCase();
                  let sl = "Pending", st = "bg-amber-500/10 border-amber-500/30 text-amber-500";
                  if (["PAYMENT_SUCCEEDED", "APPROVED", "PAID", "DELIVERED"].includes(norm)) { sl = "Paid"; st = "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"; }
                  else if (["FAILED", "CANCELLED", "PAYMENT_FAILED"].includes(norm)) { sl = "Failed"; st = "bg-rose-500/10 border-rose-500/30 text-rose-500"; }
                  else if (norm === "POLICY_BLOCKED") { sl = "Blocked"; st = "bg-rose-500/10 border-rose-500/30 text-rose-500"; }
                  const prod = tx.items || tx.rawQuery || "—";
                  const txId = tx.transactionId || tx.id;
                  const isCopied = copiedId === txId;
                  return (
                    <tr key={txId || idx} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-3"><div className="flex items-center gap-1.5"><span className="font-mono font-bold text-foreground">{(txId || "").slice(0, 12)}</span><button type="button" onClick={(e) => handleCopy(txId, e)} className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors cursor-pointer">{isCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}</button></div></td>
                      <td className="px-4 py-3 text-muted-foreground">{tx.merchantName || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">{prod}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-emerald-500 text-right"><FormattedAmount amount={(tx.amountInMinor || 0) / 100} /></td>
                      <td className="px-4 py-3 text-right"><span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium border", st)}>{sl}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Merchant Tab ────────────────────────────────────────────────────────────
function MerchantTab() {
  const [stats, setStats] = useState<LiveStats>(DEFAULT_STATS);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [funnel, setFunnel] = useState<{ stage: string; count: number; rate: string; drop: string }[]>([]);
  const [searchQueries, setSearchQueries] = useState<{ query: string; searches: number; suggestion: string }[]>([]);

  const accountQuery = useQuery({ ...trpc.merchantIntelligence.getAccount.queryOptions() });
  const activeMerchantId = accountQuery.data?.merchantId || "";
  const userSiteIds = accountQuery.data?.siteIds && accountQuery.data.siteIds.length > 0
    ? accountQuery.data.siteIds
    : (accountQuery.data?.primarySiteId ? [accountQuery.data.primarySiteId] : []);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  useEffect(() => { if (accountQuery.data?.primarySiteId && !selectedSiteId) setSelectedSiteId(accountQuery.data.primarySiteId); }, [accountQuery.data, selectedSiteId]);
  const activeSiteId = selectedSiteId || accountQuery.data?.primarySiteId || userSiteIds[0] || "";

  const overviewQuery = useQuery({ ...trpc.merchantIntelligence.overview.queryOptions() });
  const topProducts = overviewQuery.data?.topProducts || [];
  const insights = overviewQuery.data?.insights || [];

  useEffect(() => {
    async function load() {
      if (!activeMerchantId) return;
      try {
        const url = activeSiteId && activeSiteId !== "site_all" ? `/api/tracker/stats?site=${encodeURIComponent(activeSiteId)}` : "/api/tracker/stats?site=all";
        const res = await fetch(url);
        if (res.ok) {
          const d = await res.json();
          if (d.stats) setStats(d.stats);
          if (d.timeSeries) setTimeSeries(d.timeSeries);
          if (d.orders) setOrders(d.orders);
          if (d.funnel) setFunnel(d.funnel);
          if (d.searchQueries) setSearchQueries(d.searchQueries);
        }
      } catch (e) { console.error("Failed to fetch merchant stats:", e); }
    }
    load();
  }, [activeMerchantId, selectedSiteId, activeSiteId]);

  const recentOrders = useMemo(() => orders.slice(0, 8), [orders]);

  if (!activeMerchantId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Store className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <h2 className="text-sm font-semibold text-foreground">No merchant storefront yet</h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">Set up your merchant storefront to see analytics, conversion metrics, and AI agent intelligence.</p>
        <a href="/merchant/orders" className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 transition-colors mt-4">
          <Store className="h-3.5 w-3.5" /> Setup Storefront
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-purple-400" />
          <h2 className="text-sm font-semibold text-foreground">Merchant Intelligence</h2>
        </div>
        {userSiteIds.length > 1 && (
          <CustomSelect value={activeSiteId} onChange={(val) => setSelectedSiteId(val)} options={[
            ...userSiteIds.map((sId: string, idx: number) => ({ value: sId, label: sId === accountQuery.data?.primarySiteId ? "Primary Storefront" : `Storefront ${idx + 1}` })),
            { value: "site_all", label: "All Storefronts" },
          ]} />
        )}
      </div>

      {/* KPI Cards */}
      <div className="w-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between"><span>Total Orders</span><Package className="h-3.5 w-3.5 text-muted-foreground" /></div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">{stats.totalOrders.toLocaleString()}</div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1"><span className="text-emerald-500 font-medium whitespace-nowrap">↗ +14.8%</span><span className="text-muted-foreground truncate">{stats.agentOrders} Agent · {stats.humanOrders} Human</span></div>
          </div>
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between"><span>Gross Revenue</span><IndianRupee className="h-3.5 w-3.5 text-muted-foreground" /></div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight"><FormattedAmount amount={stats.grossRevenue} /></div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1"><span className="text-emerald-500 font-medium whitespace-nowrap">↗ +18.4%</span><span className="text-muted-foreground truncate">₹{Math.round(stats.agentOrders * (stats.avgOrderValue || 1500)).toLocaleString("en-IN")} via AI</span></div>
          </div>
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r-0 lg:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between"><span>Avg Order Value</span><TrendingUp className="h-3.5 w-3.5 text-muted-foreground" /></div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight"><FormattedAmount amount={stats.avgOrderValue} /></div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1"><span className="text-emerald-500 font-medium whitespace-nowrap">↗ +5.2%</span><span className="text-muted-foreground truncate">vs ₹{Math.round((stats.avgOrderValue || 1500) * 0.94).toLocaleString("en-IN")} prior</span></div>
          </div>
          <div className="p-4 sm:p-5 flex flex-col justify-between border-b sm:border-b-0 sm:border-r border-border/60">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between"><span>AI Agent Share</span><Bot className="h-3.5 w-3.5 text-muted-foreground" /></div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">{stats.agentSharePct}%</div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1"><span className="text-emerald-500 font-medium whitespace-nowrap">↗ +22.5%</span><span className="text-muted-foreground truncate">{stats.agentOrders} autonomous orders</span></div>
          </div>
          <div className="p-4 sm:p-5 flex flex-col justify-between">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between"><span>Conversion Rate</span><Zap className="h-3.5 w-3.5 text-muted-foreground" /></div>
            <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">{stats.conversionRate}%</div>
            <div className="text-[11px] flex items-center gap-1.5 mt-1"><span className="text-emerald-500 font-medium whitespace-nowrap">↗ +1.2%</span><span className="text-muted-foreground truncate">{stats.totalOrders} purchases / views</span></div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConversionFunnel data={funnel.length > 0 ? funnel : [
          { stage: "Store Visits", count: 0, rate: "100%", drop: "—" },
          { stage: "Product Views", count: 0, rate: "0%", drop: "—" },
          { stage: "Cart Additions", count: 0, rate: "0%", drop: "—" },
          { stage: "Checkout Started", count: 0, rate: "0%", drop: "—" },
          { stage: "Purchases", count: 0, rate: "0%", drop: "—" },
        ]} />
        <BarChartStacked data={timeSeries} totalOrders={stats.totalOrders} agentOrders={stats.agentOrders} humanOrders={stats.humanOrders} />
      </div>

      {/* Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SearchQueriesPanel data={searchQueries} />
        <AgentRadarChart agentSharePct={stats.agentSharePct} />
      </div>

      {/* Products + Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between pb-3">
            <h2 className="text-sm font-semibold text-foreground">Top Products</h2>
            <span className="text-[11px] text-muted-foreground">{topProducts.length} products</span>
          </div>
          {topProducts.length === 0 ? <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">No product data yet</div> : (
            <div className="space-y-2">
              {topProducts.slice(0, 5).map((p: any, i: number) => (
                <div key={p.productId || i} className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground font-medium truncate max-w-[65%]">{p.title}</span>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono shrink-0">
                      <span>{p.timesSelected || 0} sel</span>
                      <span>{p.conversionRate != null ? `${(p.conversionRate * 100).toFixed(1)}%` : "—"} conv</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
                    <span>{p.merchant || "—"}</span>
                    <span>{p.selectionRate != null ? `${(p.selectionRate * 100).toFixed(1)}%` : "—"} selection</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between pb-3">
            <h2 className="text-sm font-semibold text-foreground">Merchant Insights</h2>
            <span className="text-[11px] text-muted-foreground">{insights.length} insights</span>
          </div>
          {insights.length === 0 ? <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">No insights available</div> : (
            <div className="space-y-2">{insights.slice(0, 4).map((ins: any) => <InsightCard key={ins.id} insight={ins} />)}</div>
          )}
        </div>
      </div>

      {/* Recent Orders */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground"><ShoppingBag className="h-4 w-4" /></div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Recent Store Orders</h2>
          </div>
          <a href="/merchant/orders" className="text-[11px] text-purple-400 hover:text-purple-300 font-medium transition-colors">View all →</a>
        </div>
        {recentOrders.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-border bg-background text-center">
            <ShoppingBag className="mb-2 h-6 w-6 text-muted-foreground/40" /><p className="text-xs font-medium text-foreground">No orders yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground font-medium text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 font-mono">#</th>
                  <th className="px-4 py-2.5">Order ID</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Items</th>
                  <th className="px-4 py-2.5">Payment</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentOrders.map((o, idx) => {
                  const norm = (o.status || "").toUpperCase();
                  let sl = "Pending", st = "bg-amber-500/10 border-amber-500/30 text-amber-500";
                  if (["CONFIRMED", "PAID", "PAYMENT_SUCCEEDED", "APPROVED", "DELIVERED"].includes(norm)) { sl = "Paid"; st = "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"; }
                  else if (["FAILED", "CANCELLED"].includes(norm)) { sl = "Failed"; st = "bg-rose-500/10 border-rose-500/30 text-rose-500"; }
                  return (
                    <tr key={`${o.id}-${idx}`} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-3 font-mono font-bold text-foreground">{o.id.slice(0, 14)}</td>
                      <td className="px-4 py-3"><div className="flex items-center gap-1.5"><span className="font-medium text-foreground">{o.customer}</span>{o.actor === "agent" && <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.2 text-[10px] font-semibold text-purple-400">AI</span>}</div></td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{o.items}</td>
                      <td className="px-4 py-3 text-muted-foreground">{o.method}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-emerald-500 text-right"><FormattedAmount amount={o.amount} /></td>
                      <td className="px-4 py-3 text-right"><span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium border", st)}>{sl}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
type Tab = "shopper" | "merchant";

export default function Dashboard({ session }: { session: any }) {
  const [activeTab, setActiveTab] = useState<Tab>("shopper");

  // Check what the user has access to
  const accountQuery = useQuery({ ...trpc.merchantIntelligence.getAccount.queryOptions() });
  const txQuery = useQuery({ ...trpc.transactions.list.queryOptions() });
  const hasMerchantAccount = Boolean(accountQuery.data?.merchantId);
  const hasTransactions = (txQuery.data || []).length > 0;

  // Auto-select first available tab
  useEffect(() => {
    if (!hasTransactions && hasMerchantAccount) setActiveTab("merchant");
  }, [hasTransactions, hasMerchantAccount]);

  const tabs: { id: Tab; label: string; icon: typeof ShoppingCart; show: boolean }[] = [
    { id: "shopper", label: "Shopper", icon: ShoppingCart, show: true },
    { id: "merchant", label: "Merchant", icon: Store, show: true },
  ];

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Welcome back{session?.user?.name ? `, ${session.user.name}` : ""}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeTab === "shopper" ? "Your shopping activity, transactions, and spending policy." : "Storefront overview, conversion metrics, and AI agent intelligence."}
          </p>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg border border-border">
          {tabs.filter((t) => t.show).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  activeTab === tab.id
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "shopper" ? <ShopperTab /> : <MerchantTab />}
    </div>
  );
}
