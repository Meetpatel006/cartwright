import { auth } from "@cartwright/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ChatClient from "../chat-client";

export default async function ChatThreadPage({ params }: { params: Promise<{ chatId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");
  const { chatId } = await params;
  return <ChatClient initialChatId={chatId} />;
}
