
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
import { ArrowUpDown, ChevronRight, Loader2, FileText, Printer } from "lucide-react";

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
import { collection, onSnapshot, query, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { InvoiceBatch, Order } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { PrintableInvoice } from "@/components/features/invoice/PrintableInvoice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog";


function GenerateInvoiceDialog({
  isOpen,
  onClose,
  batches,
  orders,
}: {
  isOpen: boolean;
  onClose: () => void;
  batches: InvoiceBatch[];
  orders: Order[];
}) {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isTallyDialogOpen, setIsTallyDialogOpen] = React.useState(false);
  const [tallyBillNo, setTallyBillNo] = React.useState('');
  const { toast } = useToast();

  const handleFinalGenerate = () => {
    setIsTallyDialogOpen(false);
    setIsGenerating(true);
    // In a real app, you would call a server action here to create the invoice PDFs,
    // update the batch status, and save the tallyBillNo.
    console.log("Finalizing invoice with Tally Bill No:", tallyBillNo || "None");
    setTimeout(() => {
        toast({ title: "Invoice Generated!", description: "The invoice has been successfully generated."});
        setIsGenerating(false);
        onClose();
    }, 1500);
  }
  
  const handlePrint = () => {
    const printContent = document.getElementById('printable-invoice-content');
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write('<html><head><title>Print Invoice</title>');
    printWindow.document.write('<style>@media print { body { -webkit-print-color-adjust: exact; } table { page-break-inside: auto; } tr { page-break-inside: avoid; page-break-after: auto; } thead { display: table-header-group; } tfoot { display: table-footer-group; } }</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(printContent.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
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


export default function InvoicePage() {
  const [batches, setBatches] = React.useState<InvoiceBatch[]>([]);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    setLoading(true);
    const batchesQuery = query(collection(db, "invoiceBatches"));
    const ordersQuery = query(collection(db, "orders"));

    const unsubscribeBatches = onSnapshot(batchesQuery, (snapshot) => {
        const batchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InvoiceBatch));
        setBatches(batchesData);
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

  const columns: ColumnDef<InvoiceBatch>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
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
        const totalAmount = row.original.items.reduce((sum, item) => {
          return sum + (item.quantityAllocated * item.rate);
        }, 0);
        return `₹${totalAmount.toFixed(2)}`;
      },
    },
    {
        id: 'actions',
        cell: ({ row }) => <Button variant="ghost" size="icon"><ChevronRight className="h-4 w-4"/></Button>
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
  });

  const selectedBatches = table.getFilteredSelectedRowModel().rows.map(row => row.original);
  const selectedOrders = orders.filter(order => selectedBatches.some(batch => batch.orderId === order.id));


  return (
    <>
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Invoice</h1>
        <p className="text-muted-foreground">
          Items that have been allocated and are ready for invoicing.
        </p>
      </header>
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
                <Button 
                  onClick={() => setIsGenerateDialogOpen(true)}
                  disabled={table.getFilteredSelectedRowModel().rows.length === 0}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Generate
                </Button>
                <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button>
            </div>
        </CardContent>
      </Card>
    </div>
    <GenerateInvoiceDialog
      isOpen={isGenerateDialogOpen}
      onClose={() => setIsGenerateDialogOpen(false)}
      batches={selectedBatches}
      orders={selectedOrders}
    />
    </>
  );
}
