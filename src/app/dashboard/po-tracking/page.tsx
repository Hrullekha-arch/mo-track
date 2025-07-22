
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PO_PROCESS_CONFIG } from '@/lib/constants';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm, useFieldArray, FormProvider } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";


const formatTimestamp = (date: Date) => {
    return format(date, 'dd/yyyy - HH:mm');
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
                                            {request.poDeliveryDate || [1,2].includes(stepConfig.id) ? (
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


const poConfirmationSchema = z.object({
    poDeliveryDate: z.date({ required_error: "A delivery date is required." }),
    fabricDetails: z.array(z.object({ poNumber: z.string().optional() })).optional(),
    furnitureDetails: z.array(z.object({ poNumber: z.string().optional() })).optional(),
});
type PoConfirmationFormValues = z.infer<typeof poConfirmationSchema>;

function PoConfirmationDialog({ 
    isOpen, 
    onClose, 
    onConfirm, 
    request 
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    onConfirm: (values: {
        date: Date,
        fabricDetails?: { poNumber?: string }[],
        furnitureDetails?: { poNumber?: string }[]
    }) => void; 
    request: PurchaseRequest | null 
}) {
    const form = useForm<PoConfirmationFormValues>({
        resolver: zodResolver(poConfirmationSchema),
        defaultValues: {
            poDeliveryDate: request?.poDeliveryDate ? new Date(request.poDeliveryDate) : new Date(),
            fabricDetails: request?.fabricDetails?.map(d => ({ poNumber: d.poNumber || '' })),
            furnitureDetails: request?.furnitureDetails?.map(d => ({ poNumber: d.poNumber || '' })),
        },
    });

    const fabricFields = useFieldArray({ control: form.control, name: "fabricDetails" });
    const furnitureFields = useFieldArray({ control: form.control, name: "furnitureDetails" });

    useEffect(() => {
        if (request) {
            form.reset({
                poDeliveryDate: request.poDeliveryDate ? new Date(request.poDeliveryDate) : new Date(),
                fabricDetails: request.fabricDetails?.map(d => ({ poNumber: d.poNumber || '' })),
                furnitureDetails: request.furnitureDetails?.map(d => ({ poNumber: d.poNumber || '' })),
            });
        }
    }, [request, form]);

    const handleSubmit = (data: PoConfirmationFormValues) => {
        onConfirm({ 
            date: data.poDeliveryDate, 
            fabricDetails: data.fabricDetails, 
            furnitureDetails: data.furnitureDetails 
        });
    };

    if (!request) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>PO Confirmation</DialogTitle>
                    <DialogDescription>
                        Set the vendor's promised delivery date and enter PO numbers for each item.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
                        <FormField
                            control={form.control}
                            name="poDeliveryDate"
                            render={({ field }) => (
                                <FormItem className="flex flex-col items-center">
                                    <FormLabel>Promised Delivery Date</FormLabel>
                                    <Calendar
                                        mode="single"
                                        selected={field.value}
                                        onSelect={field.onChange}
                                        disabled={(d) => d < new Date(new Date().setDate(new Date().getDate() - 1))}
                                        initialFocus
                                    />
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <h4 className="font-semibold pt-4 border-t">Item PO Numbers</h4>
                        
                        {request.type === 'fabric' && request.fabricDetails && (
                            <div className="space-y-2">
                                {fabricFields.fields.map((item, index) => (
                                    <FormField
                                        key={item.id}
                                        control={form.control}
                                        name={`fabricDetails.${index}.poNumber`}
                                        render={({ field }) => (
                                            <FormItem className="grid grid-cols-3 items-center gap-4">
                                                <FormLabel className="text-right">{request.fabricDetails?.[index]?.fabricName}</FormLabel>
                                                <FormControl className="col-span-2">
                                                    <Input placeholder="Enter PO Number" {...field} />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                ))}
                            </div>
                        )}

                        {request.type === 'furniture' && request.furnitureDetails && (
                            <div className="space-y-2">
                                {furnitureFields.fields.map((item, index) => (
                                    <FormField
                                        key={item.id}
                                        control={form.control}
                                        name={`furnitureDetails.${index}.poNumber`}
                                        render={({ field }) => (
                                            <FormItem className="grid grid-cols-3 items-center gap-4">
                                                <FormLabel className="text-right">{request.furnitureDetails?.[index]?.furnitureName}</FormLabel>
                                                <FormControl className="col-span-2">
                                                    <Input placeholder="Enter PO Number" {...field} />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                ))}
                            </div>
                        )}

                        <DialogFooter className="pt-4">
                            <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
                            <Button type="submit">Confirm</Button>
                        </DialogFooter>
                    </form>
                </Form>
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
    const [requestForConfirmation, setRequestForConfirmation] = useState<{request: PurchaseRequest, stepId: number} | null>(null);

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

        // For step 1 and 2, we must have a delivery date.
        if (stepId === 1 || stepId === 2) {
            setRequestForConfirmation({request, stepId});
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
    
    const handlePoConfirmation = async (values: {
        date: Date,
        fabricDetails?: { poNumber?: string }[],
        furnitureDetails?: { poNumber?: string }[]
    }) => {
        if (!requestForConfirmation || !user) return;
        const { request, stepId } = requestForConfirmation;
        
        try {
            const requestRef = doc(db, "purchaseRequests", request.id);
            const updatePayload: any = {
                poDeliveryDate: values.date.toISOString(),
            };

            if (request.type === 'fabric' && values.fabricDetails) {
                updatePayload.fabricDetails = request.fabricDetails?.map((item, index) => ({
                    ...item,
                    poNumber: values.fabricDetails?.[index]?.poNumber || ''
                }));
            } else if (request.type === 'furniture' && values.furnitureDetails) {
                updatePayload.furnitureDetails = request.furnitureDetails?.map((item, index) => ({
                    ...item,
                    poNumber: values.furnitureDetails?.[index]?.poNumber || ''
                }));
            }
            
            await updateDoc(requestRef, updatePayload);


            // Now, complete the step that triggered this
             const newStatus: PurchaseStatus = {
                stepId: stepId,
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: user.name,
            };
             await updateDoc(requestRef, {
                poMilestones: arrayUnion(newStatus)
            });

            toast({ title: `PO Confirmed & Step ${stepId} Completed` });
        } catch (error) {
            console.error("Error setting PO date:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        } finally {
            setRequestForConfirmation(null);
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

             <PoConfirmationDialog
                isOpen={!!requestForConfirmation}
                onClose={() => setRequestForConfirmation(null)}
                onConfirm={handlePoConfirmation}
                request={requestForConfirmation?.request || null}
            />

        </div>
    );
}
