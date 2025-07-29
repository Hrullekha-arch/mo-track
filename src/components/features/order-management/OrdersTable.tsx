
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
import { ArrowUpDown, ChevronDown, Download, MoreHorizontal, ShieldAlert, Trash2, CalendarIcon, Search, X, PlusCircle } from "lucide-react";
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
import Link from "next/link";
import { format, isWithinInterval } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";


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


  // New states for advanced filters
  const [orderNoFilter, setOrderNoFilter] = React.useState("");
  const [dateRangeFilter, setDateRangeFilter] = React.useState<DateRange | undefined>();
  const [storeFilter, setStoreFilter] = React.useState("all");

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
      id: "index",
      header: "#",
      cell: ({ row, table }) => {
        const sortedRowModel = table.getSortedRowModel();
        const rowModel = sortedRowModel ? sortedRowModel : table.getRowModel();
        const sortedRowIndex = rowModel.rows.findIndex(sortedRow => sortedRow.id === row.id);
        const pageIndex = table.getState().pagination.pageIndex;
        const pageSize = table.getState().pagination.pageSize;
        return <span>{pageIndex * pageSize + sortedRowIndex + 1}</span>;
      }
    },
    {
      accessorKey: "crmOrderNo",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Order No
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
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
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Remark
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      id: "status",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Status
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const lastCompleted = row.original.milestones.slice().reverse().find(m => m.completed);
        const status = lastCompleted?.name || "Order Received";
        let badgeText = 'NEW';
        if (status) {
            badgeText = status.toUpperCase();
        }
        return <Badge variant="secondary">{badgeText}</Badge>;
      }
    },
    {
      accessorKey: "salesPerson",
       header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Created By
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="uppercase">{row.original.salesPerson.split(' ')[0]}</div>
    },
    {
      accessorKey: "createdAt",
      header: "Created On",
      cell: ({ row }) => format(new Date(row.getValue("createdAt")), "dd/MM/yyyy"),
    },
    {
      accessorKey: "storeName",
      header: "Store Name",
      cell: ({ row }) => row.original.storeName || "N/A",
    },
    {
      accessorKey: "customerName",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Contact Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: "customerPhone",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Mobile No
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      id: "dealName",
       header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Deal Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
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

  const filteredData = React.useMemo(() => {
    return orders.filter(order => {
      const orderNoMatch = orderNoFilter ? order.crmOrderNo.includes(orderNoFilter) : true;
      const dateMatch = dateRangeFilter?.from ? isWithinInterval(new Date(order.createdAt), { start: dateRangeFilter.from, end: dateRangeFilter.to || dateRangeFilter.from }) : true;
      const storeMatch = storeFilter === 'all' ? true : order.storeName === storeFilter;

      return orderNoMatch && dateMatch && storeMatch;
    });
  }, [orders, orderNoFilter, dateRangeFilter, storeFilter]);

  const table = useReactTable({
    data: filteredData,
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
  
  const clearFilters = () => {
    setOrderNoFilter("");
    setDateRangeFilter(undefined);
    setStoreFilter("all");
    setColumnFilters([]);
  }

  const uniqueStores = Array.from(new Set(orders.map(o => o.storeName).filter(Boolean)));

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
        <div className="w-full p-4 md:p-6 lg:p-8">
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
    <div className="w-full">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Orders Dashboard</h1>
            <p className="text-muted-foreground">A detailed, searchable view of all acknowledged orders.</p>
          </div>
          <Button asChild>
            <Link href="/dashboard/purchase/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Quotation
            </Link>
          </Button>
        </header>
        <Card>
            <CardContent className="p-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Input
                      placeholder="Order No"
                      value={orderNoFilter}
                      onChange={(e) => setOrderNoFilter(e.target.value)}
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="date"
                          variant={"outline"}
                          className={cn(
                            "justify-start text-left font-normal",
                            !dateRangeFilter && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRangeFilter?.from ? (
                            dateRangeFilter.to ? (
                              <>
                                {format(dateRangeFilter.from, "LLL dd, y")} -{" "}
                                {format(dateRangeFilter.to, "LLL dd, y")}
                              </>
                            ) : (
                              format(dateRangeFilter.from, "LLL dd, y")
                            )
                          ) : (
                            <span>From Date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={dateRangeFilter?.from}
                          selected={dateRangeFilter}
                          onSelect={setDateRangeFilter}
                          numberOfMonths={1}
                        />
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="date-to"
                          variant={"outline"}
                          className={cn(
                            "justify-start text-left font-normal",
                            !dateRangeFilter?.to && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRangeFilter?.to ? (
                              format(dateRangeFilter.to, "LLL dd, y")
                          ) : (
                            <span>To Date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={dateRangeFilter?.from}
                          selected={dateRangeFilter}
                          onSelect={setDateRangeFilter}
                          numberOfMonths={1}
                        />
                      </PopoverContent>
                    </Popover>

                    <Select value={storeFilter} onValueChange={setStoreFilter}>
                        <SelectTrigger><SelectValue placeholder="Store*" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Stores</SelectItem>
                            {uniqueStores.map(store => <SelectItem key={store} value={store!}>{store}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select>
                        <SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger>
                        <SelectContent><SelectItem value="placeholder">--SELECT--</SelectItem></SelectContent>
                    </Select>
                    <Select>
                        <SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger>
                        <SelectContent><SelectItem value="placeholder">--SELECT--</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button><Search className="mr-2 h-4 w-4"/>Search</Button>
                    <Button variant="outline" onClick={clearFilters}><X className="mr-2 h-4 w-4"/>Clear</Button>
                  </div>
                </div>

                <div className="flex items-center py-4 gap-4">
                     <div className="ml-auto relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                         <Input
                            placeholder="Search..."
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
