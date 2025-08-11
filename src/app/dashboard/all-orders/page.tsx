
import { AllOrdersTable } from "@/components/features/order-management/AllOrdersTable";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import O2DPage from "../o2d/page";
import { OrdersDashboard } from "@/components/features/order-management/OrdersDashboard";
import PurchasePage from "../purchase/page";
import PoTrackingPage from "../po-tracking/page";
import InboundPage from "../inbound/page";
import { UserManagement } from "@/components/features/user-management/UserManagement";
import { O2DTable } from "@/components/features/order-management/O2DTable";
import { PurchaseRequestTable } from "@/components/features/purchase/PurchaseRequestTable";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";


export default function AllOrdersPage() {
    return (
        <div className="w-full p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Details</h1>
                <p className="text-muted-foreground">A comprehensive view of all data and processes.</p>
            </header>
            <Tabs defaultValue="all-orders" className="w-full">
                <ScrollArea className="w-full whitespace-nowrap">
                    <TabsList className="inline-flex h-auto">
                        <TabsTrigger value="all-orders">All Orders</TabsTrigger>
                        <TabsTrigger value="o2d">O2D</TabsTrigger>
                        <TabsTrigger value="orders">Orders</TabsTrigger>
                        <TabsTrigger value="purchase">Purchase</TabsTrigger>
                        <TabsTrigger value="po-tracking">PO Tracking</TabsTrigger>
                        <TabsTrigger value="inbound">Inbound</TabsTrigger>
                        <TabsTrigger value="users">Users</TabsTrigger>
                    </TabsList>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
                <TabsContent value="all-orders" className="mt-4">
                     <Suspense fallback={<AllOrdersSkeleton />}>
                        <AllOrdersTable />
                    </Suspense>
                </TabsContent>
                <TabsContent value="o2d" className="mt-4">
                    <Suspense fallback={<AllOrdersSkeleton />}>
                        <O2DTable />
                    </Suspense>
                </TabsContent>
                 <TabsContent value="orders" className="mt-4">
                    <Suspense fallback={<AllOrdersSkeleton />}>
                        <AllOrdersTable />
                    </Suspense>
                </TabsContent>
                 <TabsContent value="purchase" className="mt-4">
                    <Suspense fallback={<AllOrdersSkeleton />}>
                        <PurchaseRequestTable />
                    </Suspense>
                </TabsContent>
                 <TabsContent value="po-tracking" className="mt-4">
                     <Suspense fallback={<AllOrdersSkeleton />}>
                        <PurchaseRequestTable view="po-tracking" />
                    </Suspense>
                </TabsContent>
                 <TabsContent value="inbound" className="mt-4">
                     <Suspense fallback={<AllOrdersSkeleton />}>
                        <PurchaseRequestTable view="all" />
                    </Suspense>
                </TabsContent>
                 <TabsContent value="users" className="mt-4">
                    <UserManagement />
                </TabsContent>
            </Tabs>
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

function OrdersDashboardSkeleton() {
    return (
        <div className="space-y-4">
            <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
                <div>
                <Skeleton className="h-9 w-48 mb-2" />
                <Skeleton className="h-5 w-72" />
                </div>
                <Skeleton className="h-10 w-32" />
            </header>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 mb-6">
                {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
                ))}
            </div>
            <div className="mb-6 p-4 border rounded-lg bg-card">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                </div>
            </div>
            <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
                <Skeleton className="h-[450px] w-full" />
                <Skeleton className="h-[450px] w-full" />
            </div>
        </div>
    )
}
