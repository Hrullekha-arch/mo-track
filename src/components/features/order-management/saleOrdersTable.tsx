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
  ShieldAlert,
  Trash2,
  Search,
  X,
  PlusCircle,
  MoreHorizontal,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  User,
  Phone,
  Store,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
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
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order } from "@/lib/types";
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
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { NewOrderDialog } from "./NewOrderDialog";

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={cn("rounded-lg p-3 shrink-0", color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="text-2xl font-bold leading-none mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Inner Table ───────────────────────────────────────────────────────────────
function OrderTableComponent({
  data,
  columns,
  loading,
}: {
  data: Order[];
  columns: ColumnDef<Order>[];
  loading: boolean;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredData = React.useMemo(() => {
    const q = searchQuery.toLowerCase();
    return data.filter((order) => {
      if (!q) return true;
      return (
        order.crmOrderNo?.toLowerCase().includes(q) ||
        order.customerName?.toLowerCase().includes(q) ||
        order.customerPhone?.includes(q) ||
        order.salesPerson?.toLowerCase().includes(q) ||
        order.dealId?.toLowerCase().includes(q) ||
        order.storeName?.toLowerCase().includes(q)
      );
    });
  }, [data, searchQuery]);

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
    initialState: { pagination: { pageSize: 15 } },
    state: { sorting, columnFilters, columnVisibility, rowSelection },
  });

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search order, customer, salesman..."
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
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-muted rounded animate-pulse" />
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
                    "hover:bg-amber-50/60"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3 text-sm">
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
                  className="h-36 text-center"
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-9 w-9 opacity-30" />
                    <p className="text-sm font-medium">
                      {searchQuery
                        ? "No orders match your search"
                        : "All clear! No pending approvals."}
                    </p>
                    {searchQuery && (
                      <p className="text-xs">Try a different search term</p>
                    )}
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
              filteredData.length
            )}
          </strong>{" "}
          of <strong>{filteredData.length}</strong> orders
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
          <span className="text-xs font-medium text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {Math.max(table.getPageCount(), 1)}
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
export function SaleOrdersTable() {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [deletingOrder, setDeletingOrder] = React.useState<Order | null>(null);
  const [approvingOrder, setApprovingOrder] = React.useState<Order | null>(null);
  const [rejectingOrder, setRejectingOrder] = React.useState<Order | null>(null);
  const [isQuotationDialogOpen, setIsQuotationDialogOpen] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  const { toast } = useToast();
  const { user, role } = useAuth();

  const isAuthorized = role === "admin" || role === "employee";

  React.useEffect(() => {
    if (!user) return;
    const ordersQuery = query(
      collection(db, "orders"),
      where("isAcknowledged", "==", true),
      where("status", "==", "Pending Approval")
    );

    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const ordersData = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Order)
        );
        setOrders(ordersData);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore Orders Snapshot Error:", error);
        toast({
          variant: "destructive",
          title: "Permission Error",
          description: "Could not fetch orders. Check Firestore rules.",
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, toast]);

  const handleDeleteOrder = async () => {
    if (!deletingOrder || role !== "admin") return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, "orders", deletingOrder.id));
      toast({
        title: "Order Deleted",
        description: `Order ${deletingOrder.crmOrderNo} has been removed.`,
      });
      setDeletingOrder(null);
    } catch (error) {
      console.error("Error deleting order: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete order.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveOrder = async () => {
    if (!approvingOrder) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(db, "orders", approvingOrder.id), {
        status: "Approved",
        approvedAt: new Date().toISOString(),
        approvedBy: user?.name || "Unknown",
      });
      toast({
        title: "Order Approved",
        description: `Order ${approvingOrder.crmOrderNo} has been approved.`,
      });
      setApprovingOrder(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to approve order.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectOrder = async () => {
    if (!rejectingOrder) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(db, "orders", rejectingOrder.id), {
        status: "Rejected",
        rejectedAt: new Date().toISOString(),
        rejectedBy: user?.name || "Unknown",
      });
      toast({
        title: "Order Rejected",
        description: `Order ${rejectingOrder.crmOrderNo} has been rejected.`,
      });
      setRejectingOrder(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to reject order.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Stats
  const stats = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = orders.filter((o) => {
      const created = new Date(o.createdAt);
      return created >= today;
    }).length;
    return { total: orders.length, todayCount };
  }, [orders]);

  const columns: ColumnDef<Order>[] = [
    {
      id: "index",
      header: "#",
      cell: ({ row, table }) => {
        const pageIndex = table.getState().pagination.pageIndex;
        const pageSize = table.getState().pagination.pageSize;
        return (
          <span className="text-xs text-muted-foreground">
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
          className="font-semibold text-primary hover:underline underline-offset-2 text-sm font-mono"
        >
          {row.getValue("crmOrderNo")}
        </Link>
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
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{row.original.customerName || "—"}</span>
          {row.original.customerPhone && (
            <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {row.original.customerPhone}
            </span>
          )}
        </div>
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
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-sm font-medium capitalize">
            {row.original.salesPerson || "—"}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "storeName",
      header: "Store",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-sm">
          <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>{row.original.storeName?.replace("MO ", "") || "—"}</span>
        </div>
      ),
    },
    {
      accessorKey: "dealId",
      header: "Deal ID",
      cell: ({ row }) => (
        <span className="text-sm font-mono text-muted-foreground">
          {row.original.dealId || "—"}
        </span>
      ),
    },
    {
      accessorKey: "orderType",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs font-medium uppercase">
          {row.original.orderType || "—"}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 -ml-3 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Submitted
          <ArrowUpDown className="ml-1.5 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = row.original.createdAt ? new Date(row.original.createdAt) : null;
        return date ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium">{format(date, "dd MMM yyyy")}</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(date, { addSuffix: true })}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: () => (
        <Badge
          variant="outline"
          className="text-xs border-amber-300 bg-amber-50 text-amber-800 flex items-center gap-1 w-fit"
        >
          <Clock className="h-3 w-3" />
          Pending Approval
        </Badge>
      ),
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const order = row.original;
        const isAdmin = role === "admin";

        return (
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1"
                  onClick={() => setApprovingOrder(order)}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50 gap-1"
                  onClick={() => setRejectingOrder(order)}
                >
                  <XCircle className="h-3 w-3" />
                  Reject
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-7 w-7 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/orders/${order.id}`}>
                    View Order Details
                  </Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeletingOrder(order)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 p-4">
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  // ── Not authorized ───────────────────────────────────────────────────────────
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

  // ── Main ─────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Pending Approval
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Orders awaiting review and approval from management.
            </p>
          </div>
          <Button
            onClick={() => setIsQuotationDialogOpen(true)}
            size="sm"
            className="shrink-0"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Quotation
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard
            label="Pending Approvals"
            value={stats.total}
            icon={Clock}
            color="bg-amber-500"
            sub="Awaiting review"
          />
          <StatCard
            label="Submitted Today"
            value={stats.todayCount}
            icon={AlertCircle}
            color="bg-blue-500"
            sub={format(new Date(), "dd MMM yyyy")}
          />
          <div className="hidden md:flex rounded-xl border bg-amber-50 border-amber-200 p-4 items-center gap-3">
            <div className="rounded-lg bg-amber-500 p-3 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-amber-700 uppercase tracking-wider">
                Action Required
              </p>
              <p className="text-sm font-semibold text-amber-900 mt-0.5">
                {stats.total > 0
                  ? `${stats.total} order${stats.total > 1 ? "s need" : " needs"} your review`
                  : "All caught up!"}
              </p>
            </div>
          </div>
        </div>

        {/* Table */}
        <OrderTableComponent
          data={orders}
          columns={columns}
          loading={loading}
        />
      </div>

      {/* Approve Dialog */}
      <AlertDialog
        open={!!approvingOrder}
        onOpenChange={() => setApprovingOrder(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="rounded-full bg-emerald-100 p-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <AlertDialogTitle>Approve this order?</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Order{" "}
              <strong className="text-foreground">
                {approvingOrder?.crmOrderNo}
              </strong>{" "}
              for{" "}
              <strong className="text-foreground">
                {approvingOrder?.customerName}
              </strong>{" "}
              will be marked as Approved and moved to the active orders queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApproveOrder}
              disabled={actionLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {actionLoading ? "Approving..." : "Yes, Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog
        open={!!rejectingOrder}
        onOpenChange={() => setRejectingOrder(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="rounded-full bg-red-100 p-2">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <AlertDialogTitle>Reject this order?</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Order{" "}
              <strong className="text-foreground">
                {rejectingOrder?.crmOrderNo}
              </strong>{" "}
              for{" "}
              <strong className="text-foreground">
                {rejectingOrder?.customerName}
              </strong>{" "}
              will be marked as Rejected. The salesman will need to resubmit if
              required.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRejectOrder}
              disabled={actionLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {actionLoading ? "Rejecting..." : "Yes, Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOrder}
              disabled={actionLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {actionLoading ? "Deleting..." : "Delete Order"}
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
