

"use client";

import { useState, useEffect, use } from 'react';
import { doc, onSnapshot, updateDoc, collection, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, FabricDetail, FurnitureDetail, Stock, StockTransaction, PurchaseRequest } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, User, Phone, MapPin, Tag, CheckCircle2, Calendar, ShoppingBag, Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { MilestoneProgress } from '@/components/features/order-management/MilestoneProgress';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { getStockById, getStockTransactions } from '@/app/dashboard/inventory/actions';
import { allocateStockToAction, getAvailableStockLengths, getOrderAllocations } from './actions';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form } from '@/components/ui/form';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';


type OrderItem = (FabricDetail | FurnitureDetail) & { type: 'Fabric' | 'Furniture' };

const allocationSchema = z.object({
    selectedLengths: z.array(z.object({
        length: z.number(),
        transactionId: z.string(),
    })).min(1, "Please select at least one length to allocate."),
});

type AllocationFormValues = z.infer<typeof allocationSchema>;


function AllocateDialog({ item, stock, orderId, onAllocationSuccess }: { item: OrderItem, stock: Stock, orderId: string, onAllocationSuccess: () => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [availableLengths, setAvailableLengths] = useState<{ length: number; transactionId: string }[]>([]);
    const [loadingLengths, setLoadingLengths] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const { user } = useAuth();
    
    const form = useForm<AllocationFormValues>({
        resolver: zodResolver(allocationSchema),
        defaultValues: {
            selectedLengths: [],
        }
    });
    
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "selectedLengths"
    });

    const itemRequiredQty = parseFloat((item as any).quantity || '0');
    const selectedTotal = form.watch('selectedLengths').reduce((acc, curr) => acc + curr.length, 0);


    useEffect(() => {
        if (isOpen) {
            const fetchLengths = async () => {
                setLoadingLengths(true);
                const result = await getAvailableStockLengths(stock.id);
                if (result.success && result.lengths) {
                    setAvailableLengths(result.lengths);
                } else {
                    toast({ variant: 'destructive', title: 'Error', description: result.message });
                }
                setLoadingLengths(false);
            };
            fetchLengths();
        }
    }, [isOpen, stock.id, toast]);
    
    const handleCheckboxChange = (checked: boolean, length: number, transactionId: string) => {
        const selectedIndex = fields.findIndex(f => f.transactionId === transactionId && f.length === length);
        
        if (checked) {
            if (selectedIndex === -1) {
                const currentTotal = form.getValues('selectedLengths').reduce((acc, curr) => acc + curr.length, 0);
                if (currentTotal + length > itemRequiredQty) {
                    toast({
                        variant: 'destructive',
                        title: 'Allocation Limit Exceeded',
                        description: `You cannot allocate more than the required quantity of ${itemRequiredQty.toFixed(2)}.`,
                    });
                    // This is a visual correction. The actual form state is not changed, so the box remains unchecked.
                    const checkbox = document.getElementById(`len-${transactionId}-${length}`) as HTMLInputElement;
                    if (checkbox) checkbox.checked = false;
                    return;
                }
                append({ length, transactionId });
            }
        } else {
            if (selectedIndex !== -1) {
                remove(selectedIndex);
            }
        }
    };
    
    const onSubmit = async (data: AllocationFormValues) => {
        if (!user) return toast({ variant: 'destructive', title: 'Not authenticated'});
        setIsSubmitting(true);
        try {
            const result = await allocateStockToAction({
                orderId,
                stockId: stock.id,
                itemName: (item as any).fabricName || (item as any).furnitureName,
                allocatedLengths: data.selectedLengths,
                userId: user.id,
                userName: user.name,
            });

            if (result.success) {
                toast({ title: 'Allocation Successful!', description: 'Stock has been allocated to this order.' });
                onAllocationSuccess();
                setIsOpen(false);
            } else {
                toast({ variant: 'destructive', title: 'Allocation Failed', description: result.message });
            }
        } catch (error: any) {
             toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) {
                form.reset(); // Reset form when closing
            }
        }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">Allocate</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Allocate Stock</DialogTitle>
                    <DialogDescription>
                        Allocate available lengths for <strong>{stock.bcn}</strong>. Required: {itemRequiredQty.toFixed(2)}
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    {loadingLengths ? (
                        <div className="flex justify-center items-center h-24">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : (
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)}>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                     {availableLengths.length > 0 ? availableLengths.map((l, i) => (
                                         <div key={`${l.transactionId}-${i}`} className="flex items-center gap-4 p-2 border rounded-md">
                                             <Checkbox 
                                                id={`len-${l.transactionId}-${l.length}`}
                                                onCheckedChange={(checked) => handleCheckboxChange(!!checked, l.length, l.transactionId)}
                                                checked={fields.some(f => f.transactionId === l.transactionId && f.length === l.length)}
                                             />
                                             <Label htmlFor={`len-${l.transactionId}-${l.length}`} className="flex-grow">
                                                Length: <span className="font-mono font-bold">{l.length.toFixed(2)}</span>
                                             </Label>
                                         </div>
                                     )) : (
                                        <p className="text-sm text-muted-foreground text-center">No available lengths found for this item.</p>
                                     )}
                                </div>
                                <div className="font-semibold text-sm mt-4 text-right">
                                    Selected Total: {selectedTotal.toFixed(2)} / {itemRequiredQty.toFixed(2)}
                                </div>
                                <DialogFooter className="pt-4">
                                     <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button type="button" disabled={isSubmitting || selectedTotal > itemRequiredQty}>
                                                 {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                Allocate
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will permanently allocate {selectedTotal.toFixed(2)} units from stock to this order. This action cannot be easily undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={form.handleSubmit(onSubmit)}>Continue</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </DialogFooter>
                            </form>
                        </Form>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

function OrderItemRow({ item, index, orderId, orderCrmNo, onAllocationSuccess }: { item: OrderItem, index: number, orderId: string, orderCrmNo: string, onAllocationSuccess: () => void }) {
    const [stockInfo, setStockInfo] = useState<Stock | null>(null);
    const [loading, setLoading] = useState(true);
    const [allocatedQty, setAllocatedQty] = useState(0);
    const [status, setStatus] = useState<{ text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline', poNumber?: string }>({ text: 'Loading...', variant: 'secondary' });


    useEffect(() => {
        const fetchItemData = async () => {
            setLoading(true);
            const itemName = (item as any).fabricName || (item as any).furnitureName;
            if (itemName) {
                const stockId = itemName.replace(/\//g, '-');
                const stock = await getStockById(stockId);
                setStockInfo(stock);
                
                const allocations = await getOrderAllocations(orderId);
                const itemAllocations = allocations.filter(a => a.itemName === itemName);
                const totalAllocated = itemAllocations.reduce((sum, alloc) => sum + alloc.quantityAllocated, 0);
                setAllocatedQty(totalAllocated);
                
                const requiredQty = parseFloat((item as any).quantity || '0');
                if (totalAllocated >= requiredQty) {
                    setStatus({ text: 'Allocated', variant: 'default' });
                } else if ((stock?.quantity || 0) >= (requiredQty - totalAllocated)) {
                    setStatus({ text: 'In Stock', variant: 'default' });
                } else {
                    const poRef = doc(db, 'purchaseRequests', orderCrmNo);
                    const poSnap = await getDoc(poRef);
                    if (poSnap.exists()) {
                        const poData = poSnap.data() as PurchaseRequest;
                        const poItem = (poData.fabricDetails || []).find(pi => pi.fabricName === itemName);
                        
                        if (poItem?.poNumber) {
                             setStatus({ text: 'PO Generated', variant: 'outline', poNumber: poItem.poNumber });
                        } else {
                             setStatus({ text: 'Pending for PO', variant: 'destructive' });
                        }
                    } else {
                        setStatus({ text: 'Pending for PO', variant: 'destructive' });
                    }
                }
            }
            setLoading(false);
        };
        fetchItemData();
    }, [item, orderId, onAllocationSuccess, orderCrmNo]);

    const name = (item as any).fabricName || (item as any).furnitureName;
    const unit = item.type === 'Fabric' ? 'Mtr' : '';

    return (
        <TableRow>
            <TableCell>{index + 1}</TableCell>
            <TableCell>
                <p className="font-mono">{stockInfo?.bcn || name}</p>
                <p className="text-xs text-muted-foreground">{stockInfo?.itemName}</p>
            </TableCell>
            <TableCell>{stockInfo?.serialNo || 'N/A'}</TableCell>
            <TableCell>{item.quantity} {unit}</TableCell>
            <TableCell>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (stockInfo?.quantity ?? 'N/A')}
            </TableCell>
            <TableCell>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    allocatedQty > 0 ? (
                        <span className="font-semibold text-green-600">{allocatedQty.toFixed(2)}</span>
                    ) : (
                        stockInfo && <AllocateDialog item={item} stock={stockInfo} orderId={orderId} onAllocationSuccess={onAllocationSuccess} />
                    )
                )}
            </TableCell>
            <TableCell>
                 {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 
                 <Badge variant={status.variant}>
                    {status.text}
                    {status.poNumber && `: ${status.poNumber}`}
                 </Badge>
                }
            </TableCell>
        </TableRow>
    );
}


function AllocateOrderTable({ order, onAllocationSuccess }: { order: Order, onAllocationSuccess: () => void }) {
    const items: OrderItem[] = [
        ...(order.fabricDetails || []).map(d => ({ ...d, type: 'Fabric' as const })),
        ...(order.furnitureDetails || []).map(d => ({ ...d, type: 'Furniture' as const }))
    ];

    return (
        <Card>
            <CardHeader>
                <CardTitle>Allocate Order</CardTitle>
                <CardDescription>List of items in this order.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>BCN/Item Name</TableHead>
                                <TableHead>Serial No</TableHead>
                                <TableHead>Qty</TableHead>
                                <TableHead>Stock</TableHead>
                                <TableHead>Allocated Qty</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.length > 0 ? items.map((item, index) => (
                                <OrderItemRow key={index} item={item} index={index} orderId={order.id} orderCrmNo={order.crmOrderNo} onAllocationSuccess={onAllocationSuccess} />
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">No items found in this order.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}

export default function OrderDetailPage({ params }: { params: { orderId: string } }) {
    const { orderId } = params;
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const { user, role } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        const docRef = doc(db, "orders", orderId);
        const unsubscribe = onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                setOrder({ id: doc.id, ...doc.data() } as Order);
            } else {
                setOrder(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [orderId, refreshKey]);
    
    const canEditMilestones = (role === 'admin' || role === 'employee');

    const handleMilestoneChange = async (milestoneId: number, completed: boolean) => {
        if (!order) return;
        if (!canEditMilestones) {
            toast({ variant: "destructive", title: "Permission Denied", description: "You are not authorized to change milestones." });
            return;
        }

        try {
          const orderRef = doc(db, "orders", order.id);
          let updatedMilestones = order.milestones.map(m =>
            m.id === milestoneId ? { ...m, completed, completedAt: completed ? new Date().toISOString() : null, completedBy: completed ? user?.name : null, location: null } : m
          );
          
          if (!completed) {
              const milestoneIndex = updatedMilestones.findIndex(m => m.id === milestoneId);
              if (milestoneIndex !== -1) {
                  for (let i = milestoneIndex + 1; i < updatedMilestones.length; i++) {
                      updatedMilestones[i] = { ...updatedMilestones[i], completed: false, completedAt: null, completedBy: null, location: null };
                  }
              }
          }

          const updatePayload: any = { milestones: updatedMilestones };
          await updateDoc(orderRef, updatePayload);
          toast({ title: "Milestone updated!" });
        } catch (error) {
          console.error("Error updating milestone: ", error);
          toast({ variant: "destructive", title: "Failed to update milestone." });
        }
    };
    
    const handleAllocationSuccess = () => {
        setRefreshKey(prev => prev + 1); // Trigger a re-fetch of order data
    }


    if (loading) {
        return (
            <div className="p-4 md:p-6 lg:p-8 space-y-4">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }
    
    if (!order) {
        return (
             <div className="p-4 md:p-6 lg:p-8 text-center">
                <h1 className="text-2xl font-bold">Order not found</h1>
                <p className="text-muted-foreground">The order with ID {orderId} could not be found.</p>
                <Button asChild variant="link" className="mt-4">
                    <Link href="/dashboard/orders">Go Back</Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="p-4 md:p-6 lg:p-8">
            <div className="flex items-center gap-4 mb-4">
                <Button asChild variant="outline" size="icon">
                    <Link href="/dashboard/orders"><ArrowLeft /></Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Order Details</h1>
                    <p className="text-muted-foreground">Viewing details for order: {order.id}</p>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Customer & Order Info</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Customer: </span><span className="font-medium">{order.customerName}</span></div></div>
                                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Phone: </span><span className="font-medium">{order.customerPhone}</span></div></div>
                                <div className="flex items-center gap-2 col-span-full"><MapPin className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Address: </span><span className="font-medium">{order.customerAddress}</span></div></div>
                                <Separator className="col-span-full" />
                                <div className="flex items-center gap-2"><Tag className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Sales Person: </span><span className="font-medium">{order.salesPerson}</span></div></div>
                                <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Created: </span><span className="font-medium">{new Date(order.createdAt).toLocaleDateString()}</span></div></div>
                                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Status: </span><span className="font-medium">{order.milestones.slice().reverse().find(m => m.completed)?.name || "Order Received"}</span></div></div>
                                <div className="flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Order Type: </span><span className="font-medium capitalize">{order.orderType.replace('+', ' + ')}</span></div></div>
                            </div>
                        </CardContent>
                    </Card>

                    <AllocateOrderTable order={order} onAllocationSuccess={handleAllocationSuccess} />

                </div>

                <div className="lg:col-span-1">
                     <Card>
                        <CardHeader>
                            <CardTitle>Milestone Progress</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <MilestoneProgress milestones={order.milestones} onMilestoneChange={canEditMilestones ? handleMilestoneChange : undefined} role={role} />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

