

"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Clock, FileCheck, Loader2, Send, ThumbsUp, Truck, Undo2 } from 'lucide-react';
import { collection, onSnapshot, query, doc, updateDoc, arrayUnion, where, arrayRemove, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest, PurchaseStatus, FabricDetail, FurnitureDetail, Order, O2DStatus } from "@/lib/types"; // Re-using some types
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
import { PoTrackingTimeline } from '@/components/features/purchase/PoTrackingTimeline';


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

    React.useEffect(() => {
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
            collection(db, "purchaseRequests")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));
            
            // Filter client-side to find requests where an order has been placed.
            const poReadyRequests = allRequests.filter(req => {
                const isOrderPlaced = req.milestones.some(m => (m.stepId === 4) && m.status === 'completed');
                const isCompleted = req.poMilestones?.some(m => m.stepId === 3 && m.status === 'completed');
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
            const baseMilestone: PurchaseStatus = {
                stepId: stepId,
                status: 'completed',
                completedAt: completedAt,
                completedBy: user.name,
                itemName: (item as any).fabricName || (item as any).furnitureName,
                poNumber: item.poNumber,
                vendorName: item.vendorName,
                quantity: item.quantity,
            };
            allNewMilestones.push(baseMilestone);
    
            // If step 3 is being completed, also complete step 4
            if (stepId === 3) {
                allNewMilestones.push({
                    ...baseMilestone,
                    stepId: 4, // Data Entry step
                    completedBy: 'System (Auto)',
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

            // If step 4 (Data Entry) is being completed, try to update O2D
            if (allNewMilestones.some(m => m.stepId === 4)) {
                 const ordersRef = collection(db, "orders");
                const q = query(ordersRef, where("crmOrderNo", "==", request.dealId));
                const orderSnapshot = await getDocs(q);
                
                if (!orderSnapshot.empty) {
                    const orderDoc = orderSnapshot.docs[0];
                    const orderData = orderDoc.data() as Order;
                    const o2dStep9 = orderData.o2dMilestones?.find(m => m.stepId === 9);

                    if (!o2dStep9) {
                        const o2dMilestoneStep9: O2DStatus = {
                            stepId: 9,
                            status: 'completed',
                            completedAt: new Date().toISOString(),
                            completedBy: "System (PO Complete)",
                            remarks: "Automatically completed after PO data entry.",
                            selection: 'Done'
                        };
                        await updateDoc(orderDoc.ref, {
                            o2dMilestones: arrayUnion(o2dMilestoneStep9)
                        });
                        toast({
                            title: "O2D Process Updated!",
                            description: `Step "Purchase Material Receiving" was automatically marked as done for order ${orderData.id}.`,
                            duration: 5000,
                        });
                    }
                }
            }
            
            toast({ title: `PO Step Updated!` });

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
