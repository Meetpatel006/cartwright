import type { Metadata } from "next";
import { auth } from "@cartwright/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import PolicySettings from "./policy-settings";

export const metadata: Metadata = {
  title: "Spending Policy & Guardrails | Cartwright",
  description: "Configure financial boundaries, automated limits, and merchant access controls.",
};

// Session check must run per request; keep this auth-gated page out of the
// static shell (Cache Components).
export const instant = false;

export default async function PolicyPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return <PolicySettings />;
}
