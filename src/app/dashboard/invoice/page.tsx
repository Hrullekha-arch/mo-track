
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
import { ArrowUpDown, ChevronRight, Loader2 } from "lucide-react";

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
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { InvoiceBatch } from "@/lib/types";

export default function InvoicePage() {
  const [batches, setBatches] = React.useState<InvoiceBatch[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const { toast } = useToast();

  React.useEffect(() => {
    setLoading(true);
    const batchesQuery = query(
        collection(db, "invoiceBatches"), 
        where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(batchesQuery, (snapshot) => {
        const batchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InvoiceBatch));
        // Sort manually since we removed orderBy from query
        batchesData.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
        setBatches(batchesData);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching invoice batches:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Could not load invoice data.",
        });
        setLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  const columns: ColumnDef<InvoiceBatch>[] = [
    {
      id: "index",
      header: "#",
      cell: ({ row, table }) => {
        const sortedRowModel = table.getSortedRowModel().rows;
        const rowIndex = sortedRowModel.findIndex(sortedRow => sortedRow.id === row.id);
        return <span>{rowIndex + 1}</span>;
      },
    },
    {
        accessorKey: "orderId",
        header: "Order No",
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
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  return (
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
                                Auto Fetch
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
    </div>
  );
}
