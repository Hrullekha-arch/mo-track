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
import {
  ArrowUpDown,
  Download,
  MoreHorizontal,
  ShieldAlert,
  Trash2,
  CalendarIcon,
  Search,
  X,
  PlusCircle,
  Loader2,
  Package,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  collection,
  onSnapshot,
  query,
  doc,
  deleteDoc,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, User } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { format, differenceInHours, startOfDay, endOfDay } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { NewOrderDialog } from "./NewOrderDialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { setFullKittingTime } from "./actions";
import {
  getNormalizedOrderMilestones,
  getOrderStatusLabel,
} from "@/lib/order-workflow";

type AllocationFilterValue = "all" | "ready" | "partial";

const getOrderAllocationMetrics = (order: Order) => {
  const totalItems = order.fabricDetails?.length || 0;
  const allocatedItemsCount =
    order.fabricDetails?.filter((item) => item.status === "allocated").length ||
    0;
  const inStockOrAllocatedItems =
    order.fabricDetails?.filter(
      (item) => item.status === "in stock" || item.status === "allocated"
    ).length || 0;
  const isFullyAllocated = totalItems > 0 && allocatedItemsCount === totalItems;
  const isReadyForAllocate =
    totalItems > 0 && inStockOrAllocatedItems === totalItems && !isFullyAllocated;
  const isPartialAllocate =
    totalItems > 0 &&
    inStockOrAllocatedItems > 0 &&
    inStockOrAllocatedItems < totalItems;

  return {
    totalItems,
    allocatedItemsCount,
    inStockOrAllocatedItems,
    isFullyAllocated,
    isReadyForAllocate,
    isPartialAllocate,
  };
};

