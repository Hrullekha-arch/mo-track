"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  RowSelectionState,
} from "@tanstack/react-table";
import {
  ArrowLeft,
  Search,
  Loader2,
  Trash2,
  ShoppingCart,
  Package,
  ChevronLeft,
  ChevronRight,
  X,
  AlertCircle,
  CheckCircle2,
  Info,
  Building2,
} from "lucide-react";
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
import Link from "next/link";
import {
  getPendingPoItems,
  PendingPoItem,
  getQuotationDialogData,
  deletePurchaseOrderAction,
} from "./actions";
import {
  CreatePoDialog,
  DeletePoDialog,
  StatCard,
  VendorVerificationDialog,
} from "./dialogs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { QuotationDetailDialog } from "@/components/features/order-management/QuotationDetailDialog";
import { getSalesmen } from "@/app/dashboard/customers/actions";
import { Quotation, Deal, User, Cpd } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function PendingPOPage() {
  const [data, setData] = React.useState<PendingPoItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isVerificationOpen, setIsVerificationOpen] = React.useState(false);
  const [isCreatePoOpen, setIsCreatePoOpen] = React.useState(false);
  const [isDeletePoOpen, setIsDeletePoOpen] = React.useState(false);
  const [isNewVendor, setIsNewVendor] = React.useState(false);
  const [isDeletingPo, setIsDeletingPo] = React.useState(false);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [selectedQuotation, setSelectedQuotation] = React.useState<Quotation | null>(null);
  const [selectedDeal, setSelectedDeal] = React.useState<Deal | null>(null);
  const [salesmen, setSalesmen] = React.useState<User[]>([]);
  const [cpds, setCpds] = React.useState<Cpd[]>([]);
  const [isDialogLoading, setIsDialogLoading] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const items = await getPendingPoItems();
      setData(items);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "Could not load pending PO data." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchData();
    getSalesmen().then(setSalesmen);
  }, [fetchData]);

  const handleVerificationConfirm = (isNew: boolean) => {
    setIsNewVendor(isNew);
    setIsVerificationOpen(false);
    setIsCreatePoOpen(true);
  };

  const handleDeletePo = async (poNumber: string) => {
    const trimmed = poNumber.trim();
    if (!trimmed) { toast({ variant: "destructive", title: "Enter a PO number" }); return; }
    if (!user?.id || !isAdmin) { toast({ variant: "destructive", title: "Unauthorized" }); return; }

    setIsDeletingPo(true);
    try {
      const result = await deletePurchaseOrderAction(trimmed, { id: user.id, name: user.name });
      if (result.success) {
        toast({ title: "PO Deleted", description: result.message });
        setIsDeletePoOpen(false);
        await fetchData();
        setRowSelection({});
      } else {
        toast({ variant: "destructive", title: "Delete Failed", description: result.message });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: error?.message || "Something went wrong." });
    } finally {
      setIsDeletingPo(false);
    }
  };

  const handleQuotationClick = async (dealId: string, quotationNo: string) => {
    if (!dealId || !quotationNo) return;
    setIsDialogLoading(true);
    setSelectedQuotation(null);
    try {
      const result = await getQuotationDialogData(dealId, quotationNo);
      if (result) {
        setSelectedQuotation(result.quotation);
        setSelectedDeal(result.deal);
        setCpds(result.cpds);
      } else {
        toast({ variant: "destructive", title: "Quotation not found" });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not fetch quotation details." });
    } finally {
      setIsDialogLoading(false);
    }
  };

  const columns: ColumnDef<PendingPoItem>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
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
    },
    {
      accessorKey: "quotationNo",
      header: "Quotation No",
      cell: ({ row }) => (
        <button
          className="font-semibold text-primary hover:underline underline-offset-2 text-sm"
          onClick={() => handleQuotationClick(row.original.dealId, row.original.quotationNo)}
        >
          {row.original.quotationNo}
        </button>
      ),
    },
    {
      accessorKey: "customerName",
      header: "Customer",
      cell: ({ row }) => <span className="text-sm">{row.getValue("customerName")}</span>,
    },
    {
      accessorKey: "salesman",
      header: "Salesman",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary text-xs font-bold">
            {String(row.original.salesman || "").charAt(0).toUpperCase()}
          </div>
          <span className="text-sm">{row.original.salesman || "â€”"}</span>
        </div>
      ),
    },
    {
      accessorKey: "collectionBrand",
      header: "BCN",
      cell: ({ row }) => (
        <span className="text-sm font-mono font-semibold">{row.getValue("collectionBrand")}</span>
      ),
    },
    {
      accessorKey: "itemName",
      header: "Item Name",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.getValue("itemName")}</span>
      ),
    },
    {
      accessorKey: "neededQty",
      header: "Order Qty",
      cell: ({ row }) => (
        <span className="text-sm font-semibold">
          {Number(row.getValue("neededQty")).toFixed(2)}
        </span>
      ),
    },
    {
      accessorKey: "vendorName",
      header: "Vendor",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs font-medium">
          {row.original.vendorName || "â€”"}
        </Badge>
      ),
    },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    initialState: { pagination: { pageSize: 15 } },
    state: { globalFilter, rowSelection },
  });

  const selectedItems = table.getFilteredSelectedRowModel().rows.map((r) => r.original);

  const canCreatePo = React.useMemo(() => {
    if (selectedItems.length === 0) return false;
    const firstVendor = selectedItems[0].vendorName;
    if (!firstVendor) return false;
    return selectedItems.every((item) => item.vendorName === firstVendor);
  }, [selectedItems]);

  const vendorGroups = React.useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((item) => {
      const vendor = item.vendorName || "Unknown";
      map.set(vendor, (map.get(vendor) || 0) + 1);
    });
    return map.size;
  }, [data]);


