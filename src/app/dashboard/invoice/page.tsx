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
const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const computeVasTax = (taxable: number, gstPercent: number) => {
  const tax = taxable * (gstPercent / 100);
  return {
    cgst: tax / 2,
    sgst: tax / 2,
    igst: 0,
    total: taxable + tax,
  };
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
  creator: { id: string; name: string } | null;
}) {
  const [normalPayload, setNormalPayload] = React.useState<PrintableInvoicePayload | null>(null);
  const [vasPayload, setVasPayload] = React.useState<PrintableInvoicePayload | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { toast } = useToast();

  /* ================= FETCH + BUILD ================= */
  React.useEffect(() => {
    if (!isOpen || !orders.length) {
      setNormalPayload(null);
      setVasPayload(null);
      return;
    }

    const fetchAndBuildPayload = async () => {
      try {
        const order = orders[0];
        const quotationNo = order.crmOrderNo;

        const snap = await getDocs(
          query(
            collectionGroup(db, "quotations"),
            where("quotationNo", "==", quotationNo),
            limit(1)
          )
        );

        if (snap.empty) throw new Error("Quotation not found");

        const q = snap.docs[0].data() as any;

        const hasItems = q.items?.length > 0;
        const hasVas = q.vasDetails?.length > 0;

        /* ========== NORMAL ITEMS ========== */
        if (hasItems) {
          const items = q.items.map((i: any) => ({
            name: i.salesDescription || i.collectionBrand,
            bcn: i.collectionBrand,
            hsn: "54076190",
            quantity: num(i.quantity),
            uom: "Mtr",
            rate: num(i.rate),
            discountPercent: num(i.discountPercent),
            taxableAmount: num(i.taxableAmt),
            cgst: num(i.cgst),
            sgst: num(i.sgst),
            igst: num(i.igst),
            total: num(i.subtotal),
          }));

          const totals = items.reduce(
            (a, i) => {
              a.subTotal += i.rate * i.quantity;
              a.discount += (i.rate * i.quantity * i.discountPercent) / 100;
              a.taxableValue += i.taxableAmount;
              a.cgst += i.cgst;
              a.sgst += i.sgst;
              a.igst += i.igst;
              return a;
            },
            { subTotal: 0, discount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
          );

          const gross = totals.taxableValue + totals.cgst + totals.sgst + totals.igst;
          const rounded = Math.round(gross);

          setNormalPayload({
            meta: {
              orderNo: order.id,
              quotationNo,
              invoiceDate: new Date().toISOString(),
              isVas: false,
              salesPerson: order.salesPerson,
            },
            customer: {
              name: q.billingName || order.customerName,
              phone: order.customerPhone,
              address: q.billingAddress || order.customerAddress,
            },
            seller: {
              companyName: "MO Designs Private Limited - (2024-2025)",
              address: "A-6, Sushant Lok-1, Gurgaon",
              gstin: "06AAMCM5012B1ZY",
            },
            items,
            totals: {
              ...totals,
              roundOff: rounded - gross,
              grandTotal: rounded,
              totalGst: totals.cgst + totals.sgst + totals.igst,
            },
            gstBreakdown: [],
          });
        }

        /* ========== VAS ITEMS ========== */
        if (hasVas) {
          const items = q.vasDetails.map((v: any) => {
            const qty = num(v.quantity);
            const rate = num(v.rate);
            const taxable = qty * rate;
            const gst = num(v.gstPercent || 18);
            const tax = computeVasTax(taxable, gst);

            return {
              name: v.vasName,
              bcn: `VAS-${v.vasName}`,
              hsn: "998819",
              quantity: qty,
              uom: "Pcs",
              rate,
              discountPercent: 0,
              taxableAmount: taxable,
              cgst: tax.cgst,
              sgst: tax.sgst,
              igst: 0,
              total: tax.total,
            };
          });

          const totals = items.reduce(
            (a, i) => {
              a.subTotal += i.rate * i.quantity;
              a.taxableValue += i.taxableAmount;
              a.cgst += i.cgst;
              a.sgst += i.sgst;
              return a;
            },
            { subTotal: 0, discount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
          );

          const gross = totals.taxableValue + totals.cgst + totals.sgst;
          const rounded = Math.round(gross);

          setVasPayload({
            meta: {
              orderNo: order.id,
              quotationNo,
              invoiceDate: new Date().toISOString(),
              isVas: true,
              salesPerson: order.salesPerson,
            },
            customer: {
              name: q.billingName || order.customerName,
              phone: order.customerPhone,
              address: q.billingAddress || order.customerAddress,
            },
            seller: {
              companyName: "MO SPACES PVT.LTD.",
              address: "A-6, Sushant Lok-1, Gurgaon",
              gstin: "06AAMCM5012B1ZY",
            },
            items,
            totals: {
              ...totals,
              roundOff: rounded - gross,
              grandTotal: rounded,
              totalGst: totals.cgst + totals.sgst,
            },
            gstBreakdown: [],
          });
        }
      } catch (e: any) {
        setError(e.message);
      }
    };

    fetchAndBuildPayload();
  }, [isOpen, orders]);

  /* ================= GENERATE ================= */
  const handleGenerate = async () => {
    if (!creator) return;

    try {
      setIsGenerating(true);
      const batch = writeBatch(db);
      const order = orders[0];

      const createInvoice = async (payload: PrintableInvoicePayload) => {
        const ref = doc(collection(db, "invoices"));
        batch.set(ref, {
          orderId: order.id,
          isVas: payload.meta.isVas,
          customer: payload.customer,
          salesPerson: payload.meta.salesPerson,
          items: payload.items,
          totals: payload.totals,
          createdAt: new Date().toISOString(),
          createdBy: creator.name,
        });

        // Stock + Cutting ONLY for non-VAS
        if (!payload.meta.isVas) {
          for (const item of payload.items) {
            const stockRef = doc(db, "stocks", item.bcn.replace(/\//g, "-"));
            batch.update(stockRef, {
              quantity: increment(-item.quantity),
              reservedQty: increment(-item.quantity),
              cutQty: increment(item.quantity),
            });
          }
        }
      };

      if (normalPayload) await createInvoice(normalPayload);
      if (vasPayload) await createInvoice(vasPayload);

      await batch.commit();

      toast({ title: "Success", description: "Invoice(s) generated successfully" });
      onClose();

    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setIsGenerating(false);
    }
  };

  /* ================= UI ================= */
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl h-[90vh]">
        <DialogHeader>
          <DialogTitle>Generate Invoice</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto space-y-10">
          {normalPayload && <PrintableInvoice payload={normalPayload} />}
          {vasPayload && <PrintableInvoice payload={vasPayload} />}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            Generate Invoice{normalPayload && vasPayload ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  //   const result = await combineInvoiceBatchesAction(plainBatches);

  //   if (result.success) {
  //     toast({ title: 'Success', description: result.message });
  //     table.resetRowSelection();
  //   } else {
  //     toast({ variant: 'destructive', title: 'Error', description: result.message });
  //   }
  //   setIsCombineDialogOpen(false);
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