// ─── Stats Card ────────────────────────────────────────────────────────────────
function StatsCard({
  title,
  value,
  icon: Icon,
  color,
  sub,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 flex items-center gap-4 shadow-sm",
        "hover:shadow-md transition-shadow"
      )}
    >
      <div className={cn("rounded-lg p-3", color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </p>
        <p className="text-2xl font-bold leading-none mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ─── KittingTimePicker ─────────────────────────────────────────────────────────
function KittingTimePicker({ order }: { order: Order }) {
  const { toast } = useToast();
  const sentToStitchingMilestone = getNormalizedOrderMilestones(order).find(
    (milestone) => milestone.id === 3
  );

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
      toast({
        variant: "destructive",
        title: "Error",
        description: result.message,
      });
    }
    setIsLoading(false);
  };

  if (!sentToStitchingMilestone?.completed) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const timeSinceStitching = differenceInHours(
    new Date(),
    new Date(sentToStitchingMilestone.completedAt!)
  );
  const isPastGracePeriod = timeSinceStitching > 1;

  let colorClass = "text-foreground border-border";
  if (order.fullKittingTimeReupdated) {
    colorClass = "text-orange-600 border-orange-300 bg-orange-50";
  } else if (order.fullKittingTime && isPastGracePeriod) {
    colorClass = "text-red-600 border-red-300 bg-red-50";
  } else if (kittingDate) {
    colorClass = "text-emerald-700 border-emerald-300 bg-emerald-50";
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 w-[160px] justify-start text-left font-normal text-xs",
            !kittingDate && "text-muted-foreground",
            colorClass
          )}
        >
          <CalendarIcon className="mr-1.5 h-3 w-3 shrink-0" />
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : kittingDate ? (
            format(kittingDate, "dd MMM yyyy")
          ) : (
            "Set Date"
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
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

// ─── Filter Panel ──────────────────────────────────────────────────────────────
function FilterPanel({
  data,
  searching,
  onSearch,
  onClear,
}: {
  data: Order[];
  searching: boolean;
  onSearch: (filters: {
    orderNo: string;
    dateRange?: DateRange;
    store: string;
    allocationFilter: AllocationFilterValue;
    statusFilter: string;
  }) => void;
  onClear: () => void;
}) {
  const [orderNoFilter, setOrderNoFilter] = React.useState("");
  const [dateRangeFilter, setDateRangeFilter] = React.useState<
    DateRange | undefined
  >();
  const [storeFilter, setStoreFilter] = React.useState("all");
  const [allocationFilter, setAllocationFilter] =
    React.useState<AllocationFilterValue>("all");
  const [statusFilter, setStatusFilter] = React.useState("all");

  const statusOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          data.map((order) => getOrderStatusLabel(order)).filter(Boolean)
        )
      ).sort(),
    [data]
  );

  const uniqueStores = ["MO GCR BRANCH", "MO MG ROAD", "MO SULTANPUR"];

  const handleSearch = () => {
    onSearch({
      orderNo: orderNoFilter,
      dateRange: dateRangeFilter,
      store: storeFilter,
      allocationFilter,
      statusFilter,
    });
  };

  const handleClear = () => {
    setOrderNoFilter("");
    setDateRangeFilter(undefined);
    setStoreFilter("all");
    setAllocationFilter("all");
    setStatusFilter("all");
    onClear();
  };

  const hasActiveFilters =
    orderNoFilter ||
    dateRangeFilter?.from ||
    storeFilter !== "all" ||
    allocationFilter !== "all" ||
    statusFilter !== "all";

  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Filters</span>
        {hasActiveFilters && (
          <Badge variant="secondary" className="text-xs h-5">
            Active
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Order No */}
        <div className="col-span-2 md:col-span-1">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Order No
          </label>
          <Input
            placeholder="e.g. MOTRACK-001"
            value={orderNoFilter}
            onChange={(e) => setOrderNoFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="h-9 text-sm"
          />
        </div>

        {/* From Date */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            From Date
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-9 w-full justify-start text-left font-normal text-sm",
                  !dateRangeFilter?.from && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
                {dateRangeFilter?.from
                  ? format(dateRangeFilter.from, "dd MMM yy")
                  : "From"}
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
        </div>

        {/* To Date */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            To Date
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-9 w-full justify-start text-left font-normal text-sm",
                  !dateRangeFilter?.to && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
                {dateRangeFilter?.to
                  ? format(dateRangeFilter.to, "dd MMM yy")
                  : "To"}
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
        </div>

        {/* Store */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Store
          </label>
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All Stores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
              {uniqueStores.map((store) => (
                <SelectItem key={store} value={store}>
                  {store}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Allocation */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Allocation
          </label>
          <Select
            value={allocationFilter}
            onValueChange={(v) =>
              setAllocationFilter(v as AllocationFilterValue)
            }
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="ready">Ready to Allocate</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Status
          </label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={handleSearch} disabled={searching} size="sm">
          {searching ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="mr-2 h-3.5 w-3.5" />
          )}
          Search
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={searching}
          className={cn(!hasActiveFilters && "opacity-50")}
        >
          <X className="mr-2 h-3.5 w-3.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}

// ─── Allocation Badge ──────────────────────────────────────────────────────────
function AllocationBadge({ order }: { order: Order }) {
  if (getOrderStatusLabel(order) === "INSTALLATION DONE") {
    return (
      <Badge className="bg-lime-600 hover:bg-lime-700 text-white text-xs">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Completed
      </Badge>
    );
  }

  const {
    totalItems,
    inStockOrAllocatedItems,
    isFullyAllocated,
  } = getOrderAllocationMetrics(order);
 
  if (totalItems === 0)
    return (
      <Badge variant="outline" className="text-xs">
        N/A
      </Badge>
    );

  if (isFullyAllocated)
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-700 text-xs">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Allocated
      </Badge>
    );

  const allAvailable = inStockOrAllocatedItems === totalItems;
  const someAvailable = inStockOrAllocatedItems > 0;

  if (allAvailable)
    return (
      <Badge className="bg-blue-600 hover:bg-blue-700 text-xs">
        {inStockOrAllocatedItems}/{totalItems} Ready
      </Badge>
    );
  if (someAvailable)
    return (
      <Badge className="bg-amber-500 hover:bg-amber-600 text-black text-xs">
        {inStockOrAllocatedItems}/{totalItems} Partial
      </Badge>
    );
  return (
    <Badge className="bg-red-500 hover:bg-red-600 text-xs">
      0/{totalItems} Pending
    </Badge>
  );
}

// ─── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ order }: { order: Order }) {
  const status = getOrderStatusLabel(order);
  const isPending = status === "PENDING APPROVAL";
  const isNew = status === "NEW" || status === "APPROVED";
  const isComplete = status === "INSTALLATION DONE";

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium",
        isPending && "border-red-300 bg-red-50 text-red-700",
        isNew && "border-blue-300 bg-blue-50 text-blue-700",
        !isPending && !isNew && "border-slate-200 bg-slate-50 text-slate-700",
        isComplete && "border-slate-200 bg-green-200 text-slate-700",
      )}
    >
      {status}
    </Badge>
  );
}

// ─── Order Table Component ─────────────────────────────────────────────────────
function OrderTableComponent({
  data,
  allData,
  columns,
  loading,
  searching,
  onSearch,
  onClear,
}: {
  data: Order[];
  allData: Order[];
  columns: ColumnDef<Order>[];
  loading: boolean;
  searching: boolean;
  onSearch: (filters: {
    orderNo: string;
    dateRange?: DateRange;
    store: string;
    allocationFilter: AllocationFilterValue;
    statusFilter: string;
  }) => void;
  onClear: () => void;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [appliedAllocationFilter, setAppliedAllocationFilter] =
    React.useState<AllocationFilterValue>("all");
  const [appliedStatusFilter, setAppliedStatusFilter] = React.useState("all");
  const [searchQuery, setSearchQuery] = React.useState("");

  const handleSearch = (filters: {
    orderNo: string;
    dateRange?: DateRange;
    store: string;
    allocationFilter: AllocationFilterValue;
    statusFilter: string;
  }) => {
    setAppliedAllocationFilter(filters.allocationFilter);
    setAppliedStatusFilter(filters.statusFilter);
    onSearch(filters);
  };

  const handleClear = () => {
    setAppliedAllocationFilter("all");
    setAppliedStatusFilter("all");
    setSearchQuery("");
    onClear();
  };

  const clientFilteredData = React.useMemo(() => {
    return data.filter((order) => {
      const allocation = getOrderAllocationMetrics(order);
      const allocationMatch =
        appliedAllocationFilter === "all" ||
        (appliedAllocationFilter === "ready" && allocation.isReadyForAllocate) ||
        (appliedAllocationFilter === "partial" && allocation.isPartialAllocate);

      const orderStatus = getOrderStatusLabel(order);
      const statusMatch =
        appliedStatusFilter === "all" || orderStatus === appliedStatusFilter;

      // Local text search
      const q = searchQuery.toLowerCase();
      const textMatch =
        !q ||
        order.customerName?.toLowerCase().includes(q) ||
        order.crmOrderNo?.toLowerCase().includes(q) ||
        order.salesPerson?.toLowerCase().includes(q) ||
        order.storeName?.toLowerCase().includes(q);

      return allocationMatch && statusMatch && textMatch;
    });
  }, [data, appliedAllocationFilter, appliedStatusFilter, searchQuery]);

  const table = useReactTable({
    data: clientFilteredData,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    initialState: { pagination: { pageSize: 15 } },
    state: { sorting, columnFilters, columnVisibility, rowSelection },
  });

  return (
    <div className="space-y-4">
      <FilterPanel
        data={allData}
        searching={searching}
        onSearch={handleSearch}
        onClear={handleClear}
      />

      {/* Quick text search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Quick search name, order, store..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
        {searchQuery && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setSearchQuery("")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-10 whitespace-nowrap"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, idx) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn(
                    "transition-colors",
                    idx % 2 === 0 ? "bg-background" : "bg-muted/20",
                    "hover:bg-primary/5"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2.5 text-sm">
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
                  className="h-32 text-center"
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Package className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No orders found</p>
                    <p className="text-xs">
                      Try adjusting your filters or date range
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing{" "}
          <strong>
            {table.getState().pagination.pageIndex *
              table.getState().pagination.pageSize +
              1}
            –
            {Math.min(
              (table.getState().pagination.pageIndex + 1) *
                table.getState().pagination.pageSize,
              table.getFilteredRowModel().rows.length
            )}
          </strong>{" "}
          of <strong>{table.getFilteredRowModel().rows.length}</strong> orders
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Export ───────────────────────────────────────────────────────────────
export function OrdersTable() {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searching, setSearching] = React.useState(false);
  const [deletingOrder, setDeletingOrder] = React.useState<Order | null>(null);
  const [isQuotationDialogOpen, setIsQuotationDialogOpen] =
    React.useState(false);

  // Server-side filter state
  const [serverFilters, setServerFilters] = React.useState<{
    orderNo: string;
    dateRange?: DateRange;
    store: string;
  }>({ orderNo: "", dateRange: undefined, store: "all" });

  const { toast } = useToast();
  const { user, role } = useAuth();

  const isAuthorized = role === "admin" || role === "employee";

  // ── FIX: Build query that always shows today's orders by default
  //         and correctly applies all filter combinations ─────────────────────
  const buildOrdersQuery = React.useCallback(() => {
    if (!user) return null;
    const constraints: any[] = [];

    if (user.designation === "CRM") {
      constraints.push(where("handledByCrm", "==", user.id));
    }

    constraints.push(where("isAcknowledged", "==", true));
    constraints.push(where("status", "==", "Approved"));

    const normalizedOrderNo = serverFilters.orderNo
      .trim()
      .replace(/^MOTRACK-/i, "");

    // If searching by specific order number, skip date range (can't combine
    // equality + range on different fields without a composite index easily)
    if (normalizedOrderNo) {
      constraints.push(where("crmOrderNo", "==", normalizedOrderNo));
    } else {
      // Always apply date range — default to today, or custom range if set
      const rangeStart = serverFilters.dateRange?.from
        ? startOfDay(serverFilters.dateRange.from)
        : startOfDay(new Date());
      const rangeEnd = serverFilters.dateRange?.to
        ? endOfDay(serverFilters.dateRange.to)
        : serverFilters.dateRange?.from
        ? endOfDay(serverFilters.dateRange.from)
        : endOfDay(new Date());

      constraints.push(where("createdAt", ">=", rangeStart.toISOString()));
      constraints.push(where("createdAt", "<=", rangeEnd.toISOString()));
    }

    // Store filter
    if (serverFilters.store !== "all") {
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
        const ordersData = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Order)
        );
        setOrders(ordersData);
        setLoading(false);
        setSearching(false);
      },
      (error) => {
        console.error("Firestore Orders Snapshot Error:", error);
        toast({
          variant: "destructive",
          title: "Permission Error",
          description: "Could not fetch orders. Check Firestore rules.",
        });
        setLoading(false);
        setSearching(false);
      }
    );
    return () => unsubscribe();
  }, [buildOrdersQuery, toast]);

  const handleDeleteOrder = async () => {
    if (!deletingOrder || role !== "admin") return;
    try {
      await deleteDoc(doc(db, "orders", deletingOrder.id));
      toast({
        title: "Order Deleted",
        description: `Order ${deletingOrder.crmOrderNo} has been removed.`,
      });
      setDeletingOrder(null);
    } catch (error) {
      console.error("Error deleting order:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete order.",
      });
    }
  };

  const isInstallationDone = (order: Order) => {
    const milestones = getNormalizedOrderMilestones(order);
    if (!milestones.length) return false;
    const milestoneIds = milestones.map((milestone) => milestone.id);
    const lastMilestoneId = Math.max(...milestoneIds);
    const lastMilestone = milestones.find(
      (milestone) => milestone.id === lastMilestoneId
    );
    return !!lastMilestone?.completed;
  };

  const activeOrders = React.useMemo(
    () => orders.filter((o) => !isInstallationDone(o)),
    [orders]
  );

  // Stats derived from active orders
  const stats = React.useMemo(() => {
    const fullyAllocated = activeOrders.filter(
      (o) => getOrderAllocationMetrics(o).isFullyAllocated
    ).length;
    const partialAllocated = activeOrders.filter(
      (o) => getOrderAllocationMetrics(o).isPartialAllocate
    ).length;
    const readyToAllocate = activeOrders.filter(
      (o) => getOrderAllocationMetrics(o).isReadyForAllocate
    ).length;
    return { fullyAllocated, partialAllocated, readyToAllocate };
  }, [activeOrders]);

  const handleSearch = React.useCallback(
    (filters: {
      orderNo: string;
      dateRange?: DateRange;
      store: string;
      allocationFilter: AllocationFilterValue;
      statusFilter: string;
    }) => {
      setServerFilters({
        orderNo: filters.orderNo,
        dateRange: filters.dateRange,
        store: filters.store,
      });
      // allocationFilter & statusFilter are handled client-side in OrderTableComponent
    },
    []
  );

  const handleClear = React.useCallback(() => {
    setServerFilters({ orderNo: "", dateRange: undefined, store: "all" });
  }, []);

  const columns: ColumnDef<Order>[] = [
    {
      id: "index",
      header: "#",
      cell: ({ row, table }) => {
        const pageIndex = table.getState().pagination.pageIndex;
        const pageSize = table.getState().pagination.pageSize;
        return (
          <span className="text-muted-foreground text-xs">
            {pageIndex * pageSize + row.index + 1}
          </span>
        );
      },
    },
    {
      accessorKey: "crmOrderNo",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 -ml-3 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Order No
          <ArrowUpDown className="ml-1.5 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <Link
          href={`/dashboard/orders/${row.original.id}`}
          className="font-semibold text-primary hover:underline underline-offset-2 text-sm"
        >
          {row.getValue("crmOrderNo")}
        </Link>
      ),
    },
    {
      id: "fullKittingTime",
      header: "Kitting Date",
      cell: ({ row }) => <KittingTimePicker order={row.original} />,
    },
    {
      id: "noOfItems",
      header: "Items",
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.fabricDetails?.length || 0}
        </span>
      ),
    },
    {
      id: "allocatedStatus",
      header: "Allocation",
      cell: ({ row }) => <AllocationBadge order={row.original} />,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge order={row.original} />,
    },
    {
      accessorKey: "remarks",
      header: "Remark",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs line-clamp-1 max-w-[120px]">
          {row.original.remarks || "—"}
        </span>
      ),
    },
    {
      accessorKey: "salesPerson",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 -ml-3 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Salesman
          <ArrowUpDown className="ml-1.5 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="uppercase text-xs font-medium">
          {row.original.salesPerson.split(" ")[0]}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {format(new Date(row.getValue("createdAt")), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      accessorKey: "storeName",
      header: "Store",
      cell: ({ row }) => (
        <span className="text-xs whitespace-nowrap">
          {row.original.storeName?.replace("MO ", "") || "N/A"}
        </span>
      ),
    },
    {
      accessorKey: "customerName",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 -ml-3 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Customer
          <ArrowUpDown className="ml-1.5 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.customerName}</span>
      ),
    },
    {
      accessorKey: "customerPhone",
      header: "Phone",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">
          {row.original.customerPhone}
        </span>
      ),
    },
    {
      id: "dealName",
      header: "Deal",
      cell: ({ row }) => (
        <span className="text-xs">
          <span className="font-semibold uppercase">
            {row.original.orderType}
          </span>{" "}
          <span className="text-muted-foreground">
            ({row.original.crmOrderNo})
          </span>
        </span>
      ),
    },
    ...(role === "admin"
      ? [
          {
            id: "actions",
            enableHiding: false,
            cell: ({ row }: any) => {
              const order = row.original;
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-7 w-7 p-0">
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
          } as ColumnDef<Order>,
        ]
      : []),
  ];

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  // ── Not authorized ─────────────────────────────────────────────────────────
  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-sm w-full">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto rounded-full bg-destructive/10 p-4 w-fit mb-3">
              <ShieldAlert className="h-10 w-10 text-destructive" />
            </div>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to view this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ── Main ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Orders Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Showing {orders.length} order
              {orders.length !== 1 ? "s" : ""} •{" "}
              {format(new Date(), "EEEE, dd MMM yyyy")}
            </p>
          </div>
          {/* <Button
            onClick={() => setIsQuotationDialogOpen(true)}
            size="sm"
            className="shrink-0"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Quotation
          </Button> */}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatsCard
            title="Active Orders"
            value={activeOrders.length}
            icon={Package}
            color="bg-blue-500"
            sub={`${orders.length} total loaded`}
          />
          <StatsCard
            title="Fully Allocated"
            value={stats.fullyAllocated}
            icon={CheckCircle2}
            color="bg-emerald-500"
          />
          <StatsCard
            title="Ready to Allocate"
            value={stats.readyToAllocate}
            icon={TrendingUp}
            color="bg-violet-500"
          />
          <StatsCard
            title="Partial Allocation"
            value={stats.partialAllocated}
            icon={AlertCircle}
            color="bg-amber-500"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="active">
          <TabsList className="h-9">
            <TabsTrigger value="active" className="text-sm">
              Active Orders
              <Badge variant="secondary" className="ml-2 h-5 text-xs">
                {activeOrders.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="all" className="text-sm">
              All Orders
              <Badge variant="secondary" className="ml-2 h-5 text-xs">
                {orders.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4">
            <OrderTableComponent
              data={activeOrders}
              allData={orders}
              columns={columns}
              loading={loading}
              searching={searching}
              onSearch={handleSearch}
              onClear={handleClear}
            />
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            <OrderTableComponent
              data={orders}
              allData={orders}
              columns={columns}
              loading={loading}
              searching={searching}
              onSearch={handleSearch}
              onClear={handleClear}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Dialog */}
      <AlertDialog
        open={!!deletingOrder}
        onOpenChange={() => setDeletingOrder(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this order?</AlertDialogTitle>
            <AlertDialogDescription>
              Order{" "}
              <strong className="text-foreground">
                {deletingOrder?.crmOrderNo}
              </strong>{" "}
              will be permanently removed from Firestore. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOrder}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Order Dialog */}
      {isQuotationDialogOpen && (
        <NewOrderDialog
          isOpen={isQuotationDialogOpen}
          onClose={() => setIsQuotationDialogOpen(false)}
        />
      )}
    </>
  );
}
