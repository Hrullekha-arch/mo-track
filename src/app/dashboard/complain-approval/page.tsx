"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  BadgeIndianRupee,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ImageOff,
  Loader2,
  MapPin,
  Phone,
  Search,
  ShieldAlert,
  User2,
  X,
  ZoomIn,
} from "lucide-react";
import { collection, collectionGroup, onSnapshot, query, where } from "firebase/firestore";
import type { DealVisit } from "@/lib/types";

import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { saveComplaintApprovalAction, saveVisitComplaintApprovalAction, type ComplaintChargeType } from "./actions";
import { getCompliancesAction, type ComplianceSubmission } from "./compliance-actions";

const COMPLAINT_TYPE_LABELS: Record<string, string> = {
  "product-defect": "Product Defect",
  "installation-issue": "Installation Issue",
  "measurement-error": "Measurement Error",
  "color-mismatch": "Color Mismatch",
  "damaged-delivery": "Damaged During Delivery",
  "delay-complaint": "Delay Complaint",
  "other-complaint": "Other",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low", medium: "Medium", high: "High", urgent: "Urgent",
};

type ApprovalFilter = "all" | "pending" | "approved" | "chargeable" | "free";

type ApproverInfo = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  designation?: string;
};

type ComplaintApproval = {
  chargeType?: string;
  chargeAmount?: number;
  note?: string;
  approvedAt?: string;
  approvedBy?: ApproverInfo;
};

type ComplaintVisitRow = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  visitDate?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerCode?: string;
  customerAddress?: string;
  complaintType?: string;
  complaintSubType?: string;
  workNote?: string;
  remark?: string;
  approvalStatus?: string;
  complaintStatus?: string;
  pendingApproval?: boolean;
  chargeType?: string;
  chargeAmount?: number;
  serviceCharge?: number;
  isChargeable?: boolean;
  approvalNote?: string;
  approvedAt?: string;
  approvedBy?: ApproverInfo;
  approval?: ComplaintApproval;
  photoUrls: string[];
  _isSubcollection?: boolean;
  _customerId?: string;
  _dealId?: string;
};

/* ─── helpers ─── */
const normalizeKey = (value: unknown) =>
  String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");

const toIsoString = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "object") {
    const maybe = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number; _seconds?: number; _nanoseconds?: number };
    if (typeof maybe.toDate === "function") return maybe.toDate().toISOString();
    const seconds = Number(maybe.seconds ?? maybe._seconds);
    if (Number.isFinite(seconds)) {
      const nanos = Number(maybe.nanoseconds ?? maybe._nanoseconds ?? 0);
      return new Date(seconds * 1000 + nanos / 1e6).toISOString();
    }
  }
  return undefined;
};

const parseNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatDateSafe = (value?: string, pattern = "dd MMM yyyy, hh:mm a") => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, pattern);
};

const formatCurrency = (value?: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));

const getChargeType = (row?: ComplaintVisitRow): ComplaintChargeType => {
  const fromApproval = normalizeKey(row?.approval?.chargeType);
  if (fromApproval === "chargeable") return "chargeable";
  if (fromApproval === "free") return "free";
  const fromRoot = normalizeKey(row?.chargeType);
  if (fromRoot === "chargeable") return "chargeable";
  if (fromRoot === "free") return "free";
  if (typeof row?.isChargeable === "boolean") return row.isChargeable ? "chargeable" : "free";
  const inferredAmount = row?.approval?.chargeAmount ?? row?.chargeAmount ?? row?.serviceCharge ?? 0;
  return Number(inferredAmount) > 0 ? "chargeable" : "free";
};

const getChargeAmount = (row?: ComplaintVisitRow) =>
  Number(row?.approval?.chargeAmount ?? row?.chargeAmount ?? row?.serviceCharge ?? 0);

const isApproved = (row?: ComplaintVisitRow) => normalizeKey(row?.approvalStatus) === "approved";
const isPending = (row?: ComplaintVisitRow) => {
  if (!row) return false;
  if (typeof row.pendingApproval === "boolean") return row.pendingApproval;
  return !isApproved(row);
};