const router = useRouter();

const handleDeleteSelected = async () => {
  try {
    console.log("ðŸ“¦ Selected Items:", selectedItems);

    if (!selectedItems || selectedItems.length === 0) {
      alert("No items selected");
      return;
    }

    const confirmDelete = confirm(`Delete ${selectedItems.length} items?`);
    if (!confirmDelete) return;

    const deletePromises = selectedItems.map((item, index) => {
      if (!item.purchaseRequestId) {
        console.error(`âŒ Missing ID at index ${index}`, item);
        return Promise.resolve();
      }

      console.log("ðŸ§¹ Deleting:", item.purchaseRequestId);

      return deleteDoc(
        doc(db, "purchaseRequests", item.purchaseRequestId)
      );
    });

    await Promise.all(deletePromises);
    router.refresh();
    console.log("âœ… Delete completed");

    alert("âœ… Selected items deleted successfully");

    

  } catch (error) {
    console.error("ðŸ”¥ Delete Error:", error);
    alert("âŒ Failed to delete items");
  }
};

  return (
    <>
      <TooltipProvider>
        <div className="w-full space-y-6 p-4 md:p-6 lg:p-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">SO â†’ PO Generation</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Select items from the same vendor to generate a Purchase Order.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild className="shrink-0">
              <Link href="/dashboard/purchase">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Purchases
              </Link>
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard
              label="Pending Items"
              value={data.length}
              icon={Package}
              color="bg-blue-500"
              sub="Awaiting PO creation"
            />
            <StatCard
              label="Vendor Groups"
              value={vendorGroups}
              icon={Building2}
              color="bg-violet-500"
              sub="Unique vendors"
            />
            <StatCard
              label="Selected"
              value={selectedItems.length}
              icon={ShoppingCart}
              color={canCreatePo ? "bg-emerald-500" : "bg-amber-500"}
              sub={canCreatePo ? "Ready to create PO" : selectedItems.length > 0 ? "Mixed vendors" : "None selected"}
            />
          </div>

          {/* Table card */}
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Toolbar */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search quotation, customer, BCN..."
                    value={globalFilter}
                    onChange={(e) => setGlobalFilter(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                  {globalFilter && (
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setGlobalFilter("")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {selectedItems.length > 0 && !canCreatePo && (
                    <p className="text-xs text-amber-700 flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Select items from the same vendor
                    </p>
                  )}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Button
                          onClick={() => setIsVerificationOpen(true)}
                          disabled={!canCreatePo}
                          size="sm"
                          className="gap-2"
                        >
                          <ShoppingCart className="h-4 w-4" />
                          Create PO
                          {selectedItems.length > 0 && (
                            <Badge variant="secondary" className="ml-1 h-5 text-xs bg-white/20 text-white">
                              {selectedItems.length}
                            </Badge>
                          )}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {!canCreatePo && selectedItems.length > 1 && (
                      <TooltipContent>
                        <p>All selected items must have the same vendor.</p>
                      </TooltipContent>
                    )}
                    {selectedItems.length === 0 && (
                      <TooltipContent>
                        <p>Select at least one item to create a PO.</p>
                      </TooltipContent>
                    )}
                  </Tooltip>

                  {isAdmin && (
                    <div className="flex gap-1 justify-center items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => setIsDeletePoOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete PO
                    </Button>
                    <Button 
                      // disabled={!canDelete}
                      onClick={handleDeleteSelected}
                      variant="destructive"
                    >
                      Delete Selected
                    </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id} className="bg-muted/50">
                        {headerGroup.headers.map((header) => (
                          <TableHead
                            key={header.id}
                            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-10"
                          >
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
                      Array.from({ length: 5 }).map((_, i) => (
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
                            row.getIsSelected()
                              ? "bg-primary/5 hover:bg-primary/8"
                              : idx % 2 === 0
                              ? "bg-background hover:bg-muted/30"
                              : "bg-muted/20 hover:bg-muted/40"
                          )}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id} className="py-2.5">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={columns.length} className="h-36 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <CheckCircle2 className="h-9 w-9 opacity-30" />
                            <p className="text-sm font-medium">
                              {globalFilter ? "No items match your search" : "No items require purchasing at this time."}
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
                  <strong>{table.getFilteredSelectedRowModel().rows.length}</strong> of{" "}
                  <strong>{table.getFilteredRowModel().rows.length}</strong> row(s) selected
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
            </CardContent>
          </Card>
        </div>

        {/* Dialogs */}
        <VendorVerificationDialog
          isOpen={isVerificationOpen}
          onClose={() => setIsVerificationOpen(false)}
          onConfirm={handleVerificationConfirm}
        />
        <CreatePoDialog
          isOpen={isCreatePoOpen}
          onClose={() => setIsCreatePoOpen(false)}
          items={selectedItems}
          creator={user ? { id: user.id, name: user.name } : null}
          onSuccess={() => { fetchData(); table.resetRowSelection(); }}
          isNewVendor={isNewVendor}
        />
        <QuotationDetailDialog
          isOpen={!!selectedQuotation}
          onClose={() => {
            setSelectedQuotation(null);
            setIsDialogLoading(false);
          }}
          quotation={selectedQuotation}
          deal={selectedDeal}
          salesmen={salesmen}
          cpds={cpds}
        />
        <DeletePoDialog
          isOpen={isDeletePoOpen}
          onClose={() => setIsDeletePoOpen(false)}
          onConfirm={handleDeletePo}
          isDeleting={isDeletingPo}
        />
      </TooltipProvider>
    </>
  );
}
