

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
import { ArrowUpDown, Search, Eye, Share2, Copy } from "lucide-react";
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
import { DealVisit, Customer, Deal, User, DeliveryInstallationItem } from "@/lib/types";
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
    customerAddress?: string;
    customer?: Customer | null;
}

const renderMeasurementDetails = (visit: DealVisit) => (
    <div className="space-y-4 text-sm">
        <div>
            <h4 className="font-semibold mb-1">Measurements Selected:</h4>
            <ul className="list-disc list-inside text-muted-foreground">
                {(visit.measurements && visit.measurements.length > 0) ? visit.measurements.map(m => <li key={m}>{measurementItems.find(mi => mi.id === m)?.label || m}</li>) : <li>None</li>}
            </ul>
        </div>
         {visit.blinds && visit.blinds.length > 0 && (
            <div>
                <h4 className="font-semibold mb-1">Blind Types:</h4>
                <ul className="list-disc list-inside text-muted-foreground">
                    {visit.blinds.map(b => <li key={b}>{subMeasurementBlinds.find(s => s.id === b)?.label || b}</li>)}
                </ul>
            </div>
        )}
         {visit.curtain && visit.curtain.length > 0 && (
            <div>
                <h4 className="font-semibold mb-1">Curtain Types:</h4>
                <ul className="list-disc list-inside text-muted-foreground">
                   {visit.curtain.map(c => <li key={c}>{subMeasurementCurtain.find(s => s.id === c)?.label || c}</li>)}
                   {visit.otherCurtain && <li>Other: {visit.otherCurtain}</li>}
                </ul>
            </div>
        )}
    </div>
);

const renderDeliveryDetails = (visit: DealVisit) => (
    <div className="space-y-4 text-sm">
        <div>
            <h4 className="font-semibold mb-1">Delivery/Installation Selected:</h4>
            <ul className="list-disc list-inside text-muted-foreground">
                {(visit.deliveryInstallations && visit.deliveryInstallations.length > 0) ? 
                    visit.deliveryInstallations.map(d => d && <li key={d.id}>{deliveryInstallationItems.find(di => di.id === d.id)?.label || d.id} ({d.noOfPcs || 1} Pcs)</li>) 
                    : <li>None</li>}
                {visit.otherDelivery && <li>Other: {visit.otherDelivery}</li>}
            </ul>
        </div>
         {visit.subDeliveryInstallations && visit.subDeliveryInstallations.length > 0 && (
            <div>
                <h4 className="font-semibold mb-1">Sub-Delivery/Installation:</h4>
                <ul className="list-disc list-inside text-muted-foreground">
                    {visit.subDeliveryInstallations.map(d => d && <li key={d.id}>{subDeliveryInstallationItems.find(sdi => sdi.id === d.id)?.label || d.id} ({d.noOfPcs || 1} Pcs)</li>)}
                </ul>
            </div>
        )}
    </div>
);


