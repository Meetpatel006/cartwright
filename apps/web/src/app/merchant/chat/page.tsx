import { auth } from "@cartwright/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ChatClient from "./chat-client";

// Session check must run per request; keep this auth-gated page out of the
// static shell (Cache Components).
export const instant = false;

export default async function ChatPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");
  return <ChatClient />;
}
