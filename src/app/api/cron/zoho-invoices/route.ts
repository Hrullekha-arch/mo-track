import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/zoho-sync/api-auth";
import { runZohoInvoiceBot } from "@/services/zoho-sync/invoice-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function run(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const outcome = await runZohoInvoiceBot({ limit: 50 });
    return NextResponse.json({ ok: true, ...outcome });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Zoho invoice bot failed." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
