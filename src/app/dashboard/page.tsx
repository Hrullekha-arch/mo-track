

import { Card, CardDescription, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ClipboardList, ShoppingCart, Users, Truck, PackageCheck, Archive, Table, GanttChartSquare, CheckCircle, AlertTriangle, Warehouse, Contact, HomeIcon, FileSignature, CheckSquare as CheckSquareIcon, FileText, Scissors } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const dashboardItems = [
    {
        href: "/dashboard",
        title: "Home",
        description: "Overview of all modules.",
        icon: HomeIcon,
        color: "bg-blue-500",
        id: "home"
    },
    {
        href: "/dashboard/orders",
        title: "Orders",
        description: "Track and manage all customer orders.",
        icon: ClipboardList,
        color: "bg-blue-500",
        id: "orders"
    },
    {
        href: "/dashboard/customers",
        title: "Customers",
        description: "Manage all customer profiles and deals.",
        icon: Contact,
        color: "bg-pink-500",
        id: "customers"
    },
    {
        href: "/dashboard/visits",
        title: "Visits",
        description: "Manage all customer visits and appointments.",
        icon: Users,
        color: "bg-indigo-500",
        id: "visits"
    },
     {
        href: "/dashboard/approvals",
        title: "Approvals",
        description: "Approve quotations and orders.",
        icon: FileSignature,
        color: "bg-yellow-600",
        id: "approvals"
    },
    {
        href: "/dashboard/purchase",
        title: "Purchase",
        description: "Manage procurement and inventory.",
        icon: ShoppingCart,
        color: "bg-green-500",
        id: "purchase"
    },
    {
        href: "/dashboard/po-tracking",
        title: "PO to Order Receive",
        description: "Track items from PO generation to receipt.",
        icon: PackageCheck,
        color: "bg-teal-500",
        id: "po-tracking"
    },
     {
        href: "/dashboard/inbound",
        title: "Inbound",
        description: "Manage all incoming materials and stock.",
        icon: Archive,
        color: "bg-rose-500",
        id: "inbound"
    },
     {
        href: "/dashboard/inventory",
        title: "Inventory",
        description: "View all purchased items and stock.",
        icon: Warehouse,
        color: "bg-yellow-500",
        id: "inventory"
    },
     {
        href: "/dashboard/invoice",
        title: "Invoice",
        description: "Create and manage invoices.",
        icon: FileText,
        color: "bg-sky-500",
        id: "invoice"
    },
     {
        href: "/dashboard/pms",
        title: "PMS",
        description: "Project management and timeline tracking.",
        icon: GanttChartSquare,
        color: "bg-cyan-500",
        id: "pms"
    },
    {
        href: "/dashboard/cutting",
        title: "Cutting & Details",
        description: "Manage fabric cutting and production details.",
        icon: Scissors,
        color: "bg-pink-500",
        id: "cutting"
    },
    {
        href: "/dashboard/users",
        title: "Users & Accounts",
        description: "Manage users and their permissions.",
        icon: Users,
        color: "bg-purple-500",
        id: "users"
    },
    {
        href: "/dashboard/o2d",
        title: "O2D (Order 2 Delivery)",
        description: "Visualize the end-to-end order process.",
        icon: Truck,
        color: "bg-orange-500",
        id: "o2d"
    },
    {
        href: "/dashboard/all-orders",
        title: "Details",
        description: "View a detailed table of all items.",
        icon: Table,
        color: "bg-gray-500",
        id: "details"
    },
];

export default async function DashboardPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Home Dashboard</h1>
                <p className="text-muted-foreground">Welcome! Select a module to get started.</p>
            </header>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {dashboardItems.map((item) => (
                    <Link href={item.href} key={item.title}>
                        <Card className="group hover:shadow-lg transition-shadow duration-300 transform hover:-translate-y-1">
                            <CardHeader>
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-lg ${item.color}`}>
                                        <item.icon className="h-6 w-6 text-white" />
                                    </div>
                                    <div className="flex-grow">
                                        <CardTitle className="text-xl group-hover:text-primary transition-colors">
                                            {item.title}
                                        </CardTitle>
                                        <CardDescription>{item.description}</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
