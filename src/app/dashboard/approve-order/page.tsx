

"use client";

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Order } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function ApproveOrderPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const q = query(
            collection(db, 'orders'), 
            where('status', '==', 'Pending Approval')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ordersData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Order));
            setOrders(ordersData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching pending orders: ", error);
            toast({
                variant: 'destructive',
                title: 'Error Loading Data',
                description: 'Could not fetch orders pending approval. Please check permissions.'
            });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [toast]);

    const handleApprove = async (order: Order) => {
        setUpdatingId(order.id);
        try {
            const orderRef = doc(db, 'orders', order.id);
            await updateDoc(orderRef, {
                status: 'Approved'
            });

            // Save a copy to the approvedOrders collection
            const approvedOrderRef = doc(db, 'approvedOrders', order.id);
            await setDoc(approvedOrderRef, { ...order, status: 'Approved', approvedAt: new Date().toISOString() });

            toast({
                title: 'Order Approved',
                description: `Order #${order.id} has been approved.`
            });
        } catch (error) {
            console.error('Error approving order:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to approve order.'
            });
        } finally {
            setUpdatingId(null);
        }
    };

    if (loading) {
        return (
            <div className="p-8">
                <Skeleton className="h-8 w-1/2 mb-4" />
                <Skeleton className="h-4 w-3/4 mb-8" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Approve Orders</h1>
                <p className="text-muted-foreground">Review and approve pending orders converted from quotations.</p>
            </header>
            <Card>
                <CardContent className="pt-6">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Order No</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Sales Person</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orders.length > 0 ? orders.map(order => (
                                <TableRow key={order.id}>
                                    <TableCell className="font-medium">
                                        <Button asChild variant="link" className="p-0 h-auto">
                                            <Link href={`/dashboard/orders/${order.id}`}>
                                                {order.id}
                                            </Link>
                                        </Button>
                                    </TableCell>
                                    <TableCell>{order.customerName}</TableCell>
                                    <TableCell>{order.salesPerson}</TableCell>
                                    <TableCell>{format(new Date(order.createdAt), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell><Badge variant="outline">{order.status}</Badge></TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            size="sm"
                                            onClick={() => handleApprove(order)}
                                            disabled={updatingId === order.id}
                                        >
                                            {updatingId === order.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Approve
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">No orders pending for approval.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
