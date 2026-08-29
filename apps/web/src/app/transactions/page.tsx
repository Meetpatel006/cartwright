import { auth } from "@cartwright/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import TransactionsList from "./transactions-list";

export default async function TransactionsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/signin");
  }

  return <TransactionsList />;
}
