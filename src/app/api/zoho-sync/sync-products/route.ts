import { NextRequest, NextResponse } from "next/server";
import { syncPendingProducts } from "@/services/zoho-sync/product-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    result: await syncPendingProducts({
      limit: Number(req.nextUrl.searchParams.get("limit") || 50),
      includeFailed: req.nextUrl.searchParams.get("includeFailed") === "true",
    }),
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}

