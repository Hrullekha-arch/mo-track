
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
import { InboundRequest, PurchaseRequest, PurchaseStatus } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PoTrackingTimeline } from "./PoTrackingTimeline";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { PO_PROCESS_CONFIG, calculateExpectedDatesForPO } from "@/lib/constants";
import { format, isPast } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";


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
  };
  nextStatus: {
      text: string;
      role: string;
      expectedDate: Date;
      isOverdue: boolean;
  } | null;
}

export function PoGenTable({ tableData }: { tableData: PurchaseRequest[] }) {
  const [requests, setRequests] = React.useState<FlattenedPoItem[]>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [timelineRequest, setTimelineRequest] = React.useState<PurchaseRequest | null>(null);

  React.useEffect(() => {
    const processData = async () => {
        const flattenedDataPromises = tableData.flatMap(req => {
            const itemsWithPo = (req.fabricDetails || []).filter(item => !!item.poNumber);

            return itemsWithPo.map(async item => {
                // 1. Consolidate all milestones for this specific item from all sources.
                const allItemMilestones: PurchaseStatus[] = (req.poMilestones || []).filter(m => m.itemName === item.fabricName);

                if (item.poNumber) {
                    const inboundRef = doc(db, 'inbounds', item.poNumber);
                    const inboundSnap = await getDoc(inboundRef);
                    if (inboundSnap.exists()) {
                        const inboundData = inboundSnap.data() as InboundRequest;
                        const inboundItem = inboundData.items.find(i => i.itemName === item.fabricName);
                        if (inboundItem && inboundItem.inboundMilestones) {
                            // Find the 'Receiving' step which is stepId 3 in INBOUND_PROCESS_CONFIG
                            const receivingMilestone = inboundItem.inboundMilestones.find(im => im.stepId === 3);
                            if (receivingMilestone) {
                                allItemMilestones.push({
                                    stepId: 3, // Step ID for "Receiving And Sent To Location" from PO_PROCESS_CONFIG
                                    status: 'completed',
                                    completedAt: receivingMilestone.completedAt,
                                    completedBy: receivingMilestone.completedBy,
                                    itemName: item.fabricName,
                                });
                            }
                        }
                    }
                }
                
                // Sort by completion date to find the most recent one
                allItemMilestones.sort((a,b) => new Date(b.completedAt).getTime() - new Date(a.createdAt).getTime());

                const lastCompletedStep = allItemMilestones[0];
                const lastCompletedStepConfig = lastCompletedStep
                    ? PO_PROCESS_CONFIG.find(s => s.id === lastCompletedStep.stepId)
                    : null;
                
                const completedStepIds = allItemMilestones.map(m => m.stepId);
                const firstPendingStepConfig = PO_PROCESS_CONFIG.find(step => !completedStepIds.includes(step.id));
                
                const expectedDates = calculateExpectedDatesForPO(req);

                let nextStatusInfo = null;
                if (firstPendingStepConfig) {
                    const expectedDate = expectedDates[firstPendingStepConfig.id] || new Date();
                    const isOverdue = isPast(expectedDate);
                    nextStatusInfo = {
                        text: firstPendingStepConfig.step,
                        role: firstPendingStepConfig.role,
                        expectedDate: expectedDate,
                        isOverdue: isOverdue,
                    };
                }
                
                let statusInfo = {
                    text: "PO Generated",
                    timestamp: req.createdAt,
                    user: req.createdBy?.name || "System"
                };

                if (lastCompletedStep && lastCompletedStepConfig) {
                    statusInfo = {
                        text: lastCompletedStepConfig.step,
                        timestamp: lastCompletedStep.completedAt,
                        user: lastCompletedStep.completedBy,
                    }
                }
                
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

        const flattenedData = await Promise.all(flattenedDataPromises);
        setRequests(flattenedData.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    };
    
    processData();
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
        cell: ({ row }) => {
            const status = row.original.status;
            return (
                 <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4"/>
                    <div>
                        <p className="font-semibold">{status.text}</p>
                        <p className="text-xs text-muted-foreground">
                            {format(new Date(status.timestamp), 'dd/MM/yy hh:mm a')} by {status.user}
                        </p>
                    </div>
                </div>
            )
        }
    },
    { 
        id: 'nextStatus', 
        header: 'Next Status', 
        cell: ({ row }) => {
            const nextStatus = row.original.nextStatus;
            if (!nextStatus) return <Badge>Completed</Badge>;

            return (
                <div className={cn("flex items-center gap-2", nextStatus.isOverdue && "text-red-600")}>
                    {nextStatus.isOverdue && <Clock className="h-4 w-4" />}
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
