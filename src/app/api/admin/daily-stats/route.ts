import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

function requireBearer(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

async function requireAdmin(uid: string) {
  const userSnap = await adminDb.collection("users").doc(uid).get();
  const role = String(userSnap.data()?.role || "").toLowerCase();
  const ok = role === "admin" || role === "employee";
  if (!ok) throw new Error("Forbidden");
}

function dateKeyIST(now = new Date()) {
  // IST date key (yyyyMMdd)
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, "0");
  const d = String(ist.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function startOfDayISTIso(now = new Date()) {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  ist.setHours(0, 0, 0, 0);
  return ist.toISOString();
}

export async function POST(req: Request) {
  try {
    const token = requireBearer(req);
    if (!token) return NextResponse.json({ success: false, error: "Missing token" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    await requireAdmin(decoded.uid);

    const body = await req.json().catch(() => ({}));
    const onlyInstallerId = body?.installerId ? String(body.installerId) : null;

    const dateKey = dateKeyIST();
    const todayStartIso = startOfDayISTIso(new Date());
    const nowIso = new Date().toISOString();

    // installers list
    let installers: string[] = [];
    if (onlyInstallerId) {
      installers = [onlyInstallerId];
    } else {
      const usersSnap = await adminDb.collection("users").where("role", "==", "installer").get();
      installers = usersSnap.docs.map((d) => d.id);
    }

    const results: any[] = [];

    for (const installerId of installers) {
      // 1) completed today
      // We rely on visitTracking for work times, and visits for completed.
      const visitsSnap = await adminDb
        .collectionGroup("visits")
        .where("assignedTo", "==", installerId)
        .get();

      let completedToday = 0;

      for (const v of visitsSnap.docs) {
        const data = v.data() as any;
        if (String(data.status || "").toLowerCase() !== "completed") continue;

        // Try these fields (use whichever exists in your schema)
        const endIso =
          data.visitEndTime ||
          data.completedAt ||
          data.updatedAt ||
          null;

        if (!endIso) continue;

        const t = new Date(endIso).toISOString();
        if (t >= todayStartIso) completedToday += 1;
      }

      // 2) avg work time today (from visitTracking)
      const vtSnap = await adminDb
        .collection("visitTracking")
        .where("installerId", "==", installerId)
        .get();

      let totalWorkMin = 0;
      let workSessions = 0;

      for (const d of vtSnap.docs) {
        const vt = d.data() as any;
        const ws = vt.workStartAt ? new Date(vt.workStartAt).toISOString() : null;
        if (!ws || ws < todayStartIso) continue;

        const we = vt.workEndAt ? new Date(vt.workEndAt).toISOString() : null;
        const end = we ? new Date(we).getTime() : Date.now();
        const start = new Date(ws).getTime();

        if (end > start) {
          const mins = Math.round((end - start) / 60000);
          totalWorkMin += mins;
          workSessions += 1;
        }
      }

      const avgWorkMin = workSessions > 0 ? Math.round(totalWorkMin / workSessions) : 0;

      // 3) delay count today:
      // We count visitTracking docs that have learnedDelayMin (stored in jobSuggestions consumed doc)
      // BUT simplest: read jobSuggestions consumed logs isn’t per visit.
      // So we store learnedDelayMin into visitTracking when WORKING starts (small patch in tracking route).
      // For now we’ll count travel delay if travelStartAt exists and travelEndAt exists and travel mins > eta threshold later.
      // Minimal Day-2: use installerStats.lastDelayMin? Not per visit.
      // ✅ Better: count visitTracking.delayMin field (we’ll add it now below in Step 3.2).

      let delayCount = 0;
      for (const d of vtSnap.docs) {
        const vt = d.data() as any;
        const ws = vt.workStartAt ? new Date(vt.workStartAt).toISOString() : null;
        if (!ws || ws < todayStartIso) continue;
        const delayMin = Number(vt.delayMin ?? 0);
        if (Number.isFinite(delayMin) && delayMin >= 10) delayCount += 1; // threshold
      }

      const out = {
        installerId,
        dateKey,
        completedToday,
        totalWorkMin,
        avgWorkMin,
        delayCount,
        updatedAt: nowIso,
      };

      await adminDb.collection("adminDailyStats").doc(`${installerId}_${dateKey}`).set(out, { merge: true });
      results.push(out);
    }

    return NextResponse.json({ success: true, dateKey, count: results.length, results });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const status = msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
