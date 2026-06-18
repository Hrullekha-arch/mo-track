"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Invoice, Order, Quotation, User } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileSignature,
  FileText,
  HandCoins,
  ListOrdered,
  Loader2,
  Printer,
  ReceiptText,
  ShieldCheck,
  Wallet,
  ClipboardList,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { LeaveWidget } from "@/components/features/dashboard/LeaveWidget";
import { format, formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintableQuotationProfessional } from "@/components/features/order-management/PrintableQuotationProfessional";
import { PrintableInvoice } from "@/components/features/invoice/PrintableInvoice";
import { PrintableOrder } from "../order-management/PrintableOrder";
import { buildPrintablePayloadFromInvoice } from "@/lib/invoice-utils";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { TimesheetPanel } from "@/components/features/dashboard/TimesheetPanel";

type CountsState = {
  pendingQuotations: number;
  pendingOrders: number;
  pendingPayments: number;
  pendingInvoice: number;
};

type RecentActivityItem = {
  id: string;
  type: "Quotation" | "Order" | "Invoice";
  identifier: string;
  customerName: string;
  dealId?: string;
  amount: number;
  activityDate: string;
  data: Quotation | Order | Invoice;
};

const parseDateSafe = (value: unknown) => {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const MetricCard = ({
  title,
  value,
  description,
  icon: Icon,
  loading,
  tone = "neutral",
  link,
  blink = false,
}: {
  title: string;
  value: number;
  description: string;
  icon: LucideIcon;
  loading: boolean;
  link: string;
  tone?: "neutral" | "attention" | "critical" | "good";
  blink?: boolean;
}) => {
  const toneClass =
    tone === "critical"
      ? "border-red-200 bg-red-50/60"
      : tone === "attention"
      ? "border-amber-200 bg-amber-50/60"
      : tone === "good"
      ? "border-emerald-200 bg-emerald-50/60"
      : "border-slate-200 bg-white";

  const router = useRouter();

  return (
    <Card
      className={`${toneClass} cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md ${blink ? "animate-pulse ring-1 ring-amber-300" : ""}`}
      onClick={() => router.push(link)}
    >
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <Icon className="h-4 w-4 text-slate-600" />
        </div>
        {loading ? <Skeleton className="h-9 w-16" /> : <p className="text-3xl font-bold tracking-tight">{value}</p>}
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
};

const activityTypeIcon: Record<RecentActivityItem["type"], LucideIcon> = {
  Quotation: FileSignature,
  Order: ListOrdered,
  Invoice: ReceiptText,
};

const activityBadgeClass: Record<RecentActivityItem["type"], string> = {
  Quotation: "border-sky-200 bg-sky-50 text-sky-700",
  Order: "border-indigo-200 bg-indigo-50 text-indigo-700",
  Invoice: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function AccountsDashboard() {
  const [counts, setCounts] = useState<CountsState>({
    pendingQuotations: 0,
    pendingOrders: 0,
    pendingPayments: 0,
    pendingInvoice: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedItem, setSelectedItem] = useState<RecentActivityItem | null>(null);

  useEffect(() => {
    const usersQuery = query(collection(db, "users"));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      setAllUsers(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() } as User)));
    });

    const processData = async () => {
      setLoading(true);
      try {
        const quotationsQuery = query(collectionGroup(db, "quotations"), limit(500));
        const ordersQuery = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(1000));
        const invoicesQuery = query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(15));

        const [quotationsSnapshot, ordersSnapshot, invoicesSnapshot] = await Promise.all([
          getDocs(quotationsQuery),
          getDocs(ordersQuery),
          getDocs(invoicesQuery),
        ]);

        const quotationsData = quotationsSnapshot.docs.map(
          (docItem) => ({ ...docItem.data(), id: docItem.id } as Quotation & { id: string })
        );
        const ordersData = ordersSnapshot.docs.map((docItem) => ({ ...docItem.data(), id: docItem.id } as Order));
        const invoicesData = invoicesSnapshot.docs.map((docItem) => ({ ...docItem.data(), id: docItem.id } as Invoice));

        setCounts({
          pendingQuotations: quotationsData.filter((item) => item.status === "Pending Approval").length,
          pendingOrders: ordersData.filter((item) => item.status === "Pending Approval").length,
          pendingPayments: ordersData.filter((item) => item.balanceFollowUp && !item.paymentConfirmed).length,
          pendingInvoice: ordersData.filter(
            (item) =>
              item.invoicing?.invoiceRequired !== false &&
              item.invoicing?.status &&
              item.invoicing.status !== "INVOICED"
          ).length,
        });

        const approvedQuotes: RecentActivityItem[] = quotationsData
          .filter((item) => item.status === "Approved" && item.approvedAt)
          .map((item) => ({
            id: item.id,
            type: "Quotation",
            identifier: item.quotationNo,
            customerName: item.customerName,
            amount: item.totalAmount || 0,
            activityDate: item.approvedAt || item.createdAt,
            data: item,
            dealId: (item as any).dealId,
          }));

        const approvedOrders: RecentActivityItem[] = ordersData
          .filter((item) => item.status === "Approved" && item.approvedAt)
          .map((item) => ({
            id: item.id,
            type: "Order",
            identifier: item.crmOrderNo,
            customerName: item.customerName,
            amount: item.totalAmount || 0,
            activityDate: item.approvedAt || item.createdAt,
            data: item,
            dealId: item.dealId,
          }));

        const recentInvoices: RecentActivityItem[] = invoicesData.map((item) => ({
          id: item.id,
          type: "Invoice",
          identifier: item.invoiceNo,
          customerName: item.customerSnapshot?.name || item.customer?.name || "-",
          amount: item.totals?.grandTotal ?? item.overallSummary?.grandTotal ?? 0,
          activityDate: item.createdAt,
          data: item,
          dealId: (item as any).dealId,
        }));

        setRecentActivity(
          [...approvedQuotes, ...approvedOrders, ...recentInvoices]
            .sort((a, b) => {
              const aTime = parseDateSafe(a.activityDate)?.getTime() || 0;
              const bTime = parseDateSafe(b.activityDate)?.getTime() || 0;
              return bTime - aTime;
            })
            .slice(0, 12)
        );
      } catch (error) {
        console.error("Failed to load accounts dashboard data:", error);
        setCounts({
          pendingQuotations: 0,
          pendingOrders: 0,
          pendingPayments: 0,
          pendingInvoice: 0,
        });
        setRecentActivity([]);
      } finally {
        setLoading(false);
      }
    };

    void processData();

    return () => {
      unsubscribeUsers();
    };
  }, []);

  const dashboardItems = [
    {
      title: "Quotation Approvals",
      description: "Review pending quotation approvals.",
      count: counts.pendingQuotations,
      href: "/dashboard/approvals?tab=quotations",
      icon: FileSignature,
      tone: "attention" as const,
      blink: counts.pendingQuotations > 0,
    },
    {
      title: "Order Approvals",
      description: "Confirm and clear pending order approvals.",
      count: counts.pendingOrders,
      href: "/dashboard/approvals?tab=orders",
      icon: ListOrdered,
      tone: "attention" as const,
      blink: false,
    },
    {
      title: "Payment Confirmation",
      description: "Handle balance follow-ups and confirmations.",
      count: counts.pendingPayments,
      href: "/dashboard/approvals?tab=payment-confirmation",
      icon: HandCoins,
      tone: "critical" as const,
      blink: false,
    },
    {
      title: "Invoice Generation",
      description: "Generate invoices for ready orders.",
      count: counts.pendingInvoice,
      href: "/dashboard/invoice",
      icon: FileText,
      tone: "neutral" as const,
      blink: false,
    },
  ];

  const totalQueueLoad =
    counts.pendingQuotations + counts.pendingOrders + counts.pendingPayments + counts.pendingInvoice;

  const sevenDayProcessedValue = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    return recentActivity
      .filter((item) => {
        const time = parseDateSafe(item.activityDate)?.getTime();
        return typeof time === "number" && time >= sevenDaysAgo;
      })
      .reduce((sum, item) => sum + (item.amount || 0), 0);
  }, [recentActivity]);

  const handlePrint = () => {
    const printContent = document.getElementById("printable-dialog-content");
    if (!printContent) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write("<html><head><title>Print</title></head><body>");
    printWindow.document.write(printContent.innerHTML);
    printWindow.document.write("</body></html>");
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const renderActivityTitle = (item: RecentActivityItem) => {
    if (item.type === "Order" && item.dealId) {
      return `Order #${item.identifier} (Deal #${item.dealId})`;
    }
    return `${item.type} #${item.identifier}`;
  };

  return (
    <>
      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        <Card className="overflow-hidden border-sky-200 bg-gradient-to-r from-sky-50 via-white to-blue-50">
          <CardContent className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Accounts Control Center</p>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Accounts Home Dashboard
              </h1>
              <p className="max-w-3xl text-sm text-slate-600 md:text-base">
                Prioritize approvals, clear payment confirmations, and close invoices faster with a single operational
                view tailored for the Accounts team.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:min-w-[24rem]">
              <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
                <p className="text-xs text-muted-foreground">Queue Load</p>
                {loading ? (
                  <Loader2 className="mt-1 h-5 w-5 animate-spin" />
                ) : (
                  <p className="mt-1 text-2xl font-bold">{totalQueueLoad}</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
                <p className="text-xs text-muted-foreground">7 Day Processed Value</p>
                {loading ? (
                  <Loader2 className="mt-1 h-5 w-5 animate-spin" />
                ) : (
                  <p className="mt-1 text-lg font-bold">{formatCurrency(sevenDayProcessedValue)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="ml-auto w-full max-w-xl">
          <LeaveWidget />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Link href="/dashboard/approvals" className="group block">
            <Card className="h-full border-slate-200 transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <ShieldCheck className="h-5 w-5 text-sky-700" />
                  <ArrowRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">Approvals Desk</p>
                <p className="text-xs text-muted-foreground">Open quotation, order, and payment approval queues.</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/invoice" className="group block">
            <Card className="h-full border-slate-200 transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <ReceiptText className="h-5 w-5 text-sky-700" />
                  <ArrowRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">Invoice Desk</p>
                <p className="text-xs text-muted-foreground">Generate, validate, and print invoices for ready orders.</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/orders" className="group block">
            <Card className="h-full border-slate-200 transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <CreditCard className="h-5 w-5 text-sky-700" />
                  <ArrowRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">Order Ledger</p>
                <p className="text-xs text-muted-foreground">Track approved orders and finance-relevant checkpoints.</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/purchase-entry" className="group block">
            <Card className="h-full border-slate-200 transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <ClipboardList className="h-5 w-5 text-sky-700" />
                  <ArrowRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">Purchase Entry Desk</p>
                <p className="text-xs text-muted-foreground">Verify received PO lengths before allocation.</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/account" className="group block">
            <Card className="h-full border-slate-200 transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <Wallet className="h-5 w-5 text-sky-700" />
                  <ArrowRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">Account Settings</p>
                <p className="text-xs text-muted-foreground">Manage profile, preferences, and handover settings.</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dashboardItems.map((item) => (
            <MetricCard
              key={item.title}
              title={item.title}
              value={item.count}
              description={item.description}
              icon={item.icon}
              loading={loading}
              tone={item.tone}
              link={item.href}
              blink={item.blink}
            />
          ))}
        </div>

        <TimesheetPanel />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="border-slate-200 xl:col-span-2">
            <CardHeader>
              <CardTitle>Queue Distribution</CardTitle>
              <CardDescription>Current workload split for Accounts operations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {dashboardItems.map((item) => {
                const pct = totalQueueLoad ? Math.round((item.count / totalQueueLoad) * 100) : 0;
                return (
                  <div key={item.title} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <p className="font-medium text-slate-900">{item.title}</p>
                      <p className="text-muted-foreground">{loading ? "-" : `${item.count} (${pct}%)`}</p>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Control Signals</CardTitle>
              <CardDescription>Quick health indicators for daily review.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs text-muted-foreground">Total Pending Actions</p>
                {loading ? <Loader2 className="mt-1 h-5 w-5 animate-spin" /> : <p className="mt-1 text-2xl font-bold">{totalQueueLoad}</p>}
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs text-muted-foreground">Processed Documents (Recent)</p>
                {loading ? <Loader2 className="mt-1 h-5 w-5 animate-spin" /> : <p className="mt-1 text-2xl font-bold">{recentActivity.length}</p>}
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs text-muted-foreground">Recent Processed Value</p>
                {loading ? (
                  <Loader2 className="mt-1 h-5 w-5 animate-spin" />
                ) : (
                  <p className="mt-1 text-lg font-bold">{formatCurrency(sevenDayProcessedValue)}</p>
                )}
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs text-muted-foreground">Average Queue Age (Info)</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                  <Clock3 className="h-4 w-4" />
                  Monitor using Recent Activity feed
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Recent Activity Feed</CardTitle>
            <CardDescription>
              Latest approved quotations, approved orders, and recently generated invoices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)
              ) : recentActivity.length > 0 ? (
                recentActivity.map((item) => {
                  const Icon = activityTypeIcon[item.type];
                  const activityDate = parseDateSafe(item.activityDate);
                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex items-start gap-3">
                        <div className="rounded-full bg-slate-100 p-2 text-slate-700">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">{renderActivityTitle(item)}</p>
                            <Badge variant="outline" className={activityBadgeClass[item.type]}>
                              {item.type}
                            </Badge>
                            {item.type === "Invoice" && (
                              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Processed
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{item.customerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {activityDate
                              ? `${formatDistanceToNow(activityDate, { addSuffix: true })} • ${format(
                                  activityDate,
                                  "dd MMM yyyy, hh:mm a"
                                )}`
                              : "Date unavailable"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 md:justify-end">
                        <p className="text-sm font-bold">{formatCurrency(item.amount)}</p>
                        <Button variant="outline" size="sm" onClick={() => setSelectedItem(item)}>
                          Preview
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No recent activity found.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="flex h-[92vh] max-w-7xl flex-col">
          <DialogHeader>
            <DialogTitle>Document Preview</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto" id="printable-dialog-content">
            {selectedItem?.type === "Quotation" ? (
              <PrintableQuotationProfessional
                values={selectedItem.data as Quotation}
                creatorName={allUsers.find((item) => item.id === (selectedItem.data as Quotation).createdBy)?.name}
                salesmanName={allUsers.find((item) => item.id === (selectedItem.data as Quotation).representativeId)?.name}
              />
            ) : selectedItem?.type === "Invoice" ? (
              <PrintableInvoice payload={buildPrintablePayloadFromInvoice(selectedItem.data as Invoice)} />
            ) : selectedItem?.type === "Order" ? (
              <PrintableOrder order={selectedItem.data as Order} />
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <p>Select an item to see preview.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelectedItem(null)}>
              Close
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
