import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { haversineDistanceMeters } from "@/lib/geo";

type VisitGeo = { latitude: number; longitude: number; radiusM?: number };
type VisitCoords = {
  lat: number;
  lng: number;
  radiusM?: number;
  source: "geo" | "legacy";
};

async function getAvgDelayMin(installerId: string) {
  const snap = await adminDb.collection("installerStats").doc(installerId).get();
  const avg = Number(snap.data()?.avgDelayMin ?? 0);
  if (!Number.isFinite(avg)) return 0;
  return Math.max(0, Math.min(20, Math.round(avg))); // clamp 0..20
}

function getVisitCoords(visit: any): VisitCoords | null {
  const geo: VisitGeo | undefined = visit?.geo;
  const vLat = Number(geo?.latitude);
  const vLng = Number(geo?.longitude);
  if (Number.isFinite(vLat) && Number.isFinite(vLng)) {
    const radiusM = Number(geo?.radiusM);
    return {
      lat: vLat,
      lng: vLng,
      radiusM: Number.isFinite(radiusM) ? radiusM : undefined,
      source: "geo",
    };
  }

  const legacyLat = Number(visit?.geofenceLat);
  const legacyLng = Number(visit?.geofenceLng);
  if (Number.isFinite(legacyLat) && Number.isFinite(legacyLng)) {
    const radiusM = Number(visit?.geofenceRadiusM);
    return {
      lat: legacyLat,
      lng: legacyLng,
      radiusM: Number.isFinite(radiusM) ? radiusM : undefined,
      source: "legacy",
    };
  }

  return null;
}

function getVisitContext(ref: any): { customerId?: string; dealDocId?: string } {
  // visits is inside: customers/{customerId}/deals/{dealDocId}/visits/{visitId}
  const dealRef = ref?.parent?.parent;
  const customerRef = dealRef?.parent?.parent;
  return {
    dealDocId: dealRef?.id,
    customerId: customerRef?.id,
  };
}

function requireBearer(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

async function requireAdmin(uid: string) {
  // Adjust if your users collection name differs.
  const userSnap = await adminDb.collection("users").doc(uid).get();
  const role = String(userSnap.data()?.role || "").toLowerCase();

  // Allow admin + employee managers (tweak if you want)
  const ok = role === "admin" || role === "employee";
  if (!ok) throw new Error("Forbidden");
}

function kmFromMeters(m: number) {
  return Math.round((m / 1000) * 10) / 10; // 1 decimal
}

// Day-2 ETA: simple + stable (no Maps yet)
function etaMinutesFromKm(km: number) {
  const avgKmh = 18;
  const mins = (km / avgKmh) * 60;
  const buffered = mins + 2;
  return Math.max(3, Math.min(90, Math.round(buffered)));
}

export async function POST(req: Request) {
  try {
    const token = requireBearer(req);
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Missing token" },
        { status: 401 }
      );
    }

    const decoded = await adminAuth.verifyIdToken(token);
    await requireAdmin(decoded.uid);

    const body = await req.json().catch(() => ({}));
    const onlyInstallerId = body?.installerId ? String(body.installerId) : null;

    // Read installers from installerTracking
    let installersSnap: any;
    if (onlyInstallerId) {
      installersSnap = await adminDb
        .collection("installerTracking")
        .where("installerId", "==", onlyInstallerId)
        .get();

      // Fallback: doc id == installerId
      if (installersSnap.empty) {
        const doc = await adminDb
          .collection("installerTracking")
          .doc(onlyInstallerId)
          .get();
        installersSnap = { docs: doc.exists ? [doc] : [] } as any;
      }
    } else {
      installersSnap = await adminDb.collection("installerTracking").get();
    }

    const suggestions: any[] = [];

    for (const doc of installersSnap.docs) {
      const t = doc.data() as any;
      const installerId = String(t.installerId || doc.id);

      const loc = t.location;
      const lat = Number(loc?.latitude);
      const lng = Number(loc?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      // Candidate visits: assigned + not completed (Day-2 safe)
      const visitsSnap = await adminDb
        .collectionGroup("visits")
        .where("assignedTo", "==", installerId)
        .limit(80)
        .get();

      let best: null | {
        visitId: string;
        dealId?: string;
        customerName?: string;
        customerId?: string;
        dealDocId?: string;
        distanceM: number;
        coordsSource: "geo" | "legacy";
      } = null;

      for (const v of visitsSnap.docs) {
        const visit = v.data() as any;

        // Filter out completed
        if (String(visit.status || "").toLowerCase() === "completed") continue;

        const coords = getVisitCoords(visit);
        if (!coords) continue;

        const context = getVisitContext(v.ref);

        const distM = haversineDistanceMeters(
          { lat, lng },
          { lat: coords.lat, lng: coords.lng }
        );

        if (!best || distM < best.distanceM) {
          best = {
            visitId: v.id,
            dealId: visit.dealId,
            customerName: visit.customerName,
            customerId: visit.customerId || context.customerId,
            dealDocId: visit.dealDocId || context.dealDocId,
            distanceM: distM,
            coordsSource: coords.source,
          };
        }
      }

      const outRef = adminDb.collection("jobSuggestions").doc(installerId);

      if (!best) {
        await outRef.set(
          {
            installerId,
            recommendedVisitId: null,
            recommendedDealId: null,
            recommendedCustomerName: null,
            customerId: null,
            dealDocId: null,
            distanceKm: null,
            etaMin: null,
            avgDelayMin: 0,
            finalEtaMin: null,
            computedAt: new Date().toISOString(),
            reason: "no_candidates",
          },
          { merge: true }
        );
        continue;
      }

      const distanceKm = kmFromMeters(best.distanceM);
      const etaMin = etaMinutesFromKm(distanceKm);

      // ✅ SMART ETA = base eta + installer average delay
      const avgDelayMin = await getAvgDelayMin(installerId);
      const finalEtaMin = Math.max(3, Math.min(120, etaMin + avgDelayMin));

      const payload = {
        installerId,

        recommendedVisitId: best.visitId,
        recommendedDealId: best.dealId || null,
        recommendedCustomerName: best.customerName || null,
        customerId: best.customerId || null,
        dealDocId: best.dealDocId || null,

        distanceKm,
        etaMin,

        // ✅ New fields for Smart ETA
        avgDelayMin,
        finalEtaMin,

        coordsSource: best.coordsSource,

        computedAt: new Date().toISOString(),
        reason: "nearest_assigned_pending",
      };

      await outRef.set(payload, { merge: true });
      suggestions.push(payload);
    }

    return NextResponse.json({
      success: true,
      count: suggestions.length,
      suggestions,
    });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const status = msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
