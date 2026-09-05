'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronDown, ShoppingCart, Store } from 'lucide-react';
import { SidebarHeader } from '@cartwright/ui/components/sidebar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
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
        <DropdownMenuTrigger className="inline-flex w-full cursor-pointer items-center justify-between gap-2 whitespace-nowrap rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-none transition-colors hover:bg-muted/80">
          <div className="flex items-center gap-2">
            <current.icon className="h-4 w-4 shrink-0" />
            <span className="font-medium">{current.label}</span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" side="bottom" className="z-50 w-(--anchor-width) rounded-xl border border-border bg-popover p-1 text-xs text-popover-foreground shadow-none backdrop-blur-md">
          <DropdownMenuGroup className="flex flex-col gap-y-0.5">
            {ROLES.map((option) => {
              const Icon = option.icon;
              const isActive = option.value === currentRole;
              return (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => handleSwitch(option)}
                  className={
                    'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ' +
                    (isActive
                      ? 'bg-muted font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')
                  }
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
