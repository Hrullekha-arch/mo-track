
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Milestone, Scissors, Package, Users, Wind, Check, Scan, Ruler, Box, Tag, Award, Waves, Layers, Printer, X, GanttChartSquare, ChevronDown, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BarcodeSticker } from '@/components/features/pms/BarcodeSticker';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Order } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';

const PMS_PROCESS_CONFIG = [
    { id: 1, step: "Roll & Fabric Allocation", time: "15 min", icon: Milestone },
    { id: 2, step: "Fabric Cutting", time: "2 hr", icon: Scissors },
    { id: 3, step: "Material Full Kitting", time: "15 min", icon: Package },
    { id: 4, step: "Allocate To Tailors", time: "3 min", icon: Users },
    { id: 5, step: "Stitch panels together", time: "15 min", icon: Layers },
    { id: 6, step: "Over lock & Ironing", time: "15 min", icon: Wind },
    { id: 7, step: "Stitching Head", time: "15 min", icon: Check },
    { id: 8, step: "Sizing", time: "10 min", icon: Ruler },
    { id: 9, step: "Bottom & Pleating", time: "15 min", icon: Scan },
    { id: 10, step: "Pleating/Rings/Eyelets", time: "15 min", icon: Box },
    { id: 11, step: "Ironing", time: "5 min", icon: Waves },
    { id: 12, step: "Q&Q", time: "15 min", icon: Award },
    { id: 13, step: "Packing & Labelling", time: "8 min", icon: Tag },
];

