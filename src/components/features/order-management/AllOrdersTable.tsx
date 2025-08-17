

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
import { ArrowUpDown, ChevronDown, Download, MoreHorizontal, Trash2, Edit, MapPin, CheckCircle2, XCircle, ShieldAlert, PhoneCall } from "lucide-react";
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
import { Order, User, Milestone } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { MILESTONES_CONFIG } from "@/lib/constants";
import { setBalanceFollowUp } from "@/app/dashboard/all-orders/actions";

function LocationDisplay({ location }: { location: { latitude: number; longitude: number; } }) {
    const [area, setArea] = React.useState("Fetching area...");

    React.useEffect(() => {
        const timer = setTimeout(() => {
            // Simulate API call to reverse geocode
            setArea("Near Main Street"); 
        }, 1000);
        return () => clearTimeout(timer);
    }, [location]);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <p className="flex items-center gap-1 cursor-help">
                    <MapPin className="h-3 w-3"/>
                    {area}
                </p>
            </TooltipTrigger>
            <TooltipContent>
                <p>Lat: {location.latitude.toFixed(4)}, Lon: {location.longitude.toFixed(4)}</p>
            </TooltipContent>
        </Tooltip>
    );
}


export function AllOrdersTable() {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [deletingOrder, setDeletingOrder] = React.useState<Order | null>(null);
  const [followUpOrder, setFollowUpOrder] = React.useState<Order | null>(null);


  const { toast } = useToast();
  const { user, role } = useAuth();
  
  const isAuthorized = role === 'admin';

  React.useEffect(() => {
    if (!isAuthorized) {
        setLoading(false);
        return;
    }
    const ordersQuery = query(collection(db, "orders"));
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setOrders(ordersData);
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
      toast({ title: "Order Deleted", description: `Order ${deletingOrder.id} has been removed. (Firestore only)` });
      setDeletingOrder(null);
    } catch (error) {
      console.error("Error deleting order: ", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to delete order." });
    }
  };
  
  const handleFollowUp = async () => {
    if (!followUpOrder || !user) return;
    try {
        const result = await setBalanceFollowUp(followUpOrder.id, followUpOrder.dealDocId!, user.name);
        if (result.success) {
            toast({ title: "Follow-up Initiated", description: result.message });
        } else {
            toast({ variant: "destructive", title: "Error", description: result.message });
        }
    } catch (error) {
        toast({ variant: "destructive", title: "Server Error", description: "Could not initiate follow-up." });
    } finally {
        setFollowUpOrder(null);
    }
  };


  const getInstallerName = (id?: string) => users.find(u => u.id === id)?.name || "N/A";
  const isFullyCompleted = (order: Order) => order.milestones.every(m => m.completed) && (!!order.feedbackRating || order.bypassedOtp === true);

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
        accessorKey: "orderType",
        header: "Order Type",
        cell: ({ row }) => <Badge variant="outline">{row.getValue("orderType")}</Badge>
    },
    {
        accessorKey: "assignedTo",
        header: "Installer",
        cell: ({ row }) => <div>{getInstallerName(row.getValue("assignedTo"))}</div>,
    },
    {
        id: "lastMilestone",
        header: "Last Milestone",
        cell: ({ row }) => {
            const lastCompleted = row.original.milestones.slice().reverse().find(m => m.completed);
            return <div>{lastCompleted?.name || "Order Received"}</div>;
        }
    },
     {
      id: "otpSubmitted",
      header: "OTP Submitted",
      cell: ({ row }) => {
        const order = row.original;
        if (!isFullyCompleted(order)) {
          return <Badge variant="secondary">N/A</Badge>;
        }
        return order.bypassedOtp ? (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" /> No
          </Badge>
        ) : (
          <Badge variant="default" className="flex items-center gap-1 bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="h-3 w-3" /> Yes
          </Badge>
        );
      },
    },
    {
        id: "milestone_details",
        header: "Milestone Details",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">View</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuLabel>Milestone Progress</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {row.original.milestones.map(m => (
                    <DropdownMenuItem key={m.id} disabled className="flex-col items-start">
                        <div className="flex justify-between w-full font-medium">
                           <span>{m.name}</span>
                           <span>{m.completed ? '✅' : '⏳'}</span>
                        </div>
                         {m.completed && (
                            <div className="text-xs text-muted-foreground w-full space-y-1 mt-1">
                                <p>by {m.completedBy} at {new Date(m.completedAt!).toLocaleString()}</p>
                                {m.location && (
                                  <LocationDisplay location={m.location} />
                                )}
                            </div>
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
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
                onClick={() => setFollowUpOrder(order)}
                disabled={!!order.balanceFollowUp || !!order.paymentConfirmed}
              >
                <PhoneCall className="mr-2 h-4 w-4" />
                Balance Follow-up
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
        description: "Generating detailed Excel file..."
    });

    const dataToExport = table.getFilteredRowModel().rows.map(row => {
        const order = row.original;
        const lastCompleted = order.milestones.slice().reverse().find(m => m.completed);
        
        let flatOrder: any = {
            "Order ID": order.id,
            "Customer Name": order.customerName,
            "Customer Phone": order.customerPhone,
            "Customer Address": order.customerAddress,
            "Order Type": order.orderType,
            "Sales Person": order.salesPerson,
            "Installer": getInstallerName(order.assignedTo),
            "Status": lastCompleted?.name || "Order Received",
            "OTP Submitted By Installer": order.bypassedOtp ? "No" : (!!order.feedbackRating ? "Yes" : "N/A"),
            "Installer Feedback Rating": order.feedbackRating || 'N/A',
            "Installer Feedback Remarks": order.feedbackRemarks || '',
            "Customer Feedback Rating": order.customerFeedbackRating || 'N/A',
            "Customer Feedback Remarks": order.customerFeedbackRemarks || '',
            "Completion Date": order.completedAt ? new Date(order.completedAt).toLocaleString() : "N/A",
            "Created Date": new Date(order.createdAt).toLocaleString(),
        };

        // Add all milestones with their details
        Object.values(MILESTONES_CONFIG).forEach((milestoneConfig, index) => {
            const milestoneId = index + 1;
            const milestoneData = order.milestones.find(m => m.id === milestoneId);
            
            flatOrder[`${milestoneId}. ${milestoneConfig.name} - Status`] = milestoneData ? (milestoneData.completed ? 'Completed' : 'Pending') : 'N/A';
            flatOrder[`${milestoneId}. ${milestoneConfig.name} - Completed At`] = milestoneData?.completedAt ? new Date(milestoneData.completedAt).toLocaleString() : '';
            flatOrder[`${milestoneId}. ${milestoneConfig.name} - Completed By`] = milestoneData?.completedBy || '';
            flatOrder[`${milestoneId}. ${milestoneConfig.name} - Location`] = milestoneData?.location ? `${milestoneData.location.latitude.toFixed(5)}, ${milestoneData.location.longitude.toFixed(5)}` : '';
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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");

    // Make columns wider for better readability
    const maxLengths = Object.keys(dataToExport[0] || {}).map(key => {
        const column = dataToExport.map(item => item[key as keyof typeof item] ?? "");
        const headerLength = key.length;
        const maxLength = Math.max(...column.map(val => String(val).length), headerLength);
        return { wch: Math.min(maxLength + 2, 60) }; // cap width at 60
    });
    worksheet["!cols"] = maxLengths;
    
    XLSX.writeFile(workbook, `motrack_orders_detailed_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
        title: "Export Complete!",
        description: "Your detailed Excel file has been downloaded.",
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
    <TooltipProvider>
    <div className="w-full">
        <Card>
            <CardHeader>
                <CardTitle>All Orders</CardTitle>
                <CardDescription>A detailed, searchable view of every order in the system.</CardDescription>
            </CardHeader>
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
        <AlertDialog open={!!followUpOrder} onOpenChange={() => setFollowUpOrder(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Follow-up</AlertDialogTitle>
                    <AlertDialogDescription>
                        Have you followed up with {followUpOrder?.customerName} for the balance payment? This will send it to the Accounts team for payment confirmation.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleFollowUp}>Yes, I have</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </TooltipProvider>
    </>
  );
}
