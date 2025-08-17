

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
  Moon,
  Sun,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Separator } from "../ui/separator";
import { useTheme } from "next-themes";
import { Switch } from "../ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";


export const navItems = [
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

function SidebarNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const { user, role } = useAuth();

  const navItemsForUser = React.useMemo(() => {
    return navItems.filter(item => {
      if (!user) return false;
      // Admin sees everything
      if (role === 'admin') return true;
      // For other roles, check the permissions array
      return user.permissions?.includes(item.href);
    });
  }, [user, role]);

  return (
    <nav className={cn("space-y-1 p-2", className)}>
      {navItemsForUser.map((item) => {
        const isActive = item.href === "/dashboard"
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
            <Link key={item.href} href={item.href} passHref>
            <Button
                variant={isActive ? "secondary" : "ghost"}
                className="w-full justify-start items-center gap-3"
            >
                <item.icon className="mr-0 h-5 w-5 flex-shrink-0" />
                <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-200">{item.label}</span>
            </Button>
            </Link>
        )
      })}
    </nav>
  );
}


function UserProfile() {
    const { user, logout } = useAuth();
    const { theme, setTheme } = useTheme();

    return (
        <div className="p-2 mt-auto border-t">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start items-center gap-3 p-2 h-auto">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={`https://placehold.co/100x100.png`} data-ai-hint="avatar" />
                      <AvatarFallback>{user?.name?.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-grow opacity-0 group-hover:opacity-100 transition-opacity duration-200 overflow-hidden text-left">
                      <p className="font-semibold text-sm truncate">{user?.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    </div>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="cursor-pointer">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center">
                        {theme === 'dark' ? <Sun className="mr-2 h-4 w-4"/> : <Moon className="mr-2 h-4 w-4"/>}
                        <span>Toggle Theme</span>
                      </div>
                      <Switch
                        checked={theme === 'dark'}
                        aria-readonly
                        className="pointer-events-none"
                      />
                    </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
    );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  
  return (
    <div className="flex h-screen bg-background">
      <aside className="group fixed inset-y-0 left-0 z-50 w-16 hover:w-64 transition-all duration-300 ease-in-out flex-col border-r bg-card/70 backdrop-blur-lg text-card-foreground hidden md:flex dark">
        <div className="p-4 flex items-center gap-2 h-[65px] border-b shrink-0">
            <Image src="/logo.png" alt="MoTrack Logo" width={32} height={32} className="rounded-md"/>
            <span className="font-bold text-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200">MoTrack</span>
        </div>
        <div className="flex-1 overflow-y-auto">
            <SidebarNav />
        </div>
        <UserProfile />
      </aside>

      <div className="flex flex-col flex-1 md:pl-16">
        <header className="md:hidden flex h-[65px] items-center justify-between border-b bg-card px-4">
            <div className="flex items-center gap-2">
                 <Image src="/logo.png" alt="MoTrack Logo" width={32} height={32} className="rounded-md"/>
                 <span className="font-bold text-lg">MoTrack</span>
            </div>
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <PanelLeft className="h-6 w-6"/>
                        <span className="sr-only">Toggle Menu</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0 bg-card/80 backdrop-blur-lg dark text-primary-foreground">
                     <SheetHeader className="p-4 border-b">
                        <SheetTitle className="flex items-center gap-2">
                             <Image src="/logo.png" alt="MoTrack Logo" width={32} height={32} className="rounded-md"/>
                             <span>MoTrack</span>
                        </SheetTitle>
                        <SheetDescription>
                            Your operations management partner.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="flex flex-col h-full">
                        <div className="flex-1 overflow-y-auto">
                             <nav className={cn("space-y-1 p-2")}>
                                {navItems.map((item) => {
                                    const isActive = item.href === "/dashboard"
                                        ? usePathname() === item.href
                                        : usePathname().startsWith(item.href);
                                    return (
                                        <Link key={item.href} href={item.href} passHref>
                                        <Button
                                            variant={isActive ? "secondary" : "ghost"}
                                            className="w-full justify-start items-center gap-3"
                                        >
                                            <item.icon className="mr-0 h-5 w-5 flex-shrink-0" />
                                            <span className="truncate">{item.label}</span>
                                        </Button>
                                        </Link>
                                    )
                                })}
                            </nav>
                        </div>
                        <div className="opacity-100 mt-auto">
                            <UserProfile />
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </header>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
