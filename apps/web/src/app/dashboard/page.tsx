"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ShoppingCart, Store } from "lucide-react";
import { cn } from "@cartwright/ui/lib/utils";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import { ShopperTab } from "@/components/dashboard/shopper-tab";
import { MerchantTab } from "@/components/dashboard/merchant-tab";
import { DashboardSkeleton } from "@/components/dashboard/loading-states";

type Tab = "shopper" | "merchant";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const [activeTab, setActiveTab] = useState<Tab>("shopper");

  const accountQuery = useQuery({ ...trpc.merchantIntelligence.getAccount.queryOptions() });
  const txQuery = useQuery({ ...trpc.transactions.list.queryOptions() });
  const hasMerchantAccount = Boolean(accountQuery.data?.merchantId);
  const hasTransactions = (txQuery.data || []).length > 0;

  useEffect(() => {
    if (!sessionLoading && !session?.user) router.push("/signin");
  }, [session, sessionLoading, router]);

  useEffect(() => {
    if (!hasTransactions && hasMerchantAccount) setActiveTab("merchant");
  }, [hasTransactions, hasMerchantAccount]);

  const tabs: { id: Tab; label: string; icon: typeof ShoppingCart; show: boolean }[] = [
    { id: "shopper", label: "Shopper", icon: ShoppingCart, show: true },
    { id: "merchant", label: "Merchant", icon: Store, show: true },
  ];

  if (sessionLoading || accountQuery.isLoading || txQuery.isLoading) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6 text-foreground">
        <div className="space-y-1">
          <div className="h-6 w-48 animate-pulse rounded bg-muted/60" />
          <div className="h-3 w-72 animate-pulse rounded bg-muted/60" />
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  if (!session?.user) return null;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Welcome back{session.user.name ? `, ${session.user.name}` : ""}
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
