import { auth } from "@cartwright/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import TransactionsList from "./transactions-list";

// Session check must run per request; keep this auth-gated page out of the
// static shell (Cache Components).
export const instant = false;

export default async function TransactionsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return <TransactionsList />;
}
