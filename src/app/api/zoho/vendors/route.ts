import { NextRequest, NextResponse } from "next/server";
import { searchZohoVendors } from "@/lib/zoho-books";

export async function GET(req: NextRequest) {
  try {
    const search = String(req.nextUrl.searchParams.get("search") || "").trim();
    if (!search) {
      return NextResponse.json({ vendors: [] });
    }

    const vendors = await searchZohoVendors(search, 20);
    return NextResponse.json({ vendors });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to fetch Zoho vendors." },
      { status: 500 }
    );
  }
}
