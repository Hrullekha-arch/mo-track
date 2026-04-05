"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  PlusCircle,
  X,
  ChevronRight,
  MapPin,
  Calendar,
  User2,
  Briefcase,
  CheckCircle2,
  Circle,
  Timer,
  PauseCircle,
  UserCheck,
  ArrowRight,
  Loader2,
  Building2,
  Scissors,
  LayoutGrid,
  ListFilter,
  AlertCircle,
  Lock,
  AlertTriangle,
  Phone,
  PenLine,
  CircleCheckIcon,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { QuerySnapshot } from "firebase-admin/firestore";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installers?: Array<{ id: string; name: string; email?: string }>;
};

type TeamMember = { id: string; name: string; kind: TeamMemberKind };

// ─── Enums / Unions ───────────────────────────────────────────────────────────

export type VisitCategory = "company_visit" | "tailor_work" | "complaint_visit";

export type VisitStatus = "planned" | "in_progress" | "Completed" | "on_hold";

export type WorkMode = "customer_home" | "factory_visit" | "office_visit" | string;

export type TeamMemberKind = "salesman" | "employee" | "tailor" | "installer" | string;

export type ChargeType = "free" | "chargeable" | string;

export type ApprovalDecision = "approved" | "rejected" | "pending" | string;

// ─── Nested shapes ────────────────────────────────────────────────────────────

export type ApprovedBy = {
  id: string;
  name: string;
  email: string;
  designation: string;
  role: string;
};

export type ApprovalInfo = {
  decision: ApprovalDecision;
  approvedAt: string;
  approvedBy: ApprovedBy;
  chargeType: ChargeType;
  chargeAmount: number;
  note: string;
};

export type CustomerSnapshot = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  billingAddress: string | null;
  customerCode: string;
  pincode: string;
  raw?: Record<string, any>;
};

export type CreatedBy = {
  id: string;
  name: string;
  email: string;
};

// ─── Main type ────────────────────────────────────────────────────────────────

export type TrackerEntry = {
  // ── Identity
  id: string;
  source: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: CreatedBy | null;

  // ── Visit classification
  category: VisitCategory;
  purpose: string;                   // e.g. "customer_complaint" | "employee_work" | "outside_stitching"
  status: VisitStatus;

  // ── Assignment
  assignedToId: string;
  assignedToName: string;
  assignedRole: TeamMemberKind;

  // ── Schedule & location
  visitDate: string;                 // "YYYY-MM-DD"
  startTime: string;
  endTime: string;
  workMode: WorkMode;
  from: string;
  to: string;

  // ── Customer (flat fields — fallback when snapshot is unavailable)
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerCode?: string;
  existingCustomer?: boolean;        // tailor_work / company_visit

  // ── Customer snapshot (preferred over flat fields)
  customerSnapshot?: CustomerSnapshot | null;

  // ── Notes
  remark?: string;
  workNote?: string;

  // ── Complaint-specific (customer_complaint only)
  complaintType?: string;
  complaintSubType?: string;         // NEW — previously missing
  complaintStatus?: string;          // e.g. "Approved - Free"
  chargeType?: ChargeType;           // "free" | "chargeable"
  chargeAmount?: number;
  isChargeable?: boolean;

  // ── Approval (customer_complaint only)
  approval?: ApprovalInfo | null;
  approvalStatus?: string;           // e.g. "Approved" | ""
  approvalNote?: string;             // NEW — the human-readable approval note
  approvedAt?: string;               // ISO string, mirrors approval.approvedAt
  approvedBy?: ApprovedBy;           // mirrors approval.approvedBy
  pendingApproval?: boolean;

  // ── Tailor-specific (tailor_work only)
  trackerStatus?: string;            // raw tracker status string if different from status

  // ── Installer
  installerAssignedId?: string;
  installerAssignedName?: string;

  // ── Media
  photos?: string[];
  photoUrls?: string[];

  // ── Raw document (escape hatch — avoid using in UI)
  fullDoc?: Record<string, any>;
};

type CustomerSearchResult = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  customerCode?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const defaultTeamMembers: TeamMember[] = [
  { id: "emp-1", name: "Rahul Sharma", kind: "employee" },
  { id: "emp-2", name: "Vishal Dubey", kind: "employee" },
  { id: "tailor-1", name: "Mukesh", kind: "tailor" },
  { id: "tailor-2", name: "Ramesh", kind: "tailor" },
];

const purposeByCategory: Record<VisitCategory, Array<{ value: string; label: string }>> = {
  company_visit: [
    { value: "sample_showing", label: "Sample Showing" },
    { value: "employee_work", label: "Employee Site Work" },
    { value: "material_check", label: "Material Check" },
    { value: "client_followup", label: "Client Follow Up" },
  ],
  tailor_work: [
    { value: "outside_stitching", label: "Outside Stitching Work" },
    { value: "alteration_work", label: "Alteration Work" },
    { value: "pickup_drop", label: "Pickup / Drop Work" },
    { value: "stitching_support", label: "Stitching Support Visit" },
  ],
};

const workModeLabel: Record<WorkMode, string> = {
  customer_home: "Customer Home",
  outside_workshop: "Outside Workshop",
  factory_visit: "Factory Visit",
  sample_meeting: "Sample Meeting",
};

const categoryConfig: Record<VisitCategory, { label: string; icon: React.ElementType; bg: string; iconColor: string; accent: string }> = {
  company_visit: {
    label: "Company Visit",
    icon: Building2,
    bg: "bg-indigo-50",
    iconColor: "text-indigo-500",
    accent: "border-indigo-200",
  },
  tailor_work: {
    label: "Tailor Work",
    icon: Scissors,
    bg: "bg-violet-50",
    iconColor: "text-violet-500",
    accent: "border-violet-200",
  },
  complaint_visit: {
    label: "Complaint Visit",
    icon: AlertTriangle,
    bg: "bg-rose-50",
    iconColor: "text-rose-500",
    accent: "border-rose-200",
  },
};

const statusConfig: Record<VisitStatus, { label: string; icon: React.ElementType; chip: string; dot: string; ring: string }> = {
  planned: {
    label: "Planned",
    icon: Circle,
    chip: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    ring: "ring-slate-300",
  },
  in_progress: {
    label: "In Progress",
    icon: Timer,
    chip: "bg-sky-50 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
    ring: "ring-sky-300",
  },
  Completed: {
    label: "Completed",
    icon: CheckCircle2,
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    ring: "ring-emerald-300",
  },
  on_hold: {
    label: "On Hold",
    icon: PauseCircle,
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-400",
    ring: "ring-amber-300",
  },
};

