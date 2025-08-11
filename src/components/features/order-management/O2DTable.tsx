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
import { ArrowUpDown, CheckCircle, Clock, MoreHorizontal } from "lucide-react";
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
import { Order, User, Deal, DealVisit, Quotation, PurchaseRequest, Customer, O2DStep } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isPast, formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { setBalanceFollowUp } from "@/app/dashboard/all-orders/actions";
import { O2D_PROCESS_CONFIG, calculateExpectedDatesForOrder } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Link from "next/link";

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
  originalDeal: Deal;
  originalOrder?: Order;
}

export function O2DTable() {
  const [viewData, setViewData] = React.useState<O2DViewItem[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [selectedDeal, setSelectedDeal] = React.useState<O2DViewItem | null>(null);

  const { toast } = useToast();
  
  React.useEffect(() => {
    const usersQuery = query(collection(db, "users"));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        setUsers(usersData);
    });

    const dealsQuery = query(collectionGroup(db, 'deals'));
    const unsubscribe = onSnapshot(dealsQuery, async (dealsSnapshot) => {
        setLoading(true);
        try {
            const deals = dealsSnapshot.docs.map(doc => {
                const parentPath = doc.ref.parent.parent?.path;
                if (!parentPath) return null;
                return { 
                    ...doc.data(), 
                    id: doc.id, 
                    customerId: parentPath.split('/')[1] 
                } as Deal & { customerId: string }
            }).filter(Boolean) as (Deal & { customerId: string })[];
            
            const customerPromises = deals.map(deal => getDoc(doc(db, 'customers', deal.customerId)));
            const customerSnapshots = await Promise.all(customerPromises);
            const customers = customerSnapshots.reduce((acc, snap) => {
                if (snap.exists()) {
                    acc[snap.id] = snap.data() as Customer;
                }
                return acc;
            }, {} as Record<string, Customer>);
            
            const results = await Promise.all(deals.map(deal => {
                const visitsQuery = query(collection(db, 'customers', deal.customerId, 'deals', deal.id, 'visits'));
                const quotationsQuery = query(collection(db, 'customers', deal.customerId, 'deals', deal.id, 'quotations'));
                const ordersQuery = query(collection(db, 'orders'), where('dealId', '==', deal.id));
                
                return Promise.all([
                    getDocs(visitsQuery),
                    getDocs(quotationsQuery),
                    getDocs(ordersQuery),
                ]);
            }));

            const allOrderCrmNos = results.flatMap(res => res[2].docs.map(d => d.data().crmOrderNo)).filter(Boolean);
            let purchaseRequestsByOrder: Record<string, PurchaseRequest> = {};

            if (allOrderCrmNos.length > 0) {
                 const prChunks = [];
                 for (let i = 0; i < allOrderCrmNos.length; i += 30) {
                     prChunks.push(allOrderCrmNos.slice(i, i + 30));
                 }
                 for (const chunk of prChunks) {
                    if (chunk.length > 0) {
                        const purchaseRequestsQuery = query(collection(db, 'purchaseRequests'), where('dealId', 'in', chunk));
                        const purchaseRequestSnapshots = await getDocs(purchaseRequestsQuery);
                        purchaseRequestSnapshots.forEach(doc => {
                            const pr = doc.data() as PurchaseRequest;
                            if (pr.dealId) {
                                purchaseRequestsByOrder[pr.dealId] = pr;
                            }
                        });
                    }
                 }
            }

            const enrichedData = deals.map((deal, index) => {
                const [
                    visitSnapshots,
                    quotationSnapshots,
                    orderSnapshots,
                ] = results[index];

                const customer = customers[deal.customerId];
                if (!customer) return null;

                const visits = visitSnapshots.docs.map(d => d.data() as DealVisit);
                const quotations = quotationSnapshots.docs.map(d => d.data() as Quotation);
                const orders = orderSnapshots.docs.map(d => ({id: d.id, ...d.data()}) as Order);
                
                const order = orders[0];
                const purchaseRequest = order ? purchaseRequestsByOrder[order.crmOrderNo] : undefined;

                const dealSalesperson = users.find(u => u.id === deal.representativeId);
                const orderCrmHandler = order ? users.find(u => u.id === order.handledByCrm) : undefined;
                
                const history: O2DViewItem['history'] = [];
                const expectedDates = order ? calculateExpectedDatesForOrder(order) : {};

                const addHistory = (stepName: string, status: string, timestamp: string, user: string) => {
                    history.push({ stepName, status, timestamp, user });
                };
                
                // Constructing history based on available data
                addHistory('Deal Created', 'Completed', deal.createdAt, dealSalesperson?.name || 'System');
                addHistory(O2D_PROCESS_CONFIG[0].step, deal.advanceForMeasurement === 'Yes' ? 'Completed' : 'Skipped', deal.createdAt, dealSalesperson?.name || 'System');
                const latestVisit = visits.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                if (latestVisit) addHistory(O2D_PROCESS_CONFIG[2].step, 'Completed', latestVisit.createdAt, latestVisit.createdBy);
                
                const latestQuotation = quotations.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                if (latestQuotation) addHistory(O2D_PROCESS_CONFIG[4].step, 'Completed', latestQuotation.createdAt, creatorName(latestQuotation.createdBy, users));
                if (latestQuotation?.status === 'Approved') addHistory(O2D_PROCESS_CONFIG[5].step, 'Completed', (latestQuotation as any).approvedAt || latestQuotation.createdAt, (latestQuotation as any).approvedBy?.name || 'System');
                
                if (order?.status === 'Approved') addHistory(O2D_PROCESS_CONFIG[6].step, 'Completed', (order as any).approvedAt || order.createdAt, (order as any).approvedBy?.name || 'System');
                if (purchaseRequest?.status === 'Completed') addHistory(O2D_PROCESS_CONFIG[8].step, 'Completed', purchaseRequest.completedAt!, purchaseRequest.completedBy?.name || 'System');
                
                // Add main order milestones to history
                if (order) {
                    order.milestones.forEach(m => {
                        if (m.completed && m.completedAt) {
                            addHistory(m.name, 'Completed', m.completedAt, m.completedBy || 'System');
                        }
                    });
                }
                
                // Determine current and next status
                const completedStepNames = history.map(h => h.stepName);
                let currentStatusInfo = history[history.length - 1];
                let nextStepInfo: O2DViewItem['nextStatus'] = null;

                const allPossibleSteps = O2D_PROCESS_CONFIG.map(s => s.step);
                const firstPendingStepIndex = allPossibleSteps.findIndex(step => !completedStepNames.includes(step));

                if (firstPendingStepIndex !== -1) {
                    const nextStepConfig = O2D_PROCESS_CONFIG[firstPendingStepIndex];
                    if (nextStepConfig) {
                        nextStepInfo = {
                            text: nextStepConfig.step,
                            role: nextStepConfig.role,
                            expectedDate: expectedDates[nextStepConfig.id] || new Date(),
                        };
                    }
                }
                
                const isOverdue = nextStepInfo ? isPast(nextStepInfo.expectedDate) : false;

                const status = { 
                    text: currentStatusInfo.stepName, 
                    timestamp: currentStatusInfo.timestamp, 
                    user: currentStatusInfo.user, 
                    isCompleted: firstPendingStepIndex === -1, // Completed if no pending steps
                    isOverdue
                };

                return {
                    dealId: deal.dealId,
                    customerName: customer?.name || 'Unknown',
                    salesPerson: dealSalesperson?.name || 'N/A',
                    crmHandler: orderCrmHandler?.name || 'N/A',
                    orderId: order?.id,
                    dealCreatedAt: deal.createdAt,
                    status,
                    nextStatus: nextStepInfo,
                    history,
                    expectedDates,
                    originalDeal: deal,
                    originalOrder: order,
                };
            }).filter(Boolean) as O2DViewItem[];

            setViewData(enrichedData.filter(item => !item.status.isCompleted));
        } catch (err) {
            console.error(err);
            toast({variant: 'destructive', title: 'Error loading O2D data'});
        } finally {
            setLoading(false);
        }
    });

    return () => {
        unsubscribeUsers();
        unsubscribe();
    }
  }, [toast, users]); // Added users dependency
  
  const creatorName = (userId: string | undefined, userList: User[]) => {
      if (!userId) return 'System';
      return userList.find(u => u.id === userId)?.name || 'Unknown';
  };

  const handleFollowUp = async (orderId?: string) => {
    if (!orderId) {
        toast({variant: 'destructive', title: 'No Order ID found for this deal yet.'});
        return;
    }
    const order = viewData.find(d => d.orderId === orderId)?.originalOrder;
    if (!order || !order.milestones.find(m => m.id === 4)?.completed) {
        toast({variant: 'destructive', title: 'Action Not Allowed', description: 'Follow-up can only be initiated after "Stitching Done".'});
        return;
    }
    try {
        await setBalanceFollowUp(orderId);
        toast({title: 'Follow-up Marked', description: `Order ${orderId} has been marked for balance payment follow-up.`});
    } catch (error) {
        toast({variant: 'destructive', title: 'Update Failed'});
        console.error("Error marking follow-up:", error);
    }
  };

  const columns: ColumnDef<O2DViewItem>[] = [
    { accessorKey: "orderId", header: "Order ID", cell: ({ row }) => (row.original.orderId ? (
        <Button variant="link" asChild className="p-0 h-auto font-medium">
            <Link href={`/dashboard/orders/${row.original.orderId}`}>{row.original.orderId}</Link>
        </Button>
    ) : 'Not Created Yet')},
    { accessorKey: "dealId", header: "Deal ID", cell: ({ row }) => (
        <Button variant="link" onClick={() => setSelectedDeal(row.original)} className="p-0 h-auto">
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
    { id: "actions", cell: ({ row }) => {
        const fullKittingReady = !!row.original.originalOrder?.milestones.find(m => m.id === 4)?.completed;
        return (
            <Button size="sm" variant="outline" onClick={() => handleFollowUp(row.original.orderId)} disabled={!row.original.orderId || !fullKittingReady}>
                Balance payment follow up
            </Button>
        )
    }}
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
                       const expectedDate = selectedDeal.expectedDates[stepConfig.id];

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
                                    {expectedDate && (
                                         <p className="text-xs text-muted-foreground/80">Expected: {format(new Date(expectedDate), 'dd/MM/yy')}</p>
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
