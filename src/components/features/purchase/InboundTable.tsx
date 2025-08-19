
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
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InboundProcessTimeline } from "./InboundProcessTimeline";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { INBOUND_PROCESS_CONFIG } from "@/lib/constants";
import { format } from 'date-fns';

interface FlattenedInboundItem {
  id: string; // Unique ID for the row
  dealId: string;
  poNumber?: string;
  customerName: string;
  salesman: string;
  status: string;
  createdAt: string;
  itemName: string;
  quantity: string;
  vendorName?: string;
  type: 'fabric' | 'furniture';
  originalRequest: PurchaseRequest;
}

export function InboundTable({ tableData }: { tableData: PurchaseRequest[] }) {
  const [requests, setRequests] = React.useState<FlattenedInboundItem[]>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [timelineRequest, setTimelineRequest] = React.useState<InboundRequest | null>(null);

  React.useEffect(() => {
    const processData = async () => {
        const flattenedDataPromises = tableData.flatMap(req => {
            // Filter for items that actually have a PO number, as those are the only ones relevant for inbound.
            const itemsWithPo = (req.fabricDetails || []).filter(item => !!item.poNumber);

            return itemsWithPo.map(async item => {
                let statusText = 'Pending Receiving'; // Default status

                if (item.poNumber) {
                    const inboundRef = doc(db, 'inbounds', item.poNumber);
                    try {
                        const inboundSnap = await getDoc(inboundRef);
                        if (inboundSnap.exists()) {
                            const inboundData = inboundSnap.data() as InboundRequest;
                            // Check the specific item within the inbound document
                            const inboundItem = inboundData.items.find(i => i.itemName === item.fabricName);
                            const completedMilestones = (inboundItem?.inboundMilestones || []);
                            const completedStepsCount = completedMilestones.length;

                            if (completedStepsCount === INBOUND_PROCESS_CONFIG.length) {
                                statusText = 'Received';
                            } else if (completedStepsCount > 0) {
                                const lastCompletedStepId = completedMilestones.sort((a,b) => new Date(b.completedAt).getTime() - new Date(a.createdAt).getTime())[0].stepId;
                                const lastStepConfig = INBOUND_PROCESS_CONFIG.find(step => step.id === lastCompletedStepId);
                                statusText = lastStepConfig?.name || "In Progress";
                            } else {
                                // If the inbound doc exists but no milestones, it's pending the first step
                                statusText = INBOUND_PROCESS_CONFIG[0]?.name || "Pending Receiving";
                            }
                        }
                    } catch (e) {
                        console.error(`Could not fetch inbound doc for PO ${item.poNumber}`, e);
                        statusText = "Error fetching status";
                    }
                }
                
                return {
                    id: `${req.id}-${item.fabricName}`,
                    dealId: req.dealId,
                    poNumber: item.poNumber,
                    customerName: req.customerName,
                    salesman: req.salesman,
                    status: statusText,
                    createdAt: req.createdAt,
                    itemName: item.fabricName,
                    quantity: item.quantity,
                    vendorName: item.vendorName,
                    type: 'fabric' as const,
                    originalRequest: req,
                };
            });
        });
        const flattenedData = await Promise.all(flattenedDataPromises);
        setRequests(flattenedData.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    };
    
    processData();
  }, [tableData]);

  const handlePoClick = async (poNumber: string) => {
    const inboundRef = doc(db, 'inbounds', poNumber);
    const inboundSnap = await getDoc(inboundRef);
    if (inboundSnap.exists()) {
        const data = { id: inboundSnap.id, ...inboundSnap.data() } as InboundRequest;
        if (data.items) {
            data.items = data.items.map(item => ({ ...item, inboundMilestones: item.inboundMilestones || [] }));
        }
        setTimelineRequest(data);
    }
  };

  const columns: ColumnDef<FlattenedInboundItem>[] = [
    {
      accessorKey: "dealId",
      header: "Order ID",
      cell: ({ row }) => {
        const poNumber = row.original.poNumber;
        const link = poNumber ? `/dashboard/inbound/${poNumber}` : '#';
        return (
          <Button asChild variant="link" className="p-0 h-auto font-medium">
            <Link href={link}>
              {row.getValue("dealId")}
            </Link>
          </Button>
        )
      },
    },
    { 
        accessorKey: "poNumber", 
        header: "PO Number",
        cell: ({ row }) => {
            const poNumber = row.original.poNumber;
            return poNumber ? (
                <Button variant="link" className="p-0 h-auto" onClick={() => handlePoClick(poNumber)}>{poNumber}</Button>
            ) : null;
        }
    },
    { accessorKey: "customerName", header: "Customer Name" },
    { accessorKey: "itemName", header: "Item Name" },
    { accessorKey: "quantity", header: "Qty" },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
            const status = row.original.status;
            const isCompleted = status === 'Received';
            return <Badge variant={isCompleted ? 'default' : 'secondary'} className={isCompleted ? 'bg-green-600' : ''}>{status}</Badge>;
        }
    },
    { accessorKey: "createdAt", header: "Created Date", cell: ({ row }) => format(new Date(row.original.createdAt), 'dd/MM/yyyy') },
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
            <DropdownMenuItem asChild>
                <Link href={`/dashboard/inbound/${row.original.poNumber}`}>
                    View Inbound Process
                </Link>
            </DropdownMenuItem>
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
                    No items pending for inbound processing.
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
    <Dialog open={!!timelineRequest} onOpenChange={() => setTimelineRequest(null)}>
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>Inbound Process for PO #{timelineRequest?.id}</DialogTitle>
                <DialogDescription>
                    This timeline shows the receiving process for each item in the Purchase Order.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 max-h-[70vh] overflow-y-auto">
                {timelineRequest && <InboundProcessTimeline request={timelineRequest} />}
            </div>
        </DialogContent>
    </Dialog>
    </>
  );
}
