import { auth } from "@cartwright/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import ShopperClient from "./shopper-client";

export default async function ShopperPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/signin");
  }

  return <ShopperClient />;
}
