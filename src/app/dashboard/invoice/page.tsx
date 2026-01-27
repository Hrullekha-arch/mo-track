

"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  RowSelectionState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronRight, Loader2, FileText, Printer, PlusCircle, Search, X, CalendarIcon, Code, CheckCircle, XCircle, Combine } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { collection, onSnapshot, query, getDocs, doc, updateDoc, writeBatch, addDoc, where, orderBy, limit, FieldValue, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { InvoiceBatch, Order, Invoice, CuttingTask, Stock, StockTransaction } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintableInvoice, PrintableInvoicePayload } from "@/components/features/invoice/PrintableInvoice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { InvoiceLogTable } from "@/components/features/invoice/InvoiceLogTable";
import { sendInvoiceToTally, getFirestoreStockQuantity, getStockFromTally } from "@/services/tally";
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StockMismatchDialog } from "@/components/features/invoice/StockMismatchDialog";
import { combineInvoiceBatchesAction, fetchGSTFromQuotationAction } from "./actions";


interface MismatchItem {
  itemName: string;
  crmQty: number;
  tallyQty: number;
  requiredQty?: number;
  errorType: 'mismatch' | 'insufficient';
  difference: number;
}

const normalizeBcn = (value?: string) => {
  return (value || '').split(' - ')[0].trim();
};

const toNumber = (value: unknown, fallback: number) => {
  const num = typeof value === 'number' ? value : Number(value);
  const result = Number.isFinite(num) ? num : fallback;
  return result;
};

const resolveItemPricing = (order: Order | undefined, item: InvoiceBatch['items'][number]) => {
  const normalizedBcn = normalizeBcn(item.bcn);
  
  const matchedFabric = order?.fabricDetails?.find(f => normalizeBcn(f.fabricName) === normalizedBcn);
  
  const orderItems = (order as { items?: Array<{ collectionBrand?: string; rate?: number; discountPercent?: number }> })?.items || [];
  
  const matchedOrderItem = orderItems.find(i => normalizeBcn(i.collectionBrand) === normalizedBcn);
  
  const rate = toNumber(matchedFabric?.rate ?? matchedOrderItem?.rate, item.rate ?? 0);
  const discountPercent = toNumber(matchedFabric?.discountPercent ?? matchedOrderItem?.discountPercent, item.discountPercent ?? 0);
  
  return { rate, discountPercent };
};
 
