

"use client";

import { useState, useEffect, use, useMemo } from 'react';
import { doc, onSnapshot, updateDoc, collection, getDoc, query, where, getDocs, limit, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, FabricDetail, FurnitureDetail, Stock, StockTransaction, PurchaseRequest, InvoiceBatch, Invoice } from "@/lib/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, User, Phone, MapPin, Tag, CheckCircle2, Calendar, ShoppingBag, Loader2, PlusCircle, Trash2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from 'next/link';
import { Separator } from "@/components/ui/separator";
import { MilestoneProgress } from '@/components/features/order-management/MilestoneProgress';
import { useAuth } from '@/context/AuthContext';
import { useToast } from "@/hooks/use-toast";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { getStockById, getStockTransactions } from '@/app/dashboard/inventory/actions';
import { allocateStockToAction, getAvailableStockLengths, getOrderAllocations } from './actions';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useForm, useFieldArray, FormProvider } from "react-hook-form";
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  applyOrderMilestoneChange,
  getNormalizedOrderMilestones,
} from '@/lib/order-workflow';


type OrderItem = (FabricDetail | FurnitureDetail) & { type: 'Fabric' | 'Furniture' };

type AllocationLabelItem = {
    bcn: string;
    itemName: string;
    qty: number;
    unit: string;
};

const parseQtyValue = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeItemKey = (value: unknown) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

const formatLabelQty = (qty: number) => {
    if (!Number.isFinite(qty)) return "0";
    return qty.toFixed(2).replace(/\.?0+$/, "");
};

const escapeHtml = (value: unknown) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const getAllocatedItemsForLabels = (order: Order): AllocationLabelItem[] => {
    const itemsByKey = new Map<string, AllocationLabelItem>();

    const normalItems = order.sections?.NORMAL?.items || [];
    normalItems.forEach((item: any) => {
        const bcn = String(item?.bcn || "").trim();
        const itemName = String(item?.description || item?.itemName || bcn || "").trim();
        const lengths = Array.isArray(item?.allocation?.lengths) ? item.allocation.lengths : [];
        const lots = Array.isArray(item?.allocation?.lots) ? item.allocation.lots : [];
        const allocatedQty = [...lengths, ...lots].reduce(
            (sum: number, entry: any) => sum + parseQtyValue(entry?.allocatedQty),
            0
        );
        if (allocatedQty <= 0) return;

        const key = normalizeItemKey(bcn || itemName);
        if (!key) return;

        const existing = itemsByKey.get(key);
        if (existing) {
            existing.qty += allocatedQty;
            return;
        }

        itemsByKey.set(key, {
            bcn: bcn || itemName.split(" - ")[0] || "N/A",
            itemName: itemName || bcn || "N/A",
            qty: allocatedQty,
            unit: String(item?.unit || "Mtr"),
        });
    });

    if (itemsByKey.size > 0) {
        return Array.from(itemsByKey.values());
    }

    (order.fabricDetails || []).forEach((fabricItem: any) => {
        if (String(fabricItem?.status || "").toLowerCase() !== "allocated") return;
        const rawName = String(fabricItem?.fabricName || "").trim();
        if (!rawName) return;
        const bcn = rawName.split(" - ")[0]?.trim() || rawName;
        const key = normalizeItemKey(bcn);
        const qty = parseQtyValue(fabricItem?.quantity);
        if (!key || qty <= 0) return;

        const existing = itemsByKey.get(key);
        if (existing) {
            existing.qty += qty;
            return;
        }

        itemsByKey.set(key, {
            bcn,
            itemName: rawName,
            qty,
            unit: "Mtr",
        });
    });

    return Array.from(itemsByKey.values());
};

const allocationSchema = z.object({
  allocations: z.array(z.object({
    lengthId: z.string(),
    quantity: z.number().positive("Quantity must be a positive number."),
  })).min(1, "You must select at least one roll to allocate from.")
});

type AllocationFormValues = z.infer<typeof allocationSchema>;


