"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import InstallerLiveMap from "@/components/features/visits/InstallerLiveMap";
import { cn } from "@/lib/utils";
import {
  InstallerTracking,
  EnrichedDealVisit,
  InstallerMapMarker,
  InstallerMapMarkerStatus,
} from "@/types/visits";
import { User } from "@/lib/types";
import { resolvePresenceStatus, pingToMs } from "@/lib/visits/trackingUtils";
import DeviceHealthMonitor from "../DeviceHealthMonitor";

const statusAppearance: Record<
  InstallerMapMarkerStatus,
  { label: string; dot: string; badge: string; text: string }
> = {
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

interface LiveMapTabProps {
  tracking: InstallerTracking[];
  trackingLoading: boolean;
  installers: User[];
  visits: EnrichedDealVisit[];
}

export default function LiveMapTab({
  tracking,
  trackingLoading,
  installers,
  visits,
}: LiveMapTabProps) {
  const [clockNow, setClockNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const trackingByInstaller = React.useMemo(() => {
    const map = new Map<string, InstallerTracking>();
    tracking.forEach((d) => {
      const k = d.installerId || d.id;
      map.set(k, { ...d, installerId: k, id: d.id || k });
    });
    return map;
  }, [tracking]);

  const visitsById = React.useMemo(() => {
    const map = new Map<string, EnrichedDealVisit>();
    visits.forEach((v) => map.set(v.id, v));
    return map;
  }, [visits]);

  const groupedVisits = React.useMemo(() => {
    const map = new Map<string, EnrichedDealVisit[]>();
    installers.forEach((i) => map.set(i.id, []));
    visits.forEach((v) => {
      if (v.assignedTo) {
        if (!map.has(v.assignedTo)) map.set(v.assignedTo, []);
        map.get(v.assignedTo)!.push(v);
      }
    });
    return map;
  }, [visits, installers]);

  const completedTodayByInstaller = React.useMemo(() => {
    const map = new Map<string, number>();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    visits.forEach((v) => {
      if (!v.assignedTo || v.status !== "completed" || !v.visitEndTime) return;
      const t = new Date(v.visitEndTime);
      if (!isNaN(t.getTime()) && t >= todayStart) {
        map.set(v.assignedTo, (map.get(v.assignedTo) || 0) + 1);
      }
    });
    return map;
  }, [visits]);

  const liveInstallerRows = React.useMemo(() => {
    return installers.map((installer) => {
      const trackingDoc = trackingByInstaller.get(installer.id);
      const presence = resolvePresenceStatus(trackingDoc, clockNow);
      const currentVisit = trackingDoc?.currentVisitId
        ? visitsById.get(trackingDoc.currentVisitId)
        : null;
      const assignedVisits = groupedVisits.get(installer.id) || [];
      const activeVisit =
        currentVisit ||
        assignedVisits.find((visit) => visit.status !== "completed");

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
        speedKmh:
          typeof trackingDoc?.speedKmh === "number"
            ? Math.round(trackingDoc.speedKmh)
            : null,
        lastPingAt: trackingDoc?.lastPingAt || null,
        completedToday: completedTodayByInstaller.get(installer.id) || 0,
      };
    });
  }, [
    installers,
    trackingByInstaller,
    clockNow,
    visitsById,
    groupedVisits,
    completedTodayByInstaller,
  ]);

  const liveMapMarkers = React.useMemo<InstallerMapMarker[]>(() => {
    return liveInstallerRows
      .filter(
        (row) =>
          typeof row.trackingDoc?.location?.latitude === "number" &&
          typeof row.trackingDoc?.location?.longitude === "number"
      )
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
      { DRIVING: 0, IDLE: 0, OFFLINE: 0 } as Record<
        InstallerMapMarkerStatus,
        number
      >
    );
  }, [liveInstallerRows]);

  if (trackingLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      <Card className="xl:col-span-8 overflow-hidden border-slate-200 shadow-sm">
        <div className="border-b border-slate-100 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Installer Live Map
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Real-time markers from Firestore `installerTracking`
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(["DRIVING", "IDLE", "OFFLINE"] as InstallerMapMarkerStatus[]).map(
              (status) => {
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
              }
            )}
          </div>
        </div>
        <div className="p-4">
          <InstallerLiveMap markers={liveMapMarkers} />
        </div>
      </Card>

      <Card className="xl:col-span-4 border-slate-200 shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Device Health Monitoring
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Battery, network, GPS accuracy, app state, and ping freshness
          </p>
        </div>
        <div className="max-h-[510px] overflow-y-auto p-3">
          <DeviceHealthMonitor
            installerRows={liveInstallerRows}
            clockNow={clockNow}
          />
        </div>
      </Card>
    </div>
  );
}