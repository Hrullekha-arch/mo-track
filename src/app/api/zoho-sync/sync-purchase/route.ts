import { NextRequest, NextResponse } from "next/server";
import { syncPendingPurchases } from "@/services/zoho-sync/purchase-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    result: await syncPendingPurchases({
      limit: Number(req.nextUrl.searchParams.get("limit") || 50),
      includeFailed: req.nextUrl.searchParams.get("includeFailed") === "true",
    }),
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}

