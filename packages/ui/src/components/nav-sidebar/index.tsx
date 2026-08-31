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
      <SidebarInset className="overflow-hidden h-screen max-h-screen flex flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 sm:hidden">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger />
          </div>
        </header>
        <div className="flex-1 min-w-0 h-full overflow-y-auto flex flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