function AllocateDialog({
    item,
    stock,
    orderId,
    onAllocationSuccess,
    invoiceRequired,
}: {
    item: OrderItem,
    stock: Stock,
    orderId: string,
    onAllocationSuccess: () => void,
    invoiceRequired: boolean,
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [availableLengths, setAvailableLengths] = useState<{ length: number; transactionId: string; }[]>([]);
    const [loadingLengths, setLoadingLengths] = useState(false);

    const { toast } = useToast();
    const { user } = useAuth();
    
    const requiredQty = parseFloat((item as any).quantity || '0');
    
    const form = useForm<AllocationFormValues>({
        resolver: zodResolver(allocationSchema),
        defaultValues: {
            allocations: [],
        }
    });
    
    const { control, handleSubmit, watch } = form;
    const { fields, append, remove } = useFieldArray({
        control,
        name: "allocations"
    });
    
    const watchedAllocations = watch("allocations");
    const totalAllocated = useMemo(() => {
        return watchedAllocations.reduce((sum, alloc) => sum + (Number(alloc.quantity) || 0), 0);
    }, [watchedAllocations]);


    useEffect(() => {
        if (isOpen) {
            const fetchLengths = async () => {
                setLoadingLengths(true);
                const result = await getAvailableStockLengths(stock.id);
                if (result.success && result.lengths) {
                    setAvailableLengths(result.lengths);
                } else {
                    toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch available stock rolls.' });
                }
                setLoadingLengths(false);
            };
            fetchLengths();
        } else {
            // Reset form when dialog closes
            form.reset({ allocations: [] });
        }
    }, [isOpen, stock.id, toast, form]);

    const handleCheckboxChange = (checked: boolean, lengthId: string, availableLength: number) => {
        const existingIndex = fields.findIndex(f => f.lengthId === lengthId);

        if (checked) {
            if (existingIndex === -1) {
                const currentTotal = form.getValues('allocations').reduce((sum, alloc) => sum + (Number(alloc.quantity) || 0), 0);
                const remainingNeeded = requiredQty - currentTotal;
                const quantityToAllocate = Math.max(0, Math.min(availableLength, remainingNeeded));
                
                append({ lengthId, quantity: quantityToAllocate });
            }
        } else {
            if (existingIndex > -1) {
                remove(existingIndex);
            }
        }
    };

    const onSubmit = async (data: AllocationFormValues) => {
        if (!user) return toast({ variant: 'destructive', title: 'Not authenticated'});

        if (Math.abs(totalAllocated - requiredQty) > 0.01) { // Using a tolerance for float comparison
             toast({ variant: 'destructive', title: 'Quantity Mismatch', description: `You must allocate exactly ${requiredQty}. You have allocated ${totalAllocated}.` });
             return;
        }
        const isConfirmed = window.confirm(
            `Reserve ${totalAllocated.toFixed(2)} units from selected rolls? This can be reversed only before ${invoiceRequired ? "invoicing" : "dispatch"}.`
        );
        if (!isConfirmed) return;

        setIsSubmitting(true);
        try {
            const itemRate = Number((item as any).rate);
            const allocationRate = Number.isFinite(itemRate)
                ? itemRate
                : (stock.rrpWithGstRs ?? stock.mrp ?? 0);
            const result = await allocateStockToAction({
                orderId,
                stockId: stock.id,
                bcn: stock.bcn,
                allocations: data.allocations,
                itemName: stock.name || stock.itemName || stock.bcn,
                rate: allocationRate,
                userId: user.id,
                userName: user.name,
            });

            if (result.success) {
                toast({
                    title: 'Allocation Successful!',
                    description: invoiceRequired
                        ? 'Stock has been reserved and sent for invoicing.'
                        : 'Stock has been reserved and marked ready for delivery.',
                });
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
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">Allocate</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Allocate Stock</DialogTitle>
                    <DialogDescription>
                        Reserve stock for <strong>{stock.bcn}</strong>. Required: {requiredQty.toFixed(2)}
                    </DialogDescription>
                </DialogHeader>
                <FormProvider {...form}>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-2">
                             <Label>Available Rolls/Lengths</Label>
                              {loadingLengths ? <Loader2 className="animate-spin" /> :
                                availableLengths.length > 0 ? (
                                    <div className="max-h-48 overflow-y-auto space-y-2 p-2 border rounded-md">
                                    {availableLengths.map((len, index) => (
                                        <div key={len.transactionId} className="flex items-center gap-4 p-2 rounded-md bg-muted/50">
                                            <Checkbox 
                                                id={`check-${len.transactionId}`}
                                                checked={fields.some(f => f.lengthId === len.transactionId)}
                                                onCheckedChange={(checked) => handleCheckboxChange(!!checked, len.transactionId, len.length)}
                                            />
                                            <Label htmlFor={`check-${len.transactionId}`} className="flex-grow">
                                                Roll with {len.length.toFixed(2)} available
                                            </Label>
                                            {fields.some(f => f.lengthId === len.transactionId) && (
                                                <FormField 
                                                    control={control}
                                                    name={`allocations.${fields.findIndex(f => f.lengthId === len.transactionId)}.quantity`}
                                                    render={({ field }) => (
                                                        <Input 
                                                            type="number" 
                                                            className="w-24 h-8"
                                                            step="0.01"
                                                            max={len.length}
                                                            {...field}
                                                            onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                                        />
                                                    )}
                                                />
                                            )}
                                        </div>
                                    ))}
                                    </div>
                                ) : <p className="text-xs text-muted-foreground">No specific rolls available.</p>
                            }
                        </div>

                         <div className="p-3 bg-muted rounded-md text-sm">
                            <div className="flex justify-between">
                                <span>Required:</span>
                                <span className="font-bold">{requiredQty.toFixed(2)}</span>
                            </div>
                             <div className="flex justify-between">
                                <span>Allocated:</span>
                                <span className="font-bold">{totalAllocated.toFixed(2)}</span>
                            </div>
                            <Separator className="my-2"/>
                            <div className="flex justify-between font-bold">
                                <span>Remaining:</span>
                                <span className={totalAllocated > requiredQty ? 'text-destructive' : 'text-green-600'}>
                                    {(requiredQty - totalAllocated).toFixed(2)}
                                </span>
                            </div>
                        </div>

                        <DialogFooter className="pt-4">
                            <Button type="submit" disabled={isSubmitting || Math.abs(totalAllocated - requiredQty) > 0.01}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Reserve Stock
                            </Button>
                        </DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    )
}

function OrderItemRow({ item, index, order, orderId, orderCrmNo, onAllocationSuccess, refreshKey }: { 
    item: OrderItem, 
    index: number, 
    order: Order, 
    orderId: string, 
    orderCrmNo: string, 
    onAllocationSuccess: () => void, 
    refreshKey: number 
}) {
    const [stockInfo, setStockInfo] = useState<Stock | null>(null);
    const [loading, setLoading] = useState(true);
    const [allocatedQty, setAllocatedQty] = useState(0);
    const [status, setStatus] = useState<{ 
        text: string; 
        variant: 'default' | 'secondary' | 'destructive' | 'outline', 
        poNumber?: string, 
        tallyBillNo?: string 
    }>({ text: 'Loading...', variant: 'secondary' });

    const isOrderApproved = order.status === 'Approved';
    const invoiceRequired = order.invoicing?.invoiceRequired !== false;
    const [currentBcnimsQty, setCurrentBcnimsQty] = useState<{ qty: number; date: string | null } | null>(null); // ✅ fixed type
    const [imsSearching, setImsSearching] = useState(false);

    const name = (item as any).fabricName || (item as any).furnitureName;
    const unit = item.type === 'Fabric' ? 'Mtr' : '';

    // ── Fetch stock & order data ─────────────────────────────────────────────
    useEffect(() => {
        const fetchItemData = async () => {
            setLoading(true);
            const itemName = (item as any).fabricName || (item as any).furnitureName;
            const bcn = itemName.split(' - ')[0];

            if (!bcn) {
                setLoading(false);
                setStatus({ text: 'Invalid Item', variant: 'destructive' });
                return;
            }

            const stockId = bcn.replace(/\//g, '-');
            const stockPromise = getStockById(stockId);
            
            const stockRef = doc(db, 'stocks', stockId);
            const lengthsCollectionRef = collection(stockRef, 'lengths');
            const lengthsSnapshotPromise = getDocs(lengthsCollectionRef);

            const prQuery = query(collection(db, 'purchaseRequests'), where("dealId", "==", orderCrmNo));
            const poPromise = getDocs(prQuery);
            
            const invoiceQuery = query(collection(db, 'invoices'), where('orderId', '==', orderId));
            const invoicePromise = getDocs(invoiceQuery);

            const [stock, lengthsSnapshot, poSnaps, invoiceSnaps] = await Promise.all([
                stockPromise,
                lengthsSnapshotPromise,
                poPromise,
                invoicePromise
            ]);

            const sumAvailableFromLengths = lengthsSnapshot.docs.reduce((sum, docSnap) => {
                const data = docSnap.data() as any;
                const available = Number(data?.availableLength ?? data?.availableQty ?? 0);
                return sum + (Number.isFinite(available) ? available : 0);
            }, 0);

            const sumReservedFromLengths = lengthsSnapshot.docs.reduce((sum, docSnap) => {
                const data = docSnap.data() as any;
                const reserved = Number(data?.reservedQty);
                if (Number.isFinite(reserved)) return sum + reserved;
                const original = Number(data?.originalLength ?? data?.quantity ?? 0);
                const available = Number(data?.availableLength ?? data?.availableQty ?? 0);
                const derived = original - available;
                return sum + (derived > 0 ? derived : 0);
            }, 0);

            const stockAvailable = Number(stock?.availableQty);
            const stockReserved = Number(stock?.reservedQty);

            const resolvedStock = stock ? {
                ...stock,
                availableQty: Number.isFinite(stockAvailable) && stockAvailable >= 0
                    ? stockAvailable
                    : sumAvailableFromLengths,
                reservedQty: Number.isFinite(stockReserved) && stockReserved >= 0
                    ? stockReserved
                    : sumReservedFromLengths,
            } : stock;

            setStockInfo(resolvedStock);
            
            let totalReservedForOrder = 0;
            for (const lengthDoc of lengthsSnapshot.docs) {
                const reservationsQuery = query(
                    collection(lengthDoc.ref, 'reservedQty'), 
                    where('orderId', '==', orderId)
                );
                const reservationsSnapshot = await getDocs(reservationsQuery);
                reservationsSnapshot.forEach(reservationDoc => {
                    totalReservedForOrder += reservationDoc.data().reservedQty || 0;
                });
            }
            setAllocatedQty(totalReservedForOrder);

            const requiredQty = parseFloat((item as any).quantity || '0');
            const matchedInvoice = invoiceSnaps.docs.find(d => {
                const invoice = d.data() as Invoice;
                const invoiceItems = invoice.sections?.NORMAL?.items || invoice.items || [];
                return invoiceItems.some((invItem: any) => invItem.bcn === bcn);
            });

            const availableQty = Number.isFinite(Number(resolvedStock?.availableQty))
                ? Number(resolvedStock?.availableQty)
                : 0;

            if (matchedInvoice) {
                setStatus({ 
                    text: `Invoice Generated: ${matchedInvoice.data().tallyVoucherNo || ''}`, 
                    variant: 'default', 
                    tallyBillNo: matchedInvoice.data().tallyVoucherNo 
                });
            } else if (totalReservedForOrder >= requiredQty) {
                setStatus({
                    text: invoiceRequired ? 'Pending for Invoice' : 'Ready for Delivery',
                    variant: invoiceRequired ? 'outline' : 'default',
                });
            } else if (availableQty >= (requiredQty - totalReservedForOrder)) {
                setStatus({ text: 'In Stock', variant: 'default' });
            } else {
                let poFound = false;
                for (const poDoc of poSnaps.docs) {
                    const poData = poDoc.data() as PurchaseRequest;
                    const poItem = poData.fabricDetails?.find(pi => pi.fabricName === itemName);
                    if (poItem?.poNumber) {
                        setStatus({ text: 'PO Generated', variant: 'outline', poNumber: poItem.poNumber });
                        poFound = true;
                        break;
                    }
                }
                if (!poFound) setStatus({ text: 'Pending for PO', variant: 'destructive' });
            }

            setLoading(false);
        };

        fetchItemData();
    }, [item, orderId, orderCrmNo, refreshKey, invoiceRequired]);

    // ── Fetch IMS qty once stockInfo is ready ────────────────────────────────
    useEffect(() => {
        if (!loading && (stockInfo?.bcn || name)) {
            handleBcnQtysearchfromIMS(stockInfo?.bcn || name); // ✅ triggers after stockInfo loads
        }
    }, [loading, stockInfo?.bcn]); // ✅ waits for loading to finish

    // ── IMS fetch function ───────────────────────────────────────────────────
    const handleBcnQtysearchfromIMS = async (bcn: string): Promise<number | null> => {
        const normalizedBcn = String(bcn || "").trim();
        if (!normalizedBcn) return null;

        try {
            setImsSearching(true);
            const queryParams = new URLSearchParams({ bcn: normalizedBcn });
            const response = await fetch(`/api/ims-sheet?${queryParams.toString()}`, {
                method: "GET",
                cache: "no-store",
            });

            if (!response.ok) {
                console.warn(`IMS fetch failed for BCN "${normalizedBcn}" status ${response.status}`);
                setCurrentBcnimsQty(null);
                return null;
            }

            const payload = await response.json();
            console.log(`IMS response for BCN ${normalizedBcn}:`, payload);

            const imsQty = typeof payload?.qty === "number" && Number.isFinite(payload.qty)
                ? payload.qty
                : null;

            if (imsQty !== null) {
                setCurrentBcnimsQty({ qty: imsQty, date: payload.date ?? null }); // ✅ correct shape
                return imsQty;
            } else {
                setCurrentBcnimsQty(null);
                return null;
            }
        } catch (error) {
            console.error("Error fetching IMS quantity:", error);
            setCurrentBcnimsQty(null);
            return null;
        } finally {
            setImsSearching(false); // ✅ always runs
        }
    };

    return (
        <TableRow>
            <TableCell>{index + 1}</TableCell>

            {/* Item Name */}
            <TableCell>
                <p className="font-mono">{stockInfo?.bcn || name}</p>
                <p className="text-xs text-muted-foreground">{stockInfo?.name || stockInfo?.itemName}</p>
            </TableCell>

            {/* Supplier Code */}
            <TableCell>{stockInfo?.supplierCollectionCode || 'N/A'}</TableCell>

            {/* Required Qty */}
            <TableCell>{(item as any).quantity} {unit}</TableCell>

            {/* IMS Stock ✅ fixed — no more onLoad */}
                <TableCell>
                    {imsSearching ? (
                        <div className="flex items-center gap-1.5">
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Fetching...</span>
                        </div>
                    ) : currentBcnimsQty?.qty != null ? (
                        // ✅ Found
                        <div className="flex flex-col gap-0.5">
                            <span className="font-mono font-semibold text-sm">
                                {currentBcnimsQty.qty.toFixed(2)}
                                <span className="text-xs font-normal text-muted-foreground ml-1">Mtr</span>
                            </span>
                            {currentBcnimsQty.date && (
                                <span className="text-[10px] text-muted-foreground">{currentBcnimsQty.date}</span>
                            )}
                        </div>
                    ) : (
                        // ❌ Not found in IMS
                        <div className="flex items-center gap-1">
                            <span className="inline-flex items-center rounded-md border border-dashed border-gray-300 bg-gray-50 px-2 py-0.5 text-xs text-gray-400">
                                Not in IMS
                            </span>
                        </div>
                    )}
                </TableCell>

            {/* Allocated Qty */}
            <TableCell>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    allocatedQty > 0 ? (
                        <span className="font-semibold text-green-600">{allocatedQty.toFixed(2)}</span>
                    ) : isOrderApproved && stockInfo ? (
                        <AllocateDialog
                            item={item}
                            stock={stockInfo}
                            orderId={orderId}
                            onAllocationSuccess={onAllocationSuccess}
                            invoiceRequired={invoiceRequired}
                        />
                    ) : (
                        <Badge variant="outline">{order.status || 'Pending'}</Badge>
                    )
                )}
            </TableCell>

            {/* Status */}
            <TableCell>
                {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Badge 
                        variant={status.variant} 
                        className={status.text.includes('Invoice Generated') ? 'bg-green-600' : ''}
                    >
                        {status.text} {status.poNumber && `: ${status.poNumber}`}
                    </Badge>
                )}
            </TableCell>
        </TableRow>
    );
}


function AllocateOrderTable({ order, onAllocationSuccess, refreshKey }: { order: Order, onAllocationSuccess: () => void, refreshKey: number }) {
    const { toast } = useToast();
    const [isPrintingLabels, setIsPrintingLabels] = useState(false);
    
    const aggregatedItems = useMemo(() => {
        const allItems: OrderItem[] = [
            ...(order.fabricDetails || []).map(d => ({ ...d, type: 'Fabric' as const })),
            ...(order.furnitureDetails || []).map(d => ({ ...d, type: 'Furniture' as const }))
        ];

        const itemMap = new Map<string, OrderItem & { quantity: string }>();

        for (const item of allItems) {
            const bcn = (item as any).fabricName || (item as any).furnitureName;
            if (!bcn) continue;

            if (itemMap.has(bcn)) {
                const existing = itemMap.get(bcn)!;
                existing.quantity = (parseFloat(existing.quantity) + parseFloat((item as any).quantity)).toString();
            } else {
                itemMap.set(bcn, { ...item });
            }
        }
        return Array.from(itemMap.values());
    }, [order]);

    const allocatedItemsForLabels = useMemo(() => getAllocatedItemsForLabels(order), [order]);

    const handlePrintAllocationLabels = async () => {
        if (!allocatedItemsForLabels.length) {
            toast({
                variant: "destructive",
                title: "No allocated items",
                description: "Allocate at least one item before printing allocation labels.",
            });
            return;
        }

        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            toast({
                variant: "destructive",
                title: "Popup blocked",
                description: "Allow popups for this site to print labels.",
            });
            return;
        }

        try {
            setIsPrintingLabels(true);
            const customerName = escapeHtml(order.customerName || order.customerSnapshot?.name || "-");
            const phone = escapeHtml(order.customerPhone || order.customerSnapshot?.phone || "-");
            const salesman = escapeHtml(order.salesPerson || "-");
            const logoUrl = `${window.location.origin}/logo.png`;

            const stockMetaByBcn = new Map<string, { collectionName?: string; collectionCode?: string }>();
            const uniqueBcns = Array.from(
                new Set(allocatedItemsForLabels.map((item) => String(item.bcn || "").trim()).filter(Boolean))
            );

            await Promise.all(
                uniqueBcns.map(async (bcn) => {
                    const stockId = bcn.replace(/\//g, "-");
                    const stock = await getStockById(stockId);
                    if (!stock) return;
                    const key = normalizeItemKey(stock.bcn || bcn);
                    stockMetaByBcn.set(key, {
                        collectionName: String((stock as any).supplierCollectionName || "").trim(),
                        collectionCode: String((stock as any).supplierCollectionCode || "").trim(),
                    });
                })
            );

            const labelsHtml = allocatedItemsForLabels
                .map((item, index) => {
                    const bcn = escapeHtml(item.bcn);
                    const stockMeta = stockMetaByBcn.get(normalizeItemKey(item.bcn));
                    const fabricNameValue = escapeHtml(
                        `${stockMeta?.collectionName || item.itemName || "N/A"} | ${stockMeta?.collectionCode || item.bcn || "N/A"}`
                    );
                    const qtyText = `${formatLabelQty(item.qty)} ${escapeHtml(item.unit || "Mtr")}`;
                    const itemCounter = `${index + 1}/${allocatedItemsForLabels.length}`;
                    return `
                        <article class="label">
                            <div class="label-head">
                                <div class="brand">
                                    <img src="${logoUrl}" alt="MO Track" />
                                </div>
                                <div class="label-counter">Item ${itemCounter}</div>
                            </div>
                            <div class="label-body">
                                <div class="line"><span class="k">Customer Name</span><span class="v">${customerName}</span></div>
                                <div class="line"><span class="k">Phone Number</span><span class="v">${phone}</span></div>
                                <div class="line"><span class="k">Salesman Name</span><span class="v">${salesman}</span></div>
                                <div class="line line-item"><span class="k">Fabric Name</span><span class="v">${fabricNameValue}</span></div>
                                <div class="line line-qty"><span class="k">Qty</span><span class="v qty-value">${qtyText}</span></div>
                            </div>
                            <div class="label-foot">${bcn}</div>
                        </article>
                    `;
                })
                .join("");

            const html = `
                <!doctype html>
                <html>
                    <head>
                        <meta charset="utf-8" />
                        <title>Allocation Labels</title>
                        <style>
                            * { box-sizing: border-box; }
                            body {
                                margin: 0;
                                padding: 0.12in;
                                background: #fff;
                                font-family: "Poppins", "Segoe UI", Arial, sans-serif;
                                color: #111;
                                -webkit-print-color-adjust: exact;
                                print-color-adjust: exact;
                            }
                            .sheet {
                                display: flex;
                                flex-wrap: wrap;
                                gap: 0.08in;
                                align-items: flex-start;
                            }
                            .label {
                                width: 3in;
                                height: 2in;
                                border: 2px solid #0f374d;
                                border-radius: 14px;
                                background: linear-gradient(180deg, #f7fbff 0%, #ffffff 100%);
                                padding: 0.08in 0.11in 0.06in;
                                display: grid;
                                grid-template-rows: auto 1fr auto;
                                gap: 0.05in;
                                break-inside: avoid;
                                page-break-inside: avoid;
                                overflow: hidden;
                            }
                            .label-head {
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                gap: 0.08in;
                            }
                            .brand {
                                height: 0.34in;
                                width: 0.9in;
                                display: flex;
                                align-items: center;
                            }
                            .brand img {
                                max-width: 100%;
                                max-height: 100%;
                                object-fit: contain;
                            }
                            .label-counter {
                                font-size: 11px;
                                font-weight: 700;
                                color: #12384c;
                                letter-spacing: 0.2px;
                            }
                            .label-body {
                                display: grid;
                                gap: 0.02in;
                                align-content: start;
                                font-size: 11px;
                                line-height: 1.15;
                            }
                            .line {
                                display: flex;
                                justify-content: space-between;
                                gap: 0.08in;
                                min-width: 0;
                                border-bottom: 1px dashed rgba(15, 55, 77, 0.18);
                                padding-bottom: 1px;
                            }
                            .line .k {
                                flex: 0 0 40%;
                                font-weight: 600;
                                color: #284758;
                            }
                            .line .v {
                                flex: 1;
                                overflow: hidden;
                                white-space: nowrap;
                                text-overflow: ellipsis;
                                text-align: right;
                                color: #101317;
                            }
                            .line-item .v {
                                font-weight: 600;
                            }
                            .line-qty {
                                border-bottom: 0;
                                padding-bottom: 0;
                            }
                            .qty-value {
                                font-weight: 600;
                                color: #0f374d;
                            }
                            .label-foot {
                                text-align: center;
                                font-size: 17px;
                                font-weight: 700;
                                letter-spacing: 0.7px;
                                color: #0c3145;
                                border-top: 1px solid rgba(15, 55, 77, 0.3);
                                padding-top: 0.03in;
                            }
                            @page {
                                size: auto;
                                margin: 0.1in;
                            }
                            @media print {
                                body {
                                    margin: 0;
                                    padding: 0.08in;
                                }
                            }
                        </style>
                    </head>
                    <body>
                        <section class="sheet">
                            ${labelsHtml}
                        </section>
                    </body>
                </html>
            `;

            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();

            const runPrint = () => {
                printWindow.focus();
                printWindow.print();
                setTimeout(() => printWindow.close(), 200);
            };

            if (printWindow.document.readyState === "complete") {
                setTimeout(runPrint, 600);
            } else {
                printWindow.onload = () => setTimeout(runPrint, 700);
            }
        } catch (error: any) {
            console.error("Failed to generate allocation labels:", error);
            toast({
                variant: "destructive",
                title: "Print failed",
                description: error?.message || "Could not prepare allocation labels.",
            });
            printWindow.close();
        } finally {
            setIsPrintingLabels(false);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <CardTitle>Allocate Order</CardTitle>
                    <CardDescription>List of items in this order.</CardDescription>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => {
                        void handlePrintAllocationLabels();
                    }}
                    disabled={!allocatedItemsForLabels.length || isPrintingLabels}
                >
                    {isPrintingLabels ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                    {isPrintingLabels ? "Preparing..." : "Print Allocation Label"}
                </Button>
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
                                <TableHead>IMS Stock</TableHead>
                                <TableHead>Allocated Qty</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {aggregatedItems.length > 0 ? aggregatedItems.map((item, index) => (
                                <OrderItemRow key={(item as any).fabricName || index} item={item} index={index} order={order} orderId={order.id} orderCrmNo={order.crmOrderNo} onAllocationSuccess={onAllocationSuccess} refreshKey={refreshKey} />
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

function VasDetailsTable({ order }: { order: Order }) {
    const vasItems = useMemo(() => {
        if (order.sections?.VAS?.items?.length) {
            return order.sections.VAS.items;
        }
        return (order.vasDetails || []).map((vas: any) => ({
            description: vas.vasName,
            qty: Number(vas.quantity) || 0,
            rate: Number(vas.rate) || 0,
            gst: Number(vas.gstPercent) || 0,
            hsn: vas.hsnCode || "",
            unit: "PCS",
            roomName: vas.room || "",
        }));
    }, [order]);

    if (!vasItems.length) return null;
    return (
        <Card>
            <CardHeader>
                <CardTitle>VAS Details</CardTitle>
                <CardDescription>Value-added services for this order.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Qty</TableHead>
                                <TableHead>Rate</TableHead>
                                <TableHead>GST %</TableHead>
                                <TableHead>Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {vasItems.map((item: any, index: number) => {
                                const qty = Number(item.qty ?? item.quantity ?? 0);
                                const rate = Number(item.rate ?? 0);
                                const gst = Number(item.gst ?? item.gstPercent ?? 0);
                                const taxable = qty * rate;
                                const gstAmount = taxable * (gst / 100);
                                const total = taxable + gstAmount;
                                return (
                                    <TableRow key={`${item.description || item.vasName || "vas"}-${index}`}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell>{item.description || item.vasName}</TableCell>
                                        <TableCell>{`${qty} ${item.unit || "PCS"}`}</TableCell>
                                        <TableCell>₹{rate.toFixed(2)}</TableCell>
                                        <TableCell>{gst.toFixed(1)}%</TableCell>
                                        <TableCell>₹{total.toFixed(2)}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

export default function OrderDetailPage({ params: paramsPromise }: { params: Promise<{ orderId: string }> }) {
    const params = use(paramsPromise);
    const { orderId } = params;
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const { user, role } = useAuth();
    const { toast } = useToast();
    const normalizedMilestones = useMemo(
      () => (order ? getNormalizedOrderMilestones(order) : []),
      [order]
    );

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
          const { milestones, workflow } = applyOrderMilestoneChange(
            order,
            milestoneId,
            completed,
            { id: user?.id, name: user?.name }
          );
          const updatePayload: any = { milestones, workflow };
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
                                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Status: </span><span className="font-medium">{normalizedMilestones.slice().reverse().find(m => m.completed)?.name || "Order Received"}</span></div></div>
                                <div className="flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Order Type: </span><span className="font-medium capitalize">{order.orderType.replace('+', ' + ')}</span></div></div>
                            </div>
                        </CardContent>
                    </Card>

                    <AllocateOrderTable order={order} onAllocationSuccess={handleAllocationSuccess} refreshKey={refreshKey} />
                    <VasDetailsTable order={order} />

                </div>

                <div className="lg:col-span-1">
                     <Card>
                        <CardHeader>
                            <CardTitle>Milestone Progress</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <MilestoneProgress milestones={normalizedMilestones} onMilestoneChange={canEditMilestones ? handleMilestoneChange : undefined} role={role} />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
