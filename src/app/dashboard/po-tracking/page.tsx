"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowLeft,
  Loader2,
  Calendar as CalendarIcon,
  Search,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/card";
import Link from "next/link";
import {
  getFollowUpItems,
  updateFollowUpStatus,
  PoFollowUpItem,
} from "./actions";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format, differenceInCalendarDays } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// ─── Urgency helpers ──────────────────────────────────────────────────────────

type UrgencyKey = "overdue" | "today" | "upcoming";

interface Urgency {
  key: UrgencyKey;
  label: string;
  badgeCls: string;
  textCls: string;
}

function getUrgency(dateStr: string): Urgency {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = differenceInCalendarDays(new Date(dateStr), today);

  if (diff < 0)
    return {
      key: "overdue",
      label: `${Math.abs(diff)}d overdue`,
      badgeCls:
        "bg-red-50 text-red-700 border-red-200 font-medium",
      textCls: "text-red-600",
    };
  if (diff === 0)
    return {
      key: "today",
      label: "Due today",
      badgeCls:
        "bg-amber-50 text-amber-700 border-amber-200 font-medium",
      textCls: "text-amber-600",
    };
  return {
    key: "upcoming",
    label: `In ${diff}d`,
    badgeCls:
      "bg-emerald-50 text-emerald-700 border-emerald-200 font-medium",
    textCls: "text-emerald-600",
  };
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  valueCls = "text-slate-800",
  sub,
}: {
  label: string;
  value: number;
  valueCls?: string;
  sub: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1 shadow-sm">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
        {label}
      </p>
      <p className={cn("text-3xl font-semibold tabular-nums", valueCls)}>
        {value}
      </p>
      <p className="text-xs text-slate-400">{sub}</p>
    </div>
  );
}

// ─── Follow-up Dialog ─────────────────────────────────────────────────────────

