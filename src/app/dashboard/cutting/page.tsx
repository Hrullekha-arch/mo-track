
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { collection, onSnapshot, query, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CuttingTask, Stock } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CheckCircle, Loader2, ScanLine } from "lucide-react";
import { getStockById } from "../inventory/actions";
import Link from 'next/link';

function CuttingTaskDetail({ task, onBack, onUpdate }: { task: CuttingTask, onBack: () => void, onUpdate: (taskId: string, updatedItems: CuttingTask['items']) => void }) {
    const [loadingStock, setLoadingStock] = useState<Record<string, boolean>>({});
    const [stockDetails, setStockDetails] = useState<Record<string, Stock>>({});

    useEffect(() => {
        const fetchStockDetails = async () => {
            const newStockDetails: Record<string, Stock> = {};
            for (const item of task.items) {
                setLoadingStock(prev => ({...prev, [item.bcn]: true}));
                const stock = await getStockById(item.bcn.replace(/\//g, '-'));
                if (stock) {
                    newStockDetails[item.bcn] = stock;
                }
                setLoadingStock(prev => ({...prev, [item.bcn]: false}));
            }
            setStockDetails(newStockDetails);
        };
        fetchStockDetails();
    }, [task.items]);
    
    return (
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
                            const stock = stockDetails[item.bcn];
                            return (
                                <Card key={index} className="p-3">
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                        <div><span className="font-semibold text-xs">BCN:</span><p className="font-mono">{item.bcn}</p></div>
                                        <div><span className="font-semibold text-xs">Last Length:</span><p>{loadingStock[item.bcn] ? <Loader2 className="h-4 w-4 animate-spin"/> : (stock?.quantity.toFixed(2) || 'N/A')}</p></div>
                                        <div><span className="font-semibold text-xs">Qty to Cut:</span><p className="font-bold text-lg">{item.quantityAllocated.toFixed(2)}</p></div>
                                        <div><span className="font-semibold text-xs">Category:</span><p>{stock?.category || 'N/A'}</p></div>
                                        <div><span className="font-semibold text-xs">Rack:</span><p>{stock?.rack || 'N/A'}</p></div>
                                        <div className="flex items-end justify-end">
                                        {item.status === 'cut' ? (
                                            <div className="flex items-center gap-2 text-green-600 font-bold">
                                                <CheckCircle className="h-5 w-5"/> Cut
                                            </div>
                                        ) : (
                                            <Button asChild size="sm">
                                                <Link href={`/dashboard/cutting/scan?taskId=${task.id}&bcn=${item.bcn}`}>
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
        </div>
    )
}


export default function CuttingPage() {
    const [cuttingTasks, setCuttingTasks] = useState<CuttingTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTask, setSelectedTask] = useState<CuttingTask | null>(null);
    const { toast } = useToast();

    useEffect(() => {
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
        return () => unsubscribe();
    }, [toast]);

    const handleItemStatusUpdate = async (taskId: string, updatedItems: CuttingTask['items']) => {
        try {
            const taskRef = doc(db, 'Cutting', taskId);
            
            const allItemsCut = updatedItems.every(item => item.status === 'cut');
            const newStatus = allItemsCut ? 'Completed' : 'In Progress';

            await updateDoc(taskRef, {
                items: updatedItems,
                status: newStatus
            });
            toast({ title: "Item Cut Verified!" });
            if (newStatus === 'Completed') {
                toast({ title: "Task Complete!", description: "All items for this order have been cut." });
                setSelectedTask(null);
            }
        } catch (error) {
            console.error("Error updating item status:", error);
            toast({ variant: 'destructive', title: "Update Failed" });
        }
    };

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
                <CuttingTaskDetail task={selectedTask} onBack={() => setSelectedTask(null)} onUpdate={handleItemStatusUpdate} />
            </div>
        )
    }

    return (
        <div className="w-full p-4 md:p-6 lg:p-8">
             <Tabs defaultValue="pending">
                <header className="mb-4">
                    <h1 className="text-3xl font-bold tracking-tight">Cutting & Details</h1>
                     <TabsList className="mt-4">
                        <TabsTrigger value="pending">Pending Cutting</TabsTrigger>
                        <TabsTrigger value="history">Cutting History</TabsTrigger>
                    </TabsList>
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
                            </Card>
                        ))}
                     </div>
                 </TabsContent>
            </Tabs>
        </div>
    );
}
