
"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { collection, onSnapshot, query, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CuttingTask, Stock, StockTransaction } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CheckCircle, Loader2, ScanLine, Undo2, Printer, RefreshCw, Info } from "lucide-react";
import { getStockById } from "../inventory/actions";
import Link from 'next/link';
import { useAuth } from "@/context/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StockLengthSticker } from "@/components/features/inventory/StockLengthSticker";
import { cn } from "@/lib/utils";

function CuttingTaskDetail({ task, onBack }: { task: CuttingTask, onBack: () => void }) {
    const [loadingStock, setLoadingStock] = useState<Record<string, boolean>>({});
    const [stockDetails, setStockDetails] = useState<Record<string, { stock: Stock | null, transaction: StockTransaction | null }>>({});
    const [revertingBcn, setRevertingBcn] = useState<string | null>(null);
    const [printingItem, setPrintingItem] = useState<any>(null);

    const { toast } = useToast();
    const { role } = useAuth();
    const isAdmin = role === 'admin';

    useEffect(() => {
        const fetchStockDetails = async () => {
            const newStockDetails: Record<string, { stock: Stock | null, transaction: StockTransaction | null }> = {};
            for (const item of task.items) {
                setLoadingStock(prev => ({...prev, [item.bcn]: true}));
                const stock = await getStockById(item.bcn.replace(/\//g, '-'));
                newStockDetails[item.bcn] = { stock, transaction: null };
                setLoadingStock(prev => ({...prev, [item.bcn]: false}));
            }
            setStockDetails(newStockDetails);
        };
        fetchStockDetails();
    }, [task.items]);
    
    const handleRevertCut = async () => {
        if (!revertingBcn) return;

        try {
            const updatedItems = task.items.map(item =>
                item.bcn === revertingBcn ? { ...item, status: 'pending' } : item
            );

            let newStatus: CuttingTask['status'] = task.status;
            if (task.status === 'Completed' && updatedItems.some(i => i.status === 'pending')) {
                newStatus = 'In Progress';
            }

            const taskRef = doc(db, 'Cutting', task.id);
            await updateDoc(taskRef, {
                items: updatedItems,
                status: newStatus
            });

            toast({ title: "Cut Reverted!", description: `${revertingBcn} has been marked as pending again.` });
        } catch (error) {
            console.error("Error reverting cut:", error);
            toast({ variant: 'destructive', title: 'Revert Failed' });
        } finally {
            setRevertingBcn(null);
        }
    }
    
    const handlePrint = () => {
        const printContent = document.getElementById('sticker-print-area-cutting');
        if (!printContent) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        printWindow.document.write('<html><head><title>Print Sticker</title></head><body>');
        printWindow.document.write(printContent.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
        }, 250);
    };


    return (
         <AlertDialog>
            <div>
                <Button variant="ghost" onClick={onBack} className="mb-4">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Pending List
                </Button>
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle>Order {task.orderId}</CardTitle>
                                <CardDescription>{task.customerName} - {task.customerPhone}</CardDescription>
                            </div>
                            <Badge variant={task.status === 'Completed' ? 'default' : 'secondary'} className={task.status === 'Completed' ? 'bg-green-600' : ''}>
                                {task.status}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">Sales Person: {task.salesPerson}</p>
                        <h3 className="font-semibold pt-4 border-t">List of Items to Cut</h3>
                        <div className="space-y-3">
                            {task.items.map((item, index) => {
                                const stockData = stockDetails[item.bcn];
                                const stock = stockData?.stock;
                                const originalLength = item.originalLength;
                                return (
                                    <Card key={index} className="p-3">
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            <div><span className="font-semibold text-xs">BCN:</span><p className="font-mono">{item.bcn}</p></div>
                                            <div>
                                                <span className="font-semibold text-xs">Length from which this is Allocated:</span>
                                                <p>{loadingStock[item.bcn] ? <Loader2 className="h-4 w-4 animate-spin"/> : (originalLength?.toFixed(2) || 'N/A')}</p>
                                            </div>
                                            <div><span className="font-semibold text-xs">Qty to Cut:</span><p className="font-bold text-lg">{item.quantityAllocated.toFixed(2)}</p></div>
                                            <div><span className="font-semibold text-xs">Category:</span><p>{stock?.category || 'N/A'}</p></div>
                                            <div><span className="font-semibold text-xs">Rack:</span><p>{stock?.rack || 'N/A'}</p></div>
                                            <div className="col-span-2 flex items-center justify-end gap-2">
                                                <Button variant="outline" size="sm" onClick={() => setPrintingItem({stock, item})}>
                                                    <Printer className="mr-2 h-4 w-4"/>
                                                    Print Sticker
                                                </Button>
                                                {item.status === 'cut' ? (
                                                    <>
                                                        <div className="flex items-center gap-2 text-green-600 font-bold">
                                                            <CheckCircle className="h-5 w-5"/> Verified
                                                        </div>
                                                        {isAdmin && (
                                                            <AlertDialogTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setRevertingBcn(item.bcn)}>
                                                                    <Undo2 className="h-4 w-4" />
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                        )}
                                                    </>
                                                ) : (
                                                    <Button asChild size="sm">
                                                        <Link href={`/scan?action=verifyCut&taskId=${task.id}&bcn=${item.bcn}&originalLength=${item.originalLength}`}>
                                                            <ScanLine className="mr-2 h-4 w-4" />
                                                            Scan to Verify Cut
                                                        </Link>
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
                 <Dialog open={!!printingItem} onOpenChange={() => setPrintingItem(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Print Sticker</DialogTitle>
                            <DialogDescription>
                                Sticker for {printingItem?.item.bcn} with length {printingItem?.item.quantityAllocated.toFixed(2)}.
                            </DialogDescription>
                        </DialogHeader>
                        {printingItem && (
                             <div id="sticker-print-area-cutting" className="py-4 flex justify-center">
                                <StockLengthSticker 
                                    bcn={printingItem.item.bcn}
                                    length={printingItem.item.quantityAllocated}
                                    mrp={printingItem.stock?.mrp || 0}
                                    rack={printingItem.stock?.rack || 'N/A'}
                                />
                            </div>
                        )}
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setPrintingItem(null)}>Cancel</Button>
                            <Button onClick={handlePrint}>Print</Button>
                        </DialogFooter>
                    </DialogContent>
                 </Dialog>
            </div>
             <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action will revert the cut status for item <strong>{revertingBcn}</strong>. This should only be done if a mistake was made during verification.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setRevertingBcn(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRevertCut}>Revert Cut</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}


export default function CuttingPage() {
    const [cuttingTasks, setCuttingTasks] = useState<CuttingTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTask, setSelectedTask] = useState<CuttingTask | null>(null);
    const { toast } = useToast();
    const [refreshKey, setRefreshKey] = useState(0);

    const refreshData = useCallback(() => {
        setLoading(true);
        const q = query(collection(db, "Cutting"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CuttingTask));
            setCuttingTasks(tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching cutting tasks:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch cutting tasks.' });
            setLoading(false);
        });
        return unsubscribe;
    }, [toast]);

    useEffect(() => {
        const unsubscribe = refreshData();
        return () => unsubscribe();
    }, [refreshKey, refreshData]);


    if (loading) {
        return (
            <div className="w-full p-4 md:p-6 lg:p-8 space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }
    
    if (selectedTask) {
        return (
            <div className="w-full p-4 md:p-6 lg:p-8">
                <CuttingTaskDetail task={selectedTask} onBack={() => setSelectedTask(null)} />
            </div>
        )
    }

    return (
        <div className="w-full p-4 md:p-6 lg:p-8">
             <Tabs defaultValue="pending">
                <header className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Cutting & Details</h1>
                        <TabsList className="mt-4">
                            <TabsTrigger value="pending">Pending Cutting</TabsTrigger>
                            <TabsTrigger value="history">Cutting History</TabsTrigger>
                        </TabsList>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                         <Button variant="outline" onClick={() => setRefreshKey(k => k + 1)} disabled={loading}>
                            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                            Refresh
                        </Button>
                        <Button asChild>
                            <Link href="/scan?action=stockDetail">
                                <Info className="mr-2 h-4 w-4" />
                                Details
                            </Link>
                        </Button>
                    </div>
                </header>
                <TabsContent value="pending">
                     <div className="space-y-4">
                        {cuttingTasks.filter(t => t.status !== 'Completed').map(task => (
                            <Card key={task.id} className="overflow-hidden">
                                <CardHeader className="p-4 bg-muted/50">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><span className="font-semibold text-xs">Order ID:</span><p>{task.orderId}</p></div>
                                        <div><span className="font-semibold text-xs">Customer Name:</span><p>{task.customerName}</p></div>
                                        <div><span className="font-semibold text-xs">Contact Number:</span><p>{task.customerPhone}</p></div>
                                        <div><span className="font-semibold text-xs">Salesman:</span><p>{task.salesPerson}</p></div>
                                        <div><span className="font-semibold text-xs">No Of Items:</span><p>{task.items.length}</p></div>
                                        <div><span className="font-semibold text-xs">Status:</span>
                                            <Badge variant={task.status === 'Completed' ? 'default' : 'secondary'} className={task.status === 'Completed' ? 'bg-green-600' : ''}>
                                                {task.status}
                                            </Badge>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4">
                                    <Button className="w-full" onClick={() => setSelectedTask(task)}>Cut</Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
                 <TabsContent value="history">
                     <div className="space-y-4">
                         {cuttingTasks.filter(t => t.status === 'Completed').map(task => (
                            <Card key={task.id} className="overflow-hidden bg-green-50 border-green-200">
                                <CardHeader className="p-4">
                                     <div className="grid grid-cols-2 gap-4">
                                        <div><span className="font-semibold text-xs">Order ID:</span><p>{task.orderId}</p></div>
                                        <div><span className="font-semibold text-xs">Customer Name:</span><p>{task.customerName}</p></div>
                                    </div>
                                </CardHeader>
                                 <CardContent className="p-4">
                                    <Button className="w-full" variant="secondary" onClick={() => setSelectedTask(task)}>View Details</Button>
                                </CardContent>
                            </Card>
                        ))}
                     </div>
                 </TabsContent>
            </Tabs>
        </div>
    );
}
