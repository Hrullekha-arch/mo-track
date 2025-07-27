
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, Check, Scan, Ruler, Box, Tag, Award, Waves, Printer, X, GanttChartSquare, ChevronDown, Barcode, Package, Wind, Users, Scissors, Milestone, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BarcodeSticker } from '@/components/features/pms/BarcodeSticker';
import { collection, doc, onSnapshot, query, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Order, PmsStatus } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { PMS_PROCESS_CONFIG } from '@/components/features/pms/pms-constants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


function PmsTimeline({ 
    order,
    onBarcodeView
}: { 
    order: Order;
    onBarcodeView: () => void;
}) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [updatingStepId, setUpdatingStepId] = useState<number | null>(null);

    const completedSteps = (order.pmsMilestones || []).map(m => m.stepId);

    const toggleStep = async (stepId: number) => {
        if (!user) return toast({ variant: "destructive", title: "Not authenticated" });
        setUpdatingStepId(stepId);

        const orderRef = doc(db, "orders", order.id);
        const isCompleting = !completedSteps.includes(stepId);
        
        // Ensure pmsMilestones exists before trying to modify it
        const currentPmsMilestones = order.pmsMilestones || [];

        try {
            if (isCompleting) {
                const stepsToComplete: PmsStatus[] = [];
                // Automatically complete all previous steps
                for (let i = 1; i <= stepId; i++) {
                    if (!completedSteps.includes(i)) {
                        stepsToComplete.push({
                            stepId: i,
                            status: 'completed',
                            completedAt: new Date().toISOString(),
                            completedBy: user.name,
                        });
                    }
                }
                await updateDoc(orderRef, { pmsMilestones: arrayUnion(...stepsToComplete) });
                toast({ title: `Step ${stepId} and all previous steps marked as complete.`});

                if (stepId === PMS_PROCESS_CONFIG.length) {
                    await handleLastStepComplete(order.id);
                }
            } else {
                // To mark a step as incomplete, all subsequent steps must also be marked incomplete
                const milestonesToRemove = currentPmsMilestones.filter(m => m.stepId >= stepId);
                await updateDoc(orderRef, { pmsMilestones: arrayRemove(...milestonesToRemove) });
                toast({ title: `Step ${stepId} and all subsequent steps reverted.`});
            }
        } catch (error) {
            console.error("Error updating PMS status:", error);
            toast({ variant: "destructive", title: "Update Failed", description: "Could not update PMS status."});
        } finally {
            setUpdatingStepId(null);
        }
    };

    const handleLastStepComplete = async (orderId: string) => {
        if (!user) return;
        try {
            const orderRef = doc(db, "orders", orderId);
            const updatedMilestones = order.milestones.map(m => 
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


    return (
        <div className="relative pl-6 pr-4 py-4">
            <div className="absolute left-11 top-0 h-full w-0.5 bg-border -translate-x-1/2" aria-hidden="true"></div>
            <div className="space-y-4">
                {PMS_PROCESS_CONFIG.map((stepConfig) => {
                    const isCompleted = completedSteps.includes(stepConfig.id);
                    const Icon = stepConfig.icon;

                    return (
                        <div key={`${order.id}-${stepConfig.id}`} className="relative flex items-start gap-4">
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
                                <CardContent className="flex items-center gap-2">
                                    <Button size="sm" variant={isCompleted ? "destructive" : "default"} onClick={() => toggleStep(stepConfig.id)} disabled={updatingStepId === stepConfig.id}>
                                        {isCompleted ? "Mark as Incomplete" : "Mark as Complete"}
                                    </Button>
                                    {stepConfig.id === 1 && (
                                         <Button size="sm" variant="outline" onClick={onBarcodeView}>
                                            <Barcode className="mr-2 h-4 w-4" />
                                            View Barcode
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

const OrderList = ({ orders, onBarcodeView }: { orders: Order[], onBarcodeView: (order: Order) => void }) => {
    if (orders.length === 0) {
        return (
            <Card className="text-center p-12">
                <div className="mx-auto bg-primary text-primary-foreground rounded-full p-3 w-fit mb-4">
                    <GanttChartSquare className="h-8 w-8" />
                </div>
                <CardTitle>No Orders Found</CardTitle>
                <CardDescription>
                    There are no orders in this category.
                </CardDescription>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {orders.map(order => {
                const isStitchingComplete = !!order.milestones.find(m => m.id === 4)?.completed;

                return (
                    <Collapsible key={order.id} className="border rounded-lg overflow-hidden">
                        <CollapsibleTrigger className="w-full p-4 bg-muted/50 hover:bg-muted/80 transition-colors flex justify-between items-center">
                            <div>
                                <p className="font-semibold text-lg">{order.customerName}</p>
                                <p className="text-sm text-muted-foreground">{order.id}</p>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                                {isStitchingComplete ? (
                                    <span className="font-semibold flex items-center gap-2 text-green-600">
                                        <CheckCircle className="h-5 w-5" />
                                        Complete
                                    </span>
                                ) : (
                                    <span className="font-semibold flex items-center gap-2 text-blue-600">
                                        <Layers className="h-5 w-5" />
                                        Pending
                                    </span>
                                )}
                                <span className="text-muted-foreground">View Process</span>
                                <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <PmsTimeline 
                                order={order}
                                onBarcodeView={() => onBarcodeView(order)}
                            />
                        </CollapsibleContent>
                    </Collapsible>
                );
            })}
        </div>
    );
};

export default function PmsPage() {
    const [allPmsOrders, setAllPmsOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
    const [orderForPrint, setOrderForPrint] = useState<Order | null>(null);

    useEffect(() => {
        const q = query(collection(db, "orders"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allOrdersData = snapshot.docs.map(doc => {
                const data = doc.data() as Omit<Order, 'id'>;
                return { id: doc.id, ...data, pmsMilestones: data.pmsMilestones || [] } as Order;
            });
            
            // Filter orders for PMS: "Sent to Stitching" is done.
            const pmsOrders = allOrdersData.filter(order => {
                const sentToStitching = order.milestones.find(m => m.id === 3);
                return sentToStitching?.completed;
            });

            setAllPmsOrders(pmsOrders);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const activeStitchingOrders = useMemo(() => {
        return allPmsOrders.filter(order => {
            const stitchingDone = order.milestones.find(m => m.id === 4);
            return !stitchingDone?.completed;
        });
    }, [allPmsOrders]);

    const handleBarcodeView = (order: Order) => {
        setOrderForPrint(order);
        setIsPrintDialogOpen(true);
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
                <Skeleton className="h-10 w-full mt-4" />
                <Skeleton className="h-48 w-full" />
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

                <Tabs defaultValue="active" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="active">Active Stitching</TabsTrigger>
                        <TabsTrigger value="all">All Stitching</TabsTrigger>
                    </TabsList>
                    <TabsContent value="active" className="pt-6">
                       <OrderList orders={activeStitchingOrders} onBarcodeView={handleBarcodeView} />
                    </TabsContent>
                    <TabsContent value="all" className="pt-6">
                        <OrderList orders={allPmsOrders} onBarcodeView={handleBarcodeView} />
                    </TabsContent>
                </Tabs>
            </div>
            
            <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
                <DialogContent className="sm:max-w-md">
                     <DialogHeader>
                        <DialogTitle>Generate Barcode Sticker</DialogTitle>
                        <DialogDescription>
                            Print the barcode sticker to attach to the materials.
                        </DialogDescription>
                    </DialogHeader>
                    {orderForPrint && (
                        <div id="barcode-sticker-print" className="py-4">
                            <BarcodeSticker
                                dealId={orderForPrint.crmOrderNo}
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
