

"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Clock, FileCheck, Loader2, Send, ThumbsUp, Truck, Undo2 } from 'lucide-react';
import { collection, onSnapshot, query, doc, updateDoc, arrayUnion, where, arrayRemove, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest, PurchaseStep, PurchaseStatus, FabricDetail, FurnitureDetail } from "@/lib/types"; // Re-using some types
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
            
            // Check for actual completed milestones to base the next step on
            const allPreviousMilestones = (request.poMilestones || []).filter(m => m.stepId < currentStep.id);
            const latestPreviousMilestone = allPreviousMilestones.sort((a,b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0];

            if (latestPreviousMilestone) {
                startDate = new Date(latestPreviousMilestone.completedAt);
            } else if (previousStepStatus?.status === 'completed' || previousStepStatus?.status === 'skipped') {
                startDate = new Date(previousStepStatus.completedAt);
            } else {
                startDate = acc[previousStepConfig.id];
            }
        }
        
        // Dynamic date calculation based on vendor's promised date
        if (request.poDeliveryDate) {
            if (currentStep.id === 2) { // Material Delivery Follow up is 2 days before promised date
                acc[currentStep.id] = subDays(new Date(request.poDeliveryDate), 2);
                return acc;
            } else if (currentStep.id === 3) { // Receiving and Handover is on the promised date
                acc[currentStep.id] = new Date(request.poDeliveryDate);
                return acc;
            }
        }
        
        // Fallback to standard duration calculation
        const { days = 0, hours = 0, minutes = 0 } = currentStep.expectedDuration;
        let completionDate = addDays(startDate, days);
        completionDate = addHours(completionDate, hours);
        completionDate = addMinutes(completionDate, minutes);
        acc[currentStep.id] = completionDate;

        return acc;
    }, {} as Record<number, Date>);
}