function PmsTimeline({ 
    processConfig, 
    onFirstStepComplete, 
    onLastStepComplete, 
    orderId 
}: { 
    processConfig: typeof PMS_PROCESS_CONFIG; 
    onFirstStepComplete: () => void;
    onLastStepComplete: () => void;
    orderId: string;
}) {
    const [completedSteps, setCompletedSteps] = useState<number[]>([]);

    const toggleStep = (stepId: number) => {
        const isCompleting = !completedSteps.includes(stepId);
        let newCompletedSteps: number[];

        if (isCompleting) {
            // To complete a step, all previous steps must be complete
            const requiredSteps = Array.from({ length: stepId - 1 }, (_, i) => i + 1);
            const allPreviousCompleted = requiredSteps.every(id => completedSteps.includes(id));

            if (!allPreviousCompleted) {
                // Automatically complete all previous steps
                newCompletedSteps = [...new Set([...completedSteps, ...requiredSteps, stepId])];
            } else {
                newCompletedSteps = [...completedSteps, stepId];
            }
        } else {
            // To mark a step as incomplete, all subsequent steps must also be marked incomplete
            newCompletedSteps = completedSteps.filter(id => id < stepId);
        }
        
        setCompletedSteps(newCompletedSteps);

        if (stepId === 1 && isCompleting) {
            onFirstStepComplete();
        }
        
        if (stepId === processConfig.length && isCompleting) {
            onLastStepComplete();
        }
    };

    return (
        <div className="relative pl-6 pr-4 py-4">
            <div className="absolute left-11 top-0 h-full w-0.5 bg-border -translate-x-1/2" aria-hidden="true"></div>
            <div className="space-y-4">
                {processConfig.map((stepConfig) => {
                    const isCompleted = completedSteps.includes(stepConfig.id);
                    const Icon = stepConfig.icon;

                    return (
                        <div key={`${orderId}-${stepConfig.id}`} className="relative flex items-start gap-4">
                            <div className="flex h-14 w-14 items-center justify-center shrink-0">
                                <div className={cn(
                                    "flex h-16 w-16 items-center justify-center rounded-full border-2 border-border shadow-sm text-lg font-bold",
                                    isCompleted ? "bg-accent text-accent-foreground" : "bg-card"
                                )}>
                                    {stepConfig.id}
                                </div>
                            </div>
                            <Card className={cn("w-full group hover:shadow-md transition-shadow", isCompleted ? "bg-accent/10 border-accent" : "")}>
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-base flex items-center gap-2">
                                                <Icon className="h-5 w-5 text-primary" />
                                                {stepConfig.step}
                                            </CardTitle>
                                        </div>
                                        <div className="text-right flex-shrink-0 ml-4">
                                            <p className="font-semibold text-sm text-muted-foreground">{stepConfig.time}</p>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Button size="sm" variant={isCompleted ? "destructive" : "default"} onClick={() => toggleStep(stepConfig.id)}>
                                        {isCompleted ? "Mark as Incomplete" : "Mark as Complete"}
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function PmsPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
    const [orderForPrint, setOrderForPrint] = useState<Order | null>(null);
    const { user } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        const q = query(collection(db, "orders"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allOrdersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            
            // Filter orders for PMS: "Sent to Stitching" is done, but "Stitching Done" is not.
            const pmsOrders = allOrdersData.filter(order => {
                const sentToStitching = order.milestones.find(m => m.id === 3);
                const stitchingDone = order.milestones.find(m => m.id === 4);
                return sentToStitching?.completed && !stitchingDone?.completed;
            });

            setOrders(pmsOrders);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleFirstStepComplete = (order: Order) => {
        setOrderForPrint(order);
        setIsPrintDialogOpen(true);
    };

    const handleLastStepComplete = async (orderId: string) => {
        if (!user) {
            toast({ variant: "destructive", title: "Error", description: "You are not logged in." });
            return;
        }

        try {
            const orderRef = doc(db, "orders", orderId);
            const orderToUpdate = orders.find(o => o.id === orderId);
            if (!orderToUpdate) return;
            
            const updatedMilestones = orderToUpdate.milestones.map(m => 
                m.id === 4 // "Stitching Done" milestone
                ? { ...m, completed: true, completedAt: new Date().toISOString(), completedBy: "System (PMS)" }
                : m
            );

            await updateDoc(orderRef, { milestones: updatedMilestones });

            toast({
                title: "Production Complete!",
                description: `Order ${orderId} has been marked as 'Stitching Done' on the main dashboard.`,
            });
        } catch (error) {
             toast({
                variant: "destructive",
                title: "Update Failed",
                description: "Could not update the order's main milestone.",
            });
            console.error("Error updating main milestone:", error);
        }
    };

    const handlePrint = () => {
        const printContent = document.getElementById('barcode-sticker-print');
        if (printContent) {
            const newWindow = window.open('', '_blank', 'width=800,height=600');
            newWindow?.document.write('<html><head><title>Print Sticker</title>');
            newWindow?.document.write(`
                <style>
                    @page { size: 72.1mm 48.9mm; margin: 0; }
                    body { margin: 0; font-family: sans-serif; }
                    .sticker-container {
                        width: 72.1mm;
                        height: 48.9mm;
                        box-sizing: border-box;
                        page-break-after: always;
                    }
                </style>
            `);
            newWindow?.document.write('</head><body>');
            newWindow?.document.write(printContent.innerHTML);
            newWindow?.document.write('</body></html>');
            newWindow?.document.close();
            newWindow?.focus();
            setTimeout(() => {
                newWindow?.print();
                newWindow?.close();
            }, 250);
        }
    };

    if (loading) {
        return (
            <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-4">
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-48 w-full mt-4" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    return (
        <>
            <div className="container mx-auto p-4 md:p-6 lg:p-8">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight">Project Management System (PMS)</h1>
                    <p className="text-muted-foreground">
                        Manage all orders currently in the production and stitching workflow.
                    </p>
                </header>

                <div className="space-y-4">
                    {orders.length > 0 ? (
                        orders.map(order => (
                            <Collapsible key={order.id} className="border rounded-lg overflow-hidden">
                                <CollapsibleTrigger className="w-full p-4 bg-muted/50 hover:bg-muted/80 transition-colors flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold text-lg">{order.customerName}</p>
                                        <p className="text-sm text-muted-foreground">{order.id}</p>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        View Process
                                        <ChevronDown className="h-5 w-5" />
                                    </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <PmsTimeline 
                                        orderId={order.id}
                                        processConfig={PMS_PROCESS_CONFIG} 
                                        onFirstStepComplete={() => handleFirstStepComplete(order)}
                                        onLastStepComplete={() => handleLastStepComplete(order.id)}
                                    />
                                </CollapsibleContent>
                            </Collapsible>
                        ))
                    ) : (
                        <Card className="text-center p-12">
                            <div className="mx-auto bg-primary text-primary-foreground rounded-full p-3 w-fit mb-4">
                                <GanttChartSquare className="h-8 w-8" />
                            </div>
                            <CardTitle>No Active Production Orders</CardTitle>
                            <CardDescription>
                                When an order is marked as "Sent to Stitching" on the dashboard, it will appear here.
                            </CardDescription>
                        </Card>
                    )}
                </div>
            </div>
            
            <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
                <DialogContent className="sm:max-w-md">
                     <DialogHeader>
                        <DialogTitle>Generate Barcode Sticker</DialogTitle>
                        <DialogDescription>
                            The first step is complete. Print the barcode sticker to attach to the materials.
                        </DialogDescription>
                    </DialogHeader>
                    {orderForPrint && (
                        <div id="barcode-sticker-print" className="py-4">
                            <BarcodeSticker
                                dealId={orderForPrint.id}
                                customerName={orderForPrint.customerName}
                                orderType={orderForPrint.orderType}
                            />
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                         <Button variant="ghost" onClick={() => setIsPrintDialogOpen(false)}><X className="mr-2"/>Close</Button>
                         <Button onClick={handlePrint}><Printer className="mr-2"/>Print Sticker</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
