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
import { ArrowUpDown, ChevronRight, Loader2, FileText, Printer, CheckCircle, XCircle, Combine } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { collection, onSnapshot, query, getDocs, doc, writeBatch, where, orderBy, limit, increment, collectionGroup, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { InvoiceBatch, Order, Invoice, CuttingTask, StockTransaction } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintableInvoice, PrintableInvoicePayload } from "@/components/features/invoice/PrintableInvoice";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { InvoiceLogTable } from "@/components/features/invoice/InvoiceLogTable";
import { sendInvoiceToTally } from "@/services/tally";
import { combineInvoiceBatchesAction } from "./actions";

interface QuotationItem {
  collectionBrand: string;
  salesDescription: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  gstPercent: number;
  cgst: number;
  sgst: number;
  igst: number;
  subtotal: number;
  taxableAmt: number;
  room?: string;
}

interface QuotationData {
  billingName: string;
  billingAddress: string;
  company: string;
  customerName: string;
  items: QuotationItem[];
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
  const [tallySyncResult, setTallySyncResult] = React.useState<{ success: boolean; message: string; voucherNumber?: string; } | null>(null);
  const [payload, setPayload] = React.useState<PrintableInvoicePayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { toast } = useToast();

  React.useEffect(() => {
    if (!isOpen || batches.length === 0 || orders.length === 0) {
      setPayload(null);
      return;
    }

    const fetchAndBuildPayload = async () => {
      try {
        const primaryOrder = orders[0];
        const isVas = batches[0].isVas === true;

        // Extract quotation number from order
        const quotationNo = primaryOrder.crmOrderNo;

        // Fetch quotation from collectionGroup
        const quotationSnapshot = await getDocs(
          query(
            collectionGroup(db, "quotations"),
            where("quotationNo", "==", quotationNo),
            limit(1)
          )
        );

        if (quotationSnapshot.empty) {
          setError(`Quotation not found for order ${quotationNo}`);
          return;
        }

        const quotationData = quotationSnapshot.docs[0].data() as QuotationData;

        // Build invoice items from quotation
        const invoiceItems = quotationData.items.map(item => ({
          name: item.salesDescription || item.collectionBrand,
          bcn: item.collectionBrand,
          hsn: "54076190",
          quantity: item.quantity,
          uom: 'Mtr' as const,
          rate: item.rate,
          discountPercent: item.discountPercent,
          taxableAmount: item.taxableAmt,
          cgst: item.cgst,
          sgst: item.sgst,
          igst: item.igst,
          total: item.subtotal,
        }));

        // Calculate totals from quotation items
        const totals = quotationData.items.reduce(
          (acc, item) => ({
            subTotal: acc.subTotal + (item.rate * item.quantity),
            discount: acc.discount + ((item.rate * item.quantity * item.discountPercent) / 100),
            taxableValue: acc.taxableValue + item.taxableAmt,
            cgst: acc.cgst + item.cgst,
            sgst: acc.sgst + item.sgst,
            igst: acc.igst + item.igst,
          }),
          { subTotal: 0, discount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
        );

        const grandTotal = totals.taxableValue + totals.cgst + totals.sgst + totals.igst;
        const roundedTotal = Math.round(grandTotal);
        const roundOff = roundedTotal - grandTotal;

        // Build GST breakdown by rate
        const gstBreakdownMap = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
        
        quotationData.items.forEach(item => {
          const existing = gstBreakdownMap.get(item.gstPercent);
          if (existing) {
            existing.taxable += item.taxableAmt;
            existing.cgst += item.cgst;
            existing.sgst += item.sgst;
            existing.igst += item.igst;
          } else {
            gstBreakdownMap.set(item.gstPercent, {
              rate: item.gstPercent,
              taxable: item.taxableAmt,
              cgst: item.cgst,
              sgst: item.sgst,
              igst: item.igst,
            });
          }
        });

        const gstBreakdown = Array.from(gstBreakdownMap.values());

        const newPayload: PrintableInvoicePayload = {
          meta: {
            orderNo: primaryOrder.id,
            quotationNo: primaryOrder.crmOrderNo,
            invoiceDate: new Date().toISOString(),
            isVas: isVas,
            salesPerson: primaryOrder.salesPerson,
          },
          customer: {
            name: quotationData.billingName || primaryOrder.customerName,
            phone: primaryOrder.customerPhone,
            address: quotationData.billingAddress || primaryOrder.customerAddress,
          },
          seller: {
            companyName: quotationData.company || (isVas ? 'MO SPACES PVT.LTD.' : 'MO Designs Private Limited - (2024-2025)'),
            address: 'A-6, Sushant Lok-1, M G Road, Gurgaon- 122022, B-50, Sushant Lok-2, Sec- 56, Gurgaon - 122011 GURGAON. (HARYANA) INDIA',
            gstin: '06AAMCM5012B1ZY',
          },
          items: invoiceItems,
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
          gstBreakdown: gstBreakdown,
        };

        setPayload(newPayload);
        setError(null);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to build invoice');
      }
    };

    fetchAndBuildPayload();
  }, [isOpen, batches, orders]);

  const handleGenerate = React.useCallback(async () => {
    if (!creator || !payload) {
      toast({ variant: 'destructive', title: 'Error', description: 'Missing required data' });
      return;
    }

    setIsGenerating(true);

    try {
      const batch = writeBatch(db);
      const primaryOrder = orders[0];
      const isVas = batches[0].isVas === true;

      console.log("batch :", batch);
      console.log("order :", primaryOrder);

      // Create invoice
      const invoiceRef = doc(collection(db, "invoices"));
      
      const invoiceData: Omit<Invoice, 'id' | 'invoiceNo'> = {
        orderId: primaryOrder.id,
        isVas: isVas,
        customer: payload.customer,
        salesPerson: primaryOrder.salesPerson,
        items: payload.items.map(item => ({
          itemName: item.name,
          bcn: item.bcn,
          quantityAllocated: item.quantity,
          rate: item.rate,
          discountPercent: item.discountPercent,
        })),
        totals: payload.totals,
        gstPercentages: {
          cgst: payload.gstBreakdown[0]?.rate / 2 || 2.5,
          sgst: payload.gstBreakdown[0]?.rate / 2 || 2.5,
          igst: 0,
          total: payload.gstBreakdown[0]?.rate || 5,
        },
        createdAt: new Date().toISOString(),
        createdBy: creator.name,
        invoiceNo: '',
      };

      batch.set(invoiceRef, invoiceData);

      // Send to Tally
      // const tallyResult = await sendInvoiceToTally(
      //   { ...invoiceData, id: invoiceRef.id, invoiceNo: '' },
      //   isVas
      // );

      // if (tallyResult.success && tallyResult.voucherNumber) {
      //   batch.update(invoiceRef, {
      //     tallyVoucherNo: tallyResult.voucherNumber,
      //     invoiceNo: tallyResult.voucherNumber,
      //   });
      // }

      // Handle stock deduction for non-VAS
      if (!isVas) {
        for (const item of payload.items) {
          const stockId = item.bcn.replace(/\//g, '-');
          const stockRef = doc(db, 'stocks', stockId);

          batch.update(stockRef, {
            quantity: increment(-item.quantity),
            reservedQty: increment(-item.quantity),
            cutQty: increment(item.quantity),
          });

          const transactionRef = doc(collection(stockRef, 'stockSold'));
          const transaction: Omit<StockTransaction, 'id'> = {
            stockId: stockId,
            bcn: item.bcn,
            type: 'deduction',
            quantityChange: -item.quantity,
            orderId: primaryOrder.id,
            createdAt: new Date().toISOString(),
            createdBy: creator.name,
            status: 'cut'
          };
          batch.set(transactionRef, transaction);
        }

        // Create cutting task
        const cuttingTaskRef = doc(collection(db, "Cutting"));
        const cuttingTask: Omit<CuttingTask, 'id'> = {
          invoiceId: invoiceRef.id,
          orderId: primaryOrder.id,
          customerName: primaryOrder.customerName,
          customerPhone: primaryOrder.customerPhone,
          salesPerson: primaryOrder.salesPerson,
          items: payload.items.map(item => ({
            itemName: item.name,
            bcn: item.bcn,
            quantityAllocated: item.quantity,
            rate: item.rate,
            discountPercent: item.discountPercent,
            status: 'pending',
            originalLength: 0,
          })),
          createdAt: new Date().toISOString(),
          status: "Pending",
        };
        batch.set(cuttingTaskRef, cuttingTask);
      }

      // Update batches
      batches.forEach((b) => {
        const batchRef = doc(db, "invoiceBatches", b.id);
        batch.update(batchRef, { status: "invoiced", invoiceId: invoiceRef.id });
      });

      await batch.commit();
      // setTallySyncResult(tallyResult);

      toast({ 
        title: 'Success', 
        description: 'Invoice generated successfully' 
      });

    } catch (error) {
      toast({ 
        variant: 'destructive', 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'Failed to generate invoice' 
      });
    } finally {
      setIsGenerating(false);
    }
  }, [creator, toast, batches, orders, payload]);

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
    setTallySyncResult(null);
    setError(null);
    onClose();
  };

  if (error) {
    return (
      <AlertDialog open={isOpen} onOpenChange={onClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="text-destructive" />
              Error Loading Invoice
            </AlertDialogTitle>
            <AlertDialogDescription>{error}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={onClose}>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <>
      <Dialog open={isOpen && !tallySyncResult} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Generate Invoice</DialogTitle>
            <DialogDescription>
              Review the invoice details before generating.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto pr-4" id="printable-invoice-content">
            {payload ? <PrintableInvoice payload={payload} /> : <Loader2 className="h-6 w-6 animate-spin mx-auto" />}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="outline" onClick={handlePrint} disabled={!payload}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating || !payload}>
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <FileText className="mr-2 h-4 w-4" />
              Generate Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!tallySyncResult} onOpenChange={resetAndClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {tallySyncResult?.success ? (
                <CheckCircle className="text-green-500" />
              ) : (
                <XCircle className="text-destructive" />
              )}
              Invoice {tallySyncResult?.success ? "Generated Successfully" : "Generation Failed"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tallySyncResult?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {tallySyncResult?.voucherNumber && (
            <div className="py-2">
              <p className="text-sm font-semibold">Invoice Number:</p>
              <p className="text-lg font-mono p-2 bg-muted rounded-md">
                {tallySyncResult.voucherNumber}
              </p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogAction onClick={resetAndClose}>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function InvoiceTable({
  batches,
  orders,
  loading,
  view
}: {
  batches: InvoiceBatch[];
  orders: Order[];
  loading: boolean;
  view: 'active' | 'all';
}) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = React.useState(false);
  const [isCombineDialogOpen, setIsCombineDialogOpen] = React.useState(false);

  const ordersById = React.useMemo(() => {
    return new Map(orders.map(order => [order.id, order]));
  }, [orders]);

  const { user } = useAuth();
  const { toast } = useToast();

  const parseDateSafe = (dateInput: any): Date | null => {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;
    if (typeof dateInput.toDate === 'function') return dateInput.toDate();
    if (typeof dateInput === 'string') {
      const d = new Date(dateInput);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };

  const columns: ColumnDef<InvoiceBatch>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => {
            const availableRows = table.getFilteredRowModel().rows.filter(row => row.original.status !== 'invoiced');
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
        const displayId = batch.orderId.replace("MOTRACK-", "");
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
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
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
  ];

  const table = useReactTable({
    data: batches,
    columns,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting, rowSelection },
    enableRowSelection: row => row.original.status !== 'invoiced',
  });

  const selectedBatches = table.getFilteredSelectedRowModel().rows.map(row => row.original);
  const selectedOrders = orders.filter(order => selectedBatches.some(batch => batch.orderId === order.id));
  const canGenerate = selectedBatches.length > 0 && selectedBatches.every(b => b.status === 'pendingInvoice');
  const canCombine = selectedBatches.length > 1;

  const handleCombineClick = () => {
    if (!canCombine) return;

    const firstOrderId = selectedBatches[0].orderId;
    const allSameOrder = selectedBatches.every(b => b.orderId === firstOrderId);

    if (!allSameOrder) {
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
    const plainBatches = JSON.parse(JSON.stringify(selectedBatches));
    const result = await combineInvoiceBatchesAction(plainBatches);

    if (result.success) {
      toast({ title: 'Success', description: result.message });
      table.resetRowSelection();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsCombineDialogOpen(false);
  };

  return (
    <>
      <Card>
        <div className="p-4">
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
              {table.getFilteredSelectedRowModel().rows.length} of {table.getFilteredRowModel().rows.length} row(s) selected.
            </div>
            {view !== 'all' && (
              <div className="flex items-center gap-2">
                <Button onClick={handleCombineClick} disabled={!canCombine} variant="outline">
                  <Combine className="mr-2 h-4 w-4" />
                  Combine Invoice
                </Button>
                <Button onClick={() => setIsGenerateDialogOpen(true)} disabled={!canGenerate}>
                  <FileText className="mr-2 h-4 w-4" />
                  Generate
                </Button>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
            </Button>
          </div>
        </div>
      </Card>

      <GenerateInvoiceDialog
        isOpen={isGenerateDialogOpen}
        onClose={() => setIsGenerateDialogOpen(false)}
        batches={selectedBatches}
        orders={selectedOrders}
        creator={user ? { id: user.uid, name: user.displayName || 'System' } : null}
      />

      <AlertDialog open={isCombineDialogOpen} onOpenChange={setIsCombineDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Combine Invoices?</AlertDialogTitle>
            <AlertDialogDescription>
              This will combine {selectedBatches.length} invoice batches into one. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCombine}>Combine</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
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

    const unsubscribeBatches = onSnapshot(
      batchesQuery,
      (snapshot) => {
        const batchesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as InvoiceBatch));
        setActiveBatches(batchesData.filter(b => b.status === 'pendingInvoice' && !b.isVas));
        setVasBatches(batchesData.filter(b => b.status === 'pendingInvoice' && b.isVas));
      },
      (error) => {
        toast({ variant: "destructive", title: "Error", description: "Could not load invoice data." });
      }
    );

    const unsubscribeOrders = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Order));
        setAllOrders(ordersData);
      },
      (error) => {
        toast({ variant: "destructive", title: "Error", description: "Could not load orders." });
      }
    );

    Promise.all([getDocs(batchesQuery), getDocs(ordersQuery)])
      .finally(() => setLoading(false));

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
          <InvoiceTable batches={vasBatches} orders={allOrders} loading={loading} view="active" />
        </TabsContent>
        
        <TabsContent value="tally-log" className="mt-4">
          <InvoiceLogTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