function FollowUpDialog({
  isOpen,
  onClose,
  item,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  item: PoFollowUpItem | null;
  onConfirm: (
    newDate: string | null,
    docketNo: string,
    setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>
  ) => void;
}) {
  const [newDate, setNewDate] = React.useState<Date | undefined>();
  const [sameAsOld, setSameAsOld] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [docket, setDocket] = React.useState("");

  React.useEffect(() => {
    if (!isOpen) {
      setNewDate(undefined);
      setSameAsOld(false);
      setDocket("");
    }
  }, [isOpen]);

  const handleConfirm = () => {
    setIsSubmitting(true);
    const dateToSubmit = sameAsOld
      ? null
      : newDate
      ? newDate.toISOString()
      : null;
    onConfirm(dateToSubmit, docket, setIsSubmitting);
  };

  if (!item) return null;

  const urgency = getUrgency(item.expectedDeliveryDate);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[460px] p-0 gap-0 overflow-hidden rounded-2xl border-slate-200">
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-5">
          <DialogHeader>
            <DialogTitle className="text-slate-800 text-base font-semibold">
              Confirm follow-up
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-sm mt-1">
              Record that you've contacted the vendor for this item.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Item summary */}
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wide col-span-2 mb-1">
              Item details
            </span>
            <span className="text-slate-500">Order / PO</span>
            <span className="font-medium text-slate-700 text-right">
              #{item.orderId} / PO {item.poNumber}
            </span>
            <span className="text-slate-500">Customer</span>
            <span className="font-medium text-slate-700 text-right">
              {item.customerName}
            </span>
            <span className="text-slate-500">Item</span>
            <span className="font-medium text-slate-700 text-right">
              {item.itemName}
            </span>
            <span className="text-slate-500">Vendor</span>
            <span className="font-medium text-slate-700 text-right">
              {item.vendorName ?? "—"}
            </span>
            <span className="text-slate-500">Expected</span>
            <span className="text-right flex items-center justify-end gap-2">
              <span className={cn("font-medium", urgency.textCls)}>
                {format(new Date(item.expectedDeliveryDate), "dd MMM yyyy")}
              </span>
              <Badge
                variant="outline"
                className={cn("text-xs px-2 py-0.5", urgency.badgeCls)}
              >
                {urgency.label}
              </Badge>
            </span>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="same-date"
              checked={sameAsOld}
              onCheckedChange={(v) => setSameAsOld(!!v)}
            />
            <Label
              htmlFor="same-date"
              className="text-sm text-slate-600 cursor-pointer"
            >
              Same delivery date — no update needed
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Updated expected date
            </Label>
            <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                type="date"
                value={newDate ? format(newDate, "yyyy-MM-dd") : ""}
                onChange={(e) =>
                    setNewDate(e.target.value ? new Date(e.target.value) : undefined)
                }
                disabled={sameAsOld}
                className={cn(
                    "w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-200 bg-white text-slate-700",
                    "focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-400",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                    "hover:border-slate-300 transition-colors",
                    "[color-scheme:light]"
                )}
                />
            </div>
            </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Docket / tracking no.{" "}
              <span className="normal-case font-normal">(optional)</span>
            </Label>
            <Input
              type="text"
              placeholder="e.g. DKT-20261234"
              value={docket}
              onChange={(e) => setDocket(e.target.value)}
              className="border-slate-200 bg-white placeholder:text-slate-300 text-slate-700 focus-visible:ring-slate-300"
            />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="bg-slate-800 hover:bg-slate-900 text-white"
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Confirm follow-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

type TabKey = "all" | UrgencyKey;

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "upcoming", label: "Upcoming" },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FollowUpPage() {
  const [items, setItems] = React.useState<PoFollowUpItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedItem, setSelectedItem] =
    React.useState<PoFollowUpItem | null>(null);
  const [search, setSearch] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<TabKey>("all");
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "expectedDeliveryDate", desc: false },
  ]);
  const { toast } = useToast();
  const { user } = useAuth();

  // ── Data fetch ──
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const followUpItems = await getFollowUpItems();
      setItems(followUpItems);
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not load follow-up items.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Confirm handler ──
  const handleConfirmFollowUp = async (
    newDate: string | null,
    docketNo: string | null,
    setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    if (!selectedItem || !user) return;
    try {
      const result = await updateFollowUpStatus(
        selectedItem.requestId,
        selectedItem.itemName,
        newDate,
        docketNo,
        user.name
      );
      if (result.success) {
        toast({ title: "Follow-up confirmed", description: result.message });
        setSelectedItem(null);
        fetchData();
      } else {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: result.message,
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected server error occurred.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Filtered data ──
  const filteredItems = React.useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((item) => {
      if (activeTab !== "all") {
        if (getUrgency(item.expectedDeliveryDate).key !== activeTab) return false;
      }
      if (q) {
        const hay = [
          item.orderId,
          item.customerName,
          item.itemName,
          item.poNumber,
          item.vendorName,
          item.supplierCollectionCode,
          item.supplierCollectionName,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, activeTab]);

  // ── Stats ──
  const stats = React.useMemo(
    () => ({
      total: items.length,
      overdue: items.filter(
        (i) => getUrgency(i.expectedDeliveryDate).key === "overdue"
      ).length,
      today: items.filter(
        (i) => getUrgency(i.expectedDeliveryDate).key === "today"
      ).length,
      upcoming: items.filter(
        (i) => getUrgency(i.expectedDeliveryDate).key === "upcoming"
      ).length,
    }),
    [items]
  );

  // ── Columns ──
  const columns: ColumnDef<PoFollowUpItem>[] = [
    {
      accessorKey: "orderId",
      header: ({ column }) => (
        <SortableHeader column={column} label="Order ID" />
      ),
      cell: ({ row }) => (
        <span className="font-semibold text-slate-700">
          #{row.original.orderId}
        </span>
      ),
    },
    {
      accessorKey: "poNumber",
      header: ({ column }) => (
        <SortableHeader column={column} label="PO No." />
      ),
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-700 border-blue-200 font-medium text-xs px-2"
        >
          PO {row.original.poNumber}
        </Badge>
      ),
    },
    {
      accessorKey: "customerName",
      header: ({ column }) => (
        <SortableHeader column={column} label="Customer" />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-slate-700 text-sm">
            {row.original.customerName}
          </span>
          <span className="text-xs text-slate-400">{row.original.salesman}</span>
        </div>
      ),
    },
    {
      accessorKey: "itemName",
      header: "Item",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-slate-700 text-sm">
            {row.original.itemName}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {row.original.itemCode}
          </span>
        </div>
      ),
    },
    {
      id: "supplierFabric",
      header: "Supplier / Fabric",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-slate-700 text-sm">
            {row.original.supplierCollectionCode ?? "—"}
          </span>
          <span className="text-xs text-slate-400">
            {row.original.supplierCollectionName ?? ""}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "vendorName",
      header: "Vendor",
      cell: ({ row }) => (
        <span className="text-sm text-slate-500">
          {row.original.vendorName ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "quantity",
      header: ({ column }) => (
        <SortableHeader column={column} label="Qty" className="text-right" />
      ),
      cell: ({ row }) => (
        <span className="font-semibold text-slate-700 tabular-nums text-right block">
          {row.original.quantity}
        </span>
      ),
    },
    {
      accessorKey: "expectedDeliveryDate",
      header: ({ column }) => (
        <SortableHeader column={column} label="Expected date" />
      ),
      cell: ({ row }) => {
        const u = getUrgency(row.original.expectedDeliveryDate);
        return (
          <div className="flex flex-col gap-1">
            <span className={cn("font-medium text-sm", u.textCls)}>
              {format(new Date(row.original.expectedDeliveryDate), "dd MMM yyyy")}
            </span>
            <Badge
              variant="outline"
              className={cn("text-xs px-2 py-0 w-fit", u.badgeCls)}
            >
              {u.label}
            </Badge>
          </div>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedItem(row.original)}
          className="border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 text-xs font-medium whitespace-nowrap"
        >
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          Follow up
        </Button>
      ),
    },
  ];

  const table = useReactTable({
    data: filteredItems,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  return (
    <>
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-screen mx-auto p-6 md:p-8 space-y-6">

          {/* Header */}
          <header className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">
                Delivery Follow-up
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                POs within 2 days of their promised delivery date that need vendor
                follow-up.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="border-slate-200 text-slate-500 hover:bg-white hover:text-slate-700 shadow-sm"
            >
              <Link href="/dashboard">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to Dashboard
              </Link>
            </Button>
          </header>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Total pending"
              value={stats.total}
              valueCls="text-slate-800"
              sub="items to follow up"
            />
            <StatCard
              label="Overdue"
              value={stats.overdue}
              valueCls="text-red-600"
              sub="past expected date"
            />
            <StatCard
              label="Due today"
              value={stats.today}
              valueCls="text-amber-600"
              sub="expected today"
            />
            <StatCard
              label="Upcoming"
              value={stats.upcoming}
              valueCls="text-emerald-600"
              sub="within 2 days"
            />
          </div>

          {/* Table card */}
          <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-slate-100">
              {/* Search */}
              <div className="relative max-w-xs w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search order, customer, item…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 text-sm border-slate-200 bg-slate-50 placeholder:text-slate-300 focus-visible:ring-slate-200 focus-visible:bg-white h-9"
                />
              </div>

              {/* Filter tabs */}
              <div className="flex gap-1 flex-wrap">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-lg border font-medium transition-all",
                      activeTab === tab.key
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
                    )}
                  >
                    {tab.label}
                    {tab.key !== "all" && (
                      <span
                        className={cn(
                          "ml-1.5 text-xs",
                          activeTab === tab.key
                            ? "opacity-70"
                            : "text-slate-400"
                        )}
                      >
                        {tab.key === "overdue"
                          ? stats.overdue
                          : tab.key === "today"
                          ? stats.today
                          : stats.upcoming}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="sm:ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchData}
                  className="text-slate-400 hover:text-slate-600 hover:bg-slate-50 text-xs h-9"
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Refresh
                </Button>
              </div>
            </div>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((hg) => (
                      <TableRow
                        key={hg.id}
                        className="bg-slate-50 hover:bg-slate-50 border-b border-slate-100"
                      >
                        {hg.headers.map((header) => (
                          <TableHead
                            key={header.id}
                            className="text-slate-400 font-medium text-xs uppercase tracking-wide py-3 px-4 whitespace-nowrap"
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
                      <TableRow>
                        <TableCell
                          colSpan={columns.length}
                          className="h-32 text-center"
                        >
                          <Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" />
                        </TableCell>
                      </TableRow>
                    ) : table.getRowModel().rows.length ? (
                      table.getRowModel().rows.map((row) => (
                        <TableRow
                          key={row.id}
                          className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors"
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell
                              key={cell.id}
                              className="px-4 py-3 align-middle"
                            >
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
                          className="h-32 text-center text-sm text-slate-400"
                        >
                          No items match the current filter.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                <p className="text-xs text-slate-400">
                  Showing{" "}
                  {filteredItems.length === 0
                    ? 0
                    : table.getState().pagination.pageIndex *
                        table.getState().pagination.pageSize +
                      1}
                  –
                  {Math.min(
                    (table.getState().pagination.pageIndex + 1) *
                      table.getState().pagination.pageSize,
                    filteredItems.length
                  )}{" "}
                  of {filteredItems.length} items
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="border-slate-200 text-slate-500 hover:bg-slate-50 text-xs h-8"
                  >
                    ← Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="border-slate-200 text-slate-500 hover:bg-slate-50 text-xs h-8"
                  >
                    Next →
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <FollowUpDialog
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        item={selectedItem}
        onConfirm={handleConfirmFollowUp}
      />
    </>
  );
}

// ─── Sortable column header helper ───────────────────────────────────────────

function SortableHeader({
  column,
  label,
  className,
}: {
  column: any;
  label: string;
  className?: string;
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      className={cn(
        "flex items-center gap-1 hover:text-slate-600 transition-colors",
        className
      )}
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="h-3 w-3 text-slate-500" />
      ) : sorted === "desc" ? (
        <ArrowDown className="h-3 w-3 text-slate-500" />
      ) : (
        <ArrowUpDown className="h-3 w-3 text-slate-300" />
      )}
    </button>
  );
}