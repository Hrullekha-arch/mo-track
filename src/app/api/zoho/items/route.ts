import { NextRequest, NextResponse } from "next/server";
import { createZohoItem, searchZohoItems } from "@/lib/zoho-books";

export async function GET(req: NextRequest) {
  try {
    const search = String(req.nextUrl.searchParams.get("search") || "").trim();
    const vendorId = String(req.nextUrl.searchParams.get("vendorId") || "").trim();
    const usageParam = String(req.nextUrl.searchParams.get("usage") || "").trim().toLowerCase();
    const usage = usageParam === "sales" ? "sales" : "purchase";

    if (!search) {
      return NextResponse.json({ items: [] });
    }

    const items = await searchZohoItems(search, {
      vendorId: vendorId || undefined,
      limit: 40,
      usage,
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to fetch Zoho items." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const name = String(body?.name || "").trim();
    const rateRaw = body?.rate;
    const rate = Number(rateRaw);
    if (!name) {
      return NextResponse.json({ error: "name is required." }, { status: 400 });
    }
    if (!Number.isFinite(rate) || rate < 0) {
      return NextResponse.json({ error: "Valid rate is required." }, { status: 400 });
    }

    const item = await createZohoItem({
      name,
      rate,
      description: String(body?.description || "").trim() || undefined,
      sku: String(body?.sku || "").trim() || undefined,
      unit: String(body?.unit || "").trim() || undefined,
      productType:
        (String(body?.productType || "").trim() as "goods" | "service" | "digital_service") ||
        undefined,
      itemType:
        (String(body?.itemType || "").trim() as
          | "sales"
          | "purchases"
          | "sales_and_purchases"
          | "inventory") || undefined,
      hsnOrSac: String(body?.hsnOrSac || "").trim() || undefined,
      isTaxable:
        typeof body?.isTaxable === "boolean" ? (body.isTaxable as boolean) : undefined,
      taxPercentage:
        body?.taxPercentage === undefined || body?.taxPercentage === null
          ? undefined
          : Number(body.taxPercentage),
      purchaseDescription: String(body?.purchaseDescription || "").trim() || undefined,
      purchaseRate:
        body?.purchaseRate === undefined || body?.purchaseRate === null
          ? undefined
          : Number(body.purchaseRate),
    });

    return NextResponse.json({ item });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to create Zoho item." },
      { status: 500 }
    );
  }
}
