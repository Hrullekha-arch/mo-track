
"use client";

import { AllOrdersTable } from "@/components/features/order-management/AllOrdersTable";
import { Suspense, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManagement } from "@/components/features/user-management/UserManagement";
import { O2DTable } from "@/components/features/order-management/O2DTable";
import { PurchaseRequestTable } from "@/components/features/purchase/PurchaseRequestTable";
import { PoGenTable } from "@/components/features/purchase/PoGenTable";
import { InboundTable } from "@/components/features/purchase/InboundTable"; // New import
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";


export default function AllOrdersPage() {
    const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const requestsQuery = query(collection(db, "purchaseRequests"));

        const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
            const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));
            setPurchaseRequests(requestsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching purchase requests:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not load purchase request data.",
            });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [toast]);
    
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
                        <TabsTrigger value="purchase">Purchase</TabsTrigger>
                        <TabsTrigger value="po-gen">Po Gen</TabsTrigger>
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
                 <TabsContent value="purchase" className="mt-4">
                    <Suspense fallback={<AllOrdersSkeleton />}>
                        <PurchaseRequestTable tableData={purchaseRequests} view="default" timelineType="purchase" />
                    </Suspense>
                </TabsContent>
                <TabsContent value="po-gen" className="mt-4">
                    <Suspense fallback={<AllOrdersSkeleton />}>
                        <PoGenTable tableData={purchaseRequests} />
                    </Suspense>
                </TabsContent>
                <TabsContent value="inbound" className="mt-4">
                    <Suspense fallback={<AllOrdersSkeleton />}>
                        <InboundTable tableData={purchaseRequests} />
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
