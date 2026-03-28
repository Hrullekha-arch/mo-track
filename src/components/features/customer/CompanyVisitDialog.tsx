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
  SheetDescription,
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
  Clock,
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
  TrendingUp,
  AlertCircle,
  Lock,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installers?: Array<{ id: string; name: string; email?: string }>;
};

type TeamMemberKind = "employee" | "tailor";
type VisitCategory = "company_visit" | "tailor_work";
type VisitStatus = "planned" | "in_progress" | "completed" | "on_hold";
type WorkMode =
  | "customer_home"
  | "outside_workshop"
  | "factory_visit"
  | "sample_meeting";

type TeamMember = { id: string; name: string; kind: TeamMemberKind };

type TrackerEntry = {
  id: string;
  createdAt: string;
  updatedAt?: string;
  category: VisitCategory;
  purpose: string;
  status: VisitStatus;
  assignedToId: string;
  assignedToName: string;
  assignedRole: TeamMemberKind;
  workMode: WorkMode;
  from: string;
  to: string;
  visitDate: string;
  startTime: string;
  endTime: string;
  remark: string;
  pendingApproval?: boolean;
  installerAssignedId?: string;
  installerAssignedName?: string;
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
  completed: {
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
  if (n === "company_visit" || n === "tailor_work") return n;
  return "company_visit";
};

const normalizeVisitStatus = (value: unknown): VisitStatus => {
  const n = String(value || "").trim();
  if (n === "planned" || n === "in_progress" || n === "completed" || n === "on_hold") return n;
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
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assigningInstaller, setAssigningInstaller] = useState(false);
  const [selectedInstallerId, setSelectedInstallerId] = useState(entry?.installerAssignedId ?? "");

  useEffect(() => {
    setSelectedInstallerId(entry?.installerAssignedId ?? "");
  }, [entry]);

  if (!entry) return null;

  const sc = getStatusConfig(entry.status);
  const StatusIcon = sc.icon;
  const catMeta = categoryConfig[entry.category];
  const CategoryIcon = catMeta.icon;
  const isPendingApproval = !!entry.pendingApproval;

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

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-[#f8f9fb] border-l border-slate-200 p-0">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-5 py-4">
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", catMeta.bg)}>
                <CategoryIcon className={cn("h-5 w-5", catMeta.iconColor)} />
              </div>
              <div>
                <SheetTitle className="text-slate-900 text-base leading-tight">{toTitle(entry.purpose)}</SheetTitle>
                <SheetDescription className="text-xs text-slate-400 mt-0.5">
                  {catMeta.label} · {workModeLabel[entry.workMode]}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="p-5 space-y-4">
          {/* Pending approval banner */}
          {isPendingApproval && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <Lock className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-800">Pending Approval</p>
                <p className="text-xs text-amber-600 mt-0.5">Installer assignment is locked until this visit is approved.</p>
              </div>
            </div>
          )}

          {/* Status badge */}
          <div className={cn("flex items-center gap-2.5 rounded-xl border px-4 py-3", sc.chip)}>
            <span className={cn("h-2 w-2 rounded-full flex-shrink-0", sc.dot)} />
            <StatusIcon className="h-4 w-4" />
            <span className="text-sm font-semibold">{sc.label}</span>
            {updatingStatus && <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto" />}
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Assigned To</p>
              <div className="flex items-center gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                    {entry.assignedToName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-slate-800 leading-tight">{entry.assignedToName}</p>
                  <p className="text-[11px] text-slate-400 capitalize">{entry.assignedRole}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Schedule</p>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <p className="text-sm font-semibold text-slate-800">{entry.visitDate || "—"}</p>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <p className="text-xs text-slate-500">{entry.startTime} – {entry.endTime}</p>
              </div>
            </div>

            <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Route</p>
              <div className="flex items-center gap-2 flex-wrap">
                <MapPin className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                <span className="text-sm font-medium text-slate-700">{entry.from}</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                <MapPin className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                <span className="text-sm font-medium text-slate-700">{entry.to}</span>
              </div>
            </div>
          </div>

          {entry.remark && (
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1">Notes</p>
              <p className="text-sm text-slate-700 leading-relaxed">{entry.remark}</p>
            </div>
          )}

          {/* Update status */}
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

          {/* Installer assignment */}
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
  const [purpose, setPurpose] = useState("");
  const [status, setStatus] = useState<VisitStatus>("planned");
  const [workMode, setWorkMode] = useState<WorkMode>("sample_meeting");
  const [assignedToId, setAssignedToId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [remark, setRemark] = useState("");
  const [creating, setCreating] = useState(false);

  const [members, setMembers] = useState<TeamMember[]>(defaultTeamMembers);
  const [memberInput, setMemberInput] = useState("");
  const [memberTypeInput, setMemberTypeInput] = useState<TeamMemberKind>("employee");
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
          const cat = normalizeVisitCategory(data?.category);
          const status = normalizeVisitStatus(data?.trackerStatus || data?.status);
          const pendingApproval =
            typeof data?.pendingApproval === "boolean"
              ? data.pendingApproval
              : String(data?.approvalStatus || data?.status || "").trim().toLowerCase() === "pending approval";
          return {
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
          } as TrackerEntry;
        }).filter(Boolean) as TrackerEntry[]
      );
    }, (err) => console.error("Tracker load error:", err));
    return () => unsub();
  }, []);

  useEffect(() => {
    const opts = purposeByCategory[category];
    setPurpose((prev) => (opts.some((o) => o.value === prev) ? prev : opts[0]?.value || ""));
    setAssignedToId("");
    setWorkMode(category === "tailor_work" ? "outside_workshop" : "sample_meeting");
  }, [category]);

  const requiredKind: TeamMemberKind = category === "tailor_work" ? "tailor" : "employee";
  const assignableMembers = useMemo(() => members.filter((m) => m.kind === requiredKind), [members, requiredKind]);

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
    setFrom(""); setTo(""); setVisitDate(""); setStartTime(""); setEndTime(""); setRemark("");
    setAssignedToId("");
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
    if (!purpose || !assignedToId || !from || !to || !visitDate || !startTime || !endTime) {
      toast.error("Please fill all required fields.");
      return;
    }
    const member = members.find((m) => m.id === assignedToId);
    if (!member) { toast.error("Please select a valid assignee."); return; }
    setCreating(true);
    try {
      await addDoc(collection(db, "companyVisits"), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category, purpose, status,
        assignedToId: member.id, assignedToName: member.name, assignedRole: member.kind,
        workMode,
        from: from.trim(), to: to.trim(),
        visitDate, startTime, endTime,
        remark: remark.trim(),
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
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                  {/* Row 1 */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <FieldLabel required>Purpose</FieldLabel>
                      <SSelect value={purpose} onValueChange={setPurpose}>
                        {purposeByCategory[category].map((o) => <SI key={o.value} value={o.value}>{o.label}</SI>)}
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

                  {/* Row 2: Assignee + Route */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2 space-y-1.5">
                      <FieldLabel required>{requiredKind === "tailor" ? "Assign Tailor" : "Assign Employee"}</FieldLabel>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <SSelect value={assignedToId} onValueChange={setAssignedToId}>
                            {assignableMembers.map((m) => <SI key={m.id} value={m.id}>{m.name}</SI>)}
                          </SSelect>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 rounded-xl border-slate-200 flex-shrink-0 shadow-sm"
                          onClick={() => setShowAddMember((p) => !p)}
                        >
                          {showAddMember ? <X className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel required>From</FieldLabel>
                      <SInput value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Current location" />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel required>To</FieldLabel>
                      <SInput value={to} onChange={(e) => setTo(e.target.value)} placeholder="Visit location" />
                    </div>
                  </div>

                  {/* Add member panel */}
                  {showAddMember && (
                    <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-500">Add Team Member</p>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="space-y-1.5">
                          <FieldLabel>Type</FieldLabel>
                          <SSelect value={memberTypeInput} onValueChange={(v) => setMemberTypeInput(v as TeamMemberKind)}>
                            <SI value="employee">Employee</SI>
                            <SI value="tailor">Tailor</SI>
                          </SSelect>
                        </div>
                        <div className="md:col-span-2 space-y-1.5">
                          <FieldLabel>Full Name</FieldLabel>
                          <SInput value={memberInput} onChange={(e) => setMemberInput(e.target.value)} placeholder="Enter name" onKeyDown={(e) => { if (e.key === "Enter") handleAddMember(); }} />
                        </div>
                        <div className="flex items-end">
                          <Button type="button" className="w-full h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm shadow-sm" onClick={handleAddMember}>
                            Add Member
                          </Button>
                        </div>
                      </div>

                      {members.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-3 border-t border-indigo-100">
                          {members.map((m) => (
                            <span
                              key={m.id}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                                m.kind === "employee" ? "bg-white border-indigo-200 text-indigo-700" : "bg-white border-violet-200 text-violet-700"
                              )}
                            >
                              <span className={cn("h-1.5 w-1.5 rounded-full", m.kind === "employee" ? "bg-indigo-400" : "bg-violet-400")} />
                              {m.name}
                              <span className="opacity-40 capitalize text-[10px]">({m.kind})</span>
                              <button type="button" onClick={() => handleRemoveMember(m.id)} className="ml-0.5 text-slate-400 hover:text-slate-600">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Times + Remark */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <FieldLabel required>Start Time</FieldLabel>
                      <SInput type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel required>End Time</FieldLabel>
                      <SInput type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <FieldLabel>Work Notes</FieldLabel>
                    <Textarea
                      value={remark}
                      onChange={(e) => setRemark(e.target.value)}
                      placeholder="Add stitching / work / sample remarks…"
                      className="resize-none rounded-xl border-slate-200 bg-white text-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:border-indigo-400 min-h-[80px] shadow-sm"
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

                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => openDetail(entry)}
                          className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-indigo-200 hover:shadow-sm transition-all group"
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5", catMeta.bg)}>
                              <CatIcon className={cn("h-4 w-4", catMeta.iconColor)} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="text-sm font-semibold text-slate-800 truncate">{toTitle(entry.purpose)}</p>
                                  {isPending && (
                                    <span className="flex-shrink-0 flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                      <Lock className="h-2.5 w-2.5" /> Pending
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

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", catMeta.bg, catMeta.accent, catMeta.iconColor)}>
                                  {catMeta.label}
                                </span>
                                <span className="flex items-center gap-1"><User2 className="h-3 w-3" />{entry.assignedToName}</span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-rose-300" />{entry.from}
                                  <ArrowRight className="h-2.5 w-2.5 text-slate-300" />{entry.to}
                                </span>
                                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{entry.visitDate}</span>
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{entry.startTime} – {entry.endTime}</span>
                              </div>

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
