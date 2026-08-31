'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@cartwright/ui/components/collapsible';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@cartwright/ui/components/sidebar';
import type { NavItem } from '@cartwright/ui/components/nav-sidebar/types';

function NavMainCollapsibleItem({ item }: { item: NavItem }) {
  const [isOpen, setIsOpen] = useState(item.isActive ?? false);
  const Icon = item.icon;

  useEffect(() => {
    if (item.isActive) {
      setIsOpen(true);
    }
  }, [item.isActive]);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={item.title}
          isActive={item.isActive}
          render={<CollapsibleTrigger className="flex w-full items-center justify-between" />}
        >
          <div className="flex items-center gap-2">
            {Icon && <Icon className="mr-2 h-4 w-4" />}
            <span>{item.title}</span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-open/collapsible:rotate-180" />
        </SidebarMenuButton>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.items!.map((subItem) => {
              const SubIcon = subItem.icon;
              return (
                <SidebarMenuSubItem key={subItem.id}>
                  <SidebarMenuSubButton
                    isActive={subItem.isActive}
                    render={
                      <Link
                        href={subItem.url as any}
                        className="flex items-center gap-2"
                      />
                    }
                  >
                    {SubIcon && <SubIcon className="h-3.5 w-3.5" />}
                    <span>{subItem.title}</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function NavMain({ items }: { items: NavItem[] }) {
  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) => {
          const Icon = item.icon;
          const hasSubItems = item.items && item.items.length > 0;

          if (!hasSubItems) {
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={item.isActive}
                  render={
                    <Link
                      href={item.url as any}
                      className="flex items-center gap-2"
                    />
                  }
                >
                  {Icon && <Icon className="mr-2 h-4 w-4" />}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          return <NavMainCollapsibleItem key={item.id} item={item} />;
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
