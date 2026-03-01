"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Timestamp,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Customer, Deal, DealVisit, InboundRequest, Milestone, Order, PurchaseRequest } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { differenceInCalendarDays, format, formatDistanceToNow, isToday } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle,
  Clock3,
  FileSignature,
  ListOrdered,
  Search,
  ShoppingCart,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MilestoneProgress } from "@/components/features/order-management/MilestoneProgress";
import { Progress } from "@/components/ui/progress";
import { getNormalizedOrderMilestones } from "@/lib/order-workflow";

interface EnrichedVisit extends DealVisit {
  customerName: string;
  dealName: string;
  customerPhone: string;
}

type OrderRisk = "critical" | "watch" | "stable";

interface OrderMonitorRow {
  order: Order;
  completedMilestones: number;
  totalMilestones: number;
  progress: number;
  currentStep: string;
  nextStep: string;
  ageDays: number;
  risk: OrderRisk;
}

type OrderMovementType = "order_created" | "order_approved" | "material_received";

interface OrderMovementEvent {
  id: string;
  type: OrderMovementType;
  title: string;
  description: string;
  suggestedNext: string;
  timestamp: Date;
  link: string;
}

interface DetailTimelineItem {
  id: string;
  title: string;
  source: string;
  by?: string;
  note?: string;
  at?: Date | null;
}

interface OrderSearchDetails {
  order: Order;
  customer: Customer | null;
  deal: Deal | null;
  quotations: any[];
  purchaseRequests: PurchaseRequest[];
  inbounds: InboundRequest[];
  approvedStockItems: any[];
  o2d: any | null;
  timeline: DetailTimelineItem[];
}

interface CrmOrderDetailsDialogData {
  order: Order;
  purchaseRequests: PurchaseRequest[];
  inbounds: InboundRequest[];
  approvedStockItems: any[];
}

interface ProcurementDetailRow {
  itemName: string;
  qtyLabel: string;
  stockState: "In Stock" | "Need PR";
  prStatus: string;
  receiveStatus: "In Stock" | "Received" | "Pending Receive" | "PR Not Created";
  expectedReceiveAt: Date | null;
  expectedReceiveLabel: string;
  hasPr: boolean;
  isInStock: boolean;
  isReceived: boolean;
}

const PURCHASE_PENDING_STATUSES = new Set(["pending approval", "approved"]);
const PURCHASE_INBOUND_STATUSES = new Set(["po generated"]);
const PURCHASE_COMPLETED_STATUSES = new Set(["completed", "received"]);

const toDateSafe = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const date = (value as { toDate?: () => Date }).toDate?.();
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
};

const normalizeStatus = (value?: string) => String(value || "").trim().toLowerCase();

const formatDateTimeLabel = (value: unknown) => {
  const date = toDateSafe(value);
  if (!date) return "N/A";
  return format(date, "dd MMM yyyy, hh:mm a");
};

const timelineSort = (a: DetailTimelineItem, b: DetailTimelineItem) =>
  (b.at?.getTime() || 0) - (a.at?.getTime() || 0);

