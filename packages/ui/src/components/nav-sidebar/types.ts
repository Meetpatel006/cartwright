import type { ElementType } from 'react';

export interface NavItem {
  id: string;
  title: string;
  icon: ElementType;
  url?: string;
  isActive?: boolean;
}

export interface User {
  name: string;
  email: string;
  avatar: string;
}

export interface ShoppingSession {
  sessionId: string;
  rawQuery: string;
  status: string;
  createdAt: string;
}

export interface SidebarData {
  user: User;
  navMain: NavItem[];
  shoppingSessions: ShoppingSession[];
}
