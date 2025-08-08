

"use client";

import { useState, useEffect, use } from 'react';
import { doc, onSnapshot, updateDoc, arrayRemove, getDoc, arrayUnion, collection, query, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest, InboundMilestone, FabricDetail, Order, O2DStatus, StockTransaction } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Barcode, CheckCircle, Circle, Ruler, Truck, Warehouse, Weight, ChevronDown, Loader2, Undo2, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PO_PROCESS_CONFIG } from '@/lib/constants';
import { updateStockQuantityAction } from '@/app/dashboard/inventory/actions';


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
    onUpdate,
    onRevert,
    userRole
}: { 
    item: FabricDetail,
    itemIndex: number,
    request: PurchaseRequest,
    onUpdate: (itemIndex: number, stepId: number) => void,
    onRevert: (itemIndex: number, milestone: InboundMilestone) => void,
    userRole: string | null
}) {
    return (
        <div className="pl-4 py-2">
            <div className="grid grid-cols-5 gap-4 text-center text-xs text-muted-foreground">
                {INBOUND_PROCESS_CONFIG.map(step => {
                    const milestone = item.inboundMilestones?.find(m => m.stepId === step.id);
                    const isCompleted = milestone?.status === 'completed';
                    const Icon = step.icon;
                    return (
                        <div key={step.id} className="flex flex-col items-center gap-1">
                            <div className="relative">
                                <button 
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
                                </button>
                                {isCompleted && userRole === 'admin' && milestone && (
                                     <AlertDialogTrigger asChild>
                                        <Button 
                                            size="icon" 
                                            variant="ghost" 
                                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20"
                                            onClick={() => onRevert(itemIndex, milestone)}
                                        >
                                            <Undo2 className="h-3 w-3" />
                                        </Button>
                                    </AlertDialogTrigger>
                                )}
                            </div>
                            <p className="font-medium mt-1">{step.name}</p>
                            {isCompleted && milestone?.completedAt ? (
                                <p className="text-green-600">{format(new Date(milestone.completedAt), 'dd/MM HH:mm')}</p>
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

export default function InboundProcessPage({ params }: { params: Promise<{ dealId: string }> }) {
    const { dealId } = use(params);
    const [request, setRequest] = useState<PurchaseRequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [revertingMilestone, setRevertingMilestone] = useState<{itemIndex: number, milestone: InboundMilestone} | null>(null);
    const { user, role } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        const docRef = doc(db, "purchaseRequests", dealId);
        const unsubscribe = onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                const data = { id: doc.id, ...doc.data() } as PurchaseRequest;
                if (data.fabricDetails) {
                    data.fabricDetails = data.fabricDetails.map(item => ({ ...item, inboundMilestones: item.inboundMilestones || [] }));
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
            const batch = writeBatch(db);
            const requestRef = doc(db, "purchaseRequests", request.id);
            const items = [...(request.fabricDetails || [])];
            const itemToUpdate = items[itemIndex];

            if (!itemToUpdate) throw new Error("Item not found");

            const newMilestone: InboundMilestone = {
                stepId,
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: user.name,
            };

            const newMilestones = [...(itemToUpdate.inboundMilestones || []), newMilestone];
            items[itemIndex] = {...itemToUpdate, inboundMilestones: newMilestones};
            batch.update(requestRef, { fabricDetails: items });

            const itemIsNowComplete = newMilestones.length === INBOUND_PROCESS_CONFIG.length;

            if (itemIsNowComplete) {
                const stockId = itemToUpdate.fabricName.replace(/\//g, '-');
                const stockRef = doc(db, "stocks", stockId);

                const transaction: Omit<StockTransaction, 'id'> = {
                    stockId: stockId,
                    bcn: itemToUpdate.fabricName,
                    type: 'addition',
                    quantityChange: parseFloat(itemToUpdate.quantity),
                    poNumber: itemToUpdate.poNumber,
                    createdAt: new Date().toISOString(),
                    createdBy: user.name,
                };
                
                const transactionRef = doc(collection(stockRef, 'stockAdded'));
                batch.set(transactionRef, transaction);
            }
            
            await batch.commit();

            toast({ title: "Process Updated", description: `${INBOUND_PROCESS_CONFIG.find(s=>s.id===stepId)?.name} marked as complete.`});
            
            if (itemIsNowComplete) {
                toast({ title: "Stock Updated!", description: `${itemToUpdate.quantity} units of ${itemToUpdate.fabricName} added to inventory.`});
                // Recalculate stock after successful commit
                await updateStockQuantityAction(itemToUpdate.fabricName.replace(/\//g, '-'), { type: 'addition', quantityChange: 0, stockId: '', bcn: '', createdAt: '', createdBy: ''}); // Passing dummy for recalculation
            }

            // Check if all items are fully received
            const allItemsCompleted = items.every(item => (item.inboundMilestones?.length || 0) === INBOUND_PROCESS_CONFIG.length);

            if (allItemsCompleted) {
                const ordersRef = collection(db, "orders");
                const q = query(ordersRef, where("crmOrderNo", "==", request.dealId));
                const orderSnapshot = await getDocs(q);
                
                if (!orderSnapshot.empty) {
                    const orderDoc = orderSnapshot.docs[0];
                    const orderData = orderDoc.data() as Order;
                    const o2dStep9 = orderData.o2dMilestones?.find(m => m.stepId === 9);

                    if (!o2dStep9 || o2dStep9.status !== 'completed') {
                        const o2dMilestoneStep9: O2DStatus = {
                            stepId: 9,
                            status: 'completed',
                            completedAt: new Date().toISOString(),
                            completedBy: "System (Inbound Complete)",
                            remarks: "Automatically completed after all items were received in Inbound.",
                            selection: 'Done'
                        };
                        
                        const existingO2dStep9Index = (orderData.o2dMilestones || []).findIndex(m => m.stepId === 9);
                        if (existingO2dStep9Index > -1) {
                            const newO2dMilestones = [...(orderData.o2dMilestones || [])];
                            newO2dMilestones[existingO2dStep9Index] = o2dMilestoneStep9;
                            await updateDoc(orderDoc.ref, { o2dMilestones: newO2dMilestones });
                        } else {
                            await updateDoc(orderDoc.ref, { o2dMilestones: arrayUnion(o2dMilestoneStep9) });
                        }
                        
                        toast({
                            title: "O2D Process Updated!",
                            description: `Step "Purchase Material Receiving" was automatically marked as done for order ${orderData.id}.`,
                            duration: 5000,
                        });
                    }
                }
            }
        } catch (error) {
            console.error("Error updating inbound status:", error);
            toast({ variant: "destructive", title: "Update Failed", description: "Could not update the item process status." });
        } finally {
            setUpdating(null);
        }
    };
    
    const handleRevertUpdate = async () => {
        if (!request || !revertingMilestone) return;

        const { itemIndex, milestone } = revertingMilestone;
        const key = `${itemIndex}-${milestone.stepId}`;
        setUpdating(key);

        try {
            const requestRef = doc(db, "purchaseRequests", request.id);
            const items = [...(request.fabricDetails || [])];
            const itemToUpdate = items[itemIndex];
            if (!itemToUpdate) throw new Error("Item not found");

            itemToUpdate.inboundMilestones = itemToUpdate.inboundMilestones?.filter(m => m.stepId !== milestone.stepId);
            items[itemIndex] = itemToUpdate;
            
            await updateDoc(requestRef, { fabricDetails: items });
            
            toast({ title: "Step Reverted", description: "The process step has been successfully reverted." });
        } catch (error) {
            console.error("Error reverting inbound status:", error);
            toast({ variant: "destructive", title: "Revert Failed", description: "Could not revert the item process status." });
        } finally {
            setUpdating(null);
            setRevertingMilestone(null);
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

    const items = request.fabricDetails;
    const revertingStepConfig = revertingMilestone ? INBOUND_PROCESS_CONFIG.find(c => c.id === revertingMilestone.milestone.stepId) : null;

    return (
        <AlertDialog>
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                    <Button asChild variant="outline" size="icon">
                        <Link href="/dashboard/inbound"><ArrowLeft /></Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Inbound Process</h1>
                        <p className="text-muted-foreground">Track the receiving process for each item in Deal ID: {request.dealId}</p>
                    </div>
                </div>
                <Button asChild>
                    <Link href={`/dashboard/inbound/scan?dealId=${dealId}`}>
                        <ScanLine className="mr-2 h-4 w-4" />
                        Scan Items
                    </Link>
                </Button>
            </div>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>{request.customerName}</CardTitle>
                    <CardDescription>
                        Fabric request from salesman {request.salesman}.
                        <br />
                        Vendor: {request.vendor || 'Not set'}
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
                                const name = detail.fabricName;
                                const qty = detail.quantity;
                                const po = detail.poNumber;
                                const qtyUnit = 'Mtr';

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
                                                    onRevert={(itemIndex, milestone) => setRevertingMilestone({itemIndex, milestone})}
                                                    userRole={role}
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
         {revertingMilestone && (
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will revert the step: <strong>{revertingStepConfig?.name}</strong>. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setRevertingMilestone(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRevertUpdate}>Continue</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        )}
        </AlertDialog>
    );
}
