import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { ZOHO_SYNC_LOGS_COLLECTION } from "@/lib/zoho-sync/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.max(1, Math.min(Number(req.nextUrl.searchParams.get("limit") || 100), 500));
  const snap = await adminDb
    .collection(ZOHO_SYNC_LOGS_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return NextResponse.json({
    logs: snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })),
  });
}