function GenerateInvoiceDialog({
  isOpen,
  onClose,
  batches,
  orders,
  creator,
}: {
  isOpen: boolean;
  onClose: () => void;
  batches: InvoiceBatch[];
  orders: Order[];
  creator: { id: string, name: string } | null;
}) {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isStockMismatchOpen, setIsStockMismatchOpen] = React.useState(false);
  const [mismatchedItems, setMismatchedItems] = React.useState<MismatchItem[]>([]);
  const [generatedInvoice, setGeneratedInvoice] = React.useState<Invoice | null>(null);
  const [tallySyncResult, setTallySyncResult] = React.useState<{ success: boolean; message: string; voucherNumber?: string; } | null>(null);
  const [payload, setPayload] = React.useState<PrintableInvoicePayload | null>(null);

  const { toast } = useToast();

  React.useEffect(() => {
    console.log('📦 [GenerateInvoiceDialog useEffect] ========== START ==========');
    console.log('📦 [GenerateInvoiceDialog useEffect] Triggered. Batches:', batches.length, 'Orders:', orders.length);

    if (!isOpen || batches.length === 0 || orders.length === 0) {
        console.log('📦 [GenerateInvoiceDialog useEffect] Not ready. isOpen:', isOpen, 'Batches:', batches.length, 'Orders:', orders.length);
        setPayload(null);
        console.log('📦 [GenerateInvoiceDialog useEffect] Payload set to null.');
        console.log('📦 [GenerateInvoiceDialog useEffect] ========== END ==========');
        return;
    }

    const buildPayload = async () => {
        console.log('🚀 [buildPayload] Building invoice payload...');
        const primaryOrder = orders[0];
        console.log('🚀 [buildPayload] Primary Order:', primaryOrder?.id);

        const isVas = batches[0].isVas === true;
        console.log('🚀 [buildPayload] Is VAS Invoice:', isVas);

        console.log('🚀 [buildPayload] Fetching GST data...');
        const gstData = isVas 
          ? { cgstPercent: 9, sgstPercent: 9, igstPercent: 0, totalGstPercent: 18, source: 'default' as const } 
          : await fetchGSTFromQuotationAction(primaryOrder.id);
        console.log('🚀 [buildPayload] GST Data:', gstData);

        const ordersById = new Map(orders.map(order => [order.id, order]));
        console.log('🚀 [buildPayload] Created orders map:', ordersById.size, 'entries');

        const normalizedItems = batches.flatMap(b => b.items.map(item => {
            const order = ordersById.get(b.orderId);
            const pricing = resolveItemPricing(order, item);
            return { ...item, rate: pricing.rate, discountPercent: pricing.discountPercent };
        }));
        console.log('🚀 [buildPayload] Normalized Items:', normalizedItems);

        const consolidatedItems = normalizedItems.reduce((acc, item) => {
            const bcn = normalizeBcn(item.bcn);
            if (!acc[bcn]) {
                acc[bcn] = {
                    name: item.itemName,
                    bcn: item.bcn,
                    hsn: "N/A", // This needs to come from somewhere, maybe stock lookup later
                    quantity: 0,
                    uom: 'Mtr',
                    rate: item.rate,
                    discountPercent: item.discountPercent,
                    taxableAmount: 0,
                    cgst: 0,
                    sgst: 0,
                    igst: 0,
                    total: 0,
                };
            }
            acc[bcn].quantity += item.quantityAllocated;
            return acc;
        }, {} as Record<string, PrintableInvoicePayload['items'][number]>);
        console.log('🚀 [buildPayload] Consolidated Items (pre-calc):', consolidatedItems);


        const calculatedItems = Object.values(consolidatedItems).map(item => {
            const amount = item.rate * item.quantity;
            const discountAmount = (item.discountPercent || 0) * amount / 100;
            const taxableValue = amount - discountAmount;
            
            const cgst = taxableValue * (gstData.cgstPercent / 100);
            const sgst = taxableValue * (gstData.sgstPercent / 100);
            const igst = taxableValue * (gstData.igstPercent / 100);
            const total = taxableValue + cgst + sgst + igst;

            return { ...item, taxableAmount: taxableValue, cgst, sgst, igst, total };
        });
        console.log('🚀 [buildPayload] Calculated Items:', calculatedItems);
        
        const totals = calculatedItems.reduce((acc, item) => {
            const amount = item.rate * item.quantity;
            const discount = (item.discountPercent || 0) * amount / 100;
            acc.subTotal += amount;
            acc.discount += discount;
            acc.taxableValue += item.taxableAmount;
            acc.cgst += item.cgst;
            acc.sgst += item.sgst;
            acc.igst += item.igst;
            return acc;
        }, { subTotal: 0, discount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 });
        console.log('🚀 [buildPayload] Calculated Totals:', totals);

        const netAmount = totals.taxableValue + totals.cgst + totals.sgst + totals.igst;
        const roundedTotal = Math.round(netAmount);
        const roundOff = roundedTotal - netAmount;

        const newPayload: PrintableInvoicePayload = {
            meta: {
                orderNo: primaryOrder.id,
                quotationNo: primaryOrder.crmOrderNo,
                invoiceDate: new Date().toISOString(),
                isVas: isVas,
                salesPerson: primaryOrder.salesPerson,
            },
            customer: {
                name: primaryOrder.customerName,
                phone: primaryOrder.customerPhone,
                address: primaryOrder.customerAddress,
            },
            seller: {
                companyName: isVas ? 'MO SPACES PVT.LTD.' : 'MO Designs Private Limited - (2024-2025)',
                address: 'A-6, Sushant Lok-1, M G Road, Gurgaon- 122022,B-50, Sushant Lok-2, Sec- 56, Gurgaon - 122011 GURGAON. (HARYANA) INDIA',
                gstin: '06AAMCM5012B1ZY',
            },
            items: calculatedItems,
            totals: {
                subTotal: totals.subTotal,
                discount: totals.discount,
                taxableValue: totals.taxableValue,
                cgst: totals.cgst,
                sgst: totals.sgst,
                igst: totals.igst,
                roundOff: roundOff,
                grandTotal: roundedTotal,
                totalGst: totals.cgst + totals.sgst + totals.igst,
            },
            gstBreakdown: [] // This part is complex, might need more info
        };
        console.log('✅ [buildPayload] Final Payload:', newPayload);
        setPayload(newPayload);
    };

    buildPayload();
    console.log('📦 [GenerateInvoiceDialog useEffect] ========== END ==========');

  }, [isOpen, batches, orders]);
  
  const handleFinalGenerate = React.useCallback(async (isVas: boolean) => {
    console.log('🎯 [handleFinalGenerate] ========================================');
    console.log('🎯 [handleFinalGenerate] STARTING INVOICE GENERATION');
    console.log('🎯 [handleFinalGenerate] Is VAS Invoice:', isVas);
    console.log('🎯 [handleFinalGenerate] Creator:', creator);
    console.log('🎯 [handleFinalGenerate] Batches Count:', batches.length);
    console.log('🎯 [handleFinalGenerate] Orders Count:', orders.length);
    console.log('🎯 [handleFinalGenerate] Batches Data:', JSON.parse(JSON.stringify(batches)));
    console.log('🎯 [handleFinalGenerate] Orders Data:', JSON.parse(JSON.stringify(orders)));
    
    if (!creator) {
        console.error('❌ [handleFinalGenerate] No creator found - aborting');
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to perform this action.' });
        return;
    }
    
    setIsStockMismatchOpen(false); 
    setIsGenerating(true);
    
    try {
        console.log('📝 [handleFinalGenerate] Creating Firestore batch...');
        const batch = writeBatch(db);
        
        const primaryOrder = orders[0];
        console.log('📋 [handleFinalGenerate] Primary Order:', {
          id: primaryOrder.id,
          customerName: primaryOrder.customerName,
          customerPhone: primaryOrder.customerPhone,
          customerAddress: primaryOrder.customerAddress,
          salesPerson: primaryOrder.salesPerson,
          fabricDetails: primaryOrder.fabricDetails
        });
        
        console.log('💹 [handleFinalGenerate] Fetching GST from quotation...');
        const gstData = isVas 
          ? { cgstPercent: 9, sgstPercent: 9, igstPercent: 0, totalGstPercent: 18, source: 'default' as const } 
          : await fetchGSTFromQuotationAction(primaryOrder.id);
        
        console.log('💹 [handleFinalGenerate] GST Data to be used:', gstData);
        
        const ordersById = new Map(orders.map(order => [order.id, order]));
        console.log('🗺️ [handleFinalGenerate] Orders Map created with', ordersById.size, 'entries');
        
        console.log('🔄 [handleFinalGenerate] Processing and normalizing items...');
        const normalizedItems = batches.flatMap(b => b.items.map(item => {
            console.log('  📦 [handleFinalGenerate] Processing item from batch:', b.id);
            const order = ordersById.get(b.orderId);
            console.log('  📦 [handleFinalGenerate] Found order for batch:', order?.id);
            const pricing = resolveItemPricing(order, item);
            const normalizedItem = { ...item, rate: pricing.rate, discountPercent: pricing.discountPercent };
            console.log('  📦 [handleFinalGenerate] Normalized Item:', normalizedItem);
            return normalizedItem;
        }));
        
        console.log('✅ [handleFinalGenerate] Total Normalized Items:', normalizedItems.length);
        console.log('✅ [handleFinalGenerate] Normalized Items Data:', normalizedItems);

        console.log('💵 [handleFinalGenerate] Calculating totals with GST from quotation...');
        const totals = normalizedItems.reduce((acc, item, index) => {
            console.log(`  💵 [handleFinalGenerate] Item ${index + 1}/${normalizedItems.length}:`, {
              itemName: item.itemName,
              bcn: item.bcn,
              quantityAllocated: item.quantityAllocated,
              rate: item.rate,
              discountPercent: item.discountPercent
            });
            
            const qty = item.quantityAllocated;
            const rate = item.rate;
            const amount = qty * rate;
            const discountAmount = (item.discountPercent || 0) * amount / 100;
            const taxableValue = amount - discountAmount;
            
            const cgst = taxableValue * (gstData.cgstPercent / 100);
            const sgst = taxableValue * (gstData.sgstPercent / 100);
            const igst = taxableValue * (gstData.igstPercent / 100);
            
            console.log(`  💵 [handleFinalGenerate] Calculations:`, {
              amount,
              discountAmount,
              taxableValue,
              cgst,
              sgst,
              igst,
              gstRates: `CGST: ${gstData.cgstPercent}% | SGST: ${gstData.sgstPercent}% | IGST: ${gstData.igstPercent}%`
            });
            
            acc.totalAmount += amount;
            acc.totalDiscount += discountAmount;
            acc.taxableValue += taxableValue;
            acc.totalCgst += cgst;
            acc.totalSgst += sgst;
            acc.totalIgst += igst;
            
            return acc;
        }, { totalAmount: 0, totalDiscount: 0, taxableValue: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0 });

        console.log('💵 [handleFinalGenerate] Final Totals:', totals);
        
        const netAmount = totals.taxableValue + totals.totalCgst + totals.totalSgst + totals.totalIgst;
        const roundedAmount = Math.round(netAmount);
        const roundOff = roundedAmount - netAmount;
        
        console.log('💵 [handleFinalGenerate] Final Amounts:', {
          netAmount,
          roundedAmount,
          roundOff,
          gstBreakdown: {
            cgst: totals.totalCgst,
            sgst: totals.totalSgst,
            igst: totals.totalIgst,
            totalGst: totals.totalCgst + totals.totalSgst + totals.totalIgst
          }
        });
        
        console.log('📄 [handleFinalGenerate] Creating new invoice document reference...');
        const newInvoiceRef = doc(collection(db, "invoices"));
        console.log('📄 [handleFinalGenerate] New Invoice ID:', newInvoiceRef.id);
        
        const newInvoice: Omit<Invoice, 'id' | 'invoiceNo'> = {
            orderId: primaryOrder.id,
            isVas: isVas,
            customer: {
                name: primaryOrder.customerName,
                phone: primaryOrder.customerPhone,
                address: primaryOrder.customerAddress,
            },
            salesPerson: primaryOrder.salesPerson,
            items: normalizedItems,
            totals: {
                subTotal: totals.totalAmount,
                totalDiscount: totals.totalDiscount,
                taxableValue: totals.taxableValue,
                cgst: totals.totalCgst,
                sgst: totals.totalSgst,
                igst: totals.totalIgst,
                roundOff: roundOff,
                grandTotal: roundedAmount,
            },
            gstPercentages: {
              cgst: gstData.cgstPercent,
              sgst: gstData.sgstPercent,
              igst: gstData.igstPercent,
              total: gstData.totalGstPercent
            },
            createdAt: new Date().toISOString(),
            createdBy: creator.name,
            invoiceNo: '',
        };
        
        console.log('📄 [handleFinalGenerate] New Invoice Object:', JSON.parse(JSON.stringify(newInvoice)));
        
        console.log('💾 [handleFinalGenerate] Adding invoice to Firestore batch...');
        batch.set(newInvoiceRef, newInvoice);
        
        const fullInvoiceData = { ...newInvoice, id: newInvoiceRef.id, invoiceNo: '' };
        const plainInvoiceData = JSON.parse(JSON.stringify(fullInvoiceData));
        
        console.log('📤 [handleFinalGenerate] Sending invoice to Tally...');
        console.log('📤 [handleFinalGenerate] Plain Invoice Data for Tally:', plainInvoiceData);
        
        const tallyResult = await sendInvoiceToTally(plainInvoiceData, isVas);
        console.log('📥 [handleFinalGenerate] Tally Result:', tallyResult);
        
        if (tallyResult.success) {
            console.log('✅ [handleFinalGenerate] Tally sync successful!');
            
            if (!isVas) {
                console.log('📦 [handleFinalGenerate] Processing stock deduction (Non-VAS)...');
                
                for (const item of normalizedItems) {
                    const stockId = item.bcn.replace(/\//g, '-');
                    console.log(`  📦 [handleFinalGenerate] Stock Item:`, {
                      originalBcn: item.bcn,
                      stockId,
                      quantityAllocated: item.quantityAllocated,
                      stockAddedId: item.stockAddedId
                    });
                    
                    const stockRef = doc(db, 'stocks', stockId);

                    console.log(`  📦 [handleFinalGenerate] Updating stock document:`, stockId);
                    batch.update(stockRef, {
                        quantity: increment(-item.quantityAllocated),
                        reservedQty: increment(-item.quantityAllocated),
                        cutQty: increment(item.quantityAllocated),
                    });
                    
                    if (item.stockAddedId) {
                        console.log(`  📦 [handleFinalGenerate] Updating length document:`, item.stockAddedId);
                        const lengthRef = doc(db, 'stocks', stockId, 'lengths', item.stockAddedId);
                        batch.update(lengthRef, {
                            reservedQty: increment(-item.quantityAllocated),
                            cutQty: increment(item.quantityAllocated),
                        });
                    }

                    console.log(`  📦 [handleFinalGenerate] Creating stock transaction...`);
                    const transactionRef = doc(collection(stockRef, 'stockSold'));
                    const transaction: Omit<StockTransaction, 'id'> = {
                        stockId: stockId,
                        bcn: item.bcn,
                        type: 'deduction',
                        quantityChange: -item.quantityAllocated,
                        orderId: primaryOrder.id,
                        createdAt: new Date().toISOString(),
                        createdBy: creator.name,
                        status: 'cut'
                    };
                    console.log(`  📦 [handleFinalGenerate] Transaction Data:`, transaction);
                    batch.set(transactionRef, transaction);
                }
                
                console.log('✅ [handleFinalGenerate] Stock deduction processing complete');
            } else {
                console.log('⏭️ [handleFinalGenerate] Skipping stock deduction (VAS Invoice)');
            }

            if(tallyResult.voucherNumber) {
                console.log('🎫 [handleFinalGenerate] Updating invoice with Tally voucher number:', tallyResult.voucherNumber);
                const invoiceRefToUpdate = doc(db, "invoices", newInvoiceRef.id);
                batch.update(invoiceRefToUpdate, { 
                  tallyVoucherNo: tallyResult.voucherNumber, 
                  invoiceNo: tallyResult.voucherNumber 
                });
                setGeneratedInvoice({ 
                  ...fullInvoiceData, 
                  tallyVoucherNo: tallyResult.voucherNumber, 
                  invoiceNo: tallyResult.voucherNumber 
                });
            }
        } else {
            console.warn('⚠️ [handleFinalGenerate] Tally sync failed, proceeding without voucher number');
            setGeneratedInvoice(fullInvoiceData); 
        }
        
        if (!isVas) {
            console.log('✂️ [handleFinalGenerate] Creating cutting task (Non-VAS)...');
            const newCuttingTaskRef = doc(collection(db, "Cutting"));
            const newCuttingTask: Omit<CuttingTask, 'id'> = {
                invoiceId: newInvoiceRef.id,
                orderId: primaryOrder.id,
                customerName: primaryOrder.customerName,
                customerPhone: primaryOrder.customerPhone,
                salesPerson: primaryOrder.salesPerson,
                items: normalizedItems.map(item => ({ 
                    ...item, 
                    status: 'pending',
                    originalLength: item.originalLength || 0,
                })),
                createdAt: new Date().toISOString(),
                status: "Pending",
            };
            console.log('✂️ [handleFinalGenerate] Cutting Task Data:', JSON.parse(JSON.stringify(newCuttingTask)));
            batch.set(newCuttingTaskRef, newCuttingTask);
        }

        console.log('🔄 [handleFinalGenerate] Updating invoice batches status...');
        batches.forEach((b, index) => {
            console.log(`  🔄 [handleFinalGenerate] Batch ${index + 1}/${batches.length}:`, b.id);
            const batchRef = doc(db, "invoiceBatches", b.id);
            batch.update(batchRef, { status: "invoiced", invoiceId: newInvoiceRef.id });
        });

        if (!isVas) {
            console.log('🎯 [handleFinalGenerate] Checking if all order items are invoiced...');
            const allOrderFabricNames = (primaryOrder.fabricDetails || []).map(f => f.fabricName);
            console.log('  🎯 [handleFinalGenerate] All Order Fabric Names:', allOrderFabricNames);
            
            const allBatchesQuery = query(collection(db, 'invoiceBatches'), where('orderId', '==', primaryOrder.id));
            console.log('  🎯 [handleFinalGenerate] Fetching all batches for order:', primaryOrder.id);
            
            const allBatchesSnapshot = await getDocs(allBatchesQuery);
            console.log('  🎯 [handleFinalGenerate] Found', allBatchesSnapshot.docs.length, 'batches');
            
            const allInvoicedItems = allBatchesSnapshot.docs.flatMap(doc => {
              const batchData = doc.data() as InvoiceBatch;
              console.log('    🎯 [handleFinalGenerate] Batch:', doc.id, 'Items:', batchData.items.length);
              return batchData.items.map(item => item.itemName);
            });
            
            const currentBatchItems = normalizedItems.map(item => item.itemName);
            console.log('  🎯 [handleFinalGenerate] Current Batch Items:', currentBatchItems);
            
            allInvoicedItems.push(...currentBatchItems);
            console.log('  🎯 [handleFinalGenerate] All Invoiced Items:', allInvoicedItems);
            
            const allItemsInvoiced = allOrderFabricNames.every(name => allInvoicedItems.includes(name));
            console.log('  🎯 [handleFinalGenerate] All Items Invoiced?', allItemsInvoiced);

            if (allItemsInvoiced) {
                console.log('  ✅ [handleFinalGenerate] Completing milestone 3 for order:', primaryOrder.id);
                const orderRef = doc(db, "orders", primaryOrder.id);
                const updatedMilestones = primaryOrder.milestones.map(m =>
                    m.id === 3
                    ? { ...m, completed: true, completedAt: new Date().toISOString(), completedBy: creator.name }
                    : m
                );
                console.log('  ✅ [handleFinalGenerate] Updated Milestones:', updatedMilestones);
                batch.update(orderRef, { milestones: updatedMilestones });
            } else {
                console.log('  ⏭️ [handleFinalGenerate] Not all items invoiced yet, skipping milestone update');
            }
        }
        
        console.log('💾 [handleFinalGenerate] Committing Firestore batch...');
        await batch.commit();
        console.log('✅ [handleFinalGenerate] Firestore batch committed successfully!');
        
        setTallySyncResult(tallyResult); 
        console.log('🎯 [handleFinalGenerate] INVOICE GENERATION COMPLETE');
        console.log('🎯 [handleFinalGenerate] ========================================');

    } catch (error) {
        console.error("❌ [handleFinalGenerate] ERROR:", error);
        console.error("❌ [handleFinalGenerate] Error Stack:", error instanceof Error ? error.stack : 'No stack trace');
        toast({ variant: 'destructive', title: 'Error', description: 'Could not finalize the invoice.' });
    } finally {
        setIsGenerating(false);
    }
  }, [creator, toast, batches, orders]);
  
    const handlePreVoucherCheck = React.useCallback(async () => {
    console.log('🔍 [handlePreVoucherCheck] ========================================');
    console.log('🔍 [handlePreVoucherCheck] STARTING PRE-VOUCHER CHECK');
    console.log('🔍 [handlePreVoucherCheck] Creator:', creator);
    console.log('🔍 [handlePreVoucherCheck] Batches:', batches);
    
    if (!creator) {
      console.error('❌ [handlePreVoucherCheck] No creator - aborting');
      return;
    }
    
    setIsGenerating(true);
    
    const isVasInvoice = batches.length > 0 && batches[0].isVas === true;
    console.log('🔍 [handlePreVoucherCheck] Is VAS Invoice?', isVasInvoice);
    
    if (isVasInvoice) {
        console.log('⏭️ [handlePreVoucherCheck] VAS Invoice detected - skipping stock check');
        await handleFinalGenerate(true);
        return;
    }

    console.log('📦 [handlePreVoucherCheck] Checking stock quantities...');
    const mismatches: MismatchItem[] = [];
    const allItems = batches.flatMap(b => b.items);
    console.log('📦 [handlePreVoucherCheck] Total Items:', allItems.length);
    console.log('📦 [handlePreVoucherCheck] All Items Data:', allItems);

    console.log('📊 [handlePreVoucherCheck] Consolidating quantities by BCN...');
    const requiredQuantities = allItems.reduce((acc, item) => {
        const currentQty = acc[item.bcn] || 0;
        acc[item.bcn] = currentQty + item.quantityAllocated;
        console.log(`  📊 [handlePreVoucherCheck] BCN: ${item.bcn}, Adding: ${item.quantityAllocated}, Total: ${acc[item.bcn]}`);
        return acc;
    }, {} as Record<string, number>);
    
    console.log('📊 [handlePreVoucherCheck] Required Quantities:', requiredQuantities);

    for (const bcn in requiredQuantities) {
        console.log(`🔎 [handlePreVoucherCheck] Checking stock for BCN: ${bcn}`);
        console.log(`  📤 [handlePreVoucherCheck] Fetching from Firestore...`);
        const crmRes = await getFirestoreStockQuantity(bcn);
        console.log(`  📥 [handlePreVoucherCheck] Firestore Result:`, crmRes);
        
        console.log(`  📤 [handlePreVoucherCheck] Fetching from Tally...`);
        const tallyRes = await getStockFromTally(bcn);
        console.log(`  📥 [handlePreVoucherCheck] Tally Result:`, tallyRes);
        
        if (!crmRes.success || !tallyRes.success) {
            console.error(`  ❌ [handlePreVoucherCheck] Failed to verify stock for ${bcn}`);
            setMismatchedItems([{ 
                itemName: `Could not verify stock for ${bcn}.`,
                crmQty: 0,
                tallyQty: 0,
                errorType: 'mismatch',
                difference: 0
            }]);
            setIsStockMismatchOpen(true);
            setIsGenerating(false);
            return;
        }

        const crmQty = crmRes.quantity ?? 0;
        const tallyQty = tallyRes.quantity ?? 0;
        
        console.log(`  📊 [handlePreVoucherCheck] Comparison:`, {
          bcn,
          crmQty,
          tallyQty,
          match: crmQty === tallyQty
        });
        
        if (crmQty !== tallyQty) {
          console.warn(`  ⚠️ [handlePreVoucherCheck] MISMATCH DETECTED for ${bcn}`);
          mismatches.push({ 
              itemName: bcn, 
              crmQty, 
              tallyQty, 
              errorType: 'mismatch',
              difference: crmQty - tallyQty
          });
        }
    }
    
    console.log('📊 [handlePreVoucherCheck] Total Mismatches Found:', mismatches.length);
    
    if (mismatches.length > 0) {
      console.warn('⚠️ [handlePreVoucherCheck] Mismatches detected:', mismatches);
      setMismatchedItems(mismatches);
      setIsStockMismatchOpen(true);
      setIsGenerating(false);
    } else {
      console.log('✅ [handlePreVoucherCheck] No mismatches - proceeding with generation');
      await handleFinalGenerate(false);
    }
    
    console.log('🔍 [handlePreVoucherCheck] PRE-VOUCHER CHECK COMPLETE');
    console.log('🔍 [handlePreVoucherCheck] ========================================');
  }, [creator, batches, handleFinalGenerate, toast]);
  
  const handlePrint = () => {
    console.log('🖨️ [handlePrint] Initiating print...');
    const printContent = document.getElementById('printable-invoice-content');
    if (!printContent) {
      console.error('❌ [handlePrint] Print content element not found');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      console.error('❌ [handlePrint] Could not open print window');
      return;
    }

    console.log('🖨️ [handlePrint] Writing content to print window...');
    printWindow.document.write('<html><head><title>Print Invoice</title></head><body>');
    printWindow.document.write(printContent.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        console.log('✅ [handlePrint] Print dialog opened');
    }, 250);
  };

  const resetAndClose = () => {
    console.log('🔄 [resetAndClose] Resetting dialog state and closing');
    setGeneratedInvoice(null);
    setTallySyncResult(null);
    onClose();
  }

  return (
    <>
    <Dialog open={isOpen && !tallySyncResult} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>Generate Invoice</DialogTitle>
                <DialogDescription>
                    Review the items below. An invoice will be generated for the selected orders.
                </DialogDescription>
            </DialogHeader>
            <div className="flex-grow overflow-y-auto pr-4" id="printable-invoice-content">
                <PrintableInvoice payload={payload} />
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button variant="outline" onClick={handlePrint}><Printer className="mr-2 h-4 w-4"/> Print</Button>
                <Button onClick={handlePreVoucherCheck} disabled={isGenerating || !!generatedInvoice}>
                    {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm & Generate
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
     <AlertDialog open={!!tallySyncResult} onOpenChange={() => resetAndClose()}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                    {tallySyncResult?.success ? <CheckCircle className="text-green-500"/> : <XCircle className="text-destructive"/>}
                    Tally Sync {tallySyncResult?.success ? "Successful" : "Failed"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                    {tallySyncResult?.message}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
                <p className="text-sm font-semibold">Tally Voucher No:</p>
                <p className="text-lg font-mono p-2 bg-muted rounded-md">{tallySyncResult?.voucherNumber || "Not available"}</p>
            </div>
            <AlertDialogFooter>
                <AlertDialogAction onClick={() => resetAndClose()}>Close</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

function InvoiceTable({ 
    batches, 
    orders, 
    loading,
    view
}: { 
    batches: InvoiceBatch[], 
    orders: Order[], 
    loading: boolean,
    view: 'active' | 'all'
}) {
    console.log('📊 [InvoiceTable] ========================================');
    console.log('📊 [InvoiceTable] Component Rendered');
    console.log('📊 [InvoiceTable] Batches Count:', batches.length);
    console.log('📊 [InvoiceTable] Orders Count:', orders.length);
    console.log('📊 [InvoiceTable] Loading:', loading);
    console.log('📊 [InvoiceTable] View:', view);
    
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
    const [isGenerateDialogOpen, setIsGenerateDialogOpen] = React.useState(false);
    const [isViewInvoiceOpen, setIsViewInvoiceOpen] = React.useState(false);
    const [selectedBatchForView, setSelectedBatchForView] = React.useState<InvoiceBatch | null>(null);
    const [isCombineDialogOpen, setIsCombineDialogOpen] = React.useState(false);
    
    const ordersById = React.useMemo(() => {
      console.log('🗺️ [InvoiceTable] Creating ordersById map...');
      const map = new Map(orders.map(order => [order.id, order]));
      console.log('🗺️ [InvoiceTable] ordersById map created with', map.size, 'entries');
      return map;
    }, [orders]);

    const { user } = useAuth();
    const { toast } = useToast();

    const handleViewClick = (batch: InvoiceBatch) => {
        console.log('👁️ [handleViewClick] Viewing batch:', batch.id);
        console.log('👁️ [handleViewClick] Batch Data:', JSON.parse(JSON.stringify(batch)));
        setSelectedBatchForView(batch);
        setIsViewInvoiceOpen(true);
    };
    
    const parseDateSafe = (dateInput: any): Date | null => {
        if (!dateInput) return null;
        if (dateInput instanceof Date) return dateInput;
        if (typeof dateInput.toDate === 'function') return dateInput.toDate();
        if (typeof dateInput === 'string') {
            const d = new Date(dateInput);
            if (!isNaN(d.getTime())) return d;
        }
        return null;
    }

    const columns: ColumnDef<InvoiceBatch>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => {
            console.log('☑️ [Column:select] Select all toggled:', value);
            const allRows = table.getFilteredRowModel().rows;
            const availableRows = allRows.filter(row => row.original.status !== 'invoiced');
            console.log('☑️ [Column:select] Available rows:', availableRows.length, 'out of', allRows.length);
            availableRows.forEach(row => row.toggleSelected(!!value));
          }}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => {
            console.log('☑️ [Column:select] Row selection toggled:', value, 'Batch ID:', row.original.id);
            row.toggleSelected(!!value);
          }}
          aria-label="Select row"
          disabled={row.original.status === "invoiced"}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "orderId",
      header: "Order No",
      cell: ({ row }) => {
        const batch = row.original;
        const orderId = batch.orderId;
        const displayId = orderId.replace("MOTRACK-", "");
        console.log('🔢 [Column:orderId] Batch:', batch.id, 'Order ID:', orderId, 'Display:', displayId, 'Combined:', batch.isCombined);
        return (
          <div className="flex items-center gap-1">
            {batch.isCombined && <Combine className="mr-2 h-4 w-4 text-muted-foreground" title="Combined Invoice" />}
            <span>{displayId}</span>
          </div>
        );
      }
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => {
            console.log('🔽 [Column:createdAt] Sort toggled');
            column.toggleSorting(column.getIsSorted() === "asc");
          }}
        >
          Invoice Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = parseDateSafe(row.original.createdAt);
        const formatted = date ? format(date, "dd/MM/yyyy HH:mm") : "Invalid Date";
        console.log('📅 [Column:createdAt] Batch:', row.original.id, 'Date:', formatted);
        return formatted;
      }
    },
    {
      accessorKey: "customerName",
      header: "Customer Name",
      cell: ({ row }) => {
        console.log('👤 [Column:customerName] Batch:', row.original.id, 'Customer:', row.original.customerName);
        return row.original.customerName;
      }
    },
    {
      accessorKey: "customerPhone",
      header: "Phone",
      cell: ({ row }) => {
        console.log('📱 [Column:customerPhone] Batch:', row.original.id, 'Phone:', row.original.customerPhone);
        return row.original.customerPhone;
      }
    },
    {
      id: 'totalAmount',
      header: "Invoice Amount",
      cell: ({ row }) => {
        console.log('💰 [Column:totalAmount] ========== START ==========');
        const batch = row.original;
        console.log('💰 [Column:totalAmount] Batch ID:', batch.id);
        console.log('💰 [Column:totalAmount] Is VAS:', batch.isVas);
        
        const isVas = batch.isVas === true;
        const orderForBatch = ordersById.get(batch.orderId);
        console.log('💰 [Column:totalAmount] Order for batch:', orderForBatch?.id);
        
        const subtotal = batch.items.reduce((sum, item, index) => {
          console.log(`  💰 [Column:totalAmount] Item ${index + 1}:`, {
            itemName: item.itemName,
            bcn: item.bcn,
            quantityAllocated: item.quantityAllocated
          });
          
          const pricing = resolveItemPricing(orderForBatch, item);
          const amount = item.quantityAllocated * pricing.rate;
          const discountAmount = amount * ((pricing.discountPercent || 0) / 100);
          const itemTotal = amount - discountAmount;
          
          console.log(`  💰 [Column:totalAmount] Item calculations:`, {
            amount,
            discountAmount,
            itemTotal
          });
          
          return sum + itemTotal;
        }, 0);
      
        console.log('💰 [Column:totalAmount] Subtotal:', subtotal);
        
        const taxRate = isVas ? 0.18 : 0.05;
        const tax = subtotal * taxRate; 
        const totalAmount = subtotal + tax;
        const roundedAmount = Math.round(totalAmount);
        
        console.log('💰 [Column:totalAmount] Calculations:', {
          taxRate: isVas ? '18% (VAS)' : '5% (Normal)',
          tax,
          totalAmount,
          roundedAmount
        });
        console.log('💰 [Column:totalAmount] ========== END ==========');
        
        return `₹${roundedAmount.toFixed(2)}`;
      }
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        const tallyBillNo = row.original.tallyVoucherNo;
        console.log('🏷️ [Column:status] Batch:', row.original.id, 'Status:', status, 'Tally No:', tallyBillNo);
        
        const variant = status === 'pendingInvoice' ? 'secondary' : 'default';
        const color = status === 'pendingInvoice' ? '' : 'bg-green-600';
        const text = status === 'pendingInvoice' ? 'Pending for Invoice' : `Invoiced: ${tallyBillNo || ''}`;
        return <Badge variant={variant} className={color}>{text}</Badge>;
      }
    },
    {
        id: 'actions',
        cell: ({ row }) => {
            const batch = row.original;
            console.log('⚙️ [Column:actions] Batch:', batch.id, 'Status:', batch.status);
            if (batch.status === 'invoiced') {
                return (
                    <Button variant="ghost" size="icon" onClick={() => handleViewClick(batch)}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                );
            }
            return null;
        },
    }
  ];

  const table = useReactTable({
    data: batches,
    columns,
    onSortingChange: setSorting,
    onRowSelectionChange: (updater) => {
      console.log('🔄 [useReactTable] Row selection changing...');
      setRowSelection(updater);
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      rowSelection,
    },
    enableRowSelection: row => {
      const isSelectable = row.original.status !== 'invoiced';
      console.log('🔍 [useReactTable] Row selectability check - Batch:', row.original.id, 'Selectable:', isSelectable);
      return isSelectable;
    },
  });

  const selectedBatches = table.getFilteredSelectedRowModel().rows.map(row => row.original);
  const selectedOrders = orders.filter(order => selectedBatches.some(batch => batch.orderId === order.id));
  const canGenerate = selectedBatches.length > 0 && selectedBatches.every(b => b.status === 'pendingInvoice');
  const canCombine = selectedBatches.length > 1;
  
  console.log('📊 [InvoiceTable] Selection State:', {
    selectedBatchesCount: selectedBatches.length,
    selectedOrdersCount: selectedOrders.length,
    canGenerate,
    canCombine
  });

  const handleCombineClick = () => {
    console.log('🔗 [handleCombineClick] ========================================');
    console.log('🔗 [handleCombineClick] Combine button clicked');
    console.log('🔗 [handleCombineClick] Selected Batches:', selectedBatches.length);
    
    if (!canCombine) {
      console.warn('⚠️ [handleCombineClick] Cannot combine - insufficient batches');
      return;
    }

    const firstOrderId = selectedBatches[0].orderId;
    console.log('🔗 [handleCombineClick] First Order ID:', firstOrderId);
    
    const allSameOrder = selectedBatches.every(b => b.orderId === firstOrderId);
    console.log('🔗 [handleCombineClick] All batches same order?', allSameOrder);
    
    if (!allSameOrder) {
        console.error('❌ [handleCombineClick] Batches belong to different orders');
        const orderIds = [...new Set(selectedBatches.map(b => b.orderId))];
        console.error('❌ [handleCombineClick] Order IDs found:', orderIds);
        
        toast({
            variant: "destructive",
            title: "Cannot Combine",
            description: "You can only combine invoices that belong to the same order."
        });
        return;
    }
    
    console.log('✅ [handleCombineClick] Opening combine dialog');
    setIsCombineDialogOpen(true);
  };
  
  const handleConfirmCombine = async () => {
      console.log('🔗 [handleConfirmCombine] ========================================');
      console.log('🔗 [handleConfirmCombine] Confirming combine operation');
      console.log('🔗 [handleConfirmCombine] Batches to combine:', selectedBatches.length);
      console.log('🔗 [handleConfirmCombine] Batch IDs:', selectedBatches.map(b => b.id));
      
      console.log('🔗 [handleConfirmCombine] Serializing batches...');
      const plainBatches = JSON.parse(JSON.stringify(selectedBatches));
      console.log('🔗 [handleConfirmCombine] Plain batches:', plainBatches);
      
      console.log('🔗 [handleConfirmCombine] Calling combineInvoiceBatchesAction...');
      const result = await combineInvoiceBatchesAction(plainBatches);
      console.log('🔗 [handleConfirmCombine] Action result:', result);
      
      if(result.success) {
          console.log('✅ [handleConfirmCombine] Combine successful');
          toast({ title: 'Success', description: result.message });
          table.resetRowSelection();
      } else {
          console.error('❌ [handleConfirmCombine] Combine failed:', result.message);
          toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
      setIsCombineDialogOpen(false);
      console.log('🔗 [handleConfirmCombine] ========================================');
  }

  return (
    <>
    <Card>
        <CardContent className="p-4">
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                            <TableHead key={header.id}>
                                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                            </TableHead>
                            ))}
                        </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                   <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id}>
                                {row.getVisibleCells().map((cell) => (
                                    <TableCell key={cell.id}>
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
             <div className="flex items-center justify-end space-x-2 py-4">
                <div className="flex-1 text-sm text-muted-foreground">
                    {table.getFilteredSelectedRowModel().rows.length} of{" "}
                    {table.getFilteredRowModel().rows.length} row(s) selected.
                </div>
                {view !== 'all' && (
                  <div className="flex items-center gap-2">
                    <Button 
                      onClick={handleCombineClick}
                      disabled={!canCombine}
                      variant="outline"
                    >
                      <Combine className="mr-2 h-4 w-4" />
                      Combine Invoice
                    </Button>
                    <Button 
                      onClick={() => {
                        console.log('📄 [Button:Generate] Opening generate dialog');
                        console.log('📄 [Button:Generate] Selected batches:', selectedBatches.length);
                        console.log('📄 [Button:Generate] Selected orders:', selectedOrders.length);
                        setIsGenerateDialogOpen(true);
                      }}
                      disabled={!canGenerate}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Generate
                    </Button>
                  </div>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    console.log('⬅️ [Button:Previous] Previous page clicked');
                    table.previousPage();
                  }} 
                  disabled={!table.getCanPreviousPage()}
                >
                  Previous
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    console.log('➡️ [Button:Next] Next page clicked');
                    table.nextPage();
                  }} 
                  disabled={!table.getCanNextPage()}
                >
                  Next
                </Button>
            </div>
        </CardContent>
      </Card>
       <GenerateInvoiceDialog
            isOpen={isGenerateDialogOpen}
            onClose={() => {
              console.log('❌ [GenerateInvoiceDialog] Closing dialog');
              setIsGenerateDialogOpen(false);
            }}
            batches={selectedBatches}
            orders={selectedOrders}
            creator={user ? {id: user.uid, name: user.displayName || 'System'} : null}
        />
        {selectedBatchForView && (
            <Dialog open={isViewInvoiceOpen} onOpenChange={setIsViewInvoiceOpen}>
                <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>View Invoice</DialogTitle>
                        <DialogDescription>
                            Viewing invoice for batch {selectedBatchForView.id}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-grow overflow-y-auto pr-4" id="printable-invoice-view-content">
                         {/* This will be populated dynamically */}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                console.log('🖨️ [Button:Print-View] Print clicked for viewed invoice');
                                const printContent = document.getElementById('printable-invoice-view-content');
                                if (!printContent) {
                                  console.error('❌ [Button:Print-View] Print content not found');
                                  return;
                                }
                                const printWindow = window.open('', '_blank');
                                if (!printWindow) {
                                  console.error('❌ [Button:Print-View] Could not open print window');
                                  return;
                                }
                                console.log('🖨️ [Button:Print-View] Opening print window...');
                                printWindow.document.write('<html><head><title>Print Invoice</title></head><body>');
                                printWindow.document.write(printContent.innerHTML);
                                printWindow.document.write('</body></html>');
                                printWindow.document.close();
                                setTimeout(() => {
                                    printWindow.focus();
                                    printWindow.print();
                                    console.log('✅ [Button:Print-View] Print dialog opened');
                                }, 250);
                            }}
                        >
                            <Printer className="mr-2 h-4 w-4" /> Print
                        </Button>
                        <Button variant="ghost" onClick={() => {
                          console.log('❌ [Button:Close-View] Closing view invoice dialog');
                          setIsViewInvoiceOpen(false);
                        }}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )}
        <AlertDialog open={isCombineDialogOpen} onOpenChange={setIsCombineDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will combine the {selectedBatches.length} selected invoice batches into a single batch. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => {
                      console.log('❌ [AlertDialog:Combine] Combine cancelled');
                    }}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmCombine}>Combine</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>
  )
}

