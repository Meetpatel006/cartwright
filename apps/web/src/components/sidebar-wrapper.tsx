"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";

import NavSidebar from "@cartwright/ui/components/nav-sidebar";
import type { ShoppingSession } from "@cartwright/ui/components/nav-sidebar/types";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export default function SidebarWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();

  // Extract sessionId from URL like /shopper/abc-123
  const activeSessionId = useMemo(() => {
    const match = pathname.match(/^\/shopper\/([\w-]+)$/);
    return match ? match[1] : null;
  }, [pathname]);

  const sessionsList = useQuery(trpc.shopping.list.queryOptions());

  const sessions: ShoppingSession[] = (sessionsList.data ?? []).map((s) => ({
    sessionId: s.sessionId,
    rawQuery: s.rawQuery,
    status: s.status,
    createdAt: s.createdAt,
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

  return (
    <NavSidebar
      user={user}
      shoppingSessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={handleSelectSession}
    >
      {children}
    </NavSidebar>
  );
}
