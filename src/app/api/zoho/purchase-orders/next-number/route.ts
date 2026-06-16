import { NextRequest, NextResponse } from "next/server";
import { getNextZohoPurchaseOrderNumber } from "@/lib/zoho-books";

export async function GET(req: NextRequest) {
  try {
    const vendorId = String(req.nextUrl.searchParams.get("vendorId") || "").trim();
    const nextNumber = await getNextZohoPurchaseOrderNumber(vendorId || undefined);

    return NextResponse.json({
      nextNumber,
      source: nextNumber ? "zoho-history" : "none",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to fetch next Zoho PO number." },
      { status: 500 }
    );
  }
}
