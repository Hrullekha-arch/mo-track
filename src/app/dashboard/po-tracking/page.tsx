
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Clock, FileCheck, Loader2, Send, ThumbsUp, Truck } from 'lucide-react';
import { collection, onSnapshot, query, doc, updateDoc, arrayUnion, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest, PurchaseStep, PurchaseStatus } from "@/lib/types"; // Re-using some types
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { addDays, addHours, addMinutes, isPast, format, formatDistanceToNow, subDays } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

// Define the new PO tracking process steps
const PO_PROCESS_CONFIG: PurchaseStep[] = [
    { id: 1, step: "PO Confirmation", details: "Confirm the Purchase Order with the vendor", time: "30 min", role: "PC", icon: ThumbsUp, expectedDuration: { minutes: 30 } },
    { id: 2, step: "Material Delivery Follow up", details: "Follow up on the delivery status", time: "T-2 Days", role: "PC", icon: Truck, expectedDuration: { days: -2 } }, // Special handling
    { id: 3, step: "Receiving and Handover", details: "Receive materials and hand over to Accounts", time: "Delivery Time", role: "PC/Accounts", icon: FileCheck, expectedDuration: {} }, // Special handling
    { id: 4, step: "Data Entry", details: "Enter received materials into the system", time: "1 hr", role: "Accounts", icon: FileCheck, expectedDuration: { hours: 1 } },
    { id: 5, step: "Sent to Location", details: "Dispatch materials to the required location", time: "Milestone based", role: "PC", icon: Send, expectedDuration: { hours: 2 } }, // Assuming 2 hours
];

const formatTimestamp = (date: Date) => {
    return format(date, 'dd/MM/yyyy - HH:mm');
};

const calculateExpectedDatesForPO = (request: PurchaseRequest) => {
    return PO_PROCESS_CONFIG.reduce((acc, currentStep) => {
        let startDate: Date;
        if (currentStep.id === 1) {
             // PO process starts when the 'Place Order' step in the previous phase is completed.
            const placeOrderStep = request.milestones.find(m => m.stepId === 6 || m.stepId === 11);
            startDate = placeOrderStep ? new Date(placeOrderStep.completedAt) : new Date();
        } else {
            const previousStepConfig = PO_PROCESS_CONFIG.find(s => s.id === currentStep.id - 1)!;
            const previousStepStatus = (request.poMilestones || []).find(m => m.stepId === previousStepConfig.id);
            if (previousStepStatus?.status === 'completed' || previousStepStatus?.status === 'skipped') {
                startDate = new Date(previousStepStatus.completedAt);
            } else {
                startDate = acc[previousStepConfig.id];
            }
        }

        if (currentStep.id === 2 && request.poDeliveryDate) { // Material Delivery Follow up
             acc[currentStep.id] = subDays(new Date(request.poDeliveryDate), 2);
        } else if (currentStep.id === 3 && request.poDeliveryDate) { // Receiving and Handover
            acc[currentStep.id] = new Date(request.poDeliveryDate);
        } else {
            const { days = 0, hours = 0, minutes = 0 } = currentStep.expectedDuration;
            let completionDate = addDays(startDate, days);
            completionDate = addHours(completionDate, hours);
            completionDate = addMinutes(completionDate, minutes);
            acc[currentStep.id] = completionDate;
        }

        return acc;
    }, {} as Record<number, Date>);
}

