
import { AllOrdersTable } from "@/components/features/order-management/AllOrdersTable";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import O2DPage from "../o2d/page";
import { PendingOrdersList } from "@/components/features/order-management/PendingOrdersList";
import { OrdersDashboard } from "@/components/features/order-management/OrdersDashboard";
import PurchasePage from "../purchase/page";
import PoTrackingPage from "../po-tracking/page";
import InboundPage from "../inbound/page";
import { UserManagement } from "@/components/features/user-management/UserManagement";


export default function AllOrdersPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Details</h1>
                <p className="text-muted-foreground">A comprehensive view of all data and processes.</p>
            </header>
            <Tabs defaultValue="all-orders" className="w-full">
                <TabsList className="grid w-full grid-cols-7">
                    <TabsTrigger value="all-orders">All Orders</TabsTrigger>
                    <TabsTrigger value="o2d">O2D</TabsTrigger>
                    <TabsTrigger value="orders">Orders</TabsTrigger>
                    <TabsTrigger value="purchase">Purchase</TabsTrigger>
                    <TabsTrigger value="po-tracking">PO Tracking</TabsTrigger>
                    <TabsTrigger value="inbound">Inbound</TabsTrigger>
                    <TabsTrigger value="users">Users</TabsTrigger>
                </TabsList>
                <TabsContent value="all-orders">
                     <Suspense fallback={<AllOrdersSkeleton />}>
                        <AllOrdersTable />
                    </Suspense>
                </TabsContent>
                <TabsContent value="o2d">
                    <O2DPage />
                </TabsContent>
                 <TabsContent value="orders">
                    <Suspense fallback={<OrdersDashboardSkeleton />}>
                        <OrdersDashboard />
                    </Suspense>
                </TabsContent>
                 <TabsContent value="purchase">
                    <PurchasePage />
                </TabsContent>
                 <TabsContent value="po-tracking">
                    <PoTrackingPage />
                </TabsContent>
                 <TabsContent value="inbound">
                    <InboundPage />
                </TabsContent>
                 <TabsContent value="users">
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
