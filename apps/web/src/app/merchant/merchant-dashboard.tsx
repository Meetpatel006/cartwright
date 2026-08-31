"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Code2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  ShoppingCart,
  Bot,
  Search,
  IndianRupee,
  Zap,
  Plus,
  Globe,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@cartwright/ui/lib/utils";
import { trpc } from "@/utils/trpc";

type Preset = "24h" | "7d" | "15d" | "30d";

const PRESET_LABEL: Record<Preset, string> = {
  "24h": "24H",
  "7d": "7D",
  "15d": "15D",
  "30d": "30D",
};

function formatPct(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

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

export default function MerchantDashboard() {
  const [preset, setPreset] = useState<Preset>("15d");
  const [copied, setCopied] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [platform, setPlatform] = useState<"universal" | "nextjs">("universal");
  const queryClient = useQueryClient();

  const accountQuery = useQuery({
    ...trpc.merchantIntelligence.getAccount.queryOptions(),
  });

  const [selectedSiteId, setSelectedSiteId] = useState<string>("");

  const activeMerchantId = accountQuery.data?.merchantId || "";
  const availableSiteIds = accountQuery.data?.siteIds && accountQuery.data.siteIds.length > 0
    ? accountQuery.data.siteIds
    : (accountQuery.data?.primarySiteId ? [accountQuery.data.primarySiteId] : []);
  
  const activeSiteId = selectedSiteId || accountQuery.data?.primarySiteId || availableSiteIds[0] || "";

  useEffect(() => {
    if (accountQuery.data?.primarySiteId && !selectedSiteId) {
      setSelectedSiteId(accountQuery.data.primarySiteId);
    }
  }, [accountQuery.data, selectedSiteId]);

  const createSiteMutation = useMutation({
    ...trpc.merchantIntelligence.createSite.mutationOptions(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: trpc.merchantIntelligence.getAccount.queryKey() });
      if (data.siteIds && data.siteIds.length > 0) {
        const newest = data.siteIds[data.siteIds.length - 1]!;
        setSelectedSiteId(newest);
        toast.success(`New Storefront Site generated: ${newest}`);
      }
    },
    onError: (err) => {
      toast.error(`Failed to generate new site: ${err.message}`);
    },
  });

  const [liveStats, setLiveStats] = useState({
    grossRevenue: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    conversionRate: 0,
    aiAgentShare: 0,
    agentOrders: 0,
  });

  const [funnelData, setFunnelData] = useState([
    { stage: "Store Visits", count: 0, rate: "100%", drop: "—" },
    { stage: "Product Views", count: 0, rate: "0%", drop: "—" },
    { stage: "Cart Additions", count: 0, rate: "0%", drop: "—" },
    { stage: "Checkout Started", count: 0, rate: "0%", drop: "—" },
    { stage: "Purchases", count: 0, rate: "0%", drop: "—" },
  ]);

  const [zeroResultQueries, setZeroResultQueries] = useState<Array<{
    query: string;
    searches: number;
    missedRevenue: number;
    suggestion: string;
  }>>([]);

  useEffect(() => {
    async function fetchStats() {
      if (!activeMerchantId) return;
      try {
        const queryUrl = activeSiteId
          ? `/api/tracker/stats?site=${encodeURIComponent(activeSiteId)}`
          : "/api/tracker/stats";
        const res = await fetch(queryUrl);
        if (res.ok) {
          const data = await res.json();
          if (data.stats) {
            setLiveStats({
              grossRevenue: data.stats.grossRevenue || 0,
              totalOrders: data.stats.totalOrders || 0,
              avgOrderValue: data.stats.avgOrderValue || 0,
              conversionRate: data.stats.conversionRate ? data.stats.conversionRate / 100 : 0,
              aiAgentShare: data.stats.agentSharePct ? data.stats.agentSharePct / 100 : 0,
              agentOrders: data.stats.agentOrders || 0,
            });
          }
          if (data.funnel && data.funnel.length > 0) {
            setFunnelData(data.funnel);
          }
          if (data.searchQueries) {
            setZeroResultQueries(data.searchQueries);
          }
        }
      } catch (e) {
        console.error("Failed to fetch live stats in dashboard:", e);
      }
    }
    fetchStats();
  }, [activeMerchantId, activeSiteId]);

  const snippet =
    platform === "universal"
      ? `<!-- Cartwright Universal Storefront Tracker -->
<script
  src="https://your-domain.com/tracker/v1.js"
  data-merchant="${activeMerchantId}"
  data-site="${activeSiteId}"
  async>
</script>`
      : `// Next.js layout.tsx
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://your-domain.com/tracker/v1.js"
          data-merchant="${activeMerchantId}"
          data-site="${activeSiteId}"
          strategy="afterInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success("Snippet copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const storeGrossRevenue = liveStats.grossRevenue;
  const storeTotalOrders = liveStats.totalOrders;
  const storeAov = liveStats.avgOrderValue;
  const storeConversionRate = liveStats.conversionRate;
  const storeAiAgentShare = liveStats.aiAgentShare;

  const productMatrix = [
    { title: "boAt Airdopes 141 ANC TWS Earbuds", category: "Audio", views: 412, carts: 224, orders: 148, conv: 0.359, badge: "High Volume" },
    { title: "boAt Stone 352 Portable Wireless Speaker", category: "Speakers", views: 310, carts: 145, orders: 82, conv: 0.264, badge: "Steady Margin" },
    { title: "boAt Nirvana Ion ANC 120H Earbuds", category: "Audio", views: 245, carts: 38, orders: 14, conv: 0.057, badge: "Price Friction" },
    { title: "boAt Rockerz 450 Bluetooth Headphones", category: "Headphones", views: 198, carts: 92, orders: 54, conv: 0.272, badge: "Fast Moving" },
  ];

  const agentRuns = [
    { prompt: "Find best rated ANC wireless earbuds under 2500 INR with fast charging", model: "gemini-1.5-pro", runs: 24, status: "Cart added" },
    { prompt: "Find waterproof portable bluetooth speaker with 10W output", model: "claude-3-5-sonnet", runs: 16, status: "Selected Stone 352" },
    { prompt: "Compare wireless neckbands with battery life >30 hours", model: "gpt-4o", runs: 8, status: "Selected Rockerz 255" },
  ];

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6 text-foreground">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Storefront telemetry, conversion funnel, and shopping metrics.
          </p>
        </div>

        {/* Preset Selector */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg border border-border">
          {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                p === preset
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {PRESET_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Gross Revenue</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2">
            <FormattedAmount amount={storeGrossRevenue} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">+18.4% vs last window</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Conversion Rate</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2">
            {formatPct(storeConversionRate)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">4.3% store average</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Average Order Value</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2">
            <FormattedAmount amount={storeAov} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">{storeTotalOrders} total orders</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">AI Agent Share</div>
          <div className="text-2xl font-bold font-mono text-purple-500 mt-2">
            {formatPct(storeAiAgentShare)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">48 autonomous runs</div>
        </div>
      </div>

      {/* Tracker Script Card */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
          <div className="flex items-center gap-2">
            <Code2 className="size-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-foreground">Storefront Tracker Snippet</h2>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted cursor-pointer"
          >
            {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3 text-muted-foreground" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="text-muted-foreground mb-1 block font-medium">Merchant ID (Permanent)</label>
            <div className="flex items-center gap-1.5 rounded-md border border-input bg-muted/30 px-2.5 py-1.5 font-mono text-xs text-foreground">
              <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{activeMerchantId}</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-muted-foreground block font-medium">Active Storefront Site ID</label>
              <button
                type="button"
                onClick={() => createSiteMutation.mutate()}
                disabled={createSiteMutation.isPending}
                className="text-[11px] text-purple-400 hover:text-purple-300 font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Plus className="size-3" />
                {createSiteMutation.isPending ? "Generating..." : "Generate New Site"}
              </button>
            </div>
            <select
              value={activeSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-xs text-foreground focus:border-ring focus:outline-none cursor-pointer"
            >
              {availableSiteIds.map((sId) => (
                <option key={sId} value={sId}>
                  {sId} {sId === accountQuery.data?.primarySiteId ? "(Primary)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative rounded-md border border-border bg-muted/40 p-2.5 font-mono text-[11px] text-foreground">
          <pre className="overflow-x-auto whitespace-pre-wrap">{snippet}</pre>
        </div>
      </div>

      {/* 5-Stage Conversion Funnel */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
          <h2 className="text-xs font-semibold text-foreground">Conversion Funnel</h2>
          <span className="text-xs font-mono text-muted-foreground">Total Conv: <strong className="text-foreground">{formatPct(storeConversionRate)}</strong></span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {funnelData.map((f, i) => (
            <div key={f.stage} className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col justify-between">
              <div>
                <div className="text-[11px] text-muted-foreground">{f.stage}</div>
                <div className="text-lg font-bold font-mono text-foreground mt-1">{f.count.toLocaleString()}</div>
              </div>
              <div className="mt-2 pt-2 border-t border-border/80 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{f.rate}</span>
                {i > 0 && <span className="text-red-500 font-mono">{f.drop}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2 Column: Agent Intel + Search Demand */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <h2 className="text-xs font-semibold text-foreground">AI Agent Prompt Samples</h2>
            <span className="text-[11px] text-purple-400 font-mono">48 runs</span>
          </div>

          <div className="space-y-2">
            {agentRuns.map((agent, i) => (
              <div key={i} className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-purple-400 font-medium">{agent.model}</span>
                  <span className="text-muted-foreground font-mono">{agent.runs} runs</span>
                </div>
                <p className="text-foreground text-[11px]">"{agent.prompt}"</p>
                <div className="text-[10px] text-muted-foreground">{agent.status}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <h2 className="text-xs font-semibold text-foreground">0-Result Search Demand</h2>
            <span className="text-[11px] text-muted-foreground">Missed demand</span>
          </div>

          <div className="space-y-2">
            {zeroResultQueries.map((gap, i) => (
              <div key={i} className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-foreground font-medium">"{gap.query}"</span>
                  <span className="font-mono text-muted-foreground text-[11px]">{gap.searches} queries</span>
                </div>
                <p className="text-muted-foreground text-[11px]">{gap.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Product Merchandising Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-xs font-semibold text-foreground">Catalog Conversion Rates</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b border-border bg-muted/50 text-muted-foreground font-medium text-[11px]">
              <tr>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Views</th>
                <th className="px-3 py-2.5">Carts</th>
                <th className="px-3 py-2.5">Orders</th>
                <th className="px-3 py-2.5">Conv</th>
                <th className="px-4 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {productMatrix.map((p, idx) => (
                <tr key={idx} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{p.title}</td>
                  <td className="px-3 py-3 text-muted-foreground">{p.category}</td>
                  <td className="px-3 py-3 font-mono text-muted-foreground">{p.views}</td>
                  <td className="px-3 py-3 font-mono text-muted-foreground">{p.carts}</td>
                  <td className="px-3 py-3 font-mono text-foreground">{p.orders}</td>
                  <td className="px-3 py-3 font-mono text-muted-foreground">{formatPct(p.conv)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-[11px] text-muted-foreground font-medium">
                      {p.badge}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
