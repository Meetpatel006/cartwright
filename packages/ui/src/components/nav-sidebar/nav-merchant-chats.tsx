'use client';

import {
  ChevronDown,
  Plus,
  MessageSquare,
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@cartwright/ui/components/collapsible';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from '@cartwright/ui/components/sidebar';
import { cn } from '@cartwright/ui/lib/utils';
import type { MerchantChat } from '@cartwright/ui/components/nav-sidebar/types';

interface NavMerchantChatsProps {
  chats: MerchantChat[];
  activeChatId?: string | null;
  onSelectChat?: (chatId: string) => void;
  onNewChat?: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Time Helpers                                                              */
/* -------------------------------------------------------------------------- */

function formatShortTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(diffMs)) return '';

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'now';
    if (diffMin < 60) return `${diffMin}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays === 1) return '1d';
    if (diffDays < 30) return `${diffDays}d`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export function NavMerchantChats({
  chats = [],
  activeChatId,
  onSelectChat,
  onNewChat,
}: NavMerchantChatsProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Collapsible className="group/collapsible flex min-h-0 flex-1 flex-col" defaultOpen>
        <SidebarGroup className="flex min-h-0 flex-1 flex-col p-2">
          {/* Section Header */}
          <div className="flex items-center justify-between pb-1.5">
            <SidebarGroupLabel
              className="flex flex-1 cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              render={<CollapsibleTrigger />}
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Chats</span>
                {chats.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono font-medium text-muted-foreground">
                    {chats.length}
                  </span>
                )}
              </div>
              <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-open/collapsible:rotate-180" />
            </SidebarGroupLabel>

            <button
              type="button"
              aria-label="New merchant chat"
              title="New merchant chat"
              onClick={() => onNewChat?.()}
              className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/40 bg-background/50 text-muted-foreground transition-all hover:border-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <CollapsibleContent className="flex min-h-0 flex-1 flex-col">
            <SidebarGroupContent className="flex min-h-0 flex-1 flex-col pt-1">
              {/* Empty State */}
              {chats.length === 0 ? (
                <div className="mx-0.5 my-2 rounded-lg border border-dashed border-border/70 p-3 text-center">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-muted/70">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs font-medium text-foreground">No chats yet</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Start a conversation with your data
                  </p>
                  <button
                    type="button"
                    onClick={() => onNewChat?.()}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
                  >
                    <Plus className="h-3 w-3" />
                    New Chat
                  </button>
                </div>
              ) : (
                /* Chat List */
                <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
                  {chats.map((chat) => {
                    const isActive = chat.chatId === activeChatId;
                    const shortTime = formatShortTime(chat.updatedAt);

                    return (
                      <div
                        key={chat.chatId}
                        onClick={() => onSelectChat?.(chat.chatId)}
                        className={cn(
                          'group relative flex cursor-pointer flex-col gap-1 px-2 py-1.5 text-left transition-all duration-150',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'hover:bg-sidebar-accent/50'
                        )}
                      >
                        {/* Top Row: Icon + Title | Time */}
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-xs tracking-tight truncate text-foreground/90">
                            {chat.title}
                          </span>

                          <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                            {shortTime || 'now'}
                          </span>
                        </div>


                      </div>
                    );
                  })}
                </div>
              )}
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    </div>
  );
}
