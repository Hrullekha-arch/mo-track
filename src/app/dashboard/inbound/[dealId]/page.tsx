
"use client";

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest, InboundMilestone, FabricDetail, FurnitureDetail } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Barcode, CheckCircle, Circle, Ruler, Truck, Warehouse, Weight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

const INBOUND_PROCESS_CONFIG = [
    { id: 1, name: 'QNQ as per PO', time: "30 min", icon: Ruler },
    { id: 2, name: 'Weight', time: "1hr", icon: Weight },
    { id: 3, name: 'Barcode', time: "1hr", icon: Barcode },
    { id: 4, name: 'Stock Update in Tally/CRM/Excel', time: "1hr", icon: CheckCircle },
    { id: 5, name: 'Assign Rack/Location', time: "Variable", icon: Warehouse },
];

function ItemProcessTimeline({ item }: { item: FabricDetail | FurnitureDetail }) {
    return (
        <div className="pl-4 py-2">
            <div className="grid grid-cols-5 gap-4 text-center text-xs text-muted-foreground">
                {INBOUND_PROCESS_CONFIG.map(step => {
                    const status = item.inboundMilestones?.find(m => m.stepId === step.id);
                    const isCompleted = status?.status === 'completed';
                    const Icon = step.icon;
                    return (
                        <div key={step.id} className="flex flex-col items-center gap-2">
                            <div className={cn(
                                "flex h-10 w-10 items-center justify-center rounded-full border-2",
                                isCompleted ? "bg-green-100 border-green-500" : "bg-card border-border"
                            )}>
                                <Icon className={cn("h-5 w-5", isCompleted ? "text-green-600" : "text-muted-foreground")} />
                            </div>
                            <p className="font-medium">{step.name}</p>
                            {isCompleted && status?.completedAt ? (
                                <p className="text-green-600">{format(new Date(status.completedAt), 'dd/MM HH:mm')}</p>
                            ) : (
                                <p>{step.time}</p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function InboundProcessPage({ params }: { params: { dealId: string } }) {
    const [request, setRequest] = useState<PurchaseRequest | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const docRef = doc(db, "purchaseRequests", params.dealId);
        const unsubscribe = onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                setRequest({ id: doc.id, ...doc.data() } as PurchaseRequest);
            } else {
                setRequest(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [params.dealId]);

    const items = request?.type === 'fabric' ? request.fabricDetails : request.furnitureDetails;

    if (loading) {
        return (
            <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-4">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
            </div>
        );
    }
    
    if (!request) {
        return (
             <div className="container mx-auto p-4 md:p-6 lg:p-8 text-center">
                <h1 className="text-2xl font-bold">Request not found</h1>
                <p className="text-muted-foreground">The request with ID {params.dealId} could not be found.</p>
                <Button asChild variant="link" className="mt-4">
                    <Link href="/dashboard/inbound">Go Back</Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <div className="flex items-center gap-4 mb-4">
                <Button asChild variant="outline" size="icon">
                    <Link href="/dashboard/inbound"><ArrowLeft /></Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Inbound Process</h1>
                    <p className="text-muted-foreground">Track the receiving process for each item in Deal ID: {request.dealId}</p>
                </div>
            </div>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>{request.customerName}</CardTitle>
                    <CardDescription>
                        {request.type === 'fabric' ? 'Fabric' : 'Furniture'} request from salesman {request.salesman}.
                        <br />
                        Vendor promised delivery on: {request.poDeliveryDate ? format(new Date(request.poDeliveryDate), 'PPP') : 'Not set'}
                    </CardDescription>
                </CardHeader>
            </Card>

            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Items to Process</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <div className="space-y-4">
                            {(items || []).map((item, index) => {
                                const detail = item as any;
                                const name = detail.fabricName || detail.furnitureName;
                                const qty = detail.quantity;
                                const po = detail.poNumber;
                                const qtyUnit = request.type === 'fabric' ? 'Mtr' : '';

                                return (
                                    <div key={index}>
                                        <Card className="overflow-hidden">
                                            <div className="bg-muted/50 p-4 flex justify-between items-center">
                                                <div>
                                                    <p className="font-semibold">{name}</p>
                                                    <p className="text-sm text-muted-foreground">Qty: {qty} {qtyUnit}</p>
                                                </div>
                                                <Badge variant="secondary">PO: {po || 'N/A'}</Badge>
                                            </div>
                                           <ItemProcessTimeline item={item} />
                                        </Card>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

