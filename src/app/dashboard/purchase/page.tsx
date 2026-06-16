
"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  Clock3,
  Loader2,
  PackageCheck,
  ReceiptText,
  ShoppingCart,
  Truck,
  Workflow,
} from "lucide-react";
import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest } from "@/lib/types";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { PurchaseRequestTable } from "@/components/features/purchase/PurchaseRequestTable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LucideIcon } from "lucide-react";

const ACTIVE_PURCHASE_STATUSES: PurchaseRequest["status"][] = [
  "Pending Approval",
  "Approved",
  "PO Generated",
  "Cancelled",
];
const HISTORY_PURCHASE_STATUSES = ["Completed", "completed", "Received", "received"] as const;

type PurchaseDashboardCounts = {
  active: number;
  completed: number;
  pendingApproval: number;
  approved: number;
  poGenerated: number;
  cancelled: number;
  inboundPending: number;
  inboundCompleted: number;
  stockVerificationPending: number;
};

const EMPTY_COUNTS: PurchaseDashboardCounts = {
  active: 0,
  completed: 0,
  pendingApproval: 0,
  approved: 0,
  poGenerated: 0,
  cancelled: 0,
  inboundPending: 0,
  inboundCompleted: 0,
  stockVerificationPending: 0,
};

const PurchaseMetricCard = ({
  title,
  value,
  description,
  icon: Icon,
  tone = "neutral",
}: {
  title: string;
  value: number | string | ReactNode;
  description: string;
  icon: LucideIcon;
  tone?: "neutral" | "attention" | "critical" | "good";
}) => {
  const toneClass =
    tone === "critical"
      ? "border-red-200 bg-red-50/70"
      : tone === "attention"
      ? "border-amber-200 bg-amber-50/70"
      : tone === "good"
      ? "border-emerald-200 bg-emerald-50/70"
      : "border-slate-200 bg-white";

  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <Icon className="h-4 w-4 text-slate-600" />
        </div>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
};

