
"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, Download, MoreHorizontal, Trash2, Edit, ShieldAlert, CheckCircle, Eye, Loader2 } from "lucide-react";
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
import {
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDocs,
  limit,
  orderBy,
  query,
  QueryConstraint,
  QueryDocumentSnapshot,
  startAfter,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest, PurchaseStatus, Stock } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PoTrackingTimeline } from "@/components/features/purchase/PoTrackingTimeline";
import { PurchaseProcessTimeline } from "./PurchaseProcessTimeline";
import { format } from "date-fns";
import { PURCHASE_PROCESS_CONFIG } from "@/lib/constants";
import { getPurchaseViewDetails } from "./action";

interface FlattenedPurchaseItem {
  id: string; // Unique ID for the row
  dealId: string;
  customerName: string;
  salesman: string;
  status: string;
  createdAt: string;
  itemName: string;
  quantity: string;
  poNumber?: string;
  vendorName?: string;
  type: 'fabric' | 'furniture';
  originalRequest: PurchaseRequest;
  supplierCollectionName?: string;
  supplierCollectionCode?: string;
}

const PAGE_SIZE = 20;
const ACTIVE_PURCHASE_STATUSES: PurchaseRequest["status"][] = [
  "Pending Approval",
  "Approved",
  "PO Generated",
  "Cancelled",
];
const HISTORY_PURCHASE_STATUSES = ["Completed", "completed", "Received", "received"] as const;
type PurchaseTableMode = "active" | "history";

