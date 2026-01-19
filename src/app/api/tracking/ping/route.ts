import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

const SPEED_DRIVING_KMH = 15;
const SPEED_WORKING_MAX_KMH = 3;
const WORKING_MINUTES = 5;
const IDLE_MINUTES = 10;
const MOVE_THRESHOLD_M = 20;
const DEFAULT_GEOFENCE_RADIUS_M = 150;

type GeoPoint = { latitude: number; longitude: number };

const toRadians = (value: number) => (value * Math.PI) / 180;

const haversineDistanceM = (a: GeoPoint, b: GeoPoint) => {
  const earthRadiusM = 6371000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadiusM * c;
};

const kmhFromMps = (speedMps: number) => speedMps * 3.6;

const isoToMs = (value?: string) => (value ? new Date(value).getTime() : 0);

const minutesToMs = (minutes: number) => minutes * 60 * 1000;

// ---- Smart ETA learning helpers ----
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function updateInstallerStatsDelay(installerId: string, delayMinRaw: number, nowIso: string) {
  const statsRef = adminDb.collection("installerStats").doc(installerId);

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(statsRef);
    const prevAvg = Number(snap.data()?.avgDelayMin ?? 0);
    const prevSamples = Number(snap.data()?.samples ?? 0);

    // Delay should never be negative; cap at 20 mins (Day-2 safe)
    const delayMin = clamp(Math.round(delayMinRaw), 0, 20);

    // EMA smoothing: stable, doesn’t jump wildly
    const newAvg =
      prevSamples <= 0
        ? delayMin
        : Math.round(prevAvg * 0.8 + delayMin * 0.2);

    tx.set(
      statsRef,
      {
        installerId,
        avgDelayMin: newAvg,
        samples: prevSamples + 1,
        lastDelayMin: delayMin,
        updatedAt: nowIso,
      },
      { merge: true }
    );
  });
}