export default function InvoicePage() {
  console.log('🏠 [InvoicePage] ========================================');
  console.log('🏠 [InvoicePage] Component Initialized');
  
  const [activeBatches, setActiveBatches] = React.useState<InvoiceBatch[]>([]);
  const [vasBatches, setVasBatches] = React.useState<InvoiceBatch[]>([]);
  const [allOrders, setAllOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { toast } = useToast();

  React.useEffect(() => {
    console.log('⚙️ [InvoicePage useEffect] ========================================');
    console.log('⚙️ [InvoicePage useEffect] Setting up real-time listeners');
    
    setLoading(true);
    
    console.log('📡 [InvoicePage useEffect] Creating Firestore queries...');
    const batchesQuery = query(collection(db, "invoiceBatches"), orderBy("createdAt", "desc"));
    const ordersQuery = query(collection(db, "orders"));
    
    console.log('📡 [InvoicePage useEffect] Batches query created');
    console.log('📡 [InvoicePage useEffect] Orders query created');

    console.log('👂 [InvoicePage useEffect] Subscribing to invoice batches...');
    const unsubscribeBatches = onSnapshot(batchesQuery, (snapshot) => {
        console.log('📥 [InvoicePage:Batches] ========================================');
        console.log('📥 [InvoicePage:Batches] Snapshot received');
        console.log('📥 [InvoicePage:Batches] Documents count:', snapshot.docs.length);
        
        const batchesData = snapshot.docs.map((doc, index) => {
          const data = doc.data();
          console.log(`  📥 [InvoicePage:Batches] Doc ${index + 1}:`, { id: doc.id, orderId: data.orderId, status: data.status, isVas: data.isVas });
          return { ...data, id: doc.id } as InvoiceBatch;
        });
        
        console.log('📥 [InvoicePage:Batches] Total batches:', batchesData.length);
        
        const activeStandard = batchesData.filter(b => b.status === 'pendingInvoice' && !b.isVas);
        console.log('📥 [InvoicePage:Batches] Active Standard Batches:', activeStandard.length);
        setActiveBatches(activeStandard);
        
        const activeVas = batchesData.filter(b => b.status === 'pendingInvoice' && b.isVas);
        console.log('📥 [InvoicePage:Batches] Active VAS Batches:', activeVas.length);
        setVasBatches(activeVas);
        
        console.log('📥 [InvoicePage:Batches] State updated');
        console.log('📥 [InvoicePage:Batches] ========================================');
    }, (error) => {
      console.error("❌ [InvoicePage:Batches] ERROR:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load invoice data." });
    });

    console.log('👂 [InvoicePage useEffect] Subscribing to orders...');
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
        console.log('📥 [InvoicePage:Orders] ========================================');
        console.log('📥 [InvoicePage:Orders] Snapshot received');
        console.log('📥 [InvoicePage:Orders] Documents count:', snapshot.docs.length);
        
        const ordersData = snapshot.docs.map((doc, index) => {
          const data = doc.data();
          console.log(`  📥 [InvoicePage:Orders] Order ${index + 1}:`, { id: doc.id, customerName: data.customerName });
          return { ...data, id: doc.id } as Order;
        });
        
        console.log('📥 [InvoicePage:Orders] Total orders:', ordersData.length);
        setAllOrders(ordersData);
        console.log('📥 [InvoicePage:Orders] State updated');
        console.log('📥 [InvoicePage:Orders] ========================================');
    }, (error) => {
        console.error("❌ [InvoicePage:Orders] ERROR:", error);
    });

    console.log('⏳ [InvoicePage useEffect] Performing initial data fetch...');
    Promise.all([getDocs(batchesQuery), getDocs(ordersQuery)])
      .finally(() => {
        console.log('✅ [InvoicePage useEffect] Setting loading to false');
        setLoading(false);
      });

    console.log('🧹 [InvoicePage useEffect] Returning cleanup function');
    return () => {
      console.log('🧹 [InvoicePage useEffect] CLEANUP - Unsubscribing from listeners');
      unsubscribeBatches();
      unsubscribeOrders();
      console.log('🧹 [InvoicePage useEffect] Cleanup complete');
    };
  }, [toast]);
  
  console.log('🏠 [InvoicePage] Render State:', {
    activeBatchesCount: activeBatches.length,
    vasBatchesCount: vasBatches.length,
    allOrdersCount: allOrders.length,
    loading
  });
    
  return (
    <div className="w-full p-4 md:p-6 lg:p-8">
        <header className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Generate Invoice</h1>
            <p className="text-muted-foreground">
                Select allocated items to generate and log invoices.
            </p>
        </header>

        <Tabs defaultValue="active-invoices" onValueChange={(value) => {
          console.log('📑 [Tabs] Tab changed to:', value);
        }}>
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="active-invoices">Active Invoices</TabsTrigger>
                <TabsTrigger value="vas-invoices">VAS Invoice</TabsTrigger>
                <TabsTrigger value="tally-log">Tally Log / Invoice History</TabsTrigger>
            </TabsList>
            <TabsContent value="active-invoices" className="mt-4">
                 <InvoiceTable batches={activeBatches} orders={allOrders} loading={loading} view="active" />
            </TabsContent>
            <TabsContent value="vas-invoices" className="mt-4">
                 <InvoiceTable batches={vasBatches} orders={allOrders} loading={loading} view="active" />
            </TabsContent>
            <TabsContent value="tally-log" className="mt-4">
                <InvoiceLogTable />
            </TabsContent>
        </Tabs>
    </div>
  )
}
