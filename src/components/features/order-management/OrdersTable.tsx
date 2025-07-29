
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
import { ArrowUpDown, ChevronDown, Download, MoreHorizontal, ShieldAlert, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
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
import { collection, onSnapshot, query, doc, deleteDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, User } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { NewOrderDialog } from "./NewOrderDialog";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

export function OrdersTable() {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "createdAt", desc: true }
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [deletingOrder, setDeletingOrder] = React.useState<Order | null>(null);
  const [isNewOrderDialogOpen, setIsNewOrderDialogOpen] = React.useState(false);

  const { toast } = useToast();
  const { user, role } = useAuth();
  
  const isAuthorized = role === 'admin' || role === 'employee';

  React.useEffect(() => {
    if (!user) return;

    let ordersQuery;
    if (user.designation === 'CRM') {
        ordersQuery = query(collection(db, "orders"), where("handledByCrm", "==", user.id), where("isAcknowledged", "==", true));
    } else {
        ordersQuery = query(collection(db, "orders"), where("isAcknowledged", "==", true));
    }

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setOrders(ordersData);
      setLoading(false);
    }, (error) => {
        console.error("Firestore Orders Snapshot Error:", error);
        toast({ variant: "destructive", title: "Permission Error", description: "Could not fetch orders. Check Firestore rules."});
        setLoading(false);
    });
    
    return () => unsubscribe();
  }, [user, toast]);
  
  const handleDeleteOrder = async () => {
    if (!deletingOrder || role !== 'admin') return;
    try {
      await deleteDoc(doc(db, "orders", deletingOrder.id));
      toast({ title: "Order Deleted", description: `Order ${deletingOrder.id} has been removed.` });
      setDeletingOrder(null);
    } catch (error) {
      console.error("Error deleting order: ", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to delete order." });
    }
  };

  const columns: ColumnDef<Order>[] = [
    {
      accessorKey: "crmOrderNo",
      header: "Order No",
      cell: ({ row }) => (
        <Button variant="link" asChild className="p-0 h-auto font-medium">
            <Link href={`/dashboard/orders/${row.original.id}`}>
                {row.getValue("crmOrderNo")}
            </Link>
        </Button>
      ),
    },
    {
      id: "noOfItems",
      header: "No Of Items",
      cell: ({ row }) => {
        const fabricCount = row.original.fabricDetails?.length || 0;
        const furnitureCount = row.original.furnitureDetails?.length || 0;
        return <span>{fabricCount + furnitureCount}</span>;
      },
    },
    {
      accessorKey: "remarks",
      header: "Remark",
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const lastCompleted = row.original.milestones.slice().reverse().find(m => m.completed);
        const status = lastCompleted?.name || "Order Received";
        let variant: "default" | "secondary" | "outline" = "secondary";
        if (status === 'Installation Done' || status === 'Completed') variant = 'default';
        if (status === 'Ready for Delivery') variant = 'outline';
        return <Badge variant={variant}>{status}</Badge>;
      }
    },
    {
      accessorKey: "salesPerson",
      header: "Created By",
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Created On
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => format(new Date(row.getValue("createdAt")), "dd/MM/yyyy"),
    },
    {
      accessorKey: "storeName",
      header: "Store Name",
      cell: ({ row }) => row.original.storeName || "N/A",
    },
    {
      accessorKey: "customerName",
      header: "Contact Name",
    },
    {
      accessorKey: "customerPhone",
      header: "Mobile No",
    },
    {
      id: "dealName",
      header: "Deal Name",
      cell: ({ row }) => {
        return `${row.original.orderType.toUpperCase()} (${row.original.crmOrderNo})`
      }
    },
     {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const order = row.original;
        if (role !== 'admin') return null;

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
                onClick={() => setDeletingOrder(order)}
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
    data: orders,
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
    // Export logic here
  }

  if (loading) {
    return (
        <div className="space-y-4 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-10 w-full" />
        </div>
    )
  }
  
  if (!isAuthorized) {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <Card className="mt-8">
                <CardHeader className="text-center">
                    <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
                    <CardTitle className="mt-4">Access Denied</CardTitle>
                    <CardDescription>You do not have permission to view this page.</CardDescription>
                </CardHeader>
            </Card>
        </div>
    )
  }

  return (
    <>
    <div className="w-full container mx-auto p-4 md:p-6 lg:p-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Orders Dashboard</h1>
            <p className="text-muted-foreground">A detailed, searchable view of all acknowledged orders.</p>
          </div>
          <Button onClick={() => setIsNewOrderDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Order
          </Button>
        </header>
        <Card>
            <CardContent className="p-4">
                <div className="flex items-center py-4 gap-4">
                    <Input
                        placeholder="Filter by customer..."
                        value={(table.getColumn("customerName")?.getFilterValue() as string) ?? ""}
                        onChange={(event) =>
                            table.getColumn("customerName")?.setFilterValue(event.target.value)
                        }
                        className="max-w-sm"
                    />
                    <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="ml-auto">
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
                    <Button onClick={handleExport} disabled>
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
     <AlertDialog open={!!deletingOrder} onOpenChange={() => setDeletingOrder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the order from Firestore. 
              This action is irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrder} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <NewOrderDialog isOpen={isNewOrderDialogOpen} onClose={() => setIsNewOrderDialogOpen(false)} />
    </>
  );
}
