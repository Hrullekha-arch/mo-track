
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, ShoppingCart, Users, Truck, PackageCheck, Archive, Table, GanttChartSquare } from "lucide-react";
import Link from "next/link";
import { getFirestore } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { Badge } from "@/components/ui/badge";

const dashboardItems = [
    {
        href: "/dashboard/orders",
        title: "Orders",
        description: "Track and manage all customer orders.",
        icon: ClipboardList,
        color: "bg-blue-500",
        id: "orders"
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
        href: "/dashboard/pms",
        title: "PMS",
        description: "Project management and timeline tracking.",
        icon: GanttChartSquare,
        color: "bg-cyan-500",
        id: "pms"
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

async function getO2dCount() {
    try {
        const ordersSnapshot = await adminDb.collection('orders').get();
        const orders = ordersSnapshot.docs.map(doc => doc.data());

        const pendingO2dOrders = orders.filter(order => {
             const finalStep = (order.o2dMilestones || []).find((m: any) => m.stepId === 10);
             return !finalStep;
        });

        return pendingO2dOrders.length;
    } catch (error) {
        console.error("Error fetching O2D count:", error);
        return 0;
    }
}


export default async function DashboardPage() {

    const o2dCount = await getO2dCount();

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
                                     {item.id === 'o2d' && o2dCount > 0 && (
                                        <Badge className="h-6 w-6 flex items-center justify-center rounded-full text-base">
                                            {o2dCount}
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
