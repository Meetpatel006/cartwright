import { auth } from "@cartwright/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ChatClient from "../chat-client";

// Session check + dynamic chatId must run per request; keep this auth-gated
// page out of the static shell (Cache Components).
export const instant = false;

export default async function ChatThreadPage({ params }: { params: Promise<{ chatId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");
  const { chatId } = await params;
  return <ChatClient initialChatId={chatId} />;
}
