import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@cartwright/ui/components/sidebar';
import { AppSidebar } from '@cartwright/ui/components/nav-sidebar/app-sidebar';
import type { ShoppingSession, User } from '@cartwright/ui/components/nav-sidebar/types';

interface NavSidebarProps {
  children: React.ReactNode;
  user?: User;
  shoppingSessions?: ShoppingSession[];
  activeSessionId?: string | null;
  onSelectSession?: (sessionId: string) => void;
  onNewSession?: () => void;
}

export default function NavSidebar({
  children,
  user,
  shoppingSessions = [],
  activeSessionId,
  onSelectSession,
  onNewSession,
}: NavSidebarProps) {
  return (
    <SidebarProvider>
      <AppSidebar
        user={user}
        shoppingSessions={shoppingSessions}
        activeSessionId={activeSessionId}
        onSelectSession={onSelectSession}
        onNewSession={onNewSession}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="sm:hidden" />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
