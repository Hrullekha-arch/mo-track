
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
  Factory,
  Download,
  UserPlus,
  PackageSearch,
  TrendingUp,
  ShieldCheck,
  Sofa,
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
    // { href: "/dashboard/fms", icon: Factory, label: "FMS", roles: ['admin', 'employee'] },
    { href: "/dashboard/pms", icon: ClipboardList, label: "PMS", roles: ['admin', 'employee'] },
    { href: "/dashboard/approvals", icon: FileSignature, label: "Approvals", roles: ['admin', 'Accounts'] },
    { href: "/dashboard/stock-verification", icon: PackageSearch, label: "Stock Verification", roles: ['admin', 'employee'] },
    { href: "/dashboard/visits", icon: CalendarCheck, label: "Visits", roles: ['admin', 'employee'] },
    { href: "/dashboard/complain-approval", icon: ShieldCheck, label: "Complain Approval", roles: ['admin', 'employee'] },
    { href: "/dashboard/customers", icon: Contact, label: "Customers", roles: ['admin', 'employee'] },
    { href: "/dashboard/walk-in", icon: UserPlus, label: "Walk-in", roles: ['admin', 'employee'] },
    { href: "/dashboard/Sales", icon: ClipboardList, label: "Sales", roles: ['admin', 'employee'] },
    { href: "/dashboard/purchase", icon: ShoppingCart, label: "Purchase", roles: ['admin', 'employee'] },
    { href: "/dashboard/inbound", icon: Archive, label: "Inbound", roles: ['admin', 'employee'] },
    { href: "/dashboard/inventory", icon: Warehouse, label: "Inventory", roles: ['admin', 'employee'] },
    { href: "/dashboard/Billing", icon: FileText, label: "Invoice", roles: ['admin', 'employee'] },
    //{ href: "/dashboard/cutting", icon: Scissors, label: "Cutting & Details", roles: ['admin', 'employee'] },
    { href: "/dashboard/all-orders", icon: Table, label: "Details", roles: ['admin'] },
    { href: "/dashboard/users", icon: UserCog, label: "User Management", roles: ['admin'] },
    { href: "/dashboard/user-report", icon: Users, label: "User Report", roles: ['admin'] },
    { href: "/dashboard/reports", icon: BarChartHorizontalBig, label: "Reports", roles: ['admin'] },
    { href: "/dashboard/meca", icon: TrendingUp, label: "MeCA", roles: ['admin', 'employee', 'Accounts'] },
    { href: "/dashboard/furniture-details", icon: Sofa, label: "Furniture Details", roles: ['admin', 'employee'] },
];

function SidebarNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const { user, role } = useAuth();

  const navItemsForUser = React.useMemo(() => {
    const normalizedRole = String(role || user?.role || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]/g, "");
    const normalizedDesignation = String((user as any)?.designation || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]/g, "");
    const isHeadSalesManager =
      normalizedRole === "headsalesmanager" || normalizedDesignation === "headsalesmanager";

    return navItems.filter(item => {
      if (!user) return false;
      // Admin sees everything
      if (role === 'admin') return true;
      // Headsalesmanager can always access complain approval page.
      if (isHeadSalesManager && item.href === "/dashboard/complain-approval") return true;
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
    const [installPrompt, setInstallPrompt] = React.useState<Event | null>(null);

    React.useEffect(() => {
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setInstallPrompt(e);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = () => {
        if (!installPrompt) return;
        (installPrompt as any).prompt();
        (installPrompt as any).userChoice.then(() => {
            setInstallPrompt(null);
        });
    };

    return (
        <div className="p-2 mt-auto border-t">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start items-center gap-3 p-2 h-auto">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={`https://placehold.co/100x100.png`} />
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
                 {installPrompt && (
                    <DropdownMenuItem onClick={handleInstallClick} className="cursor-pointer">
                        <Download className="mr-2 h-4 w-4" />
                        <span>Install App</span>
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                    <Link href="/dashboard/account" className="flex items-center gap-2">
                        <UserCog className="h-4 w-4" />
                        <span>Profile &amp; Handover</span>
                    </Link>
                </DropdownMenuItem>
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

function MobileUserMenu() {
    const { user, logout } = useAuth();
    const { theme, setTheme } = useTheme();
     const [installPrompt, setInstallPrompt] = React.useState<Event | null>(null);

    React.useEffect(() => {
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setInstallPrompt(e);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = () => {
        if (!installPrompt) return;
        (installPrompt as any).prompt();
        (installPrompt as any).userChoice.then(() => {
            setInstallPrompt(null);
        });
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={`https://placehold.co/100x100.png`} />
                        <AvatarFallback>{user?.name?.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{user?.name}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {installPrompt && (
                    <DropdownMenuItem onClick={handleInstallClick} className="cursor-pointer">
                        <Download className="mr-2 h-4 w-4" />
                        <span>Install App</span>
                    </DropdownMenuItem>
                )}
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
    );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, role } = useAuth();
  const mobileNavItems = React.useMemo(() => {
    return navItems.filter((item) => {
      if (!user) return false;
      if (role === "admin") return true;
      return user.permissions?.includes(item.href);
    });
  }, [user, role]);

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
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <PanelLeft className="h-6 w-6"/>
                        <span className="sr-only">Toggle Menu</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0 bg-card/10 dark backdrop-blur-lg text-primary-teal-800">
                     <SheetHeader className="p-4 border-b">
                        <SheetTitle className="flex items-center gap-2">
                             <Image src="/logo.png" alt="MoTrack Logo" width={32} height={32} className="rounded-md"/>
                             <span>MoTrack</span>
                        </SheetTitle>
                    </SheetHeader>
                    <div className="flex flex-col h-full">
                        <div className="flex-1 overflow-y-auto">
                             <nav className={cn("space-y-1 p-2")}>
                                {mobileNavItems.map((item) => {
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
                                            <span className="truncate">{item.label}</span>
                                        </Button>
                                        </Link>
                                    )
                                })}
                            </nav>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2">
                 <MobileUserMenu />
            </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
