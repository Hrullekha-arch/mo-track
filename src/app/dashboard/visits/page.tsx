
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
import { ArrowUpDown, Search } from "lucide-react";
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
import { collection, onSnapshot, query, getDocs, collectionGroup } from "firebase/firestore";
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

    const fetchAllData = async () => {
        try {
            const customersSnapshot = await getDocs(collection(db, "customers"));
            const allVisits: EnrichedDealVisit[] = [];

            for (const customerDoc of customersSnapshot.docs) {
                const customer = { id: customerDoc.id, ...customerDoc.data() } as Customer;
                const dealsSnapshot = await getDocs(collection(db, `customers/${customer.id}/deals`));
                for (const dealDoc of dealsSnapshot.docs) {
                    const deal = { id: dealDoc.id, ...dealDoc.data() } as Deal;
                    const visitsSnapshot = await getDocs(collection(db, `customers/${customer.id}/deals/${deal.id}/visits`));
                    visitsSnapshot.forEach(visitDoc => {
                        allVisits.push({
                            ...(visitDoc.data() as DealVisit),
                            id: visitDoc.id,
                            dealId: deal.dealId, // This was missing
                            customerId: customer.id,
                            customerName: customer.name || 'Unknown',
                            dealDocId: deal.id,
                            dealName: deal.dealName,
                        });
                    });
                }
            }
            setVisits(allVisits);
        } catch (error) {
            console.error("Error fetching visits:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not load visit data. Please check your Firestore permissions."
            });
        } finally {
            setLoading(false);
        }
    };

    fetchAllData();

    return () => unsubscribeUsers();
  }, [toast]);
  
  const getRepresentativeName = (id: string) => users.find(u => u.id === id)?.name || id;

  const columns: ColumnDef<EnrichedDealVisit>[] = [
    {
      accessorKey: "dealId",
      header: "Deal ID",
      cell: ({ row }) => (
          <Button variant="link" className="p-0 h-auto" onClick={() => setSelectedVisit(row.original)}>
            {row.original.dealId}
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
      accessorKey: "createdBy",
      header: "Created By",
    },
    {
      accessorKey: "createdAt",
      header: "Created On",
      cell: ({ row }) => format(new Date(row.getValue("createdAt")), "dd/MM/yyyy"),
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
      <div className="space-y-2">
          <div>
              <h4 className="font-semibold">Measurements Selected:</h4>
              <ul className="list-disc list-inside text-muted-foreground">
                  {(visit.measurements && visit.measurements.length > 0) ? visit.measurements.map(m => <li key={m}>{measurementItems.find(mi => mi.id === m)?.label || m}</li>) : <li>None</li>}
              </ul>
          </div>
          {visit.blinds && visit.blinds.length > 0 && (
              <div>
                  <h4 className="font-semibold">Blind Types:</h4>
                  <ul className="list-disc list-inside text-muted-foreground">
                      {visit.blinds.map(b => <li key={b}>{subMeasurementBlinds.find(s => s.id === b)?.label || b}</li>)}
                  </ul>
              </div>
          )}
          {visit.curtain && visit.curtain.length > 0 && (
              <div>
                  <h4 className="font-semibold">Curtain Types:</h4>
                  <ul className="list-disc list-inside text-muted-foreground">
                      {visit.curtain.map(c => <li key={c}>{subMeasurementCurtain.find(s => s.id === c)?.label || c}</li>)}
                      {visit.otherCurtain && <li>Other: {visit.otherCurtain}</li>}
                  </ul>
              </div>
          )}
      </div>
  );

  const renderDeliveryDetails = (visit: DealVisit) => (
      <div className="space-y-2">
          <div>
              <h4 className="font-semibold">Delivery/Installation Selected:</h4>
              <ul className="list-disc list-inside text-muted-foreground">
                  {(visit.deliveryInstallations && visit.deliveryInstallations.length > 0) ? 
                      visit.deliveryInstallations.map(d => <li key={d.id}>{deliveryInstallationItems.find(di => di.id === d.id)?.label || d.id} ({d.noOfPcs || 1} Pcs)</li>) 
                      : <li>None</li>}
                  {visit.otherDelivery && <li>Other: {visit.otherDelivery}</li>}
              </ul>
          </div>
          {visit.subDeliveryInstallations && visit.subDeliveryInstallations.length > 0 && (
              <div>
                  <h4 className="font-semibold">Sub-Delivery/Installation:</h4>
                  <ul className="list-disc list-inside text-muted-foreground">
                      {visit.subDeliveryInstallations.map(d => <li key={d.id}>{subDeliveryInstallationItems.find(sdi => sdi.id === d.id)?.label || d.id} ({d.noOfPcs || 1} Pcs)</li>)}
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
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                        <Button variant="secondary" onClick={() => setIsAssigning(true)}>Assign to Installer</Button>
                        <Button variant="outline" onClick={() => setSelectedVisit(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )}
        <AssignInstallerDialog
            isOpen={isAssigning}
            onClose={() => setIsAssigning(false)}
            onAssign={(installerId) => {
                console.log(`Assigning visit ${selectedVisit?.id} to installer ${installerId}`);
                setIsAssigning(false);
            }}
            installers={users.filter(u => u.role === 'installer')}
            currentInstallerId={selectedVisit?.assignedTo}
        />
    </div>
  );
}
