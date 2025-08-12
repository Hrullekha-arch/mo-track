

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
import { ArrowUpDown, ChevronRight, Loader2, FileText, Printer, PlusCircle, Search, X, CalendarIcon } from "lucide-react";
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
import { collection, onSnapshot, query, getDocs, doc, updateDoc, writeBatch, addDoc, where, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { format, isWithinInterval } from "date-fns";
import { InvoiceBatch, Order, Invoice, CuttingTask, CuttingTaskItem } from "@/lib/types";
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
  const [isTallyDialogOpen, setIsTallyDialogOpen] = React.useState(false);
  const [tallyBillNo, setTallyBillNo] = React.useState('');
  const { toast } = useToast();

  const handleFinalGenerate = async () => {
    if (!creator) {
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to perform this action.' });
        return;
    }
    setIsTallyDialogOpen(false);
    setIsGenerating(true);
    
    try {
        const batch = writeBatch(db);
        const primaryOrder = orders[0];
        
        // Generate a new 4-digit unique numeric invoice number
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
        
        // Combine all items from all selected batches
        const allItems = batches.flatMap(b => b.items);

        // Calculate totals for the new invoice document
        const totals = allItems.reduce((acc, item) => {
            const qty = item.quantityAllocated;
            const rate = item.rate;
            const amount = qty * rate;
            const discountAmount = 0; // Assuming 0 discount for now
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
        
        // 1. Create the new Invoice document with the numeric ID
        const newInvoiceRef = doc(collection(db, "invoices")); // Still generate a doc for a unique ID
        const newInvoice: Omit<Invoice, 'id'> = {
            invoiceNo: String(newInvoiceNumber), // Use the new numeric string ID
            orderId: primaryOrder.id,
            tallyBillNo: tallyBillNo || undefined,
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
                igst: 0, // Assuming IGST is 0 for now
                roundOff: roundOff,
                grandTotal: roundedAmount,
            },
            createdAt: new Date().toISOString(),
            createdBy: creator.name,
        };
        batch.set(newInvoiceRef, newInvoice);

        // 2. Create a new Cutting Task document
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
                originalLength: item.originalLength || 0, // Ensure originalLength is passed
            })),
            createdAt: new Date().toISOString(),
            status: "Pending",
        };
        batch.set(newCuttingTaskRef, newCuttingTask);


        // 3. Update all selected batches status
        batches.forEach(b => {
            const batchRef = doc(db, "invoiceBatches", b.id);
            batch.update(batchRef, { status: "invoiced", tallyBillNo: tallyBillNo || null, invoiceId: newInvoiceRef.id });
        });

        // 4. Check if all items for the order are now invoiced and update the milestone
        const allOrderFabricNames = (primaryOrder.fabricDetails || []).map(f => f.fabricName);

        // Fetch all invoice batches for this order to get a complete picture
        const allBatchesQuery = query(collection(db, 'invoiceBatches'), where('orderId', '==', primaryOrder.id));
        const allBatchesSnapshot = await getDocs(allBatchesQuery);
        const allInvoicedItems = allBatchesSnapshot.docs.flatMap(doc => (doc.data() as InvoiceBatch).items.map(item => item.itemName));
        
        // Add items from the current batch being created
        const currentBatchItems = allItems.map(item => item.itemName);
        allInvoicedItems.push(...currentBatchItems);

        const allItemsInvoiced = allOrderFabricNames.every(name => allInvoicedItems.includes(name));

        if (allItemsInvoiced) {
            const orderRef = doc(db, "orders", primaryOrder.id);
            const updatedMilestones = primaryOrder.milestones.map(m =>
                m.id === 3 // "Sent to Stitching" milestone
                ? { ...m, completed: true, completedAt: new Date().toISOString(), completedBy: creator.name }
                : m
            );
            batch.update(orderRef, { milestones: updatedMilestones });
        }
        
        await batch.commit();

        toast({ title: "Invoice Generated!", description: `Invoice ${String(newInvoiceNumber)} has been created and sent for cutting.`});
        onClose();
    } catch (error) {
        console.error("Error finalizing invoice:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not finalize the invoice.' });
    } finally {
        setIsGenerating(false);
    }
  }
  
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
                <PrintableInvoice batches={batches} orders={orders} />
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button variant="outline" onClick={handlePrint}><Printer className="mr-2 h-4 w-4"/> Print</Button>
                <Button onClick={() => setIsTallyDialogOpen(true)} disabled={isGenerating}>
                    {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm & Generate
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
     <AlertDialog open={isTallyDialogOpen} onOpenChange={setIsTallyDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Enter Tally Bill No.</AlertDialogTitle>
                <AlertDialogDescription>
                    Please enter the Tally Bill number for this invoice. This is optional.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
                <Label htmlFor="tally-bill-no" className="sr-only">Tally Bill No.</Label>
                <Input
                    id="tally-bill-no"
                    value={tallyBillNo}
                    onChange={(e) => setTallyBillNo(e.target.value)}
                    placeholder="Optional Tally Bill No..."
                />
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleFinalGenerate}>Submit</AlertDialogAction>
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
        const variant = status === 'pending' ? 'secondary' : 'default';
        const color = status === 'pending' ? '' : 'bg-green-600';
        return <Badge variant={variant} className={color}>{tallyBillNo ? `${status}: ${tallyBillNo}` : status}</Badge>;
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
  const canGenerate = selectedBatches.length > 0 && selectedBatches.every(b => b.status === 'pending');

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
  const [batches, setBatches] = React.useState<InvoiceBatch[]>([]);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { toast } = useToast();

  const [orderNoFilter, setOrderNoFilter] = React.useState("");
  const [dateRangeFilter, setDateRangeFilter] = React.useState<DateRange | undefined>();
  const [storeFilter, setStoreFilter] = React.useState("all");

  React.useEffect(() => {
    setLoading(true);
    const batchesQuery = query(collection(db, "invoiceBatches"));
    const ordersQuery = query(collection(db, "orders"));

    const unsubscribeBatches = onSnapshot(batchesQuery, (snapshot) => {
        const batchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InvoiceBatch));
        setBatches(batchesData.sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis()));
    }, (error) => {
        console.error("Error fetching invoice batches:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load invoice data." });
    });

    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        setOrders(ordersData);
    }, (error) => {
        console.error("Error fetching orders:", error);
    });

    Promise.all([
        getDocs(batchesQuery),
        getDocs(ordersQuery)
    ]).finally(() => setLoading(false));

    return () => {
      unsubscribeBatches();
      unsubscribeOrders();
    };
  }, [toast]);
  
  const clearFilters = () => {
    setOrderNoFilter("");
    setDateRangeFilter(undefined);
    setStoreFilter("all");
  };

  const filteredBatches = React.useMemo(() => {
    return batches.filter(batch => {
      const order = orders.find(o => o.id === batch.orderId);
      if (!order) return false; // Should not happen if data is consistent

      const orderNoMatch = orderNoFilter ? batch.orderId.includes(orderNoFilter.toUpperCase()) : true;
      const dateMatch = dateRangeFilter?.from ? isWithinInterval(batch.createdAt.toDate(), { start: dateRangeFilter.from, end: dateRangeFilter.to || dateRangeFilter.from }) : true;
      const storeMatch = storeFilter === 'all' ? true : order.storeName === storeFilter;

      return orderNoMatch && dateMatch && storeMatch;
    });
  }, [batches, orders, orderNoFilter, dateRangeFilter, storeFilter]);

  const activeBatches = React.useMemo(() => batches.filter(b => b.status === 'pending'), [batches]);
  const uniqueStores = [...new Set(orders.map(o => o.storeName).filter(Boolean))];

  return (
    <>
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Invoice</h1>
        <p className="text-muted-foreground">
          Items that have been allocated and are ready for invoicing.
        </p>
      </header>
       <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="active">Active Invoices</TabsTrigger>
                <TabsTrigger value="all">All Invoices</TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="pt-4">
                <InvoiceTable batches={activeBatches} orders={orders} loading={loading} view="active" />
            </TabsContent>
            <TabsContent value="all" className="pt-4">
                <div className="mb-6 p-4 border rounded-lg bg-card space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <Input
                            placeholder="Order No (e.g. MOTRACK-...)"
                            value={orderNoFilter}
                            onChange={(e) => setOrderNoFilter(e.target.value)}
                        />
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                id="date"
                                variant={"outline"}
                                className={cn(
                                    "justify-start text-left font-normal",
                                    !dateRangeFilter && "text-muted-foreground"
                                )}
                                >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRangeFilter?.from ? (
                                    dateRangeFilter.to ? (
                                    <>
                                        {format(dateRangeFilter.from, "LLL dd, y")} -{" "}
                                        {format(dateRangeFilter.to, "LLL dd, y")}
                                    </>
                                    ) : (
                                    format(dateRangeFilter.from, "LLL dd, y")
                                    )
                                ) : (
                                    <span>Pick a date range</span>
                                )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={dateRangeFilter?.from}
                                selected={dateRangeFilter}
                                onSelect={setDateRangeFilter}
                                numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                         <Select value={storeFilter} onValueChange={setStoreFilter}>
                            <SelectTrigger><SelectValue placeholder="Store" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Stores</SelectItem>
                                {uniqueStores.map(store => <SelectItem key={store} value={store!}>{store}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="flex gap-2">
                        <Button onClick={() => { /* The filtering is now automatic */ }}><Search className="mr-2 h-4 w-4"/>Search</Button>
                        <Button variant="outline" onClick={clearFilters}><X className="mr-2 h-4 w-4"/>Clear</Button>
                    </div>
                </div>
                <InvoiceTable batches={filteredBatches} orders={orders} loading={loading} view="all" />
            </TabsContent>
        </Tabs>
    </div>
    </>
  );
}
