
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
import { ArrowUpDown, FileText, Loader2, Eye, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Invoice, PrintableInvoicePayload } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import Link from 'next/link';
import { sendInvoiceToTally } from "@/services/tally";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintableInvoice } from "@/components/features/invoice/PrintableInvoice";
import { buildPrintablePayloadFromInvoice } from "@/lib/invoice-utils";

export function InvoiceLogTable() {
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const [isViewOpen, setIsViewOpen] = React.useState(false);
  const [isFetchingPayload, setIsFetchingPayload] = React.useState(false);
  const [viewPayload, setViewPayload] = React.useState<PrintableInvoicePayload | null>(null);

  const { toast } = useToast();

  React.useEffect(() => {
    const invoicesQuery = query(collection(db, "invoices"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(invoicesQuery, (snapshot) => {
      const invoicesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Invoice));
      setInvoices(invoicesData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching invoices:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load invoice data." });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);
  
  const handleGenerateTallyInvoice = async () => {
    toast({
        title: "Tally Sync Disabled",
        description: "This feature has been temporarily disabled."
    });
    return;
  };
  
  const handleViewInvoice = (invoice: Invoice) => {
    setIsFetchingPayload(true);
    setIsViewOpen(true);
    try {
      const payload = buildPrintablePayloadFromInvoice(invoice);
      setViewPayload(payload);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Could not render invoice.' });
      setIsViewOpen(false);
    } finally {
      setIsFetchingPayload(false);
    }
  };

  const columns: ColumnDef<Invoice>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          disabled={table.getPreFilteredRowModel().rows.every(row => !!row.original.tallyVoucherNo)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          disabled={!!row.original.tallyVoucherNo}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "invoiceNo",
      header: "Invoice No",
      cell: ({ row }) => <div className="font-mono">{row.getValue("invoiceNo")}</div>,
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => {
        const invoice = row.original;
        const type = invoice.invoiceType || (invoice.isVas ? "VAS" : "NORMAL");
        const label = type === "VAS" ? "VAS" : type === "MIXED" ? "Mixed" : "Goods";
        const variant =
          type === "VAS" ? "secondary" : type === "MIXED" ? "outline" : "default";
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      id: "company",
      header: "Company",
      cell: ({ row }) => (row.original.invoiceType === 'VAS' || row.original.isVas ? 'MO SPACE' : 'MO DESIGNS'),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
         const date = new Date(row.getValue("createdAt"));
         return format(date, "dd/MM/yyyy");
      }
    },
    {
        accessorKey: "customerSnapshot.name",
        header: "Customer",
        cell: ({row}) => row.original.customerSnapshot?.name || row.original.customer?.name || "-"
    },
    {
      accessorKey: "orderId",
      header: "Order ID",
      cell: ({ row }) => (
        <Button variant="link" asChild className="p-0 h-auto">
            <Link href={`/dashboard/orders/${row.original.orderId}`}>{row.original.orderId}</Link>
        </Button>
      ),
    },
    {
        accessorKey: "totals.grandTotal",
        header: "Amount",
        cell: ({ row }) => {
          const amount = row.original.totals?.grandTotal ?? row.original.overallSummary?.grandTotal ?? 0;
          return `₹${amount.toFixed(2)}`;
        },
    },
    {
      accessorKey: "tallyVoucherNo",
      header: "Tally Voucher No",
      cell: ({ row }) => row.original.tallyVoucherNo || '-',
    },
     {
      accessorKey: "createdBy",
      header: "Created By",
    },
    {
        id: "actions",
        header: "View",
        cell: ({ row }) => {
            const invoice = row.original;
            return (
                <Button variant="ghost" size="icon" onClick={() => handleViewInvoice(invoice)}>
                    <Eye className="h-4 w-4" />
                </Button>
            );
        },
    }
  ];

  const table = useReactTable({
    data: invoices,
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

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const canSync = selectedRows.length > 0 && selectedRows.every(row => !row.original.tallyVoucherNo);

  const handlePrint = () => {
    const printContent = document.getElementById('printable-invoice-view');
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
    <Card>
        <CardHeader>
            <CardTitle>Tally Log / Invoice History</CardTitle>
            <CardDescription>A log of all generated invoices and their Tally Bill numbers.</CardDescription>
        </CardHeader>
        <CardContent>
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
                                    <Skeleton className="h-20 w-full" />
                                </TableCell>
                            </TableRow>
                        ) : table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
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
                                No invoices found.
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
                    onClick={handleGenerateTallyInvoice}
                    disabled={isSyncing || !canSync}
                 >
                    {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                    Generate Tally Invoice
                 </Button>
                <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button>
            </div>
        </CardContent>
      </Card>
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
            <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Invoice Preview</DialogTitle>
                    <DialogDescription>
                        Viewing invoice #{viewPayload?.meta.invoiceNo} for order {viewPayload?.meta.orderNo}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-grow overflow-y-auto pr-4" id="printable-invoice-view">
                    {isFetchingPayload ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <PrintableInvoice payload={viewPayload} />
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsViewOpen(false)}>Close</Button>
                    <Button variant="outline" onClick={handlePrint}><Printer className="mr-2 h-4 w-4"/>Print</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </>
  )
}

