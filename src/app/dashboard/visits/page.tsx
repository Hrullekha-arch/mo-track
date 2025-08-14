

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
import { collection, onSnapshot, query, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
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


interface EnrichedDealVisit extends DealVisit {
    customerName: string;
    dealName: string;
    dealDocId: string;
    customerId: string;
}

export default function AllVisitsPage() {
  const [visits, setVisits] = React.useState<EnrichedDealVisit[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
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
        const visitsData: EnrichedDealVisit[] = [];
        const customerCache = new Map<string, Customer>();
        const dealCache = new Map<string, Deal>();

        for (const docSnap of snapshot.docs) {
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

            visitsData.push({
                ...visit,
                id: docSnap.id,
                customerId,
                dealDocId,
                customerName,
                dealName,
                dealId
            });
        }
        setVisits(visitsData.sort((a,b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()));
        setLoading(false);
    }, (error) => {
        console.error("Error fetching visits:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Could not load visit data. Please check your Firestore permissions."
        });
        setLoading(false);
    });

    return () => {
        unsubscribeUsers();
        unsubscribeVisits();
    };
  }, [toast]);
  
  const getRepresentativeName = (id: string) => users.find(u => u.id === id)?.name || id;

  const handleAssignInstaller = async (installerId: string) => {
      if (!selectedVisit) return;
      
      const visitRef = doc(db, 'customers', selectedVisit.customerId, 'deals', selectedVisit.dealDocId, 'visits', selectedVisit.id);
      
      try {
          await updateDoc(visitRef, { assignedTo: installerId });
          toast({
              title: "Installer Assigned",
              description: `Visit has been assigned successfully.`
          });
          // Optimistically update UI
          setVisits(prevVisits => prevVisits.map(v => 
              v.id === selectedVisit.id ? { ...v, assignedTo: installerId } : v
          ));
          setIsAssigning(false);
          setSelectedVisit(null);
      } catch (error) {
          console.error("Failed to assign installer:", error);
          toast({ variant: 'destructive', title: 'Assignment Failed' });
      }
  };

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
      cell: ({ row }) => format(new Date(row.getValue("dueDate")), "PPP p"),
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
            if (!assignedToId) {
                return <Badge variant="destructive">Unassigned</Badge>;
            }
            const installer = users.find(u => u.id === assignedToId);
            return installer ? installer.name : "Unknown";
        }
    },
    {
      accessorKey: "createdBy",
      header: "Created By",
    },
    {
      accessorKey: "createdAt",
      header: "Created On",
      cell: ({ row }) => format(new Date(row.getValue("createdAt")), "dd/MM/yyyy"),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" onClick={() => setSelectedVisit(row.original)}>
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
    state: {
      sorting,
      columnFilters,
    },
  });

  const renderMeasurementDetails = (visit: DealVisit) => (
      <div className="space-y-4">
          <div>
              <h4 className="font-semibold text-sm">Measurements Selected:</h4>
              <ul className="list-disc list-inside text-muted-foreground text-sm">
                  {(visit.measurements && visit.measurements.length > 0) ? visit.measurements.map(m => <li key={m}>{measurementItems.find(mi => mi.id === m)?.label || m}</li>) : <li>None</li>}
              </ul>
          </div>
          {visit.blinds && visit.blinds.length > 0 && (
              <div>
                  <h4 className="font-semibold text-sm">Blind Types:</h4>
                  <ul className="list-disc list-inside text-muted-foreground text-sm">
                      {visit.blinds.map(b => <li key={b}>{subMeasurementBlinds.find(s => s.id === b)?.label || b}</li>)}
                  </ul>
              </div>
          )}
          {visit.curtain && visit.curtain.length > 0 && (
              <div>
                  <h4 className="font-semibold text-sm">Curtain Types:</h4>
                  <ul className="list-disc list-inside text-muted-foreground text-sm">
                      {visit.curtain.map(c => <li key={c}>{subMeasurementCurtain.find(s => s.id === c)?.label || c}</li>)}
                      {visit.otherCurtain && <li>Other: {visit.otherCurtain}</li>}
                  </ul>
              </div>
          )}
      </div>
  );

  const renderDeliveryDetails = (visit: DealVisit) => (
      <div className="space-y-4">
          <div>
              <h4 className="font-semibold text-sm">Delivery/Installation Selected:</h4>
              <ul className="list-disc list-inside text-muted-foreground text-sm">
                  {(visit.deliveryInstallations && visit.deliveryInstallations.length > 0) ? 
                      visit.deliveryInstallations.map(d => d && <li key={d.id}>{deliveryInstallationItems.find(di => di.id === d.id)?.label || d.id} ({d.noOfPcs || 1} Pcs)</li>) 
                      : <li>None</li>}
                  {visit.otherDelivery && <li>Other: {visit.otherDelivery}</li>}
              </ul>
          </div>
          {visit.subDeliveryInstallations && visit.subDeliveryInstallations.length > 0 && (
              <div>
                  <h4 className="font-semibold text-sm">Sub-Delivery/Installation:</h4>
                  <ul className="list-disc list-inside text-muted-foreground text-sm">
                      {visit.subDeliveryInstallations.map(d => d && <li key={d.id}>{subDeliveryInstallationItems.find(sdi => sdi.id === d.id)?.label || d.id} ({d.noOfPcs || 1} Pcs)</li>)}
                  </ul>
              </div>
          )}
      </div>
  );

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
        <Card>
            <CardContent className="p-4">
                 <div className="flex items-center py-4">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Filter by customer..."
                            value={(table.getColumn("customerName")?.getFilterValue() as string) ?? ""}
                            onChange={(event) =>
                                table.getColumn("customerName")?.setFilterValue(event.target.value)
                            }
                            className="max-w-sm pl-9"
                        />
                    </div>
                </div>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                return (
                                    <TableHead key={header.id}>
                                    {header.isPlaceholder
                                        ? null
                                        : flexRender(
                                            header.column.columnDef.header,
                                            header.getContext()
                                        )}
                                    </TableHead>
                                );
                                })}
                            </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                key={row.id}
                                data-state={row.getIsSelected() && "selected"}
                                >
                                {row.getVisibleCells().map((cell) => (
                                    <TableCell key={cell.id}>
                                    {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext()
                                    )}
                                    </TableCell>
                                ))}
                                </TableRow>
                            ))
                            ) : (
                            <TableRow>
                                <TableCell
                                colSpan={columns.length}
                                className="h-24 text-center"
                                >
                                No results.
                                </TableCell>
                            </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                 <div className="flex items-center justify-end space-x-2 py-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        Next
                    </Button>
                </div>
            </CardContent>
        </Card>
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
                        <Button variant="secondary" onClick={() => setIsAssigning(true)}>Assign to Installer</Button>
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