export async function POST(request: Request) {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const installerId = String(payload?.installerId || "").trim();
  const latitude = Number(payload?.latitude);
  const longitude = Number(payload?.longitude);
  const accuracy = payload?.accuracy;
  const speed = payload?.speed;

  if (!installerId || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return NextResponse.json(
      { error: "installerId, latitude, and longitude are required." },
      { status: 400 }
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const trackingRef = adminDb.collection("installerTracking").doc(installerId);
  const trackingSnap = await trackingRef.get();
  const trackingData = trackingSnap.exists ? trackingSnap.data() || {} : {};

  const currentLocation: GeoPoint = { latitude, longitude };
  const prevLocation = trackingData.location as GeoPoint | undefined;
  const prevPingAtMs = isoToMs(trackingData.lastPingAt);

  // ---- Speed compute (basic) ----
  let computedSpeedKmh: number | null = null;
  if (typeof speed === "number" && speed >= 0) {
    computedSpeedKmh = kmhFromMps(speed);
  } else if (prevLocation && prevPingAtMs) {
    const deltaSeconds = Math.max((nowMs - prevPingAtMs) / 1000, 1);
    const distanceM = haversineDistanceM(prevLocation, currentLocation);
    computedSpeedKmh = (distanceM / deltaSeconds) * 3.6;
  }

  const movementM =
    prevLocation && prevPingAtMs ? haversineDistanceM(prevLocation, currentLocation) : 0;

  const movedRecently =
    movementM >= MOVE_THRESHOLD_M ||
    (typeof computedSpeedKmh === "number" && computedSpeedKmh >= SPEED_WORKING_MAX_KMH);

  const lastMovementAt = movedRecently
    ? nowIso
    : trackingData.lastMovementAt || trackingData.lastPingAt || nowIso;

  // ---- Visits ----
  let visitDocs: any[] = [];
  try {
    const visitsSnap = await adminDb
      .collectionGroup("visits")
      .where("assignedTo", "==", installerId)
      .get();
    visitDocs = visitsSnap.docs;
  } catch (error) {
    console.error("Tracking ping: failed to query visits", error);
  }

  const visitCandidates = await Promise.all(
    visitDocs.map(async (docSnap) => {
      const visit = docSnap.data() || {};
      if (visit.status === "completed") return null;

      const pathParts = docSnap.ref.path.split("/");
      const customerId = pathParts[1];
      const dealDocId = pathParts[3];

      const geo = visit.geo as GeoPoint | undefined;
      if (!geo?.latitude || !geo?.longitude) return null;

      const distanceM = haversineDistanceM(currentLocation, geo);
      const radiusM = visit.geo?.radiusM || DEFAULT_GEOFENCE_RADIUS_M;

      return {
        id: docSnap.id,
        customerId,
        dealDocId,
        dealId: visit.dealId,
        typeOfVisit: visit.typeOfVisit,
        orderId: visit.orderId,
        geo,
        distanceM,
        radiusM,
      };
    })
  );

  const activeVisits = visitCandidates.filter(Boolean) as Array<{
    id: string;
    customerId: string;
    dealDocId: string;
    dealId?: string;
    typeOfVisit?: string;
    orderId?: string;
    geo: GeoPoint;
    distanceM: number;
    radiusM: number;
  }>;

  activeVisits.sort((a, b) => a.distanceM - b.distanceM);
  const nearestVisit = activeVisits[0] || null;
  const insideVisit =
    nearestVisit && nearestVisit.distanceM <= nearestVisit.radiusM ? nearestVisit : null;

  const prevInGeofenceVisitId = trackingData.inGeofenceVisitId || null;
  const inGeofenceVisitId = insideVisit?.id || null;
  let inGeofenceSince = trackingData.inGeofenceSince || null;

  if (inGeofenceVisitId) {
    if (prevInGeofenceVisitId !== inGeofenceVisitId) {
      inGeofenceSince = nowIso;
    }
  } else {
    inGeofenceSince = null;
  }

  const prevStatus = trackingData.status || "IDLE";
  let nextStatus = prevStatus;

  const isDriving =
    typeof computedSpeedKmh === "number" && computedSpeedKmh > SPEED_DRIVING_KMH;
  const isSlow =
    typeof computedSpeedKmh === "number" && computedSpeedKmh < SPEED_WORKING_MAX_KMH;

  const inGeofenceLongEnough =
    inGeofenceVisitId &&
    isSlow &&
    isoToMs(inGeofenceSince) + minutesToMs(WORKING_MINUTES) <= nowMs;

  const idleCandidate =
    !inGeofenceVisitId &&
    isoToMs(lastMovementAt) + minutesToMs(IDLE_MINUTES) <= nowMs;

  if (isDriving) {
    nextStatus = "DRIVING";
  } else if (inGeofenceLongEnough) {
    nextStatus = "WORKING";
  } else if (idleCandidate) {
    nextStatus = "IDLE";
  }

  const prevVisitId = trackingData.currentVisitId || null;

  const fallbackVisit =
    insideVisit ||
    (activeVisits.length === 1 ? activeVisits[0] : null) ||
    (prevVisitId ? activeVisits.find((visit) => visit.id === prevVisitId) : null);

  const nextVisitId = fallbackVisit ? fallbackVisit.id : null;

  const statusChanged = nextStatus !== prevStatus;
  const workingVisitChanged =
    nextStatus === "WORKING" &&
    prevStatus === "WORKING" &&
    prevVisitId !== nextVisitId;

  let currentStatusEventId = trackingData.currentStatusEventId || null;

  // ---- Status events (existing) ----
  if (statusChanged || workingVisitChanged) {
    if (currentStatusEventId) {
      await trackingRef
        .collection("statusEvents")
        .doc(currentStatusEventId)
        .set({ endedAt: nowIso }, { merge: true });
    }

    const newEventRef = trackingRef.collection("statusEvents").doc();
    await newEventRef.set({
      status: nextStatus,
      startedAt: nowIso,
      visitId: nextVisitId,
      location: currentLocation,
      speedKmh: computedSpeedKmh ?? null,
    });
    currentStatusEventId = newEventRef.id;
  }

  let lastTaskEndAt = trackingData.lastTaskEndAt || null;

  // ---- Visit tracking end (existing) ----
  if (prevStatus === "WORKING" && prevVisitId && (statusChanged || workingVisitChanged)) {
    await adminDb
      .collection("visitTracking")
      .doc(prevVisitId)
      .set(
        {
          visitId: prevVisitId,
          installerId,
          workEndAt: nowIso,
          updatedAt: nowIso,
        },
        { merge: true }
      );
    lastTaskEndAt = nowIso;
  }

  // ---- Visit tracking start + travel (existing) ----
  if (nextStatus === "WORKING" && nextVisitId && (statusChanged || workingVisitChanged)) {
    const visitTrackingRef = adminDb.collection("visitTracking").doc(nextVisitId);
    const visitTrackingSnap = await visitTrackingRef.get();
    const visitTrackingData = visitTrackingSnap.exists ? visitTrackingSnap.data() || {} : {};

    const trackingUpdates: Record<string, any> = {
      visitId: nextVisitId,
      installerId,
      updatedAt: nowIso,
    };

    if (!visitTrackingData.workStartAt) {
      trackingUpdates.workStartAt = nowIso;
    }

    if (lastTaskEndAt && !visitTrackingData.travelStartAt) {
      trackingUpdates.travelStartAt = lastTaskEndAt;
      trackingUpdates.travelEndAt = nowIso;
    } else if (lastTaskEndAt && !visitTrackingData.travelEndAt) {
      trackingUpdates.travelEndAt = nowIso;
    }

    if (insideVisit) {
      trackingUpdates.customerId = insideVisit.customerId;
      trackingUpdates.dealDocId = insideVisit.dealDocId;
      trackingUpdates.orderId = insideVisit.orderId || null;
    }

    await visitTrackingRef.set(trackingUpdates, { merge: true });
  }

  // ✅ SMART ETA LEARNING (NEW)
  // Learn ONLY when entering WORKING (or switching working visit)
  if ((statusChanged || workingVisitChanged) && nextStatus === "WORKING" && nextVisitId) {
    const sugRef = adminDb.collection("jobSuggestions").doc(installerId);
    const sugSnap = await sugRef.get();

    if (sugSnap.exists) {
      const sug = sugSnap.data() as any;
      const recommendedVisitId = sug?.recommendedVisitId || null;

      const computedAtMs = sug?.computedAt ? new Date(sug.computedAt).getTime() : 0;
      const baseEtaMin = Number(sug?.etaMin ?? 0);

      const alreadyConsumed = !!sug?.consumedAt;

      const recentEnough = computedAtMs && nowMs - computedAtMs <= 6 * 60 * 60 * 1000; // last 6 hours

      if (
        !alreadyConsumed &&
        recommendedVisitId &&
        recommendedVisitId === nextVisitId &&
        recentEnough &&
        Number.isFinite(baseEtaMin) &&
        baseEtaMin > 0
      ) {
        const actualArrivalMin = (nowMs - computedAtMs) / 60000;
        const delayMin = actualArrivalMin - baseEtaMin;

        await updateInstallerStatsDelay(installerId, delayMin, nowIso);
        


        // mark suggestion consumed (prevents double learning)
        await sugRef.set(
          {
            consumedAt: nowIso,
            consumedVisitId: nextVisitId,
            consumedBy: "WORKING_MATCH",
            actualArrivalMin: Math.round(actualArrivalMin),
            learnedDelayMin: clamp(Math.round(delayMin), 0, 20),
          },
          { merge: true }
        );

        // Save delay per visit for today's counters
        await adminDb.collection("visitTracking").doc(nextVisitId).set(
          {
            visitId: nextVisitId,
            installerId,
            delayMin: clamp(Math.round(delayMin), 0, 20),
            delayUpdatedAt: nowIso,
          },
          { merge: true }
        );
      }
    }
  }

  const nextStatusSince = statusChanged ? nowIso : trackingData.statusSince || nowIso;

  // ---- Save installerTracking doc ----
  await trackingRef.set(
    {
      installerId,
      status: nextStatus,
      statusSince: nextStatusSince,
      lastPingAt: nowIso,
      location: currentLocation,
      accuracyM: typeof accuracy === "number" ? accuracy : null,
      speedKmh: computedSpeedKmh ?? null,
      lastMovementAt,
      inGeofenceVisitId,
      inGeofenceSince,
      currentVisitId: nextVisitId,
      currentCustomerId: fallbackVisit?.customerId || trackingData.currentCustomerId || null,
      currentDealDocId: fallbackVisit?.dealDocId || trackingData.currentDealDocId || null,
      currentVisitType: fallbackVisit?.typeOfVisit || trackingData.currentVisitType || null,
      currentStatusEventId,
      lastTaskEndAt,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  return NextResponse.json({
    success: true,
    status: nextStatus,
    currentVisitId: nextVisitId,
  });
}
