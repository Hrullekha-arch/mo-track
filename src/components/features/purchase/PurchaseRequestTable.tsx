
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
import { ArrowUpDown, ChevronDown, Download, MoreHorizontal, Trash2, Edit, ShieldAlert, CheckCircle } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest, PurchaseStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PoTrackingTimeline } from "@/components/features/purchase/PoTrackingTimeline";
import { PurchaseProcessTimeline } from "./PurchaseProcessTimeline";

interface FlattenedPurchaseItem {
    id: string; // Unique ID for the row
    dealId: string;
    customerName: string;
    salesman: string;
    status: string;
    createdAt: string;
    itemName: string;
    quantity: string;
    poNumber?: string;
    vendorName?: string;
    type: 'fabric' | 'furniture';
    originalRequest: PurchaseRequest;
}


export function PurchaseRequestTable({ tableData, view = "default", timelineType }: { tableData: PurchaseRequest[], view?: "default" | "all" | "po-tracking", timelineType?: 'purchase' | 'po-tracking' }) {
  const [requests, setRequests] = React.useState<FlattenedPurchaseItem[]>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [deletingRequest, setDeletingRequest] = React.useState<PurchaseRequest | null>(null);
  const [timelineRequest, setTimelineRequest] = React.useState<PurchaseRequest | null>(null);


  const { toast } = useToast();
  const { role } = useAuth();
  
  const isAuthorized = role === 'admin' || role === 'Accounts';

  React.useEffect(() => {
    let flattenedData: FlattenedPurchaseItem[] = tableData.flatMap(req => {
        const fabricItems = (req.fabricDetails || []).map(item => ({
            id: `${req.id}-${item.fabricName}`,
            dealId: req.dealId,
            customerName: req.customerName,
            salesman: req.salesman,
            status: req.status || 'Pending Approval',
            createdAt: req.createdAt,
            itemName: item.fabricName,
            quantity: item.quantity,
            poNumber: item.poNumber,
            vendorName: item.vendorName,
            type: 'fabric' as const,
            originalRequest: req,
        }));

        return [...fabricItems];
    });

    if (view === 'po-tracking') {
        flattenedData = flattenedData.filter(item => !!item.poNumber);
    }
    setRequests(flattenedData);
  }, [tableData, view]);
  
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


  const columns: ColumnDef<FlattenedPurchaseItem>[] = [
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
      cell: ({ row }) => (
          <Button variant="link" onClick={() => setTimelineRequest(row.original.originalRequest)} className="p-0 h-auto font-medium">
              {row.getValue("dealId")}
          </Button>
      )
    },
    {
        accessorKey: 'poNumber',
        header: 'PO Number',
        cell: ({ row }) => {
          const poNumber = row.original.poNumber;
           return poNumber ? (
              <Button variant="link" onClick={() => setTimelineRequest(row.original.originalRequest)} className="p-0 h-auto font-medium">
                  {poNumber}
              </Button>
            ) : '-';
        }
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
        accessorKey: "itemName",
        header: "Item Name",
    },
    {
        accessorKey: "quantity",
        header: "Quantity",
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
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
            const status = row.original.status || 'Pending Approval';
            let variant: "default" | "secondary" | "destructive" | "outline" = "secondary";
            let Icon = null;
            if (status === "Approved") variant = "secondary";
            if (status === "Pending Approval") variant = "outline";
            if (status === "PO Generated") variant = "default";
            if (status === "Completed") {
                variant = "default";
                Icon = CheckCircle;
            }
            return <Badge variant={variant} className={status === 'Completed' ? "bg-green-600 hover:bg-green-700" : ""}>{Icon && <Icon className="mr-1 h-3 w-3"/>}{status}</Badge>;
        },
        filterFn: (row, id, value) => {
            return value.includes(row.getValue(id))
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
        const request = row.original.originalRequest;
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
                Delete Request
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

    const dataToExport = table.getFilteredRowModel().rows.map(row => row.original);

    if (dataToExport.length === 0) {
        toast({
            variant: "destructive",
            title: "Export Failed",
            description: "No data available to export.",
        });
        return;
    }
    
    const formattedData = dataToExport.map(item => ({
        "Order ID": item.dealId,
        "Customer Name": item.customerName,
        "Item Name": item.itemName,
        "Quantity": item.quantity,
        "Type": item.type,
        "Salesman": item.salesman,
        "Status": item.status,
        "PO Number": item.poNumber || '',
        "Created Date": new Date(item.createdAt).toLocaleString(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Purchase Items");
    
    XLSX.writeFile(workbook, `motrack_purchase_items_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
        title: "Export Complete!",
        description: "Your Purchase Items Excel file has been downloaded.",
    });
  }
  
  if (!isAuthorized && view !== 'default') {
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
        <Card>
            <CardContent className="p-4">
                <div className="flex flex-wrap items-center py-4 gap-4">
                    <Input
                        placeholder="Filter by customer or Order ID..."
                        value={(table.getColumn("customerName")?.getFilterValue() as string) ?? ""}
                        onChange={(event) => {
                            table.getColumn("customerName")?.setFilterValue(event.target.value)
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
                            <SelectItem value="Pending Approval">Pending Approval</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
                            <SelectItem value="PO Generated">PO Generated</SelectItem>
                            <SelectItem value="Completed">Completed</SelectItem>
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
                                    : flexRender(header.column.columnDef.header, header.getContext())}
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
      <AlertDialog>
        <Dialog open={!!timelineRequest} onOpenChange={() => setTimelineRequest(null)}>
            <DialogContent className="max-w-2xl">
                 <DialogHeader>
                    <DialogTitle>Timeline for {timelineType === 'purchase' ? 'Purchase Request' : 'PO'} #{timelineRequest?.dealId}</DialogTitle>
                    <DialogDescription>
                        This timeline shows the progress of the {timelineType === 'purchase' ? 'request before a PO is placed' : 'Purchase Order after it has been placed'}.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    {timelineRequest && timelineType === 'purchase' && (
                       <PurchaseProcessTimeline
                            request={timelineRequest}
                            onStepUpdate={() => {}}
                            onRevertStep={() => {}}
                            userRole={role}
                       />
                    )}
                    {timelineRequest && timelineType === 'po-tracking' && (
                       <PoTrackingTimeline 
                            request={timelineRequest}
                            onStepUpdate={() => {}}
                            onRevertStep={() => {}}
                            userRole={role}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
     </AlertDialog>
    </>
  );
}
