
"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Loader2, Download } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Order, FabricDetail } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface FlattenedOrderItem {
  orderId: string;
  customerName: string;
  salesPerson: string;
  orderDate: string;
  itemName: string;
  quantity: string;
  rate?: number;
  discountPercent?: number;
}

export function SoOrderTable({ orders, loading }: { orders: Order[], loading: boolean }) {
  const [globalFilter, setGlobalFilter] = React.useState('');
  const { toast } = useToast();

  const flattenedItems = React.useMemo(() => {
    return orders.flatMap(order => 
      (order.fabricDetails || []).map(item => ({
        orderId: order.crmOrderNo,
        customerName: order.customerName,
        salesPerson: order.salesPerson,
        orderDate: order.createdAt,
        itemName: item.fabricName,
        quantity: item.quantity,
        rate: item.rate,
        discountPercent: item.discountPercent,
      }))
    );
  }, [orders]);

  const columns: ColumnDef<FlattenedOrderItem>[] = [
    {
      accessorKey: "orderId",
      header: "Order No",
    },
    {
      accessorKey: "customerName",
      header: "Customer Name",
    },
     {
      accessorKey: "salesPerson",
      header: "Sales Person",
    },
    {
      accessorKey: "orderDate",
      header: "Order Date",
      cell: ({ row }) => format(new Date(row.original.orderDate), "dd/MM/yyyy"),
    },
    {
      accessorKey: "itemName",
      header: "Item BCN",
    },
    {
      accessorKey: "quantity",
      header: "Quantity (Mtr)",
    },
    {
      accessorKey: "rate",
      header: "Rate",
      cell: ({ row }) => `₹${(row.original.rate || 0).toFixed(2)}`,
    },
    {
      accessorKey: "discountPercent",
      header: "Discount",
      cell: ({ row }) => `${(row.original.discountPercent || 0).toFixed(2)}%`,
    },
    {
        id: 'finalAmount',
        header: 'Final Amount',
        cell: ({ row }) => {
            const item = row.original;
            const subtotal = (Number(item.quantity) || 0) * (item.rate || 0);
            const discount = subtotal * ((item.discountPercent || 0) / 100);
            const final = subtotal - discount;
            return `₹${final.toFixed(2)}`;
        }
    }
  ];

  const table = useReactTable({
    data: flattenedItems,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    state: {
      globalFilter,
    },
  });

  const handleExport = () => {
    toast({ title: "Export Started", description: "Generating Sales Order item report..." });
    const dataToExport = table.getFilteredRowModel().rows.map(row => {
        const item = row.original;
        const subtotal = (Number(item.quantity) || 0) * (item.rate || 0);
        const discount = subtotal * ((item.discountPercent || 0) / 100);
        const finalAmount = subtotal - discount;

        return {
            "Order No": item.orderId,
            "Customer Name": item.customerName,
            "Sales Person": item.salesPerson,
            "Order Date": format(new Date(item.orderDate), 'yyyy-MM-dd'),
            "Item BCN": item.itemName,
            "Quantity (Mtr)": item.quantity,
            "Rate": item.rate?.toFixed(2),
            "Discount %": item.discountPercent?.toFixed(2),
            "Final Amount": finalAmount.toFixed(2),
        };
    });

    if (dataToExport.length === 0) {
      toast({ variant: "destructive", title: "No data to export" });
      return;
    }
    
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "SO Items");
    XLSX.writeFile(workbook, `motrack_so_items_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: "Export Complete!", description: "Your Sales Order item report has been downloaded." });
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between py-4">
          <Input
            placeholder="Search all columns..."
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="max-w-sm"
          />
           <Button onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export to Excel
            </Button>
        </div>
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
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button>
        </div>
      </CardContent>
    </Card>
  );
}
