"use client";

import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { collection, onSnapshot, query, doc, getDoc, collectionGroup, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DealVisit, Customer, Deal, User } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { AssignInstallerDialog, SLOT_OPTIONS } from "@/components/features/order-management/AssignInstallerDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Eye, Share2, Copy, MapPin, History, CalendarSync, MoreHorizontal,
  UserCheck, Edit, UserX, Loader2, CloudDownload, Trash2, ArrowLeftRight,
  ChevronDown, Activity, Clock, CheckCircle2, AlertCircle, Radio,
  TrendingUp, Users, Zap, Search, CalendarDays, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getAuth } from "firebase/auth";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { deleteVisitAction, getFreshMeasurementPdfUrlAction, unassignVisitAction, updateVisitDetailsAction } from "./actions";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import CompanyVisitDialog from "@/components/features/customer/CompanyVisitDialog";
import { useAuth } from "@/context/AuthContext";
import InstallerLiveMap, { type InstallerMapMarker, type InstallerMapMarkerStatus } from "@/components/features/visits/InstallerLiveMap";

// ─── Types ───────────────────────────────────────────────────────────────────

interface InstallerTracking {
  id: string;
  installerId?: string;
  status?: string;
  location?: { latitude: number; longitude: number };
  lastPingAt?: string;
  updatedAt?: string;
  speedKmh?: number;
  currentVisitId?: string;
  batteryLevel?: number | null;
  networkType?: string | null;
  gpsAccuracy?: number | null;
  appState?: string | null;
  accuracyM?: number | null;
  deviceModel?: string | null;
}

interface EnrichedDealVisit extends DealVisit {
  customerName: string;
  dealName: string;
  dealDocId: string;
  customerId: string;
  customerAddress?: string;
  customer?: Customer | null;
}

type JobSuggestion = {
  installerId: string;
  recommendedVisitId: string | null;
  recommendedDealId?: string | null;
  recommendedCustomerName?: string | null;
  distanceKm?: number | null;
  etaMin?: number | null;
  avgDelayMin?: number | null;
  finalEtaMin?: number | null;
  computedAt?: string;
  reason?: string;
  customerId?: string | null;
  dealDocId?: string | null;
  coordsSource?: "geo" | "legacy";
};

type AdminDailyStats = {
  installerId: string;
  dateKey: string;
  completedToday: number;
  totalWorkMin: number;
  avgWorkMin: number;
  delayCount: number;
  updatedAt?: string;
};

type VisitCompletionMode = "Porter" | "Other";

interface PendingVisitCompletion {
  visit: EnrichedDealVisit;
  mode: VisitCompletionMode;
  remark: string;
}

const WEEKDAY_ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
type WeekdayKey = (typeof WEEKDAY_ORDER)[number];

