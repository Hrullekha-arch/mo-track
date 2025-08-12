

"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Users, Clock, Banknote, ClipboardCheck, Box, ArrowRightCircle, Phone, MapPin, ChevronDown, CheckCircle, AlertTriangle, MessageSquareWarning, SkipForward, Calendar, MessageCircle, Undo2, Calendar as CalendarIcon, X, Eye, EyeOff, Sparkles, UserCheck, PackageSearch, FileText, BadgePercent, PhoneCall } from 'lucide-react';
import { collection, onSnapshot, query, doc, updateDoc, arrayUnion, getDoc, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, O2DStep, O2DStatus, OrderType } from "@/lib/types";
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { addDays, addHours, addMinutes, isPast, format, formatDistanceToNow, isSameDay, differenceInHours } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { ConfirmOrderTypeDialog } from "@/components/features/order-management/ConfirmOrderTypeDialog";
import { getMilestonesForOrder, O2D_PROCESS_CONFIG, calculateExpectedDatesForOrder } from '@/lib/constants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setBalanceFollowUp } from '../all-orders/actions';


const formatTimestamp = (date: Date) => {
    return format(date, 'dd/MM/yyyy - HH:mm:ss');
};

function O2DProcessTimeline({ 
    order, 
    onStepUpdate, 
    onQuickStepUpdate,
    onRevertStep,
    onConfirmOrderType,
    userRole,
    userDesignation,
    showAllSteps = false
}: { 
    order: Order; 
    onStepUpdate: (orderId: string, stepId: number, isOverdue: boolean, action: 'completed' | 'skipped', selection: string) => void; 
    onQuickStepUpdate: (orderId: string, stepId: number, status: 'completed' | 'skipped', selection: string) => void; 
    onRevertStep: (orderId: string, stepId: number, milestone: O2DStatus) => void;
    onConfirmOrderType: (order: Order) => void;
    userRole: string | null;
    userDesignation: string | null;
    showAllSteps: boolean;
}) {
    
    const expectedDates = calculateExpectedDatesForOrder(order);

    const stepsToShow = useMemo(() => {
        if (showAllSteps) {
            return O2D_PROCESS_CONFIG;
        }
        const lastCompletedIndex = O2D_PROCESS_CONFIG.findLastIndex(step => 
            (order.o2dMilestones || []).some(m => m.stepId === step.id)
        );
        // Show from the step after the last completed one. If none are completed, show all.
        return O2D_PROCESS_CONFIG.slice(lastCompletedIndex + 1);
    }, [order.o2dMilestones, showAllSteps]);


    const handleAction = (status: 'completed' | 'skipped', selection: string, stepId: number, isOverdue: boolean) => {
      // The final step triggers the order type confirmation dialog
      if (stepId === O2D_PROCESS_CONFIG[O2D_PROCESS_CONFIG.length - 1].id && status === 'completed') {
        onConfirmOrderType(order);
      } else if ((status === 'skipped') || (status === 'completed' && isOverdue)) {
        onStepUpdate(order.id, stepId, isOverdue, status, selection);
      } else {
        onQuickStepUpdate(order.id, stepId, status, selection);
      }
    };
    
    const checkPermission = (stepRole: string) => {
        if (userRole === 'admin' || stepRole.toLowerCase().includes('system')) return true;

        const requiredRoles = stepRole.split(' / ').map(r => r.trim().toLowerCase());
        
        if (userRole && requiredRoles.includes(userRole.toLowerCase())) {
            return true;
        }

        if (userDesignation && requiredRoles.includes(userDesignation.toLowerCase())) {
            return true;
        }

        return false;
    }

    const renderActionButtons = (stepConfig: O2DStep, isOverdue: boolean) => {
        const stepId = stepConfig.id;
        const hasPermission = checkPermission(stepConfig.role);

        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm" disabled={!hasPermission}>Action</Button></DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => handleAction('completed', 'Yes', stepId, isOverdue)}>Yes</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAction('skipped', 'No', stepId, isOverdue)}>No</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        );
    };

    return (
        <div className="relative pl-6 pr-4 py-4">
            <div className="absolute left-9 top-0 h-full w-0.5 bg-border -translate-x-1/2" aria-hidden="true"></div>
            <div className="space-y-4">
                {(showAllSteps ? O2D_PROCESS_CONFIG : stepsToShow).map((stepConfig, index) => {
                    const stepStatus = order.o2dMilestones?.find(s => s.stepId === stepConfig.id);
                    const prevStepConfigIndex = O2D_PROCESS_CONFIG.findIndex(s => s.id === stepConfig.id) - 1;
                    const prevStepStatus = prevStepConfigIndex < 0 ? { status: 'completed' } : order.o2dMilestones?.find(s => s.id === O2D_PROCESS_CONFIG[prevStepConfigIndex].id);
                    
                    const isPending = !stepStatus;
                    
                    const expectedDate = expectedDates[stepConfig.id];
                    const isOverdue = isPast(expectedDate) && isPending;
                    const wasCompletedLate = stepStatus?.status === 'completed' && new Date(stepStatus.completedAt) > expectedDate;

                    const Icon = stepConfig.icon;
                    return (
                        <div key={stepConfig.id} className="relative flex items-start gap-4">
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
                                    <div className="flex justify-between items-center flex-wrap gap-4">
                                         <div className="text-xs text-muted-foreground space-y-2 flex-grow">
                                            <p className={cn(
                                                isPending && isOverdue ? "text-red-600 font-medium" : "",
                                                stepStatus?.status === 'completed' && wasCompletedLate ? "text-orange-600" : ""
                                            )}>
                                                Expected by: {formatTimestamp(expectedDate)}
                                            </p>
                                            
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
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {stepStatus && userRole === 'admin' && (
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onRevertStep(order.id, stepConfig.id, stepStatus)}>
                                                        <Undo2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                            )}
                                            {!stepStatus && prevStepStatus?.status ? (
                                                renderActionButtons(stepConfig, isOverdue)
                                            ) : (
                                                <div className="text-center">
                                                    <Badge variant={stepStatus?.status === 'completed' ? 'default' : 'secondary'} className={cn(
                                                        'capitalize',
                                                        stepStatus?.status === 'completed' && wasCompletedLate && 'bg-orange-500'
                                                    )}>
                                                        {stepStatus?.selection || stepStatus?.status}
                                                    </Badge>
                                                </div>
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
    const [allOrders, setAllOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isRevertDialogOpen, setIsRevertDialogOpen] = useState(false);
    const [updatingStepInfo, setUpdatingStepInfo] = useState<{orderId: string, stepId: number, isOverdue: boolean, action: 'completed' | 'skipped' | null, selection: string} | null>(null);
    const [revertingStepInfo, setRevertingStepInfo] = useState<{orderId: string, stepId: number, milestone: O2DStatus} | null>(null);
    const [filterDate, setFilterDate] = useState<Date | undefined>();
    const [confirmOrder, setConfirmOrder] = useState<Order | null>(null);
    const [followUpOrder, setFollowUpOrder] = useState<Order | null>(null);

    const { user, role } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        const q = query(collection(db, "orders"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ordersData = snapshot.docs.map(doc => {
                const data = doc.data() as Omit<Order, 'id'>;
                // Automatically add o2dMilestones if it's missing
                if (data.o2dMilestones === undefined) {
                    data.o2dMilestones = [];
                }
                return { id: doc.id, ...data } as Order;
            });
            
            setAllOrders(ordersData);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const pendingOrders = useMemo(() => {
        let orders = allOrders.filter(order => {
            const finalO2DStep = order.o2dMilestones?.find(m => m.stepId === O2D_PROCESS_CONFIG[O2D_PROCESS_CONFIG.length - 1].id);
            return !finalO2DStep; // If final step doesn't exist, it's pending
        });

        if (filterDate) {
            orders = orders.filter(order => {
                const expectedDates = calculateExpectedDatesForOrder(order);
                const pendingSteps = O2D_PROCESS_CONFIG.filter(stepConfig => 
                    !(order.o2dMilestones || []).some(m => m.stepId === stepConfig.id)
                );
                return pendingSteps.some(step => isSameDay(expectedDates[step.id], filterDate));
            });
        }
        
        return orders.sort((a,b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateA - dateB;
        });

    }, [allOrders, filterDate]);
    
    const handleOpenRemarkDialog = (orderId: string, stepId: number, isOverdue: boolean, action: 'completed' | 'skipped', selection: string) => {
        setUpdatingStepInfo({ orderId, stepId, isOverdue, action, selection });
        setIsDialogOpen(true);
    };

    const handleOpenRevertDialog = (orderId: string, stepId: number, milestone: O2DStatus) => {
        setRevertingStepInfo({ orderId, stepId, milestone });
        setIsRevertDialogOpen(true);
    };

    const handleFollowUp = async () => {
        if (!followUpOrder || !user) return;
    
        const orderId = followUpOrder.id;
        const o2dDocId = followUpOrder.id; // This is the deal doc ID used for O2D documents.
    
        try {
          const result = await setBalanceFollowUp(orderId, o2dDocId, user.name);
          if (result.success) {
            toast({ title: "Follow-up Step Completed", description: result.message });
          } else {
             toast({ variant: "destructive", title: "Update Failed", description: result.message });
          }
        } catch (error) {
          console.error("Error updating O2D step:", error);
          toast({ variant: "destructive", title: "Update Failed", description: "Could not complete the follow-up step." });
        } finally {
          setFollowUpOrder(null);
        }
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

    const updateStepInFirestore = async (orderId: string, stepId: number, status: 'completed' | 'skipped', remarks: string, selection: string) => {
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
            selection: selection,
        };
        
        try {
            const orderRef = doc(db, "orders", orderId);
            await updateDoc(orderRef, { o2dMilestones: arrayUnion(newStatus) });

            toast({ title: "Step Updated!", description: "Progress has been saved." });
        } catch (error) {
            console.error("Error updating O2D step:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        }
    }

    const handleConfirmOrderType = async (order: Order, newOrderType: OrderType) => {
        if (!user) {
            toast({ variant: "destructive", title: "You must be logged in." });
            return;
        }

        const stepId = O2D_PROCESS_CONFIG[O2D_PROCESS_CONFIG.length - 1].id;
        const newStatus: O2DStatus = {
            stepId: stepId,
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: user.name,
            remarks: `Order type confirmed as ${newOrderType}`,
            selection: "Done",
        };

        try {
            const orderRef = doc(db, "orders", order.id);

            const updatePayload: any = {
                o2dMilestones: arrayUnion(newStatus),
                isAcknowledged: true,
            };
            
            const orderDoc = await getDoc(orderRef);
            const orderData = orderDoc.data() as Order;
            
            let milestonesToUpdate = orderData.milestones;

            // If order type has changed, update it and the main milestones
            if (order.orderType !== newOrderType) {
                updatePayload.orderType = newOrderType;
                milestonesToUpdate = getMilestonesForOrder(newOrderType);
            }

            // Update the first main milestone of the (potentially new) milestone set
            const firstMilestoneIndex = milestonesToUpdate.findIndex((m: { id: number; }) => m.id === 1);
            
            if (firstMilestoneIndex !== -1 && !milestonesToUpdate[firstMilestoneIndex].completed) {
                milestonesToUpdate[firstMilestoneIndex] = {
                    ...milestonesToUpdate[firstMilestoneIndex],
                    completed: true,
                    completedAt: new Date().toISOString(),
                    completedBy: "System (O2D Complete)",
                    location: null
                };
            }
            updatePayload.milestones = milestonesToUpdate;

            await updateDoc(orderRef, updatePayload);
            toast({ title: "Order Moved!", description: `${order.id} has been moved to the main dashboard.` });

        } catch (error) {
            console.error("Error confirming order type and moving order:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        } finally {
            setConfirmOrder(null);
        }
    };


    const handleQuickStepUpdate = async (orderId: string, stepId: number, status: 'completed' | 'skipped', selection: string) => {
        await updateStepInFirestore(orderId, stepId, status, '', selection);
    }

    const handleRemarkSubmit = async (remarks: string) => {
        if (!updatingStepInfo?.action) return;
        await updateStepInFirestore(updatingStepInfo.orderId, updatingStepInfo.stepId, updatingStepInfo.action, remarks, updatingStepInfo.selection);
        setIsDialogOpen(false);
        setUpdatingStepInfo(null);
    };
    
    const updatingStepConfig = updatingStepInfo ? O2D_PROCESS_CONFIG.find(s => s.id === updatingStepInfo.stepId) : null;
    const revertingStepConfig = revertingStepInfo ? O2D_PROCESS_CONFIG.find(s => s.id === revertingStepInfo.stepId) : null;

    const OrderCard = ({ order }: { order: Order }) => {
        const [showAllSteps, setShowAllSteps] = useState(false);
        
        const expectedDates = calculateExpectedDatesForOrder(order);
        const completedSteps = (order.o2dMilestones || []).filter(m => m.status === 'completed' || m.status === 'skipped');
        const nextStepIndex = O2D_PROCESS_CONFIG.findIndex(s => !completedSteps.some(cs => cs.stepId === s.id));
        const currentStep = nextStepIndex !== -1 ? O2D_PROCESS_CONFIG[nextStepIndex] : null;

        // Check if the order is ready for final acknowledgement
        const isReadyForAcknowledgement = currentStep?.id === O2D_PROCESS_CONFIG[O2D_PROCESS_CONFIG.length - 1].id;
        const isFollowUpStep = currentStep?.id === 6; // 'Balance Payment Follow Up' is step 6

        let cardBorderColor = "border-border";
        let statusTextColor = "text-primary";
        if (isReadyForAcknowledgement) {
            cardBorderColor = "border-green-500";
            statusTextColor = "text-green-500";
        } else if (currentStep) {
            const expectedDate = expectedDates[currentStep.id];
            if (isPast(expectedDate)) {
                cardBorderColor = "border-red-500";
                statusTextColor = "text-red-500";
            } else if (differenceInHours(expectedDate, new Date()) <= 24) {
                cardBorderColor = "border-orange-500";
                statusTextColor = "text-orange-500";
            }
        }

        return (
             <Collapsible key={order.id} className={cn("border-2 rounded-lg bg-card overflow-hidden transition-all", cardBorderColor)}>
                <div className="p-4">
                     <div className="flex justify-between items-start">
                        {/* Column 1: Customer Details */}
                        <div className="space-y-2 text-sm">
                            <h3 className="font-semibold text-lg">{order.customerName}</h3>
                            <p className="text-sm text-muted-foreground">ID: {order.id}</p>
                            <p className='flex items-center gap-2'><Phone className='h-4 w-4 text-muted-foreground' /> {order.customerPhone}</p>
                            <p className='flex items-center gap-2'><MapPin className='h-4 w-4 text-muted-foreground' /> {order.customerAddress}</p>
                        </div>
                        {/* Column 2: Order Status */}
                        <div className="space-y-2 text-sm text-right">
                             {isReadyForAcknowledgement && (
                                <Badge variant="default" className="bg-green-100 text-green-700 border-green-300 animate-pulse">
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    Ready to Acknowledge
                                </Badge>
                             )}
                            {order.createdAt && (
                                <p className='flex items-center justify-end gap-2'><Calendar className='h-4 w-4 text-muted-foreground' /> Order Date: {format(new Date(order.createdAt), 'dd/MM/yyyy')}</p>
                            )}
                            {currentStep && (
                                <p className={cn('flex items-center justify-end gap-2 font-medium', statusTextColor)}>
                                    <Clock className='h-4 w-4'/>
                                    Status: {currentStep.step}
                                </p>
                            )}
                            {order.remarks && (
                                <p className='flex items-start justify-end gap-2 text-muted-foreground'>
                                    <span className='italic text-right'>"{order.remarks}"</span>
                                    <MessageCircle className='h-4 w-4 mt-0.5 shrink-0' /> 
                                </p>
                            )}
                             {isFollowUpStep && (
                                <AlertDialogTrigger asChild>
                                <Button size="sm" className="mt-2" onClick={() => setFollowUpOrder(order)}>
                                    <PhoneCall className="mr-2 h-4 w-4"/>
                                    Follow Up
                                </Button>
                                </AlertDialogTrigger>
                            )}
                        </div>
                    </div>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-center mt-4">
                            <span className='mr-2'>View Process</span>
                            <ChevronDown className="h-4 w-4" />
                        </Button>
                    </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                    <div className="px-4 pb-2 border-t">
                        <Button variant="link" onClick={() => setShowAllSteps(prev => !prev)} className="text-xs">
                           {showAllSteps ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                           {showAllSteps ? 'Show Pending Steps' : 'Show All Steps'}
                        </Button>
                    </div>
                    <O2DProcessTimeline 
                        order={order} 
                        onStepUpdate={handleOpenRemarkDialog} 
                        onQuickStepUpdate={handleQuickStepUpdate}
                        onRevertStep={handleOpenRevertDialog}
                        onConfirmOrderType={() => setConfirmOrder(order)}
                        userRole={role}
                        userDesignation={user?.designation || null}
                        showAllSteps={showAllSteps}
                    />
                </CollapsibleContent>
            </Collapsible>
        )
    }

    return (
        <AlertDialog>
        <div className="space-y-4">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">O2D (Order to Delivery) Process</h1>
                    <p className="text-muted-foreground">Manage and track all orders in the pre-production phase before they are acknowledged.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button
                            variant={"outline"}
                            className={cn(
                            "w-[240px] justify-start text-left font-normal",
                            !filterDate && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {filterDate ? format(filterDate, "PPP") : <span>Filter by due date...</span>}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                        <CalendarPicker
                            mode="single"
                            selected={filterDate}
                            onSelect={setFilterDate}
                            initialFocus
                        />
                        </PopoverContent>
                    </Popover>
                    {filterDate && (
                        <Button variant="ghost" size="icon" onClick={() => setFilterDate(undefined)}>
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </header>
            
            <div className="space-y-4">
                {loading ? (
                    Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)
                ) : pendingOrders.length > 0 ? (
                    
                    pendingOrders.map(order => <OrderCard key={order.id} order={order} />)
                
                ) : (
                    <Card className="text-center p-12">
                        <CardTitle>All Caught Up!</CardTitle>
                        <CardDescription>
                            {filterDate 
                                ? `There are no orders with steps due on ${format(filterDate, "PPP")}.` 
                                : "There are no new orders in the O2D phase."}
                        </CardDescription>
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
            {confirmOrder && (
                <ConfirmOrderTypeDialog
                    isOpen={!!confirmOrder}
                    onClose={() => setConfirmOrder(null)}
                    order={confirmOrder}
                    onConfirm={handleConfirmOrderType}
                />
            )}
            {revertingStepInfo && (
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
            )}
             <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Follow-up</AlertDialogTitle>
                    <AlertDialogDescription>
                        Have you followed up with {followUpOrder?.customerName} for the balance payment? This will complete the "Balance Payment Follow Up" step in the O2D process and send the order for payment confirmation.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setFollowUpOrder(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleFollowUp}>Yes, I have</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </div>
        </AlertDialog>
    );
}
