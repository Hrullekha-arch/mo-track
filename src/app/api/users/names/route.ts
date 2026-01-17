import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];

    const clean = Array.from(new Set(ids.map((x) => (x || "").trim()).filter(Boolean)));

    if (clean.length === 0) {
      return NextResponse.json({ success: true, map: {} });
    }

    // Firestore "in" supports max 30 doc ids per query → chunk it
    const chunkSize = 30;
    const chunks: string[][] = [];
    for (let i = 0; i < clean.length; i += chunkSize) chunks.push(clean.slice(i, i + chunkSize));

    const out: Record<string, string> = {};

    for (const chunk of chunks) {
      const refs = chunk.map((id) => adminDb.collection("users").doc(id));
      const snaps = await adminDb.getAll(...refs);

      snaps.forEach((snap, idx) => {
        const id = chunk[idx];
        out[id] = snap.exists ? ((snap.data() as any)?.name || id) : id;
      });
    }

    return NextResponse.json({ success: true, map: out });
  } catch (e) {
    console.error("POST /api/users/names error:", e);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
