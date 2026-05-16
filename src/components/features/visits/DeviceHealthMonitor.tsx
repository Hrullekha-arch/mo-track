"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatLastPingAgo } from "@/lib/visits/trackingUtils";
import { InstallerMapMarkerStatus } from "@/types/visits";

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

interface InstallerRow {
  installer: {
    id: string;
    name: string;
  };
  trackingDoc?: {
    location?: {
      latitude: number;
      longitude: number;
    };
  };
  presence: InstallerMapMarkerStatus;
  taskLabel: string;
  batteryLevel: number | null;
  gpsAccuracy: number | null;
  networkType: string | null;
  appState: string | null;
  deviceModel: string | null;
  speedKmh: number | null;
  lastPingAt: string | null;
  completedToday: number;
}

interface DeviceHealthMonitorProps {
  installerRows: InstallerRow[];
  clockNow: number;
}

export default function DeviceHealthMonitor({
  installerRows,
  clockNow,
}: DeviceHealthMonitorProps) {
  return (
    <div className="space-y-2.5">
      {installerRows.map((row) => {
        const style = statusAppearance[row.presence];
        const pingAgo = formatLastPingAgo(row.lastPingAt || undefined, clockNow);
        const speedLabel = row.speedKmh != null ? `${row.speedKmh} km/h` : "N/A";
        const batteryLabel =
          row.batteryLevel != null ? `${row.batteryLevel}%` : "N/A";
        const gpsLabel = row.gpsAccuracy != null ? `${row.gpsAccuracy}m` : "N/A";
        const mapsUrl =
          typeof row.trackingDoc?.location?.latitude === "number" &&
          typeof row.trackingDoc?.location?.longitude === "number"
            ? `https://www.google.com/maps?q=${row.trackingDoc.location.latitude},${row.trackingDoc.location.longitude}`
            : null;

        return (
          <div
            key={row.installer.id}
            className="rounded-xl border border-slate-200 bg-white p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {row.installer.name}
                </p>
                <p className="text-xs text-slate-500 truncate">{row.taskLabel}</p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  style.badge,
                  style.text
                )}
              >
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
                <p className="font-semibold text-slate-900 uppercase">
                  {row.networkType || "N/A"}
                </p>
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
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-indigo-600 hover:text-indigo-800"
                >
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
  );
}