
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CuttingTask } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function OrderFabricCutting() {
    const [cuttingTasks, setCuttingTasks] = useState<CuttingTask[]>([]);
    const [loading, setLoading] = useState(true);
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

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Order Fabric Cutting</CardTitle>
                <CardDescription>Items ready for cutting from generated invoices.</CardDescription>
            </CardHeader>
            <CardContent>
                {cuttingTasks.length > 0 ? (
                    <div className="space-y-4">
                        {cuttingTasks.map(task => (
                            <Card key={task.id} className="overflow-hidden">
                                <CardHeader className="p-4 bg-muted/50">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-lg">{task.customerName}</CardTitle>
                                            <CardDescription>Order: {task.orderId}</CardDescription>
                                        </div>
                                        <Badge variant={task.status === 'Completed' ? 'default' : 'secondary'} className={task.status === 'Completed' ? 'bg-green-600' : ''}>
                                            {task.status}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 space-y-3">
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <p className="font-semibold">Sales Person</p>
                                            <p className="text-muted-foreground">{task.salesPerson}</p>
                                        </div>
                                        <div>
                                            <p className="font-semibold">Phone</p>
                                            <p className="text-muted-foreground">{task.customerPhone}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="font-semibold text-sm mb-2">Items to Cut</p>
                                        <div className="border rounded-md">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Item Name</TableHead>
                                                        <TableHead className="text-right">Quantity</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {task.items.map((item, index) => (
                                                        <TableRow key={index}>
                                                            <TableCell className="font-medium">{item.itemName}</TableCell>
                                                            <TableCell className="text-right font-mono">{item.quantityAllocated.toFixed(2)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                    <div className="pt-2">
                                        <Button className="w-full">Mark as Complete</Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                     <div className="text-center py-10 text-muted-foreground">
                        No cutting tasks found.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}


export default function CuttingPage() {
    return (
        <div className="w-full p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Cutting & Details</h1>
                <p className="text-muted-foreground">Manage fabric cutting and view cutting details.</p>
            </header>

            <div className="grid gap-6 md:grid-cols-1">
                <OrderFabricCutting />
                <Card>
                    <CardHeader>
                        <CardTitle>Cutting Details</CardTitle>
                        <CardDescription>View historical cutting data and reports. (Coming Soon)</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        </div>
    );
}
