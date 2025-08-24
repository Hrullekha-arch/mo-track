
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
import { format, isWithinInterval } from "date-fns";
import { InvoiceBatch, Order, Invoice, CuttingTask, Stock, StockTransaction } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintableInvoice } from "@/components/features/invoice/PrintableInvoice";
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
import { sendInvoiceToTally, buildSalesVoucherXML, getFirestoreStockQuantity, getStockFromTally } from "@/services/tally";
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StockMismatchDialog } from "@/components/features/invoice/StockMismatchDialog";
import { combineInvoiceBatchesAction } from "./actions";


interface MismatchItem {
  itemName: string;
  crmQty: number;
  tallyQty: number;
  requiredQty?: number;
  errorType: 'mismatch' | 'insufficient';
  difference: number;
}
 
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

  const { toast } = useToast();
  
  const handleFinalGenerate = React.useCallback(async (isVas: boolean) => {
    if (!creator) {
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to perform this action.' });
        return;
    }
    setIsStockMismatchOpen(false); 
    setIsGenerating(true);
    
    try {
        const batch = writeBatch(db);
        const primaryOrder = orders[0];
        
        const invoicesRef = collection(db, "invoices");
        const q = query(invoicesRef, orderBy("invoiceNo", "desc"), limit(1));
        const lastInvoiceSnap = await getDocs(q);
        let newInvoiceNumber = 1001;
        if (!lastInvoiceSnap.empty) {
            const lastInvoiceNo = parseInt(lastInvoiceSnap.docs[0].data().invoiceNo, 10);
            if (!isNaN(lastInvoiceNo)) {
                newInvoiceNumber = lastInvoiceNo + 1;
                
            }
        }
        
        const newInvoiceNumberStr = String(newInvoiceNumber);

        const allItems = batches.flatMap(b => b.items);

        const totals = allItems.reduce((acc, item) => {
            const qty = item.quantityAllocated;
            const rate = item.rate;
            const amount = qty * rate;
            const discountAmount = (item.discountPercent || 0) * amount / 100;
            const taxableValue = amount - discountAmount;
            const cgst = taxableValue * 0.025;
            const sgst = taxableValue * 0.025;
            
            acc.totalAmount += amount;
            acc.totalDiscount += discountAmount;
            acc.taxableValue += taxableValue;
            acc.totalCgst += cgst;
            acc.totalSgst += sgst;
            
            return acc;
        }, { totalAmount: 0, totalDiscount: 0, taxableValue: 0, totalCgst: 0, totalSgst: 0 });

        const netAmount = totals.taxableValue + totals.totalCgst + totals.totalSgst;
        const roundedAmount = Math.round(netAmount);
        const roundOff = roundedAmount - netAmount;
        
        const newInvoiceRef = doc(collection(db, "invoices"));
        const newInvoice: Omit<Invoice, 'id'> = {
            invoiceNo: newInvoiceNumberStr,
            orderId: primaryOrder.id,
            isVas: isVas,
            customer: {
                name: primaryOrder.customerName,
                phone: primaryOrder.customerPhone,
                address: primaryOrder.customerAddress,
            },
            salesPerson: primaryOrder.salesPerson,
            items: allItems,
            totals: {
                subTotal: totals.totalAmount,
                totalDiscount: totals.totalDiscount,
                taxableValue: totals.taxableValue,
                cgst: totals.totalCgst,
                sgst: totals.totalSgst,
                igst: 0,
                roundOff: roundOff,
                grandTotal: roundedAmount,
            },
            createdAt: new Date().toISOString(),
            createdBy: creator.name,
            
        };

        batch.set(newInvoiceRef, newInvoice);
        
        const fullInvoiceData = { ...newInvoice, id: newInvoiceRef.id };
        const plainInvoiceData = JSON.parse(JSON.stringify(fullInvoiceData));
        const tallyResult = await sendInvoiceToTally(plainInvoiceData, isVas);
        
        if (tallyResult.success) {
            // --- STOCK DEDUCTION LOGIC (only for non-VAS) ---
            if (!isVas) {
                for (const item of allItems) {
                    const stockId = item.bcn.replace(/\//g, '-');
                    const stockRef = doc(db, 'stocks', stockId);

                    batch.update(stockRef, {
                        quantity: increment(-item.quantityAllocated),
                        reservedQty: increment(-item.quantityAllocated),
                        cutQty: increment(item.quantityAllocated),
                    });
                    
                    if (item.stockAddedId) {
                        const lengthRef = doc(db, 'stocks', stockId, 'lengths', item.stockAddedId);
                        batch.update(lengthRef, {
                            reservedQty: increment(-item.quantityAllocated),
                            cutQty: increment(item.quantityAllocated),
                        });
                    }

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
                    batch.set(transactionRef, transaction);
                }
            }

            if(tallyResult.voucherNumber) {
                const invoiceRefToUpdate = doc(db, "invoices", newInvoiceRef.id);
                batch.update(invoiceRefToUpdate, { tallyVoucherNo: tallyResult.voucherNumber });
                setGeneratedInvoice({ ...fullInvoiceData, tallyVoucherNo: tallyResult.voucherNumber });
            }
        } else {
             setGeneratedInvoice(fullInvoiceData); 
        }
        
        if (!isVas) {
            const newCuttingTaskRef = doc(collection(db, "Cutting"));
            const newCuttingTask: Omit<CuttingTask, 'id'> = {
                invoiceId: newInvoiceRef.id,
                orderId: primaryOrder.id,
                customerName: primaryOrder.customerName,
                customerPhone: primaryOrder.customerPhone,
                salesPerson: primaryOrder.salesPerson,
                items: allItems.map(item => ({ 
                    ...item, 
                    status: 'pending',
                    originalLength: item.originalLength || 0,
                })),
                createdAt: new Date().toISOString(),
                status: "Pending",
            };
            batch.set(newCuttingTaskRef, newCuttingTask);
        }

        batches.forEach(b => {
            const batchRef = doc(db, "invoiceBatches", b.id);
            batch.update(batchRef, { status: "invoiced", invoiceId: newInvoiceRef.id });
        });

        if (!isVas) {
            const allOrderFabricNames = (primaryOrder.fabricDetails || []).map(f => f.fabricName);
            const allBatchesQuery = query(collection(db, 'invoiceBatches'), where('orderId', '==', primaryOrder.id));
            const allBatchesSnapshot = await getDocs(allBatchesQuery);
            const allInvoicedItems = allBatchesSnapshot.docs.flatMap(doc => (doc.data() as InvoiceBatch).items.map(item => item.itemName));
            const currentBatchItems = allItems.map(item => item.itemName);
            allInvoicedItems.push(...currentBatchItems);
            const allItemsInvoiced = allOrderFabricNames.every(name => allInvoicedItems.includes(name));

            if (allItemsInvoiced) {
                const orderRef = doc(db, "orders", primaryOrder.id);
                const updatedMilestones = primaryOrder.milestones.map(m =>
                    m.id === 3
                    ? { ...m, completed: true, completedAt: new Date().toISOString(), completedBy: creator.name }
                    : m
                );
                batch.update(orderRef, { milestones: updatedMilestones });
            }
        }
        
        await batch.commit();
        setTallySyncResult(tallyResult); 

    } catch (error) {
        console.error("Error finalizing invoice:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not finalize the invoice.' });
    } finally {
        setIsGenerating(false);
    }
  }, [creator, toast, batches, orders]);
  
  const handlePreVoucherCheck = React.useCallback(async () => {
    if (!creator) return;
    setIsGenerating(true);
    const isVasInvoice = batches.length > 0 && batches[0].isVas === true;
    
    if (isVasInvoice) {
        await handleFinalGenerate(true);
        return;
    }

    const mismatches: MismatchItem[] = [];
    const allItems = batches.flatMap(b => b.items);

    for (const item of allItems) {
        const crmRes = await getFirestoreStockQuantity(item.bcn);
        const tallyRes = await getStockFromTally(item.bcn);
        
        if (!crmRes.success || !tallyRes.success) {
            setMismatchedItems([{ 
                itemName: `Could not verify stock for ${item.bcn}.`,
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
        
        if (crmQty !== tallyQty) {
          mismatches.push({ 
              itemName: item.bcn, 
              crmQty, 
              tallyQty, 
              errorType: 'mismatch',
              difference: crmQty - tallyQty
          });
        }
    }
    
    if (mismatches.length > 0) {
      setMismatchedItems(mismatches);
      setIsStockMismatchOpen(true);
      setIsGenerating(false);
    } else {
      await handleFinalGenerate(false);
    }
  }, [creator, batches, handleFinalGenerate, toast]);

  const handlePrint = () => {
    const printContent = document.getElementById('printable-invoice-content');
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write('<html><head><title>Print Invoice</title></head><body>');
    printWindow.document.write(printContent.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
    }, 250);
  };

  const resetAndClose = () => {
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
                <PrintableInvoice batches={batches} orders={orders} preGeneratedInvoiceNo={generatedInvoice?.invoiceNo}/>
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
    <StockMismatchDialog
      isOpen={isStockMismatchOpen}
      onClose={() => setIsStockMismatchOpen(false)}
      mismatchedItems={mismatchedItems}
    />
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

const parseDateSafe = (dateInput: any): Date | null => {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;
    // Handle Firestore Timestamp object which has toDate() method
    if (typeof dateInput.toDate === 'function') {
        return dateInput.toDate();
    }
    // Handle ISO string
    if (typeof dateInput === 'string') {
        const date = new Date(dateInput);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    return null;
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
    view: 'active' | 'vas' | 'all'
}) {
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
    const [isGenerateDialogOpen, setIsGenerateDialogOpen] = React.useState(false);
    const [isViewInvoiceOpen, setIsViewInvoiceOpen] = React.useState(false);
    const [selectedBatchForView, setSelectedBatchForView] = React.useState<InvoiceBatch | null>(null);
    const [isCombineDialogOpen, setIsCombineDialogOpen] = React.useState(false);

    const { user } = useAuth();
    const { toast } = useToast();

    const handleViewClick = (batch: InvoiceBatch) => {
        setSelectedBatchForView(batch);
        setIsViewInvoiceOpen(true);
    };

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
            const allRows = table.getFilteredRowModel().rows;
            const availableRows = allRows.filter(row => row.original.status !== 'invoiced');
            availableRows.forEach(row => row.toggleSelected(!!value));
          }}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
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
        return (
          <div className="flex items-center gap-1">
            {batch.isCombined && <Combine className="mr-2 h-4 w-4 text-muted-foreground" title="Combined Invoice" />}
            <span>{orderId.replace("MOTRACK-", "")}</span>
          </div>
        );
      }
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Invoice Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = parseDateSafe(row.original.createdAt);
        return date ? format(date, "dd/MM/yyyy HH:mm") : "Invalid Date";
      }
    },
    {
      accessorKey: "customerName",
      header: "Customer Name",
    },
    {
      accessorKey: "customerPhone",
      header: "Phone",
    },
    {
      id: 'totalAmount',
      header: "Invoice Amount",
      cell: ({ row }) => {
        const subtotal = row.original.items.reduce((sum, item) => {
          const amount = item.quantityAllocated * item.rate;
          const discountAmount = amount * ((item.discountPercent || 0) / 100);
          return sum + (amount - discountAmount);
        }, 0);
      
        const tax = subtotal * 0.05; // 5% total tax (2.5% CGST + 2.5% SGST)
        const totalAmount = subtotal + tax;
        const roundedAmount = Math.round(totalAmount);
        return `₹${roundedAmount.toFixed(2)}`;
      }
      
      ,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        const tallyBillNo = row.original.tallyVoucherNo;
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
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      rowSelection,
    },
    enableRowSelection: row => row.original.status !== 'invoiced',
  });

  const selectedBatches = table.getFilteredSelectedRowModel().rows.map(row => row.original);
  const selectedOrders = orders.filter(order => selectedBatches.some(batch => batch.orderId === order.id));
  const canGenerate = selectedBatches.length > 0 && selectedBatches.every(b => b.status === 'pendingInvoice');
  const canCombine = selectedBatches.length > 1;

  const handleCombineClick = () => {
    if (!canCombine) return;

    const firstOrderId = selectedBatches[0].orderId;
    if (selectedBatches.some(b => b.orderId !== firstOrderId)) {
        toast({
            variant: "destructive",
            title: "Cannot Combine",
            description: "You can only combine invoices that belong to the same order."
        });
        return;
    }
    setIsCombineDialogOpen(true);
  };
  
  const handleConfirmCombine = async () => {
      // The Firestore Timestamp object is not a "plain" object and cannot be passed to a Server Action.
      // We must serialize it first.
      const plainBatches = JSON.parse(JSON.stringify(selectedBatches));
      const result = await combineInvoiceBatchesAction(plainBatches);
      if(result.success) {
          toast({ title: 'Success', description: result.message });
          table.resetRowSelection();
      } else {
          toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
      setIsCombineDialogOpen(false);
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
                      onClick={() => setIsGenerateDialogOpen(true)}
                      disabled={!canGenerate}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Generate
                    </Button>
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button>
            </div>
        </CardContent>
      </Card>
       <GenerateInvoiceDialog
            isOpen={isGenerateDialogOpen}
            onClose={() => setIsGenerateDialogOpen(false)}
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
                        <PrintableInvoice
                            batches={[selectedBatchForView]}
                            orders={orders.filter(o => o.id === selectedBatchForView.orderId)}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                const printContent = document.getElementById('printable-invoice-view-content');
                                if (!printContent) return;
                                const printWindow = window.open('', '_blank');
                                if (!printWindow) return;
                                printWindow.document.write('<html><head><title>Print Invoice</title></head><body>');
                                printWindow.document.write(printContent.innerHTML);
                                printWindow.document.write('</body></html>');
                                printWindow.document.close();
                                setTimeout(() => {
                                    printWindow.focus();
                                    printWindow.print();
                                }, 250);
                            }}
                        >
                            <Printer className="mr-2 h-4 w-4" /> Print
                        </Button>
                        <Button variant="ghost" onClick={() => setIsViewInvoiceOpen(false)}>Close</Button>
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
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmCombine}>Combine</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>
  )
}

