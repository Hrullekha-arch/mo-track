"use client";

import * as React from "react";

export type InstallerMapMarkerStatus = "DRIVING" | "IDLE" | "OFFLINE";

export interface InstallerMapMarker {
  id: string;
  name: string;
  status: InstallerMapMarkerStatus;
  latitude: number;
  longitude: number;
  speedKmh?: number | null;
  batteryLevel?: number | null;
  networkType?: string | null;
  gpsAccuracy?: number | null;
  appState?: string | null;
  lastPingAt?: string | null;
  currentTask?: string | null;
}

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletLayerGroup = import("leaflet").LayerGroup;

const DEFAULT_CENTER: [number, number] = [28.6139, 77.209];

const STATUS_STYLE: Record<InstallerMapMarkerStatus, { label: string; color: string; glow: string }> = {
  DRIVING: { label: "Driving", color: "#16a34a", glow: "rgba(22,163,74,0.32)" },
  IDLE: { label: "Idle", color: "#f59e0b", glow: "rgba(245,158,11,0.35)" },
  OFFLINE: { label: "Offline", color: "#ef4444", glow: "rgba(239,68,68,0.3)" },
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatLastPingLabel = (value?: string | null) => {
  if (!value) return "No ping";
  const pingMs = new Date(value).getTime();
  if (Number.isNaN(pingMs)) return "No ping";
  const diffSec = Math.max(0, Math.round((Date.now() - pingMs) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const toHealthValue = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return "N/A";
  return String(value);
};

const buildPopupHtml = (marker: InstallerMapMarker) => {
  const statusStyle = STATUS_STYLE[marker.status];
  const speed =
    typeof marker.speedKmh === "number" && Number.isFinite(marker.speedKmh)
      ? `${Math.round(marker.speedKmh)} km/h`
      : "N/A";
  const battery =
    typeof marker.batteryLevel === "number" && Number.isFinite(marker.batteryLevel)
      ? `${Math.max(0, Math.min(100, Math.round(marker.batteryLevel)))}%`
      : "N/A";
  const gpsAccuracy =
    typeof marker.gpsAccuracy === "number" && Number.isFinite(marker.gpsAccuracy)
      ? `${Math.round(marker.gpsAccuracy)}m`
      : "N/A";

  const rows = [
    ["Status", statusStyle.label],
    ["Speed", speed],
    ["Battery", battery],
    ["Network", toHealthValue(marker.networkType)],
    ["GPS", gpsAccuracy],
    ["App", toHealthValue(marker.appState)],
    ["Last ping", formatLastPingLabel(marker.lastPingAt)],
    ["Task", toHealthValue(marker.currentTask)],
  ];

  return `
    <div style="min-width:220px;font-family:Inter,Segoe UI,sans-serif;">
      <div style="font-weight:700;color:#0f172a;margin-bottom:8px;">${escapeHtml(marker.name)}</div>
      ${rows
        .map(
          ([label, value]) => `
          <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:4px;font-size:12px;">
            <span style="color:#64748b;">${escapeHtml(label)}</span>
            <span style="color:#0f172a;font-weight:600;text-align:right;">${escapeHtml(value)}</span>
          </div>`
        )
        .join("")}
    </div>
  `;
};

export default function InstallerLiveMap({ markers }: { markers: InstallerMapMarker[] }) {
  const mapContainerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<LeafletMap | null>(null);
  const markersLayerRef = React.useRef<LeafletLayerGroup | null>(null);
  const leafletRef = React.useRef<LeafletModule | null>(null);

  React.useEffect(() => {
    let active = true;

    const initMap = async () => {
      const L = await import("leaflet");
      if (!active || !mapContainerRef.current || mapRef.current) return;

      leafletRef.current = L;
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      map.setView(DEFAULT_CENTER, 11);
    };

    void initMap();

    return () => {
      active = false;
      markersLayerRef.current?.clearLayers();
      markersLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const markerLayer = markersLayerRef.current;
    if (!L || !map || !markerLayer) return;

    markerLayer.clearLayers();
    if (!markers.length) {
      map.setView(DEFAULT_CENTER, 11);
      return;
    }

    const bounds = L.latLngBounds([]);
    let activeCallout: import("leaflet").Marker | null = null;

    const clearActiveCallout = () => {
      if (!activeCallout) return;
      markerLayer.removeLayer(activeCallout);
      activeCallout = null;
    };

    markers.forEach((marker) => {
      const statusStyle = STATUS_STYLE[marker.status];
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:9999px;background:${statusStyle.color};border:2px solid #ffffff;box-shadow:0 0 0 8px ${statusStyle.glow};"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const mapMarker = L.marker([marker.latitude, marker.longitude], {
        icon,
        title: marker.name,
      });

      const showCallout = () => {
        clearActiveCallout();
        const labelWidth = Math.max(92, Math.min(230, marker.name.length * 7 + 18));
        const calloutIcon = L.divIcon({
          className: "",
          html: `<div style="display:flex;align-items:center;transform:translateY(-16px);pointer-events:none;">
            <span style="display:inline-block;width:34px;height:2px;background:#111827;"></span>
            <span style="margin-left:6px;max-width:${labelWidth}px;padding:2px 8px;border-radius:9999px;border:1px solid #111827;background:#ffffff;font:600 11px Inter,Segoe UI,sans-serif;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(marker.name)}</span>
          </div>`,
          iconSize: [labelWidth + 46, 32],
          iconAnchor: [0, 16],
        });

        activeCallout = L.marker([marker.latitude, marker.longitude], {
          icon: calloutIcon,
          interactive: false,
          keyboard: false,
          zIndexOffset: 1500,
        }).addTo(markerLayer);
      };

      mapMarker.bindPopup(buildPopupHtml(marker));
      mapMarker.on("mouseover", showCallout);
      mapMarker.on("click", showCallout);
      mapMarker.on("mouseout", () => {
        if (!mapMarker.isPopupOpen()) clearActiveCallout();
      });
      mapMarker.on("popupclose", clearActiveCallout);
      mapMarker.addTo(markerLayer);
      bounds.extend([marker.latitude, marker.longitude]);
    });

    map.on("click", clearActiveCallout);

    if (markers.length === 1) {
      map.setView(bounds.getCenter(), 14);
    } else {
      map.fitBounds(bounds.pad(0.2), { animate: false });
    }

    return () => {
      map.off("click", clearActiveCallout);
      clearActiveCallout();
    };
  }, [markers]);

  React.useEffect(() => {
    if (!mapRef.current) return;
    const t = window.setTimeout(() => mapRef.current?.invalidateSize(), 30);
    return () => window.clearTimeout(t);
  }, [markers.length]);

  return (
    <div className="relative z-0 isolate h-[430px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 [&_.leaflet-control-container]:!z-[2] [&_.leaflet-pane]:!z-[1]">
      <div ref={mapContainerRef} className="h-full w-full" />
      {!markers.length && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100/70 text-sm text-slate-500">
          No live installer locations available
        </div>
      )}
    </div>
  );
}
