
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Users, Clock, Banknote, ClipboardCheck, Box, ArrowRightCircle, Phone, MapPin, ChevronDown, CheckCircle, AlertTriangle } from 'lucide-react';
import { collection, onSnapshot, query, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, O2DStep, O2DStatus } from "@/lib/types";
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { addDays, addHours, addMinutes, isPast, format, formatDistanceToNow } from 'date-fns';


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

function O2DProcessTimeline({ order, onStepComplete }: { order: Order; onStepComplete: (stepId: number) => void; }) {
    
    return (
        <div className="relative pl-6 pr-4 py-4">
            <div className="absolute left-9 top-0 h-full w-0.5 bg-border -translate-x-1/2" aria-hidden="true"></div>
            <div className="space-y-4">
                {O2D_PROCESS_CONFIG.map((stepConfig, index) => {
                    const stepStatus = order.o2dMilestones?.find(s => s.stepId === stepConfig.id);
                    const prevStepStatus = index === 0 ? { completed: true, completedAt: order.createdAt } : order.o2dMilestones?.find(s => s.stepId === O2D_PROCESS_CONFIG[index-1].id);
                    
                    const canComplete = !stepStatus?.completed && prevStepStatus?.completed;
                    
                    const startDate = prevStepStatus?.completedAt ? new Date(prevStepStatus.completedAt) : new Date(order.createdAt);
                    const expectedDate = getExpectedCompletionDate(stepConfig, startDate);
                    const isOverdue = isPast(expectedDate) && !stepStatus?.completed;

                    const Icon = stepConfig.icon;
                    return (
                        <div key={index} className="relative flex items-start gap-4">
                            <div className="flex h-18 w-18 items-center justify-center shrink-0">
                                <div className={cn(
                                    "flex h-12 w-12 items-center justify-center rounded-full border-2 border-border shadow-sm",
                                    stepStatus?.completed ? "bg-green-50" : "bg-card"
                                )}>
                                     <Icon className={cn("h-6 w-6", stepStatus?.completed ? "text-green-500" : "text-muted-foreground")} />
                                </div>
                            </div>
                            <Card className={cn(
                                "w-full group hover:shadow-md transition-shadow duration-300",
                                isOverdue && !stepStatus?.completed ? "border-red-500 bg-red-50" : ""
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
                                         <div className="text-xs text-muted-foreground space-y-1">
                                             <p>Expected by: {formatTimestamp(expectedDate)}</p>
                                            {stepStatus?.completed ? (
                                                <div className="flex items-center gap-2 text-green-600 font-medium">
                                                    <CheckCircle className="h-4 w-4" />
                                                    <span>Completed by {stepStatus.completedBy} at {formatTimestamp(new Date(stepStatus.completedAt))}</span>
                                                </div>
                                            ) : (
                                                <>
                                                    {isOverdue && (
                                                        <div className="flex items-center gap-2 text-red-600 font-medium">
                                                            <AlertTriangle className="h-4 w-4" />
                                                            <span>Delayed by: {formatDistanceToNow(expectedDate, { addSuffix: false })}</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                         <Button
                                            size="sm"
                                            onClick={() => onStepComplete(stepConfig.id)}
                                            disabled={!canComplete}
                                            variant={stepStatus?.completed ? "ghost" : "default"}
                                        >
                                            {stepStatus?.completed ? "Done" : "Mark as Complete"}
                                        </Button>
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


export default function O2DPage() {
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        const q = query(collection(db, "orders"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            const pending = allOrders.filter(order => {
                const finalO2DStep = order.o2dMilestones?.find(m => m.stepId === 10);
                return !finalO2DStep?.completed;
            });
            setPendingOrders(pending);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleStepComplete = async (orderId: string, stepId: number) => {
        if (!user) {
            toast({ variant: "destructive", title: "You must be logged in." });
            return;
        }

        const newStatus: O2DStatus = {
            stepId: stepId,
            completed: true,
            completedAt: new Date().toISOString(),
            completedBy: user.name,
        };
        
        try {
            const orderRef = doc(db, "orders", orderId);
            await updateDoc(orderRef, {
                o2dMilestones: arrayUnion(newStatus)
            });

            if (stepId === 10) {
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
    };

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">O2D (Order to Delivery) Process</h1>
                <p className="text-muted-foreground">Manage and track all orders in the pre-production phase before they are acknowledged.</p>
            </header>
            
            <div className="space-y-4">
                {loading ? (
                    Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
                ) : pendingOrders.length > 0 ? (
                    pendingOrders.map(order => {
                        const lastCompletedStepId = Math.max(0, ...(order.o2dMilestones?.filter(s => s.completed).map(s => s.stepId) || []));
                        const nextStep = O2D_PROCESS_CONFIG.find(s => s.id === lastCompletedStepId + 1);
                        
                        let cardBorderColor = "border-border";
                        if (nextStep) {
                            const prevStep = O2D_PROCESS_CONFIG.find(s => s.id === lastCompletedStepId);
                            const startDate = prevStep?.id ? new Date((order.o2dMilestones?.find(m => m.stepId === prevStep.id)?.completedAt || order.createdAt)) : new Date(order.createdAt);
                            const expectedDate = getExpectedCompletionDate(nextStep, startDate);
                            if (isPast(expectedDate)) {
                                cardBorderColor = "border-red-500";
                            }
                        }

                        return (
                        <Collapsible key={order.id} className={cn("border-2 rounded-lg bg-card overflow-hidden", cardBorderColor)}>
                            <CardHeader className="flex flex-row items-center justify-between p-4">
                               <div className='flex-grow'>
                                    <h3 className="font-semibold text-lg">{order.customerName}</h3>
                                    <p className="text-sm text-muted-foreground">ID: {order.id}</p>
                                    <div className='mt-2 space-y-1 text-sm'>
                                        <p className='flex items-center gap-2'><Phone className='h-4 w-4 text-muted-foreground' /> {order.customerPhone}</p>
                                        <p className='flex items-center gap-2'><MapPin className='h-4 w-4 text-muted-foreground' /> {order.customerAddress}</p>
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
                               <O2DProcessTimeline order={order} onStepComplete={(stepId) => handleStepComplete(order.id, stepId)} />
                            </CollapsibleContent>
                        </Collapsible>
                        );
                    })
                ) : (
                    <Card className="text-center p-12">
                        <CardTitle>All Caught Up!</CardTitle>
                        <CardDescription>There are no new orders in the O2d phase.</CardDescription>
                    </Card>
                )}
            </div>
        </div>
    );
}
