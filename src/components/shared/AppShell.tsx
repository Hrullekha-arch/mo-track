
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  BarChartHorizontalBig,
  Table,
  Home,
  ShoppingCart,
  Archive,
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
import { Separator } from "../ui/separator";

const navItems = [
    { href: "/dashboard", icon: Home, label: "Home", roles: ['admin', 'employee', 'Accounts'] },
    { href: "/dashboard/approvals", icon: FileSignature, label: "Approvals", roles: ['admin', 'Accounts'] },
    { href: "/dashboard/visits", icon: CalendarCheck, label: "Visits", roles: ['admin', 'employee'] },
    { href: "/dashboard/customers", icon: Contact, label: "Customers", roles: ['admin', 'employee'] },
    { href: "/dashboard/orders", icon: ClipboardList, label: "Orders", roles: ['admin', 'employee'] },
    { href: "/dashboard/purchase", icon: ShoppingCart, label: "Purchase", roles: ['admin', 'employee'] },
    { href: "/dashboard/inbound", icon: Archive, label: "Inbound", roles: ['admin', 'employee'] },
    { href: "/dashboard/inventory", icon: Warehouse, label: "Inventory", roles: ['admin', 'employee'] },
    { href: "/dashboard/invoice", icon: FileText, label: "Invoice", roles: ['admin', 'employee'] },
    { href: "/dashboard/cutting", icon: Scissors, label: "Cutting & Details", roles: ['admin', 'employee'] },
    { href: "/dashboard/all-orders", icon: Table, label: "Details", roles: ['admin'] },
    { href: "/dashboard/users", icon: UserCog, label: "User Management", roles: ['admin'] },
    { href: "/dashboard/reports", icon: BarChartHorizontalBig, label: "Reports", roles: ['admin'] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, role } = useAuth();
  const pathname = usePathname();

  const navItemsForUser = React.useMemo(() => {
    return navItems.filter(item => {
      if (!role) return false;
      return item.roles.includes(role);
    });
  }, [role]);

  return (
    <div className="flex h-screen bg-background">
      <aside className="group w-16 hover:w-64 transition-all duration-300 ease-in-out flex-col border-r bg-card text-card-foreground hidden md:flex dark">
        <div className="p-4 flex items-center gap-2 h-[65px] border-b">
            <Image src="/logo.png" alt="MoTrack Logo" width={32} height={32} className="rounded-md"/>
            <span className="font-bold text-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200">MoTrack</span>
        </div>
        <nav className="flex-1 space-y-2 p-2">
            {navItemsForUser.map((item) => (
                <Link key={item.href} href={item.href} passHref>
                    <Button
                    variant={pathname.startsWith(item.href) ? "secondary" : "ghost"}
                    className="w-full justify-start items-center gap-3"
                    >
                    <item.icon className="mr-0 h-5 w-5 flex-shrink-0" />
                    <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-200">{item.label}</span>
                    </Button>
                </Link>
            ))}
        </nav>
        <div className="p-2 border-t">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={`https://placehold.co/100x100.png`} data-ai-hint="avatar" />
              <AvatarFallback>{user?.name?.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-grow opacity-0 group-hover:opacity-100 transition-opacity duration-200 overflow-hidden">
              <p className="font-semibold text-sm truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
