import { auth } from "@cartwright/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import ShopperClient from "./shopper-client";

// Session check must run per request; keep this auth-gated page out of the
// static shell (Cache Components) rather than blocking prerender with headers().
export const instant = false;

export default async function ShopperPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return <ShopperClient />;
}
