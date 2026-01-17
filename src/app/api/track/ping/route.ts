import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { haversineDistanceMeters, isInsideRadius } from "@/lib/geo";

type Status = "DRIVING" | "WORKING" | "IDLE";

type PingBody = {
  lat: number;
  lng: number;
  speed?: number | null; // m/s (browser)
  accuracy?: number | null; // meters
  timestampMs?: number;
};

const INSTALLER_LIVE = "installer_live";
const STATUS_EVENTS = "status_events";
const LOCATION_PINGS = "location_pings";

// Day-1 rules
const DRIVING_KMH = 15;
const WORKING_SPEED_KMH = 3;
const WORKING_MIN_MS = 5 * 60 * 1000;
const IDLE_MIN_MS = 10 * 60 * 1000;

// Noise / reliability controls
const STATIONARY_DISTANCE_M = 15;
const MAX_REASONABLE_KMH = 120;
const ACCURACY_BAD_M = 40;
const MIN_TIME_DELTA_S = 5;

function toKmh(speedMps?: number | null): number {
  if (speedMps == null || !Number.isFinite(speedMps)) return 0;
  return speedMps * 3.6;
}

function safeNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function requireBearer(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

async function getActiveVisitGeofence(
  installerId: string
): Promise<
  | { taskId: string; geofence: { lat: number; lng: number; radiusM: number } }
  | null
> {
  console.log(`[GEOFENCE] 🔍 Searching for active visit for installer: ${installerId}`);
  
  const snap = await adminDb
    .collectionGroup("visits")
    .where("assignedTo", "==", installerId)
    .where("visitStatus", "==", "Working")
    .limit(1)
    .get();

  if (snap.empty) {
    console.log(`[GEOFENCE] ❌ No active visits found`);
    return null;
  }

  const doc = snap.docs[0];
  const data = doc.data() as any;

  const lat = safeNum(data?.geofenceLat);
  const lng = safeNum(data?.geofenceLng);
  const radiusM = safeNum(data?.geofenceRadiusM) ?? 150;

  console.log(`[GEOFENCE] 📍 Found active visit:`, {
    taskId: doc.id,
    geofenceLat: lat,
    geofenceLng: lng,
    radiusM,
  });

  if (lat == null || lng == null) {
    console.log(`[GEOFENCE] ⚠️ Invalid geofence coordinates, skipping`);
    return null;
  }

  return { taskId: doc.id, geofence: { lat, lng, radiusM } };
}

function decideStatus(args: {
  speedKmh: number;
  insideJob: boolean;
  insideSinceMs: number | null;
  stationarySinceMs: number | null;
  nowMs: number;
}): { status: Status; insideSinceMs: number | null } {
  const { speedKmh, insideJob, insideSinceMs, stationarySinceMs, nowMs } = args;

  console.log(`[STATUS DECISION] 🎯 Input parameters:`, {
    speedKmh: speedKmh.toFixed(2),
    insideJob,
    insideSinceMs,
    stationarySinceMs,
    nowMs,
  });

  // Rule 1: Driving check
  console.log(`[STATUS DECISION] 📏 Rule 1 - Checking if driving (speed > ${DRIVING_KMH} km/h)`);
  if (speedKmh > DRIVING_KMH) {
    console.log(`[STATUS DECISION] ✅ DRIVING detected (${speedKmh.toFixed(2)} km/h)`);
    return {
      status: "DRIVING",
      insideSinceMs: insideJob ? insideSinceMs ?? nowMs : null,
    };
  }
  console.log(`[STATUS DECISION] ⏭️ Not driving, continuing...`);

  // Track inside-geofence duration
  let nextInsideSince = insideSinceMs;
  if (insideJob) {
    nextInsideSince = insideSinceMs ?? nowMs;
    console.log(`[STATUS DECISION] 📍 Inside geofence - tracking duration since: ${nextInsideSince}`);
  } else {
    nextInsideSince = null;
    console.log(`[STATUS DECISION] 🚫 Outside geofence - resetting duration`);
  }

  // Rule 2: Working check
  console.log(`[STATUS DECISION] 📏 Rule 2 - Checking if working`);
  if (insideJob && speedKmh < WORKING_SPEED_KMH && nextInsideSince) {
    const durationMs = nowMs - nextInsideSince;
    const durationMinutes = (durationMs / 60000).toFixed(1);
    const requiredMinutes = (WORKING_MIN_MS / 60000).toFixed(0);
    
    console.log(`[STATUS DECISION] ⏱️ Inside job, slow speed (${speedKmh.toFixed(2)} km/h < ${WORKING_SPEED_KMH} km/h)`);
    console.log(`[STATUS DECISION] ⏱️ Duration: ${durationMinutes}m / ${requiredMinutes}m required`);
    
    if (durationMs >= WORKING_MIN_MS) {
      console.log(`[STATUS DECISION] ✅ WORKING detected - duration threshold met`);
      return { status: "WORKING", insideSinceMs: nextInsideSince };
    }
    console.log(`[STATUS DECISION] ⏳ Not enough time yet to consider WORKING`);
  } else {
    console.log(`[STATUS DECISION] ⏭️ Working conditions not met:`, {
      insideJob,
      speedCheck: speedKmh < WORKING_SPEED_KMH,
      hasInsideSince: !!nextInsideSince,
    });
  }

  // Rule 3: Idle check
  console.log(`[STATUS DECISION] 📏 Rule 3 - Checking if idle`);
  if (!insideJob && stationarySinceMs) {
    const stationaryDurationMs = nowMs - stationarySinceMs;
    const stationaryMinutes = (stationaryDurationMs / 60000).toFixed(1);
    const requiredMinutes = (IDLE_MIN_MS / 60000).toFixed(0);
    
    console.log(`[STATUS DECISION] 🛑 Outside job and stationary`);
    console.log(`[STATUS DECISION] ⏱️ Stationary duration: ${stationaryMinutes}m / ${requiredMinutes}m required`);
    
    if (stationaryDurationMs >= IDLE_MIN_MS) {
      console.log(`[STATUS DECISION] ✅ IDLE detected - stationary threshold met`);
      return { status: "IDLE", insideSinceMs: null };
    }
    console.log(`[STATUS DECISION] ⏳ Not stationary long enough for IDLE`);
  } else {
    console.log(`[STATUS DECISION] ⏭️ Idle conditions not met:`, {
      outsideJob: !insideJob,
      hasStationarySince: !!stationarySinceMs,
    });
  }

  console.log(`[STATUS DECISION] 🔄 Defaulting to IDLE status`);
  return { status: "IDLE", insideSinceMs: nextInsideSince };
}

export async function POST(req: Request) {
  const requestStartTime = Date.now();
  console.log(`\n${"=".repeat(80)}`);
  console.log(`[REQUEST START] 🚀 New location ping received at ${new Date().toISOString()}`);
  console.log(`${"=".repeat(80)}\n`);

  try {
    // Step 1: Authentication
    console.log(`[STEP 1] 🔐 Authenticating request...`);
    const token = requireBearer(req);
    if (!token) {
      console.log(`[AUTH] ❌ No bearer token found in request headers`);
      return NextResponse.json(
        { success: false, error: "Missing bearer token" },
        { status: 401 }
      );
    }
    console.log(`[AUTH] ✅ Bearer token found, verifying...`);

    const decoded = await adminAuth.verifyIdToken(token);
    const installerId = decoded.uid;
    console.log(`[AUTH] ✅ Token verified successfully for installer: ${installerId}`);

    // Step 2: Parse and validate request body
    console.log(`\n[STEP 2] 📦 Parsing request body...`);
    const body = (await req.json()) as PingBody;
    console.log(`[BODY] Raw data:`, {
      lat: body.lat,
      lng: body.lng,
      speed: body.speed,
      accuracy: body.accuracy,
      timestampMs: body.timestampMs,
    });

    const lat = safeNum(body.lat);
    const lng = safeNum(body.lng);
    
    if (lat == null || lng == null) {
      console.log(`[VALIDATION] ❌ Invalid coordinates:`, { lat, lng });
      return NextResponse.json(
        { success: false, error: "Invalid lat/lng" },
        { status: 400 }
      );
    }
    console.log(`[VALIDATION] ✅ Valid coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);

    const now = Date.now();

    // Step 3: Retrieve previous state
    console.log(`\n[STEP 3] 📂 Retrieving previous state from database...`);
    const liveRef = adminDb.collection(INSTALLER_LIVE).doc(installerId);
    const liveSnap = await liveRef.get();
    const prev = liveSnap.exists ? (liveSnap.data() as any) : null;

    if (!prev) {
      console.log(`[PREV STATE] 🆕 No previous state found - this is the first ping`);
    } else {
      console.log(`[PREV STATE] 📋 Previous state retrieved:`, {
        lat: prev.lat,
        lng: prev.lng,
        status: prev.status,
        speedKmh: prev.speedKmh,
        updatedAt: prev.updatedAt,
        stationarySinceMs: prev.stationarySinceMs,
        insideSinceMs: prev.insideSinceMs,
      });
    }

    const prevLat = safeNum(prev?.lat);
    const prevLng = safeNum(prev?.lng);
    const prevStatus: Status = (prev?.status as Status) ?? "IDLE";
    const prevStationarySinceMs = safeNum(prev?.stationarySinceMs);
    const prevInsideSinceMs = safeNum(prev?.insideSinceMs);
    const prevUpdatedAt = prev?.updatedAt;
    const prevUpdatedAtMs =
      typeof prevUpdatedAt === "string" ? new Date(prevUpdatedAt).getTime() : null;

    // Step 4: Calculate distance from previous location
    console.log(`\n[STEP 4] 📐 Calculating distance from previous location...`);
    let stationarySinceMs: number | null = prevStationarySinceMs;
    let distFromPrevM = 0;

    if (prevLat != null && prevLng != null) {
      distFromPrevM = haversineDistanceMeters(
        { lat: prevLat, lng: prevLng },
        { lat, lng }
      );
      console.log(`[DISTANCE] 📏 Moved ${distFromPrevM.toFixed(2)}m from previous location`);
      
      if (distFromPrevM <= STATIONARY_DISTANCE_M) {
        stationarySinceMs = stationarySinceMs ?? now;
        console.log(`[DISTANCE] 🛑 Considered stationary (≤${STATIONARY_DISTANCE_M}m)`);
        console.log(`[DISTANCE] ⏱️ Stationary since: ${new Date(stationarySinceMs).toISOString()}`);
      } else {
        stationarySinceMs = null;
        console.log(`[DISTANCE] 🚶 Movement detected (>${STATIONARY_DISTANCE_M}m) - resetting stationary timer`);
      }
    } else {
      console.log(`[DISTANCE] ⚠️ No previous location to compare`);
      stationarySinceMs = null;
    }

    // Step 5: Calculate speed from distance/time
    console.log(`\n[STEP 5] 🧮 Calculating speed from distance and time...`);
    let calcSpeedKmh = 0;
    const dtS =
      prevUpdatedAtMs != null ? Math.max((now - prevUpdatedAtMs) / 1000, 0) : 0;

    if (prevLat != null && prevLng != null && dtS >= MIN_TIME_DELTA_S) {
      calcSpeedKmh = (distFromPrevM / dtS) * 3.6;
      console.log(`[CALC SPEED] ⏱️ Time delta: ${dtS.toFixed(1)}s`);
      console.log(`[CALC SPEED] 🧮 Calculated: ${distFromPrevM.toFixed(2)}m / ${dtS.toFixed(1)}s = ${calcSpeedKmh.toFixed(2)} km/h`);
    } else {
      console.log(`[CALC SPEED] ⚠️ Insufficient data for calculation:`, {
        hasPrevLocation: prevLat != null && prevLng != null,
        timeDelta: dtS,
        minRequired: MIN_TIME_DELTA_S,
      });
    }

    if (!Number.isFinite(calcSpeedKmh) || calcSpeedKmh < 0) {
      console.log(`[CALC SPEED] 🔧 Invalid calculated speed, resetting to 0`);
      calcSpeedKmh = 0;
    }
    
    if (calcSpeedKmh > MAX_REASONABLE_KMH) {
      console.log(`[CALC SPEED] ⚠️ Speed too high (${calcSpeedKmh.toFixed(2)} km/h), capping at ${MAX_REASONABLE_KMH} km/h`);
      calcSpeedKmh = MAX_REASONABLE_KMH;
    }

    // Step 6: Get GPS speed
    console.log(`\n[STEP 6] 📡 Processing GPS speed...`);
    const gpsSpeedKmh = toKmh(body.speed);
    console.log(`[GPS SPEED] 📡 Raw GPS: ${body.speed} m/s → ${gpsSpeedKmh.toFixed(2)} km/h`);

    // Step 7: Get accuracy
    const accuracyM = safeNum(body.accuracy);
    console.log(`[GPS ACCURACY] 🎯 Accuracy: ${accuracyM != null ? accuracyM.toFixed(1) + 'm' : 'N/A'}`);

    // Step 8: Choose speed source
    console.log(`\n[STEP 8] 🤔 Determining which speed source to use...`);
    let speedKmh = gpsSpeedKmh;
    let usedSpeedSource: "GPS" | "CALC" = "GPS";

    const shouldUseCalc =
      gpsSpeedKmh === 0 ||
      (accuracyM != null && accuracyM > ACCURACY_BAD_M) ||
      (calcSpeedKmh > 0 && Math.abs(gpsSpeedKmh - calcSpeedKmh) > 20);

    console.log(`[SPEED SOURCE] 🔍 Evaluation:`, {
      gpsSpeedZero: gpsSpeedKmh === 0,
      accuracyBad: accuracyM != null && accuracyM > ACCURACY_BAD_M,
      speedDifferenceHigh:
        calcSpeedKmh > 0 && Math.abs(gpsSpeedKmh - calcSpeedKmh) > 20,
      speedDifference: Math.abs(gpsSpeedKmh - calcSpeedKmh).toFixed(2),
    });

    if (shouldUseCalc) {
      speedKmh = calcSpeedKmh;
      usedSpeedSource = "CALC";
      console.log(`[SPEED SOURCE] ✅ Using CALCULATED speed: ${speedKmh.toFixed(2)} km/h`);
    } else {
      console.log(`[SPEED SOURCE] ✅ Using GPS speed: ${speedKmh.toFixed(2)} km/h`);
    }

    // Extra drift killer
    if (calcSpeedKmh < 2) {
      console.log(`[SPEED SOURCE] 🛑 Drift killer: calculated speed very low (${calcSpeedKmh.toFixed(2)} km/h), forcing to 0`);
      speedKmh = 0;
      usedSpeedSource = "CALC";
    }

    console.log(`[SPEED SOURCE] 🎯 Final speed decision: ${speedKmh.toFixed(2)} km/h (${usedSpeedSource})`);

    // Step 9: Check geofence
    console.log(`\n[STEP 9] 🗺️ Checking geofence status...`);
    const active = await getActiveVisitGeofence(installerId);
    
    let insideJob = false;
    if (active) {
      insideJob = isInsideRadius(
        { lat, lng },
        { lat: active.geofence.lat, lng: active.geofence.lng },
        active.geofence.radiusM
      );
      
      const distToJobM = haversineDistanceMeters(
        { lat, lng },
        { lat: active.geofence.lat, lng: active.geofence.lng }
      );
      
      console.log(`[GEOFENCE] 📍 Current location: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      console.log(`[GEOFENCE] 🏢 Job location: ${active.geofence.lat.toFixed(6)}, ${active.geofence.lng.toFixed(6)}`);
      console.log(`[GEOFENCE] 📏 Distance to job: ${distToJobM.toFixed(2)}m (radius: ${active.geofence.radiusM}m)`);
      console.log(`[GEOFENCE] ${insideJob ? '✅ INSIDE' : '❌ OUTSIDE'} geofence`);
    } else {
      console.log(`[GEOFENCE] ℹ️ No active job geofence`);
    }

    // Step 10: Decide status
    console.log(`\n[STEP 10] 🎯 Determining worker status...`);
    const decided = decideStatus({
      speedKmh,
      insideJob,
      insideSinceMs: prevInsideSinceMs,
      stationarySinceMs,
      nowMs: now,
    });

    const status: Status = decided.status;
    console.log(`[STATUS] 🏁 Final status determined: ${status}`);
    
    if (status !== prevStatus) {
      console.log(`[STATUS] 🔄 Status changed from ${prevStatus} → ${status}`);
    } else {
      console.log(`[STATUS] ➡️ Status unchanged: ${status}`);
    }

    // Step 11: Prepare database operations
    console.log(`\n[STEP 11] 💾 Preparing database operations...`);
    const batch = adminDb.batch();

    // Log ping
    console.log(`[DB] 📝 Adding location ping to log collection`);
    batch.set(adminDb.collection(LOCATION_PINGS).doc(), {
      installerId,
      lat,
      lng,
      gpsSpeedKmh,
      calcSpeedKmh,
      speedKmh,
      usedSpeedSource,
      accuracyM,
      distFromPrevM,
      dtS,
      createdAt: new Date(now).toISOString(),
    });

    // Update live doc
    console.log(`[DB] 🔄 Updating live installer document`);
    const liveUpdate = {
      installerId,
      lat,
      lng,
      speedKmh,
      gpsSpeedKmh,
      calcSpeedKmh,
      usedSpeedSource,
      accuracyM,
      status,
      currentTaskId: active?.taskId ?? null,
      insideJob,
      insideSinceMs: decided.insideSinceMs,
      stationarySinceMs,
      updatedAt: new Date(now).toISOString(),
    };
    console.log(`[DB] 📋 Live update data:`, liveUpdate);
    
    batch.set(liveRef, liveUpdate, { merge: true });

    // Handle status change events
    if (status !== prevStatus) {
      console.log(`[DB] 📊 Processing status change event...`);
      
      const openEventSnap = await adminDb
        .collection(STATUS_EVENTS)
        .where("installerId", "==", installerId)
        .where("endTime", "==", null)
        .limit(1)
        .get();

      if (!openEventSnap.empty) {
        console.log(`[DB] 🔚 Closing previous status event: ${openEventSnap.docs[0].id}`);
        batch.update(openEventSnap.docs[0].ref, {
          endTime: new Date(now).toISOString(),
        });
      }

      const newEvent = {
        installerId,
        taskId: active?.taskId ?? null,
        status,
        startTime: new Date(now).toISOString(),
        endTime: null,
        createdAt: new Date(now).toISOString(),
      };
      console.log(`[DB] 🆕 Creating new status event:`, newEvent);
      batch.set(adminDb.collection(STATUS_EVENTS).doc(), newEvent);
    } else {
      console.log(`[DB] ℹ️ No status change, skipping event creation`);
    }

    // Step 12: Commit to database
    console.log(`\n[STEP 12] 💾 Committing to database...`);
    await batch.commit();
    console.log(`[DB] ✅ All database operations committed successfully`);

    // Step 13: Send response
    const processingTimeMs = Date.now() - requestStartTime;
    console.log(`\n[STEP 13] 📤 Sending response...`);
    const response = {
      success: true,
      status,
      insideJob,
      currentTaskId: active?.taskId ?? null,
      speedKmh,
      gpsSpeedKmh,
      calcSpeedKmh,
      usedSpeedSource,
      accuracyM,
    };
    console.log(`[RESPONSE] 📋 Response data:`, response);
    console.log(`[RESPONSE] ⏱️ Total processing time: ${processingTimeMs}ms`);

    console.log(`\n${"=".repeat(80)}`);
    console.log(`[REQUEST END] ✅ Request completed successfully`);
    console.log(`${"=".repeat(80)}\n`);

    return NextResponse.json(response);
  } catch (error: any) {
    const processingTimeMs = Date.now() - requestStartTime;
    console.error(`\n${"=".repeat(80)}`);
    console.error(`[ERROR] ❌ Request failed after ${processingTimeMs}ms`);
    console.error(`[ERROR] 💥 Error details:`, {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    console.error(`${"=".repeat(80)}\n`);

    return NextResponse.json(
      { success: false, error: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
