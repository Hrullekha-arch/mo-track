
"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ArrowRight, Archive, ClipboardList, GanttChartSquare, Package, ShoppingCart } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

interface FmsCardProps {
    title: string;
    description: string;
    href: string;
    icon: React.ElementType;
}

function FmsCard({ title, description, href, icon: Icon }: FmsCardProps) {
    return (
        <Link href={href} className="block group">
            <Card className="hover:border-primary hover:shadow-lg transition-all h-full">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>{title}</span>
                        <Icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    </CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center text-sm text-primary font-medium">
                        <span>Go to {title}</span>
                        <ArrowRight className="ml-2 h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}

export default function FmsPage() {
    const fmsModules = [
        {
            title: "O2D",
            description: "Manage pre-production order checklists.",
            href: "/dashboard/o2d",
            icon: GanttChartSquare
        },
        {
            title: "Purchase",
            description: "Create and track purchase requests.",
            href: "/dashboard/purchase",
            icon: ShoppingCart
        },
        {
            title: "PO Generation",
            description: "Generate Purchase Orders from Sales Orders.",
            href: "/dashboard/purchase/pending-po",
            icon: ClipboardList
        },
        {
            title: "Inbound",
            description: "Manage incoming stock and materials.",
            href: "/dashboard/inbound",
            icon: Archive
        },
        {
            title: "PMS",
            description: "Track the production and stitching workflow.",
            href: "/dashboard/pms",
            icon: Package
        }
    ];

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
             <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Factory Management System (FMS)</h1>
                <p className="text-muted-foreground">Your central hub for all factory and production operations.</p>
            </header>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {fmsModules.map(mod => (
                    <FmsCard 
                        key={mod.title}
                        title={mod.title}
                        description={mod.description}
                        href={mod.href}
                        icon={mod.icon}
                    />
                ))}
            </div>
        </div>
    );
}
