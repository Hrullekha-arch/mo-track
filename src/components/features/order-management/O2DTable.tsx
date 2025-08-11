
"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState
} from "@tanstack/react-table";
import { ArrowUpDown, CheckCircle, MoreHorizontal } from "lucide-react";
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
import { collection, onSnapshot, query, doc, updateDoc, collectionGroup, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, User, Deal, DealVisit, Quotation, PurchaseRequest } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

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
  };
  originalDeal: Deal;
  originalOrder?: Order;
}

export function O2DTable() {
  const [viewData, setViewData] = React.useState<O2DViewItem[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");

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
            const deals = dealsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, customerId: doc.ref.parent.parent!.id } as Deal & { customerId: string }));
            
            const customerPromises = deals.map(deal => getDocs(query(collection(db, 'customers'), where('__name__', '==', deal.customerId))));
            const visitPromises = deals.map(deal => getDocs(query(collection(db, 'customers', deal.customerId, 'deals', deal.id, 'visits'))));
            const quotationPromises = deals.map(deal => getDocs(query(collection(db, 'customers', deal.customerId, 'deals', deal.id, 'quotations'))));
            const orderPromises = deals.map(deal => getDocs(query(collection(db, 'orders'), where('dealId', '==', deal.id))));
            const purchaseRequestPromises = deals.map(deal => getDocs(query(collection(db, 'purchaseRequests'), where('dealId', '==', deal.crmOrderNo))));

            const [
                customerSnapshots,
                visitSnapshots,
                quotationSnapshots,
                orderSnapshots,
                purchaseRequestSnapshots
            ] = await Promise.all([
                Promise.all(customerPromises),
                Promise.all(visitPromises),
                Promise.all(quotationPromises),
                Promise.all(orderPromises),
                Promise.all(purchaseRequestPromises)
            ]);

            const customers = customerSnapshots.flat().reduce((acc, snap) => {
                snap.forEach(doc => acc[doc.id] = doc.data() as Customer);
                return acc;
            }, {} as Record<string, Customer>);

            const enrichedData = deals.map((deal, index) => {
                const customer = customers[deal.customerId];
                const visits = visitSnapshots[index].docs.map(d => d.data() as DealVisit);
                const quotations = quotationSnapshots[index].docs.map(d => d.data() as Quotation);
                const orders = orderSnapshots[index].docs.map(d => d.data() as Order);
                const purchaseRequests = purchaseRequestSnapshots[index].docs.map(d => d.data() as PurchaseRequest);

                let status = { text: 'Unknown', timestamp: deal.createdAt, user: deal.createdBy, isCompleted: false };

                const latestVisit = visits.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                const latestQuotation = quotations.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                const order = orders[0]; // Assuming one order per deal for simplicity in this view
                const purchaseRequest = purchaseRequests[0];

                if (order?.milestones.find(m => m.id === 8)?.completed) {
                    status = { text: 'Installation/Delivery Done', timestamp: order.milestones.find(m => m.id === 8)!.completedAt!, user: order.milestones.find(m => m.id === 8)!.completedBy!, isCompleted: true };
                } else if (order?.milestones.find(m => m.id === 6 || m.id === 7)?.completed) {
                     status = { text: 'Time Taken for Installation', timestamp: order.milestones.find(m => m.id === 6 || m.id === 7)!.completedAt!, user: order.milestones.find(m => m.id === 6 || m.id === 7)!.completedBy!, isCompleted: false };
                } else if (order?.milestones.find(m => m.id === 4)?.completed) {
                    status = { text: 'Full Kitting Ready', timestamp: order.milestones.find(m => m.id === 4)!.completedAt!, user: order.milestones.find(m => m.id === 4)!.completedBy!, isCompleted: false };
                } else if (purchaseRequest?.status === 'Completed') {
                     status = { text: 'Purchase Material Received', timestamp: purchaseRequest.completedAt!, user: purchaseRequest.completedBy!, isCompleted: false };
                } else if (order?.status === 'Approved') {
                     status = { text: 'Advance Received for Order', timestamp: order.approvedAt!, user: order.approvedBy?.name, isCompleted: false };
                } else if (latestQuotation?.status === 'Approved') {
                     status = { text: 'Quotation Re-Check', timestamp: latestQuotation.approvedAt!, user: latestQuotation.approvedBy?.name, isCompleted: false };
                } else if (latestQuotation) {
                    status = { text: 'Quotation Making', timestamp: latestQuotation.createdAt, user: latestQuotation.createdBy, isCompleted: false };
                } else if (latestVisit) {
                    status = { text: 'Measurement (Coordinate to CRM)', timestamp: latestVisit.createdAt, user: latestVisit.createdBy, isCompleted: false };
                } else {
                    status = { text: `Received Advance: ${deal.advanceForMeasurement}`, timestamp: deal.createdAt, user: 'System', isCompleted: false };
                }

                return {
                    dealId: deal.dealId,
                    customerName: customer?.name || 'Unknown',
                    salesPerson: users.find(u => u.id === deal.representativeId)?.name || 'N/A',
                    crmHandler: order ? (users.find(u => u.id === order.handledByCrm)?.name || 'N/A') : 'N/A',
                    orderId: order?.id,
                    dealCreatedAt: deal.createdAt,
                    status,
                    originalDeal: deal,
                    originalOrder: order,
                };
            }).filter(item => !item.status.isCompleted); // Filter out fully completed deals

            setViewData(enrichedData);
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
  }, [users, toast]);

  const handleFollowUp = async (orderId?: string) => {
    if (!orderId) {
        toast({variant: 'destructive', title: 'No Order ID found for this deal yet.'});
        return;
    }
    try {
        const orderRef = doc(db, 'orders', orderId);
        await updateDoc(orderRef, { balanceFollowUp: true });
        toast({title: 'Follow-up Marked', description: `Order ${orderId} has been marked for balance payment follow-up.`});
    } catch (error) {
        toast({variant: 'destructive', title: 'Update Failed'});
        console.error("Error marking follow-up:", error);
    }
  };

  const columns: ColumnDef<O2DViewItem>[] = [
    { accessorKey: "orderId", header: "Order ID", cell: ({ row }) => row.original.orderId || 'Not Created Yet' },
    { accessorKey: "dealId", header: "Deal ID" },
    { accessorKey: "customerName", header: "Customer Name" },
    { accessorKey: "salesPerson", header: "Sales Person" },
    { accessorKey: "crmHandler", header: "CRM Handler" },
    { id: 'status', header: 'Current Status', cell: ({ row }) => (
        <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500"/>
            <div>
                <p className="font-semibold">{row.original.status.text}</p>
                <p className="text-xs text-muted-foreground">
                    {format(new Date(row.original.status.timestamp), 'dd/MM/yy hh:mm a')} by {row.original.status.user}
                </p>
            </div>
        </div>
    )},
    { accessorKey: "dealCreatedAt", header: ({ column }) => ( <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Created <ArrowUpDown className="ml-2 h-4 w-4" /></Button>), cell: ({ row }) => format(new Date(row.original.dealCreatedAt), 'dd/MM/yyyy') },
    { id: "actions", cell: ({ row }) => (
        <Button size="sm" variant="outline" onClick={() => handleFollowUp(row.original.orderId)} disabled={!row.original.orderId}>
            Balance payment follow up
        </Button>
    )}
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
    state: { sorting, globalFilter },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>O2D Orders</CardTitle>
        <CardDescription>A detailed view of all deals from creation to delivery.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center py-4">
          <Input
            placeholder="Filter customers..."
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
                  <TableRow key={row.original.dealId}>{row.getVisibleCells().map((cell) => (<TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>))}</TableRow>
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
  );
}
