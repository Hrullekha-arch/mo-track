
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Users, Clock, Banknote, ClipboardCheck, Box, ArrowRightCircle, Phone, MapPin, ChevronDown, CheckCircle, AlertTriangle, MessageSquareWarning, SkipForward, Calendar, MessageCircle, Undo2 } from 'lucide-react';
import { collection, onSnapshot, query, doc, updateDoc, arrayUnion, getDoc, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, O2DStep, O2DStatus } from "@/lib/types";
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { addDays, addHours, addMinutes, isPast, format, formatDistanceToNow } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const O2D_PROCESS_CONFIG: O2DStep[] = [
    { id: 1, step: "Receive Advance ₹1000", details: "For measurement/Fabric order", time: "30 min", role: "Salesman", icon: User, expectedDuration: { minutes: 30 } },
    { id: 2, step: "Material Selection", details: "For Delivery/Production", time: "7 Days", role: "Salesman", icon: User, expectedDuration: { days: 7 } },
    { id: 3, step: "Measurement", details: "Coordinate to CRM", time: "1 Day", role: "CRM", icon: Users, expectedDuration: { days: 1 } },
    { id: 4, step: "Final Material Selection", details: "For Delivery/Production", time: "7 Days", role: "CRM / Salesman", icon: Users, expectedDuration: { days: 7 } },
    { id: 5, step: "Quotation Making", details: "Final quotation for the customer", time: "1 Day", role: "Salesman", icon: User, expectedDuration: { days: 1 } },
    { id: 6, step: "Quotation Re-Check", details: "Verification of the quotation", time: "1 Hour", role: "Accounts", icon: Banknote, expectedDuration: { hours: 1 } },
    { id: 7, step: "Advance Receiving Confirmation", details: "Before Material Ordering", time: "2 Hours", role: "Accounts", icon: Banknote, expectedDuration: { hours: 2 } },
    { id: 8, step: "PO Item List Tally", details: "Tally with Customer Quotation/Estimate", time: "1 Hour", role: "Salesman", icon: ClipboardCheck, expectedDuration: { hours: 1 } },
    { id: 9, step: "Purchase Material Receiving", details: "Time linked to another page", time: "Variable", role: "Purchase Dept.", icon: Box, expectedDuration: { days: 3 } }, // Assuming 3 days for variable
    { id: 10, step: "Move to Order Dashboard", details: "Order moves to the main tracking workflow", time: "Instant", role: "System", icon: ArrowRightCircle, expectedDuration: { minutes: 5 } }
];

function getExpectedCompletionDate(step: O2DStep, startDate: Date): Date {
    const { days = 0, hours = 0, minutes = 0 } = step.expectedDuration;
    let completionDate = addDays(startDate, days);
    completionDate = addHours(completionDate, hours);
    completionDate = addMinutes(completionDate, minutes);
    return completionDate;
}

const formatTimestamp = (date: Date) => {
    return format(date, 'dd/MM/yyyy - HH:mm:ss');
};

const calculateExpectedDatesForOrder = (order: Order) => {
    return O2D_PROCESS_CONFIG.reduce((acc, currentStep) => {
        let startDate: Date;
        if (currentStep.id === 1) {
            startDate = new Date(order.createdAt);
        } else {
            const previousStepConfig = O2D_PROCESS_CONFIG.find(s => s.id === currentStep.id - 1);
            if (!previousStepConfig) {
                 startDate = new Date(); // Fallback, should not happen
            } else {
                const previousStepStatus = (order.o2dMilestones || []).find(m => m.stepId === previousStepConfig.id);
                if (previousStepStatus?.status === 'completed' || previousStepStatus?.status === 'skipped') {
                    startDate = new Date(previousStepStatus.completedAt);
                } else {
                    startDate = acc[previousStepConfig.id]; // Use previous step's expected date
                }
            }
        }
        acc[currentStep.id] = getExpectedCompletionDate(currentStep, startDate);
        return acc;
    }, {} as Record<number, Date>);
}

