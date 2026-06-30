
"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";
import { ArrowUpDown, Download, Loader2, Trash2, CalendarIcon, X } from "lucide-react";
import * as XLSX from "xlsx";
import { format, isWithinInterval } from "date-fns";

import { Button } from "@/components/ui/button";
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
import { StockTransaction } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { getStockTransactionHistoryPage, deleteStockTransaction, deleteStockTransactions } from "@/app/dashboard/inventory/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";

const HISTORY_PAGE_SIZE = 60;

type StockHistoryCursor = {
  additionLastPath?: string | null;
  deductionLastId?: string | null;
  reservationLastPath?: string | null;
};

type StockHistoryTypeFilter = "all" | "addition" | "deduction" | "reservation" | "release";

const getInclusiveDateEnd = (date?: Date) => {
  if (!date) return undefined;
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
};

export function StockHistoryTable() {
  const [transactions, setTransactions] = React.useState<StockTransaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMoreServer, setHasMoreServer] = React.useState(false);
  const [historyCursor, setHistoryCursor] = React.useState<StockHistoryCursor | null>(null);
  const [sorting, setSorting] = React.useState<SortingState>([
      { id: 'createdAt', desc: true }
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [dateRangeFilter, setDateRangeFilter] = React.useState<DateRange | undefined>();
  const [typeFilter, setTypeFilter] = React.useState<StockHistoryTypeFilter>("all");
  const [deletingTransaction, setDeletingTransaction] = React.useState<StockTransaction | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);

  const { role } = useAuth();
  const { toast } = useToast();
  
  const isAuthorized = role === 'admin';

  const loadTransactionsPage = React.useCallback(async (options?: { reset?: boolean; cursor?: StockHistoryCursor | null }) => {
    const reset = !!options?.reset;
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
        const result = await getStockTransactionHistoryPage({
          pageSize: HISTORY_PAGE_SIZE,
          cursor: reset ? null : options?.cursor ?? null,
          typeFilter,
          fromDate: dateRangeFilter?.from ? dateRangeFilter.from.toISOString() : null,
          toDate: getInclusiveDateEnd(dateRangeFilter?.to)?.toISOString() ?? null,
        });

        setHistoryCursor(result.cursor || null);
        setHasMoreServer(!!result.hasMore);
        if (reset) {
          setTransactions(result.items || []);
        } else {
          setTransactions((prev) => {
            const merged = [...prev, ...(result.items || [])];
            const seen = new Set<string>();
            return merged.filter((item) => {
              const key = `${item.id}|${item.type}|${item.createdAt}|${item.bcn}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          });
        }
    } catch (e) {
        toast({variant: 'destructive', title: 'Error fetching history'});
    } finally {
        setLoading(false);
        setLoadingMore(false);
    }
  }, [toast, typeFilter, dateRangeFilter]);

  React.useEffect(() => {
    void loadTransactionsPage({ reset: true, cursor: null });
  }, [typeFilter, dateRangeFilter, loadTransactionsPage]);
  
  const handleDeleteTransaction = async () => {
      if (!deletingTransaction) return;
      try {
          const deleteType = deletingTransaction.type === "deduction" ? "deduction" : "addition";
          const result = await deleteStockTransaction(deletingTransaction.stockId, deletingTransaction.id, deleteType);
          if (result.success) {
              toast({ title: 'Transaction Deleted', description: result.message });
              await loadTransactionsPage({ reset: true, cursor: null });
          } else {
              toast({ variant: 'destructive', title: 'Error', description: result.message });
          }
      } catch (e) {
          toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete transaction' });
      } finally {
          setDeletingTransaction(null);
      }
  };

  const handleDeleteSelected = async () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const transactionsToDelete = selectedRows.map(row => row.original);
    
    if (transactionsToDelete.length === 0) {
      toast({ variant: 'destructive', title: 'No transactions selected' });
      return;
    }
    
    try {
      const result = await deleteStockTransactions(transactionsToDelete);
      if (result.success) {
        toast({ title: 'Bulk Deletion Successful', description: `${transactionsToDelete.length} transactions have been deleted.` });
        await loadTransactionsPage({ reset: true, cursor: null });
        table.resetRowSelection(); // Clear selection
      } else {
        toast({ variant: 'destructive', title: 'Bulk Deletion Failed', description: result.message });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'An unexpected error occurred during bulk deletion.' });
    } finally {
        setIsBulkDeleting(false);
    }
  };

  const columns: ColumnDef<StockTransaction>[] = [
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
      accessorKey: "createdAt",
      header: ({ column }) => ( <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Date <ArrowUpDown className="ml-2 h-4 w-4" /></Button> ),
      cell: ({ row }) => format(new Date(row.getValue("createdAt")), "dd/MM/yyyy HH:mm"),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.getValue("type") as string;
        return (
          <Badge
            variant={type === "addition" ? "default" : "secondary"}
            className={cn(
              type === "addition" && "bg-green-600",
              type === "deduction" && "bg-red-600",
              type === "reservation" && "bg-amber-600 text-white",
              type === "release" && "bg-blue-600 text-white"
            )}
          >
            {type}
          </Badge>
        );
      },
      filterFn: (row, id, value) => {
        return value === 'all' ? true : value.includes(row.getValue(id));
      }
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const tx = row.original;
        if (tx.type !== 'deduction') return tx.status || 'N/A';
        const status = tx.status || 'pending for cutting';
        return <Badge variant={status === 'cut' ? 'default' : 'outline'} className="capitalize">{status}</Badge>;
      },
    },
    {
      accessorKey: "bcn",
      header: "BCN",
      cell: ({ row }) => <span className="font-mono">{row.getValue("bcn")}</span>,
    },
    {
      accessorKey: "quantityChange",
      header: ({ column }) => ( <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Quantity <ArrowUpDown className="ml-2 h-4 w-4" /></Button> ),
      cell: ({ row }) => {
        const quantity = row.getValue("quantityChange") as number;
        const type = row.original.type;
        return (
          <span
            className={cn(
              type === "addition" && "text-green-600",
              type === "deduction" && "text-red-600",
              type === "reservation" && "text-amber-700",
              type === "release" && "text-blue-700"
            )}
          >
            {quantity.toFixed(2)}
          </span>
        );
      }
    },
    {
      id: 'movementDetails',
      header: 'In / Out Details',
      cell: ({ row }) => {
        const tx = row.original;
        const isInbound = tx.type === "addition";
        const primaryValue = isInbound
          ? tx.invoiceNo || tx.poNumber || tx.inboundId || "N/A"
          : tx.orderId || "N/A";
        const secondaryValue = isInbound
          ? tx.poNumber && tx.poNumber !== primaryValue
            ? tx.poNumber
            : null
          : tx.invoiceNo || tx.poNumber || null;

        return (
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isInbound ? "Invoice No" : "Order ID"}
            </div>
            <div className="font-medium">{primaryValue}</div>
            {secondaryValue ? (
              <div className="text-xs text-muted-foreground">
                {isInbound ? `PO: ${secondaryValue}` : `Invoice: ${secondaryValue}`}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "createdBy",
      header: "User",
    },
    {
      accessorKey: "salesman",
      header: "Salesman",
    },
    {
      id: "actions",
      cell: ({ row }) => {
        if (!isAuthorized) return null;
        return (
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => setDeletingTransaction(row.original)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </AlertDialogTrigger>
        );
      },
    }
  ];

  const filteredData = React.useMemo(() => {
    let data = [...transactions];

    if (typeFilter && typeFilter !== "all") {
      data = data.filter(t => t.type === typeFilter);
    }

    if (dateRangeFilter?.from) {
      data = data.filter(t => isWithinInterval(new Date(t.createdAt), {
        start: dateRangeFilter.from!,
        end: getInclusiveDateEnd(dateRangeFilter.to) || new Date(8640000000000000),
      }));
    }

    if (globalFilter) {
      const lowercasedFilter = globalFilter.toLowerCase();
      data = data.filter(t => 
        t.bcn?.toLowerCase().includes(lowercasedFilter) ||
        t.createdBy?.toLowerCase().includes(lowercasedFilter) ||
        t.invoiceNo?.toLowerCase().includes(lowercasedFilter) ||
        t.poNumber?.toLowerCase().includes(lowercasedFilter) ||
        t.orderId?.toLowerCase().includes(lowercasedFilter)
      );
    }
    
    return data;
  }, [transactions, typeFilter, dateRangeFilter, globalFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      rowSelection
    },
  });

  const handleExport = () => {
    const exportRows = filteredData.map((tx) => ({
      Date: format(new Date(tx.createdAt), "dd/MM/yyyy HH:mm"),
      Type: tx.type,
      Status: tx.status || "",
      BCN: tx.bcn,
      Quantity: tx.quantityChange,
      Unit: tx.unit || "",
      "Reference ID": tx.poNumber || tx.orderId || "",
      User: tx.createdBy || "",
      Salesman: tx.salesman || "",
      "Length ID": tx.lengthId || "",
      Customer: tx.customerName || "",
      Notes: tx.notes || "",
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory History");
    XLSX.writeFile(workbook, `inventory-history-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`);
  }

  const clearFilters = () => {
    setGlobalFilter("");
    setDateRangeFilter(undefined);
    setTypeFilter("all");
    setColumnFilters([]);
  };

  const handleNext = async () => {
    if (table.getCanNextPage()) {
      table.nextPage();
      return;
    }
    if (!hasMoreServer || loadingMore) return;

    const currentCursor = historyCursor;
    await loadTransactionsPage({ reset: false, cursor: currentCursor });
    requestAnimationFrame(() => {
      if (table.getCanNextPage()) {
        table.nextPage();
      }
    });
  };

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center py-4 gap-4">
            <Input
              placeholder="Search by BCN, User, Invoice No, PO, or Order ID..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="max-w-sm"
            />
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as StockHistoryTypeFilter)}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by Type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="addition">Addition</SelectItem>
                    <SelectItem value="deduction">Deduction</SelectItem>
                    <SelectItem value="reservation">Reservation</SelectItem>
                    <SelectItem value="release">Release</SelectItem>
                </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button id="date" variant={"outline"} className={cn("w-[300px] justify-start text-left font-normal", !dateRangeFilter && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRangeFilter?.from ? (dateRangeFilter.to ? (<> {format(dateRangeFilter.from, "LLL dd, y")} - {format(dateRangeFilter.to, "LLL dd, y")} </>) : (format(dateRangeFilter.from, "LLL dd, y"))) : (<span>Pick a date range</span>)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar initialFocus mode="range" defaultMonth={dateRangeFilter?.from} selected={dateRangeFilter} onSelect={setDateRangeFilter} numberOfMonths={2}/>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" onClick={clearFilters}><X className="mr-2 h-4 w-4" />Clear</Button>
             <div className="flex-grow" />
             <Button onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export
            </Button>
          </div>
          <AlertDialog>
            <div className="rounded-md border">
                <Table>
                <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => ( <TableHead key={header.id}> {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())} </TableHead> ))}
                    </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={columns.length} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                        <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => ( <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>))}
                        </TableRow>
                    ))
                    ) : (
                    <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">No results.</TableCell></TableRow>
                    )}
                </TableBody>
                </Table>
            </div>
             <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will permanently delete this transaction and update the total stock quantity for BCN: <strong>{deletingTransaction?.bcn}</strong>. This action is irreversible.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteTransaction} className="bg-destructive hover:bg-destructive/90">Delete Transaction</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex items-center justify-end space-x-2 py-4">
             <div className="flex-1 text-sm text-muted-foreground">
                {table.getFilteredSelectedRowModel().rows.length} of{" "}
                {table.getFilteredRowModel().rows.length} row(s) selected.
             </div>
             {table.getFilteredSelectedRowModel().rows.length > 0 && isAuthorized && (
                 <AlertDialog>
                     <AlertDialogTrigger asChild>
                         <Button variant="destructive" disabled={isBulkDeleting}>
                             {isBulkDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                             Delete Selected ({table.getFilteredSelectedRowModel().rows.length})
                         </Button>
                     </AlertDialogTrigger>
                     <AlertDialogContent>
                         <AlertDialogHeader>
                             <AlertDialogTitle>Confirm Bulk Deletion</AlertDialogTitle>
                             <AlertDialogDescription>
                                 This will permanently delete {table.getFilteredSelectedRowModel().rows.length} transactions and update all affected stock quantities. This action is irreversible.
                             </AlertDialogDescription>
                         </AlertDialogHeader>
                         <AlertDialogFooter>
                             <AlertDialogCancel>Cancel</AlertDialogCancel>
                             <AlertDialogAction onClick={handleDeleteSelected} className="bg-destructive hover:bg-destructive/90">Yes, delete them</AlertDialogAction>
                         </AlertDialogFooter>
                     </AlertDialogContent>
                 </AlertDialog>
             )}
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage() || loadingMore}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => { void handleNext(); }} disabled={loadingMore || (!table.getCanNextPage() && !hasMoreServer)}>
              {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
