"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, query } from "firebase/firestore";
import { differenceInCalendarDays, format } from "date-fns";

import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { getNormalizedOrderMilestones } from "@/lib/order-workflow";
import { Order, PurchaseRequest, User } from "@/lib/types";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type OrderRisk = "critical" | "watch" | "stable";
const ALL_ROLES = "__all_roles__";

interface OrderMonitorRow {
  order: Order;
  progress: number;
  currentStep: string;
  nextStep: string;
  ageDays: number;
  risk: OrderRisk;
}

interface UserReportRow {
  user: User;
  workScope: string;
  assignedSalesmen: string[];
  orderMonitors: OrderMonitorRow[];
  purchaseRows: PurchaseRequest[];
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  criticalOrders: number;
  pendingApprovalOrders: number;
  averageProgress: number;
  purchasePending: number;
  purchaseCompleted: number;
}

const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase();

const toDateSafe = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const date = (value as { toDate?: () => Date }).toDate?.();
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  }
  return null;
};

const formatDateTimeLabel = (value: unknown) => {
  const date = toDateSafe(value);
  if (!date) return "N/A";
  return format(date, "dd MMM yyyy, hh:mm a");
};

const deriveOrderMonitor = (order: Order): OrderMonitorRow => {
  const milestones = getNormalizedOrderMilestones(order);
  const completedMilestones = milestones.filter((step) => step.completed).length;
  const progress = milestones.length ? Math.round((completedMilestones / milestones.length) * 100) : 0;
  const currentStep = [...milestones].reverse().find((step) => step.completed)?.name || "Order Created";
  const nextStep =
    milestones.find((step) => !step.completed)?.name || (milestones.length ? "Completed" : "Milestone Pending");
  const createdAt = toDateSafe(order.createdAt) || new Date();
  const ageDays = Math.max(0, differenceInCalendarDays(new Date(), createdAt));

  let risk: OrderRisk = "stable";
  if (progress < 100 && (ageDays >= 14 || (ageDays >= 10 && progress < 60))) risk = "critical";
  else if (progress < 100 && (ageDays >= 7 || progress < 75)) risk = "watch";

  return { order, progress, currentStep, nextStep, ageDays, risk };
};

