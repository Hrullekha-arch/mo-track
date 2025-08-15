

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
import { ArrowUpDown, Search, Eye } from "lucide-react";
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
import { collection, onSnapshot, query, getDocs, doc, getDoc, updateDoc, collectionGroup } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DealVisit, Customer, Deal, User } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';
import { AssignInstallerDialog } from "@/components/features/order-management/AssignInstallerDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { measurementItems, subMeasurementBlinds, subMeasurementCurtain, deliveryInstallationItems, subDeliveryInstallationItems } from "@/app/dashboard/customers/[customerId]/[dealId]/page";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";


interface EnrichedDealVisit extends DealVisit {
    customerName: string;
    dealName: string;
    dealDocId: string;
    customerId: string;
}

function VisitsTable({ visits, users, onAssign, onRowClick }: { visits: EnrichedDealVisit[], users: User[], onAssign: (visit: EnrichedDealVisit) => void, onRowClick: (visit: EnrichedDealVisit) => void }) {
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

    const getRepresentativeName = (id: string) => users.find(u => u.id === id)?.name || id;

    const columns: ColumnDef<EnrichedDealVisit>[] = [
    {
      accessorKey: "dealId",
      header: "Deal ID",
      cell: ({ row }) => (
          <Button variant="link" className="p-0 h-auto font-medium cursor-pointer">
            <Link href={`/dashboard/customers/${row.original.customerId}/${row.original.dealDocId}`}>
                {row.original.dealId}
            </Link>
          </Button>
      )
    },
    {
      accessorKey: "customerName",
      header: "Customer",
    },
    {
      accessorKey: "typeOfVisit",
      header: "Visit Type",
      cell: ({ row }) => <Badge variant="outline" className="capitalize">{row.getValue("typeOfVisit")}</Badge>,
    },
     {
      accessorKey: "dueDate",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Due Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const dueDate = row.getValue("dueDate") as string;
        return dueDate ? format(new Date(dueDate), "PPP p") : <Badge variant="destructive">Not Set</Badge>;
      }
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
            const visit = row.original;
            let status = visit.status || 'requested';
            
            if (visit.visitStatus === 'Out for Delivery') {
                status = 'out for delivery';
            }
            
            let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "secondary";
            if (status === 'approved') badgeVariant = 'default';
            if (status === 'completed') badgeVariant = 'default';
            if (status === 'requested') badgeVariant = 'destructive';

            let badgeClass = '';
            if (status === 'completed') badgeClass = 'bg-green-600 hover:bg-green-700';
            if (status === 'out for delivery') badgeClass = 'bg-blue-600 hover:bg-blue-700';


            return <Badge variant={badgeVariant} className={cn(badgeClass, "capitalize")}>{status}</Badge>;
        }
    },
    {
      accessorKey: "representative",
      header: "Representative",
      cell: ({ row }) => getRepresentativeName(row.getValue("representative")),
    },
    {
        id: 'assignedTo',
        header: "Assigned To",
        cell: ({ row }) => {
            const assignedToId = row.original.assignedTo;
            const isApproved = row.original.status === 'approved';
            if (isApproved) {
                 if (!assignedToId) {
                    return <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onAssign(row.original); }}>Assign</Button>;
                }
                const installer = users.find(u => u.id === assignedToId);
                return <Button variant="ghost" onClick={(e) => { e.stopPropagation(); onAssign(row.original); }}>{installer?.name || 'Unknown'}</Button>;
            }
            return <Badge variant="outline">Pending Customer</Badge>;
        }
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" onClick={() => onRowClick(row.original)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

    const table = useReactTable({
        data: visits,
        columns,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        state: { sorting, columnFilters },
    });
    
    return (
        <div className="space-y-4">
             <div className="flex items-center">
                <Input
                    placeholder="Filter by customer..."
                    value={(table.getColumn("customerName")?.getFilterValue() as string) ?? ""}
                    onChange={(event) =>
                        table.getColumn("customerName")?.setFilterValue(event.target.value)
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
                                <TableHead key={header.id}>
                                {header.isPlaceholder
                                    ? null
                                    : flexRender(header.column.columnDef.header, header.getContext())}
                                </TableHead>
                            ))}
                        </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                        table.getRowModel().rows.map((row) => (
                            <TableRow key={row.id} onClick={() => onRowClick(row.original)} className="cursor-pointer">
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
                                No visits in this category.
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
        </div>
    );
}

