"use client";

import * as React from "react";
import { Order } from "@/lib/types";
import { ResolvedOrderItem } from "@/types/order-items";
import { TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { getItemName, getItemQty } from "@/lib/order-utils";
import AllocateDialog from "./AllocateDialog";
import StatusBadge from "./StatusBadge";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { regenerateInvoiceAllocationAction } from "@/app/dashboard/orders/[orderId]/actions";

interface OrderItemRowProps {
  resolved: ResolvedOrderItem;
  order: Order;
  orderId: string;
  onAllocationSuccess: (bcn?: string) => void;
  showSelection?: boolean;
  selectionChecked?: boolean;
  selectionDisabled?: boolean;
  onSelectionChange?: (checked: boolean) => void;
  isRefreshing?: boolean;
}

 function OrderItemRow({
  resolved,
  order,
  orderId,
  onAllocationSuccess,
  showSelection = false,
  selectionChecked = false,
  selectionDisabled = false,
  onSelectionChange,
  isRefreshing = false,
}: OrderItemRowProps) {
  const { item, stock, allocatedQty, imsQty, imsDate, status, index } =
    resolved;

  const isLoading = status.kind === "loading";
  const isOrderApproved = order.status === "Approved";
  const invoiceRequired = order.invoicing?.invoiceRequired !== false;
  const { toast } = useToast();
  const { user, role } = useAuth();

  const name = getItemName(item);
  const bcn = stock?.bcn || name.split(" - ")[0] || name;
  const unit = item.type === "Fabric" ? "Mtr" : "PCS";
  const requiredQty = getItemQty(item);
  const [isRegeneratingAllocation, setIsRegeneratingAllocation] = React.useState(false);

  // True when the order document's allocation field shows this item is allocated,
  // even if the reservedQty subcollection is out of sync (causing status.kind to be wrong).
  const isItemAllocatedOnOrder = React.useMemo(() => {
    const itemAny = item as any;
    const allocationStatus = String(itemAny?.allocation?.status || "").toUpperCase();
    const itemStatus = String(itemAny?.status || "").toLowerCase();
    const lots: any[] = Array.isArray(itemAny?.allocation?.lots) ? itemAny.allocation.lots : [];
    const lengths: any[] = Array.isArray(itemAny?.allocation?.lengths) ? itemAny.allocation.lengths : [];
    const lotsAllocated = lots.reduce((s: number, l: any) => s + Number(l?.allocatedQty || 0), 0);
    const lengthsAllocated = lengths.reduce((s: number, l: any) => s + Number(l?.allocatedQty || 0), 0);
    return (
      allocationStatus === "ALLOCATED" ||
      allocationStatus === "PARTIAL" ||
      itemStatus === "allocated" ||
      Number(itemAny?.allocation?.allocatedQty) > 0 ||
      lotsAllocated > 0 ||
      lengthsAllocated > 0
    );
  }, [item]);

  const handleRegenerateAllocation = React.useCallback(async () => {
    if (!user?.id) return;
    setIsRegeneratingAllocation(true);
    try {
      const result = await regenerateInvoiceAllocationAction({
        orderId,
        lineId: String((item as any)?.lineId || "").trim() || undefined,
        bcn,
        itemName: name,
        requiredQty,
        allocatedQty,
        actor: { id: user.id, name: user.name || "Admin" },
      });
      if (!result.success) {
        toast({ variant: "destructive", title: "Regenerate failed", description: result.message });
        return;
      }
      toast({ title: "Allocation regenerated", description: result.message });
      onAllocationSuccess(bcn);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Regenerate failed", description: error?.message || "Failed to regenerate allocation." });
    } finally {
      setIsRegeneratingAllocation(false);
    }
  }, [allocatedQty, bcn, item, name, onAllocationSuccess, orderId, requiredQty, toast, user]);

  // Check if this item can be allocated
  const canAllocate = React.useMemo(() => {
    return (
      isOrderApproved &&
      stock &&
      status.kind !== "invoiced" &&
      status.kind !== "allocated" &&
      allocatedQty < requiredQty
    );
  }, [isOrderApproved, stock, status.kind, allocatedQty, requiredQty]);

  return (
    <TableRow
      className={cn(
        "group hover:bg-muted/30 transition-colors",
        isRefreshing && "bg-blue-50/50"
      )}
    >
      {/* Selection Checkbox */}
      {showSelection && (
        <TableCell className="w-10">
          <Checkbox
            checked={selectionChecked}
            disabled={selectionDisabled || isLoading}
            onCheckedChange={(checked) =>
              onSelectionChange?.(Boolean(checked))
            }
            aria-label={`Select ${name}`}
          />
        </TableCell>
      )}

      {/* Index */}
      <TableCell className="text-muted-foreground text-xs w-8 font-medium">
        {index + 1}
      </TableCell>

      {/* BCN / Item Name */}
      <TableCell>
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm font-semibold truncate">
              {bcn}
            </p>
            {stock && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                asChild
              >
                <Link
                  href={`/dashboard/inventory/${stock.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
            )}
          </div>
          {stock?.name && (
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
              {stock.name}
            </p>
          )}
          {stock?.category && (
            <Badge variant="outline" className="text-[10px] h-4 mt-1">
              {stock.category}
            </Badge>
          )}
        </div>
      </TableCell>

      {/* Supplier Code */}
      <TableCell className="text-sm">
        {isLoading ? (
          <Skeleton className="h-4 w-16" />
        ) : stock?.supplierCollectionCode ? (
          <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
            {stock.supplierCollectionCode}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>

      {/* Required Qty */}
      <TableCell>
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-sm font-medium">
            {requiredQty.toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      </TableCell>

      {/* CRM Stock */}
      <TableCell>
        {isLoading ? (
          <Skeleton className="h-4 w-12" />
        ) : stock?.availableQty != null ? (
          <div className="space-y-0.5">
            <span
              className={cn(
                "font-mono text-sm font-semibold",
                stock.availableQty >= requiredQty
                  ? "text-green-600"
                  : stock.availableQty > 0
                  ? "text-amber-600"
                  : "text-red-600"
              )}
            >
              {stock.availableQty.toFixed(2)}
            </span>
            {stock.reservedQty > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Reserved: {stock.reservedQty.toFixed(2)}
              </p>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">N/A</span>
        )}
      </TableCell>

      {/* IMS Stock */}
      <TableCell>
        {isLoading ? (
          <Skeleton className="h-4 w-12" />
        ) : imsQty != null ? (
          <div className="space-y-0.5">
            <span
              className={cn(
                "font-mono text-sm font-semibold",
                imsQty >= requiredQty
                  ? "text-green-600"
                  : imsQty > 0
                  ? "text-amber-600"
                  : "text-red-600"
              )}
            >
              {imsQty.toFixed(2)}
              <span className="text-xs font-normal text-muted-foreground ml-1">
                {unit}
              </span>
            </span>
            {imsDate && (
              <p className="text-[10px] text-muted-foreground">{imsDate}</p>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center rounded border border-dashed border-muted-foreground/30 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Not in IMS
          </span>
        )}
      </TableCell>

      {/* Allocated Qty / Action */}
      <TableCell>
        {isLoading || isRefreshing ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            {isRefreshing && (
              <span className="text-xs text-muted-foreground">
                Updating...
              </span>
            )}
          </div>
        ) : allocatedQty > 0 ? (
          <div className="space-y-0.5">
            <span className="font-mono text-sm font-semibold text-emerald-600">
              {allocatedQty.toFixed(2)}
            </span>
            <p className="text-[10px] text-muted-foreground">
              {((allocatedQty / requiredQty) * 100).toFixed(0)}% allocated
            </p>
          </div>
        ) : canAllocate ? (
          <AllocateDialog
            item={item}
            stock={stock}
            orderId={orderId}
            onAllocationSuccess={onAllocationSuccess}
            invoiceRequired={invoiceRequired}
          />
        ) : (
          <Badge
            variant={isOrderApproved ? "outline" : "secondary"}
            className="text-xs"
          >
            {order.status || "Pending"}
          </Badge>
        )}
      </TableCell>

      {/* Status */}
      <TableCell>
        {role === "admin" && invoiceRequired && status.kind !== "invoiced" && (status.kind === "allocated" || isItemAllocatedOnOrder) ? (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={status} invoiceRequired={invoiceRequired} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => void handleRegenerateAllocation()}
              disabled={isRegeneratingAllocation || isLoading || isRefreshing}
              title="Regenerate Allocation — resend for invoice"
              aria-label="Regenerate Allocation"
            >
              {isRegeneratingAllocation ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </div>
        ) : (
          <StatusBadge status={status} invoiceRequired={invoiceRequired} />
        )}
      </TableCell>
    </TableRow>
  );
}
export default React.memo(OrderItemRow);