function VisitsTable({ 
    visits, 
    users, 
    onAssign, 
    onRowClick,
    onShare,
    showAddress = false
}: { 
    visits: EnrichedDealVisit[], 
    users: User[], 
    onAssign: (visit: EnrichedDealVisit) => void, 
    onRowClick: (visit: EnrichedDealVisit) => void,
    onShare: (visit: EnrichedDealVisit) => void,
    showAddress?: boolean
}) {
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

    const getRepresentativeName = (id: string) => users.find(u => u.id === id)?.name || id;

    const baseColumns: ColumnDef<EnrichedDealVisit>[] = [
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
    ];

    const addressColumn: ColumnDef<EnrichedDealVisit> = {
        accessorKey: "customerAddress",
        header: "Address",
        cell: ({ row }) => {
            const address = row.original.customerAddress || (row.original.customer as any)?.addressPinCode || "Not Set";
            return <div className="text-xs max-w-xs truncate">{address}</div>
        }
    };
    
    const visitSpecificColumns: ColumnDef<EnrichedDealVisit>[] = [
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
                 if (visit.status === 'completed') {
                    status = 'completed'
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
                const canBeAssigned = row.original.status === 'approved' || row.original.status === 'completed';

                if (canBeAssigned) {
                    if (!assignedToId) {
                        return <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onAssign(row.original); }}>Assign</Button>;
                    }
                    const installer = users.find(u => u.id === assignedToId);
                    return <Button variant="ghost" onClick={(e) => { e.stopPropagation(); onAssign(row.original); }}>{installer?.name || 'Unknown'}</Button>;
                }

                return (
                    <div className="flex items-center gap-2">
                        <Badge variant="outline">Pending Customer</Badge>
                         <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onShare(row.original);}}>
                            <Share2 className="h-4 w-4" />
                        </Button>
                    </div>
                )
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
        {
            id: "measurement",
            header: "Measurement",
            cell: ({ row }) => {
                const visit = row.original;
                if (visit.typeOfVisit === 'measurement' && visit.measurementPdfUrl) {
                    return (
                        <Button asChild variant="ghost" size="icon">
                            <Link href={visit.measurementPdfUrl} target="_blank" rel="noopener noreferrer">
                                <Eye className="h-4 w-4" />
                            </Link>
                        </Button>
                    );
                }
                return null;
            },
        }
    ];

    const columns = showAddress ? [...baseColumns.slice(0, 1), addressColumn, ...baseColumns.slice(1), ...visitSpecificColumns] : [...baseColumns, ...visitSpecificColumns];

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
  const [shareableLink, setShareableLink] = React.useState<string | null>(null);
  
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
            let customerAddress = visit.customerAddress || '';

            if (!customerCache.has(customerId)) {
                const customerRef = doc(db, 'customers', customerId);
                const customerSnap = await getDoc(customerRef);
                if (customerSnap.exists()) {
                    const customerData = { id: customerSnap.id, ...customerSnap.data() } as Customer;
                    customerCache.set(customerId, customerData);
                    if (!customerAddress) {
                        customerAddress = customerData.addressPinCode || '';
                    }
                }
            }
            customerName = customerCache.get(customerId)?.name || 'Unknown';
            if (!customerAddress) {
                customerAddress = customerCache.get(customerId)?.addressPinCode || '';
            }

            
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

            return { ...visit, id: docSnap.id, customerId, dealDocId, customerName, dealName, dealId, customerAddress, customer: customerCache.get(customerId) || null };
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

  const handleShareClick = (visit: EnrichedDealVisit) => {
    const baseURL = "https://mo-track-yerq.vercel.app";
    const link = `${baseURL}/visit/confirm/${visit.id}?customerId=${visit.customerId}&dealId=${visit.dealDocId}`;
    setShareableLink(link);
  };
  
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
                        <VisitsTable visits={requestedVisits} users={users} onAssign={setSelectedVisit} onRowClick={setSelectedVisit} onShare={handleShareClick} />
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
                        <VisitsTable visits={approvedVisits} users={users} onAssign={(v) => { setSelectedVisit(v); setIsAssigning(true); }} onRowClick={setSelectedVisit} onShare={handleShareClick} showAddress={true} />
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
        
        {selectedVisit && (
            <Dialog open={!!selectedVisit && !isAssigning} onOpenChange={() => setSelectedVisit(null)}>
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
        <Dialog open={!!shareableLink} onOpenChange={() => setShareableLink(null)}>
             <DialogContent>
                <DialogHeader>
                    <DialogTitle>Share Confirmation Link</DialogTitle>
                    <DialogDescription>
                        Copy and send this link to the customer via WhatsApp or SMS.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Input value={shareableLink || ""} readOnly />
                </div>
                <DialogFooter>
                    <Button onClick={() => {
                        navigator.clipboard.writeText(shareableLink || "");
                        toast({title: "Link Copied!"});
                    }}>
                        <Copy className="mr-2 h-4 w-4"/> Copy Link
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}
