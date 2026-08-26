'use client';
import { ChevronDown, MessageSquare } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@cartwright/ui/components/collapsible';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@cartwright/ui/components/sidebar';
import type { ShoppingSession } from '@cartwright/ui/components/nav-sidebar/types';

interface NavCollapsibleProps {
  sessions: ShoppingSession[];
  activeSessionId?: string | null;
  onSelectSession?: (sessionId: string) => void;
}

export function NavCollapsible({
  sessions,
  activeSessionId,
  onSelectSession,
}: NavCollapsibleProps) {
  if (!sessions || sessions.length === 0) {
    return null;
  }

  const statusTone = (status: string) => {
    switch (status) {
      case 'PAYMENT_SUCCEEDED':
        return 'text-green-500';
      case 'CANCELLED':
      case 'PAYMENT_FAILED':
        return 'text-red-500';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className="space-y-0">
      <Collapsible className="group/collapsible" defaultOpen>
        <SidebarGroup>
          <SidebarGroupLabel
            className="text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            render={<CollapsibleTrigger />}
          >
            Chat / Sessions
            <ChevronDown className="ml-auto transition-transform group-data-open/collapsible:rotate-180" />
          </SidebarGroupLabel>
          <CollapsibleContent>
            <SidebarGroupContent>
              <SidebarMenu>
                {sessions.map((session) => (
                  <SidebarMenuItem key={session.sessionId}>
                    <SidebarMenuButton
                      isActive={session.sessionId === activeSessionId}
                      render={
                        <button
                          className="flex w-full items-center gap-2 text-left"
                          onClick={() => onSelectSession?.(session.sessionId)}
                        />
                      }
                    >
                      <MessageSquare className="h-4 w-4 shrink-0" />
                      <div className="flex flex-col overflow-hidden">
                        <span className="truncate text-xs font-medium">
                          {session.rawQuery}
                        </span>
                        <span className="truncate text-[10px] font-mono text-muted-foreground">
                          {session.sessionId.slice(0, 8)}…
                          <span className={`ml-1 ${statusTone(session.status)}`}>
                            ({session.status})
                          </span>
                        </span>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    </div>
  );
}