const makeId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const toTitle = (value: string) =>
  value.split("_").filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");

const normalizeVisitCategory = (value: unknown): VisitCategory => {
  const n = String(value || "").trim();
  if (n === "company_visit" || n === "tailor_work" || n === "complaint_visit") return n;
  return "company_visit";
};

const normalizeVisitStatus = (value: unknown): VisitStatus => {
  const n = String(value || "").trim();
  if (n === "planned" || n === "in_progress" || n === "Completed" || n === "on_hold") return n;
  return "planned";
};

const getStatusConfig = (value: unknown) => statusConfig[normalizeVisitStatus(value)];

// ─── Small helpers ────────────────────────────────────────────────────────────

const FieldLabel = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
    {children}
    {required && <span className="ml-0.5 text-rose-400">*</span>}
  </Label>
);

const SInput = React.forwardRef<HTMLInputElement, React.ComponentProps<typeof Input>>((props, ref) => (
  <Input
    ref={ref}
    {...props}
    className={cn(
      "h-9 rounded-xl border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 shadow-sm",
      "focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:border-indigo-400 transition-all",
      props.className
    )}
  />
));
SInput.displayName = "SInput";

const SSelect = ({ value, onValueChange, placeholder, children }: {
  value: string; onValueChange: (v: string) => void; placeholder?: string; children: React.ReactNode;
}) => (
  <Select value={value} onValueChange={onValueChange}>
    <SelectTrigger className="h-9 rounded-xl border-slate-200 bg-white text-sm text-slate-800 shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all">
      <SelectValue placeholder={placeholder ?? "Select…"} />
    </SelectTrigger>
    <SelectContent className="rounded-xl border-slate-200 shadow-xl">
      {children}
    </SelectContent>
  </Select>
);

const SI = ({ value, children }: { value: string; children: React.ReactNode }) => (
  <SelectItem value={value} className="rounded-lg text-sm">{children}</SelectItem>
);

// ─── Stat Pill ────────────────────────────────────────────────────────────────

const StatPill = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className={cn("flex items-center gap-2 rounded-2xl border px-3 py-2 bg-white shadow-sm", color)}>
    <span className="text-lg font-bold text-slate-800 tabular-nums leading-none">{value}</span>
    <span className="text-[11px] font-semibold text-slate-500 leading-tight">{label}</span>
  </div>
);

// ─── Entry Detail Sheet ───────────────────────────────────────────────────────

const EntryDetailSheet = ({
  entry, open, onClose, installers, onStatusUpdate, onInstallerAssign,
}: {
  entry: TrackerEntry | null;
  open: boolean;
  onClose: () => void;
  installers?: Props["installers"];
  onStatusUpdate: (id: string, status: VisitStatus) => Promise<void>;
  onInstallerAssign: (id: string, installerId: string, installerName: string) => Promise<void>;
}) => {
  const router = useRouter();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assigningInstaller, setAssigningInstaller] = useState(false);
  const [selectedInstallerId, setSelectedInstallerId] = useState(entry?.installerAssignedId ?? "");
  const [scheduleEdit, setScheduleEdit] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  useEffect(() => {
    setSelectedInstallerId(entry?.installerAssignedId ?? "");
  }, [entry]);

  if (!entry) return null;

  const sc = getStatusConfig(entry.status);
  const StatusIcon = sc.icon;
  const catMeta = categoryConfig[entry.category];
  const CategoryIcon = catMeta.icon;
  const isPendingApproval = !!entry.pendingApproval;

  const isComplaint = entry.purpose === "customer_complaint";
  const isTailor    = entry.category === "tailor_work";

  // Route: show single pin when from === to or either is empty
  const fromVal = entry.from?.trim();
  const toVal   = entry.to?.trim();
  const isSameLocation = !fromVal || !toVal || fromVal === toVal;

  const handleStatusClick = async (s: VisitStatus) => {
    if (s === entry.status) return;
    setUpdatingStatus(true);
    try { await onStatusUpdate(entry.id, s); } finally { setUpdatingStatus(false); }
  };

  const handleInstallerAssign = async () => {
    if (!selectedInstallerId) return;
    const installer = installers?.find((i) => i.id === selectedInstallerId);
    if (!installer) return;
    setAssigningInstaller(true);
    try {
      await onInstallerAssign(entry.id, installer.id, installer.name);
      toast.success(`Assigned to ${installer.name}`);
    } finally { setAssigningInstaller(false); }
  };

  //Helpere
