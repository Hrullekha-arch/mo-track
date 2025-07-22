
"use client";

import { useState, useEffect, use } from 'react';
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest, InboundMilestone, FabricDetail, FurnitureDetail } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Barcode, CheckCircle, Circle, Ruler, Truck, Warehouse, Weight, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';

const INBOUND_PROCESS_CONFIG = [
    { id: 1, name: 'QNQ as per PO', time: "30 min", icon: Ruler },
    { id: 2, name: 'Weight', time: "1hr", icon: Weight },
    { id: 3, name: 'Barcode', time: "1hr", icon: Barcode },
    { id: 4, name: 'Stock Update in Tally/CRM/Excel', time: "1hr", icon: CheckCircle },
    { id: 5, name: 'Assign Rack/Location', time: "Variable", icon: Warehouse },
];

function ItemProcessTimeline({ 
    item, 
    itemIndex,
    request,
    onUpdate
}: { 
    item: FabricDetail | FurnitureDetail,
    itemIndex: number,
    request: PurchaseRequest,
    onUpdate: (itemIndex: number, stepId: number) => void
}) {
    return (
        <div className="pl-4 py-2">
            <div className="grid grid-cols-5 gap-4 text-center text-xs text-muted-foreground">
                {INBOUND_PROCESS_CONFIG.map(step => {
                    const status = item.inboundMilestones?.find(m => m.stepId === step.id);
                    const isCompleted = status?.status === 'completed';
                    const Icon = step.icon;
                    return (
                        <button 
                            key={step.id} 
                            className="flex flex-col items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                            onClick={() => onUpdate(itemIndex, step.id)}
                            disabled={isCompleted}
                        >
                            <div className={cn(
                                "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
                                isCompleted ? "bg-green-100 border-green-500" : "bg-card border-border group-hover:bg-muted"
                            )}>
                                <Icon className={cn("h-5 w-5 transition-colors", isCompleted ? "text-green-600" : "text-muted-foreground")} />
                            </div>
                            <p className="font-medium">{step.name}</p>
                            {isCompleted && status?.completedAt ? (
                                <p className="text-green-600">{format(new Date(status.completedAt), 'dd/MM HH:mm')}</p>
                            ) : (
                                <p>{step.time}</p>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function InboundProcessPage({ params }: { params: Promise<{ dealId: string }> }) {
    const { dealId } = use(params);
    const [request, setRequest] = useState<PurchaseRequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const { user } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        const docRef = doc(db, "purchaseRequests", dealId);
        const unsubscribe = onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                const data = { id: doc.id, ...doc.data() } as PurchaseRequest;
                // Ensure inboundMilestones array exists for each item
                if (data.type === 'fabric' && data.fabricDetails) {
                    data.fabricDetails = data.fabricDetails.map(item => ({ ...item, inboundMilestones: item.inboundMilestones || [] }));
                } else if (data.type === 'furniture' && data.furnitureDetails) {
                    data.furnitureDetails = data.furnitureDetails.map(item => ({ ...item, inboundMilestones: item.inboundMilestones || [] }));
                }
                setRequest(data);
            } else {
                setRequest(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [dealId]);

     const handleStatusUpdate = async (itemIndex: number, stepId: number) => {
        if (!request || !user) return;
        const key = `${itemIndex}-${stepId}`;
        setUpdating(key);
        
        try {
            const requestRef = doc(db, "purchaseRequests", request.id);
            const items = request.type === 'fabric' ? [...(request.fabricDetails || [])] : [...(request.furnitureDetails || [])];
            const itemToUpdate = items[itemIndex];

            if (!itemToUpdate) throw new Error("Item not found");

            const existingMilestoneIndex = itemToUpdate.inboundMilestones?.findIndex(m => m.stepId === stepId) ?? -1;
            
            const newMilestone: InboundMilestone = {
                stepId,
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: user.name,
            };

            if (existingMilestoneIndex > -1) {
                 itemToUpdate.inboundMilestones![existingMilestoneIndex] = newMilestone;
            } else {
                itemToUpdate.inboundMilestones = [...(itemToUpdate.inboundMilestones || []), newMilestone];
            }
            
            items[itemIndex] = itemToUpdate;

            const payloadKey = request.type === 'fabric' ? 'fabricDetails' : 'furnitureDetails';
            await updateDoc(requestRef, { [payloadKey]: items });
            
            toast({ title: "Process Updated", description: `${INBOUND_PROCESS_CONFIG.find(s=>s.id===stepId)?.name} marked as complete.`});

        } catch (error) {
            console.error("Error updating inbound status:", error);
            toast({ variant: "destructive", title: "Update Failed", description: "Could not update the item process status." });
        } finally {
            setUpdating(null);
        }
    };


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
                <p className="text-muted-foreground">The request with ID {dealId} could not be found.</p>
                <Button asChild variant="link" className="mt-4">
                    <Link href="/dashboard/inbound">Go Back</Link>
                </Button>
            </div>
        )
    }

    const items = request.type === 'fabric' ? request.fabricDetails : request.furnitureDetails;

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
                                    <Collapsible key={index} asChild defaultOpen>
                                        <Card className="overflow-hidden">
                                            <div className="bg-muted/50 p-4 flex justify-between items-center">
                                                <div>
                                                    <p className="font-semibold">{name}</p>
                                                    <p className="text-sm text-muted-foreground">Qty: {qty} {qtyUnit}</p>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <Badge variant="secondary">PO: {po || 'N/A'}</Badge>
                                                    <CollapsibleTrigger asChild>
                                                        <Button variant="ghost" size="sm">
                                                            View Process
                                                            <ChevronDown className="h-4 w-4 ml-2" />
                                                        </Button>
                                                    </CollapsibleTrigger>
                                                </div>
                                            </div>
                                            <CollapsibleContent>
                                                <ItemProcessTimeline 
                                                    item={item} 
                                                    itemIndex={index}
                                                    request={request}
                                                    onUpdate={handleStatusUpdate}
                                                />
                                            </CollapsibleContent>
                                        </Card>
                                    </Collapsible>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
