
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, ShoppingCart, Users } from "lucide-react";
import Link from "next/link";

const dashboardItems = [
    {
        href: "/dashboard/orders",
        title: "Orders",
        description: "Track and manage all customer orders.",
        icon: ClipboardList,
        color: "bg-blue-500",
    },
    {
        href: "/dashboard/purchase",
        title: "Purchase",
        description: "Manage procurement and inventory.",
        icon: ShoppingCart,
        color: "bg-green-500",
    },
    {
        href: "/dashboard/users",
        title: "Users & Accounts",
        description: "Manage users and their permissions.",
        icon: Users,
        color: "bg-purple-500",
    },
];

export default function DashboardPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Home Dashboard</h1>
                <p className="text-muted-foreground">Welcome! Select a module to get started.</p>
            </header>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {dashboardItems.map((item) => (
                    <Link href={item.href} key={item.title}>
                        <Card className="group hover:shadow-lg transition-shadow duration-300 transform hover:-translate-y-1">
                            <CardHeader>
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-lg ${item.color}`}>
                                        <item.icon className="h-6 w-6 text-white" />
                                    </div>
                                    <div>
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
