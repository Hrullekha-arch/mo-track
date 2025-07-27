
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ClipboardList, ShoppingCart, Users, Truck, PackageCheck, Archive, Table, GanttChartSquare, CheckCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { adminDb } from "@/lib/firebase-admin";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

async function getCounts() {
    try {
        const ordersSnapshot = await adminDb.collection('orders').get();
        const orders = ordersSnapshot.docs.map(doc => doc.data());

        const pendingO2dOrders = orders.filter(order => {
             const finalStep = (order.o2dMilestones || []).find((m: any) => m.stepId === 10);
             return !finalStep;
        });

        return { o2dCount: pendingO2dOrders.length, connectionError: null };
    } catch (error: any) {
        console.error("Error fetching counts from Firestore:", error.message);
        // This provides a more user-friendly error message.
        let errorMessage = "Connection Failed. ";
        if (error.code === 'INVALID_CREDENTIAL' || (error.message && error.message.includes('permission-denied'))) {
            errorMessage += "The service account credentials in your .env file are not valid or missing. Please check them.";
        } else {
            errorMessage += "Could not connect to the database. Please check server logs.";
        }
        return { o2dCount: 0, connectionError: errorMessage };
    }
}


export default async function DashboardPage() {

    const { o2dCount, connectionError } = await getCounts();

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Home Dashboard</h1>
                <p className="text-muted-foreground">Welcome! Select a module to get started.</p>
            </header>
            
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>System Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className={cn(
                        "flex items-center gap-2 p-3 rounded-md text-sm font-medium",
                        connectionError ? "bg-destructive/10 text-destructive" : "bg-green-100/60 text-green-700"
                    )}>
                        {connectionError ? <AlertTriangle className="h-5 w-5"/> : <CheckCircle className="h-5 w-5"/>}
                        <p>
                           <span className="font-semibold">Database Connection:</span> {connectionError ? "Connection Failed" : "Connected"}
                        </p>
                    </div>
                    {connectionError && (
                        <p className="text-xs text-destructive mt-2 pl-4">{connectionError}</p>
                    )}
                </CardContent>
            </Card>

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
