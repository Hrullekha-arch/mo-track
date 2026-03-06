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
import { Separator } from "@/components/ui/separator";
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
type VisitCategory = "company_visit" | "tailor_work" | "complaint_visit";
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
  complaintSubType?: string;
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

const purposeByCategory: Record<
  VisitCategory,
  Array<{ value: string; label: string }>
> = {
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
  complaint_visit: [
    { value: "curtain_alteration", label: "Curtain Alteration" },
    { value: "repair", label: "Repair" },
    { value: "blind_installation_repair", label: "Blind Installation Repair" },
    { value: "uninstallation", label: "Uninstallation" },
  ],
};

const workModeLabel: Record<WorkMode, string> = {
  customer_home: "Customer Home",
  outside_workshop: "Outside Workshop",
  factory_visit: "Factory Visit",
  sample_meeting: "Sample Meeting",
};

const categoryConfig: Record<
  VisitCategory,
  {
    label: string;
    icon: React.ElementType;
    iconWrapClass: string;
    iconClass: string;
  }
> = {
  company_visit: {
    label: "Company Visit",
    icon: Building2,
    iconWrapClass: "bg-indigo-50",
    iconClass: "text-indigo-600",
  },
  tailor_work: {
    label: "Tailor Work",
    icon: Scissors,
    iconWrapClass: "bg-violet-50",
    iconClass: "text-violet-600",
  },
  complaint_visit: {
    label: "Complaint Visit",
    icon: AlertCircle,
    iconWrapClass: "bg-rose-50",
    iconClass: "text-rose-600",
  },
};

const statusConfig: Record<
  VisitStatus,
  { label: string; icon: React.ElementType; chip: string; dot: string }
