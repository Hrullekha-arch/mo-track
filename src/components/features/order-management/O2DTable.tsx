
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
  history: {
      stepName: string;
      status: string;
      timestamp: string;
      user: string;
  }[];
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

                let currentStep: O2DStep | null = null;
                let isCurrentStepOverdue = false;

                const addHistory = (stepName: string, status: string, timestamp: string, user: string) => {
                    history.push({ stepName, status, timestamp, user });
                };
                
                addHistory('Deal Created', 'Completed', deal.createdAt, dealSalesperson?.name || 'System');
                
                const step1 = O2D_PROCESS_CONFIG[0];
                addHistory(step1.step, `Selected: ${deal.advanceForMeasurement || 'N/A'}`, deal.createdAt, dealSalesperson?.name || 'System');
                
                const latestVisit = visits.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                if (latestVisit) addHistory(O2D_PROCESS_CONFIG[1].step, 'Completed', latestVisit.createdAt, latestVisit.createdBy);
                
                const latestQuotation = quotations.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                if (latestQuotation) addHistory(O2D_PROCESS_CONFIG[4].step, 'Completed', latestQuotation.createdAt, creatorName(latestQuotation.createdBy, users));
                if (latestQuotation?.status === 'Approved') addHistory(O2D_PROCESS_CONFIG[5].step, 'Completed', latestQuotation.approvedAt || latestQuotation.createdAt, latestQuotation.approvedBy?.name || 'System');
                
                if (order?.status === 'Approved') addHistory(O2D_PROCESS_CONFIG[6].step, 'Completed', order.approvedAt || order.createdAt, order.approvedBy?.name || 'System');
                if (purchaseRequest?.status === 'Completed') addHistory(O2D_PROCESS_CONFIG[8].step, 'Completed', purchaseRequest.completedAt!, purchaseRequest.completedBy || 'System');
                
                const fullKittingMilestone = order?.milestones.find(m => m.id === 4);
                if (fullKittingMilestone?.completed) addHistory('Full Kitting Ready', 'Completed', fullKittingMilestone.completedAt!, fullKittingMilestone.completedBy || 'System');
                
                const installationDoneMilestone = order?.milestones.find(m => m.id === 8);
                if (installationDoneMilestone?.completed) addHistory('Installation/Delivery Done', 'Completed', installationDoneMilestone.completedAt!, installationDoneMilestone.completedBy || 'System');
                
                const latestHistory = history[history.length - 1];

                let isCompleted = !!installationDoneMilestone?.completed;
                let finalStatusText = latestHistory.stepName;
                if(isCompleted) finalStatusText = "Installation/Delivery Done";
                
                const status = { text: finalStatusText, timestamp: latestHistory.timestamp, user: latestHistory.user, isCompleted, isOverdue: isCurrentStepOverdue };


                return {
                    dealId: deal.dealId,
                    customerName: customer?.name || 'Unknown',
                    salesPerson: dealSalesperson?.name || 'N/A',
                    crmHandler: orderCrmHandler?.name || 'N/A',
                    orderId: order?.id,
                    dealCreatedAt: deal.createdAt,
                    status,
                    history,
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
  }, [toast]);
  
  const creatorName = (userId: string | undefined, userList: User[]) => {
      if (!userId) return 'System';
      return userList.find(u => u.id === userId)?.name || 'Unknown';
  };

  const handleFollowUp = async (orderId?: string) => {
    if (!orderId) {
        toast({variant: 'destructive', title: 'No Order ID found for this deal yet.'});
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
                 <ul className="space-y-4">
                    {selectedDeal?.history.map((event, index) => (
                        <li key={index} className="flex items-start gap-4">
                            <div className="flex flex-col items-center">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700">
                                    <CheckCircle className="h-5 w-5"/>
                                </div>
                                {index < selectedDeal.history.length - 1 && (
                                    <div className="w-px h-8 bg-border"></div>
                                )}
                            </div>
                            <div>
                                <p className="font-semibold">{event.stepName}</p>
                                <p className="text-sm text-muted-foreground">by {event.user} on {format(new Date(event.timestamp), 'PPP p')}</p>
                            </div>
                        </li>
                    ))}
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
