
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
import { ArrowLeft, ArrowUpDown, Download, MoreHorizontal, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import Link from 'next/link';


const data = [
    {
        id: "1",
        collectionBrand: "F 185381",
        serialNo: "213",
        hsnCode: "540792",
        mrp: "1968.00",
        taxName: "SALES@ 5%",
        clPrice: "1085.00",
        netRate: "2167.62",
        totalOrderQty: 3,
        stock: 0,
        openPoQty: 0,
        vendorName: "D DECOR CURTAIN FABRICS LLP (SANSAAR)",
        remark: "-",
    },
    {
        id: "2",
        collectionBrand: "WS 91917",
        serialNo: "EC_473-ASSORT",
        hsnCode: "540773",
        mrp: "795.00",
        taxName: "SALES@ 5%",
        clPrice: "280.00",
        netRate: "426.19",
        totalOrderQty: 6,
        stock: 13.8,
        openPoQty: 0,
        vendorName: "D DECOR (HOME IDEAS)",
        remark: "-",
    },
    {
        id: "3",
        collectionBrand: "FURNISHING FABRIC",
        serialNo: "NA",
        hsnCode: "540772",
        mrp: "10.00",
        taxName: "SALES@ 5%",
        clPrice: "5.00",
        netRate: "376.19",
        totalOrderQty: 6,
        stock: 1.45,
        openPoQty: 27.35,
        vendorName: "MO",
        remark: "-",
    },
];

type PendingPO = typeof data[0];

const columns: ColumnDef<PendingPO>[] = [
    {
      id: "select",
      header: ({ table }) => ( <Checkbox checked={table.getIsAllPageRowsSelected()} onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)} aria-label="Select all" /> ),
      cell: ({ row }) => ( <Checkbox checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(!!value)} aria-label="Select row" /> ),
      enableSorting: false,
      enableHiding: false,
    },
    { accessorKey: "collectionBrand", header: "Collection/Brand" },
    { accessorKey: "serialNo", header: "Serial No" },
    { accessorKey: "hsnCode", header: "HSN Code" },
    { accessorKey: "mrp", header: "MRP" },
    { accessorKey: "taxName", header: "Tax Name" },
    { accessorKey: "clPrice", header: "CL Price" },
    { accessorKey: "netRate", header: "Net Rate" },
    { accessorKey: "totalOrderQty", header: "Total Order Qty" },
    { accessorKey: "stock", header: "Stock" },
    { accessorKey: "openPoQty", header: "Open PO Qty" },
    { accessorKey: "vendorName", header: "Vendor Name" },
    { accessorKey: "remark", header: "Remark" },
  ];


export default function PendingPOPage() {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = React.useState({})

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      rowSelection,
    },
  })

  return (
    <div className="w-full p-4 md:p-6 lg:p-8">
        <header className="flex items-center justify-between mb-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Pending Purchase Order Report</h1>
                <p className="text-muted-foreground">Select items to generate a Purchase Order.</p>
            </div>
            <Button variant="outline" asChild>
                <Link href="/dashboard/purchase">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Purchases
                </Link>
            </Button>
        </header>
        
        <Card>
            <CardContent className="p-4">
                 <div className="flex items-center py-4">
                    <div className="relative flex-grow">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search in table..."
                            onChange={(event) => {
                                const query = event.target.value;
                                table.setGlobalFilter(query);
                            }}
                            className="w-full max-w-sm pl-9"
                        />
                    </div>
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
                            {table.getRowModel().rows?.length ? (
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
                                No results.
                                </TableCell>
                            </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                 <div className="flex items-center justify-between space-x-2 py-4">
                    <div className="flex-1 text-sm text-muted-foreground">
                        {table.getFilteredSelectedRowModel().rows.length} of{" "}
                        {table.getFilteredRowModel().rows.length} row(s) selected.
                    </div>
                     <div className="flex items-center gap-2">
                        <Checkbox id="proceed-remark" />
                        <label htmlFor="proceed-remark" className="text-sm font-medium">Proceed with SO remark</label>
                    </div>
                    <div className="space-x-2">
                        <Button variant="outline">Cancel</Button>
                        <Button>Proceed To PO</Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>
  )
}