function PoTrackingTimeline({ request, onStepUpdate }: { request: PurchaseRequest, onStepUpdate: (requestId: string, stepId: number) => void; }) {
    const expectedDates = calculateExpectedDatesForPO(request);
    
    return (
        <div className="relative pl-6 pr-4 py-4">
            <div className="absolute left-9 top-0 h-full w-0.5 bg-border -translate-x-1/2" aria-hidden="true"></div>
            <div className="space-y-4">
                {PO_PROCESS_CONFIG.map((stepConfig) => {
                    const stepStatus = request.poMilestones?.find(s => s.stepId === stepConfig.id);
                    const prevStepStatus = stepConfig.id === 1 ? { status: 'completed' } : request.poMilestones?.find(s => s.stepId === stepConfig.id - 1);
                    
                    const isPending = !stepStatus;
                    const expectedDate = expectedDates[stepConfig.id];
                    const isOverdue = isPast(expectedDate) && isPending;

                    const Icon = stepConfig.icon;
                    return (
                        <div key={stepConfig.id} className="relative flex items-start gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-border shadow-sm shrink-0 bg-card">
                                <Icon className={cn("h-6 w-6", 
                                   stepStatus?.status === 'completed' ? "text-green-500" : isOverdue ? "text-red-500" : "text-muted-foreground"
                                )} />
                            </div>
                            <Card className={cn("w-full group hover:shadow-md", isPending && isOverdue ? "border-red-500 bg-red-50" : "")}>
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-base">{stepConfig.step}</CardTitle>
                                            <CardDescription>{stepConfig.details}</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex justify-between items-center flex-wrap gap-4">
                                        <div className="text-xs text-muted-foreground space-y-2 flex-grow">
                                            {request.poDeliveryDate ? (
                                                <p>Expected by: {formatTimestamp(expectedDate)}</p>
                                            ) : (
                                                <p>Set PO Confirmation to see dates.</p>
                                            )}
                                            
                                            {stepStatus?.status === 'completed' && (
                                                <div className="flex items-center gap-2 text-green-600 font-medium">
                                                    <Check className="h-4 w-4" />
                                                    <span>Completed at {formatTimestamp(new Date(stepStatus.completedAt))}</span>
                                                </div>
                                            )}

                                             {isPending && isOverdue && (
                                                <div className="flex items-center gap-2 text-red-600 font-medium">
                                                    <Clock className="h-4 w-4" />
                                                    <span>Delayed by: {formatDistanceToNow(expectedDate, { addSuffix: false })}</span>
                                                </div>
                                            )}
                                        </div>
                                        {!stepStatus && prevStepStatus?.status === 'completed' && (
                                             <AlertDialogTrigger asChild>
                                                <Button size="sm" onClick={() => onStepUpdate(request.id, stepConfig.id)}>Mark as Done</Button>
                                             </AlertDialogTrigger>
                                        )}
                                        {stepStatus && <Badge variant="default">Done</Badge>}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function SetPoDateDialog({ isOpen, onClose, onConfirm }: { isOpen: boolean, onClose: () => void, onConfirm: (date: Date) => void }) {
    const [date, setDate] = useState<Date | undefined>(new Date());

    const handleConfirm = () => {
        if(date) {
            onConfirm(date);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Set Promised Delivery Date</DialogTitle>
                    <DialogDescription>
                        Please select the delivery date promised by the vendor for this Purchase Order.
                    </DialogDescription>
                </DialogHeader>
                 <div className="py-4 flex justify-center">
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        disabled={(d) => d < new Date(new Date().setDate(new Date().getDate() - 1))}
                        initialFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleConfirm} disabled={!date}>Confirm Date</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


export default function PoTrackingPage() {
    const [requests, setRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const { toast } = useToast();
    const [updatingRequest, setUpdatingRequest] = useState<{requestId: string, stepId: number} | null>(null);
    const [requestForDate, setRequestForDate] = useState<PurchaseRequest | null>(null);

    useEffect(() => {
        // We only want to track POs for which an order has been placed.
        const q = query(
            collection(db, "purchaseRequests"),
            where("milestones", "array-contains-any", [
                { stepId: 6, status: 'completed', completedAt: '', completedBy: '', remarks: ''}, // This structure won't work directly, need to filter client side
                { stepId: 11, status: 'completed', completedAt: '', completedBy: '', remarks: ''}
            ])
        );

        const unsubscribe = onSnapshot(query(collection(db, "purchaseRequests")), (snapshot) => {
            const allRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));
            
            // Filter client-side to find requests where an order has been placed.
            const poReadyRequests = allRequests.filter(req => {
                const isOrderPlaced = req.milestones.some(m => (m.stepId === 6 || m.stepId === 11) && m.status === 'completed');
                const isCompleted = req.poMilestones?.some(m => m.stepId === 5 && m.status === 'completed');
                return isOrderPlaced && !isCompleted;
            });

            setRequests(poReadyRequests.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleStepUpdate = async (requestId: string, stepId: number) => {
        const request = requests.find(r => r.id === requestId);
        if (!request) return;

        // For step 1, we must have a delivery date.
        if (stepId === 1 && !request.poDeliveryDate) {
            setRequestForDate(request);
            return;
        }

        setUpdatingRequest({requestId, stepId});
    };

    const confirmStepUpdate = async () => {
        if (!updatingRequest || !user) return;
        const { requestId, stepId } = updatingRequest;
        
        const newStatus: PurchaseStatus = {
            stepId: stepId,
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: user.name,
        };

        try {
            const requestRef = doc(db, "purchaseRequests", requestId);
            await updateDoc(requestRef, {
                poMilestones: arrayUnion(newStatus)
            });
            toast({ title: "PO Step Updated!" });
        } catch (error) {
            console.error("Error updating PO step:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        } finally {
            setUpdatingRequest(null);
        }
    }
    
    const handleSetPoDate = async (date: Date) => {
        if (!requestForDate || !user) return;
        
        try {
            const requestRef = doc(db, "purchaseRequests", requestForDate.id);
            await updateDoc(requestRef, {
                poDeliveryDate: date.toISOString(),
            });

            // Now, complete step 1
             const newStatus: PurchaseStatus = {
                stepId: 1,
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: user.name,
            };
             await updateDoc(requestRef, {
                poMilestones: arrayUnion(newStatus)
            });

            toast({ title: "Delivery Date Set & Step 1 Completed" });
        } catch (error) {
            console.error("Error setting PO date:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        } finally {
            setRequestForDate(null);
        }
    };


    if (loading) {
        return (
            <div className="container mx-auto p-4 md:p-6 lg:p-8">
                 <header className="mb-8">
                    <Skeleton className="h-9 w-1/2 mb-2" />
                    <Skeleton className="h-5 w-3/4" />
                </header>
                 <div className="space-y-4">
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">PO to Order Receive</h1>
                <p className="text-muted-foreground">Track items from Purchase Order generation to receipt.</p>
            </header>

            <div className="space-y-4">
            {requests.length > 0 ? (
                requests.map(request => (
                    <Card key={request.id}>
                        <CardHeader>
                            <CardTitle>Request for: {request.customerName}</CardTitle>
                            <CardDescription>Deal ID: {request.dealId}</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <AlertDialog>
                                <PoTrackingTimeline request={request} onStepUpdate={handleStepUpdate} />
                                 {updatingRequest?.requestId === request.id && (
                                     <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Are you sure you want to mark step "{PO_PROCESS_CONFIG.find(s => s.id === updatingRequest.stepId)?.step}" as complete?
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel onClick={() => setUpdatingRequest(null)}>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={confirmStepUpdate}>Confirm</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                 )}
                             </AlertDialog>
                        </CardContent>
                    </Card>
                ))
            ) : (
                 <Card className="text-center p-12">
                    <div className="mx-auto bg-primary text-primary-foreground rounded-full p-3 w-fit mb-4">
                        <FileCheck className="h-8 w-8" />
                    </div>
                    <CardTitle>No Active POs</CardTitle>
                    <CardDescription>
                        There are no purchase requests awaiting tracking.
                    </CardDescription>
                </Card>
            )}
            </div>

             <SetPoDateDialog
                isOpen={!!requestForDate}
                onClose={() => setRequestForDate(null)}
                onConfirm={handleSetPoDate}
            />

        </div>
    );
}
