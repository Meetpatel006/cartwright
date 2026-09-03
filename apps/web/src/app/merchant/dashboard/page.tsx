import { auth } from "@cartwright/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { MerchantTab } from "@/components/dashboard/merchant-tab";

export default async function MerchantDashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/signin");
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6 text-foreground">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Merchant Dashboard
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Storefront overview, conversion metrics, and AI agent intelligence.
        </p>
      </div>
      <MerchantTab />
    </div>
  );
}
