"use client";

import * as React from "react";
import { Order } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  User,
  Phone,
  MapPin,
  Tag,
  Calendar,
  CheckCircle2,
  ShoppingBag,
  Mail,
  Building2,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getNormalizedOrderMilestones } from "@/lib/order-workflow";

interface CustomerInfoCardProps {
  order: Order;
  normalizedMilestones: ReturnType<typeof getNormalizedOrderMilestones>;
  className?: string;
}

interface InfoChipProps {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  className?: string;
  valueClassName?: string;
}

function InfoChip({
  icon: Icon,
  label,
  value,
  className,
  valueClassName,
}: InfoChipProps) {
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "text-sm font-medium truncate",
            valueClassName
          )}
          title={typeof value === "string" ? value : undefined}
        >
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

export default function CustomerInfoCard({
  order,
  normalizedMilestones,
  className,
}: CustomerInfoCardProps) {
  const currentStatus = React.useMemo(() => {
    const completed = normalizedMilestones
      .slice()
      .reverse()
      .find((m) => m.completed);
    return completed?.name || "Order Received";
  }, [normalizedMilestones]);

  const formattedDate = React.useMemo(() => {
    try {
      const date = new Date(order.createdAt);
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  }, [order.createdAt]);

  const totalAmount = React.useMemo(() => {
    if (typeof order.totalAmount === "number") {
      return `₹${order.totalAmount.toLocaleString("en-IN")}`;
    }
    return "—";
  }, [order.totalAmount]);

  const customerSnapshot = order.customerSnapshot || {};

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3 border-b bg-muted/30">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4 text-primary" />
          Customer & Order Information
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {/* Customer Section */}
        <div className="space-y-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoChip
              icon={User}
              label="Customer Name"
              value={
                order.customerName ||
                customerSnapshot.name ||
                "Unknown Customer"
              }
              valueClassName="font-semibold"
            />
            <InfoChip
              icon={Phone}
              label="Phone Number"
              value={order.customerPhone || customerSnapshot.phone}
            />
          </div>

          {(order.customerEmail || customerSnapshot.email) && (
            <InfoChip
              icon={Mail}
              label="Email Address"
              value={order.customerEmail || customerSnapshot.email}
              className="col-span-2"
            />
          )}

          <InfoChip
            icon={MapPin}
            label="Delivery Address"
            value={order.customerAddress || customerSnapshot.address}
            className="col-span-2"
          />
        </div>

        <Separator className="my-4" />

        {/* Order Details Section */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <InfoChip
              icon={Tag}
              label="CRM Order No"
              value={order.crmOrderNo || order.dealId}
              valueClassName="font-mono text-xs"
            />
            <InfoChip
              icon={ShoppingBag}
              label="Order Type"
              value={
                order.orderType
                  ?.replace("+", " + ")
                  .split(" ")
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(" ") || "Standard"
              }
            />
            <InfoChip
              icon={Tag}
              label="Salesperson"
              value={order.salesPerson || order.assignedSalesman?.name}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <InfoChip
              icon={Calendar}
              label="Order Date"
              value={formattedDate}
            />
            <InfoChip
              icon={CheckCircle2}
              label="Current Status"
              value={currentStatus}
              valueClassName={cn(
                currentStatus.toLowerCase().includes("complete")
                  ? "text-green-600 font-semibold"
                  : currentStatus.toLowerCase().includes("pending")
                  ? "text-amber-600 font-semibold"
                  : "text-blue-600 font-semibold"
              )}
            />
            {order.totalAmount && (
              <InfoChip
                icon={CreditCard}
                label="Total Amount"
                value={totalAmount}
                valueClassName="font-semibold text-primary"
              />
            )}
          </div>

          {/* Payment & Delivery Info */}
          {(order.paymentMethod || order.deliveryDate) && (
            <>
              <Separator className="my-4" />
              <div className="grid grid-cols-2 gap-4">
                {order.paymentMethod && (
                  <InfoChip
                    icon={CreditCard}
                    label="Payment Method"
                    value={order.paymentMethod}
                  />
                )}
                {order.deliveryDate && (
                  <InfoChip
                    icon={Calendar}
                    label="Expected Delivery"
                    value={
                      typeof order.deliveryDate === "string"
                        ? new Date(order.deliveryDate).toLocaleDateString(
                            "en-IN",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            }
                          )
                        : "—"
                    }
                  />
                )}
              </div>
            </>
          )}

          {/* Store/Location Info */}
          {(order.storeLocation || order.representativeId) && (
            <>
              <Separator className="my-4" />
              <div className="grid grid-cols-2 gap-4">
                {order.storeLocation && (
                  <InfoChip
                    icon={Building2}
                    label="Store Location"
                    value={order.storeLocation}
                  />
                )}
                {order.representativeId && (
                  <InfoChip
                    icon={User}
                    label="Representative ID"
                    value={order.representativeId}
                    valueClassName="font-mono text-xs"
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Special Instructions */}
        {order.specialInstructions && (
          <>
            <Separator className="my-4" />
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-semibold text-amber-900 mb-1">
                Special Instructions
              </p>
              <p className="text-sm text-amber-800 whitespace-pre-wrap">
                {order.specialInstructions}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}