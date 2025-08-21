
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
import { ArrowUpDown, ChevronRight, Loader2, FileText, Printer, PlusCircle, Search, X, CalendarIcon, Code } from "lucide-react";
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
import { collection, onSnapshot, query, getDocs, doc, updateDoc, writeBatch, addDoc, where, orderBy, limit, FieldValue } from "firebase/firestore";
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
  const { toast } = useToast();

  const handleFinalGenerate = React.useCallback(async () => {
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
            const discountAmount = 0;
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

        // Update stock: reduce actual and reserved quantities
        for (const item of allItems) {
            const stockId = item.bcn.replace(/\//g, '-');
            const stockRef = doc(db, 'stocks', stockId);
            batch.update(stockRef, {
                availableQty: FieldValue.increment(-item.quantityAllocated), // Reduce available
                reservedQty: FieldValue.increment(-item.quantityAllocated), // Reduce reserved
                cutQty: FieldValue.increment(item.quantityAllocated),
            });

            // Log stock transaction for cut
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


        batches.forEach(b => {
            const batchRef = doc(db, "invoiceBatches", b.id);
            batch.update(batchRef, { status: "invoiced", invoiceId: newInvoiceRef.id });
        });

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
        
        await batch.commit();
        
        const fullInvoiceData = { ...newInvoice, id: newInvoiceRef.id };
        
        try {
            const tallyResult = await sendInvoiceToTally(fullInvoiceData);
            if(tallyResult.success && tallyResult.voucherNumber) {
                toast({ title: "Tally Sync Success!", description: `Voucher created: ${tallyResult.voucherNumber}` });
                // Update the invoice with the voucher number
                const invoiceRefToUpdate = doc(db, "invoices", newInvoiceRef.id);
                await updateDoc(invoiceRefToUpdate, { tallyVoucherNo: tallyResult.voucherNumber });
                setGeneratedInvoice({ ...fullInvoiceData, tallyVoucherNo: tallyResult.voucherNumber });
            } else {
                 toast({ variant: 'destructive', title: 'Tally Sync Failed', description: tallyResult.message });
                 setGeneratedInvoice(fullInvoiceData); // Still show invoice even if Tally fails
            }
        } catch (tallyError: any) {
             toast({ variant: 'destructive', title: 'Tally Sync Error', description: tallyError.message, duration: 7000 });
             setGeneratedInvoice(fullInvoiceData);
        }

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
    const mismatches: MismatchItem[] = [];
    const allItems = batches.flatMap(b => b.items);

    for (const item of allItems) {
        const crmRes = await getFirestoreStockQuantity(item.bcn);
        const tallyRes = await getStockFromTally(item.bcn);
        
        if (!crmRes.success || !tallyRes.success) {
            toast({ variant: 'destructive', title: 'Verification Error', description: `Could not verify stock for ${item.itemName}. CRM: ${crmRes.message}, Tally: ${tallyRes.message}` });
            setIsGenerating(false);
            return;
        }

        const crmQty = crmRes.quantity ?? 0;
        const tallyQty = tallyRes.quantity ?? 0;
        
        if (crmQty !== tallyQty) {
          mismatches.push({ 
              itemName: item.itemName, 
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
      // If stock matches, proceed directly to generating the invoice and Tally voucher.
      await handleFinalGenerate();
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

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
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
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
    const [isGenerateDialogOpen, setIsGenerateDialogOpen] = React.useState(false);
    const [isViewInvoiceOpen, setIsViewInvoiceOpen] = React.useState(false);
    const [selectedBatchForView, setSelectedBatchForView] = React.useState<InvoiceBatch | null>(null);
    const { user } = useAuth();

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
        const orderId = row.getValue("orderId") as string;
        return orderId.replace("MOTRACK-", "");
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
         const createdAt = row.original.createdAt;
         const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
         return format(date, "dd/MM/yyyy HH:mm");
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
          return sum + (item.quantityAllocated * item.rate);
        }, 0);
        const tax = subtotal * 0.05; // 5% total tax (2.5% CGST + 2.5% SGST)
        const totalAmount = subtotal + tax;
        const roundedAmount = Math.round(totalAmount);
        return `₹${roundedAmount.toFixed(2)}`;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        const tallyBillNo = row.original.tallyBillNo;
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
                {view === 'active' && (
                  <Button 
                    onClick={() => setIsGenerateDialogOpen(true)}
                    disabled={!canGenerate}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Generate
                  </Button>
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
    </>
  )
}

export default function InvoicePage() {
  const [activeBatches, setActiveBatches] = React.useState<InvoiceBatch[]>([]);
  const [allBatches, setAllBatches] = React.useState<InvoiceBatch[]>([]);
  const [allOrders, setAllOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { toast } = useToast();

  React.useEffect(() => {
    setLoading(true);
    const batchesQuery = query(collection(db, "invoiceBatches"), orderBy("createdAt", "desc"));
    const ordersQuery = query(collection(db, "orders"));

    const unsubscribeBatches = onSnapshot(batchesQuery, (snapshot) => {
        const batchesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as InvoiceBatch));
        setActiveBatches(batchesData.filter(b => b.status === 'pendingInvoice'));
        setAllBatches(batchesData);
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
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="active-invoices">Active Invoices</TabsTrigger>
                <TabsTrigger value="tally-log">Tally Log / Invoice History</TabsTrigger>
            </TabsList>
            <TabsContent value="active-invoices" className="mt-4">
                 <InvoiceTable batches={activeBatches} orders={allOrders} loading={loading} view="active" />
            </TabsContent>
            <TabsContent value="tally-log" className="mt-4">
                <InvoiceLogTable />
            </TabsContent>
        </Tabs>
    </div>
  )
}