export default function InvoicePage() {
  const [activeBatches, setActiveBatches] = React.useState<InvoiceBatch[]>([]);
  const [vasBatches, setVasBatches] = React.useState<InvoiceBatch[]>([]);
  const [allOrders, setAllOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { toast } = useToast();

  React.useEffect(() => {
    setLoading(true);
    const batchesQuery = query(collection(db, "invoiceBatches"), orderBy("createdAt", "desc"));
    const ordersQuery = query(collection(db, "orders"));

    const unsubscribeBatches = onSnapshot(batchesQuery, (snapshot) => {
        const batchesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as InvoiceBatch));
        // Filter for active standard invoices (not VAS)
        setActiveBatches(batchesData.filter(b => b.status === 'pendingInvoice' && !b.isVas));
        // Filter for active VAS invoices
        setVasBatches(batchesData.filter(b => b.status === 'pendingInvoice' && b.isVas));
    }, (error) => {
      console.error("Error fetching invoice batches:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load invoice data." });
    });

    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
        setAllOrders(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Order)));
    }, (error) => {
        console.error("Error fetching orders:", error);
    });

    Promise.all([getDocs(batchesQuery), getDocs(ordersQuery)]).finally(() => setLoading(false));

    return () => {
      unsubscribeBatches();
      unsubscribeOrders();
    };
  }, [toast]);
    
  return (
    <div className="w-full p-4 md:p-6 lg:p-8">
        <header className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Generate Invoice</h1>
            <p className="text-muted-foreground">
                Select allocated items to generate and log invoices.
            </p>
        </header>

        <Tabs defaultValue="active-invoices">
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="active-invoices">Active Invoices</TabsTrigger>
                <TabsTrigger value="vas-invoices">VAS Invoice</TabsTrigger>
                <TabsTrigger value="tally-log">Tally Log / Invoice History</TabsTrigger>
            </TabsList>
            <TabsContent value="active-invoices" className="mt-4">
                 <InvoiceTable batches={activeBatches} orders={allOrders} loading={loading} view="active" />
            </TabsContent>
            <TabsContent value="vas-invoices" className="mt-4">
                 <InvoiceTable batches={vasBatches} orders={allOrders} loading={loading} view="vas" />
            </TabsContent>
            <TabsContent value="tally-log" className="mt-4">
                <InvoiceLogTable />
            </TabsContent>
        </Tabs>
    </div>
  )
}
