

"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, Download, MoreHorizontal, Trash2, Edit, ShieldAlert } from "lucide-react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { collection, onSnapshot, query, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const getStatus = (request: PurchaseRequest) => {
    const isBlocked = request.milestones.some(m => m.stepId <= 3 && m.status === 'skipped');
    if (isBlocked) return "Blocked";

    const lastStepInExisting = 6;
    const lastStepInNew = 11;
    const isCompleted = request.milestones.some(cs => (cs.stepId === lastStepInExisting || cs.stepId === lastStepInNew) && cs.status === 'completed');
    if (isCompleted) return "Order Placed";
    
    return "In Progress";
}

export function PurchaseRequestTable({ view = 'all' }: { view?: 'all' | 'po-tracking' }) {
  const [requests, setRequests] = React.useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [deletingRequest, setDeletingRequest] = React.useState<PurchaseRequest | null>(null);

  const { toast } = useToast();
  const { role } = useAuth();
  
  const isAuthorized = role === 'admin';

  React.useEffect(() => {
    const requestsQuery = query(collection(db, "purchaseRequests"));
    const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      let requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));

      if (view === 'po-tracking') {
          requestsData = requestsData.filter(req => {
              const isOrderPlaced = req.milestones.some(m => (m.stepId === 6 || m.stepId === 11) && m.status === 'completed');
              const isPoProcessCompleted = req.poMilestones?.some(m => m.stepId === 5 && m.status === 'completed');
              return isOrderPlaced && !isPoProcessCompleted;
          });
      }

      setRequests(requestsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [view]);
  
  const handleDeleteRequest = async () => {
    if (!deletingRequest) return;
    try {
      await deleteDoc(doc(db, "purchaseRequests", deletingRequest.id));
      toast({ title: "Purchase Request Deleted", description: `Request ${deletingRequest.id} has been removed.` });
      setDeletingRequest(null);
    } catch (error) {
      console.error("Error deleting request: ", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to delete request." });
    }
  };


  const columns: ColumnDef<PurchaseRequest>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "dealId",
      header: "Order ID",
      cell: ({ row }) => <div className="font-mono">{row.getValue("dealId")}</div>,
    },
    {
      accessorKey: "customerName",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Customer
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div>{row.getValue("customerName")}</div>,
    },
    {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => <Badge variant="outline" className="capitalize">{row.getValue("type")}</Badge>,
        filterFn: (row, id, value) => {
            return value.includes(row.getValue(id))
        }
    },
    {
        accessorKey: "salesman",
        header: "Salesman",
        cell: ({ row }) => <div>{row.getValue("salesman")}</div>,
    },
    {
        id: "status",
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
            const status = getStatus(row.original);
            let variant: "default" | "secondary" | "destructive" = "secondary";
            if (status === "Order Placed") variant = "default";
            if (status === "Blocked") variant = "destructive";
            return <Badge variant={variant}>{status}</Badge>;
        },
        filterFn: (row, id, value) => {
            return value.includes(getStatus(row.original))
        }
    },
    {
      accessorKey: "createdAt",
      header: "Created Date",
      cell: ({ row }) => new Date(row.getValue("createdAt")).toLocaleDateString(),
    },
     {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const request = row.original;
        if (!isAuthorized) return null;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeletingRequest(request)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: requests,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  const handleExport = () => {
    toast({
        title: "Export Started",
        description: "Generating Purchase Requests Excel file..."
    });

    const dataToExport = table.getFilteredRowModel().rows.map(row => {
        const request = row.original;
        let flatRequest: any = {
            "Order ID": request.dealId,
            "Customer Name": request.customerName,
            "Type": request.type,
            "Salesman": request.salesman,
            "Work Type": request.workType,
            "Status": getStatus(request),
            "Created Date": new Date(request.createdAt).toLocaleString(),
            "Promise Delivery Date": new Date(request.promiseDeliveryDate).toLocaleDateString(),
            "Items": (request.type === 'fabric' ? request.fabricDetails : request.furnitureDetails)
                        ?.map(item => `${(item as any).fabricName || (item as any).furnitureName}: ${item.quantity}`).join(', '),
        };
        return flatRequest;
    });

    if (dataToExport.length === 0) {
        toast({
            variant: "destructive",
            title: "Export Failed",
            description: "No data available to export.",
        });
        return;
    }

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Purchase Requests");
    
    XLSX.writeFile(workbook, `motrack_purchase_requests_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
        title: "Export Complete!",
        description: "Your Purchase Requests Excel file has been downloaded.",
    });
  }

  if (loading) {
    return (
        <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-10 w-full" />
        </div>
    )
  }
  
  if (!isAuthorized) {
    return (
        <Card className="mt-8">
            <CardHeader className="text-center">
                <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
                <CardTitle className="mt-4">Access Denied</CardTitle>
                <CardDescription>You do not have permission to view this page.</CardDescription>
            </CardHeader>
        </Card>
    )
  }

  return (
    <>
    <div className="w-full">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">{view === 'po-tracking' ? 'PO Tracking' : 'Purchase Requests'}</h1>
          <p className="text-muted-foreground">A detailed view of all {view === 'po-tracking' ? 'active purchase orders' : 'purchase requests'}.</p>
        </header>
        <Card>
            <CardContent className="p-4">
                <div className="flex flex-wrap items-center py-4 gap-4">
                    <Input
                        placeholder="Filter by customer or Order ID..."
                        value={table.getColumn("customerName")?.getFilterValue() as string ?? ""}
                        onChange={(event) => {
                            const customerFilter = event.target.value;
                            table.getColumn("customerName")?.setFilterValue(customerFilter);
                            // Also filter dealId for a combined search
                            table.getColumn("dealId")?.setFilterValue(customerFilter);
                        }}
                        className="max-w-sm"
                    />
                     <Select
                        value={(table.getColumn("type")?.getFilterValue() as string) ?? "all"}
                        onValueChange={(value) =>
                            table.getColumn("type")?.setFilterValue(value === "all" ? null : value)
                        }
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter by Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="fabric">Fabric</SelectItem>
                            <SelectItem value="furniture">Furniture</SelectItem>
                        </SelectContent>
                    </Select>
                     <Select
                        value={(table.getColumn("status")?.getFilterValue() as string) ?? "all"}
                        onValueChange={(value) =>
                            table.getColumn("status")?.setFilterValue(value === "all" ? null : value)
                        }
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter by Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="In Progress">In Progress</SelectItem>
                            <SelectItem value="Order Placed">Order Placed</SelectItem>
                            <SelectItem value="Blocked">Blocked</SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="flex-grow" />

                    <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                        Columns <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {table
                        .getAllColumns()
                        .filter((column) => column.getCanHide())
                        .map((column) => {
                            return (
                            <DropdownMenuCheckboxItem
                                key={column.id}
                                className="capitalize"
                                checked={column.getIsVisible()}
                                onCheckedChange={(value) =>
                                column.toggleVisibility(!!value)
                                }
                            >
                                {column.id.replace(/_/g, " ")}
                            </DropdownMenuCheckboxItem>
                            );
                        })}
                    </DropdownMenuContent>
                    </DropdownMenu>
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
                    <div className="flex-1 text-sm text-muted-foreground">
                    {table.getFilteredSelectedRowModel().rows.length} of{" "}
                    {table.getFilteredRowModel().rows.length} row(s) selected.
                    </div>
                    <div className="space-x-2">
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
                </div>
            </CardContent>
        </Card>
    </div>
     <AlertDialog open={!!deletingRequest} onOpenChange={() => setDeletingRequest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the purchase request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRequest} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
