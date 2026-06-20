"use client";

import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { EnrichedDealVisit } from "@/types/visits";
import { User } from "@/lib/types";
import {
  Eye, Share2, MoreHorizontal, UserCheck, Edit, Trash2, UserX,
  CheckCircle2, Search, CalendarDays, X, CloudDownload, Loader2,
  CalendarSync, ArrowLeftRight, AlertCircle, ChevronLeft, ChevronRight
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { runTransaction, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { canAssignInstallerSlots } from "@/lib/visit-assignment-access";
import CompanyVisitDialog from "@/components/features/customer/CompanyVisitDialog";
import RegisterComplaintDialog from "@/components/features/visits/RegisterComplaintDialog";

const STATUS_CONFIG = {
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200 border" },
  Working: { label: "Working", className: "bg-blue-50 text-blue-700 border-blue-200 border animate-pulse" },
  approved: { label: "Approved", className: "bg-violet-50 text-violet-700 border-violet-200 border" },
  CWC: { label: "Will Call", className: "bg-amber-50 text-amber-700 border-amber-200 border" },
} as const;

const renderVisitStatus = (visit: EnrichedDealVisit) => {
  if (visit.status === "completed") return <StatusPill config={STATUS_CONFIG.completed} />;
  if (visit.visitStatus === "Working") return <StatusPill config={STATUS_CONFIG.Working} />;
  if (visit.status === "approved") return <StatusPill config={STATUS_CONFIG.approved} />;
  if (visit.status === "CWC") return <StatusPill config={STATUS_CONFIG.CWC} />;
  return (
    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-slate-50 text-slate-600 border-slate-200">
      {visit.status || "Pending"}
    </span>
  );
};

const StatusPill = ({ config }: { config: { label: string; className: string } }) => (
  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", config.className)}>
    {config.label}
  </span>
);

const FilterChip = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
    {label}
    <button type="button" onClick={onRemove} className="ml-0.5 rounded-full text-indigo-400 hover:text-indigo-700 transition-colors">
      <X className="h-2.5 w-2.5" />
    </button>
  </span>
);

const FilterSelect = ({ value, onChange, placeholder, options }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  options: { value: string; label: string }[];
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="h-9 rounded-lg border-slate-200 bg-white text-sm text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400">
      <SelectValue placeholder={placeholder ?? "Select…"} />
    </SelectTrigger>
    <SelectContent className="rounded-xl border-slate-200 shadow-lg">
      {options.map(o => (
        <SelectItem key={o.value} value={o.value} className="rounded-lg text-sm">
          {o.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const getVisitAssigneeId = (visit: EnrichedDealVisit) => {
  const rawAssignee = String((visit as any).assignedTo ?? (visit as any).assignedToId ?? "").trim();
  if (rawAssignee.toLowerCase() === "unassigned") return "";
  return rawAssignee;
};

const VISITS_PER_PAGE = 50;

type VisitCompletionMode = "Porter" | "Other";

interface AllVisitsTableProps {
  visits: EnrichedDealVisit[];
  installers: User[];
  assigneeNameById: Record<string, string>;
  onAssign: (visit: EnrichedDealVisit) => void;
  onShare: (visit: EnrichedDealVisit) => void;
  onViewDetails: (visit: EnrichedDealVisit) => void;
  onUnassign: (visit: EnrichedDealVisit) => void;
  onEdit: (visit: EnrichedDealVisit) => void;
  onDelete: (visit: EnrichedDealVisit) => void;
}

export default function AllVisitsTable({
  visits,
  installers,
  assigneeNameById,
  onAssign,
  onShare,
  onViewDetails,
  onUnassign,
  onEdit,
  onDelete,
}: AllVisitsTableProps) {
  const { user } = useAuth();
  const isCrmDesignation =
    String(user?.designation || "").trim().toLowerCase() === "crm";
  const canAssignVisits = canAssignInstallerSlots(user);
  const canEditVisits = canAssignVisits || isCrmDesignation;
  // CRM can edit visit details, but cannot assign, delete, or unassign visits.
  const canManageVisitRecords = canAssignVisits;
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [installerFilter, setInstallerFilter] = React.useState("all");
  const [confirmDelete, setConfirmDelete] = React.useState<EnrichedDealVisit | null>(null);
  const [confirmUnassign, setConfirmUnassign] = React.useState<EnrichedDealVisit | null>(null);
  const [completeDraftVisit, setCompleteDraftVisit] = React.useState<EnrichedDealVisit | null>(null);
  const [completionMode, setCompletionMode] = React.useState<VisitCompletionMode>("Porter");
  const [completionRemark, setCompletionRemark] = React.useState("");
  const [pendingCompletion, setPendingCompletion] = React.useState<any>(null);
  const [isActionBusy, setIsActionBusy] = React.useState(false);
  const [isCompletingVisit, setIsCompletingVisit] = React.useState(false);
  const [isSyncingSheet, setIsSyncingSheet] = React.useState(false);
  const [companyVisitDialog, setCompanyVisitDialog] = React.useState(false);
  const [registerComplaintDialog, setRegisterComplaintDialog] = React.useState(false);
  const [previewPdf, setPreviewPdf] = React.useState<{ url: string; fileName: string; dealId?: string } | null>(null);
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = React.useState("");
  const [resolvingPreviewUrl, setResolvingPreviewUrl] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState(1);
  const syncingRef = React.useRef(false);

  // Resolve PDF URL
  React.useEffect(() => {
    if (!previewPdf?.url) { 
      setResolvedPreviewUrl(""); 
      return; 
    }
    let cancelled = false;
    setResolvingPreviewUrl(true);
    
    // Import the action dynamically
    import("@/app/dashboard/visits/actions").then(({ getFreshMeasurementPdfUrlAction }) => {
      getFreshMeasurementPdfUrlAction(previewPdf.url)
        .then(url => { 
          if (!cancelled) setResolvedPreviewUrl(url || previewPdf.url); 
        })
        .catch(() => { 
          if (!cancelled) setResolvedPreviewUrl(previewPdf.url); 
        })
        .finally(() => { 
          if (!cancelled) setResolvingPreviewUrl(false); 
        });
    });
    
    return () => { cancelled = true; };
  }, [previewPdf?.url]);

  const handleSyncSheet = React.useCallback(async (options?: { silent?: boolean }) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncingSheet(true);
    try {
      const res = await fetch("/api/visits/syncVisitSheet", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to sync visits.");
      if (!options?.silent) {
        const synced = typeof data?.rows === "number" ? data.rows : 0;
        toast({ title: "Sheet synced", description: synced ? `${synced} rows updated.` : "Done." });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Sync failed", description: error?.message });
    } finally {
      syncingRef.current = false;
      setIsSyncingSheet(false);
    }
  }, [toast]);

  const downloadPdf = async (url: string, fileName: string) => {
    try {
      const blob = await fetch(url, { cache: "no-store" }).then(r => { 
        if (!r.ok) throw new Error(); 
        return r.blob(); 
      });
      const a = Object.assign(document.createElement("a"), { 
        href: URL.createObjectURL(blob), 
        download: fileName 
      });
      document.body.appendChild(a); 
      a.click(); 
      a.remove(); 
      URL.revokeObjectURL(a.href);
    } catch {
      const directUrl = url.includes("alt=media") ? url : `${url}${url.includes("?") ? "&" : "?"}alt=media`;
      const a = Object.assign(document.createElement("a"), { 
        href: directUrl, 
        download: fileName, 
        target: "_blank", 
        rel: "noopener" 
      });
      document.body.appendChild(a); 
      a.click(); 
      a.remove();
    }
  };

  const installerOptions = React.useMemo(() =>
    (installers || []).map(u => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [installers]
  );
  const typeOptions = React.useMemo(
    () => [...new Set(visits.map(v => v.typeOfVisit).filter((value): value is string => Boolean(value)))].sort(),
    [visits]
  );
  const statusOptions = React.useMemo(
    () => [...new Set(visits.map(v => v.status).filter((value): value is string => Boolean(value)))].sort(),
    [visits]
  );

  const filteredVisits = React.useMemo(() => {
    const queryText = searchQuery.trim().toLowerCase();
    const hasDateFilter = Boolean(dateFrom) || Boolean(dateTo);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const fromDate = dateFrom ? new Date(dateFrom) : hasDateFilter ? null : startOfToday;
    const toDate = dateTo ? (() => { const d = new Date(dateTo); d.setHours(23, 59, 59, 999); return d; })() : hasDateFilter ? null : endOfToday;

    return visits.filter(visit => {
      if (fromDate || toDate) {
        const visitDateValue = visit.slotDate || visit.dueDate;
        if (!visitDateValue) return false;
        const due = new Date(visitDateValue);
        if (isNaN(due.getTime())) return false;
        if (fromDate && due < fromDate) return false;
        if (toDate && due > toDate) return false;
      }
      if (typeFilter !== "all" && visit.typeOfVisit !== typeFilter) return false;
      if (statusFilter !== "all" && (visit.status || "requested") !== statusFilter) return false;
      if (installerFilter !== "all") {
        const assignedTo = getVisitAssigneeId(visit);

        // Show only unassigned visits
        if (installerFilter === "unassigned") {
          if (assignedTo !== "") return false;
        }

        // Show assigned installer visits
        else {
          if (assignedTo !== installerFilter) return false;
        }
      }
      if (queryText) {
        const assignedTo = getVisitAssigneeId(visit);
        const haystack = [visit.customerName, visit.customerAddress, visit.dealId, visit.dealName,
          visit.typeOfVisit, visit.createdBy, assignedTo ? assigneeNameById[assignedTo] : ""]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(queryText)) return false;
      }
      return true;
    });
  }, [visits, dateFrom, dateTo, typeFilter, statusFilter, installerFilter, searchQuery, assigneeNameById]);

  const totalPages = Math.max(1, Math.ceil(filteredVisits.length / VISITS_PER_PAGE));
  const pageStartIndex = (currentPage - 1) * VISITS_PER_PAGE;
  const paginatedVisits = React.useMemo(
    () => filteredVisits.slice(pageStartIndex, pageStartIndex + VISITS_PER_PAGE),
    [filteredVisits, pageStartIndex]
  );
  const shownFrom = filteredVisits.length ? pageStartIndex + 1 : 0;
  const shownTo = Math.min(pageStartIndex + VISITS_PER_PAGE, filteredVisits.length);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, typeFilter, statusFilter, installerFilter, searchQuery]);

  React.useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const previewUrl = (resolvedPreviewUrl || previewPdf?.url)
    ? `${resolvedPreviewUrl || previewPdf?.url}#toolbar=0&navpanes=0&scrollbar=0`
    : "";

  const openCompleteVisitDialog = (visit: EnrichedDealVisit) => {
    setCompleteDraftVisit(visit);
    setCompletionMode("Porter");
    setCompletionRemark("");
  };

  const proceedToCompleteConfirmation = () => {
    if (!completeDraftVisit) return;
    const trimmedRemark = completionRemark.trim();
    if (completionMode === "Other" && !trimmedRemark) {
      toast({ variant: "destructive", title: "Remark required", description: "Please enter a remark when selecting Other." });
      return;
    }
    setPendingCompletion({ visit: completeDraftVisit, mode: completionMode, remark: trimmedRemark });
    setCompleteDraftVisit(null);
  };

  const handleConfirmCompleteVisit = async () => {
    if (!pendingCompletion) return;
    setIsCompletingVisit(true);
    try {
      const nowIso = new Date().toISOString();
      const visitRef = doc(db, "customers", pendingCompletion.visit.customerId, "deals", pendingCompletion.visit.dealDocId, "visits", pendingCompletion.visit.id);
      await runTransaction(db, async (tx) => {
        const visitSnap = await tx.get(visitRef);
        if (!visitSnap.exists()) throw new Error("Visit document not found.");
        const payload: Record<string, unknown> = {
          status: "completed",
          visitEndTime: nowIso,
          completedAt: nowIso,
          completedBy: user?.name || user?.email || "Admin",
          completedById: user?.id || "admin",
          completionMode: pendingCompletion.mode,
          completionRemark: pendingCompletion.mode === "Other" ? pendingCompletion.remark : "Completed via Porter",
          updatedAt: nowIso,
          updatedBy: user?.id || "admin",
        };
        if (pendingCompletion.mode === "Other") payload.remark = pendingCompletion.remark;
        tx.update(visitRef, payload);
      });
      toast({ title: "Visit completed", description: `${pendingCompletion.visit.customerName} visit marked as completed.` });
      setPendingCompletion(null);
      setCompletionMode("Porter");
      setCompletionRemark("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to complete visit", description: error?.message || "Could not update visit status." });
    } finally {
      setIsCompletingVisit(false);
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-900">All Visits</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {filteredVisits.length} visits · showing {shownFrom}-{shownTo} · 50 per page
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => handleSyncSheet()} disabled={isSyncingSheet}
              className="rounded-lg text-xs h-8 border-slate-200">
              {isSyncingSheet ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <CalendarSync className="mr-1.5 h-3 w-3" />}
              Sync Sheet
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRegisterComplaintDialog(true)}
              className="rounded-lg text-xs h-8 border-slate-200">
              <AlertCircle className="mr-1.5 h-3 w-3" />
              Register Complaint
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCompanyVisitDialog(true)}
              className="rounded-lg text-xs h-8 border-slate-200">
              <ArrowLeftRight className="mr-1.5 h-3 w-3" />
              Company Tracker
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
            <div className="xl:col-span-2 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <Input placeholder="Search customer, deal, address…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-9 rounded-lg border-slate-200 text-sm focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:border-indigo-400" />
            </div>
            <div className="relative">
              <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none z-10" />
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="pl-8 h-9 rounded-lg border-slate-200 text-sm text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:border-indigo-400 [&::-webkit-calendar-picker-indicator]:opacity-50" />
              {dateFrom && <button type="button" onClick={() => setDateFrom("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"><X className="h-3 w-3" /></button>}
            </div>
            <div className="relative">
              <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none z-10" />
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="pl-8 h-9 rounded-lg border-slate-200 text-sm text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:border-indigo-400 [&::-webkit-calendar-picker-indicator]:opacity-50" />
              {dateTo && <button type="button" onClick={() => setDateTo("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"><X className="h-3 w-3" /></button>}
            </div>
            <FilterSelect value={typeFilter} onChange={setTypeFilter} placeholder="All Types"
              options={[{ value: "all", label: "All Types" }, ...typeOptions.map(t => ({ value: t, label: t }))]} />
            <FilterSelect value={statusFilter} onChange={setStatusFilter} placeholder="All Status"
              options={[{ value: "all", label: "All Status" }, ...statusOptions.map(s => ({ value: s, label: s }))]} />
            <FilterSelect value={installerFilter} onChange={setInstallerFilter} placeholder="All Installers"
              options={[{ value: "all", label: "All Installers" }, { value: "unassigned", label: "Unassigned" }, ...installerOptions.map(p => ({ value: p.id, label: p.name }))]} />
          </div>

          {(dateFrom || dateTo || typeFilter !== "all" || statusFilter !== "all" || installerFilter !== "all" || searchQuery) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mr-1">Active:</span>
              {searchQuery && <FilterChip label={`"${searchQuery}"`} onRemove={() => setSearchQuery("")} />}
              {dateFrom && <FilterChip label={`From ${dateFrom}`} onRemove={() => setDateFrom("")} />}
              {dateTo && <FilterChip label={`To ${dateTo}`} onRemove={() => setDateTo("")} />}
              {typeFilter !== "all" && <FilterChip label={typeFilter} onRemove={() => setTypeFilter("all")} />}
              {statusFilter !== "all" && <FilterChip label={statusFilter} onRemove={() => setStatusFilter("all")} />}
              {installerFilter !== "all" && <FilterChip label={installerFilter === "unassigned" ? "Unassigned" : (installerOptions.find(p => p.id === installerFilter)?.name ?? installerFilter)} onRemove={() => setInstallerFilter("all")} />}
              <button type="button" onClick={() => { setSearchQuery(""); setDateFrom(""); setDateTo(""); setTypeFilter("all"); setStatusFilter("all"); setInstallerFilter("all"); }}
                className="text-[11px] text-indigo-500 hover:text-indigo-700 font-medium ml-1 underline underline-offset-2">Clear all</button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50">
                {["Created", "Customer", "Address", "Deal / SM", "Type", "Slot", "Assigned To", "Status"].map(h => (
                  <TableHead key={h} className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</TableHead>
                ))}
                <TableHead className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVisits.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-16 text-center text-slate-400 text-sm">No visits match your filters.</TableCell></TableRow>
              ) : (
                paginatedVisits.map(visit => (
                  <TableRow key={visit.id} className={cn("border-slate-100 hover:bg-slate-50/60 transition-colors", visit.visitStatus === "Working" && "bg-blue-50/40 hover:bg-blue-50/60")}>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {visit.createdAt ? (<><p className="font-medium text-slate-700">{format(new Date(visit.createdAt), "d MMM yyyy")}</p><p className="text-slate-400">{format(new Date(visit.createdAt), "hh:mm a")}</p></>) : "—"}
                    </TableCell>
                    <TableCell className="font-medium text-slate-800 text-sm">{visit.customerName}</TableCell>
                    <TableCell className="max-w-[200px] text-xs text-slate-500 whitespace-normal break-words">{visit.location?.address || visit.customerSnapshot?.address || "—"}</TableCell>
                    <TableCell>
                      <Link href={`/dashboard/customers/${visit.customerId}/${visit.dealDocId}`} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline block">{visit.dealId}</Link>
                      <span className="text-xs text-slate-400">{visit.assignedSalesPerson?.name || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 capitalize">{visit.typeOfVisit}</span>
                      <p className="text-[11px] text-slate-400 mt-1">{visit.createdBy}</p>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      <p className="font-medium text-slate-700">{visit.slotDate ? format(new Date(visit.slotDate), "d MMM yyyy") : "Not set"}</p>
                      {visit.slotLabel && <span className="inline-flex rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 mt-1">{visit.slotLabel}</span>}
                    </TableCell>
                    <TableCell className="text-sm">{getVisitAssigneeId(visit) ? <span className="font-medium text-slate-700">{assigneeNameById[getVisitAssigneeId(visit)] || "Unknown"}</span> : <span className="text-slate-400 italic text-xs">Unassigned</span>}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1.5">
                        {renderVisitStatus(visit)}
                        {visit.status !== "completed" && visit.dueDate && (
                          <span className="text-[11px] text-slate-400">
                            {format(new Date(visit.dueDate), "d MMM yyyy")}
                          </span>
                        )}
                        {visit.status === "completed" && visit.typeOfVisit === "measurement" && visit.measurementPdfUrl && (
                          <button
                            type="button"
                            onClick={e => { 
                              e.stopPropagation(); 
                              setPreviewPdf({ 
                                url: String(visit.measurementPdfUrl),
                                fileName: `${visit.dealId || "deal"}-measurement.pdf`, 
                                dealId: visit.dealId 
                              }); 
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-100 transition-colors"
                          >
                            <CloudDownload className="h-3 w-3" /> PDF
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0 rounded-lg hover:bg-slate-100"><MoreHorizontal className="h-4 w-4 text-slate-500" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl shadow-lg border-slate-200 w-44">
                          <DropdownMenuItem onClick={() => onViewDetails(visit)} className="rounded-lg text-sm"><Eye className="mr-2 h-3.5 w-3.5" /> View Details</DropdownMenuItem>
                          {canAssignVisits && (
                            <DropdownMenuItem className="rounded-lg text-sm" onSelect={() => { window.setTimeout(() => onAssign(visit), 0); }}>
                              <UserCheck className="mr-2 h-3.5 w-3.5" />
                              {getVisitAssigneeId(visit) ? "Re-assign Installer + Slots" : "Assign Installer + Slots"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => onShare(visit)} className="rounded-lg text-sm"><Share2 className="mr-2 h-3.5 w-3.5" /> Share Link</DropdownMenuItem>
                          {visit.status !== "completed" && <DropdownMenuItem className="rounded-lg text-sm" onSelect={e => { e.preventDefault(); openCompleteVisitDialog(visit); }}><CheckCircle2 className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Complete Visit</DropdownMenuItem>}
                          {canEditVisits && (
                            <DropdownMenuItem onClick={() => onEdit(visit)} className="rounded-lg text-sm"><Edit className="mr-2 h-3.5 w-3.5" /> Edit Visit</DropdownMenuItem>
                          )}
                          {canManageVisitRecords && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600 focus:text-red-700 rounded-lg text-sm" onSelect={e => { e.preventDefault(); setConfirmDelete(visit); }}><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                              {getVisitAssigneeId(visit) && <DropdownMenuItem className="text-red-600 focus:text-red-700 rounded-lg text-sm" onSelect={e => { e.preventDefault(); setConfirmUnassign(visit); }}><UserX className="mr-2 h-3.5 w-3.5" /> Unassign</DropdownMenuItem>}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {filteredVisits.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Showing <span className="font-medium text-slate-700">{shownFrom}-{shownTo}</span> of{" "}
              <span className="font-medium text-slate-700">{filteredVisits.length}</span> visits
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <span className="min-w-24 text-center text-sm font-medium text-slate-600">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* PDF Preview Dialog */}
      <Dialog open={!!previewPdf} onOpenChange={open => { if (!open) { setPreviewPdf(null); setResolvedPreviewUrl(""); } }}>
        <DialogContent className="max-w-5xl h-[92vh] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Measurement PDF</DialogTitle>
            <DialogDescription>{previewPdf?.fileName}</DialogDescription>
          </DialogHeader>
          {previewPdf && (
            <div className="flex flex-col gap-3 flex-1 overflow-hidden">
              <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                {resolvingPreviewUrl ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : previewUrl ? (
                  <iframe title="PDF Preview" src={previewUrl} className="h-[70vh] w-full" />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-slate-400">PDF unavailable.</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="rounded-lg" onClick={() => { setPreviewPdf(null); setResolvedPreviewUrl(""); }}>Close</Button>
                <Button className="rounded-lg" disabled={resolvingPreviewUrl || !(resolvedPreviewUrl || previewPdf.url)}
                  onClick={() => downloadPdf(resolvedPreviewUrl || previewPdf.url, previewPdf.fileName)}>
                  <CloudDownload className="mr-2 h-4 w-4" /> Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <Dialog open={!!completeDraftVisit} onOpenChange={(open) => { if (!open) { setCompleteDraftVisit(null); setCompletionMode("Porter"); setCompletionRemark(""); } }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>Complete Visit</DialogTitle><DialogDescription>Mark visit for <span className="font-semibold">{completeDraftVisit?.customerName || "this customer"}</span> as completed.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><p className="text-sm font-medium text-slate-700">Completed By</p>
              <Select value={completionMode} onValueChange={(value) => setCompletionMode(value as VisitCompletionMode)}>
                <SelectTrigger className="rounded-lg border-slate-200"><SelectValue placeholder="Select option" /></SelectTrigger>
                <SelectContent className="rounded-xl"><SelectItem value="Porter">Porter</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
              </Select>
            </div>
            {completionMode === "Other" && <div className="space-y-2"><p className="text-sm font-medium text-slate-700">Remark</p><Textarea placeholder="Enter completion remark" value={completionRemark} onChange={(event) => setCompletionRemark(event.target.value)} className="rounded-lg border-slate-200 resize-none" /></div>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" className="rounded-lg" onClick={() => { setCompleteDraftVisit(null); setCompletionMode("Porter"); setCompletionRemark(""); }}>Cancel</Button>
            <Button type="button" className="rounded-lg" onClick={proceedToCompleteConfirmation} disabled={completionMode === "Other" && !completionRemark.trim()}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingCompletion} onOpenChange={(open) => { if (!open && !isCompletingVisit) setPendingCompletion(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader><AlertDialogTitle>Complete this visit?</AlertDialogTitle><AlertDialogDescription>This will mark visit for <span className="font-semibold">{pendingCompletion?.visit.customerName || "this customer"}</span> as completed.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg" disabled={isCompletingVisit}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-lg" disabled={isCompletingVisit} onClick={(event) => { event.preventDefault(); void handleConfirmCompleteVisit(); }}>
              {isCompletingVisit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={open => !open && setConfirmDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader><AlertDialogTitle>Delete this visit?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg" disabled={isActionBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-lg bg-red-600 hover:bg-red-700" disabled={isActionBusy} onClick={async () => { if (!confirmDelete) return; setIsActionBusy(true); try { await onDelete(confirmDelete); } finally { setIsActionBusy(false); setConfirmDelete(null); } }}>
              {isActionBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmUnassign} onOpenChange={open => !open && setConfirmUnassign(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader><AlertDialogTitle>Unassign this visit?</AlertDialogTitle><AlertDialogDescription>The visit will stay in the system but be removed from the installer's schedule.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg" disabled={isActionBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-lg" disabled={isActionBusy} onClick={async () => { if (!confirmUnassign) return; setIsActionBusy(true); try { await onUnassign(confirmUnassign); } finally { setIsActionBusy(false); setConfirmUnassign(null); } }}>
              {isActionBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Unassign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CompanyVisitDialog open={companyVisitDialog} onOpenChange={setCompanyVisitDialog} installers={installers} />
      <RegisterComplaintDialog open={registerComplaintDialog} onOpenChange={setRegisterComplaintDialog} />
    </>
  );
}
