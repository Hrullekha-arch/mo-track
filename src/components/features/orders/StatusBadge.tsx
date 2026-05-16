"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { ItemStatus } from "@/types/order-items";
import {
  CheckCheck,
  Clock,
  CheckCircle2,
  Package,
  AlertTriangle,
  Loader2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: ItemStatus;
  invoiceRequired: boolean;
  className?: string;
}

export default function StatusBadge({
  status,
  invoiceRequired,
  className,
}: StatusBadgeProps) {
  switch (status.kind) {
    case "loading":
      return (
        <div className={cn("flex items-center gap-1.5", className)}>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      );

    case "invalid":
      return (
        <Badge
          variant="destructive"
          className={cn("gap-1.5 text-xs", className)}
        >
          <XCircle className="h-3 w-3" />
          Invalid
        </Badge>
      );

    case "invoiced":
      return (
        <Badge
          className={cn(
            "bg-emerald-600 hover:bg-emerald-700 gap-1.5 text-xs",
            className
          )}
        >
          <CheckCheck className="h-3 w-3" />
          <span className="font-medium">Invoice Generated</span>
          {status.tallyNo && (
            <span className="opacity-80 font-normal">
              · {status.tallyNo}
            </span>
          )}
        </Badge>
      );

    case "allocated":
      if (invoiceRequired) {
        return (
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5 text-xs border-amber-300 bg-amber-50 text-amber-700",
              className
            )}
          >
            <Clock className="h-3 w-3" />
            <span className="font-medium">Pending Invoice</span>
          </Badge>
        );
      } else {
        return (
          <Badge
            className={cn(
              "bg-blue-600 hover:bg-blue-700 gap-1.5 text-xs",
              className
            )}
          >
            <CheckCircle2 className="h-3 w-3" />
            <span className="font-medium">Ready for Delivery</span>
          </Badge>
        );
      }

    case "in_stock":
      return (
        <Badge
          className={cn(
            "bg-blue-600 hover:bg-blue-700 gap-1.5 text-xs",
            className
          )}
        >
          <Package className="h-3 w-3" />
          <span className="font-medium">In Stock</span>
        </Badge>
      );

    case "pr_created":
      return (
        <Badge
          variant="outline"
          className={cn(
            "gap-1.5 text-xs border-purple-300 bg-purple-50 text-purple-700",
            className
          )}
        >
          <Package className="h-3 w-3" />
          <span className="font-medium">PR Created</span>
        </Badge>
      );

    case "po_generated":
      return (
        <Badge
          variant="outline"
          className={cn(
            "gap-1.5 text-xs border-indigo-300 bg-indigo-50 text-indigo-700",
            className
          )}
        >
          <Package className="h-3 w-3" />
          <span className="font-medium">PO: {status.poNumber}</span>
        </Badge>
      );

    case "pending_po":
      return (
        <Badge
          variant="destructive"
          className={cn("gap-1.5 text-xs", className)}
        >
          <AlertTriangle className="h-3 w-3" />
          <span className="font-medium">Pending PO</span>
        </Badge>
      );

    default:
      return (
        <Badge variant="secondary" className={cn("text-xs", className)}>
          Unknown
        </Badge>
      );
  }
}