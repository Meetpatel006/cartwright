'use client';

import {
  ChevronDown,
  Plus,
  Sparkles,
  ShoppingBag,
  Store,
  Clock,
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
import type { ShoppingSession } from '@cartwright/ui/components/nav-sidebar/types';

interface NavCollapsibleProps {
  sessions: ShoppingSession[];
  activeSessionId?: string | null;
  onSelectSession?: (sessionId: string) => void;
  onNewSession?: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Branded Store / Provider SVGs & Badges                                    */
/* -------------------------------------------------------------------------- */

function NikeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 7.8L6.442 15.276c-1.456.616-2.679.925-3.668.925-1.12 0-1.933-.392-2.437-1.177-.317-.504-.41-1.143-.28-1.918.13-.775.476-1.6 1.036-2.478.467-.71 1.232-1.643 2.297-2.8a6.122 6.122 0 00-.784 1.848c-.28 1.195-.028 2.072.756 2.632.373.261.886.392 1.54.392.522 0 1.11-.084 1.764-.252L24 7.8z" />
    </svg>
  );
}

function AmazonIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726a17.617 17.617 0 01-10.951-.577 17.88 17.88 0 01-5.43-3.35c-.1-.074-.151-.15-.151-.22 0-.047.021-.09.051-.13zm6.565-6.218c0-1.005.247-1.863.743-2.577.495-.71 1.17-1.25 2.04-1.615.796-.335 1.756-.575 2.912-.72.39-.046 1.033-.103 1.92-.174v-.37c0-.93-.105-1.558-.3-1.875-.302-.43-.78-.65-1.44-.65h-.182c-.48.046-.896.196-1.246.46-.35.27-.575.63-.675 1.096-.06.3-.206.465-.435.51l-2.52-.315c-.248-.06-.372-.18-.372-.39 0-.046.007-.09.022-.15.247-1.29.855-2.25 1.82-2.88.976-.616 2.1-.975 3.39-1.05h.54c1.65 0 2.957.434 3.888 1.29.135.15.27.3.405.48.12.165.224.314.283.45.075.134.15.33.195.57.06.254.105.42.135.51.03.104.062.3.076.615.01.313.02.493.02.553v5.28c0 .376.06.72.165 1.036.105.313.21.54.315.674l.51.674c.09.136.136.256.136.36 0 .12-.06.226-.18.314-1.2 1.05-1.86 1.62-1.963 1.71-.165.135-.375.15-.63.045a6.062 6.062 0 01-.526-.496l-.31-.347a9.391 9.391 0 01-.317-.42l-.3-.435c-.81.886-1.603 1.44-2.4 1.665-.494.15-1.093.227-1.83.227-1.11 0-2.04-.343-2.76-1.034-.72-.69-1.08-1.665-1.08-2.94l-.05-.076zm3.753-.438c0 .566.14 1.02.425 1.364.285.34.675.512 1.155.512.045 0 .106-.007.195-.02.09-.016.134-.023.166-.023.614-.16 1.08-.553 1.424-1.178.165-.28.285-.58.36-.91.09-.32.12-.59.135-.8.015-.195.015-.54.015-1.005v-.54c-.84 0-1.484.06-1.92.18-1.275.36-1.92 1.17-1.92 2.43l-.035-.02zm9.162 7.027c.03-.06.075-.11.132-.17.362-.243.714-.41 1.05-.5a8.094 8.094 0 011.612-.24c.14-.012.28 0 .41.03.65.06 1.05.168 1.172.33.063.09.099.228.099.39v.15c0 .51-.149 1.11-.424 1.8-.278.69-.664 1.248-1.156 1.68-.073.06-.14.09-.197.09-.03 0-.06 0-.09-.012-.09-.044-.107-.12-.064-.24.54-1.26.806-2.143.806-2.64 0-.15-.03-.27-.087-.344-.145-.166-.55-.257-1.224-.257-.243 0-.533.016-.87.046-.363.045-.7.09-1 .135-.09 0-.148-.014-.18-.044-.03-.03-.036-.047-.02-.077 0-.017.006-.03.02-.063v-.06z" />
    </svg>
  );
}

function FlipkartIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.833 1.333a.993.993 0 0 0-.333.061V1c0-.551.449-1 1-1h14.667c.551 0 1 .449 1 1v.333H3.833zm17.334 2.334H2.833c-.551 0-1 .449-1 1V23c0 .551.449 1 1 1h7.3l1.098-5.645h-2.24c-.051 0-5.158-.241-5.158-.241l4.639-.327-.078-.366-1.978-.285 1.882-.158-.124-.449-3.075-.467s3.341-.373 3.392-.373h3.232l.247-1.331c.289-1.616.945-2.807 1.973-3.693 1.033-.892 2.344-1.332 3.937-1.332.643 0 1.053.151 1.231.463.118.186.201.516.279.859.074.352.14.671.095.903-.057.345-.461.465-1.197.465h-.253c-1.327 0-2.134.763-2.405 2.31l-.243 1.355h1.54c.574 0 .781.402.622 1.306-.17.941-.539 1.36-1.111 1.36H14.9L13.804 24h7.362c.551 0 1-.449 1-1V4.667a1 1 0 0 0-.999-1zM20.5 2.333A.334.334 0 0 0 20.167 2H3.833a.334.334 0 0 0-.333.333V3h17v-.667z" />
    </svg>
  );
}

function AppleIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.54c.66-.82 1.11-1.96.99-3.09-1 .04-2.18.66-2.88 1.48-.61.71-1.15 1.87-.99 2.97 1.11.08 2.22-.54 2.88-1.36z" />
    </svg>
  );
}

function AdidasIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="m24 19.535-8.697-15.07-4.659 2.687 7.145 12.383Zm-8.287 0L9.969 9.59 5.31 12.277l4.192 7.258ZM4.658 14.723l-2.029 1.171L0 19.535h4.658Z" />
    </svg>
  );
}

function ShopifyIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z" />
    </svg>
  );
}

function SonyIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.55 9.89c.92 0 1.66.23 2.22.74.39.35.6.85.6 1.37a1.9 1.9 0 0 1-.6 1.37c-.52.49-1.34.74-2.22.74-.87 0-1.68-.25-2.21-.74a1.9 1.9 0 0 1-.6-1.37c0-.52.21-1.02.6-1.37.5-.45 1.39-.74 2.21-.74zm.01 3.67c.46 0 .89-.16 1.19-.46.3-.3.43-.66.43-1.1 0-.43-.15-.82-.43-1.1-.3-.3-.74-.46-1.19-.46s-.9.16-1.19.46c-.29.28-.44.68-.44 1.1 0 .41.15.8.44 1.1.3.3.73.46 1.19.46zm-4.84-1.97c.16.04.31.09.46.16.14.07.27.16.38.26.2.2.31.48.31.77 0 .31-.13.58-.38.78-.21.17-.45.29-.71.35a3.72 3.72 0 0 1-1.19.17c-.35 0-.55-.04-.82-.1l-.07-.01a3.02 3.02 0 0 1-.86-.28.07.07 0 0 0-.04-.01c-.05 0-.08.04-.08.08v.2H.12v-1.48h.53c.03.15.08.29.13.42.22.26.44.36.66.44.37.12.75.18 1.14.2.55 0 .87-.14.94-.17.07-.02.32-.11.32-.39 0-.27-.24-.33-.39-.37l-.02-.01c-.17-.04-.56-.08-.99-.13l-.15-.02c-.49-.05-.97-.13-1.2-.17-.5-.11-.7-.29-.82-.41A1.02 1.02 0 0 1 .03 10.9c0-.31.14-.6.38-.79.23-.19.51-.31.8-.37.37-.08.76-.12 1.15-.12.3 0 .46.03.7.07.24.05.47.12.69.21.05.02.09.02.12 0 .04-.03.06-.07.06-.11v-.15h.57v1.44h-.47a.78.78 0 0 0-.13-.39c-.19-.24-.38-.34-.58-.4a3.14 3.14 0 0 0-.96-.16c-.46 0-.74.1-.81.12-.08.03-.35.12-.35.39 0 .23.18.3.3.34.13.04.45.08.79.11l.16.02c.51.05 1.03.12 1.28.18.49.12.69.3.8.41l.01.01zM18.89 9.9h.65l3.29 4.88v-4.88h1.05v5.86h-.66l-3.29-4.88v4.88h-1.04V9.9zm-4.71 0h1.16l1.79 3.09 1.77-3.09h1.17l-2.4 4.02v1.84h-1.07v-1.84l-2.42-4.02z" />
    </svg>
  );
}

function getStoreProvider(query: string, store?: string): { name: string; type: string } {
  const text = `${store || ''} ${query || ''}`.toLowerCase();
  
  if (text.includes('nike') || text.includes('jordan')) return { name: 'Nike', type: 'nike' };
  if (text.includes('amazon') || text.includes('amzn') || text.includes('prime')) return { name: 'Amazon', type: 'amazon' };
  if (text.includes('flipkart')) return { name: 'Flipkart', type: 'flipkart' };
  if (text.includes('apple') || text.includes('iphone') || text.includes('macbook') || text.includes('airpod')) return { name: 'Apple', type: 'apple' };
  if (text.includes('sony') || text.includes('playstation') || text.includes('ps5')) return { name: 'Sony', type: 'sony' };
  if (text.includes('adidas') || text.includes('yeezy') || text.includes('samba')) return { name: 'Adidas', type: 'adidas' };
  if (text.includes('shopify')) return { name: 'Shopify', type: 'shopify' };

  if (store && store.trim() && store.trim().toLowerCase() !== 'store') {
    const cleanStore = store.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0] || 'Store';
    return { name: cleanStore, type: 'default' };
  }

  return { name: 'Store', type: 'default' };
}

