import { auth } from "@cartwright/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ChatClient from "./chat-client";

export default async function ChatPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/signin");
  return <ChatClient />;
}
