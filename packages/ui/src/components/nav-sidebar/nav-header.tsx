import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import * as React from 'react';
import { useEffect } from 'react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@cartwright/ui/components/command';
import { SidebarHeader } from '@cartwright/ui/components/sidebar';
import type { SidebarData } from '@cartwright/ui/components/nav-sidebar/types';

interface NavHeaderProps {
  data: SidebarData;
}

export function NavHeader({ data }: NavHeaderProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <>
      <SidebarHeader className="p-2">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => setOpen(true)}
        >
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="font-normal">Search...</span>
          </div>
          <kbd className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground/70">
            <span className="text-sm leading-none">⌘</span>
            <span className="leading-none">K</span>
          </kbd>
        </button>
      </SidebarHeader>

      <CommandDialog onOpenChange={setOpen} open={open}>
        <Command>
          <CommandInput placeholder="Search everything..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Navigation">
              {data.navMain.map((item) => (
                <CommandItem
                  className="py-2!"
                  key={item.id}
                  onSelect={() => {
                    setOpen(false);
                    router.push(item.url as any);
                  }}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            {data.shoppingSessions && data.shoppingSessions.length > 0 && (
              <CommandGroup heading="Sessions">
                {data.shoppingSessions.map((session) => (
                  <CommandItem
                    key={session.sessionId}
                    onSelect={() => {
                      setOpen(false);
                      router.push(`/shopper/${session.sessionId}` as any);
                    }}
                  >
                    <span className="flex-1 truncate font-medium text-zinc-200 group-data-selected/command-item:text-white">
                      {session.rawQuery || "Untitled session"}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                      {session.sessionId.slice(0, 8)}…
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
