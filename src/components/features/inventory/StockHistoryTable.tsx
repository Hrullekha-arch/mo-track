
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
import { getAllStockTransactions, deleteStockTransaction } from "@/app/dashboard/inventory/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function StockHistoryTable() {
  const [transactions, setTransactions] = React.useState<StockTransaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [dateRangeFilter, setDateRangeFilter] = React.useState<DateRange | undefined>();
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [deletingTransaction, setDeletingTransaction] = React.useState<StockTransaction | null>(null);

  const { role } = useAuth();
  const { toast } = useToast();
  
  const isAuthorized = role === 'admin';

  const fetchTransactions = React.useCallback(async () => {
    setLoading(true);
    try {
        const data = await getAllStockTransactions();
        setTransactions(data);
    } catch (e) {
        toast({variant: 'destructive', title: 'Error fetching history'});
    } finally {
        setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);
  
  const handleDeleteTransaction = async () => {
      if (!deletingTransaction) return;
      try {
          const result = await deleteStockTransaction(deletingTransaction.stockId, deletingTransaction.id, deletingTransaction.type);
          if (result.success) {
              toast({ title: 'Transaction Deleted', description: result.message });
              fetchTransactions(); // Re-fetch data after deletion
          } else {
              toast({ variant: 'destructive', title: 'Error', description: result.message });
          }
      } catch (e) {
          toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete transaction' });
      } finally {
          setDeletingTransaction(null);
      }
  };

  const columns: ColumnDef<StockTransaction>[] = [
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
        return <Badge variant={type === 'addition' ? 'default' : 'secondary'} className={cn(type === 'addition' ? 'bg-green-600' : 'bg-red-600')}>{type}</Badge>
      },
      filterFn: (row, id, value) => {
        return value === 'all' ? true : value.includes(row.getValue(id));
      }
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
        return <span className={cn(quantity > 0 ? 'text-green-600' : 'text-red-600')}>{quantity.toFixed(2)}</span>
      }
    },
    {
      id: 'referenceId',
      header: 'Reference ID',
      cell: ({ row }) => row.original.poNumber || row.original.orderId || 'N/A',
    },
    {
      accessorKey: "createdBy",
      header: "User",
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
        end: dateRangeFilter.to || new Date(8640000000000000), // A very far future date if 'to' is not set
      }));
    }

    if (globalFilter) {
      const lowercasedFilter = globalFilter.toLowerCase();
      data = data.filter(t => 
        t.bcn?.toLowerCase().includes(lowercasedFilter) ||
        t.createdBy?.toLowerCase().includes(lowercasedFilter) ||
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
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
  });

  const handleExport = () => {
    // Export logic similar to other tables
  }

  const clearFilters = () => {
    setGlobalFilter("");
    setDateRangeFilter(undefined);
    setTypeFilter("all");
    setColumnFilters([]);
  };

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center py-4 gap-4">
            <Input
              placeholder="Search by BCN, User, or Ref ID..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="max-w-sm"
            />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by Type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="addition">Addition</SelectItem>
                    <SelectItem value="deduction">Deduction</SelectItem>
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
          <div className="flex items-center justify-end space-x-2 py-4">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button>
          </div>
        </CardContent>
      </Card>
      <AlertDialog open={!!deletingTransaction} onOpenChange={() => setDeletingTransaction(null)}>
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
    </>
  );
}
