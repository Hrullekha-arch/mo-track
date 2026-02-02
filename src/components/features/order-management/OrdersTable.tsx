
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
import { ArrowUpDown, ChevronDown, Download, MoreHorizontal, ShieldAlert, Trash2, CalendarIcon, Search, X, PlusCircle, Check, Clock, Loader2 } from "lucide-react";
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
import { collection, onSnapshot, query, doc, deleteDoc, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, User } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import Link from "next/link";
import { format, differenceInHours, startOfDay, endOfDay } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { NewOrderDialog } from "./NewOrderDialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { setFullKittingTime } from "./actions";

function OrderTableComponent({
  data,
  columns,
  loading,
  searching,
  onSearch,
  onClear,
}: {
  data: Order[];
  columns: ColumnDef<Order>[];
  loading: boolean;
  searching: boolean;
  onSearch: (filters: { orderNo: string; dateRange?: DateRange; store: string }) => void;
  onClear: () => void;
}) {
    const [sorting, setSorting] = React.useState<SortingState>([
        { id: "createdAt", desc: true }
    ]);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
    const [rowSelection, setRowSelection] = React.useState({});
    const [orderNoFilter, setOrderNoFilter] = React.useState("");
    const [dateRangeFilter, setDateRangeFilter] = React.useState<DateRange | undefined>();
    const [storeFilter, setStoreFilter] = React.useState("all");

    const table = useReactTable({
        data,
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

    const uniqueStores = ["MO GCR BRANCH", "MO MG ROAD", "MO SULTANPUR"];

    const clearFilters = () => {
        setOrderNoFilter("");
        setDateRangeFilter(undefined);
        setStoreFilter("all");
        onClear();
    }

    return (
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
                    <Button
                      onClick={() =>
                        onSearch({
                          orderNo: orderNoFilter,
                          dateRange: dateRangeFilter,
                          store: storeFilter,
                        })
                      }
                      disabled={searching}
                    >
                      {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                      Search
                    </Button>
                    <Button variant="outline" onClick={clearFilters} disabled={searching}>
                      <X className="mr-2 h-4 w-4" />
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="flex items-center py-4 gap-4">
                     <div className="ml-auto relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                         <Input
                            placeholder="Search in results..."
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
                            {loading ? (
                                 <TableRow>
                                    <TableCell colSpan={columns.length} className="h-24 text-center">
                                        <Skeleton className="h-full w-full" />
                                    </TableCell>
                                </TableRow>
                            ) : table.getRowModel().rows?.length ? (
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
    )
}

function KittingTimePicker({ order }: { order: Order }) {
    const { toast } = useToast();
    const sentToStitchingMilestone = order.milestones.find(m => m.id === 3);

    const [kittingDate, setKittingDate] = React.useState<Date | undefined>(
        order.fullKittingTime ? new Date(order.fullKittingTime) : undefined
    );
    const [isLoading, setIsLoading] = React.useState(false);

    const handleDateChange = async (date: Date | undefined) => {
        if (!date) return;
        setKittingDate(date);
        setIsLoading(true);

        const result = await setFullKittingTime(order.id, date.toISOString());
        if (result.success) {
            toast({ title: "Kitting Time Saved!" });
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.message });
        }
        setIsLoading(false);
    }
    
    if (!sentToStitchingMilestone?.completed) {
        return <span className="text-xs text-muted-foreground">-</span>;
    }

    const timeSinceStitching = differenceInHours(new Date(), new Date(sentToStitchingMilestone.completedAt!));
    const isPastGracePeriod = timeSinceStitching > 1;

    let colorClass = "text-foreground";
    if(order.fullKittingTimeReupdated) {
        colorClass = "text-orange-500";
    } else if (order.fullKittingTime && isPastGracePeriod) {
        colorClass = "text-destructive";
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant={"outline"}
                    className={cn(
                        "w-[200px] justify-start text-left font-normal",
                        !kittingDate && "text-muted-foreground",
                        colorClass
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (kittingDate ? format(kittingDate, "PPP") : <span>Set Time</span>)}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
                <Calendar
                    mode="single"
                    selected={kittingDate}
                    onSelect={handleDateChange}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    );
}

export function OrdersTable() {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searching, setSearching] = React.useState(false);
  const [deletingOrder, setDeletingOrder] = React.useState<Order | null>(null);
  const [isQuotationDialogOpen, setIsQuotationDialogOpen] = React.useState(false);
  const [serverFilters, setServerFilters] = React.useState<{
    orderNo: string;
    dateRange?: DateRange;
    store: string;
  }>({ orderNo: "", dateRange: undefined, store: "all" });

  const { toast } = useToast();
  const { user, role } = useAuth();
  
  const isAuthorized = role === 'admin' || role === 'employee';

  const buildOrdersQuery = React.useCallback(() => {
    if (!user) return null;
    const constraints: any[] = [];

    if (user.designation === "CRM") {
      constraints.push(where("handledByCrm", "==", user.id));
    }

    constraints.push(where("isAcknowledged", "==", true));
    constraints.push(where("status", "==", "Approved"));

    const normalizedOrderNo = serverFilters.orderNo.trim().replace(/^MOTRACK-/i, "");
    if (normalizedOrderNo) {
      constraints.push(where("crmOrderNo", "==", normalizedOrderNo));
    }

    const hasCustomDate = !!serverFilters.dateRange?.from;
    const hasCustomStore = serverFilters.store !== "all";
    const hasCustomFilters = !!normalizedOrderNo || hasCustomDate || hasCustomStore;

    const rangeStart = hasCustomDate
      ? startOfDay(serverFilters.dateRange!.from!)
      : startOfDay(new Date());
    const rangeEnd = hasCustomDate
      ? endOfDay(serverFilters.dateRange!.to ?? serverFilters.dateRange!.from!)
      : endOfDay(new Date());

    if (!hasCustomFilters || hasCustomDate) {
      constraints.push(where("createdAt", ">=", rangeStart.toISOString()));
      constraints.push(where("createdAt", "<=", rangeEnd.toISOString()));
    }

    if (hasCustomStore) {
      constraints.push(where("storeName", "==", serverFilters.store));
    }

    constraints.push(orderBy("createdAt", "desc"));
    return query(collection(db, "orders"), ...constraints);
  }, [user, serverFilters]);

  React.useEffect(() => {
    const ordersQuery = buildOrdersQuery();
    if (!ordersQuery) return;

    setSearching(true);
    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        setOrders(ordersData);
        setLoading(false);
        setSearching(false);
      },
      (error) => {
        console.error("Firestore Orders Snapshot Error:", error);
        toast({ variant: "destructive", title: "Permission Error", description: "Could not fetch orders. Check Firestore rules."});
        setLoading(false);
        setSearching(false);
      }
    );
    
    return () => unsubscribe();
  }, [buildOrdersQuery, toast]);
  
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
        const pageIndex = table.getState().pagination.pageIndex;
        const pageSize = table.getState().pagination.pageSize;
        return <span>{pageIndex * pageSize + row.index + 1}</span>;
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
        id: "fullKittingTime",
        header: "Full Kitting Time",
        cell: ({ row }) => <KittingTimePicker order={row.original} />,
    },
    {
      id: "noOfItems",
      header: "No Of Items",
      cell: ({ row }) => {
        const fabricCount = row.original.fabricDetails?.length || 0;
        return <span>{fabricCount}</span>;
      },
    },
    {
        id: "allocatedStatus",
        header: "Allocated Status",
        cell: ({ row }) => {
          const order = row.original;
          const totalItems = order.fabricDetails?.length || 0;
          if (totalItems === 0) return <Badge variant="outline">N/A</Badge>;
      
          const allocatedItemsCount = order.fabricDetails?.filter(item => item.status === 'allocated').length || 0;
          
          if (allocatedItemsCount === totalItems) {
            return <Badge className="bg-green-600">Allocated</Badge>;
          }

          const inStockOrAllocatedItems = order.fabricDetails?.filter(item => item.status === 'in stock' || item.status === 'allocated').length || 0;
      
          const allAvailable = inStockOrAllocatedItems === totalItems;
          const someAvailable = inStockOrAllocatedItems > 0;
      
          let badgeClass = "bg-red-500";
          if (allAvailable) {
            badgeClass = "bg-green-500";
          } else if (someAvailable) {
            badgeClass = "bg-yellow-500 text-black";
          }
      
          return <Badge className={badgeClass}>{`${inStockOrAllocatedItems} / ${totalItems}`}</Badge>;
        }
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
      cell: ({ row }) => row.original.remarks || '-',
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
        const order = row.original;
        let status = "NEW";
        const lastCompleted = order.milestones.slice().reverse().find(m => m.completed);
        if (lastCompleted) {
          status = lastCompleted.name.toUpperCase();
        } else if (order.status === 'Pending Approval') {
            status = 'PENDING APPROVAL';
        }
        
        return <Badge variant={status === 'PENDING APPROVAL' ? 'destructive' : 'secondary'}>{status}</Badge>;
      }
    },
    {
      accessorKey: "salesPerson",
       header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Salesman
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
          Contact No
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
  
  const isInstallationDone = (order: Order) => {
    if (!Array.isArray(order.milestones)) return false;
    // Find the highest milestone ID for the given order type
    const milestoneIds = order.milestones.map(m => m.id);
    const lastMilestoneId = Math.max(...milestoneIds);
    const lastMilestone = order.milestones.find(m => m.id === lastMilestoneId);
    return !!lastMilestone?.completed;
  };

  const activeOrders = React.useMemo(() => orders.filter(o => !isInstallationDone(o)), [orders]);
  const handleSearch = React.useCallback((filters: { orderNo: string; dateRange?: DateRange; store: string }) => {
    setServerFilters(filters);
  }, []);

  const handleClear = React.useCallback(() => {
    setServerFilters({ orderNo: "", dateRange: undefined, store: "all" });
  }, []);

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
          <Button onClick={() => setIsQuotationDialogOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Quotation
          </Button>
        </header>

        <Tabs defaultValue="active">
            <TabsList>
                <TabsTrigger value="active">Active Order</TabsTrigger>
                <TabsTrigger value="all">All Order</TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="mt-4">
                 <OrderTableComponent data={activeOrders} columns={columns} loading={loading} searching={searching} onSearch={handleSearch} onClear={handleClear} />
            </TabsContent>
            <TabsContent value="all" className="mt-4">
                <OrderTableComponent data={orders} columns={columns} loading={loading} searching={searching} onSearch={handleSearch} onClear={handleClear} />
            </TabsContent>
        </Tabs>
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
