
"use client";

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { Archive, Layers, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function InboundCard({ request }: { request: PurchaseRequest }) {
    const hasFabric = request.fabricDetails && request.fabricDetails.length > 0 && request.fabricDetails.some(f => f.fabricName);
    const hasFurniture = request.furnitureDetails && request.furnitureDetails.length > 0 && request.furnitureDetails.some(f => f.furnitureName);
    const defaultTab = hasFabric ? "fabric" : "furniture";

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>{request.customerName}</CardTitle>
                        <CardDescription>Deal ID: {request.dealId}</CardDescription>
                    </div>
                    <Badge variant={request.type === 'fabric' ? 'default' : 'secondary'} className="capitalize">{request.type}</Badge>
                </div>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue={defaultTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="fabric" disabled={!hasFabric}>Fabric</TabsTrigger>
                        <TabsTrigger value="furniture" disabled={!hasFurniture}>Furniture</TabsTrigger>
                    </TabsList>
                    <TabsContent value="fabric">
                        <div className="space-y-2 text-sm text-muted-foreground pt-2">
                            <h4 className="font-semibold text-foreground">Received Fabric</h4>
                             <Separator />
                            {request.fabricDetails?.map((item, index) => item.fabricName && (
                                <div key={index} className="flex justify-between p-2 rounded-md hover:bg-muted/50">
                                    <span>{item.fabricName}</span>
                                    <span className="font-mono">{item.quantity} Mtr</span>
                                </div>
                            ))}
                        </div>
                    </TabsContent>
                    <TabsContent value="furniture">
                        <div className="space-y-2 text-sm text-muted-foreground pt-2">
                             <h4 className="font-semibold text-foreground">Received Furniture</h4>
                             <Separator />
                            {request.furnitureDetails?.map((item, index) => item.furnitureName && (
                                <div key={index} className="flex justify-between p-2 rounded-md hover:bg-muted/50">
                                    <span>{item.furnitureName}</span>
                                    <span className="font-mono">{item.quantity}</span>
                                </div>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}


export default function InboundPage() {
    const [inboundRequests, setInboundRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // A PO is considered "inbound" once it's marked as "Sent to Location" (step 5)
        const q = query(
            collection(db, "purchaseRequests"),
            where("poMilestones", "array-contains", {
                stepId: 5,
                status: 'completed',
                // We cannot query for fields inside the object, so we filter client-side
            })
        );

        const unsubscribe = onSnapshot(query(collection(db, "purchaseRequests")), (snapshot) => {
            const allRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));
            
            const filteredRequests = allRequests.filter(req => 
                req.poMilestones?.some(m => m.stepId === 5 && m.status === 'completed')
            );
            
            setInboundRequests(filteredRequests.sort((a,b) => {
                 const aDate = a.poMilestones?.find(m => m.stepId === 5)?.completedAt || a.createdAt;
                 const bDate = b.poMilestones?.find(m => m.stepId === 5)?.completedAt || b.createdAt;
                 return new Date(bDate).getTime() - new Date(aDate).getTime();
            }));
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    if (loading) {
        return (
            <div className="container mx-auto p-4 md:p-6 lg:p-8">
                <header className="mb-8">
                    <Skeleton className="h-9 w-1/2 mb-2" />
                    <Skeleton className="h-5 w-3/4" />
                </header>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Inbound Materials</h1>
                <p className="text-muted-foreground">
                    A log of all materials that have been received and processed through the PO tracking system.
                </p>
            </header>

            {inboundRequests.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {inboundRequests.map(request => (
                        <InboundCard key={request.id} request={request} />
                    ))}
                </div>
            ) : (
                <Card className="text-center p-12">
                    <div className="mx-auto bg-primary text-primary-foreground rounded-full p-3 w-fit mb-4">
                        <Package className="h-8 w-8" />
                    </div>
                    <CardTitle>No Inbound Items Found</CardTitle>
                    <CardDescription>
                        When a purchase order completes the "PO to Order Receive" workflow, it will appear here.
                    </CardDescription>
                </Card>
            )}
        </div>
    );
}
