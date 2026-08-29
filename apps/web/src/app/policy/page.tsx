import { auth } from "@cartwright/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import PolicySettings from "./policy-settings";

export default async function PolicyPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/signin");
  }

  return <PolicySettings />;
}
