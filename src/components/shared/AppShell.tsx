
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
  Moon,
  Sun,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Separator } from "../ui/separator";
import { Switch } from "../ui/switch";
import { useTheme } from "next-themes";

const allNavItems = [
  { href: "/dashboard", icon: Home, label: "Dashboard", roles: ['admin', 'employee'] },
  { href: "/dashboard/orders", icon: ClipboardList, label: "Orders", roles: ['admin', 'employee'] },
  { href: "/dashboard/customers", icon: Contact, label: "Customers", roles: ['admin', 'employee'] },
  { href: "/dashboard/purchase", icon: ShoppingCart, label: "Purchase", roles: ['admin', 'employee'] },
  { href: "/dashboard/inventory", icon: Warehouse, label: "Inventory", roles: ['admin', 'employee'] },
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
            <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent">
                <ShoppingCart className="text-sidebar-primary" />
            </Button>
            <h1 className="text-lg font-bold text-sidebar-foreground">SHOPPING</h1>
          </div>
        </SidebarHeader>

        <SidebarContent className="p-4">
            <div className="flex items-center gap-3 mb-4">
                 <Avatar className="h-10 w-10">
                    <AvatarImage src={`https://placehold.co/100x100.png`} data-ai-hint="avatar" />
                    <AvatarFallback>{user?.name?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                 <div className="text-left group-data-[collapsible=icon]:hidden">
                    <p className="font-semibold text-sm text-sidebar-foreground">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
            </div>

            <Separator className="my-4 bg-sidebar-border"/>
          
          <SidebarMenu>
            {navItemsForUser.map((item) => (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    tooltip={{ children: item.label }}
                    className="group-data-[collapsible=icon]:justify-center"
                  >
                    <item.icon className="group-data-[active=true]:text-sidebar-primary" />
                    <span className="group-data-[active=true]:font-bold group-data-[active=true]:text-sidebar-primary">{item.label}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="p-4">
             <Separator className="my-4 bg-sidebar-border"/>
            <SidebarMenu>
                 <SidebarMenuItem>
                    <SidebarMenuButton
                        onClick={logout}
                        tooltip={{ children: 'Logout' }}
                        className="group-data-[collapsible=icon]:justify-center"
                    >
                        <LogOut />
                        <span>Logout</span>
                    </SidebarMenuButton>
                 </SidebarMenuItem>
                 <SidebarMenuItem>
                    <div className="flex items-center justify-between p-2 rounded-md">
                        <div className="flex items-center gap-2">
                            <Moon/>
                            <span className="text-sm group-data-[collapsible=icon]:hidden">Dark Mode</span>
                        </div>
                        <Switch
                          checked={theme === 'dark'}
                          onCheckedChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                          className="group-data-[collapsible=icon]:hidden"
                        />
                    </div>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1">
        {children}
      </main>
    </SidebarProvider>
  );
}
