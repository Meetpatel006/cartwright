"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";

import NavSidebar from "@cartwright/ui/components/nav-sidebar";
import type { ShoppingSession, MerchantChat } from "@cartwright/ui/components/nav-sidebar/types";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

/** Routes that should render without the sidebar shell. */
const SIDEBAR_FREE_ROUTES = ["/", "/login", "/signin", "/signup"];

export default function SidebarWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();

  const showSidebar = !SIDEBAR_FREE_ROUTES.includes(pathname);

  // Extract sessionId from URL like /shopper/abc-123
  const activeSessionId = useMemo(() => {
    const match = pathname.match(/^\/shopper\/([\w-]+)$/);
    return match ? match[1] : null;
  }, [pathname]);

  // Extract chatId from URL like /merchant/chat/abc-123
  const activeChatId = useMemo(() => {
    const match = pathname.match(/^\/merchant\/chat\/([\w-]+)$/);
    return match ? match[1] : null;
  }, [pathname]);

  const sessionsList = useQuery({
    ...trpc.shopping.list.queryOptions(),
    enabled: showSidebar && Boolean(session?.user),
  });

  const sessions: ShoppingSession[] = (sessionsList.data ?? []).map((s) => ({
    sessionId: s.sessionId,
    rawQuery: s.rawQuery,
    status: s.status,
    createdAt: s.createdAt,
    store: s.store,
  }));

  const user = session?.user
    ? {
        name: session.user.name || 'User',
        email: session.user.email || '',
        avatar: session.user.image || '',
      }
    : undefined;

  const handleSelectSession = (sessionId: string) => {
    router.push(`/shopper/${sessionId}`);
  };

  // Merchant chats
  const merchantChatsList = useQuery({
    ...trpc.merchantChat.list.queryOptions(),
    enabled: showSidebar && Boolean(session?.user),
  });

  const merchantChats: MerchantChat[] = (merchantChatsList.data ?? []).map((c) => ({
    chatId: c.id,
    title: c.title,
    lastMessage: "",
    createdAt: String(c.createdAt),
    updatedAt: String(c.updatedAt),
  }));

  const handleSelectChat = (chatId: string) => {
    router.push(`/merchant/chat/${chatId}` as any);
  };

  const handleNewChat = () => {
    router.push('/merchant/chat' as any);
  };

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
          router.refresh();
        },
        onError: (ctx) => {
          toast.error(ctx.error.message || "Failed to log out. Please try again.");
        },
      },
    });
  };

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <NavSidebar
      user={user}
      shoppingSessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={handleSelectSession}
      onNewSession={() => router.push('/shopper')}
      merchantChats={merchantChats}
      activeChatId={activeChatId}
      onSelectChat={handleSelectChat}
      onNewChat={handleNewChat}
      onLogout={handleLogout}
    >
      {children}
    </NavSidebar>
  );
}