const toYYYYMMDD = (value: Date): string => {
  if (!value) return "";
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

  const handleScheduleSave = async (id: string) => {
  if (!scheduledDate) {
    setScheduleEdit(false);
    return;
  }

  try {
    setScheduleSaving(true);

    const docRef = doc(db, "companyVisits", id);
    await updateDoc(docRef, {
      visitDate: toYYYYMMDD(scheduledDate),
    });

    toast.success("Date updated");
    router.refresh();          // ← was missing ()
  } catch (error) {
    console.error(error);
    toast.error("Failed to update date");
  } finally {
    setScheduleSaving(false);  // ← always runs, even on error
    setScheduleEdit(false);
  }
};

  // Header pill
  const pillLabel = isComplaint
    ? (entry.approvalStatus || "Pending")
    : toTitle(entry.status);

  const pillClass = isComplaint
    ? entry.approvalStatus === "Approved"
      ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C0DD97]"
      : "bg-amber-50 text-amber-700 border border-amber-200"
    : entry.status === "completed"
    ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C0DD97]"
    : "bg-[#E6F1FB] text-[#185FA5] border border-[#85B7EB]";

  // Avatar/accent colors per category
  const avatarBg = isTailor ? "bg-[#EEEDFE]" : "bg-indigo-100";
  const avatarText = isTailor ? "text-[#534AB7]" : "text-indigo-700";

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-[#f8f9fb] border-l border-slate-200 p-0">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-slate-100 px-5 py-4">
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", catMeta.bg)}>
                <CategoryIcon className={cn("h-5 w-5", catMeta.iconColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-slate-900 text-base leading-tight">
                  {isComplaint ? "Complaint Visit" : isTailor ? "Tailor Work" : "Company Visit"}
                </SheetTitle>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">ID: {entry.id}</p>
              </div>
              <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0", pillClass)}>
                {pillLabel}
              </span>
            </div>
          </SheetHeader>
        </div>

        <div className="p-5 space-y-4">

          {/* ── COMPLAINT ONLY: Approval banner ────────────────────────── */}
          {isComplaint && entry.approval && (
            <div className={cn(
              "flex items-start gap-2.5 rounded-xl border px-3.5 py-3",
              entry.approval.decision === "approved"
                ? "border-green-200 bg-green-50"
                : "border-amber-200 bg-amber-50"
            )}>
              <CheckCircle2 className={cn(
                "h-4 w-4 mt-0.5 shrink-0",
                entry.approval.decision === "approved" ? "text-green-500" : "text-amber-500"
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={cn(
                    "text-xs font-bold",
                    entry.approval.decision === "approved" ? "text-green-800" : "text-amber-800"
                  )}>
                    Visit {toTitle(entry.approval.decision)}
                  </p>
                  <span className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                    entry.approval.chargeType === "free"
                      ? "bg-[#EAF3DE] text-[#3B6D11]"
                      : "bg-[#FAEEDA] text-[#854F0B]"
                  )}>
                    {entry.approval.chargeType === "free" ? "Free of charge" : `₹${entry.approval.chargeAmount}`}
                  </span>
                </div>
                <p className={cn(
                  "text-[11px] mt-0.5",
                  entry.approval.decision === "approved" ? "text-green-600" : "text-amber-600"
                )}>
                  {entry.approval.approvedAt
                    ? new Date(entry.approval.approvedAt).toLocaleString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })
                    : "—"}{" "}
                  · {entry.approval.approvedBy?.name} ({toTitle(entry.approval.approvedBy?.designation ?? "")})
                </p>
              </div>
            </div>
          )}

          {/* ── Pending approval banner (non-complaint) ─────────────────── */}
          {!isComplaint && isPendingApproval && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <Lock className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-800">Pending Approval</p>
                <p className="text-xs text-amber-600 mt-0.5">Installer assignment is locked until this visit is approved.</p>
              </div>
            </div>
          )}

          {/* ── Client card (all types) ─────────────────────────────────── */}
          {(entry.customerSnapshot || entry.customerName) && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Client</p>
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className={cn("text-xs font-bold", avatarBg, avatarText)}>
                    {(entry.customerSnapshot?.name || entry.customerName || "?").charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <User2 className="h-3 w-3 text-slate-400 shrink-0" />
                    <p className="text-sm font-semibold text-slate-800 leading-tight">
                      {entry.customerSnapshot?.name || entry.customerName || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                    <p className="text-[11px] text-slate-500">
                      {entry.customerSnapshot?.phone || entry.customerPhone || "—"}
                    </p>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <MapPin className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-500">
                      {entry.customerSnapshot?.address || entry.customerAddress || "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {entry.workMode && (
                      <span className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                        isTailor ? "bg-[#EEEDFE] text-[#534AB7]" : "bg-[#E6F1FB] text-[#185FA5]"
                      )}>
                        {workModeLabel[entry.workMode] || toTitle(String(entry.workMode || ""))}
                      </span>
                    )}
                    {isTailor && entry.existingCustomer && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E1F5EE] text-[#0F6E56]">
                        Existing customer
                      </span>
                    )}
                    {!isTailor && entry.existingCustomer === false && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F1EFE8] text-[#5F5E5A]">
                        New customer
                      </span>
                    )}
                    {(entry.customerSnapshot?.customerCode || entry.customerCode) && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F1EFE8] text-[#5F5E5A]">
                        {entry.customerSnapshot?.customerCode || entry.customerCode}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── COMPLAINT ONLY: Complaint details ───────────────────────── */}
          {isComplaint && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Complaint Details</p>
              <div className="flex flex-wrap gap-1.5">
                {entry.complaintType && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FCEBEB] text-[#A32D2D] border border-[#F09595]">
                    {entry.complaintType}
                  </span>
                )}
                {entry.complaintSubType && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FCEBEB] text-[#A32D2D] border border-[#F09595]">
                    {entry.complaintSubType}
                  </span>
                )}
                {entry.complaintStatus && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F1EFE8] text-[#5F5E5A]">
                    {entry.complaintStatus}
                  </span>
                )}
              </div>
              {entry.chargeAmount !== undefined && (
                <p className="text-xs text-slate-500 mt-2">
                  Charge:{" "}
                  <span className="font-semibold text-slate-700">
                    {entry.chargeType === "free" ? "Free" : `₹${entry.chargeAmount}`}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* ── TAILOR ONLY: Work details ───────────────────────────────── */}
          {isTailor && entry.purpose && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Work Details</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#EEEDFE] text-[#534AB7]">
                  {toTitle(entry.purpose)}
                </span>
                {entry.source && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F1EFE8] text-[#5F5E5A]">
                    {entry.source}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Assigned To + Schedule ──────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Assigned To</p>
              <div className="flex items-center gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className={cn("text-[10px] font-bold", avatarBg, avatarText)}>
                    {entry.assignedToName?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-slate-800 leading-tight">
                    {entry.assignedToName || "Unassigned"}
                  </p>
                  <p className="text-[11px] text-slate-400 capitalize">{entry.assignedRole}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex justify-between items-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Schedule</p>
                  {scheduleEdit?<Button onClick={()=>handleScheduleSave(entry.id)} variant="outline" size="sm">
                                  {scheduleSaving?<Loader2 />
                                                :<CircleCheckIcon className="h-3.5 w-3.5" />
                                                }
                                </Button>
                                :<Button onClick={()=>setScheduleEdit(true)} variant="outline" size="sm">
                                  <PenLine className="h-3.5 w-3.5" />
                                </Button>
                                }
              </div>
              
              <div className="flex items-center gap-1.5">
                {scheduleEdit?<Input
                  type="date"
                  size="sm"
                  value={scheduledDate ? scheduledDate.toISOString().slice(0, 10) : entry.visitDate}
                  onChange={(e) => setScheduledDate(new Date(e.target.value))}
                />:<>
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <p className="text-sm font-semibold text-slate-800">{entry.visitDate || "—"}</p>
                </>
                }
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Briefcase className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <p className="text-xs text-slate-500">
                  {workModeLabel[entry.workMode] || toTitle(String(entry.workMode || "")) || "—"}
                </p>
              </div>
            </div>
          </div>

          {/* ── Route (smart: single pin or dual) ──────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              {isSameLocation ? "Location" : "Route"}
            </p>
            {isSameLocation ? (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-700">{toVal || fromVal || "—"}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Origin and destination are the same</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center pt-0.5 shrink-0">
                  <MapPin className="h-3.5 w-3.5 text-rose-400" />
                  <div className="w-px h-5 bg-slate-200 my-0.5" />
                  <MapPin className="h-3.5 w-3.5 text-indigo-400" />
                </div>
                <div className="flex flex-col gap-3.5 flex-1">
                  <div>
                    <p className="text-[10px] text-slate-400 mb-0.5">From</p>
                    <p className="text-sm font-medium text-slate-700">{fromVal || "Not specified"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 mb-0.5">To</p>
                    <p className="text-sm font-medium text-slate-700">{toVal || "Not specified"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Notes ──────────────────────────────────────────────────── */}
          {(entry.remark || entry.workNote || (isComplaint && entry.approvalNote)) && (
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
              {(entry.remark || entry.workNote) && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1">
                    {isComplaint ? "Complaint Note" : "Work Note"}
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {entry.remark || entry.workNote}
                  </p>
                </>
              )}
              {isComplaint && entry.approvalNote && (
                <>
                  <hr className="border-amber-200 my-2" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1">
                    Approval Note
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed">{entry.approvalNote}</p>
                </>
              )}
            </div>
          )}

          {/* ── Update status ───────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Update Status</p>
            <div className="grid grid-cols-2 gap-2">
              {(["planned", "in_progress", "completed", "on_hold"] as VisitStatus[]).map((s) => {
                const cfg = statusConfig[s];
                const Icon = cfg.icon;
                const isActive = entry.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={updatingStatus}
                    onClick={() => handleStatusClick(s)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all",
                      isActive
                        ? cn(cfg.chip, "ring-2 ring-offset-1", cfg.ring)
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{cfg.label}</span>
                    {isActive && <span className={cn("ml-auto h-2 w-2 rounded-full", cfg.dot)} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Installer assignment ─────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <UserCheck className={cn("h-4 w-4", isPendingApproval ? "text-slate-300" : "text-indigo-500")} />
              <p className={cn("text-[11px] font-bold uppercase tracking-wider", isPendingApproval ? "text-slate-300" : "text-slate-400")}>
                Assign Installer
              </p>
              {isPendingApproval && (
                <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  <Lock className="h-2.5 w-2.5" /> Locked
                </span>
              )}
            </div>

            {isPendingApproval ? (
              <div className="flex flex-col items-center justify-center py-5 text-slate-300 gap-2">
                <Lock className="h-7 w-7 opacity-40" />
                <p className="text-xs text-center text-slate-400">
                  Installer cannot be assigned while the visit is pending approval.
                </p>
              </div>
            ) : (
              <>
                {entry.installerAssignedName && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5 mb-3">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-indigo-200 text-indigo-800 text-xs font-bold">
                        {entry.installerAssignedName.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold text-indigo-800">{entry.installerAssignedName}</p>
                      <p className="text-[11px] text-indigo-400">Currently assigned</p>
                    </div>
                    <CheckCircle2 className="h-4 w-4 text-indigo-400 ml-auto" />
                  </div>
                )}

                {installers && installers.length > 0 ? (
                  <div className="flex gap-2">
                    <Select value={selectedInstallerId} onValueChange={setSelectedInstallerId}>
                      <SelectTrigger className="flex-1 h-9 rounded-xl border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400">
                        <SelectValue placeholder="Select installer…" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-slate-200 shadow-lg">
                        {installers.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id} className="rounded-lg text-sm">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-5 w-5">
                                <AvatarFallback className="bg-indigo-100 text-indigo-700 text-[10px]">
                                  {inst.name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              {inst.name}
                              {inst.email && <span className="text-xs text-slate-400 truncate max-w-[100px]">{inst.email}</span>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 shrink-0 shadow-sm"
                      disabled={!selectedInstallerId || assigningInstaller}
                      onClick={handleInstallerAssign}
                    >
                      {assigningInstaller ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <><UserCheck className="h-3.5 w-3.5 mr-1.5" />Assign</>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 py-4 text-center">
                    <AlertCircle className="h-4 w-4 text-slate-300 mx-auto mb-1" />
                    <p className="text-xs text-slate-400">No installers available.</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Meta footer ─────────────────────────────────────────────── */}
          <div className="text-center space-y-0.5 pt-1">
            {entry.createdBy && (
              <p className="text-[11px] text-slate-400">
                Created by {entry.createdBy.name} ·{" "}
                {entry.createdAt
                  ? new Date(entry.createdAt).toLocaleString("en-IN", {
                      day: "numeric", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })
                  : "—"}
              </p>
            )}
            {entry.updatedAt && (
              <p className="text-[11px] text-slate-400">
                Last updated ·{" "}
                {new Date(entry.updatedAt).toLocaleString("en-IN", {
                  day: "numeric", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            )}
            {entry.source && (
              <p className="text-[11px] text-slate-300">Source: {entry.source}</p>
            )}
          </div>
        </div>

        <SheetFooter className="px-5 pb-5">
          <Button variant="outline" className="w-full rounded-xl border-slate-200 text-slate-600" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CompanyVisitDialog({ open, onOpenChange, installers }: Props) {
  const [category, setCategory] = useState<VisitCategory>("company_visit");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [purpose, setPurpose] = useState("");
  const [status, setStatus] = useState<VisitStatus>("planned");
  const [workMode, setWorkMode] = useState<WorkMode>("sample_meeting");
  const [assignedToId, setAssignedToId] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [remark, setRemark] = useState("");
  const [creating, setCreating] = useState(false);

  const [existingCustomer, setExistingCustomer] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<CustomerSearchResult[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);

  const [salesmen, setSalesmen] = useState<TeamMember[]>([]);
  const [members, setMembers] = useState<TeamMember[]>(defaultTeamMembers);
  const [memberInput, setMemberInput] = useState("");
  const [memberTypeInput, setMemberTypeInput] = useState<TeamMemberKind>("tailor");
  const [showAddMember, setShowAddMember] = useState(false);

  const [trackerRows, setTrackerRows] = useState<TrackerEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"form" | "list">("form");
  const [statusFilter, setStatusFilter] = useState<VisitStatus | "all">("all");

  const [selectedEntry, setSelectedEntry] = useState<TrackerEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "companyVisits"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setTrackerRows(
        snap.docs.map((d) => {
          const data = d.data() as any;
          const fullDoc = { ...(data || {}) } as Record<string, any>;
          const cat = normalizeVisitCategory(data?.category);
          const status = normalizeVisitStatus(data?.trackerStatus || data?.status);
          const pendingApproval =
            typeof data?.pendingApproval === "boolean"
              ? data.pendingApproval
              : String(data?.approvalStatus || data?.status || "").trim().toLowerCase() === "pending approval";
          return {
            ...fullDoc,
            fullDoc,
            id: d.id,
            createdAt: String(data?.createdAt || ""),
            updatedAt: String(data?.updatedAt || ""),
            category: cat,
            purpose: String(data?.purpose || ""),
            status,
            assignedToId: String(data?.assignedToId || ""),
            assignedToName: String(data?.assignedToName || ""),
            assignedRole: data?.assignedRole as TeamMemberKind,
            workMode: data?.workMode as WorkMode,
            from: String(data?.from || ""),
            to: String(data?.to || ""),
            visitDate: String(data?.visitDate || ""),
            startTime: String(data?.startTime || ""),
            endTime: String(data?.endTime || ""),
            remark: String(data?.remark || ""),
            pendingApproval,
            installerAssignedId: String(data?.installerAssignedId || ""),
            installerAssignedName: String(data?.installerAssignedName || ""),
            customerSnapshot: (data?.customerSnapshot || null) as Record<string, any> | null,
            customerId: String(data?.customerId || ""),
            customerName: String(data?.customerName || ""),
            customerPhone: String(data?.customerPhone || ""),
            customerEmail: String(data?.customerEmail || ""),
            customerCode: String(data?.customerCode || ""),
            complaintType: String(data?.complaintType || ""),
            complaintStatus: String(data?.complaintStatus || ""),
            approvalStatus: String(data?.approvalStatus || ""),
            workNote: String(data?.workNote || ""),
            photos: Array.isArray(data?.photos) ? data.photos : [],
            photoUrls: Array.isArray(data?.photoUrls) ? data.photoUrls : [],
            source: String(data?.source || ""),
            createdBy: (data?.createdBy || null) as Record<string, any> | null,
            approval: (data?.approval || null) as Record<string, any> | null,
          } as TrackerEntry;
        }).filter(Boolean) as TrackerEntry[]
      );
    }, (err) => console.error("Tracker load error:", err));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "salesman"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => {
            const data = d.data() as any;
            const name = String(data?.name || "").trim();
            if (!name) return null;
            return { id: d.id, name, kind: "salesman" as TeamMemberKind };
          })
          .filter(Boolean) as TeamMember[];
        setSalesmen(rows);
      },
      (err) => console.error("Salesmen load error:", err)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const opts = purposeByCategory[category];
    setPurpose((prev) => (opts.some((o) => o.value === prev) ? prev : opts[0]?.value || ""));
    setAssignedToId("");
    setWorkMode(category === "tailor_work" ? "outside_workshop" : "sample_meeting");
    if (category !== "tailor_work") {
      setExistingCustomer(false);
      setCustomerSearchTerm("");
      setCustomerSearchResults([]);
      setSelectedCustomer(null);
      setSearchingCustomer(false);
      setShowAddMember(false);
    }
  }, [category]);

  const requiredKind: TeamMemberKind = category === "tailor_work" ? "tailor" : "salesman";
  const assignableMembers = useMemo(
    () => (category === "tailor_work" ? members.filter((m) => m.kind === "tailor") : salesmen),
    [category, members, salesmen]
  );

  const summary = useMemo(() => ({
    total: trackerRows.length,
    planned: trackerRows.filter((r) => r.status === "planned").length,
    inProgress: trackerRows.filter((r) => r.status === "in_progress").length,
    completed: trackerRows.filter((r) => r.status === "completed").length,
    onHold: trackerRows.filter((r) => r.status === "on_hold").length,
    pendingApproval: trackerRows.filter((r) => r.pendingApproval).length,
  }), [trackerRows]);

  const filteredRows = useMemo(
    () => statusFilter === "all" ? trackerRows : trackerRows.filter((r) => r.status === statusFilter),
    [trackerRows, statusFilter]
  );

  const resetForm = () => {
    setCategory("company_visit");
    setStatus("planned");
    setClientName("");
    setClientPhone("");
    setClientAddress("");
    setVisitDate("");
    setRemark("");
    setAssignedToId("");
    setExistingCustomer(false);
    setCustomerSearchTerm("");
    setCustomerSearchResults([]);
    setSelectedCustomer(null);
    setSearchingCustomer(false);
    setShowAddMember(false);
    setMemberInput("");
    setPurpose(purposeByCategory.company_visit[0]?.value || "");
    setWorkMode("sample_meeting");
  };

  const handleAddMember = () => {
    const name = memberInput.trim();
    if (!name) return;
    if (members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Member already exists.");
      return;
    }
    setMembers((p) => [...p, { id: makeId(), name, kind: memberTypeInput }]);
    setMemberInput("");
    toast.success("Team member added.");
  };

  const handleRemoveMember = (id: string) => {
    setMembers((p) => p.filter((m) => m.id !== id));
    if (assignedToId === id) setAssignedToId("");
  };

 const handleSearchExistingCustomer = async () => {
  const term = customerSearchTerm.trim();

  if (term.length < 2) {
    toast.error("Enter at least 2 characters to search.");
    return;
  }

  setSearchingCustomer(true);
  setCustomerSearchResults([]);

  try {
    // Fetch all customers ordered by createdAt (same as your server action)
    const snap = await getDocs(
      query(
        collection(db, "customers"),
        orderBy("createdAt", "desc"),
        limit(250)
      )
    );

    const results: CustomerSearchResult[] = snap.docs
      .map((d) => {
        const data = d.data() as any;
        console.log("Customer record:",data ); // Debug log
        const name = String(data?.name || "").trim();
        const phone = String(data?.phone || data?.mobileNo || "").trim();
        const email = String(data?.email || "").trim();
        const address = String(data?.billingAddress?.line1 || data?.address || "").trim();
        const customerCode = String(data?.customerCode || "").trim();

        if (!name && !phone) return null;

        return {
          id: d.id,
          name,
          phone,
          email: email || undefined,
          address: address || undefined,
          customerCode: customerCode || undefined,
        } as CustomerSearchResult;
      })
      .filter(Boolean)
      .filter((row) => {
        const r = row as CustomerSearchResult;
        // Same logic as your server action
        const isPhone = /[0-9]/.test(term);
        const isEmail = term.includes("@");

        if (isEmail) {
          return r.email?.toLowerCase().includes(term.toLowerCase());
        } else if (isPhone) {
          return r.phone?.includes(term);
        } else {
          return r.name?.toLowerCase().includes(term.toLowerCase());
        }
      })
      .slice(0, 8) as CustomerSearchResult[];

    setCustomerSearchResults(results);
    if (!results.length) toast.error("Customer not found.");
  } catch (error) {
    console.error("Customer search failed:", error);
    toast.error("Failed to search customer.");
  } finally {
    setSearchingCustomer(false);
  }
};
  const handleSelectExistingCustomer = (customer: CustomerSearchResult) => {
    setSelectedCustomer(customer);
    setCustomerSearchTerm(customer.phone ? `${customer.name} (${customer.phone})` : customer.name);
    setCustomerSearchResults([]);
    setClientName(customer.name);
    setClientPhone(customer.phone);
    setClientAddress(customer.address || "");
  };

  const handleStatusUpdate = async (id: string, nextStatus: VisitStatus) => {
    try {
      await updateDoc(doc(db, "companyVisits", id), { status: nextStatus, updatedAt: new Date().toISOString() });
      setSelectedEntry((prev) => prev?.id === id ? { ...prev, status: nextStatus } : prev);
      toast.success(`Status → ${statusConfig[nextStatus].label}`);
    } catch { toast.error("Failed to update status."); }
  };

  const handleInstallerAssign = async (id: string, installerId: string, installerName: string) => {
    await updateDoc(doc(db, "companyVisits", id), {
      installerAssignedId: installerId,
      installerAssignedName: installerName,
      updatedAt: new Date().toISOString(),
    });
    setSelectedEntry((prev) =>
      prev?.id === id ? { ...prev, installerAssignedId: installerId, installerAssignedName: installerName } : prev
    );
  };

  const handleSubmit = async () => {
    if (
      !clientName.trim() ||
      !clientPhone.trim() ||
      !clientAddress.trim() ||
      !purpose ||
      !assignedToId ||
      !visitDate ||
      !remark.trim()
    ) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (category === "tailor_work" && existingCustomer && !selectedCustomer) {
      toast.error("Select an existing customer from search results.");
      return;
    }

    const member = assignableMembers.find((m) => m.id === assignedToId);
    if (!member) { toast.error("Please select a valid assignee."); return; }

    const customerSnapshot = {
      name: clientName.trim(),
      phone: clientPhone.trim(),
      address: clientAddress.trim(),
    };

    setCreating(true);
    try {
      await addDoc(collection(db, "companyVisits"), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category, purpose, status,
        assignedToId: member.id, assignedToName: member.name, assignedRole: member.kind,
        workMode,
        visitDate,
        from: "",
        to: customerSnapshot.address,
        startTime: "",
        endTime: "",
        remark: remark.trim(),
        workNote: remark.trim(),
        customerSnapshot,
        customerId: selectedCustomer?.id || "",
        customerName: customerSnapshot.name,
        customerPhone: customerSnapshot.phone,
        customerEmail: selectedCustomer?.email || "",
        customerCode: selectedCustomer?.customerCode || "",
        existingCustomer: category === "tailor_work" ? existingCustomer : false,
        source:
          category === "tailor_work"
            ? existingCustomer
              ? "tailor_existing_customer"
              : "tailor_manual_customer"
            : "company_visit_manual",
        pendingApproval: false,
        installerAssignedId: "", installerAssignedName: "",
      });
      toast.success("Visit entry created.");
      resetForm();
      setActiveTab("list");
    } catch { toast.error("Failed to create entry."); }
    finally { setCreating(false); }
  };

  const openDetail = (entry: TrackerEntry) => {
    setSelectedEntry(entry);
    setDetailOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[94vh] max-w-4xl overflow-hidden flex flex-col bg-[#f8f9fb] rounded-2xl border-slate-200 shadow-2xl p-0">

          {/* ── Header ── */}
          <div className="bg-white border-b border-slate-100 px-6 pt-5 pb-4 shrink-0">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm">
                  <Briefcase className="h-5 w-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-slate-900 tracking-tight">Visit Tracker</DialogTitle>
                  <DialogDescription className="text-xs text-slate-400 mt-0.5">
                    Company visits and tailor work — all in one place
                  </DialogDescription>
                </div>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-2">
                <StatPill label="Total" value={summary.total} color="border-slate-200" />
                <StatPill label="Planned" value={summary.planned} color="border-slate-200" />
                <StatPill label="In Progress" value={summary.inProgress} color="border-sky-200 bg-sky-50" />
                <StatPill label="Completed" value={summary.completed} color="border-emerald-200 bg-emerald-50" />
                <StatPill label="On Hold" value={summary.onHold} color="border-amber-200 bg-amber-50" />
                {summary.pendingApproval > 0 && (
                  <StatPill label="Pending Approval" value={summary.pendingApproval} color="border-amber-300 bg-amber-50" />
                )}
              </div>
            </DialogHeader>

            {/* Tabs */}
            <div className="flex gap-1 mt-4">
              {([
                { key: "form", label: "New Entry", icon: PlusCircle },
                { key: "list", label: `All Entries (${trackerRows.length})`, icon: LayoutGrid },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all",
                    activeTab === key
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto">

            {/* ════ FORM TAB ════ */}
            {activeTab === "form" && (
              <div className="p-6 space-y-5">
                {/* Category toggle */}
                <div className="flex rounded-2xl border border-slate-200 bg-white p-1 gap-1 shadow-sm">
                  {([
                    { v: "company_visit", label: "Company Visit", Icon: Building2, bg: "bg-indigo-50", iconColor: "text-indigo-500" },
                    { v: "tailor_work", label: "Tailor Work", Icon: Scissors, bg: "bg-violet-50", iconColor: "text-violet-500" },
                  ] as const).map(({ v, label, Icon, bg, iconColor }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCategory(v)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all",
                        category === v
                          ? cn("shadow-sm border border-slate-200", bg, iconColor)
                          : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Form fields */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
                  {category === "tailor_work" && (
                    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3.5 space-y-3">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-violet-300"
                          checked={existingCustomer}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setExistingCustomer(checked);
                            setCustomerSearchTerm("");
                            setCustomerSearchResults([]);
                            setSelectedCustomer(null);
                            setSearchingCustomer(false);
                            setClientName("");
                            setClientPhone("");
                            setClientAddress("");
                          }}
                        />
                        Existing Customer
                      </label>

                      {existingCustomer && (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <SInput
                              value={customerSearchTerm}
                              onChange={(e) => {
                                setCustomerSearchTerm(e.target.value);
                                if (customerSearchResults.length) setCustomerSearchResults([]);
                                if (selectedCustomer) setSelectedCustomer(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void handleSearchExistingCustomer();
                                }
                              }}
                              placeholder="Search customer by name, phone, email, address"
                            />
                            <Button
                              type="button"
                              className="h-9 rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-4 shadow-sm"
                              disabled={searchingCustomer}
                              onClick={handleSearchExistingCustomer}
                            >
                              {searchingCustomer ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                            </Button>
                          </div>

                          {customerSearchResults.length > 0 && (
                            <div className="max-h-44 overflow-auto rounded-xl border border-violet-200 bg-white divide-y divide-slate-100">
                              {customerSearchResults.map((row) => (
                                <button
                                  key={row.id}
                                  type="button"
                                  className="w-full text-left px-3 py-2.5 hover:bg-violet-50 transition-colors"
                                  onClick={() => handleSelectExistingCustomer(row)}
                                >
                                  <p className="text-sm font-semibold text-slate-800">{row.name}</p>
                                  <p className="text-xs text-slate-500">
                                    {row.phone || "No phone"}
                                    {row.address ? ` - ${row.address}` : ""}
                                  </p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <FieldLabel required>Client Name</FieldLabel>
                      <SInput
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Enter customer name"
                        disabled={category === "tailor_work" && existingCustomer}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel required>Client Number</FieldLabel>
                      <SInput
                        value={clientPhone}
                        onChange={(e) => setClientPhone(e.target.value)}
                        placeholder="Enter phone number"
                        disabled={category === "tailor_work" && existingCustomer}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel required>Client Address</FieldLabel>
                      <SInput
                        value={clientAddress}
                        onChange={(e) => setClientAddress(e.target.value)}
                        placeholder="Enter address"
                        disabled={category === "tailor_work" && existingCustomer}
                      />
                    </div>
                  </div>

                  {category === "tailor_work" && <div className="border-t border-slate-200" />}

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <FieldLabel required>Purpose</FieldLabel>
                      <SSelect value={purpose} onValueChange={setPurpose}>
                        {purposeByCategory[category].map((o) => (
                          <SI key={o.value} value={o.value}>{o.label}</SI>
                        ))}
                      </SSelect>
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel required>Status</FieldLabel>
                      <SSelect value={status} onValueChange={(v) => setStatus(v as VisitStatus)}>
                        <SI value="planned">Planned</SI>
                        <SI value="in_progress">In Progress</SI>
                        <SI value="completed">Completed</SI>
                        <SI value="on_hold">On Hold</SI>
                      </SSelect>
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel required>Work Mode</FieldLabel>
                      <SSelect value={workMode} onValueChange={(v) => setWorkMode(v as WorkMode)}>
                        <SI value="customer_home">Customer Home</SI>
                        <SI value="outside_workshop">Outside Workshop</SI>
                        <SI value="factory_visit">Factory Visit</SI>
                        <SI value="sample_meeting">Sample Meeting</SI>
                      </SSelect>
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel required>Visit Date</FieldLabel>
                      <SInput type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <FieldLabel required>{requiredKind === "tailor" ? "Assign Tailor" : "Related Salesman"}</FieldLabel>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <SSelect value={assignedToId} onValueChange={setAssignedToId}>
                            {assignableMembers.map((m) => (
                              <SI key={m.id} value={m.id}>{m.name}</SI>
                            ))}
                          </SSelect>
                        </div>
                        {category === "tailor_work" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 rounded-xl border-slate-200 flex-shrink-0 shadow-sm"
                            onClick={() => setShowAddMember((p) => !p)}
                          >
                            {showAddMember ? <X className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {category === "tailor_work" && showAddMember && (
                    <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-4 space-y-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-violet-600">Add Tailor</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2 space-y-1.5">
                          <FieldLabel>Tailor Name</FieldLabel>
                          <SInput
                            value={memberInput}
                            onChange={(e) => setMemberInput(e.target.value)}
                            placeholder="Enter tailor name"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                setMemberTypeInput("tailor");
                                handleAddMember();
                              }
                            }}
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            className="w-full h-9 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm shadow-sm"
                            onClick={() => {
                              setMemberTypeInput("tailor");
                              handleAddMember();
                            }}
                          >
                            Add Tailor
                          </Button>
                        </div>
                      </div>

                      {members.filter((m) => m.kind === "tailor").length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-3 border-t border-violet-100">
                          {members
                            .filter((m) => m.kind === "tailor")
                            .map((m) => (
                              <span
                                key={m.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-700"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                                {m.name}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMember(m.id)}
                                  className="ml-0.5 text-slate-400 hover:text-slate-600"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <FieldLabel required>Work Note</FieldLabel>
                    <Textarea
                      value={remark}
                      onChange={(e) => setRemark(e.target.value)}
                      placeholder={category === "tailor_work" ? "Add tailor work notes..." : "Add visit work notes..."}
                      className="resize-none rounded-xl border-slate-200 bg-white text-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:border-indigo-400 min-h-[90px] shadow-sm"
                    />
                  </div>
                </div>

                {/* Submit */}
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={resetForm} className="rounded-xl text-slate-500 hover:bg-slate-100">
                    Reset
                  </Button>
                  <Button onClick={handleSubmit} disabled={creating} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-6 shadow-sm">
                    {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Add to Tracker"}
                  </Button>
                </div>
              </div>
            )}

            {/* ════ LIST TAB ════ */}
            {activeTab === "list" && (
              <div className="p-6 space-y-4">
                {/* Filter pills */}
                <div className="flex flex-wrap gap-2">
                  {([
                    { v: "all", label: `All (${trackerRows.length})` },
                    { v: "planned", label: `Planned (${summary.planned})` },
                    { v: "in_progress", label: `In Progress (${summary.inProgress})` },
                    { v: "completed", label: `Completed (${summary.completed})` },
                    { v: "on_hold", label: `On Hold (${summary.onHold})` },
                  ] as const).map(({ v, label }) => {
                    const isActive = statusFilter === v;
                    const cfg = v !== "all" ? statusConfig[v as VisitStatus] : null;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setStatusFilter(v as VisitStatus | "all")}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                          isActive && cfg ? cn(cfg.chip, "ring-1 ring-offset-1", cfg.ring) :
                          isActive ? "bg-slate-900 text-white border-slate-900" :
                          "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {filteredRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 gap-3">
                    <ListFilter className="h-7 w-7 text-slate-300" />
                    <p className="text-sm text-slate-400">No entries for this filter.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredRows.map((entry) => {
                      const sc = getStatusConfig(entry.status);
                      const catMeta = categoryConfig[entry.category];
                      const CatIcon = catMeta.icon;
                      const isPending = !!entry.pendingApproval;

                      console.log("Rendering entry:", entry); // Debug log

                                              // Drop-in replacement for the visit list <button> card.
                      // Works for all three: customer_complaint, company_visit, tailor_work.
                      // Requires the same imports / helpers already in your file:
                      //   cn, catMeta, CatIcon, sc, isPending, toTitle,
                      //   workModeLabel, entry (TrackerEntry), openDetail

                      const isComplaint = entry.purpose === "customer_complaint";
                      const isTailor    = entry.category === "tailor_work";

                      // Approval strip (complaint only)
                      const isApproved  = isComplaint && entry.approvalStatus === "Approved";
                      const isPendingApproval = isComplaint && !!entry.pendingApproval;

                      // Address: prefer snapshot, fallback to flat field or `to`
                      const displayAddress =
                        entry.customerSnapshot?.address || entry.customerAddress || entry.to || "Address not set";

                      // Work mode label
                      const displayWorkMode =
                        workModeLabel[entry.workMode] || toTitle(String(entry.workMode || ""));

                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => openDetail(entry)}
                          className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-indigo-200 hover:shadow-sm transition-all group"
                        >
                          <div className="flex items-start gap-3">

                            {/* Category icon */}
                            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5", catMeta.bg)}>
                              <CatIcon className={cn("h-4 w-4", catMeta.iconColor)} />
                            </div>

                            <div className="flex-1 min-w-0">

                              {/* ── Row 1: name + pending pill + status + chevron ────────── */}
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="text-sm font-semibold text-slate-800 truncate">
                                    {toTitle(entry.customerName)}
                                  </p>
                                  {isPending && (
                                    <span className="flex-shrink-0 flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                      <Lock className="h-2.5 w-2.5" />
                                      Pending
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", sc.chip)}>
                                    <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
                                    {sc.label}
                                  </span>
                                  <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                                </div>
                              </div>

                              {/* ── Row 2: category badge + meta items ───────────────────── */}
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">

                                {/* Category badge — color per type */}
                                <span className={cn(
                                  "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                  catMeta.bg, catMeta.accent, catMeta.iconColor
                                )}>
                                  {catMeta.label}
                                </span>

                                {/* Assigned person */}
                                <span className="flex items-center gap-1">
                                  <User2 className="h-3 w-3" />
                                  {entry.assignedToName || "Unassigned"}
                                </span>

                                {/* Address / destination */}
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-rose-300" />
                                  {displayAddress}
                                </span>

                                {/* Date */}
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {entry.visitDate || "—"}
                                </span>

                                {/* Work mode */}
                                <span className="flex items-center gap-1">
                                  <Briefcase className="h-3 w-3" />
                                  {displayWorkMode}
                                </span>
                              </div>

                              {/* ── Row 3: contextual strips ──────────────────────────────── */}

                              {/* COMPLAINT — approved: green strip */}
                              {isComplaint && isApproved && entry.approval && (
                                <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5">
                                  <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                                  <span className="text-[11px] font-semibold text-green-700">
                                    Approved by {entry.approval.approvedBy?.name}
                                    {entry.approval.chargeType === "free" ? " · Free of charge" : ` · ₹${entry.approval.chargeAmount}`}
                                  </span>
                                </div>
                              )}

                              {/* COMPLAINT — pending approval: amber strip */}
                              {isComplaint && isPendingApproval && !isApproved && (
                                <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                                  <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />
                                  <span className="text-[11px] font-semibold text-amber-700">
                                    {entry.remark || entry.complaintType || "Awaiting approval"}
                                  </span>
                                </div>
                              )}

                              {/* COMPLAINT — no approval object yet but has remark */}
                              {isComplaint && !isApproved && !isPendingApproval && entry.remark && (
                                <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5">
                                  <AlertCircle className="h-3 w-3 text-rose-400 shrink-0" />
                                  <span className="text-[11px] font-semibold text-rose-600 truncate">
                                    {entry.remark}
                                  </span>
                                </div>
                              )}

                              {/* TAILOR — purpose badge */}
                              {isTailor && entry.purpose && (
                                <div className="mt-2 flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 rounded-full border border-[#AFA9EC] bg-[#EEEDFE] px-2.5 py-0.5 text-[11px] font-semibold text-[#534AB7]">
                                    <Scissors className="h-2.5 w-2.5" />
                                    {toTitle(entry.purpose)}
                                  </span>
                                  {entry.existingCustomer && (
                                    <span className="inline-flex items-center rounded-full border border-[#9FE1CB] bg-[#E1F5EE] px-2.5 py-0.5 text-[11px] font-semibold text-[#0F6E56]">
                                      Existing customer
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* COMPANY — new customer badge */}
                              {!isComplaint && !isTailor && entry.existingCustomer === false && (
                                <div className="mt-2">
                                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                                    New customer
                                  </span>
                                </div>
                              )}

                              {/* ALL — installer assigned (not pending) */}
                              {entry.installerAssignedName && !isPending && (
                                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                                  <UserCheck className="h-3 w-3" />
                                  {entry.installerAssignedName}
                                </div>
                              )}

                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <EntryDetailSheet
        entry={selectedEntry}
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedEntry(null); }}
        installers={installers}
        onStatusUpdate={handleStatusUpdate}
        onInstallerAssign={handleInstallerAssign}
      />
    </>
  );
}