const parseQtySafe = (value: unknown) => {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const matchTextLoose = (left: unknown, right: unknown) => {
  const a = normalizeStatus(String(left || ""));
  const b = normalizeStatus(String(right || ""));
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
};

const PURCHASE_STEP_LABELS: Record<number, string> = {
  1: "Verify Authorization",
  2: "Payment Verification",
  3: "Vendor Type",
  4: "Place Order",
};

const PO_STEP_LABELS: Record<number, string> = {
  1: "PO Confirmation",
  2: "Delivery Follow Up",
  3: "Receiving And Sent To Location",
};

const INBOUND_STEP_LABELS: Record<number, string> = {
  1: "QNQ as per PO",
  2: "Weight",
  3: "Barcode",
  4: "Stock Update in Tally/CRM/Excel",
  5: "Assign Rack/Location",
};

const DetailField = ({ label, value }: { label: string; value: unknown }) => (
  <div className="space-y-1">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium break-words">{String(value ?? "N/A") || "N/A"}</p>
  </div>
);

const deriveOrderMonitor = (order: Order): OrderMonitorRow => {
  const milestones = getNormalizedOrderMilestones(order);
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter((step) => step.completed).length;
  const currentStep =
    [...milestones].reverse().find((step) => step.completed)?.name || "Order Created";
  const progress = totalMilestones ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
  const nextStep =
    milestones.find((step) => !step.completed)?.name ||
    (totalMilestones ? "Completed" : "Milestone Planning Pending");
  const createdAt = toDateSafe(order.createdAt) || new Date();
  const ageDays = Math.max(0, differenceInCalendarDays(new Date(), createdAt));

  let risk: OrderRisk = "stable";
  if (progress < 100 && (ageDays >= 14 || (ageDays >= 10 && progress < 60))) {
    risk = "critical";
  } else if (progress < 100 && (ageDays >= 7 || progress < 75)) {
    risk = "watch";
  }

  return {
    order,
    completedMilestones,
    totalMilestones,
    progress,
    currentStep,
    nextStep,
    ageDays,
    risk,
  };
};

const riskBadgeClassMap: Record<OrderRisk, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  watch: "border-amber-200 bg-amber-50 text-amber-700",
  stable: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const riskContainerClassMap: Record<OrderRisk, string> = {
  critical: "border-red-200 bg-red-50/40",
  watch: "border-amber-200 bg-amber-50/35",
  stable: "border-slate-200 bg-white",
};

const riskLabelMap: Record<OrderRisk, string> = {
  critical: "Critical",
  watch: "Watch",
  stable: "Stable",
};

const OrderUpdatesFeed = ({
  heightClassName = "h-[26rem]",
  assignedSalesmen = [],
}: {
  heightClassName?: string;
  assignedSalesmen?: string[];
}) => {
  const [updates, setUpdates] = useState<any[]>([]);
  const [orderMoments, setOrderMoments] = useState<DetailTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMoments, setLoadingMoments] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const notificationQuery = query(
      collection(db, "users", user.id, "notifications"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(notificationQuery, (snapshot) => {
      setUpdates(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (assignedSalesmen.length === 0) {
      setOrderMoments([]);
      setLoadingMoments(false);
      return;
    }

    setLoadingMoments(true);
    const ordersQuery = query(
      collection(db, "orders"),
      where("salesPerson", "in", assignedSalesmen),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const orderRows = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() } as Order));
        const moments: DetailTimelineItem[] = [];

        orderRows.forEach((orderItem) => {
          moments.push({
            id: `crm-moment-created-${orderItem.id}`,
            title: `Order #${orderItem.crmOrderNo || orderItem.id} created`,
            source: "Order",
            by: orderItem.createdBy?.name,
            note: orderItem.customerName,
            at: toDateSafe(orderItem.createdAt),
          });

          const latestCompletedMilestone = [...getNormalizedOrderMilestones(orderItem)]
            .reverse()
            .find((milestone) => milestone.completed);
          if (latestCompletedMilestone) {
            moments.push({
              id: `crm-moment-ms-${orderItem.id}-${latestCompletedMilestone.id}`,
              title: latestCompletedMilestone.name,
              source: "Order Milestone",
              by: latestCompletedMilestone.completedBy || undefined,
              note: `Order #${orderItem.crmOrderNo || orderItem.id}`,
              at: toDateSafe(latestCompletedMilestone.completedAt),
            });
          }

          if ((orderItem as any).approvedAt || normalizeStatus(orderItem.status) === "approved") {
            moments.push({
              id: `crm-moment-approved-${orderItem.id}`,
              title: `Order #${orderItem.crmOrderNo || orderItem.id} approved`,
              source: "Order",
              note: orderItem.customerName,
              at: toDateSafe((orderItem as any).approvedAt || orderItem.createdAt),
            });
          }
        });

        setOrderMoments(moments.sort(timelineSort).slice(0, 20));
        setLoadingMoments(false);
      },
      () => {
        setOrderMoments([]);
        setLoadingMoments(false);
      }
    );

    return () => unsubscribe();
  }, [assignedSalesmen]);

  const handleMarkAsRead = async (notificationId: string) => {
    if (!user) return;
    const notifRef = doc(db, "users", user.id, "notifications", notificationId);
    await updateDoc(notifRef, { read: true });
  };

  const filteredUpdates = useMemo(() => {
    if (!searchTerm) return updates;
    const normalizedSearch = searchTerm.toLowerCase();

    return updates.filter((update) => {
      const message = String(update.message || "").toLowerCase();
      const type = String(update.type || "").toLowerCase();
      return message.includes(normalizedSearch) || type.includes(normalizedSearch);
    });
  }, [updates, searchTerm]);

  const filteredMoments = useMemo(() => {
    if (!searchTerm) return orderMoments;
    const normalizedSearch = searchTerm.toLowerCase();
    return orderMoments.filter((momentItem) => {
      return (
        momentItem.title.toLowerCase().includes(normalizedSearch) ||
        String(momentItem.note || "")
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(momentItem.source || "")
          .toLowerCase()
          .includes(normalizedSearch)
      );
    });
  }, [orderMoments, searchTerm]);

  const unreadCount = useMemo(
    () => updates.reduce((count, item) => count + (item.read ? 0 : 1), 0),
    [updates]
  );

  const renderNotification = (notification: any) => {
    let title = "Update";
    let description = notification.message || "A new update has been posted.";
    let icon = <FileSignature className="h-4 w-4 text-slate-600" />;
    let cardClass = "border-slate-200 bg-white";
    const link = notification.link || "#";
    const createdAt = toDateSafe(notification.createdAt || notification.date);

    if (notification.type === "new_walkin") {
      title = "New Walk-in Customer";
      icon = <Activity className="h-4 w-4 text-blue-600" />;
      cardClass = "border-blue-200 bg-blue-50/40";
    } else if (notification.type === "order_approved") {
      title = "Order Approved";
      icon = <CheckCircle className="h-4 w-4 text-emerald-600" />;
      cardClass = "border-emerald-200 bg-emerald-50/40";
    }

    return (
      <Link
        href={link}
        key={notification.id}
        className="block"
        onClick={() => void handleMarkAsRead(notification.id)}
      >
        <div
          className={`rounded-xl border p-3 transition-colors hover:bg-muted/40 ${cardClass} ${
            notification.read ? "opacity-70" : ""
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-1">{icon}</div>
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
              <p className="text-xs text-muted-foreground">
                {createdAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : "Unknown time"}
              </p>
            </div>
            {!notification.read ? <Badge className="border-slate-900 bg-slate-900 text-white">New</Badge> : null}
          </div>
        </div>
      </Link>
    );
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>CRM Activity Feed</CardTitle>
            <CardDescription>Unread updates and movement alerts assigned to you.</CardDescription>
          </div>
          <div className="min-w-[8rem] rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-muted-foreground">Unread</p>
            <p className="text-2xl font-bold">{unreadCount}</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search updates by type or message..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="pl-8"
          />
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className={heightClassName}>
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Notifications
                </p>
                <Badge variant="outline">{filteredUpdates.length}</Badge>
              </div>
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)
              ) : filteredUpdates.length > 0 ? (
                filteredUpdates.map((update) => renderNotification(update))
              ) : (
                <p className="py-5 text-center text-sm text-muted-foreground">No recent notifications.</p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Order Moments
                </p>
                <Badge variant="outline">{filteredMoments.length}</Badge>
              </div>
              {loadingMoments ? (
                Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)
              ) : filteredMoments.length > 0 ? (
                filteredMoments.map((momentItem) => (
                  <div key={momentItem.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{momentItem.title}</p>
                      <Badge variant="secondary">{momentItem.source}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {momentItem.note ? `${momentItem.note} | ` : ""}
                      {momentItem.by ? `By ${momentItem.by} | ` : ""}
                      {momentItem.at ? formatDistanceToNow(momentItem.at, { addSuffix: true }) : "Unknown time"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-5 text-center text-sm text-muted-foreground">
                  No order movement moments yet.
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

const TodayVisits = ({ heightClassName = "h-[20rem]" }: { heightClassName?: string }) => {
  const [visits, setVisits] = useState<EnrichedVisit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const visitsQuery = query(collectionGroup(db, "visits"), where("status", "==", "approved"));
    const unsubscribe = onSnapshot(visitsQuery, async (snapshot) => {
      const allVisits = snapshot.docs.map((visitDoc) => ({
        visit: { ...visitDoc.data(), id: visitDoc.id } as DealVisit,
        pathParts: visitDoc.ref.path.split("/"),
      }));

      const todayVisits = allVisits.filter(({ visit }) => {
        const dueDate = toDateSafe(visit.dueDate);
        return !!dueDate && isToday(dueDate);
      });

      const customerCache = new Map<string, Customer>();

      const enrichedVisitsPromises = todayVisits.map(async ({ visit, pathParts }) => {
        const customerId = pathParts[1];
        const dealId = pathParts[3];

        let customer: Customer | null = customerCache.get(customerId) || null;
        if (!customer) {
          const customerSnap = await getDoc(doc(db, "customers", customerId));
          if (customerSnap.exists()) {
            customer = customerSnap.data() as Customer;
            customerCache.set(customerId, customer);
          }
        }

        const dealSnap = await getDoc(doc(db, "customers", customerId, "deals", dealId));
        const deal = dealSnap.exists() ? (dealSnap.data() as Deal) : null;

        return {
          ...visit,
          customerName: customer?.name || "Unknown",
          customerPhone: customer?.phone || customer?.mobileNo || "N/A",
          dealName: deal?.title || deal?.dealName || "N/A",
        } as EnrichedVisit;
      });

      const enrichedVisits = await Promise.all(enrichedVisitsPromises);
      setVisits(enrichedVisits);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const sortedVisits = useMemo(() => {
    return [...visits].sort((a, b) => {
      const timeA = toDateSafe(a.dueDate)?.getTime() || 0;
      const timeB = toDateSafe(b.dueDate)?.getTime() || 0;
      return timeA - timeB;
    });
  }, [visits]);

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Today&apos;s Visit Plan</CardTitle>
            <CardDescription>Approved customer visits scheduled for today.</CardDescription>
          </div>
          <div className="min-w-[8rem] rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-muted-foreground">Scheduled</p>
            <p className="text-2xl font-bold">{loading ? "..." : sortedVisits.length}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className={heightClassName}>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 w-full" />)
            ) : sortedVisits.length > 0 ? (
              sortedVisits.map((visit) => {
                const dueDate = toDateSafe(visit.dueDate);
                return (
                  <div key={visit.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">{visit.customerName}</p>
                        <p className="text-sm text-muted-foreground">{visit.dealName}</p>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {visit.typeOfVisit || "visit"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                        <Clock3 className="h-3 w-3" />
                        {dueDate ? format(dueDate, "h:mm a") : "Time N/A"}
                      </span>
                      <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                        <Calendar className="h-3 w-3" />
                        {dueDate ? format(dueDate, "dd MMM yyyy") : "Date N/A"}
                      </span>
                      <span>{visit.customerPhone}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No visits scheduled for today.
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

const AllOrdersAndUpdates = ({ assignedSalesmen }: { assignedSalesmen: string[] }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [detailsData, setDetailsData] = useState<CrmOrderDetailsDialogData | null>(null);

  useEffect(() => {
    if (assignedSalesmen.length === 0) {
      setLoading(false);
      setOrders([]);
      return;
    }

    const ordersQuery = query(
      collection(db, "orders"),
      where("salesPerson", "in", assignedSalesmen),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      setOrders(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() } as Order)));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [assignedSalesmen]);

  const openOrderDetails = async (orderItem: Order) => {
    setSelectedOrder(orderItem);
    setDetailsDialogOpen(true);
    setDetailsLoading(true);
    setDetailsError("");
    setDetailsData(null);

    const dealId = String(orderItem.dealId || "").trim();
    try {
      const purchasePromise = dealId
        ? getDocs(query(collection(db, "purchaseRequests"), where("dealId", "==", dealId), limit(80)))
        : Promise.resolve(null as any);
      const inboundPromise = dealId
        ? getDocs(query(collection(db, "inbounds"), where("dealId", "==", dealId), limit(80)))
        : Promise.resolve(null as any);
      const stockPromise = dealId
        ? getDocs(query(collection(db, "approvedStock"), where("dealId", "==", dealId), limit(200)))
        : Promise.resolve(null as any);

      const [purchaseSnap, inboundSnap, stockSnap] = await Promise.all([
        purchasePromise,
        inboundPromise,
        stockPromise,
      ]);

      const purchaseRequests =
        purchaseSnap && !purchaseSnap.empty
          ? purchaseSnap.docs.map((docItem: any) => ({ id: docItem.id, ...docItem.data() } as PurchaseRequest))
          : [];
      const inbounds =
        inboundSnap && !inboundSnap.empty
          ? inboundSnap.docs.map((docItem: any) => ({ id: docItem.id, ...docItem.data() } as InboundRequest))
          : [];
      const approvedStockItems =
        stockSnap && !stockSnap.empty
          ? stockSnap.docs.map((docItem: any) => ({ id: docItem.id, ...docItem.data() }))
          : [];

      setDetailsData({
        order: orderItem,
        purchaseRequests,
        inbounds,
        approvedStockItems,
      });
    } catch (error) {
      console.error("Failed to load CRM order detail dialog data:", error);
      setDetailsError("Unable to load order details right now.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const monitoredOrders = useMemo(() => orders.map((orderItem) => deriveOrderMonitor(orderItem)), [orders]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return monitoredOrders;
    }

    return monitoredOrders.filter((row) => {
      return (
        String(row.order.customerName || "")
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(row.order.crmOrderNo || "")
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(row.order.salesPerson || "")
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(row.order.dealId || "")
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(row.order.orderType || "")
          .toLowerCase()
          .includes(normalizedSearch) ||
        row.nextStep.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [monitoredOrders, searchTerm]);

  const sortedQueue = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      const riskWeight: Record<OrderRisk, number> = { critical: 3, watch: 2, stable: 1 };
      if (riskWeight[b.risk] !== riskWeight[a.risk]) {
        return riskWeight[b.risk] - riskWeight[a.risk];
      }
      if (a.progress !== b.progress) {
        return a.progress - b.progress;
      }
      return b.ageDays - a.ageDays;
    });
  }, [filteredOrders]);

  const kpis = useMemo(() => {
    const live = monitoredOrders.filter((row) => row.progress < 100).length;
    const critical = monitoredOrders.filter((row) => row.risk === "critical" && row.progress < 100).length;
    const watch = monitoredOrders.filter((row) => row.risk === "watch" && row.progress < 100).length;
    const avgProgress = monitoredOrders.length
      ? Math.round(monitoredOrders.reduce((acc, row) => acc + row.progress, 0) / monitoredOrders.length)
      : 0;

    return { live, critical, watch, avgProgress };
  }, [monitoredOrders]);

  const selectedMonitor = useMemo(
    () => (selectedOrder ? deriveOrderMonitor(selectedOrder) : null),
    [selectedOrder]
  );

  const purchaseRequests = detailsData?.purchaseRequests || [];
  const inbounds = detailsData?.inbounds || [];
  const stockItems = detailsData?.approvedStockItems || [];

  const poGeneratedCount = purchaseRequests.filter((requestItem) => {
    if (PURCHASE_COMPLETED_STATUSES.has(normalizeStatus(requestItem.status))) return true;
    if (PURCHASE_INBOUND_STATUSES.has(normalizeStatus(requestItem.status))) return true;
    if ((requestItem.poMilestones || []).some((milestone) => normalizeStatus(milestone.status) === "completed")) {
      return true;
    }
    return false;
  }).length;
  const receivedInboundCount = inbounds.filter((inboundItem) => {
    if (normalizeStatus(inboundItem.status) === "completed") return true;
    return (inboundItem.items || []).some((lineItem: any) => parseQtySafe(lineItem.receivedQty) > 0);
  }).length;

  const inStockCount = stockItems.filter((stockItem: any) =>
    normalizeStatus(stockItem.status).includes("in stock")
  ).length;
  const outStockCount = stockItems.filter((stockItem: any) =>
    normalizeStatus(stockItem.status).includes("out stock")
  ).length;
  const stockPendingCount = Math.max(0, stockItems.length - inStockCount - outStockCount);

  const purchaseStatusLabel = purchaseRequests.length
    ? Array.from(new Set(purchaseRequests.map((requestItem) => String(requestItem.status || "N/A"))))
        .slice(0, 3)
        .join(", ")
    : "No PR";

  const receiveStatusLabel = !inbounds.length
    ? "Not Received"
    : receivedInboundCount === inbounds.length
    ? "Received"
    : "Partially Received";

  const stockFlowLabel =
    inStockCount > 0
      ? "In Stock"
      : outStockCount > 0
      ? "Out Stock"
      : stockPendingCount > 0
      ? "PR Created"
      : "PR Pending";

  const orderFabricList = useMemo(() => {
    type OrderFabricListRow = {
      fabricName: string;
      qty: string;
      unit: string;
      status: string;
      type: string;
      poNumber?: string;
      expectedDeliveryDate?: string;
      source: "Order" | "PR";
    };

    const rows: OrderFabricListRow[] = [];
    const seen = new Set<string>();
    const nonFabricTypeTokens = ["hardware", "channel", "accessory", "vas", "furniture"];

    const addRow = (row: OrderFabricListRow) => {
      const key = [
        normalizeStatus(row.fabricName),
        normalizeStatus(row.qty),
        normalizeStatus(row.unit),
        normalizeStatus(row.source),
      ].join("|");
      if (!key || key === "|||") return;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(row);
    };

    const normalItems = selectedOrder?.sections?.NORMAL?.items || [];
    normalItems.forEach((item: any) => {
      const itemTypeRaw = normalizeStatus(item?.type || item?.productType || item?.bcnType || item?.category || "");
      if (nonFabricTypeTokens.some((token) => itemTypeRaw.includes(token))) return;

      const fabricName = String(item?.bcn || item?.description || item?.itemName || "").trim();
      if (!fabricName) return;

      const qty = String(item?.qty ?? item?.quantity ?? "-").trim() || "-";
      const unit = String(item?.unit || "Mtr").trim() || "Mtr";
      addRow({
        fabricName,
        qty,
        unit,
        status: String(item?.allocation?.status || item?.status || "N/A"),
        type: String(item?.type || item?.productType || item?.bcnType || item?.category || "Fabric"),
        poNumber: item?.poNumber,
        expectedDeliveryDate: item?.expectedDeliveryDate,
        source: "Order",
      });
    });

    (selectedOrder?.fabricDetails || []).forEach((fabricItem) => {
      const fabricName = String(fabricItem?.fabricName || "").trim();
      if (!fabricName) return;
      addRow({
        fabricName,
        qty: String(fabricItem?.quantity ?? "-").trim() || "-",
        unit: String((fabricItem as any)?.unit || "Mtr").trim() || "Mtr",
        status: String(fabricItem?.status || "N/A"),
        type: String(fabricItem?.type || "Fabric"),
        poNumber: fabricItem?.poNumber,
        expectedDeliveryDate: fabricItem?.expectedDeliveryDate,
        source: "Order",
      });
    });

    if (rows.length) return rows;

    purchaseRequests.forEach((requestItem) => {
      (requestItem.fabricDetails || []).forEach((fabricItem) => {
        const fabricName = String(fabricItem?.fabricName || "").trim();
        if (!fabricName) return;
        addRow({
          fabricName,
          qty: String(fabricItem?.quantity ?? "-").trim() || "-",
          unit: String((fabricItem as any)?.unit || "Mtr").trim() || "Mtr",
          status: String(fabricItem?.status || requestItem.status || "N/A"),
          type: String(fabricItem?.type || "Fabric"),
          poNumber: fabricItem?.poNumber,
          expectedDeliveryDate: fabricItem?.expectedDeliveryDate || requestItem.poDeliveryDate || undefined,
          source: "PR",
        });
      });
    });

    return rows;
  }, [selectedOrder, purchaseRequests]);

  const expectedDates = [
    ...orderFabricList.map((item) => item.expectedDeliveryDate),
    ...purchaseRequests.map((item) => item.poDeliveryDate),
  ]
    .map((value) => toDateSafe(value))
    .filter((value): value is Date => !!value)
    .sort((a, b) => a.getTime() - b.getTime());

  const expectedDeliveryLabel = expectedDates.length ? format(expectedDates[0], "dd MMM yyyy") : "N/A";

  const fabricRows = useMemo(() => {
    return orderFabricList.map((fabricItem) => {
      const matchingPr = purchaseRequests.find((requestItem) => {
        const hasFabric = (requestItem.fabricDetails || []).some((lineItem) =>
          matchTextLoose(lineItem.fabricName, fabricItem.fabricName)
        );
        const hasPoMilestone = (requestItem.poMilestones || []).some((milestone) =>
          matchTextLoose(milestone.itemName, fabricItem.fabricName)
        );
        return hasFabric || hasPoMilestone;
      });

      const matchingInbound = inbounds.find((inboundItem) =>
        (inboundItem.items || []).some((lineItem: any) => matchTextLoose(lineItem.itemName, fabricItem.fabricName))
      );

      const matchingStock = stockItems.find((stockItem: any) =>
        matchTextLoose(stockItem.fabricName || stockItem.itemName, fabricItem.fabricName)
      );

      const poStatus =
        !!fabricItem.poNumber ||
        !!matchingPr?.poMilestones?.some((milestone) => normalizeStatus(milestone.status) === "completed") ||
        PURCHASE_INBOUND_STATUSES.has(normalizeStatus(matchingPr?.status))
          ? "PO Generated"
          : "PO Pending";

      const receivedStatus = matchingInbound
        ? normalizeStatus(matchingInbound.status) === "completed" ||
          (matchingInbound.items || []).some(
            (lineItem: any) =>
              matchTextLoose(lineItem.itemName, fabricItem.fabricName) && parseQtySafe(lineItem.receivedQty) > 0
          )
          ? "Received"
          : "Pending Receive"
        : "Not Received";

      const stockMode = matchingStock
        ? normalizeStatus(matchingStock.status).includes("in stock")
          ? "In Stock"
          : normalizeStatus(matchingStock.status).includes("out stock")
          ? "Out Stock"
          : "PR Created"
        : "PR Created";

      return {
        fabricName: fabricItem.fabricName || "-",
        qty: `${fabricItem.qty || "-"} ${String(fabricItem.unit || "")}`.trim(),
        type: fabricItem.type || "-",
        poStatus,
        expectedDelivery: fabricItem.expectedDeliveryDate || matchingPr?.poDeliveryDate || "N/A",
        receivedStatus,
        stockMode,
        prStatus: matchingPr?.status || "No PR",
      };
    });
  }, [orderFabricList, purchaseRequests, inbounds, stockItems]);

  return (
    <>
      <Card className="h-full border-slate-200">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Order Execution Queue</CardTitle>
              <CardDescription>
                Priority-first queue for all assigned CRM orders and pending milestones.
              </CardDescription>
            </div>
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search order, customer, stage..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-muted-foreground">Live Orders</p>
              <p className="text-2xl font-bold">{kpis.live}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-xs text-red-700">Critical</p>
              <p className="text-2xl font-bold text-red-700">{kpis.critical}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-700">Watchlist</p>
              <p className="text-2xl font-bold text-amber-700">{kpis.watch}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">Avg Progress</p>
              <p className="text-2xl font-bold text-emerald-700">{kpis.avgProgress}%</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[36rem]">
            <div className="space-y-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 w-full" />)
              ) : sortedQueue.length > 0 ? (
                sortedQueue.map((row) => (
                  <div
                    key={row.order.id}
                    className={`rounded-xl border p-4 ${riskContainerClassMap[row.risk]}`}
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">{row.order.customerName || "-"}</p>
                            <Badge variant="secondary">{row.order.orderType || "-"}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Order #{row.order.crmOrderNo || "-"} | Deal #{row.order.dealId || "-"} |{" "}
                            {row.order.salesPerson || "-"}
                          </p>
                        </div>
                        <Badge variant="outline" className={riskBadgeClassMap[row.risk]}>
                          {riskLabelMap[row.risk]}
                        </Badge>
                      </div>
                      <Progress value={row.progress} className="h-2" />
                      <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground md:grid-cols-4">
                        <p>
                          Progress: <span className="font-semibold text-slate-900">{row.progress}%</span>
                        </p>
                        <p>
                          Current: <span className="font-semibold text-slate-900">{row.currentStep}</span>
                        </p>
                        <p>
                          Next: <span className="font-semibold text-slate-900">{row.nextStep}</span>
                        </p>
                        <p>
                          Aging: <span className="font-semibold text-slate-900">{row.ageDays} day(s)</span>
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => void openOrderDetails(row.order)}>
                        View Details
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No orders found for the current CRM assignment/search.
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog
        open={detailsDialogOpen}
        onOpenChange={(open) => {
          setDetailsDialogOpen(open);
          if (!open) {
            setSelectedOrder(null);
            setDetailsData(null);
            setDetailsError("");
          }
        }}
      >
        <DialogContent className="max-w-5xl overflow-hidden p-0">
          <DialogHeader>
            <div className="border-b p-6 pb-4">
              <DialogTitle>Order Details</DialogTitle>
              <DialogDescription>
                Simplified CRM view for order #{selectedOrder?.crmOrderNo || selectedOrder?.id || "-"}.
              </DialogDescription>
            </div>
          </DialogHeader>
          <ScrollArea className="max-h-[78vh] px-6 pb-6">
            <div className="space-y-4 pt-4">
              {detailsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : detailsError ? (
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{detailsError}</p>
              ) : selectedOrder ? (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Order And Customer</CardTitle>
                      <CardDescription>Basic order, customer, and running milestone status.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <DetailField label="Order ID" value={selectedOrder.crmOrderNo || selectedOrder.id} />
                      <DetailField label="Deal ID" value={selectedOrder.dealId || "N/A"} />
                      <DetailField label="Quotation No" value={selectedOrder.quotationNo || "N/A"} />
                      <DetailField label="Order Type" value={selectedOrder.orderType || "N/A"} />
                      <DetailField label="Customer Name" value={selectedOrder.customerName || "N/A"} />
                      <DetailField label="Customer Phone" value={selectedOrder.customerPhone || "N/A"} />
                      <DetailField label="Customer Address" value={selectedOrder.customerAddress || "N/A"} />
                      <DetailField label="Sales Person" value={selectedOrder.salesPerson || "N/A"} />
                      <DetailField label="Current Step" value={selectedMonitor?.currentStep || "N/A"} />
                      <DetailField label="Next Step" value={selectedMonitor?.nextStep || "N/A"} />
                      <DetailField label="Progress" value={`${selectedMonitor?.progress || 0}%`} />
                      <DetailField label="Created At" value={formatDateTimeLabel(selectedOrder.createdAt)} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>PO And Material Snapshot</CardTitle>
                      <CardDescription>PO generation, expected delivery, receive, and PR/In-stock flow.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-muted-foreground">PO Generated</p>
                        <p className="text-lg font-semibold">
                          {purchaseRequests.length ? `${poGeneratedCount}/${purchaseRequests.length}` : "0"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-muted-foreground">Current PR Status</p>
                        <p className="text-lg font-semibold">{purchaseStatusLabel}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-muted-foreground">Expected Delivery</p>
                        <p className="text-lg font-semibold">{expectedDeliveryLabel}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-muted-foreground">Receiving Status</p>
                        <p className="text-lg font-semibold">{receiveStatusLabel}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-muted-foreground">PR / Stock Mode</p>
                        <p className="text-lg font-semibold">{stockFlowLabel}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Order Fabric List</CardTitle>
                      <CardDescription>Simple list of fabrics captured on this order.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {orderFabricList.length ? (
                        <div className="space-y-2">
                          <div className="hidden rounded-md border bg-slate-50 p-2 text-xs font-semibold text-slate-600 md:grid md:grid-cols-5 md:gap-2">
                            <p className="md:col-span-2">Fabric</p>
                            <p>Qty</p>
                            <p>Unit</p>
                            <p>Status</p>
                          </div>
                          {orderFabricList.map((row, idx) => (
                            <div key={`${row.fabricName}-${row.source}-${idx}`} className="rounded-md border p-3">
                              <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-5">
                                <p className="md:col-span-2 font-medium">{row.fabricName}</p>
                                <p>{row.qty}</p>
                                <p>{row.unit}</p>
                                <p>{row.status}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No fabric list found on this order.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Fabric Status (Simplified)</CardTitle>
                      <CardDescription>
                        PO status, expected delivery, receiving, and PR/In-stock flow per fabric.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {fabricRows.length ? (
                        <div className="space-y-2">
                          <div className="hidden rounded-md border bg-slate-50 p-2 text-xs font-semibold text-slate-600 md:grid md:grid-cols-8 md:gap-2">
                            <p className="md:col-span-2">Fabric</p>
                            <p>Qty</p>
                            <p>Type</p>
                            <p>PO</p>
                            <p>Expected</p>
                            <p>Receive</p>
                            <p>PR / Stock</p>
                          </div>
                          {fabricRows.map((row, idx) => (
                            <div key={`${row.fabricName}-${idx}`} className="rounded-md border p-3">
                              <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-8">
                                <p className="md:col-span-2 font-medium">{row.fabricName}</p>
                                <p>{row.qty}</p>
                                <p>{row.type}</p>
                                <p>{row.poStatus}</p>
                                <p>{row.expectedDelivery}</p>
                                <p>{row.receivedStatus}</p>
                                <p>{row.stockMode}</p>
                                <p className="text-muted-foreground">PR: {row.prStatus}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No fabric details found on this order.</p>
                      )}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Select an order to see details.</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};

const PcKpiCard = ({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string;
  value: number | string;
  description: string;
  icon: LucideIcon;
  tone: "neutral" | "attention" | "critical" | "good";
}) => {
  const toneClass =
    tone === "critical"
      ? "border-red-200 bg-red-50/60"
      : tone === "attention"
      ? "border-amber-200 bg-amber-50/60"
      : tone === "good"
      ? "border-emerald-200 bg-emerald-50/60"
      : "border-slate-200 bg-white";

  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
};

const OrderMovementPanel = ({
  events,
  loading,
  readOnly = false,
  heightClassName = "h-[22rem]",
}: {
  events: OrderMovementEvent[];
  loading: boolean;
  readOnly?: boolean;
  heightClassName?: string;
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredEvents = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return events;
    return events.filter((eventItem) => {
      return (
        eventItem.title.toLowerCase().includes(normalized) ||
        eventItem.description.toLowerCase().includes(normalized) ||
        eventItem.suggestedNext.toLowerCase().includes(normalized)
      );
    });
  }, [events, searchTerm]);

  const iconMap: Record<OrderMovementType, LucideIcon> = {
    order_created: Activity,
    order_approved: CheckCircle,
    material_received: Truck,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order Movement Notifications</CardTitle>
        <CardDescription>
          Latest order events with suggested next update for the PC team.
        </CardDescription>
        <div className="relative pt-2">
          <Search className="absolute left-2.5 top-4.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by order, deal, event..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="pl-8"
          />
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className={heightClassName}>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />)
            ) : filteredEvents.length > 0 ? (
              filteredEvents.map((eventItem) => {
                const Icon = iconMap[eventItem.type];
                const content = (
                  <div className="rounded-lg border border-slate-200 bg-white p-3 hover:bg-muted/40">
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-4 w-4 text-slate-600" />
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-semibold">{eventItem.title}</p>
                        <p className="text-xs text-muted-foreground">{eventItem.description}</p>
                        <p className="text-xs font-medium text-slate-700">
                          Next update: {eventItem.suggestedNext}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(eventItem.timestamp, { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                );

                if (readOnly) {
                  return <div key={eventItem.id}>{content}</div>;
                }

                return (
                  <Link key={eventItem.id} href={eventItem.link} className="block">
                    {content}
                  </Link>
                );
              })
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No movement notifications yet.
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

const PcControlRoom = ({ readOnly = false }: { readOnly?: boolean }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [pendingStockVerificationCount, setPendingStockVerificationCount] = useState(0);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingPurchase, setLoadingPurchase] = useState(true);
  const [loadingStockVerification, setLoadingStockVerification] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [queueSearch, setQueueSearch] = useState("");
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [detailsQuery, setDetailsQuery] = useState("");
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [detailsData, setDetailsData] = useState<OrderSearchDetails | null>(null);
  const [detailsMatches, setDetailsMatches] = useState<Order[]>([]);

  const scoreOrderMatch = (orderItem: Order, normalizedTerm: string) => {
    const crmOrderNo = String(orderItem.crmOrderNo || "").toLowerCase();
    const orderDocId = String(orderItem.id || "").toLowerCase();
    const orderNo = String(orderItem.orderNo || "").toLowerCase();
    const dealId = String(orderItem.dealId || "").toLowerCase();
    const quotationNo = String(orderItem.quotationNo || "").toLowerCase();
    const customerName = String(orderItem.customerName || "").toLowerCase();
    const salesman = String(orderItem.salesPerson || "").toLowerCase();

    if (
      crmOrderNo === normalizedTerm ||
      orderDocId === normalizedTerm ||
      orderNo === normalizedTerm
    ) {
      return 100;
    }
    if (dealId === normalizedTerm) return 90;
    if (quotationNo === normalizedTerm) return 85;
    if (customerName === normalizedTerm) return 80;
    if (customerName.includes(normalizedTerm)) return 65;
    if (salesman.includes(normalizedTerm)) return 30;
    if (
      crmOrderNo.includes(normalizedTerm) ||
      orderDocId.includes(normalizedTerm) ||
      orderNo.includes(normalizedTerm) ||
      dealId.includes(normalizedTerm) ||
      quotationNo.includes(normalizedTerm)
    ) {
      return 55;
    }
    return 0;
  };

  const buildOrderSearchDetails = async (targetOrder: Order): Promise<OrderSearchDetails> => {
    const dealId = String(targetOrder.dealId || "").trim();
    const customerId = String(targetOrder.customerId || "").trim();
    const quotationNo = String(targetOrder.quotationNo || "").trim();

    const customerPromise = customerId
      ? getDoc(doc(db, "customers", customerId))
      : Promise.resolve(null as any);
    const dealGroupPromise = dealId
      ? getDocs(query(collectionGroup(db, "deals"), where("dealId", "==", dealId), limit(1)))
      : Promise.resolve(null as any);
    const purchasePromise = dealId
      ? getDocs(query(collection(db, "purchaseRequests"), where("dealId", "==", dealId), limit(80)))
      : Promise.resolve(null as any);
    const inboundPromise = dealId
      ? getDocs(query(collection(db, "inbounds"), where("dealId", "==", dealId), limit(80)))
      : Promise.resolve(null as any);
    const approvedStockPromise = dealId
      ? getDocs(query(collection(db, "approvedStock"), where("dealId", "==", dealId), limit(200)))
      : Promise.resolve(null as any);
    const o2dPromise = dealId
      ? getDocs(query(collection(db, "o2d"), where("dealId", "==", dealId), limit(1)))
      : Promise.resolve(null as any);
    const quotationByNoPromise = quotationNo
      ? getDocs(query(collectionGroup(db, "quotations"), where("quotationNo", "==", quotationNo), limit(20)))
      : Promise.resolve(null as any);

    const [
      customerSnap,
      dealGroupSnap,
      purchaseSnap,
      inboundSnap,
      approvedStockSnap,
      o2dSnap,
      quotationByNoSnap,
    ] = await Promise.all([
      customerPromise,
      dealGroupPromise,
      purchasePromise,
      inboundPromise,
      approvedStockPromise,
      o2dPromise,
      quotationByNoPromise,
    ]);

    let customerData: Customer | null =
      customerSnap && customerSnap.exists()
        ? ({ id: customerSnap.id, ...customerSnap.data() } as Customer)
        : null;

    let dealDoc: any = null;
    if (dealGroupSnap && !dealGroupSnap.empty) {
      dealDoc = dealGroupSnap.docs[0];
    }

    if (!dealDoc && customerId && dealId) {
      const directDealSnap = await getDoc(doc(db, "customers", customerId, "deals", dealId));
      if (directDealSnap.exists()) {
        dealDoc = directDealSnap;
      }
    }

    const dealData: Deal | null = dealDoc
      ? ({ id: dealDoc.id, ...dealDoc.data() } as Deal)
      : null;

    if (!customerData && dealDoc?.ref?.parent?.parent) {
      const parentCustomerRef = dealDoc.ref.parent.parent;
      const parentCustomerSnap = await getDoc(parentCustomerRef);
      if (parentCustomerSnap.exists()) {
        customerData = {
          id: parentCustomerSnap.id,
          ...(parentCustomerSnap.data() as Record<string, unknown>),
        } as Customer;
      }
    }

    const quotationMap = new Map<string, any>();
    const addQuotation = (quoteDoc: any) => {
      const quoteData = quoteDoc.data() || {};
      const key = `${quoteDoc.ref.path}`;
      if (!quotationMap.has(key)) {
        quotationMap.set(key, { id: quoteDoc.id, ...quoteData });
      }
    };

    if (dealDoc) {
      const dealQuotesSnap = await getDocs(query(collection(dealDoc.ref, "quotations"), limit(120)));
      dealQuotesSnap.docs.forEach(addQuotation);
    }

    if (quotationByNoSnap && !quotationByNoSnap.empty) {
      quotationByNoSnap.docs.forEach(addQuotation);
    }

    const quotations = Array.from(quotationMap.values()).sort((a, b) => {
      const aTime = toDateSafe(a.createdAt)?.getTime() || 0;
      const bTime = toDateSafe(b.createdAt)?.getTime() || 0;
      return bTime - aTime;
    });

    const purchaseData: PurchaseRequest[] =
      purchaseSnap && !purchaseSnap.empty
        ? purchaseSnap.docs.map((docItem: any) => ({ id: docItem.id, ...docItem.data() } as PurchaseRequest))
        : [];

    const inboundsData: InboundRequest[] =
      inboundSnap && !inboundSnap.empty
        ? inboundSnap.docs.map((docItem: any) => ({ id: docItem.id, ...docItem.data() } as InboundRequest))
        : [];

    const approvedStockItems =
      approvedStockSnap && !approvedStockSnap.empty
        ? approvedStockSnap.docs.map((docItem: any) => ({ id: docItem.id, ...docItem.data() }))
        : [];

    const o2dData = o2dSnap && !o2dSnap.empty ? { id: o2dSnap.docs[0].id, ...o2dSnap.docs[0].data() } : null;

    const timeline: DetailTimelineItem[] = [];
    timeline.push({
      id: `order-created-${targetOrder.id}`,
      title: `Order #${targetOrder.crmOrderNo || targetOrder.id} created`,
      source: "Order",
      by: targetOrder.createdBy?.name,
      at: toDateSafe(targetOrder.createdAt),
    });

    if ((targetOrder as any).approvedAt) {
      timeline.push({
        id: `order-approved-${targetOrder.id}`,
        title: `Order approved`,
        source: "Order",
        at: toDateSafe((targetOrder as any).approvedAt),
      });
    }

    getNormalizedOrderMilestones(targetOrder)
      .filter((milestone) => milestone.completed)
      .forEach((milestone) => {
        timeline.push({
          id: `order-ms-${targetOrder.id}-${milestone.id}`,
          title: `Order milestone: ${milestone.name}`,
          source: "Order Milestone",
          by: milestone.completedBy || undefined,
          at: toDateSafe(milestone.completedAt),
        });
      });

    const o2dMilestonesForTimeline: Array<{
      stepId: number;
      status?: string;
      completedBy?: string;
      remarks?: string;
      completedAt?: string;
    }> = Array.isArray((o2dData as any)?.milestones)
      ? (o2dData as any).milestones
      : (targetOrder.o2dMilestones || []);

    o2dMilestonesForTimeline
      .filter((milestone) => normalizeStatus(milestone.status) === "completed")
      .forEach((milestone, idx) => {
        timeline.push({
          id: `o2d-ms-${targetOrder.id}-${milestone.stepId}-${idx}`,
          title: `O2D step ${milestone.stepId} completed`,
          source: "O2D",
          by: milestone.completedBy,
          note: milestone.remarks,
          at: toDateSafe(milestone.completedAt),
        });
      });

    purchaseData.forEach((requestItem) => {
      timeline.push({
        id: `pr-created-${requestItem.id}`,
        title: `Purchase request created (${requestItem.id})`,
        source: "Purchase",
        by: requestItem.createdBy?.name,
        at: toDateSafe(requestItem.createdAt),
      });

      (requestItem.milestones || [])
        .filter((milestone) => normalizeStatus(milestone.status) === "completed")
        .forEach((milestone, idx) => {
          timeline.push({
            id: `pr-ms-${requestItem.id}-${milestone.stepId}-${idx}`,
            title: `Purchase step: ${PURCHASE_STEP_LABELS[milestone.stepId] || `Step ${milestone.stepId}`}`,
            source: "Purchase Milestone",
            by: milestone.completedBy,
            note: milestone.remarks,
            at: toDateSafe(milestone.completedAt),
          });
        });

      (requestItem.poMilestones || [])
        .filter((milestone) => normalizeStatus(milestone.status) === "completed")
        .forEach((milestone, idx) => {
          timeline.push({
            id: `po-ms-${requestItem.id}-${milestone.stepId}-${idx}`,
            title: `PO step: ${PO_STEP_LABELS[milestone.stepId] || `Step ${milestone.stepId}`}${
              milestone.itemName ? ` (${milestone.itemName})` : ""
            }`,
            source: "PO Milestone",
            by: milestone.completedBy,
            note: milestone.remarks,
            at: toDateSafe(milestone.completedAt),
          });
        });
    });

    inboundsData.forEach((inboundItem) => {
      timeline.push({
        id: `inbound-created-${inboundItem.id}`,
        title: `Inbound created (${inboundItem.id})`,
        source: "Inbound",
        at: toDateSafe(inboundItem.createdAt),
      });
      if (inboundItem.completedAt) {
        timeline.push({
          id: `inbound-complete-${inboundItem.id}`,
          title: `Inbound completed (${inboundItem.id})`,
          source: "Inbound",
          by: inboundItem.completedBy,
          at: toDateSafe(inboundItem.completedAt),
        });
      }
      (inboundItem.items || []).forEach((material: any, mIdx: number) => {
        (material?.inboundMilestones || [])
          .filter((milestone: any) => normalizeStatus(milestone.status) === "completed")
          .forEach((milestone: any, idx: number) => {
            timeline.push({
              id: `inbound-ms-${inboundItem.id}-${mIdx}-${milestone.stepId}-${idx}`,
              title: `Inbound step: ${INBOUND_STEP_LABELS[milestone.stepId] || `Step ${milestone.stepId}`} (${
                material.itemName || "Item"
              })`,
              source: "Inbound Milestone",
              by: milestone.completedBy,
              at: toDateSafe(milestone.completedAt),
            });
          });
      });
    });

    approvedStockItems.forEach((stockItem: any) => {
      timeline.push({
        id: `stock-created-${stockItem.id}`,
        title: `Stock verification created (${stockItem.fabricName || stockItem.id})`,
        source: "Stock Verification",
        by: stockItem.createdBy?.name,
        note: stockItem.status,
        at: toDateSafe(stockItem.createdAt),
      });
      if (stockItem.updatedAt) {
        timeline.push({
          id: `stock-updated-${stockItem.id}`,
          title: `Stock verification updated (${stockItem.fabricName || stockItem.id})`,
          source: "Stock Verification",
          note: stockItem.status,
          at: toDateSafe(stockItem.updatedAt),
        });
      }
    });

    return {
      order: targetOrder,
      customer: customerData,
      deal: dealData,
      quotations,
      purchaseRequests: purchaseData,
      inbounds: inboundsData,
      approvedStockItems,
      o2d: o2dData,
      timeline: timeline.sort(timelineSort),
    };
  };

  const handleOrderDetailsSearch = async (overrideQuery?: string) => {
    const queryText = String(overrideQuery ?? detailsQuery).trim();
    if (!queryText) {
      setDetailsError("Enter customer name, deal id, quotation no, or order id.");
      setDetailsData(null);
      setDetailsMatches([]);
      return;
    }

    setDetailsLoading(true);
    setDetailsError("");
    setDetailsData(null);
    try {
      const normalizedTerm = queryText.toLowerCase();

      const localMatches = orders
        .map((orderItem) => ({ orderItem, score: scoreOrderMatch(orderItem, normalizedTerm) }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((row) => row.orderItem);

      let mergedMatches = [...localMatches];

      const additionalOrderLookups: Promise<any>[] = [];
      additionalOrderLookups.push(getDoc(doc(db, "orders", queryText)));
      additionalOrderLookups.push(getDocs(query(collection(db, "orders"), where("crmOrderNo", "==", queryText), limit(10))));
      additionalOrderLookups.push(getDocs(query(collection(db, "orders"), where("dealId", "==", queryText), limit(10))));
      additionalOrderLookups.push(getDocs(query(collection(db, "orders"), where("orderNo", "==", queryText), limit(10))));
      additionalOrderLookups.push(
        getDocs(query(collection(db, "orders"), where("customerName", "==", queryText), limit(10)))
      );
      additionalOrderLookups.push(
        getDocs(query(collectionGroup(db, "quotations"), where("quotationNo", "==", queryText), limit(10)))
      );
      additionalOrderLookups.push(
        getDocs(query(collection(db, "purchaseRequests"), where("quotationNo", "==", queryText), limit(10)))
      );

      const [
        directOrderSnap,
        orderByCrmSnap,
        orderByDealSnap,
        orderByOrderNoSnap,
        orderByCustomerNameSnap,
        quotationByNoSnap,
        purchaseByQuoteSnap,
      ] = await Promise.all(additionalOrderLookups);

      const addOrder = (orderItem?: Order | null) => {
        if (!orderItem?.id) return;
        if (!mergedMatches.some((existing) => existing.id === orderItem.id)) {
          mergedMatches.push(orderItem);
        }
      };

      if (directOrderSnap && directOrderSnap.exists()) {
        addOrder({ id: directOrderSnap.id, ...directOrderSnap.data() } as Order);
      }

      orderByCrmSnap?.docs?.forEach((docItem: any) =>
        addOrder({ id: docItem.id, ...docItem.data() } as Order)
      );
      orderByDealSnap?.docs?.forEach((docItem: any) =>
        addOrder({ id: docItem.id, ...docItem.data() } as Order)
      );
      orderByOrderNoSnap?.docs?.forEach((docItem: any) =>
        addOrder({ id: docItem.id, ...docItem.data() } as Order)
      );
      orderByCustomerNameSnap?.docs?.forEach((docItem: any) =>
        addOrder({ id: docItem.id, ...docItem.data() } as Order)
      );

      const tryResolveByDeal = async (dealId: string) => {
        if (!dealId) return;
        const existing = mergedMatches.find((orderItem) => String(orderItem.dealId || "") === String(dealId));
        if (existing) return;
        const byDealSnap = await getDocs(query(collection(db, "orders"), where("dealId", "==", dealId), limit(1)));
        if (!byDealSnap.empty) {
          addOrder({ id: byDealSnap.docs[0].id, ...byDealSnap.docs[0].data() } as Order);
        }
      };

      for (const quoteDoc of quotationByNoSnap?.docs || []) {
        const dealIdFromPath = quoteDoc.ref.parent.parent?.id || "";
        await tryResolveByDeal(String(dealIdFromPath));
      }

      for (const prDoc of purchaseByQuoteSnap?.docs || []) {
        const dealIdFromPr = String(prDoc.data()?.dealId || "");
        await tryResolveByDeal(dealIdFromPr);
      }

      mergedMatches = mergedMatches.sort((a, b) => {
        const aScore = scoreOrderMatch(a, normalizedTerm);
        const bScore = scoreOrderMatch(b, normalizedTerm);
        return bScore - aScore;
      });
      setDetailsMatches(mergedMatches.slice(0, 20));

      const selected = mergedMatches[0];
      if (!selected) {
        setDetailsError("No matching order found.");
        return;
      }

      const detailResult = await buildOrderSearchDetails(selected);
      setDetailsData(detailResult);
    } catch (error) {
      console.error("Order detail search failed:", error);
      setDetailsError("Failed to load order details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSelectMatchedOrder = async (orderItem: Order) => {
    setDetailsLoading(true);
    setDetailsError("");
    try {
      const detailResult = await buildOrderSearchDetails(orderItem);
      setDetailsData(detailResult);
    } catch (error) {
      console.error("Loading selected match failed:", error);
      setDetailsError("Failed to load selected order details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    const ordersQuery = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(300));
    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        setOrders(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() } as Order)));
        setLoadingOrders(false);
      },
      (error) => {
        console.error("Error loading PC orders:", error);
        setLoadingOrders(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const purchaseQuery = query(collection(db, "purchaseRequests"), orderBy("createdAt", "desc"), limit(300));
    const unsubscribe = onSnapshot(
      purchaseQuery,
      (snapshot) => {
        setPurchaseRequests(
          snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() } as PurchaseRequest))
        );
        setLoadingPurchase(false);
      },
      (error) => {
        console.error("Error loading PC purchase requests:", error);
        setLoadingPurchase(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const stockVerificationQuery = query(
      collection(db, "approvedStock"),
      where("status", "==", "Pending Stock Verification")
    );
    const unsubscribe = onSnapshot(
      stockVerificationQuery,
      (snapshot) => {
        setPendingStockVerificationCount(snapshot.size);
        setLoadingStockVerification(false);
      },
      (error) => {
        console.error("Error loading stock verification count:", error);
        setLoadingStockVerification(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const monitoredOrders = useMemo(() => orders.map(deriveOrderMonitor), [orders]);

  const openOrders = useMemo(
    () => monitoredOrders.filter((orderItem) => orderItem.progress < 100),
    [monitoredOrders]
  );

  const priorityQueue = useMemo(() => {
    const riskRank: Record<OrderRisk, number> = { critical: 0, watch: 1, stable: 2 };
    const normalizedSearch = queueSearch.trim().toLowerCase();
    return openOrders
      .filter((item) => {
        if (!normalizedSearch) return true;
        const orderNo = String(item.order.crmOrderNo || "").toLowerCase();
        const dealId = String(item.order.dealId || "").toLowerCase();
        const customer = String(item.order.customerName || "").toLowerCase();
        const salesman = String(item.order.salesPerson || "").toLowerCase();
        const currentStep = String(item.currentStep || "").toLowerCase();
        const stage = String(item.nextStep || "").toLowerCase();
        return (
          orderNo.includes(normalizedSearch) ||
          dealId.includes(normalizedSearch) ||
          customer.includes(normalizedSearch) ||
          salesman.includes(normalizedSearch) ||
          currentStep.includes(normalizedSearch) ||
          stage.includes(normalizedSearch)
        );
      })
      .sort((a, b) => riskRank[a.risk] - riskRank[b.risk] || b.ageDays - a.ageDays);
  }, [openOrders, queueSearch]);

  const stageSnapshot = useMemo(() => {
    const stageMap = new Map<string, number>();
    openOrders.forEach((orderItem) => {
      const key = orderItem.nextStep;
      stageMap.set(key, (stageMap.get(key) || 0) + 1);
    });

    return Array.from(stageMap.entries())
      .map(([step, count]) => ({ step, count }))
      .sort((a, b) => b.count - a.count || a.step.localeCompare(b.step))
      .slice(0, 8);
  }, [openOrders]);

  const criticalCount = openOrders.filter((item) => item.risk === "critical").length;
  const watchCount = openOrders.filter((item) => item.risk === "watch").length;
  const avgProgress = openOrders.length
    ? Math.round(openOrders.reduce((sum, item) => sum + item.progress, 0) / openOrders.length)
    : 0;
  const oldestOpenDays = openOrders.length ? Math.max(...openOrders.map((item) => item.ageDays)) : 0;
  const poPendingCount = purchaseRequests.filter((req) =>
    PURCHASE_PENDING_STATUSES.has(normalizeStatus(req.status))
  ).length;
  const inboundPendingCount = purchaseRequests.filter((req) =>
    PURCHASE_INBOUND_STATUSES.has(normalizeStatus(req.status))
  ).length;
  const purchaseCompletedCount = purchaseRequests.filter((req) =>
    PURCHASE_COMPLETED_STATUSES.has(normalizeStatus(req.status))
  ).length;
  const pendingOrderApprovalCount = orders.filter(
    (orderItem) => normalizeStatus(orderItem.status) === "pending approval"
  ).length;

  const orderByDealId = useMemo(() => {
    const dealMap = new Map<string, Order>();
    orders.forEach((orderItem) => {
      if (orderItem.dealId && !dealMap.has(orderItem.dealId)) {
        dealMap.set(orderItem.dealId, orderItem);
      }
    });
    return dealMap;
  }, [orders]);

  const movementEvents = useMemo(() => {
    const events: OrderMovementEvent[] = [];

    orders.forEach((orderItem) => {
      const createdAt = toDateSafe(orderItem.createdAt);
      if (createdAt) {
        events.push({
          id: `created-${orderItem.id}`,
          type: "order_created",
          title: `Order #${orderItem.crmOrderNo} created`,
          description: `${orderItem.customerName} | Deal #${orderItem.dealId || "N/A"}`,
          suggestedNext:
            normalizeStatus(orderItem.status) === "pending approval"
              ? "Move this order for approval."
              : "Confirm approval and stock verification status.",
          timestamp: createdAt,
          link: `/dashboard/orders/${orderItem.id}`,
        });
      }

      const approvedAt = toDateSafe((orderItem as any).approvedAt);
      if (approvedAt || normalizeStatus(orderItem.status) === "approved") {
        events.push({
          id: `approved-${orderItem.id}-${approvedAt?.toISOString() || "na"}`,
          type: "order_approved",
          title: `Order #${orderItem.crmOrderNo} approved`,
          description: `${orderItem.customerName} | Deal #${orderItem.dealId || "N/A"}`,
          suggestedNext: "Complete stock verification and trigger PR for out-of-stock items.",
          timestamp: approvedAt || createdAt || new Date(),
          link: "/dashboard/stock-verification",
        });
      }
    });

    purchaseRequests.forEach((requestItem) => {
      (requestItem.poMilestones || []).forEach((milestone, index) => {
        const milestoneTime = toDateSafe(milestone.completedAt);
        if (milestone.stepId !== 3 || normalizeStatus(milestone.status) !== "completed" || !milestoneTime) {
          return;
        }

        const linkedOrder = requestItem.dealId ? orderByDealId.get(requestItem.dealId) : undefined;
        const orderNo = linkedOrder?.crmOrderNo || requestItem.dealId || requestItem.id;
        const itemLabel = milestone.itemName || "material";

        events.push({
          id: `material-${requestItem.id}-${index}-${milestoneTime.toISOString()}`,
          type: "material_received",
          title: `Material received for order #${orderNo}`,
          description: `${requestItem.customerName || "Customer N/A"} | ${itemLabel} | Deal #${
            requestItem.dealId || "N/A"
          }`,
          suggestedNext: "Confirm sent-to-location and update next O2D checkpoint.",
          timestamp: milestoneTime,
          link: linkedOrder ? `/dashboard/orders/${linkedOrder.id}` : "/dashboard/inbound",
        });
      });
    });

    return events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 120);
  }, [orderByDealId, orders, purchaseRequests]);

  const loading = loadingOrders || loadingPurchase || loadingStockVerification;
  const stageMax = stageSnapshot[0]?.count || 1;
  const procurementSummary = useMemo(() => {
    const fallback = {
      rows: [] as ProcurementDetailRow[],
      totalItems: 0,
      inStockCount: 0,
      prRequiredCount: 0,
      prCreatedCount: 0,
      prReceivedCount: 0,
      prPendingCount: 0,
      prNotCreatedCount: 0,
      pendingRows: [] as ProcurementDetailRow[],
      nextReceiveAt: null as Date | null,
      nextReceiveLabel: "N/A",
    };

    if (!detailsData) {
      return fallback;
    }

    const orderFabrics = detailsData.order.fabricDetails || [];
    const purchaseData = detailsData.purchaseRequests || [];
    const inboundData = detailsData.inbounds || [];
    const stockData = detailsData.approvedStockItems || [];
    const itemMap = new Map<string, string>();

    const registerItem = (value: unknown) => {
      const label = String(value || "").trim();
      if (!label) return;
      const normalized = normalizeStatus(label);
      if (!normalized || itemMap.has(normalized)) return;
      itemMap.set(normalized, label);
    };

    orderFabrics.forEach((fabricItem) => registerItem(fabricItem.fabricName));
    purchaseData.forEach((requestItem) => {
      (requestItem.fabricDetails || []).forEach((fabricItem) => registerItem(fabricItem.fabricName));
      (requestItem.poMilestones || []).forEach((milestone) => registerItem(milestone.itemName));
    });
    inboundData.forEach((inboundItem) => {
      (inboundItem.items || []).forEach((lineItem: any) => registerItem(lineItem.itemName));
    });
    stockData.forEach((stockItem: any) => registerItem(stockItem.fabricName || stockItem.itemName));

    const rows = Array.from(itemMap.values())
      .map((itemName) => {
        const matchingOrderFabrics = orderFabrics.filter((fabricItem) =>
          matchTextLoose(fabricItem.fabricName, itemName)
        );
        const matchingRequests = purchaseData.filter((requestItem) => {
          const hasFabricMatch = (requestItem.fabricDetails || []).some((fabricItem) =>
            matchTextLoose(fabricItem.fabricName, itemName)
          );
          const hasMilestoneMatch = (requestItem.poMilestones || []).some((milestone) =>
            matchTextLoose(milestone.itemName, itemName)
          );
          return hasFabricMatch || hasMilestoneMatch;
        });
        const matchingInboundItems = inboundData.flatMap((inboundItem) =>
          (inboundItem.items || [])
            .filter((lineItem: any) => matchTextLoose(lineItem.itemName, itemName))
            .map((lineItem: any) => ({ inboundItem, lineItem }))
        );
        const matchingStocks = stockData.filter((stockItem: any) =>
          matchTextLoose(stockItem.fabricName || stockItem.itemName, itemName)
        );

        const orderQty = matchingOrderFabrics.reduce(
          (sum, fabricItem) => sum + parseQtySafe(fabricItem.quantity),
          0
        );
        const purchaseQty = matchingRequests.reduce((sum, requestItem) => {
          const lineQty = (requestItem.fabricDetails || [])
            .filter((fabricItem) => matchTextLoose(fabricItem.fabricName, itemName))
            .reduce((innerSum, fabricItem) => innerSum + parseQtySafe(fabricItem.quantity), 0);
          return sum + lineQty;
        }, 0);
        const finalQty = orderQty > 0 ? orderQty : purchaseQty;
        const qtyLabel =
          finalQty > 0
            ? `${Number.isInteger(finalQty) ? finalQty : finalQty.toFixed(2)}`
            : matchingOrderFabrics[0]?.quantity || "-";

        const isInStock =
          matchingStocks.some((stockItem: any) => normalizeStatus(stockItem.status).includes("in stock")) ||
          matchingOrderFabrics.some((fabricItem: any) => normalizeStatus(fabricItem?.status).includes("in stock"));
        const hasPr =
          matchingRequests.length > 0 || matchingOrderFabrics.some((fabricItem) => !!fabricItem.poNumber);
        const hasInboundReceive = matchingInboundItems.some(
          ({ inboundItem, lineItem }) =>
            normalizeStatus(inboundItem.status) === "completed" || parseQtySafe(lineItem.receivedQty) > 0
        );
        const isReceived = isInStock ? true : hasInboundReceive;

        const expectedDates = [
          ...matchingOrderFabrics.map((fabricItem) => fabricItem.expectedDeliveryDate),
          ...matchingRequests.map((requestItem) => requestItem.poDeliveryDate),
          ...matchingRequests.map((requestItem) => requestItem.promiseDeliveryDate),
          ...matchingRequests.flatMap((requestItem) =>
            (requestItem.fabricDetails || [])
              .filter((fabricItem) => matchTextLoose(fabricItem.fabricName, itemName))
              .map((fabricItem) => fabricItem.expectedDeliveryDate)
          ),
        ]
          .map((value) => toDateSafe(value))
          .filter((value): value is Date => !!value)
          .sort((a, b) => a.getTime() - b.getTime());

        const expectedReceiveAt = expectedDates[0] || null;
        const expectedReceiveLabel = expectedReceiveAt ? formatDateTimeLabel(expectedReceiveAt) : "Pending date";
        const prStatus = matchingRequests.length
          ? Array.from(new Set(matchingRequests.map((requestItem) => String(requestItem.status || "PR Created"))))
              .slice(0, 2)
              .join(", ")
          : hasPr
          ? "PO Linked"
          : "PR Needed";

        let receiveStatus: ProcurementDetailRow["receiveStatus"] = "PR Not Created";
        if (isInStock) {
          receiveStatus = "In Stock";
        } else if (hasPr && isReceived) {
          receiveStatus = "Received";
        } else if (hasPr) {
          receiveStatus = "Pending Receive";
        }

        return {
          itemName,
          qtyLabel,
          stockState: isInStock ? "In Stock" : "Need PR",
          prStatus,
          receiveStatus,
          expectedReceiveAt,
          expectedReceiveLabel,
          hasPr,
          isInStock,
          isReceived,
        } as ProcurementDetailRow;
      })
      .sort((a, b) => a.itemName.localeCompare(b.itemName));

    const inStockCount = rows.filter((row) => row.isInStock).length;
    const prRequiredCount = rows.filter((row) => !row.isInStock).length;
    const prCreatedCount = rows.filter((row) => !row.isInStock && row.hasPr).length;
    const prReceivedCount = rows.filter((row) => !row.isInStock && row.hasPr && row.isReceived).length;
    const pendingRows = rows.filter((row) => !row.isInStock && row.hasPr && !row.isReceived);
    const prPendingCount = pendingRows.length;
    const prNotCreatedCount = rows.filter((row) => !row.isInStock && !row.hasPr).length;
    const nextReceiveAt =
      pendingRows
        .map((row) => row.expectedReceiveAt)
        .filter((value): value is Date => !!value)
        .sort((a, b) => a.getTime() - b.getTime())[0] || null;

    return {
      rows,
      totalItems: rows.length,
      inStockCount,
      prRequiredCount,
      prCreatedCount,
      prReceivedCount,
      prPendingCount,
      prNotCreatedCount,
      pendingRows,
      nextReceiveAt,
      nextReceiveLabel: nextReceiveAt ? formatDateTimeLabel(nextReceiveAt) : "N/A",
    };
  }, [detailsData]);

  return (
    <>
      <div className="space-y-6">
        <Card className="border-slate-200 bg-gradient-to-r from-slate-50 via-white to-emerald-50">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-2xl">PC Control Room</CardTitle>
                <CardDescription>
                  Monitor process flow, catch bottlenecks early, and drive order completion across purchase,
                  inbound, and delivery milestones.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setDetailsDialogOpen(true);
                  setDetailsError("");
                }}
              >
                Get Order Details
              </Button>
            </div>
          </CardHeader>
        </Card>

        {readOnly && (
          <Card className="border-sky-200 bg-sky-50/60">
            <CardContent className="p-4 text-sm text-sky-900">
              Read-only mode is enabled for PC users. Editing and deleting actions are disabled here.
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <PcKpiCard
            title="Live Orders"
            value={openOrders.length}
            description="Orders still moving through milestones."
            icon={Activity}
            tone="neutral"
          />
          <PcKpiCard
            title="Critical Cases"
            value={criticalCount}
            description="Need immediate intervention."
            icon={AlertTriangle}
            tone="critical"
          />
          <PcKpiCard
            title="Watchlist"
            value={watchCount}
            description="Slowing down, monitor closely."
            icon={Clock3}
            tone="attention"
          />
          <PcKpiCard
            title="PO Pending"
            value={poPendingCount}
            description="Waiting for PO closure steps."
            icon={ShoppingCart}
            tone="attention"
          />
          <PcKpiCard
            title="Inbound Pending"
            value={inboundPendingCount}
            description="PO generated, awaiting material receipt."
            icon={Truck}
            tone="attention"
          />
          <PcKpiCard
            title="PO Completed"
            value={purchaseCompletedCount}
            description="Closed purchase requests."
            icon={Calendar}
            tone="good"
          />
          <PcKpiCard
            title="Order Approval Pending"
            value={pendingOrderApprovalCount}
            description="Orders waiting for Accounts approval."
            icon={FileSignature}
            tone={pendingOrderApprovalCount > 0 ? "attention" : "good"}
          />
          <PcKpiCard
            title="Stock Verification Pending"
            value={pendingStockVerificationCount}
            description="Approved items awaiting stock check."
            icon={ListOrdered}
            tone={pendingStockVerificationCount > 0 ? "attention" : "good"}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="space-y-6 xl:col-span-8">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>Priority Queue</CardTitle>
                    <CardDescription>
                      Highest-risk orders sorted by urgency and aging. Use this as your daily execution list.
                    </CardDescription>
                  </div>
                  <div className="w-full max-w-xs">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={queueSearch}
                        onChange={(event) => setQueueSearch(event.target.value)}
                        placeholder="Search order, customer, stage..."
                        className="pl-8"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[27rem]">
                  <div className="space-y-3">
                    {loading ? (
                      Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)
                    ) : priorityQueue.length > 0 ? (
                      priorityQueue.map((row) => (
                        <div
                          key={row.order.id}
                          className={`rounded-lg border p-4 ${riskContainerClassMap[row.risk]}`}
                        >
                          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                              <p className="font-semibold">{row.order.customerName || "Unknown Customer"}</p>
                              <Badge variant="outline" className="ml-1">{row.order.orderType || "-"}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Order #{row.order.crmOrderNo} - Deal #{row.order.dealId || "N/A"} -{" "}
                                {row.order.salesPerson || "Unassigned"}
                              </p>
                            </div>
                            <Badge variant="outline" className={riskBadgeClassMap[row.risk]}>
                              {riskLabelMap[row.risk]}
                            </Badge>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>
                                Progress {row.progress}% ({row.completedMilestones}/{row.totalMilestones})
                              </span>
                              <span>{row.ageDays} day(s) open</span>
                            </div>
                            <Progress value={row.progress} className="h-2" />
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-muted-foreground">
                              <p>
                                Current step: <span className="font-medium text-foreground">{row.currentStep}</span>
                              </p>
                              <p>
                                Next checkpoint:{" "}
                                <span className="font-medium text-foreground">{row.nextStep}</span>
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => setSelectedOrder(row.order)}>
                                View Flow
                              </Button>
                              {!readOnly && (
                                <Button size="sm" asChild>
                                  <Link href={`/dashboard/orders/${row.order.id}`}>Open Order</Link>
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No active orders in this queue.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Stage Bottlenecks</CardTitle>
                <CardDescription>
                  Distribution of open orders by their next pending milestone.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Skeleton key={index} className="h-11 w-full" />
                    ))}
                  </div>
                ) : stageSnapshot.length ? (
                  <div className="space-y-3">
                    {stageSnapshot.map((stage) => (
                      <div key={stage.step} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <p className="font-medium">{stage.step}</p>
                          <Badge variant="secondary">{stage.count}</Badge>
                        </div>
                        <Progress value={Math.round((stage.count / stageMax) * 100)} className="h-2" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No open-stage bottlenecks right now.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 xl:col-span-4">
            <Card>
              <CardHeader>
                <CardTitle>Control Signals</CardTitle>
                <CardDescription>Quick health indicators for daily PC review.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-md border border-slate-200 p-3">
                  <p className="text-sm text-muted-foreground">Average completion</p>
                  <p className="text-lg font-semibold">{avgProgress}%</p>
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-200 p-3">
                  <p className="text-sm text-muted-foreground">Oldest open order</p>
                  <p className="text-lg font-semibold">{oldestOpenDays} days</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {readOnly ? (
                    <p className="col-span-2 text-xs text-muted-foreground">
                      Quick action navigation is hidden in read-only mode.
                    </p>
                  ) : (
                    <>
                      <Button variant="outline" asChild>
                        <Link href="/dashboard/orders">Orders</Link>
                      </Button>
                      <Button variant="outline" asChild>
                        <Link href="/dashboard/purchase">Purchase</Link>
                      </Button>
                      <Button variant="outline" asChild>
                        <Link href="/dashboard/inbound">Inbound</Link>
                      </Button>
                      <Button variant="outline" asChild>
                        <Link href="/dashboard/po-tracking">PO Tracking</Link>
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <OrderMovementPanel
              events={movementEvents}
              loading={loading}
              readOnly={readOnly}
              heightClassName="h-[24rem]"
            />
            <TodayVisits heightClassName="h-[14rem]" />
          </div>
        </div>
      </div>

      <Dialog
        open={detailsDialogOpen}
        onOpenChange={(open) => {
          setDetailsDialogOpen(open);
          if (!open) {
            setDetailsLoading(false);
            setDetailsError("");
          }
        }}
      >
        <DialogContent className="h-[96vh] w-[96vw] max-w-[96vw] p-0 overflow-auto">
          <div className="flex h-full flex-col">
            <DialogHeader className="border-b px-6 py-4">
              <DialogTitle>Get Order Details</DialogTitle>
              <DialogDescription>
                Search using customer name, deal id, quotation no, or order id.
              </DialogDescription>
            </DialogHeader>

            <div className="border-b px-6 py-4">
              <div className="flex flex-col gap-2 md:flex-row">
                <Input
                  value={detailsQuery}
                  onChange={(event) => setDetailsQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleOrderDetailsSearch();
                    }
                  }}
                  placeholder="Customer name / Deal ID / Quotation No / Order ID"
                />
                <Button onClick={() => void handleOrderDetailsSearch()} disabled={detailsLoading}>
                  Search
                </Button>
              </div>
              {detailsError && <p className="mt-2 text-sm text-red-600">{detailsError}</p>}
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-4 p-6">
                {detailsLoading ? (
                  Array.from({ length: 6 }).map((_, idx) => <Skeleton key={idx} className="h-24 w-full" />)
                ) : detailsData ? (
                  <>
                    {detailsMatches.length > 1 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Matching Orders ({detailsMatches.length})</CardTitle>
                          <CardDescription>Select another match to view full details.</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {detailsMatches.map((orderItem) => (
                              <Button
                                key={orderItem.id}
                                variant={orderItem.id === detailsData.order.id ? "default" : "outline"}
                                className="justify-start"
                                onClick={() => void handleSelectMatchedOrder(orderItem)}
                              >
                                #{orderItem.crmOrderNo || orderItem.id} | Deal #{orderItem.dealId || "N/A"} |{" "}
                                {orderItem.customerName || "Unknown"}
                              </Button>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <Card>
                      <CardHeader>
                        <CardTitle>Order Summary</CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">
                        <DetailField label="Order ID" value={detailsData.order.id} />
                        <DetailField label="CRM Order No" value={detailsData.order.crmOrderNo} />
                        <DetailField label="Deal ID" value={detailsData.order.dealId} />
                        <DetailField label="Quotation No" value={detailsData.order.quotationNo} />
                        <DetailField label="Order Type" value={detailsData.order.orderType} />
                        <DetailField label="Order Status" value={detailsData.order.status} />
                        <DetailField label="Salesman" value={detailsData.order.salesPerson} />
                        <DetailField label="Created At" value={formatDateTimeLabel(detailsData.order.createdAt)} />
                      </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle>Customer Details</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <DetailField label="Name" value={detailsData.customer?.name || detailsData.order.customerName} />
                          <DetailField
                            label="Phone"
                            value={detailsData.customer?.phone || detailsData.customer?.mobileNo || detailsData.order.customerPhone}
                          />
                          <DetailField label="Email" value={detailsData.customer?.email} />
                          <DetailField
                            label="Address"
                            value={
                              detailsData.customer?.billingAddress?.line1 ||
                              detailsData.customer?.shippingAddress?.line1 ||
                              detailsData.order.customerAddress
                            }
                          />
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Deal Details</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <DetailField label="Deal ID" value={detailsData.deal?.dealId || detailsData.order.dealId} />
                          <DetailField label="Deal Code" value={detailsData.deal?.dealCode} />
                          <DetailField label="Title" value={detailsData.deal?.title || detailsData.deal?.dealName} />
                          <DetailField label="Status" value={detailsData.deal?.status} />
                          <DetailField label="Source" value={detailsData.deal?.dealSource} />
                          <DetailField label="Assigned Sales Person" value={detailsData.deal?.assignedSalesPerson?.name} />
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle>Quotation Details</CardTitle>
                        <CardDescription>
                          {detailsData.quotations.length} quotation(s) linked with this order/deal.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2 overflow-auto">
                        {detailsData.quotations.length ? (
                          detailsData.quotations.map((quotationItem) => (
                            <div key={quotationItem.id} className="rounded-md border p-3">
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
                                <DetailField label="Quotation No" value={quotationItem.quotationNo || quotationItem.id} />
                                <DetailField label="Status" value={quotationItem.status} />
                                <DetailField label="Created At" value={formatDateTimeLabel(quotationItem.createdAt)} />
                                <DetailField label="Approved At" value={formatDateTimeLabel(quotationItem.approvedAt)} />
                                <DetailField label="Total Amount" value={quotationItem.totalAmount} />
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">No quotation details found.</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Purchase / PO Details</CardTitle>
                        <CardDescription>
                          Simplified view: in stock vs PR required, PR status, and pending receive ETA.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs text-muted-foreground">Total Fabrics</p>
                            <p className="text-lg font-semibold">{procurementSummary.totalItems}</p>
                          </div>
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                            <p className="text-xs text-emerald-700">In Stock</p>
                            <p className="text-lg font-semibold text-emerald-700">{procurementSummary.inStockCount}</p>
                          </div>
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                            <p className="text-xs text-amber-700">Need PR</p>
                            <p className="text-lg font-semibold text-amber-700">{procurementSummary.prRequiredCount}</p>
                          </div>
                          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                            <p className="text-xs text-sky-700">PR Created</p>
                            <p className="text-lg font-semibold text-sky-700">{procurementSummary.prCreatedCount}</p>
                          </div>
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                            <p className="text-xs text-emerald-700">PR Received</p>
                            <p className="text-lg font-semibold text-emerald-700">{procurementSummary.prReceivedCount}</p>
                          </div>
                          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                            <p className="text-xs text-red-700">PR Pending Receive</p>
                            <p className="text-lg font-semibold text-red-700">{procurementSummary.prPendingCount}</p>
                          </div>
                        </div>

                        {procurementSummary.rows.length ? (
                          <div className="space-y-2">
                            <div className="hidden rounded-md border bg-slate-50 p-2 text-xs font-semibold text-slate-600 md:grid md:grid-cols-7 md:gap-2">
                              <p className="md:col-span-2">Fabric</p>
                              <p>Qty</p>
                              <p>Stock</p>
                              <p>PR</p>
                              <p>Receive</p>
                              <p>Expected Receive</p>
                            </div>
                            {procurementSummary.rows.map((row, idx) => (
                              <div key={`${row.itemName}-${idx}`} className="rounded-md border p-3">
                                <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-7">
                                  <p className="md:col-span-2 font-medium">{row.itemName}</p>
                                  <p>{row.qtyLabel}</p>
                                  <p>{row.stockState}</p>
                                  <p>{row.prStatus}</p>
                                  <p>{row.receiveStatus}</p>
                                  <p>{row.receiveStatus === "Pending Receive" ? row.expectedReceiveLabel : "N/A"}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No fabric details found for this order.</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Order Milestones</CardTitle>
                        <CardDescription>Who completed each milestone and when.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {getNormalizedOrderMilestones(detailsData.order).length ? (
                          getNormalizedOrderMilestones(detailsData.order).map((milestone) => (
                            <div key={`order-ms-row-${milestone.id}`} className="rounded-md border p-3">
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4 text-sm">
                                <DetailField label="Milestone" value={milestone.name} />
                                <DetailField label="Status" value={milestone.completed ? "Completed" : "Pending"} />
                                <DetailField label="Done By" value={milestone.completedBy || "N/A"} />
                                <DetailField label="Done At" value={formatDateTimeLabel(milestone.completedAt)} />
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">No order milestones found.</p>
                        )}
                      </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle>Inbound Details</CardTitle>
                          <CardDescription>
                            PR receive status only: received, pending, and expected receive timeline.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                              <p className="text-xs text-emerald-700">Received</p>
                              <p className="text-lg font-semibold text-emerald-700">
                                {procurementSummary.prReceivedCount}/{procurementSummary.prCreatedCount}
                              </p>
                            </div>
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <p className="text-xs text-amber-700">Pending Receive</p>
                              <p className="text-lg font-semibold text-amber-700">{procurementSummary.prPendingCount}</p>
                            </div>
                            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                              <p className="text-xs text-sky-700">Next Expected Receive</p>
                              <p className="text-sm font-semibold text-sky-800">{procurementSummary.nextReceiveLabel}</p>
                            </div>
                          </div>

                          {procurementSummary.pendingRows.length ? (
                            <div className="rounded-md border">
                              <div className="grid grid-cols-1 gap-2 border-b bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 md:grid-cols-2">
                                <p>Pending PR Item</p>
                                <p>Expected Receive</p>
                              </div>
                              <div className="divide-y">
                                {procurementSummary.pendingRows.map((row, idx) => (
                                  <div
                                    key={`pending-receive-${row.itemName}-${idx}`}
                                    className="grid grid-cols-1 gap-2 px-3 py-2 text-sm md:grid-cols-2"
                                  >
                                    <p className="font-medium">{row.itemName}</p>
                                    <p>{row.expectedReceiveLabel}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No PR items pending receive.</p>
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Stock Verification</CardTitle>
                          <CardDescription>
                            Quick stock readiness for this order.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                              <p className="text-xs text-emerald-700">In Stock</p>
                              <p className="text-lg font-semibold text-emerald-700">{procurementSummary.inStockCount}</p>
                            </div>
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <p className="text-xs text-amber-700">Need PR</p>
                              <p className="text-lg font-semibold text-amber-700">{procurementSummary.prRequiredCount}</p>
                            </div>
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                              <p className="text-xs text-red-700">PR Not Created</p>
                              <p className="text-lg font-semibold text-red-700">
                                {procurementSummary.prNotCreatedCount}
                              </p>
                            </div>
                          </div>
                          {detailsData.inbounds.length ? (
                            <p className="text-xs text-muted-foreground">
                              {detailsData.inbounds.length} inbound request(s) are linked with this deal.
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">No inbound request linked yet.</p>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle>O2D Milestones</CardTitle>
                        <CardDescription>Delivery flow milestones and completion trail.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {detailsData.o2d?.milestones?.length ? (
                          detailsData.o2d.milestones.map((milestone: any, idx: number) => (
                            <div key={`o2d-collection-${milestone.stepId}-${idx}`} className="rounded-md border p-3">
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4 text-sm">
                                <DetailField label="Step" value={`Step ${milestone.stepId}`} />
                                <DetailField label="Status" value={milestone.status} />
                                <DetailField label="Done By" value={milestone.completedBy || "N/A"} />
                                <DetailField label="Done At" value={formatDateTimeLabel(milestone.completedAt)} />
                              </div>
                              {milestone.remarks && (
                                <p className="mt-2 text-xs text-muted-foreground">{milestone.remarks}</p>
                              )}
                            </div>
                          ))
                        ) : (detailsData.order.o2dMilestones || []).length ? (
                          (detailsData.order.o2dMilestones || []).map((milestone, idx) => (
                            <div key={`o2d-legacy-${milestone.stepId}-${idx}`} className="rounded-md border p-3">
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4 text-sm">
                                <DetailField label="Step" value={`Step ${milestone.stepId}`} />
                                <DetailField label="Status" value={milestone.status} />
                                <DetailField label="Done By" value={milestone.completedBy || "N/A"} />
                                <DetailField label="Done At" value={formatDateTimeLabel(milestone.completedAt)} />
                              </div>
                              {milestone.remarks && (
                                <p className="mt-2 text-xs text-muted-foreground">{milestone.remarks}</p>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">No O2D milestones found.</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Moment Updates</CardTitle>
                        <CardDescription>Latest movement with who did it and when it happened.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {detailsData.timeline.length ? (
                          detailsData.timeline.map((timelineItem) => (
                            <div key={timelineItem.id} className="rounded-md border p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-sm">{timelineItem.title}</p>
                                <Badge variant="outline">{timelineItem.source}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {timelineItem.by ? `By ${timelineItem.by}` : "By System"} |{" "}
                                {timelineItem.at ? formatDateTimeLabel(timelineItem.at) : "Time N/A"}
                              </p>
                              {timelineItem.note && (
                                <p className="text-xs text-muted-foreground mt-1">{timelineItem.note}</p>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">No movement updates available.</p>
                        )}
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Enter a value and click search to load full order details.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Milestone Progress</DialogTitle>
            <DialogDescription>Current status for order #{selectedOrder?.crmOrderNo}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {selectedOrder && (
              <MilestoneProgress milestones={getNormalizedOrderMilestones(selectedOrder) as Milestone[]} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default function CrmDashboard({ dashboardType }: { dashboardType: "CRM" | "PC" }) {
  const { user } = useAuth();
  const [assignedSalesmen, setAssignedSalesmen] = useState<string[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);

  useEffect(() => {
    if (!user) return;

    if (dashboardType === "PC") {
      setLoadingAssignments(false);
      return;
    }

    setLoadingAssignments(true);

    const assignmentsQuery = query(
      collection(db, "salesmanCrmAssignments"),
      where("crmUserId", "==", user.id)
    );

    const fetchCrmData = async () => {
      const assignmentsSnapshot = await getDocs(assignmentsQuery);
      const names = assignmentsSnapshot.docs.map((docItem) => docItem.id);
      setAssignedSalesmen(names);
      setLoadingAssignments(false);
    };

    void fetchCrmData();
  }, [user, dashboardType]);

  if (!user || loadingAssignments) {
    return <div className="p-4">Loading dashboard...</div>;
  }

  if (dashboardType === "PC") {
    const isPcReadOnly = user.designation === "PC";
    return (
      <div className="h-full p-4 md:p-6 lg:p-8">
        <PcControlRoom readOnly={isPcReadOnly} />
      </div>
    );
  }

  const crmQuickActions = [
    {
      title: "Order Desk",
      description: "Track order status and milestone completion.",
      href: "/dashboard/orders",
      icon: ListOrdered,
    },
    {
      title: "Visit Planner",
      description: "Manage approved visits and daily schedule.",
      href: "/dashboard/visits",
      icon: Calendar,
    },
    {
      title: "Walk-in Leads",
      description: "Review newly captured walk-in customers.",
      href: "/dashboard/walk-in",
      icon: Activity,
    },
    {
      title: "Customer Hub",
      description: "Open customer records, deals, and communication data.",
      href: "/dashboard/customers",
      icon: FileSignature,
    },
  ] as const;

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <Card className="overflow-hidden border-sky-200 bg-gradient-to-r from-sky-50 via-white to-cyan-50">
        <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">CRM Command Center</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">CRM Home Dashboard</h1>
            <p className="max-w-3xl text-sm text-slate-600 md:text-base">
              Monitor assigned pipelines, follow priority milestones, and keep customer movement updates visible in
              one operational view.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 lg:w-auto lg:min-w-[22rem]">
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
              <p className="text-xs text-muted-foreground">Assigned Salesmen</p>
              <p className="mt-1 text-2xl font-bold">{assignedSalesmen.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
              <p className="text-xs text-muted-foreground">Coverage</p>
              <p className="mt-1 text-2xl font-bold">
                {assignedSalesmen.length ? "Active" : "No Assignment"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {crmQuickActions.map((action) => (
          <Link key={action.href} href={action.href} className="group block">
            <Card className="h-full border-slate-200 transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-center justify-between">
                  <action.icon className="h-5 w-5 text-sky-700" />
                  <ArrowRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{action.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <AllOrdersAndUpdates assignedSalesmen={assignedSalesmen} />
        </div>
        <div>
          <OrderUpdatesFeed heightClassName="h-[42rem]" assignedSalesmen={assignedSalesmen} />
        </div>
      </div>

      <TodayVisits heightClassName="h-[22rem]" />
    </div>
  );
}
