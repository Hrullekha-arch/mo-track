
"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, Download, MoreHorizontal, ShieldAlert, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";

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
import { collection, onSnapshot, query, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Stock } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";

export function StockTable() {
  const [stock, setStock] = React.useState<Stock[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const { role } = useAuth();
  const { toast } = useToast();
  
  const isAuthorized = role === 'admin';

  React.useEffect(() => {
    const stockQuery = query(collection(db, "stocks"));
    const unsubscribe = onSnapshot(stockQuery, (snapshot) => {
      const stockData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stock));
      setStock(stockData);
      setLoading(false);
    }, (error) => {
        console.error("Error fetching stock data:", error);
        toast({
            variant: "destructive",
            title: "Error fetching stock",
            description: "Could not load stock data. Please check Firestore permissions for the 'stocks' collection."
        });
        setLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  const columns: ColumnDef<Stock>[] = [
    {
      accessorKey: "itemName",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Item Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div>{row.getValue("itemName")}</div>,
    },
    {
      accessorKey: "quantity",
      header: "Quantity",
      cell: ({ row }) => <div>{row.getValue("quantity")}</div>,
    },
    {
      accessorKey: "unit",
      header: "Unit",
      cell: ({ row }) => <div>{row.getValue("unit")}</div>,
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <Badge variant="outline" className="capitalize">{row.getValue("type")}</Badge>,
    },
    {
      accessorKey: "vendorName",
      header: "Vendor",
      cell: ({ row }) => <div>{row.getValue("vendorName") || 'N/A'}</div>,
    },
    {
      accessorKey: "sourcePurchaseRequestId",
      header: "Source Deal ID",
      cell: ({ row }) => <div className="font-mono">{row.getValue("sourcePurchaseRequestId")}</div>,
    },
    {
      accessorKey: "lastUpdatedAt",
      header: "Last Updated",
      cell: ({ row }) => new Date(row.getValue("lastUpdatedAt")).toLocaleDateString(),
    },
  ];

  const table = useReactTable({
    data: stock,
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

  const handleExport = () => {
    const dataToExport = table.getFilteredRowModel().rows.map(row => row.original);
    if (dataToExport.length === 0) {
        toast({ variant: "destructive", title: "No data to export" });
        return;
    }
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock");
    XLSX.writeFile(workbook, `motrack_stock_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: "Export Complete!" });
  }

  if (loading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center py-4 gap-4">
          <Input
            placeholder="Filter by item name..."
            value={(table.getColumn("itemName")?.getFilterValue() as string) ?? ""}
            onChange={(event) =>
              table.getColumn("itemName")?.setFilterValue(event.target.value)
            }
            className="max-w-sm"
          />
          <Button onClick={handleExport} className="ml-auto">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
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
  );
}
