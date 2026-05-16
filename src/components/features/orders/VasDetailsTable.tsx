"use client";

import * as React from "react";
import { Order } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Package, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface VasDetailsTableProps {
  order: Order;
  className?: string;
}

interface VasItem {
  description?: string;
  vasName?: string;
  itemName?: string;
  qty?: number;
  quantity?: number;
  rate?: number;
  gst?: number;
  gstPercent?: number;
  hsn?: string;
  hsnCode?: string;
  unit?: string;
  roomName?: string;
  room?: string;
  category?: string;
}

const parseNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export default function VasDetailsTable({
  order,
  className,
}: VasDetailsTableProps) {
  const vasItems = React.useMemo(() => {
    // Try sections.VAS.items first (new structure)
    if (order.sections?.VAS?.items?.length) {
      return order.sections.VAS.items as VasItem[];
    }

    // Fallback to vasDetails (legacy structure)
    if (order.vasDetails?.length) {
      return (order.vasDetails as any[]).map((v) => ({
        description: v.vasName || v.itemName,
        vasName: v.vasName,
        qty: Number(v.quantity) || 0,
        rate: Number(v.rate) || 0,
        gst: Number(v.gstPercent) || 0,
        hsn: v.hsnCode || "",
        unit: v.unit || "PCS",
        room: v.room || "",
      }));
    }

    return [];
  }, [order]);

  const totals = React.useMemo(() => {
    let subtotal = 0;
    let gstAmount = 0;
    let total = 0;

    vasItems.forEach((item) => {
      const qty = parseNumber(item.qty ?? item.quantity);
      const rate = parseNumber(item.rate);
      const gstPercent = parseNumber(item.gst ?? item.gstPercent);

      const itemSubtotal = qty * rate;
      const itemGst = (itemSubtotal * gstPercent) / 100;
      const itemTotal = itemSubtotal + itemGst;

      subtotal += itemSubtotal;
      gstAmount += itemGst;
      total += itemTotal;
    });

    return { subtotal, gstAmount, total };
  }, [vasItems]);

  // Don't render if no VAS items
  if (!vasItems.length) {
    return null;
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <div>
              <CardTitle className="text-base">
                Value Added Services (VAS)
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {vasItems.length} service{vasItems.length !== 1 ? "s" : ""}{" "}
                added to this order
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">
            {vasItems.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-t overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-muted/20">
                <TableHead className="w-8">#</TableHead>
                <TableHead className="min-w-[200px]">
                  Service Description
                </TableHead>
                <TableHead className="text-center">Room</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-center">GST %</TableHead>
                <TableHead className="text-right font-semibold">
                  Amount
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vasItems.map((item, index) => {
                const qty = parseNumber(item.qty ?? item.quantity);
                const rate = parseNumber(item.rate);
                const gstPercent = parseNumber(item.gst ?? item.gstPercent);
                const subtotal = qty * rate;
                const gstAmount = (subtotal * gstPercent) / 100;
                const total = subtotal + gstAmount;

                const description =
                  item.description ||
                  item.vasName ||
                  item.itemName ||
                  "Unnamed Service";
                const unit = item.unit || "PCS";
                const room = item.room || item.roomName || "";
                const hsn = item.hsn || item.hsnCode || "";

                return (
                  <TableRow
                    key={`${description}-${index}`}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    {/* Index */}
                    <TableCell className="text-muted-foreground text-xs font-medium">
                      {index + 1}
                    </TableCell>

                    {/* Description */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-foreground">
                          {description}
                        </p>
                        {hsn && (
                          <p className="text-xs text-muted-foreground">
                            HSN: {hsn}
                          </p>
                        )}
                        {item.category && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 mt-1"
                          >
                            {item.category}
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Room */}
                    <TableCell className="text-center">
                      {room ? (
                        <Badge variant="secondary" className="text-xs">
                          {room}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Quantity */}
                    <TableCell className="text-right">
                      <span className="font-mono text-sm">
                        {qty.toFixed(0)}{" "}
                        <span className="text-xs text-muted-foreground">
                          {unit}
                        </span>
                      </span>
                    </TableCell>

                    {/* Rate */}
                    <TableCell className="text-right">
                      <span className="font-mono text-sm">
                        {formatCurrency(rate)}
                      </span>
                    </TableCell>

                    {/* GST % */}
                    <TableCell className="text-center">
                      <span className="text-sm font-medium">
                        {gstPercent.toFixed(1)}%
                      </span>
                    </TableCell>

                    {/* Total Amount */}
                    <TableCell className="text-right">
                      <div className="space-y-0.5">
                        <p className="font-mono text-sm font-semibold text-foreground">
                          {formatCurrency(total)}
                        </p>
                        {gstAmount > 0 && (
                          <p className="text-xs text-muted-foreground">
                            +{formatCurrency(gstAmount)} GST
                          </p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Totals Row */}
              <TableRow className="bg-muted/30 hover:bg-muted/40 font-semibold border-t-2">
                <TableCell colSpan={6} className="text-right">
                  <span className="text-sm font-semibold">Total VAS Amount</span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="space-y-1">
                    <p className="font-mono text-base font-bold text-primary">
                      {formatCurrency(totals.total)}
                    </p>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>Subtotal: {formatCurrency(totals.subtotal)}</p>
                      <p>GST: {formatCurrency(totals.gstAmount)}</p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* Info Note */}
        <div className="px-4 py-3 bg-blue-50 border-t border-blue-200">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-800">
              VAS charges will be added to the final invoice. All amounts are
              inclusive of applicable GST.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}