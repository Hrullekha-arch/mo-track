"use client";

import * as React from "react";
import { Order } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Printer } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { useOrderItems } from "@/hooks/orders/useOrderItems";
import { createPurchaseRequestForOrderItemsAction, getStockByBcns } from "@/app/dashboard/orders/[orderId]/actions";
import { getBcnFromItem, getItemName, getItemQty, getAllocatedItemsForLabels, normalizeItemKey } from "@/lib/order-utils";
import OrderItemRow from "./OrderItemRow";
import { escapeHtml, formatLabelQty } from "@/lib/order-utils";
import { buildAllocationLabelHtml } from "@/lib/orderLabelPrint/BuildAllocationLabelHtml";
interface OrderItemsTableProps {
  order: Order;
  orderId: string;
  onAllocationSuccess: (bcn?: string) => void;
  lastAllocation: { bcn: string; timestamp: number } | null;
}

export default function OrderItemsTable({
  order,
  orderId,
  onAllocationSuccess,
  lastAllocation,
}: OrderItemsTableProps) {
  const { toast } = useToast();
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  
  const [isPrintingLabels, setIsPrintingLabels] = React.useState(false);
  const [isCreatingPr, setIsCreatingPr] = React.useState(false);
  const [selectedPrItems, setSelectedPrItems] = React.useState<Record<string, boolean>>({});

  // Use optimized hook with incremental refresh
  const { resolvedItems, isLoading, refreshingBcns } = useOrderItems(
    order,
    orderId,
    lastAllocation
  );

  const allocatedItemsForLabels = React.useMemo(
    () => getAllocatedItemsForLabels(order),
    [order]
  );

  const getPrSelectionKey = React.useCallback((resolved: any) => {
    const lineId = String((resolved.item as any)?.lineId || "").trim();
    if (lineId) return `line:${lineId}`;
    return `name:${normalizeItemKey(getItemName(resolved.item))}`;
  }, []);

  const isPrSelectableItem = React.useCallback(
    (resolved: any) =>
      resolved.item.type === "Fabric" &&
      resolved.status.kind === "pending_po",
    []
  );

  const prSelectableRows = React.useMemo(
    () => resolvedItems.filter((row) => isPrSelectableItem(row)),
    [resolvedItems, isPrSelectableItem]
  );

  const selectedPrRows = React.useMemo(
    () =>
      prSelectableRows.filter((row) => selectedPrItems[getPrSelectionKey(row)]),
    [prSelectableRows, selectedPrItems, getPrSelectionKey]
  );

  const allSelectableSelected =
    prSelectableRows.length > 0 &&
    selectedPrRows.length === prSelectableRows.length;

  React.useEffect(() => {
    const allowedKeys = new Set(
      prSelectableRows.map((row) => getPrSelectionKey(row))
    );
    setSelectedPrItems((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([key, checked]) => {
        if (checked && allowedKeys.has(key)) {
          next[key] = true;
        }
      });
      return next;
    });
  }, [prSelectableRows, getPrSelectionKey]);

  const toggleSelectAllPrRows = React.useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedPrItems({});
        return;
      }
      const next: Record<string, boolean> = {};
      prSelectableRows.forEach((row) => {
        next[getPrSelectionKey(row)] = true;
      });
      setSelectedPrItems(next);
    },
    [prSelectableRows, getPrSelectionKey]
  );

  const handleCreatePrForSelected = React.useCallback(async () => {
    if (!isAdmin) {
      toast({
        variant: "destructive",
        title: "Permission Denied",
        description: "Only admin can create PR from selected items.",
      });
      return;
    }
    if (!user?.id) {
      toast({
        variant: "destructive",
        title: "Missing user",
        description: "Please login again and retry.",
      });
      return;
    }
    if (!selectedPrRows.length) {
      toast({
        variant: "destructive",
        title: "No items selected",
        description: "Select at least one pending PO item.",
      });
      return;
    }

    setIsCreatingPr(true);
    try {
      const result = await createPurchaseRequestForOrderItemsAction({
        orderId: order.id,
        actor: {
          id: user.id,
          name: user.name || "Admin",
        },
        items: selectedPrRows.map((row) => ({
          lineId:
            String((row.item as any)?.lineId || "").trim() || undefined,
          bcn: getBcnFromItem(row.item) || undefined,
          itemName: getItemName(row.item),
          quantity: String(getItemQty(row.item)),
        })),
      });

      if (result.success) {
        setSelectedPrItems({});
        toast({
          title: "PR Created",
          description: result.message,
        });
        onAllocationSuccess();
      } else {
        toast({
          variant: "destructive",
          title: "Could not create PR",
          description: result.message,
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.message || "Failed to create purchase request.",
      });
    } finally {
      setIsCreatingPr(false);
    }
  }, [
    isAdmin,
    onAllocationSuccess,
    order.id,
    selectedPrRows,
    toast,
    user?.id,
    user?.name,
  ]);

  const handlePrintAllocationLabels = React.useCallback(async () => {
    if (!allocatedItemsForLabels.length) {
      toast({
        variant: "destructive",
        title: "No allocated items",
        description: "Allocate at least one item before printing labels.",
      });
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Popup blocked",
        description: "Allow popups for this site to print labels.",
      });
      return;
    }

    try {
      setIsPrintingLabels(true);
      const customerName = escapeHtml(
        order.customerName || order.customerSnapshot?.name || "-"
      );
      const phone = escapeHtml(
        order.customerPhone || order.customerSnapshot?.phone || "-"
      );
      const salesman = escapeHtml(order.salesPerson || "-");
      const logoUrl = `${window.location.origin}/logo.png`;

      // Fetch stock meta in parallel

      const uniqueBcns = Array.from(
        new Set(
            allocatedItemsForLabels
            .map((i)=>String(i.bcn || "").trim())
            .filter(Boolean)
        )
      );

        const stocks = await getStockByBcns(uniqueBcns);

      const stockMetaByBcn = new Map();
      
      stocks.forEach((stock:any)=>{
        stockMetaByBcn.set(
            normalizeItemKey(stock.bcn),
            {
                collectionName:stock.supplierCollectionName || "",
                collectionCode:stock.supplierCollectionCode || "",
            }
        );
      });

      const labelsHtml = buildAllocationLabelHtml({
        allocatedItemsForLabels,
        stockMetaByBcn,
        customerName,
        phone,
        salesman,
        logoUrl,
      });
       

      const doc = printWindow.document;
      doc.open();
      const parser = new DOMParser();
      const htmlDoc = parser.parseFromString(labelsHtml, 'text/html');
      doc.body.innerHTML = htmlDoc.body.innerHTML;
      doc.close();

      const runPrint = () => {
        printWindow.focus();
        printWindow.print();
        setTimeout(() => printWindow.close(), 200);
      };
      if (printWindow.document.readyState === "complete") {
        setTimeout(runPrint, 600);
      } else {
        printWindow.onload = () => setTimeout(runPrint, 700);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Print failed",
        description: err?.message || "Could not prepare labels.",
      });
      printWindow.close();
    } finally {
      setIsPrintingLabels(false);
    }
  }, [allocatedItemsForLabels, order, toast]);

  //==============Helper function i Dont Know Why
    const handleSelectionChange = React.useCallback(
        (key:string, checked:boolean) =>{
            setSelectedPrItems((prev)=>({
                ...prev,
                [key]:checked,
            }));
        },
      []
    );

   //=================refreshing Helper
   const refreshingSet = React.useMemo(
    ()=>refreshingBcns,
    [refreshingBcns]
   );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4">
        <div>
          <CardTitle className="text-base">Order Items</CardTitle>
          <CardDescription className="text-xs mt-0.5">
            {resolvedItems.length} item{resolvedItems.length !== 1 ? "s" : ""} ·{" "}
            {isLoading ? "loading…" : "up to date"}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => void handleCreatePrForSelected()}
              disabled={!selectedPrRows.length || isCreatingPr}
              className="shrink-0"
            >
              {isCreatingPr ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {isCreatingPr
                ? "Creating PR…"
                : `Create PR (${selectedPrRows.length})`}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handlePrintAllocationLabels()}
            disabled={!allocatedItemsForLabels.length || isPrintingLabels}
            className="shrink-0"
          >
            {isPrintingLabels ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Printer className="mr-2 h-3.5 w-3.5" />
            )}
            {isPrintingLabels ? "Preparing…" : "Print Labels"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {isAdmin && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        allSelectableSelected
                          ? true
                          : selectedPrRows.length > 0
                          ? "indeterminate"
                          : false
                      }
                      onCheckedChange={(checked) =>
                        toggleSelectAllPrRows(Boolean(checked))
                      }
                      disabled={!prSelectableRows.length || isCreatingPr}
                      aria-label="Select all pending PO items"
                    />
                  </TableHead>
                )}
                <TableHead className="w-8">#</TableHead>
                <TableHead>BCN / Item</TableHead>
                <TableHead>Serial No</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>CRM Stock</TableHead>
                <TableHead>IMS Stock</TableHead>
                <TableHead>Allocated</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resolvedItems.length > 0 ? (
                resolvedItems.map((r) => (
                  <OrderItemRow
                    key={r.item.lineId || r.index}
                    resolved={r}
                    order={order}
                    orderId={orderId}
                    onAllocationSuccess={onAllocationSuccess}
                    showSelection={isAdmin}
                    selectionChecked={!!selectedPrItems[getPrSelectionKey(r)]}
                    selectionDisabled={!isPrSelectableItem(r) || isCreatingPr}
                    onSelectionChange={(checked) =>
                      handleSelectionChange(
                        getPrSelectionKey(r),
                        checked
                      )
                    }
                    isRefreshing={refreshingSet.has(getBcnFromItem(r.item))}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 9 : 8}
                    className="h-24 text-center text-muted-foreground text-sm"
                  >
                    No items in this order.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}