> = {
  planned: {
    label: "Planned",
    icon: Circle,
    chip: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  in_progress: {
    label: "In Progress",
    icon: Timer,
    chip: "bg-sky-50 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  on_hold: {
    label: "On Hold",
    icon: PauseCircle,
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-400",
  },
};

const makeId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const toTitle = (value: string) =>
  value
    .split("_")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");

const normalizeVisitCategory = (value: unknown): VisitCategory => {
  const normalized = String(value || "").trim();
  if (
    normalized === "company_visit" ||
    normalized === "tailor_work" ||
    normalized === "complaint_visit"
  ) {
    return normalized;
  }
  return "company_visit";
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard = ({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: number;
  accent?: string;
  icon: React.ElementType;
}) => (
  <div
    className={cn(
      "flex flex-col gap-1 rounded-2xl border p-4 transition-all",
      accent ?? "bg-white border-slate-200"
    )}
  >
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <Icon className="h-3.5 w-3.5 text-slate-400" />
    </div>
    <span className="text-2xl font-bold tracking-tight text-slate-800">
      {value}
    </span>
  </div>
);

const FormRow = ({
  children,
  cols = 2,
}: {
  children: React.ReactNode;
  cols?: number;
}) => (
  <div
    className={cn(
      "grid gap-4",
      cols === 1 && "grid-cols-1",
      cols === 2 && "grid-cols-1 md:grid-cols-2",
      cols === 3 && "grid-cols-1 md:grid-cols-3",
      cols === 4 && "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
    )}
  >
    {children}
  </div>
);

const FieldWrapper = ({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
      {label}
      {required && <span className="ml-0.5 text-rose-400">*</span>}
    </Label>
    {children}
  </div>
);

const StyledInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input>
>((props, ref) => (
  <Input
    ref={ref}
    {...props}
    className={cn(
      "h-9 rounded-xl border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder:text-slate-400",
      "focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:border-indigo-400 focus-visible:bg-white",
      "transition-all",
      props.className
    )}
  />
));
StyledInput.displayName = "StyledInput";

const StyledSelect = ({
  value,
  onValueChange,
  placeholder,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  children: React.ReactNode;
}) => (
  <Select value={value} onValueChange={onValueChange}>
    <SelectTrigger className="h-9 rounded-xl border-slate-200 bg-slate-50 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all">
      <SelectValue placeholder={placeholder ?? "Select…"} />
    </SelectTrigger>
    <SelectContent className="rounded-xl border-slate-200 shadow-lg">
      {children}
    </SelectContent>
  </Select>
);

const Item = ({ value, children }: { value: string; children: React.ReactNode }) => (
  <SelectItem value={value} className="rounded-lg text-sm">
    {children}
  </SelectItem>
);

// ─── Entry Detail Sheet ───────────────────────────────────────────────────────

const EntryDetailSheet = ({
  entry,
  open,
  onClose,
  installers,
  onStatusUpdate,
  onInstallerAssign,
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
  const [selectedInstallerId, setSelectedInstallerId] = useState(
    entry?.installerAssignedId ?? ""
  );

  useEffect(() => {
    setSelectedInstallerId(entry?.installerAssignedId ?? "");
  }, [entry]);

  if (!entry) return null;

  const sc = statusConfig[entry.status];
  const StatusIcon = sc.icon;
  const categoryMeta = categoryConfig[entry.category];
  const CategoryIcon = categoryMeta.icon;
  const hasInstallers = installers && installers.length > 0;

  const handleStatusClick = async (s: VisitStatus) => {
    if (s === entry.status) return;
    setUpdatingStatus(true);
    try {
      await onStatusUpdate(entry.id, s);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleInstallerAssign = async () => {
    if (!selectedInstallerId) return;
    const installer = installers?.find((i) => i.id === selectedInstallerId);
    if (!installer) return;
    setAssigningInstaller(true);
    try {
      await onInstallerAssign(entry.id, installer.id, installer.name);
      toast.success(`Assigned to ${installer.name}`);
    } finally {
      setAssigningInstaller(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-white border-l border-slate-200">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl",
                categoryMeta.iconWrapClass
              )}
            >
              <CategoryIcon className={cn("h-5 w-5", categoryMeta.iconClass)} />
            </div>
            <div>
              <SheetTitle className="text-slate-900 text-base">
                {toTitle(entry.purpose)}
              </SheetTitle>
              <SheetDescription className="text-xs text-slate-400">
                {categoryMeta.label} - {workModeLabel[entry.workMode]}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5">
          {/* Status row */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-3",
              sc.chip
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", sc.dot)} />
            <StatusIcon className="h-4 w-4" />
            <span className="text-sm font-semibold">{sc.label}</span>
            {updatingStatus && (
              <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto" />
            )}
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                Assigned To
              </p>
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                    {entry.assignedToName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-slate-800 leading-tight">
                    {entry.assignedToName}
                  </p>
                  <p className="text-[11px] text-slate-400 capitalize">
                    {entry.assignedRole}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                Schedule
              </p>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <p className="text-sm font-semibold text-slate-800">
                  {entry.visitDate}
                </p>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <p className="text-xs text-slate-500">
                  {entry.startTime} – {entry.endTime}
                </p>
              </div>
            </div>

            <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                Route
              </p>
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                <span className="text-sm font-medium text-slate-700">
                  {entry.from}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                <MapPin className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                <span className="text-sm font-medium text-slate-700">
                  {entry.to}
                </span>
              </div>
            </div>
          </div>

          {entry.complaintSubType && (
            <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-rose-500 mb-1">
                Complaint Sub Type
              </p>
              <p className="text-sm text-slate-700">{entry.complaintSubType}</p>
            </div>
          )}

          {entry.remark && (
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-500 mb-1">
                Notes
              </p>
              <p className="text-sm text-slate-700">{entry.remark}</p>
            </div>
          )}

          <Separator className="bg-slate-100" />

          {/* Status actions */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
              Update Status
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  "planned",
                  "in_progress",
                  "completed",
                  "on_hold",
                ] as VisitStatus[]
              ).map((s) => {
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
                        ? cn(cfg.chip, "ring-2 ring-offset-1", {
                            "ring-slate-300": s === "planned",
                            "ring-sky-300": s === "in_progress",
                            "ring-emerald-300": s === "completed",
                            "ring-amber-300": s === "on_hold",
                          })
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {cfg.label}
                    {isActive && (
                      <span className={cn("ml-auto h-1.5 w-1.5 rounded-full", cfg.dot)} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <Separator className="bg-slate-100" />

          {/* Installer assignment */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <UserCheck className="h-4 w-4 text-indigo-500" />
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Assign Installer
              </p>
            </div>

            {entry.installerAssignedName && (
              <div className="flex items-center gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5 mb-3">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-indigo-200 text-indigo-800 text-xs font-bold">
                    {entry.installerAssignedName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-indigo-800">
                    {entry.installerAssignedName}
                  </p>
                  <p className="text-[11px] text-indigo-400">Currently assigned installer</p>
                </div>
              </div>
            )}

            {hasInstallers ? (
              <div className="flex gap-2">
                <Select
                  value={selectedInstallerId}
                  onValueChange={setSelectedInstallerId}
                >
                  <SelectTrigger className="flex-1 h-9 rounded-xl border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400">
                    <SelectValue placeholder="Select installer…" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 shadow-lg">
                    {installers!.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id} className="rounded-lg text-sm">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="bg-indigo-100 text-indigo-700 text-[10px]">
                              {inst.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{inst.name}</span>
                          {inst.email && (
                            <span className="text-xs text-slate-400 truncate max-w-[120px]">
                              {inst.email}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 shrink-0"
                  disabled={!selectedInstallerId || assigningInstaller}
                  onClick={handleInstallerAssign}
                >
                  {assigningInstaller ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                      Assign
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 py-4 text-center">
                <AlertCircle className="h-4 w-4 text-slate-300 mx-auto mb-1" />
                <p className="text-xs text-slate-400">
                  No installers available. Pass the{" "}
                  <code className="text-xs bg-slate-100 px-1 rounded">installers</code>{" "}
                  prop to enable assignment.
                </p>
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="pt-4">
          <Button
            variant="outline"
            className="w-full rounded-xl border-slate-200"
            onClick={onClose}
          >
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CompanyVisitDialog({ open, onOpenChange, installers }: Props) {
  // ── form state ──
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
  const [complaintSubType, setComplaintSubType] = useState("");
  const [remark, setRemark] = useState("");
  const [creating, setCreating] = useState(false);

  // ── members ──
  const [members, setMembers] = useState<TeamMember[]>(defaultTeamMembers);
  const [memberInput, setMemberInput] = useState("");
  const [memberTypeInput, setMemberTypeInput] = useState<TeamMemberKind>("employee");
  const [showAddMember, setShowAddMember] = useState(false);

  // ── data ──
  const [trackerRows, setTrackerRows] = useState<TrackerEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"form" | "list">("form");
  const [statusFilter, setStatusFilter] = useState<VisitStatus | "all">("all");

  // ── detail sheet ──
  const [selectedEntry, setSelectedEntry] = useState<TrackerEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // ── Firestore ──
  useEffect(() => {
    const q = query(
      collection(db, "companyVisits"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTrackerRows(
          snap.docs.map((d) => {
            const data = d.data() as any;
            const category = normalizeVisitCategory(data?.category);
            return {
              id: d.id,
              createdAt: String(data?.createdAt || ""),
              updatedAt: String(data?.updatedAt || ""),
              category,
              purpose: String(data?.purpose || ""),
              status: data?.status as VisitStatus,
              assignedToId: String(data?.assignedToId || ""),
              assignedToName: String(data?.assignedToName || ""),
              assignedRole: data?.assignedRole as TeamMemberKind,
              workMode: data?.workMode as WorkMode,
              from: String(data?.from || ""),
              to: String(data?.to || ""),
              visitDate: String(data?.visitDate || ""),
              startTime: String(data?.startTime || ""),
              endTime: String(data?.endTime || ""),
              complaintSubType: String(data?.complaintSubType || ""),
              remark: String(data?.remark || ""),
              installerAssignedId: String(data?.installerAssignedId || ""),
              installerAssignedName: String(data?.installerAssignedName || ""),
            } as TrackerEntry;
          })
        );
      },
      (err) => console.error("Tracker load error:", err)
    );
    return () => unsub();
  }, []);

  // ── derived ──
  useEffect(() => {
    const opts = purposeByCategory[category];
    setPurpose((prev) => {
      const valid = opts.some((o) => o.value === prev);
      return valid ? prev : opts[0]?.value || "";
    });
    setAssignedToId("");
    setWorkMode(
      category === "tailor_work"
        ? "outside_workshop"
        : category === "complaint_visit"
        ? "customer_home"
        : "sample_meeting"
    );
    setComplaintSubType("");
  }, [category]);

  const requiredKind: TeamMemberKind =
    category === "tailor_work" ? "tailor" : "employee";
  const assignableMembers = useMemo(
    () => members.filter((m) => m.kind === requiredKind),
    [members, requiredKind]
  );

  const summary = useMemo(
    () => ({
      total: trackerRows.length,
      planned: trackerRows.filter((r) => r.status === "planned").length,
      inProgress: trackerRows.filter((r) => r.status === "in_progress").length,
      completed: trackerRows.filter((r) => r.status === "completed").length,
      onHold: trackerRows.filter((r) => r.status === "on_hold").length,
    }),
    [trackerRows]
  );

  const filteredRows = useMemo(
    () =>
      statusFilter === "all"
        ? trackerRows
        : trackerRows.filter((r) => r.status === statusFilter),
    [trackerRows, statusFilter]
  );

  // ── handlers ──
  const resetForm = () => {
    setCategory("company_visit");
    setStatus("planned");
    setFrom("");
    setTo("");
    setVisitDate("");
    setStartTime("");
    setEndTime("");
    setComplaintSubType("");
    setRemark("");
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
      await updateDoc(doc(db, "companyVisits", id), {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      });
      // Update local selected entry if open
      setSelectedEntry((prev) =>
        prev?.id === id ? { ...prev, status: nextStatus } : prev
      );
      toast.success(`Status → ${statusConfig[nextStatus].label}`);
    } catch (err) {
      toast.error("Failed to update status.");
    }
  };

  const handleInstallerAssign = async (
    id: string,
    installerId: string,
    installerName: string
  ) => {
    await updateDoc(doc(db, "companyVisits", id), {
      installerAssignedId: installerId,
      installerAssignedName: installerName,
      updatedAt: new Date().toISOString(),
    });
    setSelectedEntry((prev) =>
      prev?.id === id
        ? { ...prev, installerAssignedId: installerId, installerAssignedName: installerName }
        : prev
    );
  };

  const handleSubmit = async () => {
    if (!purpose || !assignedToId || !from || !to || !visitDate || !startTime || !endTime) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (category === "complaint_visit" && !complaintSubType.trim()) {
      toast.error("Please fill complaint sub type.");
      return;
    }
    const member = members.find((m) => m.id === assignedToId);
    if (!member) { toast.error("Please select a valid assignee."); return; }

    setCreating(true);
    try {
      await addDoc(collection(db, "companyVisits"), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category,
        purpose,
        status,
        assignedToId: member.id,
        assignedToName: member.name,
        assignedRole: member.kind,
        workMode,
        from: from.trim(),
        to: to.trim(),
        visitDate,
        startTime,
        endTime,
        complaintSubType: complaintSubType.trim(),
        remark: remark.trim(),
        installerAssignedId: "",
        installerAssignedName: "",
      });
      toast.success("Entry created.");
      resetForm();
      setActiveTab("list");
    } catch (err) {
      toast.error("Failed to create entry.");
    } finally {
      setCreating(false);
    }
  };

  const openDetail = (entry: TrackerEntry) => {
    setSelectedEntry(entry);
    setDetailOpen(true);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[94vh] max-w-4xl overflow-hidden flex flex-col bg-white rounded-2xl border-slate-200 p-0">
          {/* ── Fixed Header ── */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm">
                  <Briefcase className="h-5 w-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-slate-900">
                    Visit Tracker
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-400 mt-0.5">
                    Company visits, tailor work, and complaint visits in one place
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Stats row */}
            <div className="grid grid-cols-5 gap-2 mt-4">
              <StatCard label="Total" value={summary.total} icon={TrendingUp} />
              <StatCard label="Planned" value={summary.planned} icon={Circle} />
              <StatCard label="In Progress" value={summary.inProgress} accent="bg-sky-50 border-sky-200" icon={Timer} />
              <StatCard label="Completed" value={summary.completed} accent="bg-emerald-50 border-emerald-200" icon={CheckCircle2} />
              <StatCard label="On Hold" value={summary.onHold} accent="bg-amber-50 border-amber-200" icon={PauseCircle} />
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-1 px-6 pt-3 pb-0 shrink-0">
            {(
              [
                { key: "form", label: "New Entry", icon: PlusCircle },
                { key: "list", label: `All Entries (${trackerRows.length})`, icon: LayoutGrid },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-t-xl border border-b-0 px-4 py-2 text-sm font-medium transition-all",
                  activeTab === key
                    ? "border-slate-200 bg-white text-slate-900 shadow-sm -mb-px z-10"
                    : "border-transparent bg-slate-50 text-slate-500 hover:text-slate-700"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* ── Scrollable Body ── */}
          <div className="flex-1 overflow-y-auto border-t border-slate-100">
            {/* ────── FORM TAB ────── */}
            {activeTab === "form" && (
              <div className="p-6 space-y-5">
                {/* Category toggle */}
                <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
                  {(
                    [
                      { v: "company_visit", label: "Company Visit", Icon: Building2 },
                      { v: "tailor_work", label: "Tailor Work", Icon: Scissors },
                      { v: "complaint_visit", label: "Complaint Visit", Icon: AlertCircle },
                    ] as const
                  ).map(({ v, label, Icon }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCategory(v)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all",
                        category === v
                          ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Row 1: Purpose, Status, Work Mode, Date */}
                <FormRow cols={4}>
                  <FieldWrapper label="Purpose" required>
                    <StyledSelect value={purpose} onValueChange={setPurpose}>
                      {purposeByCategory[category].map((o) => (
                        <Item key={o.value} value={o.value}>{o.label}</Item>
                      ))}
                    </StyledSelect>
                  </FieldWrapper>
                  <FieldWrapper label="Status" required>
                    <StyledSelect value={status} onValueChange={(v) => setStatus(v as VisitStatus)}>
                      <Item value="planned">Planned</Item>
                      <Item value="in_progress">In Progress</Item>
                      <Item value="completed">Completed</Item>
                      <Item value="on_hold">On Hold</Item>
                    </StyledSelect>
                  </FieldWrapper>
                  <FieldWrapper label="Work Mode" required>
                    <StyledSelect value={workMode} onValueChange={(v) => setWorkMode(v as WorkMode)}>
                      <Item value="customer_home">Customer Home</Item>
                      <Item value="outside_workshop">Outside Workshop</Item>
                      <Item value="factory_visit">Factory Visit</Item>
                      <Item value="sample_meeting">Sample Meeting</Item>
                    </StyledSelect>
                  </FieldWrapper>
                  <FieldWrapper label="Visit Date" required>
                    <StyledInput
                      type="date"
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                    />
                  </FieldWrapper>
                </FormRow>

                {category === "complaint_visit" && (
                  <FormRow cols={1}>
                    <FieldWrapper label="Complaint Sub Type" required>
                      <StyledInput
                        value={complaintSubType}
                        onChange={(e) => setComplaintSubType(e.target.value)}
                        placeholder="Example: chain stuck, loose stitch, side gap"
                      />
                    </FieldWrapper>
                  </FormRow>
                )}

                {/* Row 2: Assignee, From, To */}
                <FormRow cols={4}>
                  <div className="md:col-span-2">
                    <FieldWrapper
                      label={`Assign ${requiredKind === "tailor" ? "Tailor" : "Employee"}`}
                      required
                    >
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <StyledSelect value={assignedToId} onValueChange={setAssignedToId}>
                            {assignableMembers.map((m) => (
                              <Item key={m.id} value={m.id}>{m.name}</Item>
                            ))}
                          </StyledSelect>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 rounded-xl border-slate-200 shrink-0"
                          onClick={() => setShowAddMember((p) => !p)}
                        >
                          {showAddMember ? (
                            <X className="h-4 w-4" />
                          ) : (
                            <PlusCircle className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </FieldWrapper>
                  </div>
                  <FieldWrapper label="From" required>
                    <StyledInput
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      placeholder="Current location"
                    />
                  </FieldWrapper>
                  <FieldWrapper label="To" required>
                    <StyledInput
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="Visit location"
                    />
                  </FieldWrapper>
                </FormRow>

                {/* Add member inline panel */}
                {showAddMember && (
                  <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-3">
                      Add Team Member
                    </p>
                    <FormRow cols={4}>
                      <FieldWrapper label="Type">
                        <StyledSelect
                          value={memberTypeInput}
                          onValueChange={(v) => setMemberTypeInput(v as TeamMemberKind)}
                        >
                          <Item value="employee">Employee</Item>
                          <Item value="tailor">Tailor</Item>
                        </StyledSelect>
                      </FieldWrapper>
                      <div className="md:col-span-2">
                        <FieldWrapper label="Name">
                          <StyledInput
                            value={memberInput}
                            onChange={(e) => setMemberInput(e.target.value)}
                            placeholder="Enter full name"
                            onKeyDown={(e) => { if (e.key === "Enter") handleAddMember(); }}
                          />
                        </FieldWrapper>
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          className="w-full h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
                          onClick={handleAddMember}
                        >
                          Add Member
                        </Button>
                      </div>
                    </FormRow>

                    {/* Member list */}
                    {members.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-indigo-100">
                        {members.map((m) => (
                          <span
                            key={m.id}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                              m.kind === "employee"
                                ? "bg-white border-indigo-200 text-indigo-700"
                                : "bg-white border-violet-200 text-violet-700"
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                m.kind === "employee" ? "bg-indigo-400" : "bg-violet-400"
                              )}
                            />
                            {m.name}
                            <span className="opacity-50 capitalize text-[10px]">({m.kind})</span>
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

                {/* Row 3: Times */}
                <FormRow cols={3}>
                  <FieldWrapper label="Start Time" required>
                    <StyledInput
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="End Time" required>
                    <StyledInput
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </FieldWrapper>
                  <div /> {/* spacer */}
                </FormRow>

                {/* Remark */}
                <FieldWrapper label="Work Notes">
                  <Textarea
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    placeholder="Add stitching / work / sample remarks…"
                    className="resize-none rounded-xl border-slate-200 bg-slate-50 text-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:border-indigo-400 min-h-[80px]"
                  />
                </FieldWrapper>

                {/* Submit */}
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={resetForm}
                    className="rounded-xl text-slate-500"
                  >
                    Reset
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={creating}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-6"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                      </>
                    ) : (
                      "Add to Tracker"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* ────── LIST TAB ────── */}
            {activeTab === "list" && (
              <div className="p-6 space-y-4">
                {/* Status filter pills */}
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { v: "all", label: `All (${trackerRows.length})` },
                      { v: "planned", label: `Planned (${summary.planned})` },
                      { v: "in_progress", label: `In Progress (${summary.inProgress})` },
                      { v: "completed", label: `Completed (${summary.completed})` },
                      { v: "on_hold", label: `On Hold (${summary.onHold})` },
                    ] as const
                  ).map(({ v, label }) => {
                    const isActive = statusFilter === v;
                    const cfg = v !== "all" ? statusConfig[v as VisitStatus] : null;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setStatusFilter(v as VisitStatus | "all")}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                          isActive && cfg
                            ? cn(cfg.chip, "ring-1 ring-offset-1")
                            : isActive
                            ? "bg-slate-900 text-white border-slate-900"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {filteredRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center">
                    <ListFilter className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No entries for this filter.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredRows.map((entry) => {
                      const sc = statusConfig[entry.status];
                      const categoryMeta = categoryConfig[entry.category];
                      const CategoryIcon = categoryMeta.icon;

                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => openDetail(entry)}
                          className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-indigo-200 hover:shadow-sm transition-all group"
                        >
                          <div className="flex items-start gap-3">
                            {/* Category icon */}
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl mt-0.5",
                                categoryMeta.iconWrapClass
                              )}
                            >
                              <CategoryIcon className={cn("h-4 w-4", categoryMeta.iconClass)} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <p className="text-sm font-semibold text-slate-800 truncate">
                                  {toTitle(entry.purpose)}
                                </p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                      sc.chip
                                    )}
                                  >
                                    <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
                                    {sc.label}
                                  </span>
                                  <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                                  {categoryMeta.label}
                                </span>
                                <span className="flex items-center gap-1">
                                  <User2 className="h-3 w-3" /> {entry.assignedToName}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-rose-300" />
                                  {entry.from}
                                  <ArrowRight className="h-2.5 w-2.5 text-slate-300" />
                                  {entry.to}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" /> {entry.visitDate}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {entry.startTime} – {entry.endTime}
                                </span>
                              </div>

                              {entry.complaintSubType && (
                                <div className="mt-1 text-xs text-rose-600">
                                  Sub: {entry.complaintSubType}
                                </div>
                              )}

                              {entry.installerAssignedName && (
                                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700">
                                  <UserCheck className="h-3 w-3" />
                                  Installer: {entry.installerAssignedName}
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

      {/* ── Detail Side Sheet ── */}
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
