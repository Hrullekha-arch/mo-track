import { NextRequest, NextResponse } from "next/server";
import { syncPendingInvoices } from "@/services/zoho-sync/invoice-sync";
import { syncPendingProducts } from "@/services/zoho-sync/product-sync";
import { syncPendingPurchases } from "@/services/zoho-sync/purchase-sync";
import { mergeSyncResults } from "@/services/zoho-sync/queue-sync";
import { syncPendingStock } from "@/services/zoho-sync/stock-sync";
import { syncPendingDebitNotes } from "@/services/zoho-sync/debit-note-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const readOptions = (req: NextRequest) => ({
  limit: Number(req.nextUrl.searchParams.get("limit") || 50),
  includeFailed: req.nextUrl.searchParams.get("includeFailed") === "true",
});

async function run(req: NextRequest) {
  const options = readOptions(req);
  const result = mergeSyncResults([
    await syncPendingProducts(options),
    await syncPendingPurchases(options),
    await syncPendingInvoices(options),
    await syncPendingStock(options),
    await syncPendingDebitNotes(options),
  ]);
  return NextResponse.json({ ok: true, result });
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
