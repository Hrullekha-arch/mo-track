
"use client";

import { useState, useEffect, useMemo } from 'react';
import { PurchaseRequest } from "@/lib/types";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from '@/components/ui/skeleton';
import { PurchaseRequestTable } from '@/components/features/purchase/PurchaseRequestTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function InboundPage() {
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
            console.error("Error fetching purchase requests for inbound:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not load inbound data.",
            });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [toast]);
    
    const activeRequests = useMemo(() => purchaseRequests.filter(req => req.status !== 'Completed'), [purchaseRequests]);

    if (loading) {
        return (
            <div className="space-y-4 p-4 md:p-6 lg:p-8">
                <header>
                    <Skeleton className="h-9 w-1/2 mb-2" />
                    <Skeleton className="h-5 w-3/4" />
                </header>
                 <Skeleton className="h-10 w-full" />
                 <Skeleton className="h-96 w-full" />
            </div>
        )
    }

    return (
        <div className="space-y-4 p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Inbound Materials</h1>
                <p className="text-muted-foreground">
                    A log of all materials for which a Purchase Order has been generated.
                </p>
            </header>
            
            <Tabs defaultValue="active" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="active">Active Inbound</TabsTrigger>
                    <TabsTrigger value="all">All Inbound</TabsTrigger>
                </TabsList>
                <TabsContent value="active" className="mt-4">
                    <PurchaseRequestTable tableData={activeRequests} view="all" />
                </TabsContent>
                <TabsContent value="all" className="mt-4">
                    <PurchaseRequestTable tableData={purchaseRequests} view="all" />
                </TabsContent>
            </Tabs>
        </div>
    );
}
