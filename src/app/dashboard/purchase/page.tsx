

"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Loader2, CheckCheck, History } from 'lucide-react';
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest } from "@/lib/types";
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PurchaseRequestTable } from '@/components/features/purchase/PurchaseRequestTable';

export default function PurchasePage() {
    const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, "purchaseRequests"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));
            setPurchaseRequests(requestsData);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);
    
    const activeRequests = useMemo(() => purchaseRequests.filter(req => req.status !== 'Completed'), [purchaseRequests]);
    const completedRequests = useMemo(() => purchaseRequests.filter(req => req.status === 'Completed'), [purchaseRequests]);
    
    const renderRequestCount = (requests: PurchaseRequest[]) => {
        if (loading) {
            return <Loader2 className="h-4 w-4 animate-spin" />;
        }
        return requests.length;
    };

    return (
        <div className="space-y-4">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Purchase Process</h1>
                <p className="text-muted-foreground">Manage and track all purchase requests from authorization to placing the order.</p>
            </header>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 <Card className="hover:shadow-lg transition-shadow">
                    <Link href="/dashboard/purchase/pending-po">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div className="space-y-1">
                                <CardTitle>SO to PO</CardTitle>
                                <CardDescription>Generate purchase orders from sales orders.</CardDescription>
                            </div>
                            <ArrowRight className="h-6 w-6 text-primary" />
                        </CardHeader>
                    </Link>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Active Purchases</CardTitle>
                        <CardDescription>Requests currently in the workflow.</CardDescription>
                    </CardHeader>
                     <CardContent>
                        <p className="text-3xl font-bold">{renderRequestCount(activeRequests)}</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Completed Purchases</CardTitle>
                        <CardDescription>Fully received purchase requests.</CardDescription>
                    </CardHeader>
                     <CardContent>
                        <p className="text-3xl font-bold">{renderRequestCount(completedRequests)}</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="active" className="w-full pt-4">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="active">Active Purchases</TabsTrigger>
                    <TabsTrigger value="history">Purchase History</TabsTrigger>
                </TabsList>
                <TabsContent value="active" className="pt-4">
                     {loading ? <Skeleton className="h-96 w-full" /> : <PurchaseRequestTable tableData={activeRequests} />}
                </TabsContent>
                <TabsContent value="history" className="pt-4">
                     {loading ? <Skeleton className="h-96 w-full" /> : <PurchaseRequestTable tableData={completedRequests} />}
                </TabsContent>
            </Tabs>
        </div>
    );
}
