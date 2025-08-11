
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOut,
  Smartphone,
  BarChartHorizontalBig,
  Package,
  Table,
  CheckSquare,
  Home,
  ShoppingCart,
  Truck,
  Archive,
  GanttChartSquare,
  Warehouse,
  Contact,
  Users,
  FileSignature,
  FileText,
  Scissors,
  ClipboardList,
  UserCog,
  CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";

const allNavItems = [
  { href: "/dashboard", icon: Home, label: "Home", roles: ['admin', 'employee'] },
  { href: "/dashboard/approvals", icon: FileSignature, label: "Approvals", roles: ['admin', 'Accounts', 'employee'] },
  { href: "/dashboard/visits", icon: CalendarCheck, label: "Visits", roles: ['admin', 'employee'] },
  { href: "/dashboard/customers", icon: Contact, label: "Customers", roles: ['admin', 'employee'] },
  { href: "/dashboard/orders", icon: ClipboardList, label: "Orders", roles: ['admin', 'employee'] },
  { href: "/dashboard/purchase", icon: ShoppingCart, label: "Purchase", roles: ['admin', 'employee'] },
  { href: "/dashboard/inbound", icon: Archive, label: "Inbound", roles: ['admin', 'employee'] },
  { href: "/dashboard/inventory", icon: Warehouse, label: "Inventory", roles: ['admin', 'employee'] },
  { href: "/dashboard/invoice", icon: FileText, label: "Invoice", roles: ['admin', 'Accounts', 'employee'] },
  { href: "/dashboard/cutting", icon: Scissors, label: "Cutting & Details", roles: ['admin', 'employee'] },
  { href: "/dashboard/all-orders", icon: Table, label: "Details", roles: ['admin'] },
  { href: "/dashboard/users", icon: UserCog, label: "User Management", roles: ['admin', 'employee'] },
  { href: "/dashboard/reports", icon: BarChartHorizontalBig, label: "Reports", roles: ['admin'] },
  { href: "/mobile", icon: Smartphone, label: "Mobile View", roles: ['installer'] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, role } = useAuth();
  const pathname = usePathname();

  const navItemsForUser = React.useMemo(() => {
    return allNavItems.filter(item => {
      if (!role) return false;
      if (!item.roles.includes(role)) return false;
      
      if (role === 'admin') return true;

      if (role === 'employee' || role === 'Accounts') {
        const restrictedPaths = ['/dashboard/all-orders', '/dashboard/reports', '/dashboard/users'];
        return !restrictedPaths.includes(item.href)
      }
      
      if (role === 'installer') {
        return item.href.startsWith('/mobile');
      }

      return true;
    });
  }, [role]);

  return (
    <SidebarProvider defaultOpen={false}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="p-2">
            <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold">
              <Image src="/logo.png" alt="MoTrack Logo" width={120} height={60} />
              <span className="sr-only">MoTrack</span>
            </Link>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItemsForUser.map((item) => (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    tooltip={{ children: item.label }}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start h-auto p-2"
              >
                <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={`https://placehold.co/100x100.png`} data-ai-hint="avatar" />
                        <AvatarFallback>{user?.name?.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="text-left group-data-[collapsible=icon]:hidden">
                        <p className="font-semibold text-sm">{user?.name}</p>
                        <p className="text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background px-4 md:justify-end">
            <SidebarTrigger className="md:hidden" />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
