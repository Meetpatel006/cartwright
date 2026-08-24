import { auth } from "@cartwright/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import MerchantDashboard from "./merchant-dashboard";

export default async function MerchantIntelligencePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return <MerchantDashboard />;
}
