import { auth } from "@cartwright/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import ShopperClient from "../shopper-client";

// Session check + dynamic sessionId must run per request; keep this
// auth-gated page out of the static shell (Cache Components).
export const instant = false;

export default async function ShopperSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const { sessionId } = await params;

  return <ShopperClient initialSessionId={sessionId} />;
}
