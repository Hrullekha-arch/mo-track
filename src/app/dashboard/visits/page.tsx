
"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { collectionGroup, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DealVisit } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';

interface EnrichedDealVisit extends DealVisit {
    customerName: string;
    dealId: string;
    customerId: string;
}

export default function AllVisitsPage() {
  const [visits, setVisits] = React.useState<EnrichedDealVisit[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const { toast } = useToast();

  React.useEffect(() => {
    setLoading(true);
    const visitsQuery = query(collectionGroup(db, "visits"));

    const unsubscribe = onSnapshot(visitsQuery, (snapshot) => {
        const visitsData = snapshot.docs.map(doc => {
            const pathSegments = doc.ref.path.split('/');
            // customers/{customerId}/deals/{dealId}/visits/{visitId}
            const customerId = pathSegments[1];
            const dealId = pathSegments[3];
            
            // This is a simplified way to get customer name.
            // In a real app, you might fetch the customer doc, but this avoids many reads.
            // We assume the deal page will provide the full context.
            const customerName = "Customer"; // Placeholder, real data might need another query.
            
            return {
                ...doc.data() as DealVisit,
                id: doc.id,
                customerId,
                dealId,
                customerName: `Customer of Deal ${dealId.substring(0,5)}` // Temporary name
            }
        });
      setVisits(visitsData);
      setLoading(false);
    }, (error) => {
        console.error("Error fetching all visits:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load visit data." });
        setLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);


  const columns: ColumnDef<EnrichedDealVisit>[] = [
    {
      accessorKey: "dealId",
      header: "Deal ID",
      cell: ({ row }) => (
          <Button asChild variant="link" className="p-0 h-auto">
             <Link href={`/dashboard/customers/${row.original.customerId}/${row.original.dealId}`}>
                {row.original.dealId}
             </Link>
          </Button>
      )
    },
    {
      accessorKey: "typeOfVisit",
      header: "Visit Type",
      cell: ({ row }) => <Badge variant="outline" className="capitalize">{row.getValue("typeOfVisit")}</Badge>,
    },
     {
      accessorKey: "dueDate",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Due Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => format(new Date(row.getValue("dueDate")), "PPP p"),
    },
    {
      accessorKey: "representative",
      header: "Representative",
    },
    {
      accessorKey: "createdBy",
      header: "Created By",
    },
    {
      accessorKey: "createdAt",
      header: "Created On",
      cell: ({ row }) => format(new Date(row.getValue("createdAt")), "dd/MM/yyyy"),
    },
  ];

  const table = useReactTable({
    data: visits,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  });

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-10 w-full mt-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
        <header className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">All Visits</h1>
            <p className="text-muted-foreground">A centralized log of all customer visits and appointments.</p>
        </header>
        <Card>
            <CardContent className="p-4">
                 <div className="flex items-center py-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Filter by Deal ID..."
                            value={(table.getColumn("dealId")?.getFilterValue() as string) ?? ""}
                            onChange={(event) =>
                                table.getColumn("dealId")?.setFilterValue(event.target.value)
                            }
                            className="max-w-sm pl-9"
                        />
                    </div>
                </div>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                return (
                                    <TableHead key={header.id}>
                                    {header.isPlaceholder
                                        ? null
                                        : flexRender(
                                            header.column.columnDef.header,
                                            header.getContext()
                                        )}
                                    </TableHead>
                                );
                                })}
                            </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                key={row.id}
                                data-state={row.getIsSelected() && "selected"}
                                >
                                {row.getVisibleCells().map((cell) => (
                                    <TableCell key={cell.id}>
                                    {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext()
                                    )}
                                    </TableCell>
                                ))}
                                </TableRow>
                            ))
                            ) : (
                            <TableRow>
                                <TableCell
                                colSpan={columns.length}
                                className="h-24 text-center"
                                >
                                No results.
                                </TableCell>
                            </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                 <div className="flex items-center justify-end space-x-2 py-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        Next
                    </Button>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}