function StoreProviderIcon({ query, store }: { query: string; store?: string }) {
  const provider = getStoreProvider(query, store);

  switch (provider.type) {
    case 'amazon':
      return (
        <span className="flex h-5 w-5 items-center justify-center text-foreground/80 transition-colors group-hover:text-foreground" title="Amazon">
          <AmazonIcon className="h-4 w-4" />
        </span>
      );
    case 'nike':
      return (
        <span className="flex h-5 w-5 items-center justify-center text-foreground/80 transition-colors group-hover:text-foreground" title="Nike">
          <NikeIcon className="h-4 w-4" />
        </span>
      );
    case 'flipkart':
      return (
        <span className="flex h-5 w-5 items-center justify-center text-foreground/80 transition-colors group-hover:text-foreground" title="Flipkart">
          <FlipkartIcon className="h-4 w-4" />
        </span>
      );
    case 'apple':
      return (
        <span className="flex h-5 w-5 items-center justify-center text-foreground/80 transition-colors group-hover:text-foreground" title="Apple">
          <AppleIcon className="h-4 w-4" />
        </span>
      );
    case 'adidas':
      return (
        <span className="flex h-5 w-5 items-center justify-center text-foreground/80 transition-colors group-hover:text-foreground" title="Adidas">
          <AdidasIcon className="h-4 w-4" />
        </span>
      );
    case 'shopify':
      return (
        <span className="flex h-5 w-5 items-center justify-center text-foreground/80 transition-colors group-hover:text-foreground" title="Shopify">
          <ShopifyIcon className="h-4 w-4" />
        </span>
      );
    case 'sony':
      return (
        <span className="flex h-5 w-5 items-center justify-center text-foreground/80 transition-colors group-hover:text-foreground" title="Sony">
          <SonyIcon className="h-4 w-4" />
        </span>
      );
    default:
      return (
        <span className="flex h-5 w-5 items-center justify-center text-muted-foreground/70 transition-colors group-hover:text-muted-foreground" title={provider.name || 'Store'}>
          <Store className="h-4 w-4" />
        </span>
      );
  }
}

/* -------------------------------------------------------------------------- */
/*  Time & Status Helpers                                                     */
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

export function NavCollapsible({
  sessions = [],
  activeSessionId,
  onSelectSession,
  onNewSession,
}: NavCollapsibleProps) {
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
                <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Sessions</span>
                {sessions.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono font-medium text-muted-foreground">
                    {sessions.length}
                  </span>
                )}
              </div>
              <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-open/collapsible:rotate-180" />
            </SidebarGroupLabel>

            <button
              type="button"
              aria-label="New shopping session"
              title="New shopping session"
              onClick={() => onNewSession?.()}
              className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/40 bg-background/50 text-muted-foreground transition-all hover:border-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <CollapsibleContent className="flex min-h-0 flex-1 flex-col">
            <SidebarGroupContent className="flex min-h-0 flex-1 flex-col pt-1">
              {/* Empty State */}
              {sessions.length === 0 ? (
                <div className="mx-0.5 my-2 rounded-lg border border-dashed border-border/70 p-3 text-center">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-muted/70">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs font-medium text-foreground">No sessions yet</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Start an autonomous search
                  </p>
                  <button
                    type="button"
                    onClick={() => onNewSession?.()}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
                  >
                    <Plus className="h-3 w-3" />
                    New Search
                  </button>
                </div>
              ) : (
                /* Direct List of Session Cards */
                <div className="grid min-h-0 flex-1 grid-flow-row gap-2 overflow-y-auto pr-1">
                  {sessions.map((session) => {
                    const isActive = session.sessionId === activeSessionId;
                    const shortTime = formatShortTime(session.createdAt);
                    const provider = getStoreProvider(session.rawQuery, session.store);

                    return (
                      <div
                        key={session.sessionId}
                        onClick={() => onSelectSession?.(session.sessionId)}
                        className={cn(
                          'group relative flex cursor-pointer flex-col gap-2 rounded-lg border p-3 text-left transition-all duration-150',
                          isActive
                            ? 'border-primary/60 bg-sidebar-accent shadow-xs ring-1 ring-primary/20 text-sidebar-accent-foreground'
                            : 'border-border/50 bg-card/40 hover:border-border hover:bg-sidebar-accent/50 hover:shadow-xs'
                        )}
                      >
                        {/* Top Row: Left: Store Icon + Name | Right: Time */}
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 font-medium text-foreground/90">
                            <StoreProviderIcon
                              query={session.rawQuery}
                              store={session.store}
                            />
                            <span className="font-semibold text-xs tracking-tight">
                              {provider.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 opacity-70" />
                            <span>{shortTime || 'now'}</span>
                          </div>
                        </div>

                        {/* Title below */}
                        <div className="pt-0.5">
                          <span className="text-sm font-semibold leading-snug line-clamp-2 text-foreground">
                            {session.rawQuery || 'Shopping Session'}
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