export default function AllVisitsPage() {
  const [allVisits, setAllVisits] = React.useState<EnrichedDealVisit[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedVisit, setSelectedVisit] = React.useState<EnrichedDealVisit | null>(null);
  const [isAssigning, setIsAssigning] = React.useState(false);
  
  const { toast } = useToast();

  React.useEffect(() => {
    setLoading(true);

    const usersQuery = query(collection(db, "users"));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        setUsers(usersData);
    });
    
    const visitsQuery = collectionGroup(db, 'visits');
    const unsubscribeVisits = onSnapshot(visitsQuery, async (snapshot) => {
        const customerCache = new Map<string, Customer>();
        const dealCache = new Map<string, Deal>();

        const visitsDataPromises = snapshot.docs.map(async (docSnap) => {
            const visit = docSnap.data() as DealVisit;
            const pathParts = docSnap.ref.path.split('/');
            const customerId = pathParts[1];
            const dealDocId = pathParts[3];

            let customerName = 'Unknown';
            let dealName = 'Unknown';
            let dealId = 'N/A';

            if (!customerCache.has(customerId)) {
                const customerRef = doc(db, 'customers', customerId);
                const customerSnap = await getDoc(customerRef);
                if (customerSnap.exists()) {
                    customerCache.set(customerId, { id: customerSnap.id, ...customerSnap.data() } as Customer);
                }
            }
            customerName = customerCache.get(customerId)?.name || 'Unknown';
            
            const dealCacheKey = `${customerId}-${dealDocId}`;
            if (!dealCache.has(dealCacheKey)) {
                const dealRef = doc(db, 'customers', customerId, 'deals', dealDocId);
                 const dealSnap = await getDoc(dealRef);
                 if (dealSnap.exists()) {
                    dealCache.set(dealCacheKey, { id: dealSnap.id, ...dealSnap.data() } as Deal);
                }
            }
            const dealData = dealCache.get(dealCacheKey);
            dealName = dealData?.dealName || 'Unknown';
            dealId = dealData?.dealId || 'N/A';

            return { ...visit, id: docSnap.id, customerId, dealDocId, customerName, dealName, dealId };
        });
        
        const visitsData = await Promise.all(visitsDataPromises);

        setAllVisits(visitsData);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching visits:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load visit data." });
        setLoading(false);
    });

    return () => {
        unsubscribeUsers();
        unsubscribeVisits();
    };
  }, [toast]);
  
  const handleAssignInstaller = async (installerId: string) => {
      if (!selectedVisit) return;
      
      const visitRef = doc(db, 'customers', selectedVisit.customerId, 'deals', selectedVisit.dealDocId, 'visits', selectedVisit.id);
      
      try {
          await updateDoc(visitRef, { assignedTo: installerId });
          toast({ title: "Installer Assigned", description: `Visit has been assigned successfully.` });
          setIsAssigning(false);
          setSelectedVisit(null);
      } catch (error) {
          console.error("Failed to assign installer:", error);
          toast({ variant: 'destructive', title: 'Assignment Failed' });
      }
  };

  const renderMeasurementDetails = (visit: DealVisit) => ( <div/> );
  const renderDeliveryDetails = (visit: DealVisit) => ( <div/> );
  
  const requestedVisits = allVisits.filter(v => v.status === 'requested');
  const approvedVisits = allVisits.filter(v => v.status !== 'requested');

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-10 w-full mt-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
        <header className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">All Visits</h1>
            <p className="text-muted-foreground">A centralized log of all customer visits and appointments.</p>
        </header>
        <Tabs defaultValue="requested">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="requested">Requested Visits ({requestedVisits.length})</TabsTrigger>
                <TabsTrigger value="approved">Approved Visits ({approvedVisits.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="requested" className="mt-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Requested Visits</CardTitle>
                        <CardDescription>These visits have been created and are awaiting customer confirmation.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <VisitsTable visits={requestedVisits} users={users} onAssign={setSelectedVisit} onRowClick={setSelectedVisit} />
                    </CardContent>
                </Card>
            </TabsContent>
             <TabsContent value="approved" className="mt-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Approved Visits</CardTitle>
                        <CardDescription>Visits confirmed by the customer, ready for installer assignment.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <VisitsTable visits={approvedVisits} users={users} onAssign={setSelectedVisit} onRowClick={setSelectedVisit} />
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
        
        {selectedVisit && (
            <Dialog open={!!selectedVisit} onOpenChange={() => setSelectedVisit(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Visit Details for Deal #{selectedVisit.dealId}</DialogTitle>
                        <DialogDescription>
                           {selectedVisit.customerName} - {selectedVisit.dealName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        {selectedVisit.typeOfVisit === 'measurement'
                            ? renderMeasurementDetails(selectedVisit)
                            : renderDeliveryDetails(selectedVisit)}
                    </div>
                     <DialogFooter>
                        <Button variant="ghost" onClick={() => setSelectedVisit(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )}
        <AssignInstallerDialog
            isOpen={isAssigning}
            onClose={() => setIsAssigning(false)}
            onAssign={handleAssignInstaller}
            installers={users.filter(u => u.role === 'installer')}
            currentInstallerId={selectedVisit?.assignedTo}
        />
    </div>
  );
}
