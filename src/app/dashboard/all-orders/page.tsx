"use client";

import { AllOrdersTable } from "@/components/features/order-management/AllOrdersTable";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AllOrdersPage() {
    return (
        <div className="w-full p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">All Orders</h1>
                <p className="text-muted-foreground">A comprehensive, live view of all orders in the system.</p>
            </header>
            <Suspense fallback={<AllOrdersSkeleton />}>
                <AllOrdersTable />
            </Suspense>
        </div>
    );
}


function AllOrdersSkeleton() {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-7 w-48 mb-2" />
                <Skeleton className="h-5 w-80" />
            </CardHeader>
            <CardContent>
                 <Skeleton className="h-[400px] w-full" />
            </CardContent>
        </Card>
    )
}
