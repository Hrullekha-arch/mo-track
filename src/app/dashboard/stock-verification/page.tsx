

"use client";

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ApprovedStockItem } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { markAsInStockAction, createPurchaseRequestFromOutOfStockAction } from './actions';
import { format } from 'date-fns';

export default function StockVerificationPage() {
    const [items, setItems] = useState<ApprovedStockItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        setLoading(true);
        const q = query(
            collection(db, 'approvedStock'),
            where('status', '==', 'Pending Stock Verification')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ApprovedStockItem));
            setItems(data);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching stock verification items:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not load items for verification." });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [toast]);

    const handleMarkInStock = async (item: ApprovedStockItem) => {
        setUpdatingId(item.id);
        try {
            const result = await markAsInStockAction(item.id, item.orderId, item.fabricName);
            if (result.success) {
                toast({ title: 'Success', description: `${item.fabricName} marked as 'In Stock'.` });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setUpdatingId(null);
        }
    };

    const handleCreatePr = async (item: ApprovedStockItem) => {
        if (!item.dealId) {
            toast({ variant: 'destructive', title: 'Error', description: "Cannot create PR: Deal ID is missing."});
            return;
        }
        setUpdatingId(item.id);
        try {
            const result = await createPurchaseRequestFromOutOfStockAction({
                approvedStockId: item.id,
                orderId: item.orderId,
                crmOrderNo: item.crmOrderNo,
                dealId: item.dealId,
                fabricName: item.fabricName,
                quantity: item.quantity,
                customerName: item.customerName,
                salesPerson: item.salesPerson,
                itemDetail: item.itemDetail,
                createdBy: item.createdBy,
            });

            if (result.success) {
                toast({ title: 'Success', description: `Purchase Request created for ${item.fabricName}.` });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setUpdatingId(null);
        }
    };

    return (
        <div className="p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Stock Verification</h1>
                <p className="text-muted-foreground">Verify stock availability for newly approved order items.</p>
            </header>
            <Card>
                <CardContent className="pt-6">
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Order No</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Item Name (BCN)</TableHead>
                                    <TableHead>Qty</TableHead>
                                    <TableHead>Created At</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                                        </TableCell>
                                    </TableRow>
                                ) : items.length > 0 ? (
                                    items.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.crmOrderNo}</TableCell>
                                            <TableCell>{item.customerName}</TableCell>
                                            <TableCell>{item.fabricName}</TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell>{format(new Date(item.createdAt), 'dd/MM/yyyy')}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex gap-2 justify-end">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleMarkInStock(item)}
                                                        disabled={updatingId === item.id}
                                                    >
                                                        {updatingId === item.id ? <Loader2 className="h-4 w-4 animate-spin"/> : 'In Stock'}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleCreatePr(item)}
                                                        disabled={updatingId === item.id}
                                                    >
                                                         {updatingId === item.id ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Out of Stock'}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            No items pending for stock verification.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
