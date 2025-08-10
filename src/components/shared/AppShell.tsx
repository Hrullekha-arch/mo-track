
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
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  ClipboardList,
  UserCog,
  LogOut,
  Smartphone,
  BarChartHorizontalBig,
  Menu,
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
  Contact2,
  FileSignature,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

const allNavItems = [
  { href: "/dashboard", icon: Home, label: "Home", roles: ['admin', 'employee'] },
  { href: "/dashboard/o2d", icon: Truck, label: "O2D", roles: ['admin', 'employee'] },
  { href: "/dashboard/pending", icon: CheckSquare, label: "To Be Received", roles: ['admin', 'employee'] },
  { href: "/dashboard/orders", icon: ClipboardList, label: "Orders Dashboard", roles: ['admin', 'employee'] },
  { href: "/dashboard/customers", icon: Contact, label: "Customers", roles: ['admin', 'employee'] },
  { href: "/dashboard/visits", icon: Users, label: "Visits", roles: ['admin', 'employee'] },
  { href: "/dashboard/approvals", icon: FileSignature, label: "Approvals", roles: ['admin', 'Accounts', 'employee'] },
  { href: "/dashboard/purchase", icon: ShoppingCart, label: "Purchase", roles: ['admin', 'employee'] },
  { href: "/dashboard/inbound", icon: Archive, label: "Inbound", roles: ['admin', 'employee'] },
  { href: "/dashboard/inventory", icon: Warehouse, label: "Inventory", roles: ['admin', 'employee'] },
  { href: "/dashboard/invoice", icon: FileText, label: "Invoice", roles: ['admin', 'Accounts', 'employee'] },
  { href: "/dashboard/pms", icon: GanttChartSquare, label: "PMS", roles: ['admin', 'employee'] },
  { href: "/dashboard/all-orders", icon: Table, label: "Details", roles: ['admin'] },
  { href: "/dashboard/users", icon: UserCog, label: "User Management", roles: ['admin', 'employee'] },
  { href: "/dashboard/reports", icon: BarChartHorizontalBig, label: "Reports", roles: ['admin'] },
  { href: "/mobile", icon: Smartphone, label: "Mobile View", roles: ['installer'] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, role } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const navItemsForUser = React.useMemo(() => {
    return allNavItems.filter(item => {
      if (!role) return false;
      if (!item.roles.includes(role)) return false;
      
      // Admin sees everything assigned to 'admin'
      if (role === 'admin') return true;

      // Employee sees 'employee' roles but not admin-only ones
      if (role === 'employee') {
          return !['/dashboard/all-orders', '/dashboard/reports', '/dashboard/users'].includes(item.href)
      }
      
      // Installer only sees their specific views
      if (role === 'installer') {
        return item.href.startsWith('/mobile');
      }

      return true;
    });
  }, [role]);


  const NavItems = ({ isMobile = false }: { isMobile?: boolean }) => (
    <nav className={cn(
      "flex gap-6 text-lg font-medium md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6",
      isMobile && "flex-col text-muted-foreground"
    )}>
      {navItemsForUser.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-2 transition-colors hover:text-foreground",
            pathname.startsWith(item.href) && !['/dashboard', '/dashboard/'].includes(item.href) ? "text-foreground" : pathname === item.href ? "text-foreground" : "text-muted-foreground",
            isMobile && "py-2"
          )}
        >
          <item.icon className="h-5 w-5" />
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen w-full flex-col">
      <header className="sticky top-0 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 z-50">
        {/* Mobile Menu */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0 md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
             <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
             <div className="flex items-center gap-2 text-lg font-semibold mb-4">
                <Link href="/dashboard" onClick={() => setOpen(false)}>
                  <Image src="/logo.png" alt="MoTrack Logo" width={100} height={50} />
                </Link>
            </div>
            <NavItems isMobile />
          </SheetContent>
        </Sheet>
        
        {/* Desktop Menu */}
        <div className="hidden md:flex md:items-center md:gap-6">
            <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold">
                <Image src="/logo.png" alt="MoTrack Logo" width={100} height={50} />
                <span className="sr-only">MoTrack</span>
            </Link>
             <NavItems />
        </div>
        
        {/* User Menu */}
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                    <AvatarImage src={`https://placehold.co/100x100.png`} data-ai-hint="avatar" />
                    <AvatarFallback>{user?.name?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="sr-only">Toggle user menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>{user?.name}</DropdownMenuItem>
              <DropdownMenuItem disabled>{user?.email}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
