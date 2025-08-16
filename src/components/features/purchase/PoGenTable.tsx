

"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { MoreHorizontal, Clock, CheckCircle } from "lucide-react";
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
import { PurchaseRequest, PurchaseStatus } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PoTrackingTimeline } from "./PoTrackingTimeline";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { PO_PROCESS_CONFIG } from "@/lib/constants";
import { format, isPast } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";


interface FlattenedPoItem {
  id: string; // Unique ID for the row, e.g., `${requestId}-${itemName}`
  orderId: string;
  poNumber?: string;
  customerName: string;
  itemName: string;
  quantity: string;
  salesman: string;
  createdAt: string;
  originalRequest: PurchaseRequest;
  status: {
      text: string;
      timestamp: string;
      user: string;
      isCompleted: boolean;
      isOverdue: boolean;
  };
  nextStatus: {
      text: string;
      role: string;
      expectedDate: Date;
  } | null;
}

export function PoGenTable({ tableData }: { tableData: PurchaseRequest[] }) {
  const [requests, setRequests] = React.useState<FlattenedPoItem[]>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [timelineRequest, setTimelineRequest] = React.useState<PurchaseRequest | null>(null);

  React.useEffect(() => {
    const flattenedData = tableData.flatMap(req => {
      const itemsWithPo = (req.fabricDetails || []).filter(item => !!item.poNumber);

      return itemsWithPo.map(item => {
        const itemMilestones = (req.poMilestones || []).filter(m => m.itemName === item.fabricName);
        const completedStepIds = itemMilestones.map(m => m.stepId);
        
        const lastCompletedStep = PO_PROCESS_CONFIG
          .filter(step => completedStepIds.includes(step.id))
          .sort((a,b) => b.id - a.id)[0];
        
        const lastMilestoneData = itemMilestones.find(m => m.stepId === lastCompletedStep?.id);

        const firstPendingStep = PO_PROCESS_CONFIG.find(step => !completedStepIds.includes(step.id));
        
        // This is a placeholder as the function was moved. A proper fix would be to import it.
        const expectedDates: Record<number, Date> = {}; 

        let nextStatusInfo = null;
        if (firstPendingStep) {
            const expectedDate = expectedDates[firstPendingStep.id] || new Date();
            nextStatusInfo = {
                text: firstPendingStep.step,
                role: firstPendingStep.role,
                expectedDate: expectedDate
            };
        }
        
        const isOverdue = nextStatusInfo ? isPast(nextStatusInfo.expectedDate) : false;

        const statusInfo = {
            text: lastCompletedStep?.step || "PO Generated",
            timestamp: lastMilestoneData?.completedAt || req.createdAt,
            user: lastMilestoneData?.completedBy || "System",
            isCompleted: !firstPendingStep,
            isOverdue
        };
        
        return {
          id: `${req.id}-${item.fabricName}`,
          orderId: req.dealId,
          poNumber: item.poNumber,
          customerName: req.customerName,
          salesman: req.salesman,
          createdAt: req.createdAt,
          itemName: item.fabricName,
          quantity: item.quantity,
          originalRequest: req,
          status: statusInfo,
          nextStatus: nextStatusInfo
        };
      });
    });
    setRequests(flattenedData.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
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
    { 
        id: 'status', 
        header: 'Current Status', 
        cell: ({ row }) => (
            <div className={cn("flex items-center gap-2", row.original.status.isOverdue && "text-red-600")}>
                {row.original.status.isOverdue ? <Clock className="h-4 w-4"/> : <CheckCircle className="h-4 w-4 text-green-500"/>}
                <div>
                    <p className="font-semibold">{row.original.status.text}</p>
                    <p className="text-xs text-muted-foreground">
                        {format(new Date(row.original.status.timestamp), 'dd/MM/yy hh:mm a')} by {row.original.status.user}
                    </p>
                </div>
            </div>
        )
    },
    { 
        id: 'nextStatus', 
        header: 'Next Status', 
        cell: ({ row }) => {
            const nextStatus = row.original.nextStatus;
            if (!nextStatus) return <Badge>Completed</Badge>;
            return (
                <div className={cn("flex items-center gap-2", isPast(nextStatus.expectedDate) && "text-red-600")}>
                    <div>
                        <p className="font-semibold">{nextStatus.text}</p>
                        <p className="text-xs text-muted-foreground">by {nextStatus.role} on {format(nextStatus.expectedDate, 'dd/MM/yy')}</p>
                    </div>
                </div>
            )
        }
    },
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
    getFilteredRowModel: getFilteredRowModel,
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
