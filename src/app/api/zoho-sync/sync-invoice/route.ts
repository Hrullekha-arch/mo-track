import { NextRequest, NextResponse } from "next/server";
import { authenticateApiUser, isAuthorizedCronRequest } from "@/lib/zoho-sync/api-auth";
import { runZohoInvoiceBot } from "@/services/zoho-sync/invoice-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(req: NextRequest) {
  const actor = await authenticateApiUser(req).catch(() => null);
  if (!actor && !isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const outcome = await runZohoInvoiceBot({
    invoiceId:
      String(body?.invoiceId || req.nextUrl.searchParams.get("invoiceId") || "").trim() ||
      undefined,
    limit: Number(req.nextUrl.searchParams.get("limit") || 50),
    includeFailed: req.nextUrl.searchParams.get("includeFailed") === "true",
  });
  return NextResponse.json({ ok: true, ...outcome });
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