/* ─── Photo Lightbox ─── */
function PhotoLightbox({
  photos,
  initialIndex,
  onClose,
}: {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [current, setCurrent] = React.useState(initialIndex);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setLoaded(false);
  }, [current]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setCurrent((c) => Math.max(0, c - 1));
      if (e.key === "ArrowRight") setCurrent((c) => Math.min(photos.length - 1, c + 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [photos.length, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(15,23,42,0.92)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div className="relative max-w-4xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white/70 hover:text-white transition"
        >
          <X className="h-7 w-7" />
        </button>

        {/* Counter */}
        <p className="absolute -top-10 left-0 text-white/60 text-sm font-mono">
          {current + 1} / {photos.length}
        </p>

        {/* Main image */}
        <div className="relative rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center" style={{ minHeight: 320 }}>
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-white/30 animate-spin" />
            </div>
          )}
          <img
            key={photos[current]}
            src={photos[current]}
            alt={`Photo ${current + 1}`}
            onLoad={() => setLoaded(true)}
            className="w-full max-h-[70vh] object-contain transition-opacity duration-300"
            style={{ opacity: loaded ? 1 : 0 }}
          />
        </div>

        {/* Prev / Next */}
        {photos.length > 1 && (
          <>
            <button
              disabled={current === 0}
              onClick={() => setCurrent((c) => c - 1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-2 bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              disabled={current === photos.length - 1}
              onClick={() => setCurrent((c) => c + 1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}

        {/* Thumbnails */}
        {photos.length > 1 && (
          <div className="mt-4 flex gap-2 justify-center overflow-x-auto pb-1">
            {photos.map((url, i) => (
              <button
                key={url}
                onClick={() => setCurrent(i)}
                className="flex-shrink-0 rounded-lg overflow-hidden border-2 transition"
                style={{ borderColor: i === current ? "#6366f1" : "transparent" }}
              >
                <img src={url} alt={`thumb-${i}`} className="h-14 w-20 object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Photo Gallery ─── */
function PhotoGallery({ photos }: { photos: string[] }) {
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);
  const [failedUrls, setFailedUrls] = React.useState<Set<string>>(new Set());

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
        <ImageOff className="h-8 w-8 opacity-40" />
        <p className="text-sm">No photos uploaded for this complaint.</p>
      </div>
    );
  }

  return (
    <>
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos.filter((u) => !failedUrls.has(u))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}
      >
        {photos.map((url, i) => {
          const failed = failedUrls.has(url);
          return (
            <button
              key={`${url}-${i}`}
              onClick={() => !failed && setLightboxIndex(i)}
              disabled={failed}
              className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-square transition hover:border-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              title={failed ? "Image failed to load" : `View photo ${i + 1}`}
            >
              {failed ? (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <ImageOff className="h-6 w-6" />
                </div>
              ) : (
                <>
                  <img
                    src={url}
                    alt={`Complaint photo ${i + 1}`}
                    className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                    onError={() => setFailedUrls((prev) => new Set([...prev, url]))}
                  />
                  <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/30 transition-all duration-200 flex items-center justify-center">
                    <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 drop-shadow transition duration-200" />
                  </div>
                  <div className="absolute bottom-1 right-1 text-[10px] font-mono text-white/80 bg-black/40 rounded px-1 leading-4">
                    {i + 1}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ─── Info Row ─── */
function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex-shrink-0 rounded-md bg-slate-100 p-1.5">
        <Icon className="h-3.5 w-3.5 text-slate-500" />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="text-sm text-slate-800 mt-0.5">{value || "—"}</p>
      </div>
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3 shadow-sm">
      <div
        className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold"
        style={{ background: accent ? `${accent}18` : "#f1f5f9", color: accent || "#64748b" }}
      >
        {value}
      </div>
      <p className="text-xs font-semibold text-slate-500 leading-tight">{label}</p>
    </div>
  );
}

/* ─── Compliance Cards ─── */
function ComplianceCards({ compliances, loading }: { compliances: ComplianceSubmission[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-52 w-full rounded-2xl" />)}
      </div>
    );
  }
  if (compliances.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-slate-400">
        <ShieldAlert className="mx-auto h-8 w-8 opacity-30 mb-2" />
        <p className="text-sm">No compliance submissions yet.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {compliances.map((c) => (
        <div key={c.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900 text-sm">{c.customerName || "—"}</p>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Deal: {c.dealId}</p>
            </div>
            {c.typeOfReturn && (
              <span className="rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5 text-[11px] font-semibold flex-shrink-0">
                {c.typeOfReturn}
              </span>
            )}
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="text-slate-400 w-20 flex-shrink-0">Salesman</span>
              <span className="text-slate-700 font-medium">{c.salesman || "—"}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400 w-20 flex-shrink-0">Item</span>
              <span className="text-slate-700 font-medium">{c.item || "—"}</span>
            </div>
            {c.returnSubOptions?.length > 0 && (
              <div className="flex gap-2">
                <span className="text-slate-400 w-20 flex-shrink-0">Sub-type</span>
                <span className="text-slate-700">{c.returnSubOptions.join(", ")}</span>
              </div>
            )}
            {c.descriptionForReturn && (
              <div className="flex gap-2">
                <span className="text-slate-400 w-20 flex-shrink-0">Description</span>
                <span className="text-slate-700 line-clamp-2">{c.descriptionForReturn}</span>
              </div>
            )}
          </div>

          {c.imageUrls?.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-1">
              {c.imageUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt={`img-${i}`} className="h-12 w-12 rounded-lg object-cover border border-slate-200 hover:opacity-80 transition" />
                </a>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
            {c.createdAt ? formatDateSafe(c.createdAt) : "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Page ─── */
export default function ComplainApprovalPage() {
  const { user, role } = useAuth();
  const { toast } = useToast();

  const normalizedRole = normalizeKey(user?.role || role || "");
  const normalizedDesignation = normalizeKey((user as any)?.designation || "");
  const hasAccess =
    normalizedRole === "admin" ||
    normalizedRole === "headsalesmanager" ||
    normalizedDesignation === "headsalesmanager" ||
    normalizedDesignation === "salesmanager";

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [complaints, setComplaints] = React.useState<ComplaintVisitRow[]>([]);
  const [compliances, setCompliances] = React.useState<ComplianceSubmission[]>([]);
  const [compliancesLoading, setCompliancesLoading] = React.useState(true);
  const [allComplaintVisitsRaw, setAllComplaintVisitsRaw] = React.useState<DealVisit[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<ApprovalFilter>("pending");
  const [chargeType, setChargeType] = React.useState<ComplaintChargeType>("free");
  const [chargeAmount, setChargeAmount] = React.useState("");
  const [approvalNote, setApprovalNote] = React.useState("");
  const [selectedInstaller, setSelectedInstaller] = React.useState("");
  const [installers, setInstallers] = React.useState<{ id: string; name: string }[]>([]);

  React.useEffect(() => {
    setCompliancesLoading(true);
    getCompliancesAction().then((data) => {
      setCompliances(data);
      setCompliancesLoading(false);
    });
  }, []);

  React.useEffect(() => {
    const unsub = onSnapshot(
      collectionGroup(db, "visits"),
      (snapshot) => {
        const data = snapshot.docs
          .map((d) => {
            const parts = d.ref.path.split('/');
            return { id: d.id, ...d.data(), _customerId: parts[1], _dealId: parts[3] } as DealVisit & { _customerId: string; _dealId: string };
          })
          .filter((v) => v.typeOfVisit === "complaint");
        data.sort((a, b) => new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime());
        setAllComplaintVisitsRaw(data);
      },
      () => setAllComplaintVisitsRaw([])
    );
    return () => unsub();
  }, []);

  const visitCompliances = React.useMemo<ComplianceSubmission[]>(() =>
    allComplaintVisitsRaw.map((v: any) => ({
      id: `visit_${v.id}`,
      dealId: v.dealId || "",
      customerName: v.customerSnapshot?.name || "",
      salesman: v.assignedSalesPerson?.name || "",
      item: v.complaintItem || "",
      category: "complaint",
      quantity: v.complaintQuantity || "",
      typeOfReturn: COMPLAINT_TYPE_LABELS[v.complaintType || ""] || v.complaintType || "",
      returnSubOptions: v.complaintPriority ? [`Priority: ${PRIORITY_LABELS[v.complaintPriority] || v.complaintPriority}`] : [],
      descriptionForReturn: v.complaintDescription || "",
      imageUrls: [],
      createdAt: v.createdAt || "",
    })),
  [allComplaintVisitsRaw]);

  const visitComplaintRows = React.useMemo<ComplaintVisitRow[]>(() =>
    allComplaintVisitsRaw.map((v: any) => ({
      id: v.id,
      createdAt: v.createdAt || "",
      customerId: v._customerId,
      customerName: v.customerSnapshot?.name || undefined,
      complaintType: COMPLAINT_TYPE_LABELS[v.complaintType || ""] || v.complaintType || undefined,
      complaintSubType: v.complaintPriority ? (PRIORITY_LABELS[v.complaintPriority] || v.complaintPriority) : undefined,
      workNote: v.complaintDescription || undefined,
      approvalStatus: v.complianceApprovalStatus || undefined,
      pendingApproval: !v.complianceApprovalStatus,
      chargeType: v.complianceChargeType || undefined,
      chargeAmount: v.complianceChargeAmount || undefined,
      createdBy: v.assignedSalesPerson?.name || undefined,
      photoUrls: [],
      _isSubcollection: true,
      _customerId: v._customerId,
      _dealId: v._dealId,
    })),
  [allComplaintVisitsRaw]);

  React.useEffect(() => {
    if (!hasAccess) { setLoading(false); return; }
    setLoading(true);
    const q = query(collection(db, "companyVisits"), where("category", "==", "complaint_visit"));
    const unsub = onSnapshot(q, (snap) => {
      const rows: ComplaintVisitRow[] = snap.docs.map((docSnap) => {
        const data = docSnap.data() as any;
        
        const photoList = [
          ...(Array.isArray(data?.photoUrls) ? data.photoUrls : []),
          ...(Array.isArray(data?.photos) ? data.photos : []),
        ].map((url) => String(url || "").trim()).filter(Boolean);
        return {
          id: docSnap.id,
          createdAt: toIsoString(data?.createdAt),
          updatedAt: toIsoString(data?.updatedAt),
          visitDate: String(data?.visitDate || "").trim() || undefined,
          customerId: String(data?.customerId || "").trim() || undefined,
          customerName: String(data?.customerName || "").trim() || undefined,
          customerPhone: String(data?.customerPhone || "").trim() || undefined,
          customerEmail: String(data?.customerEmail || "").trim() || undefined,
          customerCode: String(data?.customerCode || "").trim() || undefined,
          customerAddress: String(data?.customerAddress || data?.from || "").trim() || undefined,
          complaintType: String(data?.complaintType || "").trim() || undefined,
          complaintSubType: String(data?.complaintSubType || "").trim() || undefined,
          workNote: String(data?.workNote || "").trim() || undefined,
          remark: String(data?.remark || "").trim() || undefined,
          approvalStatus: String(data?.approvalStatus || "").trim() || undefined,
          complaintStatus: String(data?.complaintStatus || "").trim() || undefined,
          pendingApproval: typeof data?.pendingApproval === "boolean" ? data.pendingApproval : undefined,
          chargeType: String(data?.chargeType || "").trim() || undefined,
          chargeAmount: parseNumber(data?.chargeAmount),
          serviceCharge: parseNumber(data?.serviceCharge),
          isChargeable: typeof data?.isChargeable === "boolean" ? data.isChargeable : undefined,
          createdBy: String(data?.createdBy?.name || "").trim() || undefined,
          approvalNote: String(data?.approvalNote || "").trim() || undefined,
          approvedAt: toIsoString(data?.approvedAt),
          approvedBy: data?.approvedBy || undefined,
          approval: data?.approval ? {
            chargeType: String(data.approval?.chargeType || "").trim() || undefined,
            chargeAmount: parseNumber(data.approval?.chargeAmount),
            note: String(data.approval?.note || "").trim() || undefined,
            approvedAt: toIsoString(data.approval?.approvedAt),
            approvedBy: data.approval?.approvedBy || undefined,
          } : undefined,
          photoUrls: Array.from(new Set(photoList)),
        };
      });
      rows.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setComplaints(rows);
      setLoading(false);
    }, (error) => {
      console.error(error);
      setLoading(false);
      toast({ variant: "destructive", title: "Failed to load complaints" });
    });
    return () => unsub();
  }, [hasAccess, toast]);

  const allComplaints = React.useMemo<ComplaintVisitRow[]>(() =>
    [...visitComplaintRows, ...complaints].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
  [visitComplaintRows, complaints]);

  React.useEffect(() => {
    if (!allComplaints.length) { setSelectedId(""); return; }
    if (!selectedId || !allComplaints.some((r) => r.id === selectedId)) setSelectedId(allComplaints[0].id);
  }, [allComplaints, selectedId]);

  const selectedComplaint = React.useMemo(() => allComplaints.find((r) => r.id === selectedId) || null, [allComplaints, selectedId]);

  React.useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "users"), where("role", "==", "installer")),
      (snap) => {
        setInstallers(snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name || d.id })));
      },
      () => {}
    );
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (!selectedComplaint) { setChargeType("free"); setChargeAmount(""); setApprovalNote(""); setSelectedInstaller(""); return; }
    setChargeType(getChargeType(selectedComplaint));
    const amt = getChargeAmount(selectedComplaint);
    setChargeAmount(amt > 0 ? String(amt) : "");
    setApprovalNote(selectedComplaint.approval?.note || selectedComplaint.approvalNote || "");
    setSelectedInstaller((selectedComplaint as any).approval?.assignedInstaller?.id || (selectedComplaint as any).assignedInstaller?.id || "");
  }, [selectedComplaint?.id]);

  const filteredComplaints = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return allComplaints.filter((row) => {
      if (filter === "pending" && !isPending(row)) return false;
      if (filter === "approved" && !isApproved(row)) return false;
      if (filter === "chargeable" && getChargeType(row) !== "chargeable") return false;
      if (filter === "free" && getChargeType(row) !== "free") return false;
      if (!q) return true;
      return [row.customerName, row.customerPhone, row.customerEmail, row.customerCode, row.complaintType, row.id]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [allComplaints, filter, search]);

  const pendingCount = allComplaints.filter(isPending).length;
  const approvedCount = allComplaints.length - pendingCount;
  const chargeableCount = allComplaints.filter((r) => getChargeType(r) === "chargeable").length;

  const handleSaveApproval = async () => {
    if (!selectedComplaint || !user?.id) return;
    const amount = Number(chargeAmount || 0);
    if (chargeType === "chargeable" && (!Number.isFinite(amount) || amount <= 0)) {
      toast({ variant: "destructive", title: "Invalid charge amount", description: "Enter a valid amount greater than zero." });
      return;
    }
    setSaving(true);
    try {
      const actor = { id: user.id, name: user.name, email: user.email };
      const installerPayload = selectedInstaller
        ? { id: selectedInstaller, name: installers.find((i) => i.id === selectedInstaller)?.name || selectedInstaller }
        : undefined;
      const result = selectedComplaint._isSubcollection
        ? await saveVisitComplaintApprovalAction({
            customerId: selectedComplaint._customerId!,
            dealId: selectedComplaint._dealId!,
            visitId: selectedComplaint.id,
            chargeType,
            chargeAmount: chargeType === "chargeable" ? amount : 0,
            approvalNote: approvalNote.trim(),
            assignedInstaller: installerPayload,
            actor,
          })
        : await saveComplaintApprovalAction({
            visitId: selectedComplaint.id,
            chargeType,
            chargeAmount: chargeType === "chargeable" ? amount : 0,
            approvalNote: approvalNote.trim(),
            assignedInstaller: installerPayload,
            actor,
          });
      if (!result.success) {
        toast({ variant: "destructive", title: "Approval failed", description: result.message });
        return;
      }
      toast({ title: "Complaint approved ✓", description: "Approval details saved successfully." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Approval failed", description: error?.message || "Something went wrong." });
    } finally {
      setSaving(false);
    }
  };

  console.log("Selected Complaint:", selectedComplaint);

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-screen-lg space-y-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Compliance Submissions</h1>
            <p className="text-sm text-slate-500 mt-0.5">All submitted compliance records.</p>
          </div>
          <ComplianceCards compliances={[...visitCompliances, ...compliances].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())} loading={compliancesLoading} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] font-sans">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="mx-auto max-w-screen-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Complaint Approvals
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Review visit details, set charges, and finalise approvals.
              </p>
            </div>
            {/* Stats */}
            <div className="flex flex-wrap gap-2">
              <StatCard label="Total" value={allComplaints.length} accent="#6366f1" />
              <StatCard label="Pending" value={pendingCount} accent="#f59e0b" />
              <StatCard label="Approved" value={approvedCount} accent="#10b981" />
              <StatCard label="Chargeable" value={chargeableCount} accent="#3b82f6" />
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-screen-2xl p-4 md:p-6">
        <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5">

          {/* ── Left panel: Queue ── */}
          <div className="flex flex-col gap-4">
            {/* Search & Filter */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search customer, mobile, ID…"
                  className="pl-9 border-slate-200 focus-visible:ring-indigo-400 rounded-xl"
                />
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v as ApprovalFilter)}>
                <SelectTrigger className="rounded-xl border-slate-200 focus:ring-indigo-400">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Complaints</SelectItem>
                  <SelectItem value="pending">Pending Approval</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="chargeable">Chargeable</SelectItem>
                  <SelectItem value="free">Free Service</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* List */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {filteredComplaints.length} result{filteredComplaints.length !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[calc(100vh-300px)]">
                {loading ? (
                  <div className="p-4 space-y-3">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
                  </div>
                ) : filteredComplaints.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                    <Search className="h-7 w-7 opacity-40" />
                    <p className="text-sm">No complaints found</p>
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {filteredComplaints.map((row) => {
                      const active = row.id === selectedId;
                      const pending = isPending(row);
                      const ct = getChargeType(row);
                      console.log("row",row)
                      return (
                        <button
                          type="button"
                          key={row.id}
                          onClick={() => setSelectedId(row.id)}
                          className={[
                            "w-full text-left rounded-xl px-3.5 py-3 border transition-all duration-150 group",
                            active
                              ? "border-indigo-300 bg-indigo-50 shadow-sm"
                              : "border-slate-150 bg-white hover:border-slate-300 hover:bg-slate-50/80",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="font-semibold text-sm text-slate-900 truncate leading-tight">
                              {row.customerName || "Unknown Customer"}
                            </p>
                            <span
                              className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={pending
                                ? { background: "#fef3c7", color: "#92400e" }
                                : { background: "#d1fae5", color: "#065f46" }}
                            >
                              {pending ? "Pending" : "Done"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate">
                            {row.complaintType || row.complaintSubType || "Complaint Visit"}
                            {row.customerCode ? <span className="text-slate-400"> · {row.customerCode}</span> : null}
                          </p>
                          <div className="mt-2 flex items-center justify-between">
                            <p className="text-[11px] text-slate-400">{formatDateSafe(row.createdAt, "dd MMM yyyy")}</p>
                            <p className="text-[11px] text-slate-400">{(row as any).createdBy || "Unknown User"}</p>
                            <p className="text-[11px] font-semibold" style={{ color: ct === "chargeable" ? "#3b82f6" : "#10b981" }}>
                              {ct === "chargeable" ? formatCurrency(getChargeAmount(row)) : "Free"}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right panel: Detail ── */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {!selectedComplaint ? (
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-slate-400 gap-3">
                <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <Search className="h-6 w-6 opacity-50" />
                </div>
                <p className="text-sm">Select a complaint to view details</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] divide-y lg:divide-y-0 lg:divide-x divide-slate-100">

                {/* Left col: Info */}
                <div className="overflow-y-auto max-h-[calc(100vh-200px)] p-6 space-y-6">
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 leading-tight">
                        {selectedComplaint.complaintType || selectedComplaint.complaintSubType || "Complaint Visit"}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">{selectedComplaint.id}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <span
                        className="rounded-full px-3 py-1 text-xs font-semibold"
                        style={isPending(selectedComplaint)
                          ? { background: "#fef3c7", color: "#92400e" }
                          : { background: "#d1fae5", color: "#065f46" }}
                      >
                        {isPending(selectedComplaint) ? "Pending Approval" : "Approved"}
                      </span>
                      <span
                        className="rounded-full px-3 py-1 text-xs font-semibold"
                        style={getChargeType(selectedComplaint) === "chargeable"
                          ? { background: "#dbeafe", color: "#1d4ed8" }
                          : { background: "#f1f5f9", color: "#64748b" }}
                      >
                        {getChargeType(selectedComplaint) === "chargeable"
                          ? formatCurrency(getChargeAmount(selectedComplaint))
                          : "Free Service"}
                      </span>
                    </div>
                  </div>

                  {/* Customer + Visit grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Customer</p>
                      <InfoRow icon={User2} label="Name" value={selectedComplaint.customerName} />
                      <InfoRow icon={Phone} label="Mobile" value={selectedComplaint.customerPhone} />
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Visit</p>
                      <InfoRow icon={CalendarDays} label="Visit date" value={formatDateSafe(selectedComplaint.visitDate, "dd MMM yyyy")} />
                      <InfoRow icon={Clock3} label="Created" value={formatDateSafe(selectedComplaint.createdAt)} />
                      <InfoRow icon={User2} label="Created by" value={(selectedComplaint as any).createdBy || "Unknown User"} />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <InfoRow icon={MapPin} label="Address" value={selectedComplaint.customerAddress} />
                  </div>

                  {/* Work note */}
                  {(selectedComplaint.workNote || selectedComplaint.remark) && (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Work Note</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {selectedComplaint.workNote || selectedComplaint.remark}
                      </p>
                    </div>
                  )}

                  {/* Photos */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Photos
                      </p>
                      {selectedComplaint.photoUrls.length > 0 && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          {selectedComplaint.photoUrls.length} file{selectedComplaint.photoUrls.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <PhotoGallery photos={selectedComplaint.photoUrls} />
                  </div>
                </div>

                {/* Right col: Approval Form */}
                <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(100vh-200px)]">
                  <div className="flex items-center gap-2 mb-1">
                    <BadgeIndianRupee className="h-5 w-5 text-indigo-500" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Approval & Charges</p>
                      <p className="text-xs text-slate-500">Set service type and finalise approval.</p>
                    </div>
                  </div>

                  {/* Last approval banner */}
                  {(selectedComplaint.approval?.approvedAt || selectedComplaint.approvedAt) && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-emerald-800">Previously Approved</p>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          {formatDateSafe(selectedComplaint.approval?.approvedAt || selectedComplaint.approvedAt)} by{" "}
                          {selectedComplaint.approval?.approvedBy?.name || selectedComplaint.approvedBy?.name || "Unknown"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Service type */}
                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Service Type
                    </Label>
                    <RadioGroup
                      value={chargeType}
                      onValueChange={(v) => setChargeType(v as ComplaintChargeType)}
                      className="grid grid-cols-2 gap-2"
                    >
                      {[
                        { value: "free", label: "Free Service" },
                        { value: "chargeable", label: "Chargeable" },
                      ].map((opt) => (
                        <label
                          key={opt.value}
                          htmlFor={`svc-${opt.value}`}
                          className={[
                            "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition",
                            chargeType === opt.value
                              ? "border-indigo-300 bg-indigo-50 shadow-sm"
                              : "border-slate-200 bg-white hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <RadioGroupItem value={opt.value} id={`svc-${opt.value}`} />
                          <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>

                  {/* Charge amount */}
                  {chargeType === "chargeable" && (
                    <div className="space-y-2">
                      <Label htmlFor="charge-amount" className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Charge Amount (INR)
                      </Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">₹</span>
                        <Input
                          id="charge-amount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={chargeAmount}
                          onChange={(e) => setChargeAmount(e.target.value)}
                          placeholder="0.00"
                          className="pl-7 rounded-xl border-slate-200 focus-visible:ring-indigo-400"
                        />
                      </div>
                    </div>
                  )}

                  {/* Installer */}
                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Select The Installer
                    </Label>
                    <Select value={selectedInstaller} onValueChange={setSelectedInstaller}>
                      <SelectTrigger className="rounded-xl border-slate-200 focus:ring-indigo-400">
                        <SelectValue placeholder="Select an installer…" />
                      </SelectTrigger>
                      <SelectContent>
                        {installers.length === 0 ? (
                          <SelectItem value="__none" disabled>No installers found</SelectItem>
                        ) : (
                          installers.map((inst) => (
                            <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Note */}
                  <div className="space-y-2">
                    <Label htmlFor="approval-note" className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Approval Note <span className="text-slate-400 normal-case font-normal">(optional)</span>
                    </Label>
                    <Textarea
                      id="approval-note"
                      value={approvalNote}
                      onChange={(e) => setApprovalNote(e.target.value)}
                      placeholder="Add context or reason for this decision…"
                      className="min-h-[100px] rounded-xl border-slate-200 focus-visible:ring-indigo-400 resize-none text-sm"
                    />
                  </div>

                  {/* Submit */}
                  <Button
                    onClick={() => void handleSaveApproval()}
                    disabled={saving}
                    className="w-full rounded-xl h-10 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 transition shadow-sm"
                  >
                    {saving ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                    ) : isApproved(selectedComplaint) ? (
                      "Update Approval"
                    ) : (
                      "Approve Complaint"
                    )}
                  </Button>
                </div>

              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}