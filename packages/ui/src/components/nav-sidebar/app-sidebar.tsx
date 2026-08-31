'use client';

import { usePathname } from 'next/navigation';
import {
  ShoppingCart,
  Shield,
  CreditCard,
  Store,
  BarChart3,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Sidebar, SidebarContent } from '@cartwright/ui/components/sidebar';
import { NavCollapsible } from '@cartwright/ui/components/nav-sidebar/nav-collapsible';
import { NavFooter } from '@cartwright/ui/components/nav-sidebar/nav-footer';
import { NavHeader } from '@cartwright/ui/components/nav-sidebar/nav-header';
import { NavMain } from '@cartwright/ui/components/nav-sidebar/nav-main';
import type { SidebarData, ShoppingSession, User } from '@cartwright/ui/components/nav-sidebar/types';

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: User;
  shoppingSessions?: ShoppingSession[];
  activeSessionId?: string | null;
  onSelectSession?: (sessionId: string) => void;
  onNewSession?: () => void;
}

export function AppSidebar({
  user = { name: 'Guest', email: '', avatar: '' },
  shoppingSessions = [],
  activeSessionId,
  onSelectSession,
  onNewSession,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname();

  const data: SidebarData = {
    user,
    navMain: [
      {
        id: 'dashboard',
        title: 'Dashboard',
        url: '/dashboard',
        icon: BarChart3,
        isActive: pathname.startsWith('/dashboard'),
      },
      {
        id: 'shopper',
        title: 'Shopper',
        url: '/shopper',
        icon: ShoppingCart,
        isActive: pathname.startsWith('/shopper'),
      },
      {
        id: 'policy',
        title: 'Spending Policy & Guardrails',
        url: '/policy',
        icon: Shield,
        isActive: pathname.startsWith('/policy'),
      },
      {
        id: 'transactions',
        title: 'Transactions',
        url: '/transactions',
        icon: CreditCard,
        isActive: pathname.startsWith('/transactions'),
      },
      {
        id: 'merchant',
        title: 'Merchant Intelligence',
        url: '/merchant/orders',
        icon: Store,
        isActive: pathname.startsWith('/merchant'),
        items: [
          {
            id: 'merchant-orders',
            title: 'Orders',
            url: '/merchant/orders',
            icon: ShoppingBag,
            isActive: pathname === '/merchant' || pathname.startsWith('/merchant/orders'),
          },
          {
            id: 'merchant-sales',
            title: 'Sales & Revenue',
            url: '/merchant/sales',
            icon: TrendingUp,
            isActive: pathname.startsWith('/merchant/sales'),
          },
          {
            id: 'merchant-customers',
            title: 'Customers',
            url: '/merchant/customers',
            icon: Users,
            isActive: pathname.startsWith('/merchant/customers'),
          },
        ],
      },
    ],
    shoppingSessions,
  };

  return (
    <Sidebar {...props}>
      <NavHeader data={data} />
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavCollapsible
          sessions={shoppingSessions}
          activeSessionId={activeSessionId}
          onSelectSession={onSelectSession}
          onNewSession={onNewSession}
        />
      </SidebarContent>
      <NavFooter user={data.user} />
    </Sidebar>
  );
}