export function PurchaseRequestTable({
  mode,
  view = "default",
  timelineType,
}: {
  mode: PurchaseTableMode;
  view?: "default" | "all" | "po-tracking";
  timelineType?: "purchase" | "po-tracking";
}) {
  const [requests, setRequests] = React.useState<FlattenedPurchaseItem[]>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [deletingRequest, setDeletingRequest] = React.useState<PurchaseRequest | null>(null);
  const [timelineRequest, setTimelineRequest] = React.useState<PurchaseRequest | null>(null);
  const [globalFilter, setGlobalFilter] = React.useState('');

const [detailsOpen, setDetailsOpen] = React.useState(false);
const [detailsLoading, setDetailsLoading] = React.useState(false);
const [detailsRow, setDetailsRow] = React.useState<FlattenedPurchaseItem | null>(null);
const [detailsData, setDetailsData] = React.useState<any>(null);
const [isPageLoading, setIsPageLoading] = React.useState(false);
const [pageIndex, setPageIndex] = React.useState(0);
const [hasNextPage, setHasNextPage] = React.useState(false);

  const { toast } = useToast();
  const { role } = useAuth();
  
  const isAuthorized = role === 'admin' || role === 'Accounts';

  const pageRowsCacheRef = React.useRef<Map<number, FlattenedPurchaseItem[]>>(new Map());
  const pageLastDocRef = React.useRef<Map<number, QueryDocumentSnapshot<DocumentData> | null>>(new Map());
  const pageHasNextRef = React.useRef<Map<number, boolean>>(new Map());
  const stockCacheRef = React.useRef<Map<string, Stock>>(new Map());

  const normalizeStatus = React.useCallback((status?: string) => {
    return String(status || "").trim().toLowerCase();
  }, []);

  const isHistoryStatus = React.useCallback(
    (status?: string) => {
      const normalized = normalizeStatus(status);
      return normalized === "completed" || normalized === "received";
    },
    [normalizeStatus]
  );

  const isActiveStatus = React.useCallback(
    (status?: string) => {
      const normalized = normalizeStatus(status);
      return ACTIVE_PURCHASE_STATUSES.some((s) => normalizeStatus(s) === normalized);
    },
    [normalizeStatus]
  );

  const resetPaginationState = React.useCallback(() => {
    pageRowsCacheRef.current.clear();
    pageLastDocRef.current.clear();
    pageHasNextRef.current.clear();
    setRequests([]);
    setRowSelection({});
    setPageIndex(0);
    setHasNextPage(false);
  }, []);

  const chunkArray = React.useCallback(<T,>(arr: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }, []);

  const buildRowsForPage = React.useCallback(
    async (requestPage: PurchaseRequest[]): Promise<FlattenedPurchaseItem[]> => {
      const fabricBcns = requestPage.flatMap((req) =>
        (req.fabricDetails || []).map((item) => item.fabricName).filter(Boolean)
      ) as string[];
      const uniqueBcns = Array.from(new Set(fabricBcns));
      const missingBcns = uniqueBcns.filter((bcn) => !stockCacheRef.current.has(bcn));

      if (missingBcns.length) {
        const chunks = chunkArray(missingBcns, 30);
        for (const chunk of chunks) {
          const stockQuery = query(collection(db, "stocks"), where("bcn", "in", chunk));
          const stockSnapshot = await getDocs(stockQuery);
          stockSnapshot.forEach((docSnap) => {
            const stock = docSnap.data() as Stock;
            stockCacheRef.current.set(stock.bcn, stock);
          });
        }
      }

      let flattenedData: FlattenedPurchaseItem[] = requestPage.flatMap((req) => {
        const fabricItems = (req.fabricDetails || []).map((item) => {
          const stockData = stockCacheRef.current.get(item.fabricName);
          return {
            id: `${req.id}-${item.fabricName}`,
            dealId: req.dealId,
            customerName: req.customerName,
            salesman: req.salesman,
            status: req.status || "Pending Approval",
            createdAt: req.createdAt,
            itemName: item.fabricName,
            quantity: item.quantity,
            poNumber: item.poNumber,
            vendorName: item.vendorName,
            type: "fabric" as const,
            originalRequest: req,
            supplierCollectionName: stockData?.supplierCollectionName || "",
            supplierCollectionCode: stockData?.supplierCollectionCode || "",
          };
        });

        const furnitureItems = (req.furnitureDetails || []).map((item) => ({
          id: `${req.id}-${item.furnitureName}`,
          dealId: req.dealId,
          customerName: req.customerName,
          salesman: req.salesman,
          status: req.status || "Pending Approval",
          createdAt: req.createdAt,
          itemName: item.furnitureName,
          quantity: item.quantity,
          poNumber: item.poNumber,
          vendorName: item.vendorName,
          type: "furniture" as const,
          originalRequest: req,
          supplierCollectionName: "",
          supplierCollectionCode: "",
        }));

        return [...fabricItems, ...furnitureItems];
      });

      if (view === "po-tracking") {
        flattenedData = flattenedData.filter((item) => !!item.poNumber);
      }

      return flattenedData;
    },
    [chunkArray, view]
  );

  const loadPage = React.useCallback(
    async (targetPage: number) => {
      if (targetPage < 0) return;

      const cachedRows = pageRowsCacheRef.current.get(targetPage);
      if (cachedRows) {
        setRequests(cachedRows);
        setRowSelection({});
        setPageIndex(targetPage);
        setHasNextPage(pageHasNextRef.current.get(targetPage) ?? false);
        return;
      }

      const previousPageCursor =
        targetPage === 0 ? null : pageLastDocRef.current.get(targetPage - 1) ?? null;

      if (targetPage > 0 && !previousPageCursor) return;

      setIsPageLoading(true);

      try {
        const constraints: QueryConstraint[] = [];
        if (mode === "active") {
          constraints.push(where("status", "in", ACTIVE_PURCHASE_STATUSES));
        } else {
          constraints.push(where("status", "in", HISTORY_PURCHASE_STATUSES));
        }

        constraints.push(orderBy("createdAt", "desc"), limit(PAGE_SIZE));
        if (previousPageCursor) {
          constraints.push(startAfter(previousPageCursor));
        }

        let sourceDocs: QueryDocumentSnapshot<DocumentData>[] = [];
        let canLoadNext = false;
        let needsClientStatusFilter = false;
        try {
          const pageQuery = query(collection(db, "purchaseRequests"), ...constraints);
          const pageSnapshot = await getDocs(pageQuery);
          sourceDocs = pageSnapshot.docs;
          canLoadNext = pageSnapshot.docs.length === PAGE_SIZE;
        } catch (queryError: any) {
          const message = String(queryError?.message || "").toLowerCase();
          const missingIndex =
            queryError?.code === "failed-precondition" || message.includes("index");

          if (missingIndex) {
            const FALLBACK_BATCH_SIZE = 100;
            const matchedDocs: QueryDocumentSnapshot<DocumentData>[] = [];
            let scanCursor = previousPageCursor;
            let exhausted = false;

            while (matchedDocs.length < PAGE_SIZE + 1 && !exhausted) {
              const fallbackConstraints: QueryConstraint[] = [
                orderBy("createdAt", "desc"),
                limit(FALLBACK_BATCH_SIZE),
              ];
              if (scanCursor) {
                fallbackConstraints.push(startAfter(scanCursor));
              }

              const fallbackQuery = query(collection(db, "purchaseRequests"), ...fallbackConstraints);
              const fallbackSnapshot = await getDocs(fallbackQuery);

              if (fallbackSnapshot.empty) {
                exhausted = true;
                break;
              }

              const filtered = fallbackSnapshot.docs.filter((docSnap) => {
                const data = docSnap.data() as PurchaseRequest;
                return mode === "active" ? isActiveStatus(data.status) : isHistoryStatus(data.status);
              });
              matchedDocs.push(...filtered);

              scanCursor = fallbackSnapshot.docs[fallbackSnapshot.docs.length - 1];
              if (fallbackSnapshot.docs.length < FALLBACK_BATCH_SIZE) {
                exhausted = true;
              }
            }

            sourceDocs = matchedDocs.slice(0, PAGE_SIZE);
            canLoadNext = matchedDocs.length > PAGE_SIZE;
            needsClientStatusFilter = true;
          } else {
            throw queryError;
          }
        }

        let requestPage = sourceDocs.map(
          (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as PurchaseRequest)
        );

        if (needsClientStatusFilter) {
          requestPage = requestPage.filter((req) =>
            mode === "active"
              ? isActiveStatus(req.status)
              : isHistoryStatus(req.status)
          );
        }

        const rows = await buildRowsForPage(requestPage);
        const lastDoc = sourceDocs.length
          ? sourceDocs[sourceDocs.length - 1]
          : null;

        pageRowsCacheRef.current.set(targetPage, rows);
        pageLastDocRef.current.set(targetPage, lastDoc);
        pageHasNextRef.current.set(targetPage, canLoadNext);

        setRequests(rows);
        setRowSelection({});
        setPageIndex(targetPage);
        setHasNextPage(canLoadNext);
      } catch (error) {
        console.error("Failed to fetch purchase page", error);
        if (targetPage === 0) {
          setRequests([]);
        }
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not load purchase requests.",
        });
      } finally {
        setIsPageLoading(false);
      }
    },
    [buildRowsForPage, isActiveStatus, isHistoryStatus, mode, toast]
  );

  React.useEffect(() => {
    resetPaginationState();
    void loadPage(0);
  }, [loadPage, mode, resetPaginationState, view]);
  
  const handleDeleteRequest = async () => {
    if (!deletingRequest) return;
    try {
      await deleteDoc(doc(db, "purchaseRequests", deletingRequest.id));
      toast({ title: "Purchase Request Deleted", description: `Request ${deletingRequest.id} has been removed.` });
      setDeletingRequest(null);
      resetPaginationState();
      await loadPage(0);
    } catch (error) {
      console.error("Error deleting request: ", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to delete request." });
    }
  };


  const columns: ColumnDef<FlattenedPurchaseItem>[] = [
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
      accessorKey: "dealId",
      header: "Order ID",
    },
    {
        accessorKey: 'poNumber',
        header: 'PO Number',
        cell: ({ row }) => {
          const poNumber = row.original.poNumber;
           return poNumber ? (
              <Link
                href={`/dashboard/inbound/receive/${encodeURIComponent(poNumber)}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {poNumber}
              </Link>
            ) : '-';
        }
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
        accessorKey: "itemName",
        header: "Item Name",
    },
    {
        accessorKey: "supplierCollectionName",
        header: "Supplier Collection",
    },
    {
        accessorKey: "supplierCollectionCode",
        header: "Supplier Code",
    },
    {
        accessorKey: "quantity",
        header: "Quantity",
    },
    {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => <Badge variant="outline" className="capitalize">{row.getValue("type")}</Badge>,
        filterFn: (row, id, value) => {
            return value.includes(row.getValue(id))
        }
    },
    {
        accessorKey: "salesman",
        header: "Salesman",
        cell: ({ row }) => <div>{row.getValue("salesman")}</div>,
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
            const status = row.original.status || 'Pending Approval';
            let variant: "default" | "secondary" | "destructive" | "outline" = "secondary";
            let Icon = null;
            if (status === "Approved") variant = "secondary";
            if (status === "Pending Approval") variant = "outline";
            if (status === "PO Generated") variant = "default";
            if (status === "Completed") {
                variant = "default";
                Icon = CheckCircle;
            }
            return <Badge variant={variant} className={status === 'Completed' ? "bg-green-600 hover:bg-green-700" : ""}>{Icon && <Icon className="mr-1 h-3 w-3"/>}{status}</Badge>;
        },
        filterFn: (row, id, value) => {
            return value.includes(row.getValue(id))
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
        const request = row.original.originalRequest;
        if (!isAuthorized) return null;

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
                onClick={() => setDeletingRequest(request)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Request
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                    const rowItem = row.original;
                    setDetailsRow(rowItem);
                    setDetailsData(null);
                    setDetailsOpen(true);

                    setDetailsLoading(true);
                    try {
                    const res = await getPurchaseViewDetails(rowItem.originalRequest.id);
                    if (!res.success || !("data" in res)) {
                        const message = "message" in res ? res.message : "Could not load purchase details.";
                        toast({ variant: "destructive", title: "Error", description: message });
                        return;
                    }
                    setDetailsData(res.data);
                    } finally {
                    setDetailsLoading(false);
                    }
                }}
                >
                <Eye className="mr-2 h-4 w-4" />
                View Details
                </DropdownMenuItem>

            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: requests,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter
    },
  });

  const handleExport = () => {
    toast({
        title: "Export Started",
        description: "Generating Purchase Requests Excel file..."
    });

    const dataToExport = table.getFilteredRowModel().rows.map(row => {
        const item = row.original;
        const flatData: Record<string, any> = {
            "Order ID": item.dealId,
            "Customer Name": item.customerName,
            "Item Name": item.itemName,
            "Quantity": item.quantity,
            "Type": item.type,
            "Salesman": item.salesman,
            "Status": item.status,
            "PO Number": item.poNumber || '',
            "Created Date": format(new Date(item.createdAt), 'dd/MM/yyyy HH:mm'),
        };

        // Add each milestone status
        PURCHASE_PROCESS_CONFIG.forEach(step => {
            const historyItem = item.originalRequest.milestones?.find(h => h.stepId === step.id);
            flatData[`${step.step} - Status`] = historyItem ? historyItem.status : 'Pending';
            flatData[`${step.step} - Date`] = historyItem ? format(new Date(historyItem.completedAt), 'dd/MM/yyyy HH:mm') : '';
            flatData[`${step.step} - By`] = historyItem ? historyItem.completedBy : '';
        });

        return flatData;
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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Purchase Items");
    
    // Set column widths
    const maxLengths = Object.keys(dataToExport[0] || {}).map(key => ({
        wch: Math.max(key.length, ...dataToExport.map(item => String(item[key] || '').length)) + 2
    }));
    worksheet["!cols"] = maxLengths;
    
    XLSX.writeFile(workbook, `motrack_purchase_items_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
        title: "Export Complete!",
        description: "Your Purchase Items Excel file has been downloaded.",
    });
  }
  
  if (!isAuthorized && view !== 'default') {
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
        <Card>
            <CardContent className="p-4">
                <div className="flex flex-wrap items-center py-4 gap-4">
                    <Input
                        placeholder="Search all columns..."
                        value={globalFilter ?? ''}
                        onChange={(event) =>
                            setGlobalFilter(event.target.value)
                        }
                        className="max-w-sm"
                    />
                     <Select
                        value={(table.getColumn("type")?.getFilterValue() as string) ?? "all"}
                        onValueChange={(value) =>
                            table.getColumn("type")?.setFilterValue(value === "all" ? null : value)
                        }
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter by Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="fabric">Fabric</SelectItem>
                            <SelectItem value="furniture">Furniture</SelectItem>
                        </SelectContent>
                    </Select>
                     <Select
                        value={(table.getColumn("status")?.getFilterValue() as string) ?? "all"}
                        onValueChange={(value) =>
                            table.getColumn("status")?.setFilterValue(value === "all" ? null : value)
                        }
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter by Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="Pending Approval">Pending Approval</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
                            <SelectItem value="PO Generated">PO Generated</SelectItem>
                            <SelectItem value="Completed">Completed</SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="flex-grow" />

                    <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline">
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
                                    : flexRender(header.column.columnDef.header, header.getContext())}
                                </TableHead>
                            );
                            })}
                        </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {isPageLoading && requests.length === 0 ? (
                        <TableRow>
                            <TableCell
                            colSpan={columns.length}
                            className="h-24 text-center"
                            >
                              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading purchase requests...
                              </div>
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
                 <div className="flex items-center justify-between space-x-2 py-4">
                    <div className="flex-1 text-sm text-muted-foreground">
                    {table.getFilteredSelectedRowModel().rows.length} of{" "}
                    {table.getFilteredRowModel().rows.length} row(s) selected.
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Page {pageIndex + 1}
                    </div>
                    <div className="space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void loadPage(pageIndex - 1)}
                        disabled={isPageLoading || pageIndex === 0}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void loadPage(pageIndex + 1)}
                        disabled={isPageLoading || !hasNextPage}
                    >
                        {isPageLoading ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading
                          </span>
                        ) : (
                          "Next"
                        )}
                    </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>
     <AlertDialog open={!!deletingRequest} onOpenChange={() => setDeletingRequest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the purchase request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRequest} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog>
        <Dialog open={!!timelineRequest} onOpenChange={() => setTimelineRequest(null)}>
            <DialogContent className="max-w-2xl">
                 <DialogHeader>
                    <DialogTitle>Timeline for {timelineType === 'purchase' ? 'Purchase Request' : 'PO'} #{timelineRequest?.dealId}</DialogTitle>
                    <DialogDescription>
                        This timeline shows the progress of the {timelineType === 'purchase' ? 'request before a PO is placed' : 'Purchase Order after it has been placed'}.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    {timelineRequest && timelineType === 'purchase' && (
                       <PurchaseProcessTimeline
                            request={timelineRequest}
                            onStepUpdate={() => {}}
                            onRevertStep={() => {}}
                            userRole={role}
                       />
                    )}
                    {timelineRequest && timelineType === 'po-tracking' && (
                       <PoTrackingTimeline 
                            request={timelineRequest}
                            onStepUpdate={() => {}}
                            onRevertStep={() => {}}
                            userRole={role}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
     </AlertDialog>

     {/* Full Details Dialog */}
     <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
  <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>
        Full Details — Order #{detailsRow?.dealId}
      </DialogTitle>
      <DialogDescription>
        Customer, deal, quotations, PO history, and request milestones.
      </DialogDescription>
    </DialogHeader>

    {detailsLoading ? (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading details...
      </div>
    ) : !detailsData ? (
      <div className="text-muted-foreground">No data available.</div>
    ) : (
      <div className="space-y-6">
        {/* ============================= */}
        {/* TOP SECTION: Customer + Deal + PR */}
        {/* ============================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* CUSTOMER CARD */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Customer</CardTitle>
              <CardDescription>From customers collection</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Name:</span>{" "}
                <span className="font-medium">
                  {detailsData.customer?.name || detailsRow?.customerName || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Phone:</span>{" "}
                <span className="font-medium">
                  {detailsData.customer?.phone || 
                   detailsData.customer?.mobileNo || 
                   "N/A"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Email:</span>{" "}
                <span className="font-medium">
                  {detailsData.customer?.email || "N/A"}
                </span>
              </div>
              <div>
                  <span className="text-muted-foreground">City:</span>{" "}
                  <span className="font-medium">
                  {detailsData.customer?.billingAddress?.city || detailsData.customer?.city || "N/A"}
                  </span>
              </div>
              <div>
                <span className="text-muted-foreground">Address:</span>{" "}
                <span className="font-medium">
                  {detailsData.customer?.billingAddress?.line1 || 
                   detailsData.customer?.address || 
                   detailsData.customer?.addressPinCode || 
                   "N/A"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* DEAL CARD */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Deal Information</CardTitle>
              <CardDescription>Deal & Representative</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Deal ID:</span>{" "}
                <span className="font-medium">
                  {detailsData.deal?.dealId || detailsRow?.dealId || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Salesman:</span>{" "}
                <span className="font-medium">
                  {detailsData.representative?.name || 
                   detailsData.deal?.representative || 
                   "N/A"}
                </span>
              </div>
              {detailsData.representative?.email && (
                <div>
                  <span className="text-muted-foreground">Email:</span>{" "}
                  <span className="font-medium">
                    {detailsData.representative.email}
                  </span>
                </div>
              )}
              {detailsData.representative?.phone && (
                <div>
                  <span className="text-muted-foreground">Phone:</span>{" "}
                  <span className="font-medium">
                    {detailsData.representative.phone}
                  </span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Latest Selection:</span>{" "}
                <span className="font-medium">
                  {detailsData.deal?.latestSelectionId || "N/A"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* PURCHASE REQUEST CARD */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Purchase Request</CardTitle>
              <CardDescription>Request Status</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                <span className="font-medium">
                  {detailsData.purchaseRequest?.status || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Created:</span>{" "}
                <span className="font-medium">
                  {detailsData.purchaseRequest?.createdAt 
                    ? format(new Date(detailsData.purchaseRequest.createdAt), "dd/MM/yyyy HH:mm") 
                    : "N/A"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Courier:</span>{" "}
                <span className="font-medium">
                  {detailsData.purchaseRequest?.courier || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Mode:</span>{" "}
                <span className="font-medium">
                  {detailsData.purchaseRequest?.mode || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Tally PO Number:</span>{" "}
                <span className="font-medium">
                  {detailsData.purchaseRequest?.tallyPoNumber || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Promise Date:</span>{" "}
                <span className="font-medium">
                  {detailsData.purchaseRequest?.promiseDeliveryDate 
                    ? format(new Date(detailsData.purchaseRequest.promiseDeliveryDate), "dd/MM/yyyy") 
                    : "N/A"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ============================= */}
        {/* FABRIC LINE DETAILS */}
        {/* ============================= */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fabric Line Details</CardTitle>
            <CardDescription>Selected fabric item information</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {(() => {
              const pr = detailsData.purchaseRequest;
              const fabricNameFromRow = detailsRow?.itemName;
              const line = pr?.fabricDetails?.find((x: any) => x.fabricName === fabricNameFromRow);

              if (!line) {
                return (
                  <div className="text-muted-foreground">
                    Line not found in fabricDetails.
                  </div>
                );
              }

              const poStep = pr?.milestones?.find((m: any) => m.stepId === 4);
              
              // Get vendor name from vendors object
              const vendorName = line.vendorId && detailsData.vendors?.[line.vendorId]
                ? detailsData.vendors[line.vendorId].name
                : line.vendorName || line.vendor || "N/A";

                console.log('Line Details:', line);

              return (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-muted-foreground">Fabric</div>
                    <div className="font-medium">{line.fabricName}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Quantity</div>
                    <div className="font-medium">{line.quantity}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Vendor</div>
                    <div className="font-medium">{vendorName}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">PO Number</div>
                    <div className="font-medium">{line.poNumber || "-"}</div>
                  </div>

                  <div>
                    <div className="text-muted-foreground">Expected Delivery</div>
                    <div className="font-medium">
                      {line.expectedDeliveryDate 
                        ? format(new Date(line.expectedDeliveryDate), "dd/MM/yyyy") 
                        : "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">PO Generated By</div>
                    <div className="font-medium">{poStep?.completedBy || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">PO Generated At</div>
                    <div className="font-medium">
                      {poStep?.completedAt 
                        ? format(new Date(poStep.completedAt), "dd/MM/yyyy HH:mm") 
                        : "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Remarks</div>
                    <div className="font-medium">{poStep?.remarks || "-"}</div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* ============================= */}
        {/* ALL FABRICS WITH VENDORS */}
        {/* ============================= */}
        {detailsData.purchaseRequest?.fabricDetails?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">All Fabrics in Request</CardTitle>
              <CardDescription>Complete fabric list with vendor details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {detailsData.fabricStockDetails?.map((fabricStock: any, idx: number) => {
                    return (
                    <div 
                        key={idx} 
                        className={`rounded-md border p-3 ${
                        fabricStock.fabricName === detailsRow?.itemName 
                            ? 'border-primary bg-primary/5' 
                            : ''
                        }`}
                    >
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <div>
                            <span className="text-muted-foreground">Fabric:</span>{" "}
                            <span className="font-medium">{fabricStock.fabricName}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Item:</span>{" "}
                            <span className="font-medium">{fabricStock.itemName}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Serial:</span>{" "}
                            <span className="font-medium">{fabricStock.serialNo}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Qty Needed:</span>{" "}
                            <span className="font-medium">{fabricStock.neededQty}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Available:</span>{" "}
                            <span className={`font-medium ${
                            fabricStock.availableQty < fabricStock.neededQty 
                                ? 'text-destructive' 
                                : 'text-green-600'
                            }`}>
                            {fabricStock.availableQty}
                            </span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Vendor:</span>{" "}
                            <span className="font-medium">{fabricStock.vendorName}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Category:</span>{" "}
                            <span className="font-medium">{fabricStock.category}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">PO:</span>{" "}
                            <span className="font-medium">{fabricStock.poNumber || "-"}</span>
                        </div>
                        </div>
                        
                        {/* Optional: Show HSN and MRP */}
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-2 pt-2 border-t">
                        <div>HSN: {fabricStock.hsnCode}</div>
                        <div>MRP: ₹{fabricStock.mrp}</div>
                        </div>
                    </div>
                    );
                })}
              </div>

            </CardContent>
          </Card>
        )}

        {/* ============================= */}
        {/* QUOTATIONS */}
        {/* ============================= */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quotations</CardTitle>
            <CardDescription>
              {detailsData.quotations?.length || 0} quotation(s) found
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {detailsData.quotations?.length ? (
              detailsData.quotations.map((q: any) => (
                <div key={q.id} className="rounded-md border p-3">
                  <div className="font-medium">
                    Quotation #{q.quotationNo || q.id}
                  </div>
                  <div className="text-muted-foreground">
                    Created: {q.createdAt 
                      ? format(new Date(q.createdAt), "dd/MM/yyyy HH:mm") 
                      : "N/A"} •
                    Status: {q.status || "N/A"} •
                    Total: ₹{q.totalAmount?.toLocaleString() || "N/A"}
                  </div>
                  {q.createdBy && (
                    <div className="text-xs text-muted-foreground mt-1">
                      By: {q.createdBy}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-muted-foreground">No quotations found.</div>
            )}
          </CardContent>
        </Card>

        {/* ============================= */}
        {/* ORDERS */}
        {/* ============================= */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Orders</CardTitle>
            <CardDescription>
              {detailsData.orders?.length || 0} order(s) found
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {detailsData.orders?.length ? (
              detailsData.orders.map((o: any) => (
                <div key={o.id} className="rounded-md border p-3">
                  <div className="font-medium">
                    Order #{o.orderNo || o.id}
                  </div>
                  <div className="text-muted-foreground">
                    Created By: {o.createdBy || "N/A"} • 
                    Date: {o.orderDate 
                      ? format(new Date(o.orderDate), "dd/MM/yyyy HH:mm") 
                      : "N/A"} • 
                    Status: {o.status || "N/A"}
                  </div>
                  {o.remark && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Remark: {o.remark}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-muted-foreground">No orders found.</div>
            )}
          </CardContent>
        </Card>

        {/* ============================= */}
        {/* VISITS */}
        {/* ============================= */}
        {detailsData.visits?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Visits</CardTitle>
              <CardDescription>
                {detailsData.visits.length} visit(s) recorded
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {detailsData.visits.map((v: any) => (
                <div key={v.id} className="rounded-md border p-3">
                  <div className="font-medium">
                    {v.typeOfVisit || "Visit"} - {v.representative || "N/A"}
                  </div>
                  <div className="text-muted-foreground">
                    Created: {v.createdAt 
                      ? format(new Date(v.createdAt), "dd/MM/yyyy HH:mm") 
                      : "N/A"} •
                    Status: {v.status || "N/A"}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ============================= */}
        {/* MEASUREMENTS */}
        {/* ============================= */}
        {detailsData.measurements?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Measurements</CardTitle>
              <CardDescription>
                {detailsData.measurements.length} measurement(s) recorded
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {detailsData.measurements.map((m: any) => (
                <div key={m.id} className="rounded-md border p-3">
                  <div className="font-medium">
                    {m.typeOf || "Measurement"} by {m.doerName}
                  </div>
                  <div className="text-muted-foreground">
                    Created: {m.createdAt 
                      ? format(new Date(m.createdAt), "dd/MM/yyyy HH:mm") 
                      : "N/A"} •
                    Status: {m.status || "N/A"}
                  </div>
                  {m.pdfUrl && (
                    <a 
                      href={m.pdfUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline mt-1 inline-block"
                    >
                      View PDF →
                    </a>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ============================= */}
        {/* RECEIPTS */}
        {/* ============================= */}
        {detailsData.receipts?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Receipts</CardTitle>
              <CardDescription>
                {detailsData.receipts.length} receipt(s) recorded
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {detailsData.receipts.map((r: any) => (
                <div key={r.id} className="rounded-md border p-3">
                  <div className="font-medium">
                    ₹{r.amount?.toLocaleString() || "N/A"}
                  </div>
                  <div className="text-muted-foreground">
                    Date: {r.date 
                      ? format(new Date(r.date), "dd/MM/yyyy") 
                      : "N/A"} •
                    Mode: {r.paymentMode || "N/A"}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ============================= */}
        {/* PURCHASE TIMELINE */}
        {/* ============================= */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Purchase Timeline</CardTitle>
            <CardDescription>Request milestones and progress</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Uncomment when ready */}
            {/* <PurchaseProcessTimeline
              request={detailsData.purchaseRequest}
              onStepUpdate={() => {}}
              onRevertStep={() => {}}
              userRole={role}
            /> */}
            <div className="text-sm text-muted-foreground">
              Timeline component placeholder
            </div>
          </CardContent>
        </Card>
      </div>
    )}
  </DialogContent>
     </Dialog>


    </>
  );
}

    