function O2DProcessTimeline({ 
    order, 
    onStepUpdate, 
    onQuickStepUpdate,
    onRevertStep,
    role
}: { 
    order: Order; 
    onStepUpdate: (orderId: string, stepId: number, isOverdue: boolean, action: 'completed' | 'skipped') => void; 
    onQuickStepUpdate: (orderId: string, stepId: number) => void; 
    onRevertStep: (orderId: string, stepId: number, milestone: O2DStatus) => void;
    role: string | null;
}) {
    
    // Memoize the calculated expected dates for all steps to avoid re-calculating on every render.
    const expectedDates = calculateExpectedDatesForOrder(order);

    return (
        <div className="relative pl-6 pr-4 py-4">
            <div className="absolute left-9 top-0 h-full w-0.5 bg-border -translate-x-1/2" aria-hidden="true"></div>
            <div className="space-y-4">
                {O2D_PROCESS_CONFIG.map((stepConfig, index) => {
                    const stepStatus = order.o2dMilestones?.find(s => s.stepId === stepConfig.id);
                    const prevStepStatus = index === 0 ? { status: 'completed' } : order.o2dMilestones?.find(s => s.stepId === O2D_PROCESS_CONFIG[index-1].id);
                    
                    const canUpdate = !stepStatus && (index === 0 || prevStepStatus?.status);
                    const isPending = !stepStatus;
                    
                    const expectedDate = expectedDates[stepConfig.id];
                    const isOverdue = isPast(expectedDate) && isPending;
                    const wasCompletedLate = stepStatus?.status === 'completed' && new Date(stepStatus.completedAt) > expectedDate;

                    const Icon = stepConfig.icon;
                    return (
                        <div key={index} className="relative flex items-start gap-4">
                            <div className="flex h-18 w-18 items-center justify-center shrink-0">
                                <div className={cn(
                                    "flex h-12 w-12 items-center justify-center rounded-full border-2 border-border shadow-sm",
                                    stepStatus?.status === 'completed' && !wasCompletedLate && "bg-green-50",
                                    stepStatus?.status === 'completed' && wasCompletedLate && "bg-orange-50",
                                    stepStatus?.status === 'skipped' && "bg-gray-100",
                                    !stepStatus && "bg-card"
                                )}>
                                     <Icon className={cn("h-6 w-6", 
                                        stepStatus?.status === 'completed' && !wasCompletedLate && "text-green-500",
                                        stepStatus?.status === 'completed' && wasCompletedLate && "text-orange-500",
                                        stepStatus?.status === 'skipped' && "text-gray-500",
                                        !stepStatus && "text-muted-foreground")} />
                                </div>
                            </div>
                            <Card className={cn(
                                "w-full group hover:shadow-md transition-shadow duration-300",
                                isPending && isOverdue ? "border-red-500 bg-red-50" : "",
                                stepStatus?.status === 'completed' && wasCompletedLate ? "border-orange-500 bg-orange-50" : "",
                                stepStatus?.status === 'skipped' ? "border-gray-400 bg-gray-50" : ""
                            )}>
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-base">{stepConfig.step}</CardTitle>
                                            <CardDescription>{stepConfig.details}</CardDescription>
                                        </div>
                                        <div className="text-right flex-shrink-0 ml-4">
                                            <p className="font-semibold text-sm">{stepConfig.role}</p>
                                            <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                                                <Clock className="h-3 w-3" />
                                                <span>{stepConfig.time}</span>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex justify-between items-center">
                                         <div className="text-xs text-muted-foreground space-y-2">
                                            <p>Expected by: {formatTimestamp(expectedDate)}</p>
                                            
                                            {stepStatus?.status === 'completed' && (
                                                <div className="flex items-center gap-2 text-green-600 font-medium">
                                                    <CheckCircle className="h-4 w-4" />
                                                    <span>Completed by {stepStatus.completedBy} at {formatTimestamp(new Date(stepStatus.completedAt))}</span>
                                                </div>
                                            )}

                                            {stepStatus?.status === 'skipped' && (
                                                <div className="flex items-center gap-2 text-gray-600 font-medium">
                                                    <SkipForward className="h-4 w-4" />
                                                    <span>Skipped by {stepStatus.completedBy} at {formatTimestamp(new Date(stepStatus.completedAt))}</span>
                                                </div>
                                            )}

                                            {isPending && isOverdue && (
                                                <div className="flex items-center gap-2 text-red-600 font-medium">
                                                    <AlertTriangle className="h-4 w-4" />
                                                    <span>Delayed by: {formatDistanceToNow(expectedDate, { addSuffix: false })}</span>
                                                </div>
                                            )}

                                             {stepStatus?.status === 'completed' && wasCompletedLate && (
                                                <div className="flex items-center gap-2 text-orange-600 font-medium">
                                                    <MessageSquareWarning className="h-4 w-4" />
                                                    <span>Completed {formatDistanceToNow(expectedDate, { addSuffix: true })}</span>
                                                </div>
                                            )}

                                            {stepStatus?.remarks && (
                                                 <div className="text-xs italic text-muted-foreground pt-1 border-t mt-2">
                                                    <span className="font-semibold">Remarks:</span> "{stepStatus.remarks}"
                                                 </div>
                                            )}

                                        </div>
                                        <div className="flex items-center gap-2">
                                            {stepStatus && role === 'admin' && (
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onRevertStep(order.id, stepConfig.id, stepStatus)}>
                                                        <Undo2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                            )}
                                            {!stepStatus ? (
                                                <Select
                                                    disabled={!canUpdate}
                                                    onValueChange={(value) => {
                                                        const isYes = value === 'yes' || value === 'old_customer';
                                                        if (isYes && !isOverdue) {
                                                            onQuickStepUpdate(order.id, stepConfig.id)
                                                        } else if (isYes && isOverdue) {
                                                            onStepUpdate(order.id, stepConfig.id, true, 'completed');
                                                        } else if (value === 'no') {
                                                            onStepUpdate(order.id, stepConfig.id, isOverdue, 'skipped');
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger className="w-[180px]">
                                                        <SelectValue placeholder="Update Status..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="yes">Yes</SelectItem>
                                                        <SelectItem value="no">No</SelectItem>
                                                        {stepConfig.id === 1 && <SelectItem value="old_customer">Old Customer</SelectItem>}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Badge variant={stepStatus.status === 'completed' ? 'default' : 'secondary'} className={cn(
                                                    stepStatus.status === 'completed' && wasCompletedLate && 'bg-orange-500'
                                                )}>
                                                    {stepStatus.status === 'completed' ? 'Done' : 'Skipped'}
                                                </Badge>
                                            )}
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

function UpdateO2DStepDialog({
    isOpen,
    onClose,
    onUpdate,
    step,
    action,
    isOverdue
}: {
    isOpen: boolean;
    onClose: () => void;
    onUpdate: (remarks: string) => void;
    step: O2DStep | null;
    action: 'completed' | 'skipped' | null;
    isOverdue: boolean;
}) {
    const [remarks, setRemarks] = useState("");

    const handleSubmit = () => {
        onUpdate(remarks);
        onClose();
    };

    useEffect(() => {
        if (!isOpen) {
            setRemarks("");
        }
    }, [isOpen]);

    if (!step || !action) return null;
    
    let title = 'Add Remarks';
    let description = 'Please provide details for this action.';
    if (action === 'skipped') {
        title = 'Reason for Skipping';
        description = `Please explain why you are skipping the step: ${step.step}.`;
    } else if (action === 'completed' && isOverdue) {
        title = 'Reason for Delay';
        description = `This step is overdue. Please explain the reason for the delay.`;
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                     <Textarea
                        id="remarks"
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="Please provide details..."
                    />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={!remarks}>Submit</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function O2DPage() {
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isRevertDialogOpen, setIsRevertDialogOpen] = useState(false);
    const [updatingStepInfo, setUpdatingStepInfo] = useState<{orderId: string, stepId: number, isOverdue: boolean, action: 'completed' | 'skipped' | null} | null>(null);
    const [revertingStepInfo, setRevertingStepInfo] = useState<{orderId: string, stepId: number, milestone: O2DStatus} | null>(null);

    const { user, role } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        const q = query(collection(db, "orders"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            const pending = allOrders.filter(order => {
                const finalO2DStep = order.o2dMilestones?.find(m => m.stepId === 10);
                return !finalO2DStep; // If final step doesn't exist, it's pending
            }).sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            setPendingOrders(pending);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);
    
    const handleOpenRemarkDialog = (orderId: string, stepId: number, isOverdue: boolean, action: 'completed' | 'skipped') => {
        setUpdatingStepInfo({ orderId, stepId, isOverdue, action });
        setIsDialogOpen(true);
    };

    const handleOpenRevertDialog = (orderId: string, stepId: number, milestone: O2DStatus) => {
        setRevertingStepInfo({ orderId, stepId, milestone });
        setIsRevertDialogOpen(true);
    };

    const handleRevertStep = async () => {
        if (!revertingStepInfo) return;
        const { orderId, milestone } = revertingStepInfo;

        try {
            const orderRef = doc(db, "orders", orderId);
            await updateDoc(orderRef, {
                o2dMilestones: arrayRemove(milestone)
            });
            toast({ title: "Step Reverted!", description: "The step has been successfully reverted." });
        } catch (error) {
            console.error("Error reverting step:", error);
            toast({ variant: "destructive", title: "Revert Failed" });
        } finally {
            setIsRevertDialogOpen(false);
            setRevertingStepInfo(null);
        }
    };

    const updateStepInFirestore = async (orderId: string, stepId: number, status: 'completed' | 'skipped', remarks: string) => {
        if (!user) {
            toast({ variant: "destructive", title: "You must be logged in." });
            return;
        }

        const newStatus: O2DStatus = {
            stepId: stepId,
            status: status,
            completedAt: new Date().toISOString(),
            completedBy: user.name,
            remarks: remarks || "",
        };
        
        try {
            const orderRef = doc(db, "orders", orderId);
            await updateDoc(orderRef, {
                o2dMilestones: arrayUnion(newStatus)
            });

            if (stepId === 10 && status === 'completed') {
                 const orderData = pendingOrders.find(o => o.id === orderId);
                 if (orderData) {
                     const firstMilestoneIndex = orderData.milestones.findIndex(m => m.id === 1);
                     if (firstMilestoneIndex !== -1 && !orderData.milestones[firstMilestoneIndex].completed) {
                         const updatedMilestones = [...orderData.milestones];
                         updatedMilestones[firstMilestoneIndex] = {
                             ...updatedMilestones[firstMilestoneIndex],
                             completed: true,
                             completedAt: new Date().toISOString(),
                             completedBy: "System (O2D Complete)",
                             location: null
                         };
                         await updateDoc(orderRef, { 
                             milestones: updatedMilestones,
                             isAcknowledged: true 
                         });
                     }
                 }
            }

            toast({ title: "Step Updated!", description: "Progress has been saved." });
        } catch (error) {
            console.error("Error updating O2D step:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        }
    }

    const handleQuickStepUpdate = async (orderId: string, stepId: number) => {
        await updateStepInFirestore(orderId, stepId, 'completed', '');
    }

    const handleRemarkSubmit = async (remarks: string) => {
        if (!updatingStepInfo?.action) return;
        await updateStepInFirestore(updatingStepInfo.orderId, updatingStepInfo.stepId, updatingStepInfo.action, remarks);
        setIsDialogOpen(false);
        setUpdatingStepInfo(null);
    };
    
    const updatingStepConfig = updatingStepInfo ? O2D_PROCESS_CONFIG.find(s => s.id === updatingStepInfo.stepId) : null;
    const revertingStepConfig = revertingStepInfo ? O2D_PROCESS_CONFIG.find(s => s.id === revertingStepInfo.stepId) : null;

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">O2D (Order to Delivery) Process</h1>
                <p className="text-muted-foreground">Manage and track all orders in the pre-production phase before they are acknowledged.</p>
            </header>
            
            <div className="space-y-4">
                {loading ? (
                    Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)
                ) : pendingOrders.length > 0 ? (
                    <AlertDialog>
                    {pendingOrders.map(order => {
                        const expectedDates = calculateExpectedDatesForOrder(order);
                        const completedSteps = (order.o2dMilestones || []).filter(m => m.status === 'completed' || m.status === 'skipped');
                        const nextStepIndex = O2D_PROCESS_CONFIG.findIndex(s => !completedSteps.some(cs => cs.stepId === s.id));
                        const currentStep = nextStepIndex !== -1 ? O2D_PROCESS_CONFIG[nextStepIndex] : null;

                        let cardBorderColor = "border-border";
                        if (currentStep && isPast(expectedDates[currentStep.id])) {
                            cardBorderColor = "border-red-500";
                        }
                        
                        return (
                        <Collapsible key={order.id} className={cn("border-2 rounded-lg bg-card overflow-hidden", cardBorderColor)}>
                            <CardHeader className="flex flex-row items-center justify-between p-4">
                               <div className='flex-grow'>
                                    <h3 className="font-semibold text-lg">{order.customerName}</h3>
                                    <p className="text-sm text-muted-foreground">ID: {order.id}</p>
                                    <div className='mt-2 space-y-2 text-sm'>
                                        <p className='flex items-center gap-2'><Phone className='h-4 w-4 text-muted-foreground' /> {order.customerPhone}</p>
                                        <p className='flex items-center gap-2'><MapPin className='h-4 w-4 text-muted-foreground' /> {order.customerAddress}</p>
                                        <p className='flex items-center gap-2'><Calendar className='h-4 w-4 text-muted-foreground' /> Order Date: {format(new Date(order.createdAt), 'dd/MM/yyyy')}</p>
                                        {currentStep && (
                                            <p className={cn('flex items-center gap-2 font-medium', cardBorderColor === 'border-red-500' ? 'text-red-500' : 'text-muted-foreground')}>
                                                <Clock className='h-4 w-4'/>
                                                Status: {currentStep.step} - Due by {formatTimestamp(expectedDates[currentStep.id])}
                                            </p>
                                        )}
                                        {order.remarks && (
                                            <p className='flex items-start gap-2 text-muted-foreground'>
                                                <MessageCircle className='h-4 w-4 mt-0.5' /> 
                                                <span className='italic'>"{order.remarks}"</span>
                                            </p>
                                        )}
                                    </div>
                               </div>
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                        <ChevronDown className="h-4 w-4" />
                                        <span className='ml-2'>View Process</span>
                                    </Button>
                                </CollapsibleTrigger>
                            </CardHeader>
                            <CollapsibleContent>
                               <O2DProcessTimeline 
                                    order={order} 
                                    onStepUpdate={handleOpenRemarkDialog} 
                                    onQuickStepUpdate={handleQuickStepUpdate}
                                    onRevertStep={handleOpenRevertDialog}
                                    role={role}
                                />
                            </CollapsibleContent>
                        </Collapsible>
                        );
                    })}
                     <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will revert the step: <strong>{revertingStepConfig?.step}</strong>. This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setIsRevertDialogOpen(false)}>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleRevertStep}>Continue</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                    </AlertDialog>
                ) : (
                    <Card className="text-center p-12">
                        <CardTitle>All Caught Up!</CardTitle>
                        <CardDescription>There are no new orders in the O2d phase.</CardDescription>
                    </Card>
                )}
            </div>
             <UpdateO2DStepDialog
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                onUpdate={handleRemarkSubmit}
                step={updatingStepConfig}
                action={updatingStepInfo?.action || null}
                isOverdue={updatingStepInfo?.isOverdue || false}
            />
        </div>
    );
}
