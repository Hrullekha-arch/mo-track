"use client";

import { useEffect, useRef, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";

type TrackingStatus = "DRIVING" | "WORKING" | "IDLE";

type UseInstallerTrackingArgs = {
  enabled: boolean;
  firebaseUser: FirebaseUser | null;
  intervalMs?: number; // default 20000
};

type TrackingState = {
  running: boolean;
  lastStatus: TrackingStatus | null;
  lastPingAt: string | null;
  lastLocation: { lat: number; lng: number; speedKmh?: number | null } | null;
  error: string | null;
};

export function useInstallerTracking({
  enabled,
  firebaseUser,
  intervalMs = 20000,
}: UseInstallerTrackingArgs) {
  const [state, setState] = useState<TrackingState>({
    running: false,
    lastStatus: null,
    lastPingAt: null,
    lastLocation: null,
    error: null,
  });

  const watchIdRef = useRef<number | null>(null);
  const latestPosRef = useRef<GeolocationPosition | null>(null);
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  // Helper: safe setState merge
  const patch = (p: Partial<TrackingState>) =>
    setState((s) => ({ ...s, ...p }));

  useEffect(() => {
    // Stop all tracking when disabled
    if (!enabled || !firebaseUser) {
      patch({ running: false });
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!("geolocation" in navigator)) {
      patch({
        running: false,
        error: "Geolocation not supported on this device/browser.",
      });
      return;
    }

    patch({ running: true, error: null });

    // 1) Start watching GPS continuously (best for movement + background-ish behavior)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestPosRef.current = pos;

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        const speedMps =
          typeof pos.coords.speed === "number" ? pos.coords.speed : null;
        const speedKmh = speedMps != null ? speedMps * 3.6 : null;

        patch({
          lastLocation: { lat, lng, speedKmh },
        });
      },
      (err) => {
        patch({
          error: err?.message || "Unable to access location. Check permissions.",
          running: false,
        });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    // 2) Ping API every interval (only if we have a recent position)
    const sendPing = async () => {
      if (!enabled || !firebaseUser) return;
      if (inFlightRef.current) return;

      const pos = latestPosRef.current;
      if (!pos) return;

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const speed =
        typeof pos.coords.speed === "number" ? pos.coords.speed : null;

      inFlightRef.current = true;

      try {
        const idToken = await firebaseUser.getIdToken(true);

        const res = await fetch("/api/tracking/ping", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            installerId: firebaseUser.uid,
            latitude: lat,
            longitude: lng,
            accuracy: pos.coords.accuracy ?? null,
            speed, // m/s (server converts to km/h)
            timestampMs: Date.now(),
          }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || `Ping failed (${res.status})`);
        }

        patch({
          lastStatus: (data?.status as TrackingStatus) ?? null,
          lastPingAt: new Date().toISOString(),
          error: null,
        });
      } catch (e: any) {
        patch({
          error: e?.message || "Ping error",
        });
      } finally {
        inFlightRef.current = false;
      }
    };

    // Immediate ping once (helps dashboard show quickly)
    sendPing();

    timerRef.current = window.setInterval(sendPing, intervalMs);

    // Cleanup
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      latestPosRef.current = null;
      inFlightRef.current = false;
      patch({ running: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, firebaseUser?.uid, intervalMs]);

  return state;
}
