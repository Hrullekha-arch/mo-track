
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
import { Order, User, O2DStep, O2DStatus } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { O2D_PROCESS_CONFIG } from "@/lib/constants";

export function O2DTable() {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [deletingOrder, setDeletingOrder] = React.useState<Order | null>(null);

  const { toast } = useToast();
  const { role } = useAuth();
  
  const isAuthorized = role === 'admin';

  React.useEffect(() => {
    if (!isAuthorized) {
        setLoading(false);
        return;
    }
    const ordersQuery = query(collection(db, "orders"));
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      const o2dOrders = ordersData.filter(order => {
        const finalStep = order.o2dMilestones?.find(m => m.stepId === 10);
        return !finalStep;
      });
      setOrders(o2dOrders);
      setLoading(false);
    });

    const usersQuery = query(collection(db, "users"));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(usersData);
    });

    return () => {
      unsubscribeOrders();
      unsubscribeUsers();
    };
  }, [isAuthorized]);
  
  const handleDeleteOrder = async () => {
    if (!deletingOrder) return;
    try {
      await deleteDoc(doc(db, "orders", deletingOrder.id));
      toast({ title: "Order Deleted", description: `Order ${deletingOrder.id} has been removed.` });
      setDeletingOrder(null);
    } catch (error) {
      console.error("Error deleting order: ", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to delete order." });
    }
  };


  const getCrmHandlerName = (id?: string) => users.find(u => u.id === id)?.name || "N/A";

  const columns: ColumnDef<Order>[] = [
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
      accessorKey: "id",
      header: "Order ID",
      cell: ({ row }) => <div className="font-mono">{row.getValue("id")}</div>,
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
        accessorKey: "salesPerson",
        header: "Sales Person",
        cell: ({ row }) => <div>{row.getValue("salesPerson")}</div>
    },
    {
        accessorKey: "handledByCrm",
        header: "CRM Handler",
        cell: ({ row }) => <div>{getCrmHandlerName(row.getValue("handledByCrm"))}</div>,
    },
    {
        id: "current_step",
        header: "Current O2D Step",
        cell: ({ row }) => {
            const completedSteps = (row.original.o2dMilestones || []).filter(m => m.status === 'completed' || m.status === 'skipped');
            const lastCompletedId = completedSteps.reduce((maxId, step) => Math.max(maxId, step.stepId), 0);
            const currentStep = O2D_PROCESS_CONFIG.find(s => s.id === lastCompletedId + 1);
            return <div>{currentStep?.step || 'Order Received'}</div>;
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
    toast({
        title: "Export Started",
        description: "Generating O2D Excel file..."
    });

    const dataToExport = table.getFilteredRowModel().rows.map(row => {
        const order = row.original;
        
        let flatOrder: any = {
            "Order ID": order.id,
            "Customer Name": order.customerName,
            "Customer Phone": order.customerPhone,
            "Customer Address": order.customerAddress,
            "Sales Person": order.salesPerson,
            "CRM Handler": getCrmHandlerName(order.handledByCrm),
            "Created Date": new Date(order.createdAt).toLocaleString(),
        };

        O2D_PROCESS_CONFIG.forEach(stepConfig => {
            const milestoneData = order.o2dMilestones?.find(m => m.stepId === stepConfig.id);
            flatOrder[`${stepConfig.id}. ${stepConfig.step} - Status`] = milestoneData?.status || 'Pending';
            flatOrder[`${stepConfig.id}. ${stepConfig.step} - Completed At`] = milestoneData?.completedAt ? new Date(milestoneData.completedAt).toLocaleString() : '';
            flatOrder[`${stepConfig.id}. ${stepConfig.step} - Completed By`] = milestoneData?.completedBy || '';
            flatOrder[`${stepConfig.id}. ${stepConfig.step} - Remarks`] = milestoneData?.remarks || '';
        });
        
        return flatOrder;
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
    XLSX.utils.book_append_sheet(workbook, worksheet, "O2D Orders");
    
    const maxLengths = Object.keys(dataToExport[0] || {}).map(key => {
        const column = dataToExport.map(item => item[key as keyof typeof item] ?? "");
        const headerLength = key.length;
        const maxLength = Math.max(...column.map(val => String(val).length), headerLength);
        return { wch: Math.min(maxLength + 2, 60) };
    });
    worksheet["!cols"] = maxLengths;
    
    XLSX.writeFile(workbook, `motrack_o2d_orders_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
        title: "Export Complete!",
        description: "Your O2D Excel file has been downloaded.",
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
          <h1 className="text-3xl font-bold tracking-tight">O2D Orders</h1>
          <p className="text-muted-foreground">A detailed view of all orders currently in the O2D phase.</p>
        </header>
        <Card>
            <CardContent className="p-4">
                <div className="flex items-center py-4 gap-4">
                    <Input
                    placeholder="Filter customers..."
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
    </>
  );
}

    