
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
import { MoreHorizontal } from "lucide-react";
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
import { PurchaseRequest } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PoTrackingTimeline } from "./PoTrackingTimeline";
import { AlertDialog } from "@/components/ui/alert-dialog";


interface FlattenedPoItem {
  id: string;
  orderId: string;
  poNumber?: string;
  customerName: string;
  itemName: string;
  quantity: string;
  salesman: string;
  createdAt: string;
  originalRequest: PurchaseRequest;
}

export function PoGenTable({ tableData }: { tableData: PurchaseRequest[] }) {
  const [requests, setRequests] = React.useState<FlattenedPoItem[]>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [timelineRequest, setTimelineRequest] = React.useState<PurchaseRequest | null>(null);

  React.useEffect(() => {
    const flattenedData: FlattenedPoItem[] = tableData.flatMap(req => {
      const fabricItems = (req.fabricDetails || [])
        .filter(item => !!item.poNumber) // Filter for items that have a PO number
        .map(item => ({
          id: `${req.id}-${item.fabricName}`,
          orderId: req.dealId,
          poNumber: item.poNumber,
          customerName: req.customerName,
          salesman: req.salesman,
          createdAt: req.createdAt,
          itemName: item.fabricName,
          quantity: item.quantity,
          originalRequest: req,
        }));
      return [...fabricItems];
    });
    setRequests(flattenedData);
  }, [tableData]);

  const columns: ColumnDef<FlattenedPoItem>[] = [
    { accessorKey: "orderId", header: "Order ID",
      cell: ({ row }) => (
          <Button variant="link" onClick={() => setTimelineRequest(row.original.originalRequest)} className="p-0 h-auto font-medium">
              {row.getValue("orderId")}
          </Button>
      )
    },
    { accessorKey: "poNumber", header: "PO Number" },
    { accessorKey: "customerName", header: "Customer Name" },
    { accessorKey: "itemName", header: "Item Name" },
    { accessorKey: "quantity", header: "Qty" },
    { accessorKey: "salesman", header: "Salesman" },
    {
      accessorKey: "createdAt",
      header: "Created Date",
      cell: ({ row }) => new Date(row.getValue("createdAt")).toLocaleDateString(),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View Details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const table = useReactTable({
    data: requests,
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

  return (
    <>
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center py-4">
          <Input
            placeholder="Search..."
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="max-w-sm"
          />
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
                    No POs generated yet.
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
     <AlertDialog>
        <Dialog open={!!timelineRequest} onOpenChange={() => setTimelineRequest(null)}>
            <DialogContent className="max-w-2xl">
                 <DialogHeader>
                    <DialogTitle>PO Tracking for {timelineRequest?.dealId}</DialogTitle>
                    <DialogDescription>
                        This timeline shows the progress of the Purchase Order after it has been placed.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    {timelineRequest && (
                       
                            <PoTrackingTimeline 
                                request={timelineRequest}
                                onStepUpdate={() => {}}
                                onRevertStep={() => {}}
                                userRole={null}
                            />
                       
                    )}
                </div>
            </DialogContent>
        </Dialog>
     </AlertDialog>
    </>
  );
}
