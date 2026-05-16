import { InstallerTracking, InstallerMapMarkerStatus } from "@/types/visits";

const OFFLINE_AFTER_MS = 60 * 1000;

export const asFiniteNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export const toIsoString = (value: unknown): string | undefined => {
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

    const seconds = asFiniteNumber(
      maybeTimestamp.seconds ?? maybeTimestamp._seconds
    );
    if (seconds != null) {
      const nanos =
        asFiniteNumber(
          maybeTimestamp.nanoseconds ?? maybeTimestamp._nanoseconds
        ) ?? 0;
      const ms = Math.round(seconds * 1000 + nanos / 1_000_000);
      return new Date(ms).toISOString();
    }
  }

  return undefined;
};

export const pingToMs = (value?: unknown) => {
  const iso = toIsoString(value);
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

export const pickLatestIso = (...values: unknown[]) => {
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

export const normalizeTrackingDoc = (
  docId: string,
  rawData: any
): InstallerTracking => {
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
      lat != null && lng != null ? { latitude: lat, longitude: lng } : undefined,
    lastPingAt: latestPingIso,
    updatedAt: latestUpdatedIso,
    speedKmh: asFiniteNumber(raw?.speedKmh ?? raw?.location?.speedKmh),
    currentVisitId:
      raw?.currentVisitId || raw?.visit?.currentVisitId || undefined,
    batteryLevel:
      asFiniteNumber(raw?.batteryLevel ?? raw?.device?.batteryLevel) ?? null,
    networkType: networkTypeRaw == null ? null : String(networkTypeRaw),
    gpsAccuracy:
      asFiniteNumber(raw?.gpsAccuracy ?? raw?.location?.accuracyM) ?? null,
    appState: appStateRaw == null ? null : String(appStateRaw),
    accuracyM: asFiniteNumber(raw?.accuracyM ?? raw?.location?.accuracyM) ?? null,
    deviceModel: deviceModelRaw == null ? null : String(deviceModelRaw),
  };
};

export const resolvePresenceStatus = (
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

export const formatLastPingAgo = (
  value?: unknown,
  nowMs: number = Date.now()
) => {
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