"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  Clock3,
  Eye,
  MapPin,
  Navigation,
  Share2,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatLastPingAgo, resolvePresenceStatus } from "@/lib/visits/trackingUtils";
import {
  AdminDailyStats,
  EnrichedDealVisit,
  InstallerTracking,
  JobSuggestion,
} from "@/types/visits";

const PRESENCE_STYLE = {
  DRIVING: {
    label: "Driving",
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  IDLE: {
    label: "Idle",
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
  },
  OFFLINE: {
    label: "Offline",
    dot: "bg-rose-500",
    badge: "bg-rose-50 text-rose-700 border-rose-200",
  },
} as const;

interface InstallerCardProps {
  installer: User;
  live?: InstallerTracking;
  suggestion?: JobSuggestion;
  dailyStats?: AdminDailyStats;
  visits: EnrichedDealVisit[];
  onAssign: (visit: EnrichedDealVisit) => void;
  onShare: (visit: EnrichedDealVisit) => void;
  onViewDetails: (visit: EnrichedDealVisit) => void;
}

const STATUS_CONFIG = {
  completed: {
    label: "Completed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  Working: {
    label: "Working",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  approved: {
    label: "Approved",
    className: "bg-violet-50 text-violet-700 border-violet-200",
  },
  CWC: {
    label: "Will Call",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
} as const;

function renderVisitStatus(visit: EnrichedDealVisit) {
  if (visit.status === "completed") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
          STATUS_CONFIG.completed.className
        )}
      >
        {STATUS_CONFIG.completed.label}
      </span>
    );
  }

  if (visit.visitStatus === "Working") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
          STATUS_CONFIG.Working.className
        )}
      >
        {STATUS_CONFIG.Working.label}
      </span>
    );
  }

  if (visit.status === "approved") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
          STATUS_CONFIG.approved.className
        )}
      >
        {STATUS_CONFIG.approved.label}
      </span>
    );
  }

  if (visit.status === "CWC") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
          STATUS_CONFIG.CWC.className
        )}
      >
        {STATUS_CONFIG.CWC.label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      {visit.status || "Pending"}
    </span>
  );
}

function formatVisitDate(visit: EnrichedDealVisit) {
  const candidate = visit.dueDate || visit.slotDate || visit.createdAt;
  if (!candidate) return "No date";
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) return "No date";
  return format(date, "d MMM, hh:mm a");
}

export default function InstallerCard({
  installer,
  live,
  suggestion,
  dailyStats,
  visits,
  onAssign,
  onShare,
  onViewDetails,
}: InstallerCardProps) {
  const presence = resolvePresenceStatus(live);
  const presenceStyle = PRESENCE_STYLE[presence];

  const sortedVisits = React.useMemo(() => {
    return [...visits].sort((a, b) => {
      const aTime = new Date(a.dueDate || a.slotDate || a.createdAt || 0).getTime();
      const bTime = new Date(b.dueDate || b.slotDate || b.createdAt || 0).getTime();
      return aTime - bTime;
    });
  }, [visits]);

  const pendingVisits = React.useMemo(
    () => sortedVisits.filter((visit) => visit.status !== "completed"),
    [sortedVisits]
  );

  const visibleVisits = pendingVisits.slice(0, 3);
  const workingCount = pendingVisits.filter((visit) => visit.visitStatus === "Working").length;
  const completedToday = dailyStats?.completedToday ?? 0;

  const recommendationLabel =
    suggestion?.recommendedCustomerName ||
    sortedVisits.find((visit) => visit.id === suggestion?.recommendedVisitId)?.customerName ||
    null;

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{installer.name}</h3>
            <p className="mt-1 text-xs text-slate-500">{formatLastPingAgo(live?.lastPingAt)}</p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              presenceStyle.badge
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", presenceStyle.dot)} />
            {presenceStyle.label}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2">
            <p className="text-[11px] text-slate-500">Assigned</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-800">{sortedVisits.length}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2">
            <p className="text-[11px] text-slate-500">Working</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-800">{workingCount}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2">
            <p className="text-[11px] text-slate-500">Done Today</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-800">{completedToday}</p>
          </div>
        </div>

        {(typeof live?.location?.latitude === "number" && typeof live?.location?.longitude === "number") && (
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
            <MapPin className="h-3.5 w-3.5" />
            <span>
              {live.location.latitude.toFixed(5)}, {live.location.longitude.toFixed(5)}
            </span>
            {typeof live.speedKmh === "number" && (
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Navigation className="h-3.5 w-3.5" />
                {Math.round(live.speedKmh)} km/h
              </span>
            )}
          </div>
        )}

        {recommendationLabel && (
          <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2">
            <p className="text-[11px] font-medium text-indigo-700">Suggested next visit</p>
            <p className="mt-0.5 text-xs text-indigo-900">{recommendationLabel}</p>
            <p className="mt-1 text-[11px] text-indigo-700/90">
              {typeof suggestion?.distanceKm === "number" ? `${suggestion.distanceKm.toFixed(1)} km` : "Distance NA"}
              {" - "}
              {typeof suggestion?.finalEtaMin === "number"
                ? `ETA ${Math.round(suggestion.finalEtaMin)} min`
                : typeof suggestion?.etaMin === "number"
                  ? `ETA ${Math.round(suggestion.etaMin)} min`
                  : "ETA NA"}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2 p-3">
        {visibleVisits.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center">
            <CheckCircle2 className="mx-auto h-4 w-4 text-slate-400" />
            <p className="mt-1.5 text-xs text-slate-500">No active visits assigned.</p>
          </div>
        ) : (
          visibleVisits.map((visit) => (
            <div key={visit.id} className="rounded-xl border border-slate-100 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {visit.customerName}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500 capitalize">
                    {visit.typeOfVisit || "visit"}
                  </p>
                </div>
                {renderVisitStatus(visit)}
              </div>

              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                <Clock3 className="h-3.5 w-3.5" />
                {formatVisitDate(visit)}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-lg border-slate-200 px-2 text-[11px]"
                  onClick={() => onViewDetails(visit)}
                >
                  <Eye className="mr-1 h-3 w-3" />
                  Details
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-lg border-slate-200 px-2 text-[11px]"
                  onClick={() => onAssign(visit)}
                >
                  <UserCheck className="mr-1 h-3 w-3" />
                  Assign
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-lg border-slate-200 px-2 text-[11px]"
                  onClick={() => onShare(visit)}
                >
                  <Share2 className="mr-1 h-3 w-3" />
                  Share
                </Button>
              </div>
            </div>
          ))
        )}

        {pendingVisits.length > visibleVisits.length && (
          <p className="px-1 text-[11px] text-slate-500">
            +{pendingVisits.length - visibleVisits.length} more active visits
          </p>
        )}
      </div>
    </Card>
  );
}

