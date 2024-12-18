'use client';
import * as React from 'react';
import { ToggleRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { navItems } from '@/app/nav-items';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  return (
    <Sidebar variant="floating" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <ToggleRight className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <h1 className="font-semibold">Flags SDK</h1>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu className="gap-2">
            {navItems.map((navItem) => {
              const visibleSubItems = navItem.items?.filter(
                (item) => item.nav !== 'hidden',
              );
              return (
                <SidebarMenuItem key={navItem.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      // avoid highlighting the parent when a visible child is active
                      (pathname === navItem.url &&
                        navItem.items?.every(
                          (item) => item.url !== pathname,
                        )) ||
                      // highlight the parent when a hidden item is active
                      (navItem.url !== '/' &&
                        pathname.startsWith(navItem.url) &&
                        navItem.items?.some(
                          (item) =>
                            item.nav === 'hidden' && item.url === pathname,
                        ))
                    }
                  >
                    <a href={navItem.url} className="font-medium">
                      {navItem.title}
                    </a>
                  </SidebarMenuButton>
                  {Array.isArray(visibleSubItems) &&
                  visibleSubItems.length > 0 ? (
                    <SidebarMenuSub className="ml-0 border-l-0 px-1.5">
                      {visibleSubItems.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === subItem.url}
                          >
                            <a href={subItem.url}>{subItem.title}</a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