function PoTrackingTimeline({ 
    request, 
    onStepUpdate, 
    onRevertStep, 
    userRole 
}: { 
    request: PurchaseRequest, 
    onStepUpdate: (requestId: string, stepId: number) => void; 
    onRevertStep: (requestId: string, milestone: PurchaseStatus) => void; 
    userRole: string | null; 
}) {
    const expectedDates = calculateExpectedDatesForPO(request);
    
    return (
        <div className="relative pl-6 pr-4 py-4">
            <div className="absolute left-9 top-0 h-full w-0.5 bg-border -translate-x-1/2" aria-hidden="true"></div>
            <div className="space-y-4">
                {PO_PROCESS_CONFIG.map((stepConfig) => {
                    const stepStatus = request.poMilestones?.find(s => s.stepId === stepConfig.id);
                    const prevStepConfig = PO_PROCESS_CONFIG.find(s => s.id === stepConfig.id - 1);
                    const prevStepStatus = prevStepConfig ? request.poMilestones?.find(s => s.stepId === prevStepConfig.id) : {status: 'completed'};

                    const isPending = !stepStatus;
                    const expectedDate = expectedDates[stepConfig.id];
                    const isOverdue = expectedDate ? isPast(expectedDate) && isPending : false;
                    const Icon = stepConfig.icon;

                    const isActionable = isPending && (
                        stepConfig.id === 1 || 
                        (prevStepStatus && prevStepStatus.status === 'completed')
                    );
                    
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
                                            {expectedDate && <p>Expected by: {formatTimestamp(expectedDate)}</p>}
                                            
                                            {stepStatus?.status === 'completed' && (
                                                <div className="flex items-center gap-2 text-green-600 font-medium">
                                                    <Check className="h-4 w-4" />
                                                    <span>Completed at {formatTimestamp(new Date(stepStatus.completedAt))} by {stepStatus.completedBy}</span>
                                                </div>
                                            )}

                                             {isPending && isOverdue && (
                                                <div className="flex items-center gap-2 text-red-600 font-medium">
                                                    <Clock className="h-4 w-4" />
                                                    <span>Delayed by: {formatDistanceToNow(expectedDate, { addSuffix: false })}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {stepStatus && userRole === 'admin' && (
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onRevertStep(request.id, stepStatus)}>
                                                        <Undo2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                            )}
                                            {isActionable && (
                                                 <AlertDialogTrigger asChild>
                                                    <Button size="sm" onClick={() => onStepUpdate(request.id, stepConfig.id)}>Mark as Done</Button>
                                                 </AlertDialogTrigger>
                                            )}
                                            {stepStatus && !isActionable && <Badge variant="default">Done</Badge>}
                                        </div>
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
    fabricDetails: z.array(z.object({ 
        poNumber: z.string().optional(),
        vendorName: z.string().optional(),
        expectedDeliveryDate: z.date({ required_error: "A delivery date is required for each item." }),
    })).optional(),
    furnitureDetails: z.array(z.object({ 
        poNumber: z.string().optional(),
        vendorName: z.string().optional(),
        expectedDeliveryDate: z.date({ required_error: "A delivery date is required for each item." }),
    })).optional(),
});
type PoConfirmationFormValues = z.infer<typeof poConfirmationSchema>;

function PoConfirmationDialog({ 
    isOpen, 
    onClose, 
    onConfirm, 
    request,
    mode = 'confirmation'
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    onConfirm: (values: PoConfirmationFormValues) => void; 
    request: PurchaseRequest | null;
    mode?: 'confirmation' | 'follow-up';
}) {
    const form = useForm<PoConfirmationFormValues>({
        resolver: zodResolver(poConfirmationSchema),
        defaultValues: {
            fabricDetails: request?.fabricDetails?.map(d => ({ 
                poNumber: d.poNumber || '',
                vendorName: d.vendorName || '',
                expectedDeliveryDate: d.expectedDeliveryDate ? new Date(d.expectedDeliveryDate) : new Date()
            })),
            furnitureDetails: request?.furnitureDetails?.map(d => ({ 
                poNumber: d.poNumber || '',
                vendorName: d.vendorName || '',
                expectedDeliveryDate: d.expectedDeliveryDate ? new Date(d.expectedDeliveryDate) : new Date()
            })),
        },
    });

    const fabricFields = useFieldArray({ control: form.control, name: "fabricDetails" });
    const furnitureFields = useFieldArray({ control: form.control, name: "furnitureDetails" });

    useEffect(() => {
        if (request) {
            form.reset({
                fabricDetails: request.fabricDetails?.map(d => ({ 
                    poNumber: d.poNumber || '',
                    vendorName: d.vendorName || '',
                    expectedDeliveryDate: d.expectedDeliveryDate ? new Date(d.expectedDeliveryDate) : new Date()
                })),
                furnitureDetails: request.furnitureDetails?.map(d => ({ 
                    poNumber: d.poNumber || '',
                    vendorName: d.vendorName || '',
                    expectedDeliveryDate: d.expectedDeliveryDate ? new Date(d.expectedDeliveryDate) : new Date()
                })),
            });
        }
    }, [request, form]);

    const handleSubmit = (data: PoConfirmationFormValues) => {
        onConfirm(data);
    };

    if (!request) return null;

    const isFollowUpMode = mode === 'follow-up';
    const dialogTitle = isFollowUpMode ? 'Material Delivery Follow Up' : 'PO Confirmation';
    const dialogDescription = isFollowUpMode 
        ? "View PO and vendor details, and update the expected delivery date if necessary."
        : "Set the vendor's promised delivery date and enter PO numbers for each item.";

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription>{dialogDescription}</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
                        <h4 className="font-semibold pt-4 border-t">Item Details</h4>
                        
                        {request.type === 'fabric' && request.fabricDetails && (
                            <div className="space-y-4">
                                {fabricFields.fields.map((item, index) => (
                                    <Card key={item.id} className="p-4 space-y-4">
                                        <div>
                                            <Label>{request.fabricDetails?.[index]?.fabricName}</Label>
                                            <p className="text-sm text-muted-foreground">Qty: {request.fabricDetails?.[index]?.quantity} Mtr</p>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                                            <FormField
                                                control={form.control}
                                                name={`fabricDetails.${index}.poNumber`}
                                                render={({ field }) => (
                                                    <FormItem className="md:col-span-1">
                                                        <FormLabel>PO Number</FormLabel>
                                                        <FormControl><Input placeholder="PO..." {...field} readOnly={isFollowUpMode} /></FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`fabricDetails.${index}.vendorName`}
                                                render={({ field }) => (
                                                    <FormItem className="md:col-span-3">
                                                        <FormLabel>Vendor Name</FormLabel>
                                                        <FormControl><Input placeholder="Enter Vendor Name" {...field} readOnly={isFollowUpMode} /></FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`fabricDetails.${index}.expectedDeliveryDate`}
                                                render={({ field }) => (
                                                    <FormItem className="flex flex-col md:col-span-2">
                                                        <FormLabel>Expected Date</FormLabel>
                                                        <Popover>
                                                            <PopoverTrigger asChild>
                                                                <FormControl>
                                                                    <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                                                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                                    </Button>
                                                                </FormControl>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-auto p-0" align="start">
                                                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                                            </PopoverContent>
                                                        </Popover>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}

                         {request.type === 'furniture' && request.furnitureDetails && (
                            <div className="space-y-4">
                                {furnitureFields.fields.map((item, index) => (
                                     <Card key={item.id} className="p-4 space-y-4">
                                         <div>
                                            <Label>{request.furnitureDetails?.[index]?.furnitureName}</Label>
                                            <p className="text-sm text-muted-foreground">Qty: {request.furnitureDetails?.[index]?.quantity}</p>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                                            <FormField
                                                control={form.control}
                                                name={`furnitureDetails.${index}.poNumber`}
                                                render={({ field }) => (
                                                    <FormItem className="md:col-span-1">
                                                        <FormLabel>PO Number</FormLabel>
                                                        <FormControl><Input placeholder="PO..." {...field} readOnly={isFollowUpMode} /></FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`furnitureDetails.${index}.vendorName`}
                                                render={({ field }) => (
                                                    <FormItem className="md:col-span-3">
                                                        <FormLabel>Vendor Name</FormLabel>
                                                        <FormControl><Input placeholder="Enter Vendor Name" {...field} readOnly={isFollowUpMode} /></FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`furnitureDetails.${index}.expectedDeliveryDate`}
                                                render={({ field }) => (
                                                    <FormItem className="flex flex-col md:col-span-2">
                                                        <FormLabel>Expected Date</FormLabel>
                                                        <Popover>
                                                            <PopoverTrigger asChild>
                                                                <FormControl>
                                                                    <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                                                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                                    </Button>
                                                                </FormControl>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-auto p-0" align="start">
                                                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                                            </PopoverContent>
                                                        </Popover>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    </Card>
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
    const { user, role } = useAuth();
    const { toast } = useToast();
    const [updatingRequest, setUpdatingRequest] = useState<{request: PurchaseRequest, stepId: number} | null>(null);
    const [requestForConfirmation, setRequestForConfirmation] = useState<{request: PurchaseRequest, stepId: number} | null>(null);
    const [requestForFollowUp, setRequestForFollowUp] = useState<{request: PurchaseRequest, stepId: number} | null>(null);
    const [revertingStep, setRevertingStep] = useState<{requestId: string, milestone: PurchaseStatus} | null>(null);


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

        const previousStep = PO_PROCESS_CONFIG.find(s => s.id === stepId - 1);
        const isPreviousDone = request.poMilestones?.some(m => m.stepId === previousStep?.id && m.status === 'completed');
        if (stepId !== 1 && !isPreviousDone) {
            toast({ variant: "destructive", title: "Previous step not completed yet!" });
            return;
        }

        if (stepId === 1) {
            setRequestForConfirmation({request, stepId});
        } else if (stepId === 2) {
            setRequestForFollowUp({request, stepId});
        } else {
            setUpdatingRequest({request, stepId});
        }
    };
    
    const handleRevertStep = async () => {
        if (!revertingStep || !user) return;
        const { requestId, milestone } = revertingStep;
    
        try {
            const requestRef = doc(db, "purchaseRequests", requestId);
            const requestDoc = await getDoc(requestRef);
            if (!requestDoc.exists()) throw new Error("Request not found");
    
            const currentRequest = requestDoc.data() as PurchaseRequest;
            const stepIdToRevert = milestone.stepId;
    
            // Remove all milestones with the stepId to revert, as there can be multiple per item
            const milestonesToRevert = (currentRequest.poMilestones || []).filter(m => m.stepId === stepIdToRevert);
            if (milestonesToRevert.length === 0) {
                 setRevertingStep(null);
                 toast({ variant: "destructive", title: "Revert Failed", description: "Milestone to revert not found."});
                 return;
            }

            const updatePayload: any = {
                poMilestones: arrayRemove(...milestonesToRevert)
            };
    
            if (stepIdToRevert === 1) {
                if (currentRequest.type === 'fabric' && currentRequest.fabricDetails) {
                    updatePayload.fabricDetails = currentRequest.fabricDetails.map(d => ({ ...d, poNumber: '', vendorName: '', expectedDeliveryDate: null }));
                }
                if (currentRequest.type === 'furniture' && currentRequest.furnitureDetails) {
                    updatePayload.furnitureDetails = currentRequest.furnitureDetails.map(d => ({ ...d, poNumber: '', vendorName: '', expectedDeliveryDate: null }));
                }
                 updatePayload.poDeliveryDate = null;
            }
    
            await updateDoc(requestRef, updatePayload);
            toast({ title: "PO Step Reverted!" });
        } catch (error) {
            console.error("Error reverting PO step:", error);
            toast({ variant: "destructive", title: "Revert Failed" });
        } finally {
            setRevertingStep(null);
        }
    };


    const confirmStepUpdate = async () => {
        if (!updatingRequest || !user) return;
        const { request, stepId } = updatingRequest;

        const allNewMilestones: PurchaseStatus[] = [];
        const items = request.type === 'fabric' ? request.fabricDetails : request.furnitureDetails;
        const completedAt = new Date().toISOString();

        (items || []).forEach(item => {
            allNewMilestones.push({
                stepId: stepId,
                status: 'completed',
                completedAt: completedAt,
                completedBy: user.name,
                itemName: (item as any).fabricName || (item as any).furnitureName,
                poNumber: item.poNumber,
                vendorName: item.vendorName,
                quantity: item.quantity,
            });

            // If step 3 is being completed, also complete step 4
            if (stepId === 3) {
                allNewMilestones.push({
                    stepId: 4, // Data Entry step
                    status: 'completed',
                    completedAt: completedAt,
                    completedBy: 'System (Auto)',
                    itemName: (item as any).fabricName || (item as any).furnitureName,
                    poNumber: item.poNumber,
                    vendorName: item.vendorName,
                    quantity: item.quantity,
                    remarks: 'Automatically completed with Receiving and Handover.',
                });
            }
        });

        if (allNewMilestones.length === 0) {
            toast({ variant: "destructive", title: "No items found in request." });
            setUpdatingRequest(null);
            return;
        }

        try {
            const requestRef = doc(db, "purchaseRequests", request.id);
            await updateDoc(requestRef, {
                poMilestones: arrayUnion(...allNewMilestones)
            });
            toast({ title: `PO Step${stepId === 3 ? 's' : ''} Updated!` });
        } catch (error) {
            console.error("Error updating PO step:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        } finally {
            setUpdatingRequest(null);
        }
    }
    
    const handlePoConfirmation = async (values: PoConfirmationFormValues) => {
        if (!requestForConfirmation || !user) return;
        const { request, stepId } = requestForConfirmation;
        
        try {
            const requestRef = doc(db, "purchaseRequests", request.id);
            const updatePayload: any = {};

            const newMilestones: PurchaseStatus[] = [];
            const allDeliveryDates: Date[] = [];

            if (request.type === 'fabric' && values.fabricDetails) {
                updatePayload.fabricDetails = request.fabricDetails?.map((item, index) => {
                    const formDetails = values.fabricDetails?.[index];
                    const expectedDate = formDetails?.expectedDeliveryDate;
                    if(expectedDate) allDeliveryDates.push(expectedDate);
                    
                    newMilestones.push({
                        stepId, status: 'completed', completedAt: new Date().toISOString(), completedBy: user.name || 'System',
                        itemName: item.fabricName,
                        poNumber: formDetails?.poNumber, vendorName: formDetails?.vendorName, quantity: item.quantity,
                    });

                    return { ...item, poNumber: formDetails?.poNumber || '', vendorName: formDetails?.vendorName || '', ...(expectedDate && { expectedDeliveryDate: expectedDate.toISOString() }) };
                });
            } else if (request.type === 'furniture' && values.furnitureDetails) {
                updatePayload.furnitureDetails = request.furnitureDetails?.map((item, index) => {
                    const formDetails = values.furnitureDetails?.[index];
                    const expectedDate = formDetails?.expectedDeliveryDate;
                    if(expectedDate) allDeliveryDates.push(expectedDate);

                     newMilestones.push({
                        stepId, status: 'completed', completedAt: new Date().toISOString(), completedBy: user.name || 'System',
                        itemName: item.furnitureName,
                        poNumber: formDetails?.poNumber, vendorName: formDetails?.vendorName, quantity: item.quantity,
                    });

                    return { ...item, poNumber: formDetails?.poNumber || '', vendorName: formDetails?.vendorName || '', ...(expectedDate && { expectedDeliveryDate: expectedDate.toISOString() }) };
                });
            }
            
            // Set the overall poDeliveryDate to the latest date from all items
            if (allDeliveryDates.length > 0) {
                const latestDate = new Date(Math.max.apply(null, allDeliveryDates.map(d => d.getTime())));
                updatePayload.poDeliveryDate = latestDate.toISOString();
            }

            updatePayload.poMilestones = arrayUnion(...newMilestones);
            await updateDoc(requestRef, updatePayload);

            toast({ title: `PO Confirmed & Step ${stepId} Completed` });
        } catch (error) {
            console.error("Error setting PO date:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        } finally {
            setRequestForConfirmation(null);
        }
    };

    const handleFollowUpConfirmation = async (values: PoConfirmationFormValues) => {
        if (!requestForFollowUp || !user) return;
        const { request, stepId } = requestForFollowUp;

        try {
            const requestRef = doc(db, "purchaseRequests", request.id);
            const updatePayload: any = {};

            const newMilestones: PurchaseStatus[] = [];
            const allDeliveryDates: Date[] = [];

            if (request.type === 'fabric' && values.fabricDetails) {
                updatePayload.fabricDetails = request.fabricDetails?.map((item, index) => {
                    const formDetails = values.fabricDetails?.[index];
                    const expectedDate = formDetails?.expectedDeliveryDate;
                    if(expectedDate) allDeliveryDates.push(expectedDate);
                    
                    newMilestones.push({
                        stepId, status: 'completed', completedAt: new Date().toISOString(), completedBy: user.name || 'System',
                        itemName: item.fabricName,
                        poNumber: formDetails?.poNumber, vendorName: formDetails?.vendorName, quantity: item.quantity,
                    });

                    return { ...item, ...(expectedDate && { expectedDeliveryDate: expectedDate.toISOString() }) };
                });
            } else if (request.type === 'furniture' && values.furnitureDetails) {
                updatePayload.furnitureDetails = request.furnitureDetails?.map((item, index) => {
                    const formDetails = values.furnitureDetails?.[index];
                    const expectedDate = formDetails?.expectedDeliveryDate;
                    if(expectedDate) allDeliveryDates.push(expectedDate);

                     newMilestones.push({
                        stepId, status: 'completed', completedAt: new Date().toISOString(), completedBy: user.name || 'System',
                        itemName: item.furnitureName,
                        poNumber: formDetails?.poNumber, vendorName: formDetails?.vendorName, quantity: item.quantity,
                    });

                    return { ...item, ...(expectedDate && { expectedDeliveryDate: expectedDate.toISOString() }) };
                });
            }
            
             // Set the overall poDeliveryDate to the latest date from all items
            if (allDeliveryDates.length > 0) {
                const latestDate = new Date(Math.max.apply(null, allDeliveryDates.map(d => d.getTime())));
                updatePayload.poDeliveryDate = latestDate.toISOString();
            }

            updatePayload.poMilestones = arrayUnion(...newMilestones);
            await updateDoc(requestRef, updatePayload);

            toast({ title: `Follow-up complete for Step ${stepId}` });
        } catch (error) {
            console.error("Error confirming follow up:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        } finally {
            setRequestForFollowUp(null);
        }
    };


    const revertingStepConfig = revertingStep ? PO_PROCESS_CONFIG.find(s => s.id === revertingStep.milestone.stepId) : null;


    if (loading) {
        return (
            <div className="space-y-4">
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
        <div className="space-y-4">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">PO to Order Receive</h1>
                <p className="text-muted-foreground">Track items from Purchase Order generation to receipt.</p>
            </header>

            <div className="space-y-4">
            {requests.length > 0 ? (
                requests.map(request => (
                    <AlertDialog key={request.id}>
                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle>Request for: {request.customerName}</CardTitle>
                                        <CardDescription>Deal ID: {request.dealId}</CardDescription>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        {(request.fabricDetails?.map(d => d.vendorName).filter(Boolean) as string[] || [])
                                            .concat(request.furnitureDetails?.map(d => d.vendorName).filter(Boolean) as string[] || [])
                                            .filter((v, i, a) => a.indexOf(v) === i) // Unique vendors
                                            .map(vendor => <Badge key={vendor} variant="secondary">{vendor}</Badge>)
                                        }
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <PoTrackingTimeline 
                                    request={request} 
                                    onStepUpdate={handleStepUpdate} 
                                    onRevertStep={(requestId, milestone) => setRevertingStep({requestId, milestone})} 
                                    userRole={role} 
                                />
                                {updatingRequest?.request.id === request.id && (
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Are you sure you want to mark step "{PO_PROCESS_CONFIG.find(s => s.id === updatingRequest.stepId)?.step}" as complete for all items in this request?
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel onClick={() => setUpdatingRequest(null)}>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={confirmStepUpdate}>Confirm</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                )}
                                {revertingStep?.requestId === request.id && (
                                     <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will revert the step: <strong>{revertingStepConfig?.step}</strong>. This action cannot be undone. Reverting this step will also remove all subsequent completed steps in the PO timeline.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel onClick={() => setRevertingStep(null)}>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleRevertStep}>Continue</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                )}
                            </CardContent>
                        </Card>
                    </AlertDialog>
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
                mode="confirmation"
            />
             <PoConfirmationDialog
                isOpen={!!requestForFollowUp}
                onClose={() => setRequestForFollowUp(null)}
                onConfirm={handleFollowUpConfirmation}
                request={requestForFollowUp?.request || null}
                mode="follow-up"
            />
        </div>
    );
}