const getWeekdayFromSlotDate = (slotDate: string): WeekdayKey | null => {
  const cleanDate = String(slotDate || "").trim();
  if (!cleanDate) return null;
  const date = new Date(`${cleanDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return WEEKDAY_ORDER[date.getDay()] || null;
};

const formatWeekday = (day: WeekdayKey) => day.charAt(0).toUpperCase() + day.slice(1);

const OFFLINE_AFTER_MS = 60 * 1000;

const asFiniteNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const toIsoString = (value: unknown): string | undefined => {
  if (!value) return undefined;

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? undefined : value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
  }

  if (typeof value === "object") {
    const maybeTimestamp = value as {
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
    };

    if (typeof maybeTimestamp.toDate === "function") {
      const date = maybeTimestamp.toDate();
      const ms = date.getTime();
      return Number.isNaN(ms) ? undefined : date.toISOString();
    }

    const seconds = asFiniteNumber(maybeTimestamp.seconds ?? maybeTimestamp._seconds);
    if (seconds != null) {
      const nanos = asFiniteNumber(maybeTimestamp.nanoseconds ?? maybeTimestamp._nanoseconds) ?? 0;
      const ms = Math.round(seconds * 1000 + nanos / 1_000_000);
      return new Date(ms).toISOString();
    }
  }

  return undefined;
};

const pingToMs = (value?: unknown) => {
  const iso = toIsoString(value);
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const pickLatestIso = (...values: unknown[]) => {
  let latestMs = 0;
  let latestIso: string | undefined;

  values.forEach((value) => {
    const iso = toIsoString(value);
    if (!iso) return;
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) return;
    if (ms > latestMs) {
      latestMs = ms;
      latestIso = iso;
    }
  });

  return latestIso;
};

const normalizeTrackingDoc = (docId: string, rawData: any): InstallerTracking => {
  const raw = rawData || {};
  const lat = asFiniteNumber(raw?.location?.latitude ?? raw?.latitude);
  const lng = asFiniteNumber(raw?.location?.longitude ?? raw?.longitude);
  const networkTypeRaw = raw?.networkType ?? raw?.device?.networkType;
  const appStateRaw = raw?.appState ?? raw?.device?.appState;
  const deviceModelRaw = raw?.deviceModel ?? raw?.device?.deviceModel;
  const rawStatus =
    typeof raw?.status === "string"
      ? raw.status
      : typeof raw?.status?.state === "string"
        ? raw.status.state
        : undefined;

  const latestPingIso = pickLatestIso(
    raw?.timestamps?.lastPingAt,
    raw?.lastPingAt,
    raw?.timestamps?.updatedAt,
    raw?.updatedAt
  );

  const latestUpdatedIso = pickLatestIso(
    raw?.timestamps?.updatedAt,
    raw?.updatedAt,
    raw?.timestamps?.lastPingAt,
    raw?.lastPingAt
  );

  return {
    id: docId,
    installerId: String(raw?.installerId || docId),
    status: rawStatus,
    location:
      lat != null && lng != null
        ? { latitude: lat, longitude: lng }
        : undefined,
    lastPingAt: latestPingIso,
    updatedAt: latestUpdatedIso,
    speedKmh: asFiniteNumber(raw?.speedKmh ?? raw?.location?.speedKmh),
    currentVisitId: raw?.currentVisitId || raw?.visit?.currentVisitId || undefined,
    batteryLevel: asFiniteNumber(raw?.batteryLevel ?? raw?.device?.batteryLevel) ?? null,
    networkType: networkTypeRaw == null ? null : String(networkTypeRaw),
    gpsAccuracy: asFiniteNumber(raw?.gpsAccuracy ?? raw?.location?.accuracyM) ?? null,
    appState: appStateRaw == null ? null : String(appStateRaw),
    accuracyM: asFiniteNumber(raw?.accuracyM ?? raw?.location?.accuracyM) ?? null,
    deviceModel: deviceModelRaw == null ? null : String(deviceModelRaw),
  };
};

const resolvePresenceStatus = (
  tracking?: InstallerTracking,
  nowMs: number = Date.now()
): InstallerMapMarkerStatus => {
  const lastPingMs = pingToMs(tracking?.lastPingAt);
  if (!lastPingMs || nowMs - lastPingMs > OFFLINE_AFTER_MS) return "OFFLINE";

  const status = String(tracking?.status || "").toUpperCase();
  if (status === "DRIVING" || status === "MOVING") return "DRIVING";

  const speedKmh = Number(tracking?.speedKmh);
  if (Number.isFinite(speedKmh) && speedKmh >= 8) return "DRIVING";

  return "IDLE";
};

const statusAppearance: Record<InstallerMapMarkerStatus, { label: string; dot: string; badge: string; text: string }> = {
  DRIVING: {
    label: "Driving",
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-700",
  },
  IDLE: {
    label: "Idle",
    dot: "bg-amber-500",
    badge: "bg-amber-50 border-amber-200",
    text: "text-amber-700",
  },
  OFFLINE: {
    label: "Offline",
    dot: "bg-rose-500",
    badge: "bg-rose-50 border-rose-200",
    text: "text-rose-700",
  },
};

const formatLastPingAgo = (value?: unknown, nowMs: number = Date.now()) => {
  const pingMs = pingToMs(value);
  if (!pingMs) return "No ping";
  const seconds = Math.max(0, Math.round((nowMs - pingMs) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

// ─── Status Helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200 border" },
  Working:   { label: "Working",   className: "bg-blue-50 text-blue-700 border-blue-200 border animate-pulse" },
  approved:  { label: "Approved",  className: "bg-violet-50 text-violet-700 border-violet-200 border" },
  CWC:       { label: "Will Call", className: "bg-amber-50 text-amber-700 border-amber-200 border" },
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

const LiveStatusDot = ({ status }: { status?: string }) => {
  const s = (status || "IDLE").toUpperCase();
  const cfg =
    s === "DRIVING"
      ? statusAppearance.DRIVING
      : s === "OFFLINE"
        ? statusAppearance.OFFLINE
        : s === "WORKING"
          ? { dot: "bg-blue-500", text: "text-blue-700", badge: "bg-blue-50 border-blue-200", label: "WORKING" }
          : statusAppearance.IDLE;

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", cfg.badge, cfg.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot, s === "WORKING" && "animate-pulse")} />
      {cfg.label || s}
    </span>
  );
};

// ─── Stat Chip ────────────────────────────────────────────────────────────────

const StatChip = ({ icon: Icon, label, value, accent = false }: {
  icon: React.ElementType; label: string; value: string | number; accent?: boolean
}) => (
  <div className={cn(
    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm border",
    accent ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-slate-50 border-slate-200 text-slate-600"
  )}>
    <Icon className="h-3.5 w-3.5 shrink-0" />
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="font-semibold ml-auto">{value}</span>
  </div>
);

// ─── Filter Bar ───────────────────────────────────────────────────────────────

// ─── Filter Chip ─────────────────────────────────────────────────────────────

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

// ─── Installer Card ───────────────────────────────────────────────────────────

const InstallerCard = ({
  installer, visits, live, suggestion, dailyStats, onAssign, onShare, onViewDetails,
}: {
  installer: User;
  live?: InstallerTracking;
  suggestion?: JobSuggestion;
  visits: EnrichedDealVisit[];
  dailyStats?: AdminDailyStats;
  onAssign: (v: EnrichedDealVisit) => void;
  onShare: (v: EnrichedDealVisit) => void;
  onViewDetails: (v: EnrichedDealVisit) => void;
}) => {
  const [open, setOpen] = React.useState(false);
  const activeVisits = visits.filter(v => v.status !== "completed");
  const liveStatus = live?.status || "IDLE";

  const mapsUrl =
    typeof live?.location?.latitude === "number" && typeof live?.location?.longitude === "number"
      ? `https://www.google.com/maps?q=${live.location.latitude},${live.location.longitude}`
      : null;

  const updatedLabel = live?.lastPingAt || live?.updatedAt
    ? new Date(live.lastPingAt || live.updatedAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "No signal";

  const smartEta = typeof suggestion?.finalEtaMin === "number"
    ? suggestion.finalEtaMin
    : typeof suggestion?.etaMin === "number"
      ? suggestion.etaMin + (suggestion.avgDelayMin || 0)
      : null;

  const handleRefreshSuggestion = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const token = await getAuth().currentUser?.getIdToken(true);
    if (!token) return;
    await fetch("/api/admin/suggest-nearest", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
  };

  const handleRefreshStats = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const token = await getAuth().currentUser?.getIdToken(true);
    if (!token) return;
    await fetch("/api/admin/daily-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={cn(
        "rounded-2xl border bg-white shadow-sm transition-all duration-200",
        open && "shadow-md ring-1 ring-indigo-100"
      )}>
        {/* ── Card Header ── */}
        <CollapsibleTrigger asChild>
          <div className="flex cursor-pointer flex-col gap-4 p-5 hover:bg-slate-50/80 rounded-2xl transition-colors">
            {/* Row 1: Avatar + Name + Status */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  <Avatar className="h-11 w-11 ring-2 ring-white shadow-sm">
                    <AvatarImage src={installer.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(installer.name)}&background=6366f1&color=fff`} />
                    <AvatarFallback className="bg-indigo-100 text-indigo-700 font-semibold">
                      {installer.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white",
                    liveStatus === "WORKING" ? "bg-emerald-500" : liveStatus === "DRIVING" ? "bg-blue-500" : "bg-amber-400"
                  )} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{installer.name}</p>
                  <p className="text-xs text-slate-500 truncate">{installer.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold border",
                  activeVisits.length > 0 ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-slate-100 text-slate-500 border-slate-200"
                )}>
                  {activeVisits.length} active
                </span>
                <LiveStatusDot status={liveStatus} />
                <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform duration-200", open && "rotate-180")} />
              </div>
            </div>

            {/* Row 2: Stats */}
            <div className="grid grid-cols-2 gap-2">
              {smartEta != null && (
                <StatChip icon={Zap} label="ETA" value={`${smartEta}m`} accent />
              )}
              {typeof live?.speedKmh === "number" && (
                <StatChip icon={Activity} label="Speed" value={`${Math.round(live.speedKmh)} km/h`} />
              )}
              {dailyStats && (
                <>
                  <StatChip icon={Clock} label="Avg Work" value={`${dailyStats.avgWorkMin}m`} />
                  <StatChip icon={AlertCircle} label="Delays" value={dailyStats.delayCount} />
                </>
              )}
            </div>

            {/* Row 3: Suggestion + Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {suggestion?.recommendedVisitId ? (
                <div className="flex-1 min-w-0 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
                  <p className="text-xs text-indigo-600 font-medium truncate">
                    📍 {suggestion.recommendedDealId || suggestion.recommendedVisitId}
                    {suggestion.distanceKm != null && <span className="ml-1 opacity-70">· {suggestion.distanceKm}km</span>}
                    {suggestion.finalEtaMin != null && <span className="ml-1 font-bold"> · {suggestion.finalEtaMin}min</span>}
                    {(suggestion.avgDelayMin ?? 0) > 0 && (
                      <span className="ml-1 opacity-60 text-[10px]">(+{suggestion.avgDelayMin}m delay)</span>
                    )}
                  </p>
                </div>
              ) : (
                <div className="flex-1 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                  <p className="text-xs text-slate-400">No suggestion yet</p>
                </div>
              )}

              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg" onClick={handleRefreshSuggestion} title="Refresh suggestion">
                  <History className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg" onClick={handleRefreshStats} title="Refresh stats">
                  <TrendingUp className="h-3.5 w-3.5" />
                </Button>
                {mapsUrl && (
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg" asChild onClick={e => e.stopPropagation()}>
                    <a href={mapsUrl} target="_blank" rel="noreferrer">
                      <MapPin className="h-3.5 w-3.5 text-rose-500" />
                    </a>
                  </Button>
                )}
                {suggestion?.customerId && suggestion?.dealDocId && (
                  <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" asChild onClick={e => e.stopPropagation()}>
                    <Link href={`/dashboard/customers/${suggestion.customerId}/${suggestion.dealDocId}`}>Open</Link>
                  </Button>
                )}
              </div>
            </div>

            {/* Last ping */}
            <p className="text-[11px] text-slate-400 -mt-2 flex items-center gap-1">
              <Radio className="h-2.5 w-2.5" /> Last ping: {updatedLabel}
            </p>
          </div>
        </CollapsibleTrigger>

        {/* ── Visit List ── */}
        <CollapsibleContent>
          <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-2.5">
            {activeVisits.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center">
                <p className="text-sm text-slate-400">No active visits</p>
              </div>
            ) : (
              activeVisits.map(visit => (
                <div
                  key={visit.id}
                  className={cn(
                    "rounded-xl border bg-slate-50/60 p-3.5 transition-all hover:bg-white hover:shadow-sm",
                    (visit.visitStatus === "Working" || live?.currentVisitId === visit.id) && "ring-2 ring-blue-300 bg-blue-50/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{visit.customerName}</p>
                      {visit.customerAddress && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[180px]">📍 {visit.customerAddress}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {visit.slotLabel && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 font-medium border border-slate-200">
                          {visit.slotLabel}
                        </span>
                      )}
                      {renderVisitStatus(visit)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Link href={`/dashboard/customers/${visit.customerId}/${visit.dealDocId}`}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline">
                        {visit.dealId}
                      </Link>
                      {visit.dueDate && (
                        <span className="text-[11px] text-slate-400">· {format(new Date(visit.dueDate), "d MMM")}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => onViewDetails(visit)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => onShare(visit)}>
                        <Share2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button disabled={visit.status === "completed"} size="sm" variant="outline" className="h-7 rounded-lg text-xs px-2.5" onClick={() => onAssign(visit)}>
                        Reassign
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

// ─── All Visits Table ─────────────────────────────────────────────────────────

function AllVisitsTable({ visits, assigneeNameById, onAssign, onShare, onViewDetails, onUnassign, onEdit, onDelete, installers }: {
  visits: EnrichedDealVisit[];
  assigneeNameById: Record<string, string>;
  onAssign: (v: EnrichedDealVisit) => void;
  onShare: (v: EnrichedDealVisit) => void;
  onViewDetails: (v: EnrichedDealVisit) => void;
  onTransfer: (v: EnrichedDealVisit) => void;
  onUnassign: (v: EnrichedDealVisit) => void;
  onEdit: (v: EnrichedDealVisit) => void;
  onDelete: (v: EnrichedDealVisit) => void;
  installers: User[];
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [installerFilter, setInstallerFilter] = React.useState("all");
  const [previewPdf, setPreviewPdf] = React.useState<{ url: string; fileName: string; dealId?: string } | null>(null);
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = React.useState("");
  const [resolvingPreviewUrl, setResolvingPreviewUrl] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<EnrichedDealVisit | null>(null);
  const [confirmUnassign, setConfirmUnassign] = React.useState<EnrichedDealVisit | null>(null);
  const [completeDraftVisit, setCompleteDraftVisit] = React.useState<EnrichedDealVisit | null>(null);
  const [completionMode, setCompletionMode] = React.useState<VisitCompletionMode>("Porter");
  const [completionRemark, setCompletionRemark] = React.useState("");
  const [pendingCompletion, setPendingCompletion] = React.useState<PendingVisitCompletion | null>(null);
  const [isActionBusy, setIsActionBusy] = React.useState(false);
  const [isCompletingVisit, setIsCompletingVisit] = React.useState(false);
  const [isSyncingSheet, setIsSyncingSheet] = React.useState(false);
  const [companyVisitDialog, setCompanyVisitDialog] = React.useState(false);
  const syncingRef = React.useRef(false);

  // Auto-sync every 60s
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

  React.useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") handleSyncSheet({ silent: true });
    }, 60_000);
    return () => clearInterval(interval);
  }, [handleSyncSheet]);

  // Resolve PDF URL
  React.useEffect(() => {
    if (!previewPdf?.url) { setResolvedPreviewUrl(""); return; }
    let cancelled = false;
    setResolvingPreviewUrl(true);
    getFreshMeasurementPdfUrlAction(previewPdf.url)
      .then(url => { if (!cancelled) setResolvedPreviewUrl(url || previewPdf.url); })
      .catch(() => { if (!cancelled) setResolvedPreviewUrl(previewPdf.url); })
      .finally(() => { if (!cancelled) setResolvingPreviewUrl(false); });
    return () => { cancelled = true; };
  }, [previewPdf?.url]);

  const installerOptions = React.useMemo(() =>
    (installers || []).map(u => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [installers]
  );
  const typeOptions = React.useMemo(() => [...new Set(visits.map(v => v.typeOfVisit).filter(Boolean))].sort(), [visits]);
  const statusOptions = React.useMemo(() => [...new Set(visits.map(v => v.status).filter(Boolean))].sort(), [visits]);

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
        if (!visit.dueDate) return false;
        const due = new Date(visit.dueDate);
        if (isNaN(due.getTime())) return false;
        if (fromDate && due < fromDate) return false;
        if (toDate && due > toDate) return false;
      }
      if (typeFilter !== "all" && visit.typeOfVisit !== typeFilter) return false;
      if (statusFilter !== "all" && (visit.status || "requested") !== statusFilter) return false;
      if (installerFilter !== "all") {
        if (installerFilter === "unassigned" && visit.assignedTo) return false;
        if (installerFilter !== "unassigned" && visit.assignedTo !== installerFilter) return false;
      }
      if (queryText) {
        const haystack = [visit.customerName, visit.customerAddress, visit.dealId, visit.dealName,
          visit.typeOfVisit, visit.createdBy, visit.assignedTo ? assigneeNameById[visit.assignedTo] : ""]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(queryText)) return false;
      }
      return true;
    });
  }, [visits, dateFrom, dateTo, typeFilter, statusFilter, installerFilter, searchQuery, assigneeNameById]);

  const downloadPdf = async (url: string, fileName: string) => {
    try {
      const blob = await fetch(url, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(); return r.blob(); });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: fileName });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    } catch {
      const directUrl = url.includes("alt=media") ? url : `${url}${url.includes("?") ? "&" : "?"}alt=media`;
      const a = Object.assign(document.createElement("a"), { href: directUrl, download: fileName, target: "_blank", rel: "noopener" });
      document.body.appendChild(a); a.click(); a.remove();
    }
  };

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
      toast({
        variant: "destructive",
        title: "Remark required",
        description: "Please enter a remark when selecting Other.",
      });
      return;
    }

    setPendingCompletion({
      visit: completeDraftVisit,
      mode: completionMode,
      remark: trimmedRemark,
    });
    setCompleteDraftVisit(null);
  };

  const handleConfirmCompleteVisit = async () => {
    if (!pendingCompletion) return;
    setIsCompletingVisit(true);
    try {
      const nowIso = new Date().toISOString();
      const visitRef = doc(
        db,
        "customers",
        pendingCompletion.visit.customerId,
        "deals",
        pendingCompletion.visit.dealDocId,
        "visits",
        pendingCompletion.visit.id
      );

      await runTransaction(db, async (tx) => {
        const visitSnap = await tx.get(visitRef);
        if (!visitSnap.exists()) {
          throw new Error("Visit document not found.");
        }

        const payload: Record<string, unknown> = {
          status: "completed",
          visitEndTime: nowIso,
          completedAt: nowIso,
          completedBy: user?.name || user?.email || "Admin",
          completedById: user?.id || "admin",
          completionMode: pendingCompletion.mode,
          completionRemark:
            pendingCompletion.mode === "Other"
              ? pendingCompletion.remark
              : "Completed via Porter",
          updatedAt: nowIso,
          updatedBy: user?.id || "admin",
        };

        if (pendingCompletion.mode === "Other") {
          payload.remark = pendingCompletion.remark;
        }

        tx.update(visitRef, payload);
      });

      toast({
        title: "Visit completed",
        description: `${pendingCompletion.visit.customerName} visit marked as completed.`,
      });
      setPendingCompletion(null);
      setCompletionMode("Porter");
      setCompletionRemark("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to complete visit",
        description: error?.message || "Could not update visit status.",
      });
    } finally {
      setIsCompletingVisit(false);
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-900">All Visits</h2>
            <p className="text-sm text-slate-500 mt-0.5">{filteredVisits.length} visits shown · defaults to today</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => handleSyncSheet()} disabled={isSyncingSheet}
              className="rounded-lg text-xs h-8 border-slate-200">
              {isSyncingSheet ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <CalendarSync className="mr-1.5 h-3 w-3" />}
              Sync Sheet
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
            {/* Search */}
            <div className="xl:col-span-2 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <Input
                placeholder="Search customer, deal, address…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-9 rounded-lg border-slate-200 text-sm focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:border-indigo-400"
              />
            </div>

            {/* Date From */}
            <div className="relative">
              <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none z-10" />
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="pl-8 h-9 rounded-lg border-slate-200 text-sm text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:border-indigo-400 [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
              {dateFrom && (
                <button
                  type="button"
                  onClick={() => setDateFrom("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Date To */}
            <div className="relative">
              <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none z-10" />
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="pl-8 h-9 rounded-lg border-slate-200 text-sm text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:border-indigo-400 [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
              {dateTo && (
                <button
                  type="button"
                  onClick={() => setDateTo("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Type Filter */}
            <FilterSelect
              value={typeFilter}
              onChange={setTypeFilter}
              placeholder="All Types"
              options={[
                { value: "all", label: "All Types" },
                ...typeOptions.map(t => ({ value: t, label: t })),
              ]}
            />

            {/* Status Filter */}
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="All Status"
              options={[
                { value: "all", label: "All Status" },
                ...statusOptions.map(s => ({ value: s, label: s })),
              ]}
            />

            {/* Installer Filter */}
            <FilterSelect
              value={installerFilter}
              onChange={setInstallerFilter}
              placeholder="All Installers"
              options={[
                { value: "all", label: "All Installers" },
                { value: "unassigned", label: "Unassigned" },
                ...installerOptions.map(p => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>

          {/* Active filter chips */}
          {(dateFrom || dateTo || typeFilter !== "all" || statusFilter !== "all" || installerFilter !== "all" || searchQuery) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mr-1">Active:</span>
              {searchQuery && (
                <FilterChip label={`"${searchQuery}"`} onRemove={() => setSearchQuery("")} />
              )}
              {dateFrom && (
                <FilterChip label={`From ${dateFrom}`} onRemove={() => setDateFrom("")} />
              )}
              {dateTo && (
                <FilterChip label={`To ${dateTo}`} onRemove={() => setDateTo("")} />
              )}
              {typeFilter !== "all" && (
                <FilterChip label={typeFilter} onRemove={() => setTypeFilter("all")} />
              )}
              {statusFilter !== "all" && (
                <FilterChip label={statusFilter} onRemove={() => setStatusFilter("all")} />
              )}
              {installerFilter !== "all" && (
                <FilterChip
                  label={installerFilter === "unassigned" ? "Unassigned" : (installerOptions.find(p => p.id === installerFilter)?.name ?? installerFilter)}
                  onRemove={() => setInstallerFilter("all")}
                />
              )}
              <button
                type="button"
                onClick={() => { setSearchQuery(""); setDateFrom(""); setDateTo(""); setTypeFilter("all"); setStatusFilter("all"); setInstallerFilter("all"); }}
                className="text-[11px] text-indigo-500 hover:text-indigo-700 font-medium ml-1 underline underline-offset-2"
              >
                Clear all
              </button>
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
                <TableRow>
                  <TableCell colSpan={9} className="py-16 text-center text-slate-400 text-sm">
                    No visits match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredVisits.map(visit => (
                  <TableRow
                    key={visit.id}
                    className={cn(
                      "border-slate-100 hover:bg-slate-50/60 transition-colors",
                      visit.visitStatus === "Working" && "bg-blue-50/40 hover:bg-blue-50/60"
                    )}
                  >
                    {/* Created */}
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {visit.createdAt ? (
                        <>
                          <p className="font-medium text-slate-700">{format(new Date(visit.createdAt), "d MMM yyyy")}</p>
                          <p className="text-slate-400">{format(new Date(visit.createdAt), "hh:mm a")}</p>
                        </>
                      ) : "—"}
                    </TableCell>

                    {/* Customer */}
                    <TableCell className="font-medium text-slate-800 text-sm">{visit.customerName}</TableCell>

                    {/* Address */}
                    <TableCell className="max-w-[200px] text-xs text-slate-500 whitespace-normal break-words">
                      {visit.location?.address || visit.customerSnapshot?.address || "—"}
                    </TableCell>

                    {/* Deal / SM */}
                    <TableCell>
                      <Link href={`/dashboard/customers/${visit.customerId}/${visit.dealDocId}`}
                        className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline block">
                        {visit.dealId}
                      </Link>
                      <span className="text-xs text-slate-400">{visit.assignedSalesPerson?.name || "—"}</span>
                    </TableCell>

                    {/* Type */}
                    <TableCell>
                      <span className="inline-flex rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 capitalize">
                        {visit.typeOfVisit}
                      </span>
                      <p className="text-[11px] text-slate-400 mt-1">{visit.createdBy}</p>
                    </TableCell>

                    {/* Slot */}
                    <TableCell className="text-xs whitespace-nowrap">
                      <p className="font-medium text-slate-700">
                        {visit.slotDate ? format(new Date(visit.slotDate), "d MMM yyyy") : "Not set"}
                      </p>
                      {visit.slotLabel && (
                        <span className="inline-flex rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 mt-1">
                          {visit.slotLabel}
                        </span>
                      )}
                    </TableCell>

                    {/* Assigned To */}
                    <TableCell className="text-sm">
                      {visit.assignedTo ? (
                        <span className="font-medium text-slate-700">{assigneeNameById[visit.assignedTo] || "Unknown"}</span>
                      ) : (
                        <span className="text-slate-400 italic text-xs">Unassigned</span>
                      )}
                    </TableCell>

                    {/* Status */}
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
                            onClick={e => { e.stopPropagation(); setPreviewPdf({ url: visit.measurementPdfUrl, fileName: `${visit.dealId || "deal"}-measurement.pdf`, dealId: visit.dealId }); }}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-100 transition-colors"
                          >
                            <CloudDownload className="h-3 w-3" /> PDF
                          </button>
                        )}
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 rounded-lg hover:bg-slate-100">
                            <MoreHorizontal className="h-4 w-4 text-slate-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl shadow-lg border-slate-200 w-44">
                          <DropdownMenuItem onClick={() => onViewDetails(visit)} className="rounded-lg text-sm">
                            <Eye className="mr-2 h-3.5 w-3.5" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="rounded-lg text-sm"
                            onSelect={() => {
                              window.setTimeout(() => onAssign(visit), 0);
                            }}
                          >
                            <UserCheck className="mr-2 h-3.5 w-3.5" /> {visit.assignedTo ? "Re-assign" : "Assign"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onEdit(visit)} className="rounded-lg text-sm">
                            <Edit className="mr-2 h-3.5 w-3.5" /> Edit Visit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onShare(visit)} className="rounded-lg text-sm">
                            <Share2 className="mr-2 h-3.5 w-3.5" /> Share Link
                          </DropdownMenuItem>
                          {visit.status !== "completed" && (
                            <DropdownMenuItem
                              className="rounded-lg text-sm"
                              onSelect={e => { e.preventDefault(); openCompleteVisitDialog(visit); }}
                            >
                              <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Complete Visit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600 focus:text-red-700 rounded-lg text-sm"
                            onSelect={e => { e.preventDefault(); setConfirmDelete(visit); }}>
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                          {visit.assignedTo && (
                            <DropdownMenuItem className="text-red-600 focus:text-red-700 rounded-lg text-sm"
                              onSelect={e => { e.preventDefault(); setConfirmUnassign(visit); }}>
                              <UserX className="mr-2 h-3.5 w-3.5" /> Unassign
                            </DropdownMenuItem>
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

      {/* Confirm Delete */}
      <AlertDialog open={!!confirmDelete} onOpenChange={open => !open && setConfirmDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this visit?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg" disabled={isActionBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-lg bg-red-600 hover:bg-red-700" disabled={isActionBusy}
              onClick={async () => {
                if (!confirmDelete) return;
                setIsActionBusy(true);
                try { await onDelete(confirmDelete); } finally { setIsActionBusy(false); setConfirmDelete(null); }
              }}>
              {isActionBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Complete Visit Dialog */}
      <Dialog
        open={!!completeDraftVisit}
        onOpenChange={(open) => {
          if (!open) {
            setCompleteDraftVisit(null);
            setCompletionMode("Porter");
            setCompletionRemark("");
          }
        }}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Complete Visit</DialogTitle>
            <DialogDescription>
              Mark visit for <span className="font-semibold">{completeDraftVisit?.customerName || "this customer"}</span> as completed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Completed By</p>
              <Select
                value={completionMode}
                onValueChange={(value) => setCompletionMode(value as VisitCompletionMode)}
              >
                <SelectTrigger className="rounded-lg border-slate-200">
                  <SelectValue placeholder="Select option" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="Porter">Porter</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {completionMode === "Other" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Remark</p>
                <Textarea
                  placeholder="Enter completion remark"
                  value={completionRemark}
                  onChange={(event) => setCompletionRemark(event.target.value)}
                  className="rounded-lg border-slate-200 resize-none"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="rounded-lg"
              onClick={() => {
                setCompleteDraftVisit(null);
                setCompletionMode("Porter");
                setCompletionRemark("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-lg"
              onClick={proceedToCompleteConfirmation}
              disabled={completionMode === "Other" && !completionRemark.trim()}
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Complete Visit */}
      <AlertDialog
        open={!!pendingCompletion}
        onOpenChange={(open) => {
          if (!open && !isCompletingVisit) setPendingCompletion(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Complete this visit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark visit for <span className="font-semibold">{pendingCompletion?.visit.customerName || "this customer"}</span> as completed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg" disabled={isCompletingVisit}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg"
              disabled={isCompletingVisit}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmCompleteVisit();
              }}
            >
              {isCompletingVisit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Unassign */}
      <AlertDialog open={!!confirmUnassign} onOpenChange={open => !open && setConfirmUnassign(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Unassign this visit?</AlertDialogTitle>
            <AlertDialogDescription>The visit will stay in the system but be removed from the installer's schedule.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg" disabled={isActionBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-lg" disabled={isActionBusy}
              onClick={async () => {
                if (!confirmUnassign) return;
                setIsActionBusy(true);
                try { await onUnassign(confirmUnassign); } finally { setIsActionBusy(false); setConfirmUnassign(null); }
              }}>
              {isActionBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Unassign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CompanyVisitDialog open={companyVisitDialog} onOpenChange={setCompanyVisitDialog} installers={installers} />
    </>
  );
}

// ─── Edit Visit Dialog ────────────────────────────────────────────────────────

const formSchema = z.object({
  dueDate: z.string().min(1, "Due date is required."),
  representative: z.string().min(1, "Representative is required."),
  customerAddress: z.string().optional(),
  remark: z.string().optional(),
});

function EditVisitDialog({ visit, isOpen, onClose, salesmen, onSuccess }: {
  visit: EnrichedDealVisit | null;
  isOpen: boolean;
  onClose: () => void;
  salesmen: User[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { dueDate: "", representative: "", customerAddress: "", remark: "" },
  });

  React.useEffect(() => {
    if (visit) form.reset({
      dueDate: visit.dueDate ? format(new Date(visit.dueDate), "yyyy-MM-dd") : visit.slotDate || "",
      representative: visit.representative || "",
      customerAddress: visit.customerAddress || visit.location?.address || "",
      remark: visit.remark || "",
    });
  }, [visit, form]);

  if (!visit) return null;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const result = await updateVisitDetailsAction(visit.customerId, visit.dealDocId, visit.id, {
        dueDate: new Date(values.dueDate).toISOString(),
        representative: values.representative,
        customerAddress: values.customerAddress?.trim(),
        remark: values.remark,
      });
      if (result.success) { toast({ title: "Visit updated" }); onSuccess(); onClose(); }
      else toast({ variant: "destructive", title: "Update failed", description: result.message });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally { setIsSubmitting(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Edit Visit</DialogTitle>
          <DialogDescription>Updating visit for {visit.customerName}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            {[
              { name: "dueDate" as const, label: "Visit Date", type: "date" as const },
            ].map(({ name, label, type }) => (
              <FormField key={name} control={form.control} name={name} render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-slate-700">{label}</FormLabel>
                  <FormControl><Input type={type} {...field} className="rounded-lg border-slate-200" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            ))}
            <FormField control={form.control} name="customerAddress" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-slate-700">Address</FormLabel>
                <FormControl><Textarea placeholder="Customer address" {...field} className="rounded-lg border-slate-200 resize-none" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="representative" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-slate-700">Representative</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="rounded-lg border-slate-200"><SelectValue placeholder="Select representative" /></SelectTrigger>
                  </FormControl>
                  <SelectContent className="rounded-xl">
                    {salesmen.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="remark" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-slate-700">Remarks</FormLabel>
                <FormControl><Textarea placeholder="Add any notes…" {...field} className="rounded-lg border-slate-200 resize-none" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={onClose} className="rounded-lg">Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="rounded-lg">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Visit Details Dialog ─────────────────────────────────────────────────────

function VisitDetailsDialog({ visit, assigneeNameById, onClose }: {
  visit: EnrichedDealVisit | null;
  assigneeNameById: Record<string, string>;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!visit} onOpenChange={onClose}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>Visit Details</DialogTitle>
        </DialogHeader>
        {visit && (
          <div className="space-y-4">
            {/* Status row */}
            <div className="flex items-center justify-between">
              <span className="inline-flex rounded-lg bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 capitalize">
                {visit.typeOfVisit}
              </span>
              {renderVisitStatus(visit)}
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Customer", value: visit.customer?.name },
                { label: "Assigned To", value: visit.assignedTo ? (assigneeNameById[visit.assignedTo] || "Unknown") : "Unassigned" },
                { label: "Phone", value: visit.customer?.phone },
                { label: "Created By", value: visit.createdBy },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">{value || "—"}</p>
                </div>
              ))}
            </div>

            {/* Address */}
            {visit.location?.address && (
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Address</p>
                <p className="text-sm text-slate-700 mt-0.5">{visit.location.address}</p>
              </div>
            )}

            <Separator className="bg-slate-100" />

            {/* Visit-type-specific details */}
            {visit.typeOfVisit === "measurement" ? (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Measurement Details</p>
                <p className="text-sm text-slate-700">{visit.measurements?.map(m => `‣ ${m?.name || m}`).join(", ") || "N/A"}</p>
                {visit.blinds?.length > 0 && (
                  <p className="text-sm text-slate-700 mt-1">Blinds: {visit.blinds.join(", ")}</p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Items</p>
                <p className="text-sm text-slate-700">
                  {visit.deliveryInstallations?.map(d => `${d?.id} (×${d?.noOfPcs || 1})`).join(", ") || "N/A"}
                </p>
              </div>
            )}

            {visit.remark && (
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
                <p className="text-[11px] text-amber-600 font-medium uppercase tracking-wide">Remark</p>
                <p className="text-sm text-slate-700 mt-0.5">{visit.remark}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AllVisitsPage() {
  const [allVisits, setAllVisits] = React.useState<EnrichedDealVisit[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tracking, setTracking] = React.useState<InstallerTracking[]>([]);
  const [trackingLoading, setTrackingLoading] = React.useState(true);
  const [clockNow, setClockNow] = React.useState(() => Date.now());
  const [selectedVisit, setSelectedVisit] = React.useState<EnrichedDealVisit | null>(null);
  const [isAssigning, setIsAssigning] = React.useState(false);
  const [shareableLink, setShareableLink] = React.useState<string | null>(null);
  const [detailsVisit, setDetailsVisit] = React.useState<EnrichedDealVisit | null>(null);
  const [dailyStatsMap, setDailyStatsMap] = React.useState<Record<string, AdminDailyStats>>({});
  const [suggestMap, setSuggestMap] = React.useState<Record<string, JobSuggestion>>({});
  const [editingVisit, setEditingVisit] = React.useState<EnrichedDealVisit | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const installers = React.useMemo(() => users.filter(u => u.role === "installer"), [users]);

  const assigneeNameById = React.useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach(u => { map[u.id] = u.name; });
    return map;
  }, [users]);

  const groupedVisits = React.useMemo(() => {
    const map = new Map<string, EnrichedDealVisit[]>();
    installers.forEach(i => map.set(i.id, []));
    allVisits.forEach(v => {
      if (v.assignedTo) {
        if (!map.has(v.assignedTo)) map.set(v.assignedTo, []);
        map.get(v.assignedTo)!.push(v);
      }
    });
    return map;
  }, [allVisits, installers]);

  const trackingByInstaller = React.useMemo(() => {
    const map = new Map<string, InstallerTracking>();
    tracking.forEach(d => { const k = d.installerId || d.id; map.set(k, { ...d, installerId: k, id: d.id || k }); });
    return map;
  }, [tracking]);

  const visitsById = React.useMemo(() => {
    const map = new Map<string, EnrichedDealVisit>();
    allVisits.forEach(v => map.set(v.id, v));
    return map;
  }, [allVisits]);

  const completedTodayByInstaller = React.useMemo(() => {
    const map = new Map<string, number>();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    allVisits.forEach(v => {
      if (!v.assignedTo || v.status !== "completed" || !v.visitEndTime) return;
      const t = new Date(v.visitEndTime);
      if (!isNaN(t.getTime()) && t >= todayStart) map.set(v.assignedTo, (map.get(v.assignedTo) || 0) + 1);
    });
    return map;
  }, [allVisits]);

  const liveInstallerRows = React.useMemo(() => {
    return installers.map((installer) => {
      const trackingDoc = trackingByInstaller.get(installer.id);
      const presence = resolvePresenceStatus(trackingDoc, clockNow);
      const currentVisit = trackingDoc?.currentVisitId ? visitsById.get(trackingDoc.currentVisitId) : null;
      const assignedVisits = groupedVisits.get(installer.id) || [];
      const activeVisit = currentVisit || assignedVisits.find((visit) => visit.status !== "completed");

      const taskLabel = activeVisit
        ? `${activeVisit.customerName} (${activeVisit.typeOfVisit || "visit"})`
        : trackingDoc?.currentVisitId
          ? `Visit ${trackingDoc.currentVisitId}`
          : "No active task";

      const batteryLevel =
        typeof trackingDoc?.batteryLevel === "number"
          ? Math.max(0, Math.min(100, Math.round(trackingDoc.batteryLevel)))
          : null;

      const gpsAccuracy =
        typeof trackingDoc?.gpsAccuracy === "number"
          ? Math.round(trackingDoc.gpsAccuracy)
          : typeof trackingDoc?.accuracyM === "number"
            ? Math.round(trackingDoc.accuracyM)
            : null;

      return {
        installer,
        trackingDoc,
        presence,
        taskLabel,
        batteryLevel,
        gpsAccuracy,
        networkType: trackingDoc?.networkType || null,
        appState: trackingDoc?.appState || null,
        deviceModel: trackingDoc?.deviceModel || null,
        speedKmh: typeof trackingDoc?.speedKmh === "number" ? Math.round(trackingDoc.speedKmh) : null,
        lastPingAt: trackingDoc?.lastPingAt || null,
        completedToday: completedTodayByInstaller.get(installer.id) || 0,
      };
    });
  }, [installers, trackingByInstaller, clockNow, visitsById, groupedVisits, completedTodayByInstaller]);

  const liveMapMarkers = React.useMemo<InstallerMapMarker[]>(() => {
    return liveInstallerRows
      .filter((row) => typeof row.trackingDoc?.location?.latitude === "number" && typeof row.trackingDoc?.location?.longitude === "number")
      .map((row) => ({
        id: row.installer.id,
        name: row.installer.name,
        status: row.presence,
        latitude: row.trackingDoc!.location!.latitude,
        longitude: row.trackingDoc!.location!.longitude,
        speedKmh: row.speedKmh,
        batteryLevel: row.batteryLevel,
        networkType: row.networkType,
        gpsAccuracy: row.gpsAccuracy,
        appState: row.appState,
        lastPingAt: row.lastPingAt,
        currentTask: row.taskLabel,
      }));
  }, [liveInstallerRows]);

  const livePresenceCounts = React.useMemo(() => {
    return liveInstallerRows.reduce(
      (acc, row) => {
        acc[row.presence] += 1;
        return acc;
      },
      { DRIVING: 0, IDLE: 0, OFFLINE: 0 } as Record<InstallerMapMarkerStatus, number>
    );
  }, [liveInstallerRows]);

  // Firestore subscriptions
  React.useEffect(() => {
    const unsubs = [
      onSnapshot(query(collection(db, "users")), snap => {
        setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
      }),
      onSnapshot(collectionGroup(db, "visits"), async snap => {
        const customerCache = new Map<string, Customer>();
        const dealCache = new Map<string, Deal>();
        const results = await Promise.all(snap.docs.map(async docSnap => {
          const visit = docSnap.data() as DealVisit;
          const parts = docSnap.ref.path.split("/");
          const customerId = parts[1], dealDocId = parts[3];
          if (!customerCache.has(customerId)) {
            const s = await getDoc(doc(db, "customers", customerId));
            if (s.exists()) customerCache.set(customerId, { id: s.id, ...s.data() } as Customer);
          }
          const ck = `${customerId}-${dealDocId}`;
          if (!dealCache.has(ck)) {
            const s = await getDoc(doc(db, "customers", customerId, "deals", dealDocId));
            if (s.exists()) dealCache.set(ck, { id: s.id, ...s.data() } as Deal);
          }
          const deal = dealCache.get(ck);
          return {
            ...visit, id: docSnap.id, customerId, dealDocId,
            customerName: customerCache.get(customerId)?.name || "Unknown",
            dealName: deal?.dealName || "Unknown",
            dealId: deal?.dealId || "N/A",
            customer: customerCache.get(customerId) || null,
          };
        }));
        setAllVisits(results);
        setLoading(false);
      }),
      onSnapshot(collection(db, "installerTracking"), snap => {
        const installers: InstallerTracking[] = [];
        snap.forEach((docSnap) => {
          installers.push(normalizeTrackingDoc(docSnap.id, docSnap.data()));
        });
        setTracking(installers);
        setTrackingLoading(false);
      }),
      onSnapshot(collection(db, "jobSuggestions"), snap => {
        const next: Record<string, JobSuggestion> = {};
        snap.forEach(d => { next[d.id] = { installerId: d.id, ...(d.data() as any) }; });
        setSuggestMap(next);
      }),
      onSnapshot(collection(db, "adminDailyStats"), snap => {
        const next: Record<string, AdminDailyStats> = {};
        snap.forEach(d => { const data = d.data() as any; if (data?.installerId) next[data.installerId] = data; });
        setDailyStatsMap(next);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  const openAssign = (visit: EnrichedDealVisit) => { setSelectedVisit(visit); setIsAssigning(true); };

  const handleShareClick = (visit: EnrichedDealVisit) => {
    const link = `https://mo-track-yerq.vercel.app/visit/confirm/${visit.id}?customerId=${visit.customerId}&dealId=${visit.dealDocId}`;
    setShareableLink(link);
  };

  const handleAssignInstaller = async (installerId: string, slots?: SlotSelection[]) => {
    if (!selectedVisit || !slots?.length) return;
    const slotDate = slots[0].slotDate;
    const selectedInstaller = installers.find((installer) => installer.id === installerId);
    const installerDayOff = String(selectedInstaller?.dayOff || "").trim().toLowerCase();
    const slotDay = getWeekdayFromSlotDate(slotDate);

    if (slotDay && installerDayOff && installerDayOff === slotDay) {
      toast({
        variant: "destructive",
        title: "Installer unavailable",
        description: `${selectedInstaller?.name || "This installer"} is off on ${formatWeekday(slotDay)}.`,
      });
      return;
    }

    setIsAssigning(false);
    try {
      const assignedAt = new Date().toISOString();
      const slotIndex = new Map(SLOT_OPTIONS.map((opt, idx) => [opt.id, idx]));
      const sortedSlotIds = [...new Set(slots.map(s => s.slotId))].sort(
        (a, b) => (slotIndex.get(a) ?? 0) - (slotIndex.get(b) ?? 0)
      );
      const firstSlot = SLOT_OPTIONS.find(s => s.id === sortedSlotIds[0]);
      const lastSlot  = SLOT_OPTIONS.find(s => s.id === sortedSlotIds[sortedSlotIds.length - 1]);
      if (!firstSlot || !lastSlot) return;

      // ── Guard: skip if nothing changed ───────────────────────────────────
      const prevInstallerId = selectedVisit.assignedTo || "";
      const prevSlotDate    = selectedVisit.slotDate   || "";
      const prevSlotIds     = selectedVisit.slotIds?.length
        ? selectedVisit.slotIds
        : selectedVisit.slotId ? [selectedVisit.slotId] : [];
      const prevSorted = [...prevSlotIds].sort(
        (a, b) => (slotIndex.get(a) ?? 0) - (slotIndex.get(b) ?? 0)
      );
      const selectionUnchanged =
        prevInstallerId === installerId &&
        prevSlotDate    === slotDate &&
        prevSorted.length === sortedSlotIds.length &&
        prevSorted.every((id, i) => id === sortedSlotIds[i]);

      if (selectionUnchanged) { setSelectedVisit(null); return; }

      await runTransaction(db, async tx => {
        const visitRef   = doc(db, "customers", selectedVisit.customerId, "deals", selectedVisit.dealDocId, "visits", selectedVisit.id);
        const newDateRef = doc(db, "installers", installerId, "dates", slotDate);
        const prevRef    = prevInstallerId && prevSlotDate
          ? doc(db, "installers", prevInstallerId, "dates", prevSlotDate)
          : null;

        // ── Fetch sequentially to avoid passing null into Promise.all ──────
        const newSnap  = await tx.get(newDateRef);
        const prevSnap = prevRef ? await tx.get(prevRef) : null;

        const rawPrevSlots: any[] = Array.isArray((prevSnap?.data() as any)?.slots) ? (prevSnap!.data() as any).slots : [];
        const rawNewSlots:  any[] = Array.isArray((newSnap.data()  as any)?.slots)  ? (newSnap.data()  as any).slots  : [];
        const selectedSet = new Set(sortedSlotIds);

        // ── Block if target slot already booked by someone else ────────────
        const blocking = rawNewSlots.find(
          (s: any) => selectedSet.has(s?.slotId || s?.id) && s?.visitId && s.visitId !== selectedVisit.id
        );
        if (blocking) throw new Error(`Slot "${blocking.slotLabel || blocking.slotId}" is already booked.`);

        // ── cleanSlots: removes this visit from previous installer's day ───
        const cleanSlots = (base: any[], forDate: string) =>
          SLOT_OPTIONS.map(opt => {
            const ex = base.filter(s => s?.visitId !== selectedVisit.id)
              .find((s: any) => (s?.slotId || s?.id) === opt.id);
            return ex
              ? { ...ex, slotId: opt.id, id: opt.id, slotDate: forDate, status: ex.status || (ex.visitId ? "booked" : "free") }
              : { slotId: opt.id, id: opt.id, slotLabel: opt.label, slotStart: opt.start, slotEnd: opt.end, slotDate: forDate, status: "free" };
          });

        // ── bookSlots: inserts this visit into new installer's day ─────────
        const bookSlots = (base: any[], forDate: string) =>
          SLOT_OPTIONS.map(opt => {
            if (selectedSet.has(opt.id)) return {
              slotId: opt.id, id: opt.id, slotLabel: opt.label, slotStart: opt.start, slotEnd: opt.end, slotDate: forDate,
              visitId: selectedVisit.id, customerId: selectedVisit.customerId, customerName: selectedVisit.customerName || "",
              dealId: selectedVisit.dealId || "", dealDocId: selectedVisit.dealDocId, dealName: selectedVisit.dealName || "",
              assignedAt, assignedTo: installerId, status: "booked",
            };
            const ex = base.filter(s => s?.visitId !== selectedVisit.id)
              .find((s: any) => (s?.slotId || s?.id) === opt.id);
            return ex
              ? { ...ex, slotId: opt.id, id: opt.id, slotDate: forDate, status: ex.status || (ex.visitId ? "booked" : "free") }
              : { slotId: opt.id, id: opt.id, slotLabel: opt.label, slotStart: opt.start, slotEnd: opt.end, slotDate: forDate, status: "free" };
          });

        // ── Writes ─────────────────────────────────────────────────────────
        if (prevRef) {
          tx.set(prevRef, { slotDate: prevSlotDate, slots: cleanSlots(rawPrevSlots, prevSlotDate) }, { merge: true });
        }
        tx.set(newDateRef, { slotDate, slots: bookSlots(rawNewSlots, slotDate) }, { merge: true });
        tx.update(visitRef, {
          assignedTo: installerId,
          slotDate,
          slotId:    firstSlot.id,
          slotIds:   sortedSlotIds,
          slotLabel: `${firstSlot.start} - ${lastSlot.end}`,
          slotStart: firstSlot.start,
          slotEnd:   lastSlot.end,
          assignedAt,
        });
      });

      toast({ title: "Assigned", description: "Installer and slot updated successfully." });
      setSelectedVisit(null);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Assignment failed", description: e?.message });
    }
  };

  const handleUnassign = async (visit: EnrichedDealVisit) => {
    try {
      const r = await unassignVisitAction(visit.id, visit.customerId, visit.dealDocId);
      toast(r.success ? { title: "Unassigned" } : { variant: "destructive", title: "Error", description: r.message });
    } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
  };

  const handleDelete = async (visit: EnrichedDealVisit) => {
    try {
      const r = await deleteVisitAction(visit.id, visit.customerId, visit.dealDocId);
      toast(r.success ? { title: "Deleted" } : { variant: "destructive", title: "Error", description: r.message });
    } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  // Summary stats
  const totalActive = allVisits.filter(v => v.status !== "completed").length;
  const totalCompleted = allVisits.filter(v => v.status === "completed").length;
  const totalWorking = allVisits.filter(v => v.visitStatus === "Working").length;

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-6 lg:p-8">
      {/* ── Page Header ── */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Visit Management</h1>
            <p className="text-slate-500 text-sm mt-1">Monitor and manage all customer visits in real-time</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Installers", value: installers.length, icon: Users, color: "from-indigo-500 to-indigo-600" },
            { label: "Active Visits", value: totalActive, icon: Activity, color: "from-blue-500 to-blue-600" },
            { label: "Working Now", value: totalWorking, icon: Zap, color: "from-amber-500 to-amber-600" },
            { label: "Completed Today", value: totalCompleted, icon: CheckCircle2, color: "from-emerald-500 to-emerald-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className={cn("rounded-xl p-2.5 bg-gradient-to-br text-white shadow-sm", color)}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
                <p className="text-xs text-slate-500 mt-1">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="live" className="w-full">
        <TabsList className="bg-white border border-slate-200 shadow-sm rounded-xl p-1 h-auto mb-6">
          {[
            { value: "live", label: "Live Map" },
            { value: "installers", label: "Installers" },
            { value: "all", label: "All Visits" },
          ].map(({ value, label }) => (
            <TabsTrigger key={value} value={value}
              className="rounded-lg text-sm px-5 py-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Live Tab */}
        <TabsContent value="live">
          {trackingLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <Card className="xl:col-span-8 overflow-hidden border-slate-200 shadow-sm">
                <div className="border-b border-slate-100 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Installer Live Map</h3>
                    <p className="text-xs text-slate-500 mt-1">Real-time markers from Firestore `installerTracking`</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(["DRIVING", "IDLE", "OFFLINE"] as InstallerMapMarkerStatus[]).map((status) => {
                      const style = statusAppearance[status];
                      return (
                        <span
                          key={status}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                            style.badge,
                            style.text
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
                          {style.label}: {livePresenceCounts[status]}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="p-4">
                  <InstallerLiveMap markers={liveMapMarkers} />
                </div>
              </Card>

              <Card className="xl:col-span-4 border-slate-200 shadow-sm">
                <div className="border-b border-slate-100 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Device Health Monitoring</h3>
                  <p className="text-xs text-slate-500 mt-1">Battery, network, GPS accuracy, app state, and ping freshness</p>
                </div>
                <div className="max-h-[510px] overflow-y-auto p-3 space-y-2.5">
                  {liveInstallerRows.map((row) => {
                    const style = statusAppearance[row.presence];
                    const pingAgo = formatLastPingAgo(row.lastPingAt || undefined, clockNow);
                    const speedLabel = row.speedKmh != null ? `${row.speedKmh} km/h` : "N/A";
                    const batteryLabel = row.batteryLevel != null ? `${row.batteryLevel}%` : "N/A";
                    const gpsLabel = row.gpsAccuracy != null ? `${row.gpsAccuracy}m` : "N/A";
                    const mapsUrl =
                      typeof row.trackingDoc?.location?.latitude === "number" &&
                      typeof row.trackingDoc?.location?.longitude === "number"
                        ? `https://www.google.com/maps?q=${row.trackingDoc.location.latitude},${row.trackingDoc.location.longitude}`
                        : null;

                    return (
                      <div key={row.installer.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{row.installer.name}</p>
                            <p className="text-xs text-slate-500 truncate">{row.taskLabel}</p>
                          </div>
                          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold", style.badge, style.text)}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
                            {style.label}
                          </span>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                            <p className="text-slate-500">Speed</p>
                            <p className="font-semibold text-slate-900">{speedLabel}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                            <p className="text-slate-500">Battery</p>
                            <p className="font-semibold text-slate-900">{batteryLabel}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                            <p className="text-slate-500">Network</p>
                            <p className="font-semibold text-slate-900 uppercase">{row.networkType || "N/A"}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                            <p className="text-slate-500">GPS</p>
                            <p className="font-semibold text-slate-900">{gpsLabel}</p>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                          <span>Last ping: {pingAgo}</span>
                          <span>App: {row.appState || "N/A"}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">
                            Completed today: {row.completedToday}
                            {row.deviceModel ? ` | ${row.deviceModel}` : ""}
                          </span>
                          {mapsUrl ? (
                            <a href={mapsUrl} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:text-indigo-800">
                              Open map
                            </a>
                          ) : (
                            <span className="text-slate-400">No location</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Installers Tab */}
        <TabsContent value="installers">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {installers.map(installer => (
              <InstallerCard
                key={installer.id}
                installer={installer}
                live={trackingByInstaller.get(installer.id)}
                suggestion={suggestMap[installer.id]}
                dailyStats={dailyStatsMap[installer.id]}
                visits={groupedVisits.get(installer.id) || []}
                onAssign={openAssign}
                onShare={handleShareClick}
                onViewDetails={v => setDetailsVisit(v)}
              />
            ))}
          </div>
        </TabsContent>

        {/* All Visits Tab */}
        <TabsContent value="all">
          <AllVisitsTable
            visits={allVisits}
            installers={installers}
            assigneeNameById={assigneeNameById}
            onAssign={openAssign}
            onShare={handleShareClick}
            onViewDetails={v => setDetailsVisit(v)}
            onTransfer={openAssign}
            onUnassign={handleUnassign}
            onEdit={v => setEditingVisit(v)}
            onDelete={handleDelete}
          />
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ── */}
      <VisitDetailsDialog
        visit={detailsVisit}
        assigneeNameById={assigneeNameById}
        onClose={() => setDetailsVisit(null)}
      />

      <AssignInstallerDialog
        isOpen={isAssigning}
        onClose={() => setIsAssigning(false)}
        onAssign={handleAssignInstaller}
        installers={installers}
        currentInstallerId={selectedVisit?.assignedTo}
        currentVisitId={selectedVisit?.id}
        currentSlotSelection={selectedVisit ? {
          slotDate: selectedVisit.slotDate,
          slotId: selectedVisit.slotId || undefined,
          slotIds: selectedVisit.slotIds?.length ? selectedVisit.slotIds : selectedVisit.slotId ? [selectedVisit.slotId] : undefined,
          slotLabel: selectedVisit.slotLabel,
          slotStart: selectedVisit.slotStart,
          slotEnd: selectedVisit.slotEnd,
        } : undefined}
      />

      <Dialog open={!!shareableLink} onOpenChange={() => setShareableLink(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Share Visit Link</DialogTitle>
            <DialogDescription>Send this link for customer confirmation.</DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Input value={shareableLink || ""} readOnly className="rounded-lg border-slate-200 text-sm font-mono" />
          </div>
          <DialogFooter>
            <Button onClick={() => { navigator.clipboard.writeText(shareableLink || ""); toast({ title: "Copied!" }); }}
              className="rounded-lg">
              <Copy className="mr-2 h-4 w-4" /> Copy Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditVisitDialog
        visit={editingVisit}
        isOpen={!!editingVisit}
        onClose={() => setEditingVisit(null)}
        salesmen={users}
        onSuccess={() => {}}
      />
    </div>
  );
}
