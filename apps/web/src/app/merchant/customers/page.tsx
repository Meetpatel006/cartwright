"use client";

import { useState } from "react";
import { Search, Bot, User } from "lucide-react";
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

const MOCK_CUSTOMERS = [
  { id: "USR-01", name: "Rahul Sharma", email: "rahul@example.com", location: "Bengaluru, KA", orders: 4, spend: 5996, isAgent: false, lastActive: "Aug 31" },
  { id: "USR-02", name: "Autonomous AI Agent", email: "agent@cartwright.ai", location: "Cloud (IN-West)", orders: 3, spend: 4697, isAgent: true, lastActive: "Aug 31" },
  { id: "USR-03", name: "Pooja Verma", email: "pooja@example.com", location: "Delhi NCR, DL", orders: 2, spend: 2998, isAgent: false, lastActive: "Aug 31" },
  { id: "USR-04", name: "Ananya Iyer", email: "ananya@example.com", location: "Chennai, TN", orders: 3, spend: 6497, isAgent: false, lastActive: "Aug 30" },
  { id: "USR-05", name: "Stagehand Agent", email: "agent@stagehand.dev", location: "Cloud (IN-South)", orders: 2, spend: 2598, isAgent: true, lastActive: "Aug 30" },
  { id: "USR-06", name: "Vikram Malhotra", email: "vikram@example.com", location: "Hyderabad, TS", orders: 1, spend: 999, isAgent: false, lastActive: "Aug 30" },
  { id: "USR-07", name: "Karan Patel", email: "karan@example.com", location: "Ahmedabad, GJ", orders: 2, spend: 2598, isAgent: false, lastActive: "Aug 29" },
  { id: "USR-08", name: "Browserbase Agent", email: "agent@browserbase.com", location: "Cloud (IN-Central)", orders: 4, spend: 7996, isAgent: true, lastActive: "Aug 29" },
];

export default function MerchantCustomersPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCustomers = MOCK_CUSTOMERS.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6 text-foreground">
      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Customers</h1>
        <p className="text-xs text-muted-foreground">
          Buyer profiles, geographic distribution, and lifetime order spend.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Unique Customers</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2">128</div>
          <div className="text-[11px] text-muted-foreground mt-1">20 cities</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Repeat Rate</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2">28.4%</div>
          <div className="text-[11px] text-muted-foreground mt-1">36 repeat buyers</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">Top City</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2">Bengaluru</div>
          <div className="text-[11px] text-muted-foreground mt-1">18.5% of buyers</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">AI Agents</div>
          <div className="text-2xl font-bold font-mono text-purple-500 mt-2">12</div>
          <div className="text-[11px] text-muted-foreground mt-1">Avg spend: ₹2,410</div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden space-y-3">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Customer Directory</h2>
            <p className="text-xs text-muted-foreground">Verified buyer accounts</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
            <input
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground shadow-xs focus:border-ring focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b border-border bg-muted/50 text-muted-foreground font-medium text-[11px]">
              <tr>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Location</th>
                <th className="px-3 py-2.5">Orders</th>
                <th className="px-3 py-2.5">Total Spend</th>
                <th className="px-4 py-2.5 text-right">Last Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCustomers.map((c) => (
                <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <div>{c.name}</div>
                    <div className="text-[11px] text-muted-foreground font-normal">{c.email}</div>
                  </td>
                  <td className="px-3 py-3">
                    {c.isAgent ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                        <Bot className="size-3" /> AI Agent
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <User className="size-3" /> Human
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{c.location}</td>
                  <td className="px-3 py-3 font-mono text-muted-foreground">{c.orders}</td>
                  <td className="px-3 py-3 font-mono text-emerald-500 font-semibold">
                    <FormattedAmount amount={c.spend} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">{c.lastActive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
