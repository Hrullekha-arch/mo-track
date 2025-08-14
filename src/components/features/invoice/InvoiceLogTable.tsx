
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
} from "@tanstack/react-table";
import { ArrowUpDown, FileText } from "lucide-react";

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
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Invoice } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import Link from 'next/link';

export function InvoiceLogTable() {
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'createdAt', desc: true }]);
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

  const columns: ColumnDef<Invoice>[] = [
    {
      accessorKey: "invoiceNo",
      header: "Invoice No",
      cell: ({ row }) => <div className="font-mono">{row.getValue("invoiceNo")}</div>,
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
      accessorKey: "tallyBillNo",
      header: "Tally Bill No",
       cell: ({ row }) => row.original.tallyBillNo || '-',
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
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

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
                                No invoices found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
             <div className="flex items-center justify-end space-x-2 py-4">
                <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button>
            </div>
        </CardContent>
      </Card>
  )
}
