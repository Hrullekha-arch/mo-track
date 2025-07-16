
"use client";

import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { ClipboardList, UserCog, LogOut, Smartphone, BarChartHorizontalBig } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
    { href: "/dashboard", icon: ClipboardList, label: "Orders", roles: ['admin', 'employee'] },
    { href: "/dashboard/users", icon: UserCog, label: "Users", roles: ['admin'] },
    { href: "/dashboard/reports", icon: BarChartHorizontalBig, label: "Reports", roles: ['admin'] },
    { href: "/mobile", icon: Smartphone, label: "Mobile View", roles: ['installer'] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
    const { user, logout, role } = useAuth();
    const pathname = usePathname();

    const filteredNavItems = navItems.filter(item => role && item.roles.includes(role));

    return (
        <SidebarProvider>
            <Sidebar>
                <SidebarHeader>
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-primary rounded-lg text-primary-foreground">
                            <ClipboardList className="h-6 w-6" />
                        </div>
                        <h1 className="text-xl font-bold">MoTrack</h1>
                    </div>
                </SidebarHeader>
                <SidebarContent>
                    <SidebarMenu>
                        {filteredNavItems.map((item) => (
                             <SidebarMenuItem key={item.href}>
                                <Link href={item.href} className="w-full">
                                    <SidebarMenuButton isActive={pathname === item.href}>
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
                            <Button variant="ghost" className="justify-start gap-2 w-full px-2">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={user?.avatarUrl} alt={user?.name} />
                                    <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="text-left">
                                    <p className="font-semibold text-sm">{user?.name}</p>
                                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                                </div>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56 mb-2" align="end" forceMount>
                            <DropdownMenuLabel className="font-normal">
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium leading-none">{user?.name}</p>
                                    <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={logout}>
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>Log out</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SidebarFooter>
            </Sidebar>
            <SidebarInset>
                <header className="sticky top-0 z-10 flex items-center justify-between h-14 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <SidebarTrigger className="md:hidden" />
                    <div>{/* Can add page title here */}</div>
                </header>
                {children}
            </SidebarInset>
        </SidebarProvider>
    );
}
