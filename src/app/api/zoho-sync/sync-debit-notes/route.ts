import { NextRequest, NextResponse } from "next/server";
import { syncPendingDebitNotes } from "@/services/zoho-sync/debit-note-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(req: NextRequest) {
  const result = await syncPendingDebitNotes({
    limit: Number(req.nextUrl.searchParams.get("limit") || 50),
    includeFailed: req.nextUrl.searchParams.get("includeFailed") === "true",
  });
  return NextResponse.json({ ok: true, result });
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
