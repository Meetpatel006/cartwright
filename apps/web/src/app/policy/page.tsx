import type { Metadata } from "next";
import { auth } from "@cartwright/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import PolicySettings from "./policy-settings";

export const metadata: Metadata = {
  title: "Spending Policy & Guardrails | Cartwright",
  description: "Configure financial boundaries, automated limits, and merchant access controls.",
};

export default async function PolicyPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/signin");
  }

  return <PolicySettings />;
}
