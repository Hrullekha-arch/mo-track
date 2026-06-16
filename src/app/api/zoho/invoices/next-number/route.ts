import { NextRequest, NextResponse } from "next/server";
import { getZohoInvoiceSeriesSnapshot } from "@/lib/zoho-books";
import { resolveZohoInvoiceSeriesForStore } from "@/lib/zoho-invoice-series";

export async function GET(req: NextRequest) {
  try {
    const store = String(req.nextUrl.searchParams.get("store") || "").trim();
    const series = await getZohoInvoiceSeriesSnapshot();
    const selectedSeries = resolveZohoInvoiceSeriesForStore(store || undefined);
    const usesMo2 = selectedSeries.seriesName === "MO-2";
    const nextNumber = usesMo2 ? series.mo2.next : series.mo1.next;
    const hasSeriesHistory = usesMo2 ? Boolean(series.mo2.last) : Boolean(series.mo1.last);

    return NextResponse.json({
      nextNumber,
      series,
      source: hasSeriesHistory ? "zoho-history" : "seeded",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to fetch next Zoho invoice number." },
      { status: 500 }
    );
  }
}
