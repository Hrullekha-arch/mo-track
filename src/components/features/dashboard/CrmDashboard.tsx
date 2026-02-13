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
import { Customer, Deal, DealVisit, Milestone, Order, PurchaseRequest } from "@/lib/types";
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

const deriveOrderMonitor = (order: Order): OrderMonitorRow => {
  console.log("Order Data:", order); 
  const milestones = order.milestones || [];
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter((step) => step.completed).length;
  const orderType= order.orderType || "-";
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

const OrderUpdatesFeed = ({ heightClassName = "h-[26rem]" }: { heightClassName?: string }) => {
  const [updates, setUpdates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
    }

    return (
      <Link
        href={link}
        key={notification.id}
        className="block"
        onClick={() => void handleMarkAsRead(notification.id)}
      >
        <div
          className={`rounded-lg border p-3 transition-colors hover:bg-muted/40 ${cardClass} ${
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
          </div>
        </div>
      </Link>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Updates</CardTitle>
        <div className="relative pt-2">
          <Search className="absolute left-2.5 top-4.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search updates..."
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
              Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)
            ) : filteredUpdates.length > 0 ? (
              filteredUpdates.map((update) => renderNotification(update))
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No recent updates.</p>
            )}
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today's Visit Plan</CardTitle>
        <CardDescription>Approved customer visits scheduled for today.</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className={heightClassName}>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 w-full" />)
            ) : visits.length > 0 ? (
              visits.map((visit) => {
                const dueDate = toDateSafe(visit.dueDate);
                return (
                  <div key={visit.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="font-semibold">{visit.customerName}</p>
                    <p className="text-sm text-muted-foreground">{visit.dealName}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock3 className="h-3 w-3" />
                        {dueDate ? format(dueDate, "h:mm a") : "Time N/A"}
                      </span>
                      <span>{visit.customerPhone}</span>
                      <Badge variant="outline" className="capitalize">
                        {visit.typeOfVisit || "visit"}
                      </Badge>
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

  return (
    <>
      <Card className="h-full">
        <CardHeader>
          <CardTitle>All Orders And Updates</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(50vh-8rem)]">
            <div className="space-y-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)
              ) : orders.length > 0 ? (
                orders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
                  >
                    <div>
                      <div className="flex justify-between items-start">
                      <p className="font-semibold">{order.customerName}</p>
                      <Badge variant="secondary" className="ml-2">{order.orderType || "-"}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {order.crmOrderNo} - {order.salesPerson}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(order)}>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No orders assigned.</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Milestone Progress</DialogTitle>
            <DialogDescription>Current status for order #{selectedOrder?.crmOrderNo}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {selectedOrder && <MilestoneProgress milestones={selectedOrder.milestones} />}
          </div>
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

  return (
    <>
      <div className="space-y-6">
        <Card className="border-slate-200 bg-gradient-to-r from-slate-50 via-white to-emerald-50">
          <CardHeader>
            <CardTitle className="text-2xl">PC Control Room</CardTitle>
            <CardDescription>
              Monitor process flow, catch bottlenecks early, and drive order completion across purchase,
              inbound, and delivery milestones.
            </CardDescription>
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

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Milestone Progress</DialogTitle>
            <DialogDescription>Current status for order #{selectedOrder?.crmOrderNo}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {selectedOrder && (
              <MilestoneProgress milestones={(selectedOrder.milestones || []) as Milestone[]} />
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

  return (
    <div className="h-full p-4 md:p-6 lg:p-8">
      <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="flex-1">
            <AllOrdersAndUpdates assignedSalesmen={assignedSalesmen} />
          </div>
          <div className="flex-1">
            <TodayVisits />
          </div>
        </div>
        <div className="h-full lg:col-span-1">
          <OrderUpdatesFeed heightClassName="h-[calc(100vh-16rem)]" />
        </div>
      </div>
    </div>
  );
}
