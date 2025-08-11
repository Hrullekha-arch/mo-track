
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Separator } from "../ui/separator";

const navItems = [
  { href: "/dashboard", icon: Home, label: "Dashboard", roles: ['admin', 'employee'] },
  { href: "/dashboard/orders", icon: ClipboardList, label: "Orders", roles: ['admin', 'employee'] },
  { href: "/dashboard/customers", icon: Contact, label: "Customers", roles: ['admin', 'employee'] },
  { href: "/dashboard/purchase", icon: ShoppingCart, label: "Purchase", roles: ['admin', 'employee'] },
  { href: "/dashboard/inventory", icon: Warehouse, label: "Inventory", roles: ['admin', 'employee'] },
  { href: "/dashboard/all-orders", icon: Table, label: "Details", roles: ['admin', 'employee'] },
  { href: "/dashboard/approvals", icon: FileSignature, label: "Approvals", roles: ['admin', 'Accounts', 'employee'] },
  { href: "/dashboard/users", icon: UserCog, label: "Users", roles: ['admin', 'employee'] },
  { href: "/mobile", icon: Smartphone, label: "Mobile View", roles: ['installer'] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, role } = useAuth();
  const pathname = usePathname();

  const navItemsForUser = React.useMemo(() => {
    return navItems.filter(item => {
      if (!role) return false;
      if (!item.roles.includes(role)) return false;
      
      if (role === 'admin') return true;

      if (role === 'employee' || role === 'Accounts') {
        // Exclude 'Users' page for non-admin employees/accounts
        const restrictedPaths = ['/dashboard/users'];
        return !restrictedPaths.includes(item.href)
      }
      
      if (role === 'installer') {
        return item.href.startsWith('/mobile');
      }

      return true;
    });
  }, [role]);

  return (
    <SidebarProvider>
      <Sidebar side="left" collapsible="icon">
        <SidebarHeader>
          <div className="p-4 flex items-center gap-2">
            <Image src="/logo.png" alt="MoTrack Logo" width={32} height={32} />
            <h1 className="text-lg font-bold">MoTrack</h1>
            <div className="flex-grow" />
            <SidebarTrigger />
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu className="px-2">
            {navItemsForUser.map((item) => (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href}>
                  <SidebarMenuButton
                    isActive={pathname.startsWith(item.href)}
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

        <Separator />
        
        <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
                 <Avatar>
                    <AvatarImage src={`https://placehold.co/100x100.png`} data-ai-hint="avatar" />
                    <AvatarFallback>{user?.name?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                    <p className="font-semibold text-sm">{user?.name}</p>
                </div>
            </div>
            <Button variant="ghost" size="icon" onClick={logout}>
                <LogOut className="h-5 w-5" />
            </Button>
        </div>

      </Sidebar>

      <main className="flex-1 md:ml-[var(--sidebar-width-icon)]">
        {children}
      </main>
    </SidebarProvider>
  );
}
