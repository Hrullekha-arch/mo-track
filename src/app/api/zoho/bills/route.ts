import { NextRequest, NextResponse } from "next/server";
import { searchZohoBills } from "@/lib/zoho-books";

export async function GET(req: NextRequest) {
  try {
    const vendorId = String(req.nextUrl.searchParams.get("vendorId") || "").trim();
    const search = String(req.nextUrl.searchParams.get("search") || "").trim();
    if (!vendorId) return NextResponse.json({ bills: [] });

    const bills = await searchZohoBills(vendorId, search, 30);
    return NextResponse.json({ bills });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to fetch Zoho bills." },
      { status: 500 }
    );
  }
}
