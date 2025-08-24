

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
import { ArrowUpDown, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Invoice } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import Link from 'next/link';
import { sendInvoiceToTally } from "@/services/tally";

export function InvoiceLogTable() {
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

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
    const selectedInvoices = table.getFilteredSelectedRowModel().rows.map(row => row.original);
    if (selectedInvoices.length === 0) {
      toast({ variant: 'destructive', title: 'No Invoices Selected', description: 'Please select at least one invoice to sync.' });
      return;
    }
    
    setIsSyncing(true);
    toast({ title: 'Sync Started', description: `Sending ${selectedInvoices.length} invoices to Tally...` });

    for (const invoice of selectedInvoices) {
        try {
            const result = await sendInvoiceToTally(invoice, invoice.isVas);
            if (result.success && result.voucherNumber) {
                const invoiceRef = doc(db, "invoices", invoice.id);
                await updateDoc(invoiceRef, { tallyVoucherNo: result.voucherNumber });
                toast({ title: `Success for #${invoice.invoiceNo}`, description: `Voucher created in Tally: ${result.voucherNumber}` });
            } else {
                toast({ variant: 'destructive', title: `Failed for #${invoice.invoiceNo}`, description: result.message });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: `Error for #${invoice.invoiceNo}`, description: error.message });
        }
    }
    
    setIsSyncing(false);
    table.resetRowSelection();
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
      id: "company",
      header: "Company",
      cell: ({ row }) => (row.original.isVas ? 'MO SPACE' : 'MO DESIGNS'),
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
        accessorKey: "customer.name",
        header: "Customer",
        cell: ({row}) => row.original.customer.name
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
        cell: ({ row }) => `₹${row.original.totals.grandTotal.toFixed(2)}`,
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

  return (
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
  )
}
