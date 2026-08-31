"use client";

import { cn } from "@cartwright/ui/lib/utils";

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

const SALES_PRODUCTS = [
  { title: "boAt Airdopes 141 ANC TWS Earbuds", units: 148, revenue: 221852, share: "38.2%", trend: "+24%" },
  { title: "boAt Stone 352 Wireless Portable Speaker", units: 82, revenue: 139318, share: "24.0%", trend: "+18%" },
  { title: "boAt Rockerz 450 Bluetooth Headphones", units: 54, revenue: 80946, share: "14.0%", trend: "+9%" },
  { title: "boAt Nirvana Ion ANC 120H Earbuds", units: 14, revenue: 34986, share: "6.0%", trend: "+4%" },
  { title: "boAt Rockerz 255 Pro+ Neckband", units: 26, revenue: 33774, share: "5.8%", trend: "+12%" },
];

export default function MerchantSalesPage() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6 text-foreground">
      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Sales</h1>
        <p className="text-xs text-muted-foreground">
          Gross sales volume, average order values, and catalog revenue distribution.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">15-Day Gross Sales</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2">
            <FormattedAmount amount={118420} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">+18.4% vs prior window</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Average Order Value</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2">
            <FormattedAmount amount={1499} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">79 total orders</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">UPI Share</div>
          <div className="text-2xl font-bold font-mono text-blue-500 mt-2">74.0%</div>
          <div className="text-[11px] text-muted-foreground mt-1">₹87,600 via UPI</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">AI-Driven Revenue</div>
          <div className="text-2xl font-bold font-mono text-purple-500 mt-2">
            <FormattedAmount amount={18200} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">15.4% of volume</div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-xs font-semibold text-foreground">Catalog Revenue Contribution</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b border-border bg-muted/50 text-muted-foreground font-medium text-[11px]">
              <tr>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-3 py-2.5">Units</th>
                <th className="px-3 py-2.5">Revenue</th>
                <th className="px-3 py-2.5">Share</th>
                <th className="px-4 py-2.5 text-right">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SALES_PRODUCTS.map((p, idx) => (
                <tr key={idx} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{p.title}</td>
                  <td className="px-3 py-3 font-mono text-muted-foreground">{p.units}</td>
                  <td className="px-3 py-3 font-mono text-emerald-500 font-semibold">
                    <FormattedAmount amount={p.revenue} />
                  </td>
                  <td className="px-3 py-3 font-mono text-muted-foreground">{p.share}</td>
                  <td className="px-4 py-3 text-right font-mono text-foreground">{p.trend}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