export default function PurchasePage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<"active" | "history">("active");
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [counts, setCounts] = useState<PurchaseDashboardCounts>(EMPTY_COUNTS);

  useEffect(() => {
    if (!user) {
      setLoadingCounts(false);
      setCounts(EMPTY_COUNTS);
      return;
    }

    let isCancelled = false;
    const loadCounts = async () => {
      setLoadingCounts(true);
      try {
        const [
          activeSnap,
          completedSnap,
          pendingApprovalSnap,
          approvedSnap,
          poGeneratedSnap,
          cancelledSnap,
          inboundPendingSnap,
          inboundCompletedSnap,
          stockVerificationPendingSnap,
        ] = await Promise.all([
          getCountFromServer(
            query(collection(db, "purchaseRequests"), where("status", "in", ACTIVE_PURCHASE_STATUSES))
          ),
          getCountFromServer(
            query(collection(db, "purchaseRequests"), where("status", "in", [...HISTORY_PURCHASE_STATUSES]))
          ),
          getCountFromServer(
            query(collection(db, "purchaseRequests"), where("status", "==", "Pending Approval"))
          ),
          getCountFromServer(query(collection(db, "purchaseRequests"), where("status", "==", "Approved"))),
          getCountFromServer(query(collection(db, "purchaseRequests"), where("status", "==", "PO Generated"))),
          getCountFromServer(query(collection(db, "purchaseRequests"), where("status", "==", "Cancelled"))),
          getCountFromServer(query(collection(db, "inbounds"), where("status", "==", "Active"))),
          getCountFromServer(query(collection(db, "inbounds"), where("status", "==", "Completed"))),
          getCountFromServer(
            query(collection(db, "approvedStock"), where("status", "==", "Pending Stock Verification"))
          ),
        ]);

        if (!isCancelled) {
          setCounts({
            active: activeSnap.data().count,
            completed: completedSnap.data().count,
            pendingApproval: pendingApprovalSnap.data().count,
            approved: approvedSnap.data().count,
            poGenerated: poGeneratedSnap.data().count,
            cancelled: cancelledSnap.data().count,
            inboundPending: inboundPendingSnap.data().count,
            inboundCompleted: inboundCompletedSnap.data().count,
            stockVerificationPending: stockVerificationPendingSnap.data().count,
          });
        }
      } catch (error) {
        console.error("Error fetching purchase request counts:", error);
        if (!isCancelled) {
          setCounts(EMPTY_COUNTS);
        }
      } finally {
        if (!isCancelled) {
          setLoadingCounts(false);
        }
      }
    };

    void loadCounts();

    return () => {
      isCancelled = true;
    };
  }, [user]);

  const renderMetric = (value: number) => {
    if (loadingCounts) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    return value.toLocaleString();
  };

  const processBase = Math.max(
    1,
    counts.pendingApproval + counts.approved + counts.poGenerated + counts.completed
  );
  const completionRate = Math.round((counts.completed / processBase) * 100);
  const cancellationRate = Math.round(
    (counts.cancelled / Math.max(1, counts.active + counts.completed)) * 100
  );

  const flowStages = [
    {
      label: "Pending Approval",
      count: counts.pendingApproval,
      hint: "Commercial and authorization checks pending",
      bar: "bg-amber-500",
    },
    {
      label: "Approved",
      count: counts.approved,
      hint: "Approved and ready for PO generation",
      bar: "bg-sky-500",
    },
    {
      label: "PO Generated",
      count: counts.poGenerated,
      hint: "PO created and pushed to inbound",
      bar: "bg-indigo-500",
    },
    {
      label: "Completed",
      count: counts.completed,
      hint: "Received and fully closed",
      bar: "bg-emerald-500",
    },
  ];

  const quickActions = [
    {
      title: "SO to PO Generation",
      description: "Create purchase orders from approved sales requirements.",
      href: "/dashboard/purchase/pending-po",
      icon: ShoppingCart,
    },
    {
      title: "PO Tracking",
      description: "Follow PO milestones and supplier follow-ups.",
      href: "/dashboard/po-tracking",
      icon: Workflow,
    },
    {
      title: "Inbound Desk",
      description: "Receive material, verify qty, and print stickers.",
      href: "/dashboard/inbound",
      icon: Truck,
    },
    {
      title: "Stock Verification",
      description: "Resolve in-stock and PR-created verification items.",
      href: "/dashboard/stock-verification",
      icon: ClipboardCheck,
    },
    {
      title: "Debit Notes",
      description: "Create purchase debit notes and transfer them to Zoho.",
      href: "/dashboard/purchase/debit-notes",
      icon: ReceiptText,
    },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <Card className="overflow-hidden border-teal-200 bg-gradient-to-r from-teal-50 via-white to-emerald-50">
        <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Purchase Control Tower</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Purchase Department Dashboard
            </h1>
            <p className="max-w-3xl text-sm text-slate-600 md:text-base">
              Drive PO creation, vendor follow-ups, and inbound closure from one workspace. Watch stage load, surface
              bottlenecks, and keep closure velocity high.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 lg:w-auto lg:min-w-[22rem]">
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
              <p className="text-xs text-muted-foreground">Active Requests</p>
              <p className="mt-1 text-2xl font-bold">{renderMetric(counts.active)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
              <p className="text-xs text-muted-foreground">Completion Rate</p>
              <p className="mt-1 text-2xl font-bold">{loadingCounts ? <Loader2 className="h-4 w-4 animate-spin" /> : `${completionRate}%`}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {quickActions.map((action) => (
          <Link key={action.href} href={action.href} className="group block">
            <Card className="h-full border-slate-200 transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-center justify-between">
                  <action.icon className="h-5 w-5 text-teal-700" />
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <PurchaseMetricCard
          title="Pending Approval"
          value={renderMetric(counts.pendingApproval)}
          description="Requests waiting for approval checks."
          icon={Clock3}
          tone="attention"
        />
        <PurchaseMetricCard
          title="Approved"
          value={renderMetric(counts.approved)}
          description="Approved and ready for PO generation."
          icon={ClipboardCheck}
          tone="neutral"
        />
        <PurchaseMetricCard
          title="PO Generated"
          value={renderMetric(counts.poGenerated)}
          description="In vendor execution / inbound pipeline."
          icon={ShoppingCart}
          tone="neutral"
        />
        <PurchaseMetricCard
          title="Completed"
          value={renderMetric(counts.completed)}
          description="Closed requests with material received."
          icon={PackageCheck}
          tone="good"
        />
        <PurchaseMetricCard
          title="Cancelled"
          value={renderMetric(counts.cancelled)}
          description="Cancelled requests to review."
          icon={AlertTriangle}
          tone="critical"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="border-slate-200 xl:col-span-2">
          <CardHeader>
            <CardTitle>Stage Distribution</CardTitle>
            <CardDescription>Current load across purchase workflow stages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {flowStages.map((stage) => {
              const pct = Math.max(0, Math.round((stage.count / processBase) * 100));
              return (
                <div key={stage.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{stage.label}</p>
                      <p className="text-xs text-muted-foreground">{stage.hint}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{loadingCounts ? <Loader2 className="h-4 w-4 animate-spin" /> : stage.count}</p>
                      <p className="text-xs text-muted-foreground">{loadingCounts ? "-" : `${pct}%`}</p>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${stage.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Operations Pulse</CardTitle>
            <CardDescription>Cross-module signals for purchase control.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-muted-foreground">Inbound Pending</p>
              <p className="mt-1 text-2xl font-bold">{renderMetric(counts.inboundPending)}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-muted-foreground">Inbound Completed</p>
              <p className="mt-1 text-2xl font-bold">{renderMetric(counts.inboundCompleted)}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-muted-foreground">Stock Verification Pending</p>
              <p className="mt-1 text-2xl font-bold">{renderMetric(counts.stockVerificationPending)}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-muted-foreground">Cancellation Rate</p>
              <p className="mt-1 text-2xl font-bold">
                {loadingCounts ? <Loader2 className="h-4 w-4 animate-spin" /> : `${cancellationRate}%`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3 pt-1">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Purchase Requests</h2>
            <p className="text-sm text-muted-foreground">
              Switch between active workload and historical closure records.
            </p>
          </div>
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as "active" | "history")}
            className="w-full md:w-auto"
          >
            <TabsList className="grid w-full grid-cols-2 md:w-[320px]">
              <TabsTrigger value="active">Active Purchases</TabsTrigger>
              <TabsTrigger value="history">Purchase History</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <PurchaseRequestTable mode={mode} />
    </div>
  );
}