const riskBadgeClassMap: Record<OrderRisk, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  watch: "border-amber-200 bg-amber-50 text-amber-700",
  stable: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export default function UserReportPage() {
  const { user, role, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [crmAssignments, setCrmAssignments] = useState<Record<string, string[]>>({});
  const [loadingData, setLoadingData] = useState(true);

  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL_ROLES);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [detailSearch, setDetailSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [masterExporting, setMasterExporting] = useState(false);
  const [multiExportOpen, setMultiExportOpen] = useState(false);
  const [multiExporting, setMultiExporting] = useState(false);
  const [multiExportSearch, setMultiExportSearch] = useState("");
  const [multiSelectedUserIds, setMultiSelectedUserIds] = useState<string[]>([]);

  useEffect(() => {
    let readyUsers = false;
    let readyOrders = false;
    let readyPr = false;
    let readyAssignments = false;
    const updateLoading = () => setLoadingData(!(readyUsers && readyOrders && readyPr && readyAssignments));

    const unsubUsers = onSnapshot(query(collection(db, "users")), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as User));
      rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      setUsers(rows);
      readyUsers = true;
      updateLoading();
    });

    const unsubOrders = onSnapshot(query(collection(db, "orders"), limit(2000)), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
      rows.sort((a, b) => (toDateSafe(b.createdAt)?.getTime() || 0) - (toDateSafe(a.createdAt)?.getTime() || 0));
      setOrders(rows);
      readyOrders = true;
      updateLoading();
    });

    const unsubPr = onSnapshot(query(collection(db, "purchaseRequests"), limit(2000)), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PurchaseRequest));
      rows.sort((a, b) => (toDateSafe(b.createdAt)?.getTime() || 0) - (toDateSafe(a.createdAt)?.getTime() || 0));
      setPurchaseRequests(rows);
      readyPr = true;
      updateLoading();
    });

    const unsubAssignments = onSnapshot(query(collection(db, "salesmanCrmAssignments")), (snap) => {
      const map: Record<string, string[]> = {};
      snap.docs.forEach((d) => {
        const crmUserId = String((d.data() as any)?.crmUserId || "").trim();
        if (!crmUserId) return;
        if (!map[crmUserId]) map[crmUserId] = [];
        map[crmUserId].push(d.id);
      });
      setCrmAssignments(map);
      readyAssignments = true;
      updateLoading();
    });

    return () => {
      unsubUsers();
      unsubOrders();
      unsubPr();
      unsubAssignments();
    };
  }, []);

  const reportRows = useMemo(() => {
    return users
      .map((targetUser) => {
        const userNameNorm = normalizeText(targetUser.name);
        const assignedSalesmen = crmAssignments[targetUser.id] || [];
        const assignedSalesmanNormSet = new Set(assignedSalesmen.map((name) => normalizeText(name)));

        let linkedOrders: Order[] = [];
        let linkedPr: PurchaseRequest[] = [];
        let workScope = "Records created by this user";

        if (targetUser.role === "salesman") {
          linkedOrders = orders.filter(
            (o) => normalizeText(o.salesPerson) === userNameNorm || String(o.representativeId || "") === targetUser.id
          );
          linkedPr = purchaseRequests.filter((pr) => normalizeText(pr.salesman) === userNameNorm);
          workScope = "Salesman orders and related PR";
        } else if (targetUser.role === "employee" && targetUser.designation === "CRM") {
          linkedOrders = orders.filter(
            (o) => assignedSalesmanNormSet.has(normalizeText(o.salesPerson)) || String(o.handledByCrm || "") === targetUser.id
          );
          const dealSet = new Set(linkedOrders.map((o) => String(o.dealId || "")));
          linkedPr = purchaseRequests.filter(
            (pr) => assignedSalesmanNormSet.has(normalizeText(pr.salesman)) || dealSet.has(String(pr.dealId || ""))
          );
          workScope = "Assigned salesmen order pipeline";
        } else if (targetUser.role === "Purchase") {
          linkedPr = purchaseRequests.filter(
            (pr) => String(pr.createdBy?.id || "") === targetUser.id || normalizeText(pr.createdBy?.name) === userNameNorm
          );
          const dealSet = new Set(linkedPr.map((pr) => String(pr.dealId || "")));
          linkedOrders = orders.filter((o) => dealSet.has(String(o.dealId || "")));
          workScope = "PR creation and PO completion";
        } else if (targetUser.role === "installer") {
          linkedOrders = orders.filter((o) => String(o.assignedTo || "") === targetUser.id);
          workScope = "Installer-assigned orders";
        } else if (targetUser.role === "employee" && targetUser.designation === "PC") {
          linkedOrders = orders;
          linkedPr = purchaseRequests;
          workScope = "PC full control room visibility";
        } else if (targetUser.role === "Accounts") {
          linkedOrders = orders.filter((o) => {
            const status = normalizeText(o.status);
            return status === "pending approval" || status === "balancefollowup" || status === "approved";
          });
          workScope = "Approval and account follow-up queue";
        } else {
          linkedOrders = orders.filter((o) => String(o.createdBy?.id || "") === targetUser.id);
          linkedPr = purchaseRequests.filter((pr) => String(pr.createdBy?.id || "") === targetUser.id);
        }

        const orderMonitors = linkedOrders.map((orderItem) => deriveOrderMonitor(orderItem));
        const totalOrders = orderMonitors.length;
        const pendingOrders = orderMonitors.filter((m) => m.progress < 100).length;
        const completedOrders = totalOrders - pendingOrders;
        const criticalOrders = orderMonitors.filter((m) => m.risk === "critical" && m.progress < 100).length;
        const pendingApprovalOrders = linkedOrders.filter((o) => normalizeText(o.status) === "pending approval").length;
        const averageProgress = totalOrders
          ? Math.round(orderMonitors.reduce((sum, m) => sum + m.progress, 0) / totalOrders)
          : 0;

        const purchasePending = linkedPr.filter((pr) => {
          const status = normalizeText(pr.status);
          return status === "pending approval" || status === "approved" || status === "po generated";
        }).length;
        const purchaseCompleted = linkedPr.filter((pr) => normalizeText(pr.status) === "completed").length;

        return {
          user: targetUser,
          workScope,
          assignedSalesmen,
          orderMonitors,
          purchaseRows: linkedPr,
          totalOrders,
          pendingOrders,
          completedOrders,
          criticalOrders,
          pendingApprovalOrders,
          averageProgress,
          purchasePending,
          purchaseCompleted,
        } as UserReportRow;
      })
      .sort((a, b) => b.pendingOrders - a.pendingOrders || b.totalOrders - a.totalOrders);
  }, [users, orders, purchaseRequests, crmAssignments]);

  const filteredRows = useMemo(() => {
    const queryText = normalizeText(userSearch);
    return reportRows.filter((row) => {
      if (roleFilter !== ALL_ROLES && row.user.role !== roleFilter) return false;
      if (!queryText) return true;
      return (
        normalizeText(row.user.name).includes(queryText) ||
        normalizeText(row.user.email).includes(queryText) ||
        normalizeText(row.user.role).includes(queryText) ||
        normalizeText(row.user.designation).includes(queryText)
      );
    });
  }, [reportRows, userSearch, roleFilter]);

  useEffect(() => {
    if (!selectedUserId && filteredRows.length) setSelectedUserId(filteredRows[0].user.id);
    if (selectedUserId && !filteredRows.some((r) => r.user.id === selectedUserId)) {
      setSelectedUserId(filteredRows[0]?.user.id || "");
    }
  }, [filteredRows, selectedUserId]);

  const selectedRow = useMemo(() => reportRows.find((row) => row.user.id === selectedUserId) || null, [reportRows, selectedUserId]);

  const filteredMonitors = useMemo(() => {
    if (!selectedRow) return [];
    const queryText = normalizeText(detailSearch);
    if (!queryText) return selectedRow.orderMonitors;
    return selectedRow.orderMonitors.filter((m) => {
      return (
        normalizeText(m.order.crmOrderNo || m.order.id).includes(queryText) ||
        normalizeText(m.order.customerName).includes(queryText) ||
        normalizeText(m.order.salesPerson).includes(queryText) ||
        normalizeText(m.currentStep).includes(queryText) ||
        normalizeText(m.nextStep).includes(queryText)
      );
    });
  }, [selectedRow, detailSearch]);

  const roleOptions = useMemo(() => Array.from(new Set(users.map((entry) => entry.role))).sort(), [users]);
  const multiExportRows = useMemo(() => {
    const queryText = normalizeText(multiExportSearch);
    if (!queryText) return reportRows;
    return reportRows.filter((row) => {
      return (
        normalizeText(row.user.name).includes(queryText) ||
        normalizeText(row.user.email).includes(queryText) ||
        normalizeText(row.user.role).includes(queryText) ||
        normalizeText(row.user.designation).includes(queryText)
      );
    });
  }, [reportRows, multiExportSearch]);

  const buildExportWorkbook = (XLSX: typeof import("xlsx"), rows: UserReportRow[], exportScope: string) => {
    const workbook = XLSX.utils.book_new();

    const metaRows = [
      { Field: "Export Scope", Value: exportScope },
      { Field: "User Count", Value: rows.length },
      { Field: "Exported At", Value: format(new Date(), "dd MMM yyyy, hh:mm a") },
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(metaRows), "Meta");

    const summaryRows = rows.map((entry) => ({
      userId: entry.user.id,
      userName: entry.user.name || "-",
      email: entry.user.email || "-",
      role: entry.user.role || "-",
      designation: entry.user.designation || "-",
      workScope: entry.workScope || "-",
      totalOrders: entry.totalOrders,
      pendingOrders: entry.pendingOrders,
      completedOrders: entry.completedOrders,
      criticalOrders: entry.criticalOrders,
      pendingApprovalOrders: entry.pendingApprovalOrders,
      averageProgressPercent: entry.averageProgress,
      totalPurchaseRequests: entry.purchaseRows.length,
      pendingPurchaseRequests: entry.purchasePending,
      completedPurchaseRequests: entry.purchaseCompleted,
    }));
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(summaryRows.length ? summaryRows : [{ note: "No users selected" }]),
      "User Summary"
    );

    const orderRows = rows.flatMap((entry) =>
      entry.orderMonitors.map((row) => ({
        userId: entry.user.id,
        userName: entry.user.name || "-",
        orderId: row.order.id,
        crmOrderNo: row.order.crmOrderNo || row.order.id,
        customerName: row.order.customerName || "-",
        salesPerson: row.order.salesPerson || "-",
        dealId: row.order.dealId || "-",
        orderStatus: row.order.status || "-",
        progressPercent: row.progress,
        currentStep: row.currentStep,
        nextStep: row.nextStep,
        agingDays: row.ageDays,
        risk: row.risk,
        createdAt: formatDateTimeLabel(row.order.createdAt),
      }))
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(orderRows.length ? orderRows : [{ note: "No linked orders" }]),
      "Orders"
    );

    const prRows = rows.flatMap((entry) =>
      entry.purchaseRows.map((row) => ({
        userId: entry.user.id,
        userName: entry.user.name || "-",
        prId: row.id,
        dealId: row.dealId || "-",
        quotationNo: row.quotationNo || "-",
        customerName: row.customerName || "-",
        salesman: row.salesman || "-",
        status: row.status || "-",
        createdBy: row.createdBy?.name || "-",
        createdAt: formatDateTimeLabel(row.createdAt),
        poDeliveryDate: row.poDeliveryDate || "-",
      }))
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(prRows.length ? prRows : [{ note: "No linked purchase requests" }]),
      "Purchase Requests"
    );

    const assignedRows = rows.flatMap((entry) =>
      entry.assignedSalesmen.map((name, index) => ({
        userId: entry.user.id,
        userName: entry.user.name || "-",
        srNo: index + 1,
        salesmanName: name,
      }))
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(assignedRows.length ? assignedRows : [{ note: "No assigned salesmen" }]),
      "Assigned Salesmen"
    );

    return workbook;
  };

  const exportRowsToExcel = async (rows: UserReportRow[], filePrefix: string, exportScope: string) => {
    if (!rows.length) {
      toast({ variant: "destructive", title: "No users selected", description: "Please select at least one user." });
      return false;
    }

    try {
      const XLSX = await import("xlsx");
      const workbook = buildExportWorkbook(XLSX, rows, exportScope);
      const fileName = `${filePrefix}-${format(new Date(), "yyyyMMdd-HHmmss")}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      toast({
        title: "Export completed",
        description: `${rows.length} user${rows.length > 1 ? "s" : ""} exported to Excel.`,
      });
      return true;
    } catch (error) {
      console.error("Failed to export user report:", error);
      toast({
        variant: "destructive",
        title: "Export failed",
        description: "Could not generate Excel file. Please try again.",
      });
      return false;
    }
  };

  const handleExportSelectedUser = async () => {
    if (!selectedRow) return;
    setExporting(true);
    try {
      const safeUserName =
        String(selectedRow.user.name || "user")
          .trim()
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase() || "user";
      await exportRowsToExcel([selectedRow], `user-report-${safeUserName}`, `Selected user: ${selectedRow.user.name || "Unknown"}`);
    } finally {
      setExporting(false);
    }
  };

  const handleMasterExport = async () => {
    setMasterExporting(true);
    try {
      await exportRowsToExcel(reportRows, "user-report-master", "Master export (all users)");
    } finally {
      setMasterExporting(false);
    }
  };

  const openMultiExportDialog = () => {
    setMultiExportSearch("");
    setMultiSelectedUserIds(selectedUserId ? [selectedUserId] : []);
    setMultiExportOpen(true);
  };

  const toggleMultiUser = (userId: string, checked: boolean) => {
    setMultiSelectedUserIds((prev) => {
      if (checked) return prev.includes(userId) ? prev : [...prev, userId];
      return prev.filter((id) => id !== userId);
    });
  };

  const selectAllVisibleMultiUsers = () => {
    setMultiSelectedUserIds((prev) => {
      const next = new Set(prev);
      multiExportRows.forEach((row) => next.add(row.user.id));
      return Array.from(next);
    });
  };

  const clearMultiUsers = () => setMultiSelectedUserIds([]);

  const handleMultiExport = async () => {
    const targetRows = reportRows.filter((row) => multiSelectedUserIds.includes(row.user.id));
    setMultiExporting(true);
    try {
      const success = await exportRowsToExcel(
        targetRows,
        `user-report-multi-${targetRows.length || 0}-users`,
        `Multi export (${targetRows.length || 0} selected users)`
      );
      if (success) setMultiExportOpen(false);
    } finally {
      setMultiExporting(false);
    }
  };

  if (authLoading || loadingData) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-[26rem] w-full" />
      </div>
    );
  }

  if (!user || role !== "admin") {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>This page is only available for admin users.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <Card className="border-slate-200 bg-gradient-to-r from-slate-50 via-white to-sky-50">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-2xl">User Report</CardTitle>
              <CardDescription>Admin view of each user&apos;s workload, order status, and pendency.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void openMultiExportDialog()} disabled={!reportRows.length || multiExporting}>
                <Download className="mr-2 h-4 w-4" />
                Multi Export
              </Button>
              <Button onClick={() => void handleMasterExport()} disabled={!reportRows.length || masterExporting}>
                <Download className="mr-2 h-4 w-4" />
                {masterExporting ? "Exporting..." : "Master Export"}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-4">
          <CardHeader className="space-y-3">
            <CardTitle>User Summary</CardTitle>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search user..." />
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ROLES}>All roles</SelectItem>
                  {roleOptions.map((roleValue) => <SelectItem key={roleValue} value={roleValue}>{roleValue}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[34rem]">
              <div className="space-y-2">
                {filteredRows.map((row) => (
                  <button
                    key={row.user.id}
                    onClick={() => setSelectedUserId(row.user.id)}
                    className={cn("w-full rounded-lg border p-3 text-left", selectedUserId === row.user.id ? "border-sky-300 bg-sky-50" : "border-slate-200 hover:bg-muted/40")}
                  >
                    <p className="truncate text-sm font-semibold">{row.user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.user.role}{row.user.designation ? ` / ${row.user.designation}` : ""} | {row.user.email}
                    </p>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                      <p>Orders <span className="font-semibold">{row.totalOrders}</span></p>
                      <p>Pending <span className="font-semibold">{row.pendingOrders}</span></p>
                      <p>Done <span className="font-semibold">{row.completedOrders}</span></p>
                      <p>Avg <span className="font-semibold">{row.averageProgress}%</span></p>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="space-y-6 xl:col-span-8">
          {selectedRow ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{selectedRow.user.name}</CardTitle>
                      <CardDescription>{selectedRow.workScope}</CardDescription>
                    </div>
                    <Button variant="outline" onClick={() => void handleExportSelectedUser()} disabled={exporting}>
                      <Download className="mr-2 h-4 w-4" />
                      {exporting ? "Exporting..." : "Export Selected"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Total Orders</p><p className="text-xl font-semibold">{selectedRow.totalOrders}</p></div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-amber-700">Pending</p><p className="text-xl font-semibold text-amber-700">{selectedRow.pendingOrders}</p></div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Completed</p><p className="text-xl font-semibold text-emerald-700">{selectedRow.completedOrders}</p></div>
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3"><p className="text-xs text-red-700">Critical</p><p className="text-xl font-semibold text-red-700">{selectedRow.criticalOrders}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Pending Approval</p><p className="text-xl font-semibold">{selectedRow.pendingApprovalOrders}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Avg Progress</p><p className="text-xl font-semibold">{selectedRow.averageProgress}%</p></div>
                </CardContent>
              </Card>

              {selectedRow.assignedSalesmen.length ? (
                <Card>
                  <CardHeader><CardTitle className="text-base">Assigned Salesmen</CardTitle></CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {selectedRow.assignedSalesmen.map((name) => <Badge key={name} variant="secondary">{name}</Badge>)}
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Order Work Details</CardTitle>
                  <Input value={detailSearch} onChange={(e) => setDetailSearch(e.target.value)} placeholder="Search order/customer/salesman..." />
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[24rem]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Sales</TableHead><TableHead>Status</TableHead>
                          <TableHead>Progress</TableHead><TableHead>Current</TableHead><TableHead>Next</TableHead><TableHead>Aging</TableHead><TableHead>Risk</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMonitors.length ? filteredMonitors.map((m) => (
                          <TableRow key={m.order.id}>
                            <TableCell className="font-medium">#{m.order.crmOrderNo || m.order.id}</TableCell>
                            <TableCell>{m.order.customerName || "-"}</TableCell>
                            <TableCell>{m.order.salesPerson || "-"}</TableCell>
                            <TableCell>{m.order.status || "-"}</TableCell>
                            <TableCell>{m.progress}%</TableCell>
                            <TableCell>{m.currentStep}</TableCell>
                            <TableCell>{m.nextStep}</TableCell>
                            <TableCell>{m.ageDays} day(s)</TableCell>
                            <TableCell><Badge variant="outline" className={riskBadgeClassMap[m.risk]}>{m.risk}</Badge></TableCell>
                          </TableRow>
                        )) : (
                          <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No matching rows.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Purchase Request Summary</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Total PR</p><p className="text-lg font-semibold">{selectedRow.purchaseRows.length}</p></div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-amber-700">Pending PR</p><p className="text-lg font-semibold text-amber-700">{selectedRow.purchasePending}</p></div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Completed PR</p><p className="text-lg font-semibold text-emerald-700">{selectedRow.purchaseCompleted}</p></div>
                  </div>
                  {selectedRow.purchaseRows.length ? (
                    <ScrollArea className="h-[14rem] rounded-md border">
                      <Table>
                        <TableHeader><TableRow><TableHead>PR ID</TableHead><TableHead>Deal</TableHead><TableHead>Salesman</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {selectedRow.purchaseRows.map((pr) => (
                            <TableRow key={pr.id}>
                              <TableCell className="font-medium">{pr.id}</TableCell>
                              <TableCell>{pr.dealId || "-"}</TableCell>
                              <TableCell>{pr.salesman || "-"}</TableCell>
                              <TableCell>{pr.status || "-"}</TableCell>
                              <TableCell>{formatDateTimeLabel(pr.createdAt)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  ) : <p className="text-sm text-muted-foreground">No linked purchase requests.</p>}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Select a user to view details.</CardContent></Card>
          )}
        </div>
      </div>

      <Dialog open={multiExportOpen} onOpenChange={(open) => !multiExporting && setMultiExportOpen(open)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Multi Export Users</DialogTitle>
            <DialogDescription>Select users with checkboxes and export only selected user data.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              value={multiExportSearch}
              onChange={(e) => setMultiExportSearch(e.target.value)}
              placeholder="Search user in export list..."
            />

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-muted-foreground">
                Selected: <span className="font-semibold text-foreground">{multiSelectedUserIds.length}</span>
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={selectAllVisibleMultiUsers}>
                  Select All Visible
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearMultiUsers}>
                  Clear
                </Button>
              </div>
            </div>

            <ScrollArea className="h-72 rounded-md border p-2">
              <div className="space-y-2">
                {multiExportRows.length ? (
                  multiExportRows.map((row) => {
                    const checked = multiSelectedUserIds.includes(row.user.id);
                    return (
                      <label key={row.user.id} className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-2", checked ? "border-sky-300 bg-sky-50" : "border-slate-200")}>
                        <Checkbox checked={checked} onCheckedChange={(value) => toggleMultiUser(row.user.id, !!value)} className="mt-1" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.user.name || "Unnamed User"}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.user.role || "-"}{row.user.designation ? ` / ${row.user.designation}` : ""} | {row.user.email || "-"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Orders: {row.totalOrders} | Pending: {row.pendingOrders} | PR: {row.purchaseRows.length}
                          </p>
                        </div>
                      </label>
                    );
                  })
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No users found for this search.</p>
                )}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMultiExportOpen(false)} disabled={multiExporting}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleMultiExport()} disabled={!multiSelectedUserIds.length || multiExporting}>
              <Download className="mr-2 h-4 w-4" />
              {multiExporting ? "Exporting..." : "Export Selected Users"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
