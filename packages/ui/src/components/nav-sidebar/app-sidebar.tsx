'use client';

import { usePathname } from 'next/navigation';
import {
  ShoppingCart,
  Shield,
  CreditCard,
  BarChart3,
  ShoppingBag,
  TrendingUp,
  Users,
  Globe,
} from 'lucide-react';
import { Sidebar, SidebarContent } from '@cartwright/ui/components/sidebar';
import { NavCollapsible } from '@cartwright/ui/components/nav-sidebar/nav-collapsible';
import { NavMerchantChats } from '@cartwright/ui/components/nav-sidebar/nav-merchant-chats';
import { NavFooter } from '@cartwright/ui/components/nav-sidebar/nav-footer';
import { NavHeader } from '@cartwright/ui/components/nav-sidebar/nav-header';
import { NavMain } from '@cartwright/ui/components/nav-sidebar/nav-main';
import { RoleSwitcher, detectRole } from '@cartwright/ui/components/nav-sidebar/role-switcher';
import type { SidebarData, ShoppingSession, MerchantChat, User } from '@cartwright/ui/components/nav-sidebar/types';

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: User;
  shoppingSessions?: ShoppingSession[];
  activeSessionId?: string | null;
  onSelectSession?: (sessionId: string) => void;
  onNewSession?: () => void;
  merchantChats?: MerchantChat[];
  activeChatId?: string | null;
  onSelectChat?: (chatId: string) => void;
  onNewChat?: () => void;
  onLogout?: () => void;
}

export function AppSidebar({
  user = { name: 'Guest', email: '', avatar: '' },
  shoppingSessions = [],
  activeSessionId,
  onSelectSession,
  onNewSession,
  merchantChats = [],
  activeChatId,
  onSelectChat,
  onNewChat,
  onLogout,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname();
  const role = detectRole(pathname);

  const shopperNav = [
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
  ];

  const merchantNav = [
    {
      id: 'dashboard',
      title: 'Dashboard',
      url: '/merchant/dashboard',
      icon: BarChart3,
      isActive: pathname === '/merchant/dashboard',
    },
    {
      id: 'merchant-orders',
      title: 'Orders',
      url: '/merchant/orders',
      icon: ShoppingBag,
      isActive: pathname.startsWith('/merchant/orders'),
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
    {
      id: 'merchant-sites',
      title: 'Sites & Tracker',
      url: '/merchant/sites',
      icon: Globe,
      isActive: pathname.startsWith('/merchant/sites'),
    },
  ];

  const data: SidebarData = {
    user,
    navMain: role === 'merchant' ? merchantNav : shopperNav,
    shoppingSessions,
    merchantChats,
  };

  return (
    <Sidebar {...props}>
      <RoleSwitcher />
      <NavHeader data={data} />
      <SidebarContent>
        <NavMain items={data.navMain} />
        {role === 'shopper' && (
          <NavCollapsible
            sessions={shoppingSessions}
            activeSessionId={activeSessionId}
            onSelectSession={onSelectSession}
            onNewSession={onNewSession}
          />
        )}
        {role === 'merchant' && (
          <NavMerchantChats
            chats={merchantChats}
            activeChatId={activeChatId}
            onSelectChat={onSelectChat}
            onNewChat={onNewChat}
          />
        )}
      </SidebarContent>
      <NavFooter user={data.user} onLogout={onLogout} />
    </Sidebar>
  );
}
