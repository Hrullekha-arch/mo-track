

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
import { ArrowUpDown, CheckCircle, Clock, MoreHorizontal, Link as LinkIcon, PhoneCall, Download } from "lucide-react";
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
import { collection, onSnapshot, query, doc, where, collectionGroup, getDocs, getDoc, updateDoc, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, User, Deal, DealVisit, Quotation, PurchaseRequest, Customer, O2DStep, O2DProcess, O2DStatus } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isPast, formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { setBalanceFollowUp } from "@/app/dashboard/all-orders/actions";
import { O2D_PROCESS_CONFIG, calculateExpectedDatesForOrder } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Link from 'next/link';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/context/AuthContext";
import { getNormalizedOrderMilestones } from "@/lib/order-workflow";


interface O2DViewItem {
  dealId: string;
  orderId?: string; // New field for the order ID
  customerName: string;
  salesPerson: string;
  crmHandler: string;
  dealDocId: string;
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
  originalO2D: O2DProcess;
}


export function O2DTable() {
  const [viewData, setViewData] = React.useState<O2DViewItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [selectedDeal, setSelectedDeal] = React.useState<O2DViewItem | null>(null);
  const [followUpOrder, setFollowUpOrder] = React.useState<O2DViewItem | null>(null);

  const { toast } = useToast();
  const { user } = useAuth();
  
  const checkAndUpdatePurchaseMilestone = React.useCallback(async (order: Order, o2dDocRef: any) => {
    if (!order.fabricDetails || order.fabricDetails.length === 0) {
      return; // No items to check
    }
  
    const allInStock = order.fabricDetails.every(
      (item) => item.status === 'in stock' || item.status === 'allocated'
    );
  
    if (allInStock) {
      // Check if the milestone is already completed
      const o2dDocSnap = await getDoc(o2dDocRef);
      if (o2dDocSnap.exists()) {
        const o2dData = o2dDocSnap.data() as O2DProcess;
        const purchaseMilestone = o2dData.milestones.find(m => m.stepId === 7);
        if (!purchaseMilestone || purchaseMilestone.status !== 'completed') {
          const newMilestone: O2DStatus = {
            stepId: 7, // 'Purchase Material Receiving'
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: 'System (Stock Check)',
            remarks: 'All required materials were already in stock.',
            selection: 'Done',
          };
          const mergedMilestones = [
            ...(o2dData.milestones || []).filter((milestone) => milestone.stepId !== newMilestone.stepId),
            newMilestone,
          ];
          await updateDoc(o2dDocRef, {
            milestones: mergedMilestones,
          });
          toast({
              title: "O2D Step Automated",
              description: `Material Receiving for Deal ${order.dealId} marked as complete.`
          });
        }
      }
    }
  }, [toast]);
  
    const checkAndUpdateKittingMilestone = React.useCallback(async (order: Order, o2dDocRef: any) => {
        const stitchingDone = getNormalizedOrderMilestones(order).find((milestone) => milestone.id === 4)?.completed;
        if (!stitchingDone) return;

        const o2dDocSnap = await getDoc(o2dDocRef);
        if (o2dDocSnap.exists()) {
            const o2dData = o2dDocSnap.data() as O2DProcess;
            const fullKitingMilestone = o2dData.milestones.find(m => m.stepId === 9);
            if (!fullKitingMilestone || fullKitingMilestone.status !== 'completed') {
                 const newMilestone: O2DStatus = {
                    stepId: 9, // 'Full Kiting'
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    completedBy: 'System (Stitching Done)',
                    remarks: 'Automatically completed with Stitching Done.',
                    selection: 'Done',
                };
                const mergedMilestones = [
                    ...(o2dData.milestones || []).filter((milestone) => milestone.stepId !== newMilestone.stepId),
                    newMilestone,
                ];
                await updateDoc(o2dDocRef, {
                    milestones: mergedMilestones,
                });
                toast({
                    title: "O2D Step Automated",
                    description: `Full Kiting for Deal ${order.dealId} marked as complete.`
                });
            }
        }
    }, [toast]);

  React.useEffect(() => {
    setLoading(true);
    const o2dQuery = query(collection(db, 'o2d'), limit(1000));

    const unsubscribe = onSnapshot(o2dQuery, async (snapshot) => {
        const o2dProcesses = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as O2DProcess));

        // Fetch all orders to link them to O2D processes
        const ordersSnapshot = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(1500)));
        const allOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

        const enrichedDataPromises = o2dProcesses.map(async (o2d) => {
            const history: O2DViewItem['history'] = (o2d.milestones || []).map(m => ({
                stepName: O2D_PROCESS_CONFIG.find(s => s.id === m.stepId)?.step || 'Unknown Step',
                status: m.status,
                timestamp: m.completedAt,
                user: m.completedBy,
            })).sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            const completedStepIds = (o2d.milestones || []).map(m => m.stepId);
            let currentStatusInfo = history[history.length - 1];
            let nextStepInfo: O2DViewItem['nextStatus'] = null;

            const firstPendingStep = O2D_PROCESS_CONFIG.find(step => !completedStepIds.includes(step.id));

            // Create a temporary simplified order object just for date calculation
            const tempOrderForDates: Order = {
                id: o2d.id,
                crmOrderNo: o2d.dealId,
                createdAt: o2d.createdAt,
                o2dMilestones: o2d.milestones,
                customerName: o2d.customerName,
                customerPhone: '',
                customerAddress: '',
                salesPerson: o2d.salesPerson,
                orderType: 'stitching',
                milestones: [],
                isAcknowledged: false,
            };
            const expectedDates = calculateExpectedDatesForOrder(tempOrderForDates);
            
            if (firstPendingStep) {
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

            // Find the matching order for this deal
            const matchingOrder = allOrders.find(order => order.dealId === o2d.dealId);
            
            if (matchingOrder) {
                const o2dDocRef = doc(db, "o2d", o2d.id);
                await checkAndUpdatePurchaseMilestone(matchingOrder, o2dDocRef);
                await checkAndUpdateKittingMilestone(matchingOrder, o2dDocRef);
            }

            return {
                dealId: o2d.dealId,
                orderId: matchingOrder?.id,
                dealDocId: o2d.id,
                customerName: o2d.customerName,
                salesPerson: o2d.salesPerson,
                crmHandler: 'N/A', // CRM handler is on the Order, may need to adjust
                dealCreatedAt: o2d.createdAt,
                status,
                nextStatus: nextStepInfo,
                history,
                originalO2D: o2d,
            };
        });
        
      const enrichedData = await Promise.all(enrichedDataPromises);

      setViewData(enrichedData.sort((a, b) => new Date(b.dealCreatedAt).getTime() - new Date(a.dealCreatedAt).getTime()));
      setLoading(false);

    }, (error) => {
        console.error("Error fetching data for O2D Table:", error);
        toast({
            variant: "destructive",
            title: "Error loading O2D data",
        });
        setLoading(false);
    });

    return () => unsubscribe();
  }, [toast, checkAndUpdatePurchaseMilestone, checkAndUpdateKittingMilestone]);
  
  const handleFollowUp = async () => {
    if (!followUpOrder || !user || !followUpOrder.orderId) return;
    try {
        const result = await setBalanceFollowUp(followUpOrder.orderId, followUpOrder.dealDocId, user.name);
        if (result.success) {
            toast({ title: "Follow-up Initiated", description: result.message });
        } else {
            toast({ variant: "destructive", title: "Error", description: result.message });
        }
    } catch (error) {
        toast({ variant: "destructive", title: "Server Error", description: "Could not initiate follow-up." });
    } finally {
        setFollowUpOrder(null);
    }
  };
  
    const handleExport = () => {
        toast({
            title: "Export Started",
            description: "Generating O2D status report..."
        });

        const dataToExport = table.getFilteredRowModel().rows.map(row => {
            const item = row.original;
            const flatData: Record<string, any> = {
                "Deal ID": item.dealId,
                "Order ID": item.orderId || "N/A",
                "Customer Name": item.customerName,
                "Sales Person": item.salesPerson,
                "Deal Created At": format(new Date(item.dealCreatedAt), 'dd/MM/yyyy'),
                "Current Status": item.status.text,
                "Next Step": item.nextStatus?.text || "Completed",
                "Next Step Due": item.nextStatus ? format(item.nextStatus.expectedDate, 'dd/MM/yyyy') : "N/A",
            };

            // Add each milestone status
            O2D_PROCESS_CONFIG.forEach(step => {
                const historyItem = item.history.find(h => h.stepName === step.step);
                flatData[`${step.id}. ${step.step} (Status)`] = historyItem ? historyItem.status : 'Pending';
                flatData[`${step.id}. ${step.step} (Date)`] = historyItem ? format(new Date(historyItem.timestamp), 'dd/MM/yyyy HH:mm') : '';
                flatData[`${step.id}. ${step.step} (By)`] = historyItem ? historyItem.user : '';
            });

            return flatData;
        });

        if (dataToExport.length === 0) {
            toast({ variant: "destructive", title: "No data to export" });
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "O2D Status");
        XLSX.writeFile(workbook, `motrack_o2d_status_${new Date().toISOString().split('T')[0]}.xlsx`);

        toast({ title: "Export Complete!", description: "Your O2D status report has been downloaded." });
    };


  const columns: ColumnDef<O2DViewItem>[] = [
    { 
        accessorKey: "orderId", 
        header: "Order ID",
        cell: ({ row }) => {
            const orderId = row.original.orderId;
            return orderId ? (
                 <Button variant="link" asChild className="p-0 h-auto font-medium cursor-pointer">
                    <Link href={`/dashboard/orders/${orderId}`}>{orderId}</Link>
                 </Button>
            ) : (
                <span className="text-xs text-muted-foreground">Order not Created Yet</span>
            );
        }
    },
    { accessorKey: "dealId", header: "Deal ID", cell: ({ row }) => (
        <Button variant="link" asChild className="p-0 h-auto font-medium cursor-pointer">
             <div onClick={() => setSelectedDeal(row.original)}>{row.original.dealId}</div>
        </Button>
    )},
    { accessorKey: "customerName", header: "Customer Name" },
    { accessorKey: "salesPerson", header: "Sales Person" },
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
     {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const deal = row.original;
        const isFollowUpStep = deal.nextStatus?.text === 'Balance Payment Follow Up';
        if (isFollowUpStep && deal.orderId) {
          return (
             <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => setFollowUpOrder(deal)}>
                  <PhoneCall className="mr-2 h-4 w-4" />
                  Follow-up
                </Button>
            </AlertDialogTrigger>
          );
        }
        return null;
      },
    },
  ];
  
  const filteredData = React.useMemo(() => {
    if (!globalFilter) return viewData;
    const lowercasedFilter = globalFilter.toLowerCase();
    return viewData.filter(item => 
        item.customerName.toLowerCase().includes(lowercasedFilter) ||
        item.dealId.toLowerCase().includes(lowercasedFilter) ||
        item.orderId?.toLowerCase().includes(lowercasedFilter)
    );
  }, [viewData, globalFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    state: { sorting, globalFilter },
  });

  return (
    <AlertDialog>
    <Card>
      <CardHeader>
        <CardTitle>O2D Orders</CardTitle>
        <CardDescription>A detailed view of all deals from creation to final acknowledgement.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between py-4">
          <Input
            placeholder="Filter by customer, Deal ID or Order ID..."
            value={globalFilter ?? ''}
            onChange={(event) =>
                setGlobalFilter(event.target.value)
            }
            className="max-w-sm"
          />
          <Button onClick={handleExport}>
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
                                         <p className="text-sm text-muted-foreground">by {event.user} on {format(new Date(event.timestamp), 'PP p')}</p>
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
     <AlertDialogContent>
        <AlertDialogHeader>
            <AlertDialogTitle>Confirm Follow-up</AlertDialogTitle>
            <AlertDialogDescription>
                Have you followed up with {followUpOrder?.customerName} for the balance payment? This will send it to the Accounts team for payment confirmation.
            </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setFollowUpOrder(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFollowUp}>Yes, I have</AlertDialogAction>
        </AlertDialogFooter>
    </AlertDialogContent>
    </AlertDialog>
  );
}
