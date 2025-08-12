

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
  SortingState,
  ColumnFiltersState
} from "@tanstack/react-table";
import { ArrowUpDown, CheckCircle, Clock, MoreHorizontal, Link as LinkIcon } from "lucide-react";
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
import { collection, onSnapshot, query, doc, where, collectionGroup, getDocs, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, User, Deal, DealVisit, Quotation, PurchaseRequest, Customer, O2DStep, O2DProcess } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isPast, formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { setBalanceFollowUp } from "@/app/dashboard/all-orders/actions";
import { O2D_PROCESS_CONFIG, calculateExpectedDatesForOrder } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Link from 'next/link';

interface O2DViewItem {
  dealId: string;
  customerName: string;
  salesPerson: string;
  crmHandler: string;
  orderId?: string;
  dealCreatedAt: string;
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
  history: {
      stepName: string;
      status: string;
      timestamp: string;
      user: string;
  }[];
  expectedDates: Record<number, Date>;
  originalO2D: O2DProcess;
}

const creatorName = (userId: string | undefined, userList: User[]) => {
    if (!userId) return 'System';
    return userList.find(u => u.id === userId)?.name || 'Unknown';
};


export function O2DTable() {
  const [viewData, setViewData] = React.useState<O2DViewItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [selectedDeal, setSelectedDeal] = React.useState<O2DViewItem | null>(null);

  const { toast } = useToast();
  
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
        const o2dQuery = query(collection(db, 'o2d'), where('isAcknowledged', '==', false));
        const o2dSnapshot = await getDocs(o2dQuery);
        
        const o2dProcesses = o2dSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as O2DProcess));

        const enrichedData = o2dProcesses.map((o2d) => {
            const history: O2DViewItem['history'] = o2d.milestones.map(m => ({
                stepName: O2D_PROCESS_CONFIG.find(s => s.id === m.stepId)?.step || 'Unknown Step',
                status: m.status,
                timestamp: m.completedAt,
                user: m.completedBy,
            })).sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            const completedStepIds = o2d.milestones.map(m => m.stepId);
            let currentStatusInfo = history[history.length - 1];
            let nextStepInfo: O2DViewItem['nextStatus'] = null;

            const firstPendingStep = O2D_PROCESS_CONFIG.find(step => !completedStepIds.includes(step.id));

            if (firstPendingStep) {
                // This logic needs to be revisited as it depends on having the Order object which is not directly on o2d
                // For now, we'll create a placeholder expected date.
                 const dummyOrderForDates: Order = {
                    id: o2d.dealId,
                    crmOrderNo: o2d.dealId,
                    customerName: o2d.customerName,
                    customerPhone: '',
                    customerAddress: '',
                    salesPerson: o2d.salesPerson,
                    orderType: 'stitching', // assumption
                    milestones: [],
                    createdAt: o2d.createdAt,
                    isAcknowledged: false,
                    o2dMilestones: o2d.milestones,
                };
                const expectedDates = calculateExpectedDatesForOrder(dummyOrderForDates);
                const expectedDate = expectedDates[firstPendingStep.id] || new Date();

                nextStepInfo = {
                    text: firstPendingStep.step,
                    role: firstPendingStep.role,
                    expectedDate: expectedDate
                };
            }
            
            const isOverdue = nextStepInfo ? isPast(nextStepInfo.expectedDate) : false;

             const status = { 
                text: currentStatusInfo?.stepName || "Deal Created", 
                timestamp: currentStatusInfo?.timestamp || o2d.createdAt, 
                user: currentStatusInfo?.user || o2d.salesPerson, 
                isCompleted: !firstPendingStep,
                isOverdue
            };

            return {
                dealId: o2d.dealId,
                customerName: o2d.customerName,
                salesPerson: o2d.salesPerson,
                crmHandler: 'N/A', // CRM handler is on the Order, may need to adjust
                orderId: undefined, // Not available directly on o2d doc yet
                dealCreatedAt: o2d.createdAt,
                status,
                nextStatus: nextStepInfo,
                history,
                expectedDates: {}, // Placeholder
                originalO2D: o2d,
            };
        });

      setViewData(enrichedData);

    } catch (error) {
        console.error("Error fetching data for O2D Table:", error);
        toast({
            variant: "destructive",
            title: "Error loading O2D data",
        });
    } finally {
        setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns: ColumnDef<O2DViewItem>[] = [
    { accessorKey: "orderId", header: "Order ID", cell: ({ row }) => (row.original.orderId ? (
        <Button variant="link" asChild className="p-0 h-auto font-medium">
            <Link href={`/dashboard/orders/${row.original.orderId}`}>{row.original.orderId}</Link>
        </Button>
    ) : 'Not Created Yet')},
    { accessorKey: "dealId", header: "Deal ID", cell: ({ row }) => (
        <Button variant="link" onClick={() => setSelectedDeal(row.original)} className="p-0 h-auto">
            <LinkIcon className="h-4 w-4 mr-2" />
            {row.original.dealId}
        </Button>
    )},
    { accessorKey: "customerName", header: "Customer Name" },
    { accessorKey: "salesPerson", header: "Sales Person" },
    { accessorKey: "crmHandler", header: "CRM Handler" },
    { id: 'status', header: 'Current Status', cell: ({ row }) => (
        <div className={cn("flex items-center gap-2", row.original.status.isOverdue && "text-red-600")}>
            {row.original.status.isOverdue ? <Clock className="h-4 w-4"/> : <CheckCircle className="h-4 w-4 text-green-500"/>}
            <div>
                <p className="font-semibold">{row.original.status.text}</p>
                <p className="text-xs text-muted-foreground">
                    {format(new Date(row.original.status.timestamp), 'dd/MM/yy hh:mm a')} by {row.original.status.user}
                </p>
            </div>
        </div>
    )},
    { id: 'nextStatus', header: 'Next Status', cell: ({ row }) => {
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
    }},
    { accessorKey: "dealCreatedAt", header: ({ column }) => ( <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Created <ArrowUpDown className="ml-2 h-4 w-4" /></Button>), cell: ({ row }) => format(new Date(row.original.dealCreatedAt), 'dd/MM/yyyy') },
  ];

  const table = useReactTable({
    data: viewData,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    state: { sorting, columnFilters, globalFilter },
  });

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>O2D Orders</CardTitle>
        <CardDescription>A detailed view of all deals from creation to delivery.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center py-4">
          <Input
            placeholder="Filter customers..."
            value={globalFilter ?? ''}
            onChange={(event) =>
                setGlobalFilter(event.target.value)
            }
            className="max-w-sm"
          />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={columns.length} className="h-24 text-center"><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.original.dealId} className={cn(row.original.status.isOverdue && "bg-red-50 hover:bg-red-100")}>{row.getVisibleCells().map((cell) => (<TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>))}</TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">No results.</TableCell></TableRow>
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

    <Dialog open={!!selectedDeal} onOpenChange={() => setSelectedDeal(null)}>
        <DialogContent className="max-w-lg">
            <DialogHeader>
                <DialogTitle>History for Deal #{selectedDeal?.dealId}</DialogTitle>
                <DialogDescription>Customer: {selectedDeal?.customerName}</DialogDescription>
            </DialogHeader>
            <div className="py-4 max-h-[60vh] overflow-y-auto">
                 <ul className="space-y-4 relative pl-5">
                     <div className="absolute left-9 top-0 h-full w-0.5 bg-border -translate-x-1/2"></div>
                    {selectedDeal && O2D_PROCESS_CONFIG.map((stepConfig) => {
                       const event = selectedDeal.history.find(h => h.stepName === stepConfig.step);
                       const isCompleted = !!event;

                       return (
                            <li key={stepConfig.id} className="relative flex items-start gap-4">
                                <div className={cn("absolute left-0 top-1.5 flex h-8 w-8 items-center justify-center rounded-full -translate-x-1/2", isCompleted ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>
                                    <CheckCircle className="h-5 w-5"/>
                                </div>
                                <div className="pl-6">
                                    <p className="font-semibold">{stepConfig.step}</p>
                                    {isCompleted ? (
                                         <p className="text-sm text-muted-foreground">by {event.user} on {format(new Date(event.timestamp), 'PPP p')}</p>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">Pending</p>
                                    )}
                                </div>
                            </li>
                       );
                    })}
                 </ul>
            </div>
            <DialogFooter>
                <Button onClick={() => setSelectedDeal(null)}>Close</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  );
}
