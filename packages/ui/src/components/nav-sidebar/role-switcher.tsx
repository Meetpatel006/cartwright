'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, ShoppingCart, Store } from 'lucide-react';
import { SidebarHeader } from '@cartwright/ui/components/sidebar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@cartwright/ui/components/dropdown-menu';

export type Role = 'shopper' | 'merchant';

interface RoleOption {
  value: Role;
  label: string;
  icon: React.ElementType;
  defaultPath: string;
}

export const ROLES: RoleOption[] = [
  {
    value: 'shopper',
    label: 'Shopper',
    icon: ShoppingCart,
    defaultPath: '/shopper',
  },
  {
    value: 'merchant',
    label: 'Merchant',
    icon: Store,
    defaultPath: '/merchant/orders',
  },
];

export function detectRole(pathname: string): Role {
  if (pathname.startsWith('/merchant')) return 'merchant';
  return 'shopper';
}

export function RoleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();

  const currentRole = detectRole(pathname);
  const current = ROLES.find((r) => r.value === currentRole)!;

  const handleSwitch = (option: RoleOption) => {
    if (option.value !== currentRole) {
      router.push(option.defaultPath as any);
    }
  };

  return (
    <SidebarHeader className="p-2 pb-0">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-sidebar-border bg-sidebar-accent/50 px-2.5 py-2 text-xs text-sidebar-foreground transition-colors hover:bg-sidebar-accent">
          <div className="flex items-center gap-2">
            <current.icon className="h-4 w-4 shrink-0" />
            <span className="font-medium">{current.label}</span>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" side="bottom" className="w-(--anchor-width)">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Switch Role</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ROLES.map((option) => {
              const Icon = option.icon;
              const isActive = option.value === currentRole;
              return (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => handleSwitch(option)}
                  className={isActive ? 'bg-accent text-accent-foreground' : ''}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{option.label}</span>
                  {isActive && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarHeader>
  );
}
