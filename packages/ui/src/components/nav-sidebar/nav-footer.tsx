'use client';

import { LogOut, Settings, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@cartwright/ui/components/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@cartwright/ui/components/dropdown-menu';
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
} from '@cartwright/ui/components/sidebar';


export function NavFooter({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {
  return (
    <SidebarFooter className="p-4">
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  nativeButton={false}
                  render={<Avatar className="h-8 w-8 rounded-full" />}
                >
                  <AvatarImage alt={user.name} src={user.avatar} />
                  <AvatarFallback className="rounded-full">
                    {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                  </AvatarFallback>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="m-2">
                  <DropdownMenuItem>
                    <User aria-hidden="true" className="opacity-80" size={16} />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Settings
                      aria-hidden="true"
                      className="opacity-80"
                      size={16}
                    />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <LogOut
                      aria-hidden="true"
                      className="opacity-80"
                      size={16}
                    />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex flex-col">
                <span className="text-xs font-medium">{user.name}</span>
                {user.email && <span className="text-[10px] text-muted-foreground">{user.email}</span>}
              </div>
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
