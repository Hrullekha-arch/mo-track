
"use client";

import { Card, CardDescription, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DollarSign, ShoppingCart, Users, Activity, FileText, UserCog, Archive, GanttChartSquare, ClipboardList, CheckSquare, Table } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Order } from "@/lib/types";

interface SummaryCardProps {
    title: string;
    description: string;
    count: number | null;
    href: string;
    icon: React.ElementType;
    loading: boolean;
}

function SummaryCard({ title, description, count, href, icon: Icon, loading }: SummaryCardProps) {
    return (
        <Link href={href}>
            <Card className="hover:bg-muted/50 hover:shadow-lg transition-all">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">{title}</CardTitle>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    {loading ? (
                         <Skeleton className="h-7 w-12" />
                    ) : (
                        <div className="text-2xl font-bold">{count}</div>
                    )}
                    <p className="text-xs text-muted-foreground">{description}</p>
                </CardContent>
            </Card>
        </Link>
    )
}

export default function DashboardPage() {
    const [o2dCount, setO2dCount] = useState<number | null>(null);
    const [toBeReceivedCount, setToBeReceivedCount] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const ordersQuery = query(collection(db, "orders"));
        const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
            const ordersData = snapshot.docs.map(doc => doc.data() as Order);

            const o2d = ordersData.filter(order => {
                const finalO2DStep = order.o2dMilestones?.find(m => m.stepId === 10);
                return !finalO2DStep && order.isAcknowledged;
            }).length;
            setO2dCount(o2d);

            const toBeReceived = ordersData.filter(order => {
                const firstMilestone = order.milestones.find(m => m.id === 1);
                return firstMilestone && !firstMilestone.completed && !order.isAcknowledged;
            }).length;
            setToBeReceivedCount(toBeReceived);

            setLoading(false);
        }, (error) => {
            console.error("Error fetching dashboard counts:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const dashboardItems = [
        {
          title: "O2D",
          description: "Pre-production workflow",
          count: o2dCount,
          href: "/dashboard/o2d",
          icon: GanttChartSquare
        },
        {
          title: "To Be Received",
          description: "Acknowledge new orders",
          count: toBeReceivedCount,
          href: "/dashboard/pending",
          icon: CheckSquare
        },
        {
          title: "Orders Dashboard",
          description: "Track all active orders",
          count: null,
          href: "/dashboard/orders",
          icon: ClipboardList
        },
        {
          title: "Purchase",
          description: "Manage all procurement",
          count: null,
          href: "/dashboard/purchase",
          icon: ShoppingCart
        },
        {
          title: "Inbound",
          description: "Manage incoming stock",
          count: null,
          href: "/dashboard/inbound",
          icon: Archive
        },
        {
          title: "Details",
          description: "View detailed reports",
          count: null,
          href: "/dashboard/all-orders",
          icon: Table
        },
        {
          title: "User Management",
          description: "Manage all accounts",
          count: null,
          href: "/dashboard/users",
          icon: UserCog
        }
      ];

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Home Dashboard</h1>
                <p className="text-muted-foreground">Welcome! Here's a summary of your operations.</p>
            </header>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {dashboardItems.map(item => (
                    <SummaryCard 
                        key={item.title}
                        title={item.title}
                        description={item.description}
                        count={item.count}
                        href={item.href}
                        icon={item.icon}
                        loading={loading}
                    />
                ))}
            </div>
        </div>
    );
}

