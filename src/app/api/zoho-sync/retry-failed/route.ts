import { NextRequest, NextResponse } from "next/server";
import { retryFailedZohoSync } from "@/services/zoho-sync/retry-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    result: await retryFailedZohoSync({
      limit: Number(req.nextUrl.searchParams.get("limit") || 50),
      includeFailed: true,
    }),
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

