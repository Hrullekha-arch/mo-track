
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
  Moon,
  Sun,
  Settings,
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
  SidebarFooter
} from "@/components/ui/sidebar";
import { Separator } from "../ui/separator";
import { Switch } from "../ui/switch";
import { useTheme } from "next-themes";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Label } from "../ui/label";

const allNavItems = [
  { href: "/dashboard", icon: Home, label: "Dashboard", roles: ['admin', 'employee'] },
  { href: "/dashboard/orders", icon: ClipboardList, label: "Orders", roles: ['admin', 'employee'] },
  { href: "/dashboard/customers", icon: Contact, label: "Customers", roles: ['admin', 'employee'] },
  { href: "/dashboard/purchase", icon: ShoppingCart, label: "Purchase", roles: ['admin', 'employee'] },
  { href: "/dashboard/inbound", icon: Archive, label: "Inbound", roles: ['admin', 'employee'] },
  { href: "/dashboard/invoice", icon: FileText, label: "Invoice", roles: ['admin', 'employee'] },
  { href: "/dashboard/cutting", icon: Scissors, label: "Cutting & Details", roles: ['admin', 'employee'] },
  { href: "/dashboard/visits", icon: CalendarCheck, label: "Visits", roles: ['admin', 'employee'] },
  { href: "/dashboard/inventory", icon: Warehouse, label: "Inventory", roles: ['admin', 'employee'] },
  { href: "/dashboard/all-orders", icon: Table, label: "Details", roles: ['admin', 'employee'] },
  { href: "/dashboard/reports", icon: BarChartHorizontalBig, label: "Reports", roles: ['admin', 'employee'] },
  { href: "/dashboard/approvals", icon: FileSignature, label: "Approvals", roles: ['admin', 'Accounts', 'employee'] },
  { href: "/dashboard/users", icon: UserCog, label: "Users", roles: ['admin', 'employee'] },
  { href: "/mobile", icon: Smartphone, label: "Mobile View", roles: ['installer'] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, role } = useAuth();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const navItemsForUser = React.useMemo(() => {
    return allNavItems.filter(item => {
      if (!role) return false;
      if (!item.roles.includes(role)) return false;
      
      if (role === 'admin') return true;

      if (role === 'employee' || role === 'Accounts') {
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
    <SidebarProvider defaultOpen={true}>
      <Sidebar>
        <SidebarHeader>
          <div className="p-4 flex items-center gap-2">
            <Image src="/logo.png" alt="MoTrack Logo" width={32} height={32} />
            <h1 className="text-lg font-bold text-sidebar-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300">MoTrack</h1>
            <div className="flex-grow" />
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
                    className="group-hover:justify-start justify-center"
                  >
                    <item.icon className="group-data-[active=true]:text-sidebar-primary-foreground" />
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 group-data-[active=true]:font-bold">{item.label}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
            <div className="px-2 py-4">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-3 text-left w-full p-2 hover:bg-sidebar-accent rounded-md">
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={`https://placehold.co/100x100.png`} data-ai-hint="avatar" />
                                <AvatarFallback>{user?.name?.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <p className="font-semibold text-sm text-sidebar-foreground">{user?.name}</p>
                            </div>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-56">
                        <DropdownMenuLabel>My Account</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="flex justify-between items-center focus:bg-transparent">
                            <Label htmlFor="dark-mode-switch">Dark Mode</Label>
                             <Switch
                                id="dark-mode-switch"
                                checked={theme === 'dark'}
                                onCheckedChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            />
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={logout} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                           <LogOut className="mr-2 h-4 w-4" />
                           <span>Logout</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1">
        {children}
      </main>
    </SidebarProvider>
  );
}
