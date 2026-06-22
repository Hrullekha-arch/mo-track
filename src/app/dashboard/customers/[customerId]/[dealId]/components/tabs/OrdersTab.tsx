"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShoppingCart, ArrowRight, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { DealOrder, Order, Quotation } from "@/lib/types";
import { getQuotationsForDeal } from "../../actions";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { format } from "date-fns";
import { parseDate } from "../../utils/dateUtils";

interface OrdersTabProps {
  customerId: string;
  dealId: string;
}

export default function OrdersTab({ customerId, dealId }: OrdersTabProps) {
  const [orders, setOrders] = useState<DealOrder[]>([]);
  const [approvedQuotations, setApprovedQuotations] = useState<Quotation[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<DealOrder | null>(null);
  const [fullOrder, setFullOrder] = useState<Order | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { role, user } = useAuth();
  const router = useRouter();
  const normalizeAccess = (value: unknown) =>
    String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");
  const roleKey = normalizeAccess(role || user?.role);
  const designationKey = normalizeAccess(user?.designation);
  const isSalesManager =
    ["sm", "salesmanager", "headsalesmanager"].includes(roleKey) ||
    ["sm", "salesmanager", "headsalesmanager"].includes(designationKey);

  useEffect(() => {
    setLoading(true);
    const q = collection(
      db,
      "customers",
      customerId,
      "deals",
      dealId,
      "orders"
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const ordersData = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as DealOrder)
        );
        setOrders(
          ordersData.sort(
            (a, b) =>
              new Date(b.orderDate || 0).getTime() -
              new Date(a.orderDate || 0).getTime()
          )
        );
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching orders:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not load orders.",
        });
        setLoading(false);
      }
    );
    getQuotationsForDeal(customerId, dealId)
      .then((quotations) =>
        setApprovedQuotations(
          quotations.filter((quotation) => quotation.status === "Approved")
        )
      )
      .catch((error) => {
        console.error("Error fetching approved quotations:", error);
      });
    return () => unsubscribe();
  }, [customerId, dealId, toast]);

  useEffect(() => {
    if (!selectedOrder) {
      setFullOrder(null);
      setDetailsError("");
      setDetailsLoading(false);
      return;
    }

    let cancelled = false;
    const orderKey = getOrderKey(selectedOrder);
    if (!orderKey) {
      setDetailsError("Order reference is missing.");
      return;
    }

    setDetailsLoading(true);
    setDetailsError("");
    getDoc(doc(db, "orders", orderKey))
      .then((snapshot) => {
        if (cancelled) return;
        if (!snapshot.exists()) {
          setFullOrder(null);
          setDetailsError(`Full details for order ${orderKey} were not found.`);
          return;
        }
        setFullOrder({ id: snapshot.id, ...snapshot.data() } as Order);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Error loading full order details:", error);
        setDetailsError("Could not load the complete order details.");
      })
      .finally(() => {
        if (!cancelled) setDetailsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedOrder]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">Orders Details</CardTitle>
          {!isSalesManager && approvedQuotations.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {approvedQuotations.map((quotation) => (
                <Button
                  key={quotation.id}
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    router.push(
                      `/dashboard/invoice/new?customerId=${customerId}&dealId=${dealId}&quotationId=${quotation.id}`
                    )
                  }
                >
                  <ShoppingCart className="h-4 w-4" />
                  Place Order #{quotation.quotationNo}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {orders.length > 0 ? (
          <div className="space-y-3">
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Order No</TableHead>
                    <TableHead>Remark</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order, i) => (
                    <TableRow
                      key={order.id}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer hover:bg-muted/60"
                      onClick={() => setSelectedOrder(order)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedOrder(order);
                        }
                      }}
                    >
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        {order.orderNo}
                      </TableCell>
                      <TableCell>{order.remark || "-"}</TableCell>
                      <TableCell>
                        {formatOrderDate(order.orderDate)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{order.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-between gap-2">
                          <span>{order.createdBy}</span>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden space-y-3">
              {orders.map((order, i) => (
                <Card
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => setSelectedOrder(order)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedOrder(order);
                    }
                  }}
                >
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">
                          {order.orderNo}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatOrderDate(order.orderDate)}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {order.status}
                      </Badge>
                    </div>
                    <Separator />
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Remark:</span>
                        <span>{order.remark || "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Created By:
                        </span>
                        <span>{order.createdBy}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <ShoppingCart className="mx-auto h-12 w-12 mb-2 opacity-50" />
            <p>No orders have been generated for this deal yet.</p>
          </div>
        )}
      </CardContent>
      <Dialog
        open={!!selectedOrder}
        onOpenChange={(open) => {
          if (!open) setSelectedOrder(null);
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader>
            <div className="border-b px-6 pb-4 pt-6">
              <DialogTitle>Order Details</DialogTitle>
              <DialogDescription>
                Complete details for order {selectedOrder ? getOrderKey(selectedOrder) : "-"}.
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {detailsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : detailsError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {detailsError}
              </div>
            ) : selectedOrder ? (
              <FullOrderDetails dealOrder={selectedOrder} order={fullOrder} />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function getOrderKey(order: DealOrder) {
  return String(order.orderNo || order.orderId || order.id || "").trim();
}

function formatOrderDate(value: unknown) {
  if (!value) return "-";
  try {
    return format(parseDate(String(value)), "dd/MM/yyyy");
  } catch {
    return "-";
  }
}

function formatCurrency(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function FullOrderDetails({
  dealOrder,
  order,
}: {
  dealOrder: DealOrder;
  order: Order | null;
}) {
  const normalItems =
    order?.sections?.NORMAL?.items ||
    order?.items ||
    order?.fabricDetails ||
    dealOrder.items ||
    [];
  const vasItems =
    order?.sections?.VAS?.items ||
    order?.vasDetails ||
    [];
  const milestones = order?.milestones || order?.workflow?.milestones || [];
  const summary = order?.overallSummary || dealOrder.overallSummary;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <OrderDetail label="Order No" value={order?.crmOrderNo || getOrderKey(dealOrder)} />
        <OrderDetail label="Status" value={order?.status || dealOrder.status || "Created"} />
        <OrderDetail label="Order Date" value={formatOrderDate(order?.createdAt || dealOrder.orderDate)} />
        <OrderDetail
          label="Created By"
          value={order?.createdBy?.name || dealOrder.createdBy || "-"}
        />
        <OrderDetail label="Customer" value={order?.customerName || dealOrder.remark || "-"} />
        <OrderDetail label="Phone" value={order?.customerPhone || "-"} />
        <OrderDetail label="Sales Person" value={order?.salesPerson || "-"} />
        <OrderDetail label="Store" value={order?.storeName || "-"} />
        <div className="sm:col-span-2 lg:col-span-4">
          <OrderDetail label="Delivery Address" value={order?.customerAddress || "-"} />
        </div>
      </section>

      <section className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">Order Items ({normalItems.length})</h3>
        </div>
        {normalItems.length > 0 ? (
          <div className="divide-y">
            {normalItems.map((item: any, index: number) => (
              <div
                key={item.id || item.lineId || `${item.bcn || item.collectionBrand}-${index}`}
                className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-4"
              >
                <OrderDetail
                  label="BCN / Item"
                  value={item.bcn || item.collectionBrand || item.itemName || item.salesDescription || "-"}
                />
                <OrderDetail label="Serial No" value={item.serialNo || "-"} />
                <OrderDetail label="Quantity" value={`${item.quantity ?? item.qty ?? "-"} ${item.unit || ""}`} />
                <OrderDetail label="Amount" value={formatCurrency(item.amount ?? item.total ?? item.totalAmount)} />
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">No order items found.</p>
        )}
      </section>

      <section className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">Value Added Services ({vasItems.length})</h3>
        </div>
        {vasItems.length > 0 ? (
          <div className="divide-y">
            {vasItems.map((item: any, index: number) => (
              <div
                key={item.id || `${item.vasName || item.description}-${index}`}
                className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-4"
              >
                <OrderDetail label="Service" value={item.vasName || item.description || item.itemName || "-"} />
                <OrderDetail label="Room" value={item.room || item.roomName || "-"} />
                <OrderDetail label="Quantity" value={`${item.quantity ?? item.qty ?? "-"} ${item.unit || ""}`} />
                <OrderDetail label="Amount" value={formatCurrency(item.amount ?? item.total ?? item.totalAmount)} />
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">No VAS items found.</p>
        )}
      </section>

      <section className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-3">
        <OrderDetail label="Goods Value" value={formatCurrency(summary?.goodsTotal)} />
        <OrderDetail label="VAS Value" value={formatCurrency(summary?.vasTotal)} />
        <OrderDetail
          label="Total Order Value"
          value={formatCurrency(summary?.grandTotal ?? order?.totalAmount)}
          emphasized
        />
      </section>

      <section className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">Order Progress ({milestones.length})</h3>
        </div>
        {milestones.length > 0 ? (
          <div className="divide-y">
            {milestones.map((milestone: any, index: number) => (
              <div key={milestone.id || milestone.name || index} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="font-medium">{milestone.name || milestone.label || milestone.stepName || `Step ${index + 1}`}</span>
                <Badge variant={milestone.completed || milestone.isCompleted ? "default" : "outline"}>
                  {milestone.completed || milestone.isCompleted ? "Completed" : "Pending"}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">No milestone details found.</p>
        )}
      </section>
    </div>
  );
}

function OrderDetail({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={emphasized ? "mt-1 text-lg font-bold" : "mt-1 font-medium"}>
        {value}
      </p>
    </div>
  );
}
