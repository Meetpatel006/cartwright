"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import { ShopperTab } from "@/components/dashboard/shopper-tab";
import { DashboardSkeleton } from "@/components/dashboard/loading-states";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = authClient.useSession();

  const accountQuery = useQuery({ ...trpc.merchantIntelligence.getAccount.queryOptions() });
  const txQuery = useQuery({ ...trpc.transactions.list.queryOptions() });
  const hasMerchantAccount = Boolean(accountQuery.data?.merchantId);
  const hasTransactions = (txQuery.data || []).length > 0;

  useEffect(() => {
    if (!sessionLoading && !session?.user) router.push("/login");
  }, [session, sessionLoading, router]);

  useEffect(() => {
    if (!hasTransactions && hasMerchantAccount) router.push("/merchant/dashboard");
  }, [hasTransactions, hasMerchantAccount, router]);

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
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Welcome back{session.user.name ? `, ${session.user.name}` : ""}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your shopping activity, transactions, and spending policy.
        </p>
      </div>

      {/* Tab Content */}
      <ShopperTab />
    </div>
  );
}
