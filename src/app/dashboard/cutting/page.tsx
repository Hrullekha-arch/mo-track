
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

function OrderFabricCuttingTable() {
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
        return <Skeleton className="h-64 w-full" />;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Order Fabric Cutting</CardTitle>
                <CardDescription>Items ready for cutting from generated invoices.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Order No</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Sales Person</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {cuttingTasks.length > 0 ? cuttingTasks.map(task => (
                            <TableRow key={task.id}>
                                <TableCell className="font-mono">{task.orderId}</TableCell>
                                <TableCell>
                                    <div className="font-medium">{task.customerName}</div>
                                    <div className="text-sm text-muted-foreground">{task.customerPhone}</div>
                                </TableCell>
                                <TableCell>{task.salesPerson}</TableCell>
                                <TableCell>
                                    <ul className="list-disc list-inside">
                                        {task.items.map((item, index) => (
                                            <li key={index} className="text-xs">
                                                {item.itemName} ({item.quantityAllocated.toFixed(2)})
                                            </li>
                                        ))}
                                    </ul>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={task.status === 'Completed' ? 'default' : 'secondary'}>{task.status}</Badge>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center h-24">
                                    No cutting tasks found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}


export default function CuttingPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Cutting & Details</h1>
                <p className="text-muted-foreground">Manage fabric cutting and view cutting details.</p>
            </header>

            <div className="grid gap-6 md:grid-cols-1">
                <OrderFabricCuttingTable />
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
