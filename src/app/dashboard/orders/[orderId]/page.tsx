"use client";

import * as React from "react";
import { use } from "react";
import dynamic from "next/dynamic";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getNormalizedOrderMilestones } from "@/lib/order-workflow";

// Lazy load heavy components
const CustomerInfoCard = dynamic(
  () => import("@/components/features/orders/CustomerInfoCard"),
  { loading: () => <Skeleton className="h-44 w-full" /> }
);

const OrderItemsTable = dynamic(
  () => import("@/components/features/orders/OrderItemsTable"),
  { loading: () => <Skeleton className="h-64 w-full" /> }
);

const VasDetailsTable = dynamic(
  () => import("@/components/features/orders/VasDetailsTable"),
  { loading: () => <Skeleton className="h-40 w-full" /> }
);

const MilestoneCard = dynamic(
  () => import("@/components/features/orders/MilestoneCard"),
  { loading: () => <Skeleton className="h-80 w-full" /> }
);

export default function OrderDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const params = use(paramsPromise);
  const { orderId } = params;

  // Order state - null = loading, undefined = not found
  const [order, setOrder] = React.useState<Order | null | undefined>(null);
  const [orderReady, setOrderReady] = React.useState(false);
  
  // Incremental refresh - only affected items re-fetch
  const [lastAllocation, setLastAllocation] = React.useState<{
    bcn: string;
    timestamp: number;
  } | null>(null);

  const { role } = useAuth();
  const { toast } = useToast();

  const normalizedMilestones = React.useMemo(
    () => (order ? getNormalizedOrderMilestones(order) : []),
    [order]
  );

  // Two-phase data loading: eager cache read + live listener
  React.useEffect(() => {
    const ref = doc(db, "orders", orderId);

    // Phase A: Eager cache read (instant on repeat visits)
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          setOrder({ id: snap.id, ...snap.data() } as Order);
          setOrderReady(true);
        }
      })
      .catch(() => {
        // Ignore - onSnapshot handles errors
      });

    // Phase B: Live listener
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setOrder(
          snap.exists()
            ? ({ id: snap.id, ...snap.data() } as Order)
            : undefined
        );
        setOrderReady(true);
      },
      (err) => {
        console.error("Order snapshot error:", err);
        setOrderReady(true);
      }
    );

    return unsubscribe;
  }, [orderId]);

  const handleAllocationSuccess = React.useCallback((bcn?: string) => {
    // Only trigger re-fetch for the specific item, not entire table
    if (bcn) {
      setLastAllocation({ bcn, timestamp: Date.now() });
    }
  }, []);

  const handleManualRefresh = React.useCallback(() => {
    // Force full refresh
    setLastAllocation({ bcn: "*", timestamp: Date.now() });
    toast({ title: "Refreshing allocation data..." });
  }, [toast]);

  // Header renders instantly (LCP element)
  return (
    <div className="p-4 md:p-6 lg:p-8 w-full">
      {/* Header - renders immediately */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          asChild
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
        >
          <Link href="/dashboard/orders">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">
              Order Details
            </h1>
            {order && (
              <Badge variant="outline" className="font-mono text-xs">
                {order.id}
              </Badge>
            )}
          </div>
          {order ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              {order.customerName} · {order.crmOrderNo}
            </p>
          ) : (
            <Skeleton className="h-3 w-48 mt-1.5" />
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleManualRefresh}
          title="Refresh allocation data"
          disabled={!orderReady}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Body - fades in when ready */}
      {!orderReady ? (
        <div className="grid gap-6 lg:grid-cols-3 animate-pulse">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      ) : order === undefined ? (
        <div className="p-8 text-center space-y-3">
          <h2 className="text-lg font-semibold">Order not found</h2>
          <p className="text-muted-foreground text-sm">
            No order with ID <code className="font-mono">{orderId}</code>.
          </p>
          <Button asChild variant="link">
            <Link href="/dashboard/orders">← Go back</Link>
          </Button>
        </div>
      ) : (
        <div
          className="grid gap-6 lg:grid-cols-3"
          style={{ animation: "fadeIn 0.15s ease-out" }}
        >
          <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }`}</style>

          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            <CustomerInfoCard
              order={order}
              normalizedMilestones={normalizedMilestones}
            />

            <OrderItemsTable
              order={order}
              orderId={orderId}
              onAllocationSuccess={handleAllocationSuccess}
              lastAllocation={lastAllocation}
            />

            <VasDetailsTable order={order} />
          </div>

          {/* Right column */}
          <div>
            <MilestoneCard
              order={order}
              milestones={normalizedMilestones}
              role={role}
            />
          </div>
        </div>
      )}
    </div>
  );
}