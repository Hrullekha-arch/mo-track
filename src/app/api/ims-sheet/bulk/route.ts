import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ================= CONFIG =================
const SHEET_ID =
  "1EpfQfhfNA0AKSLoPVRsi62fsBwU4GbIoVHgCBBZs69Y";

const SHEET_NAME = "IMS";
const CLOSING_QTY_COLUMN = "L";

// ================= HELPERS =================
function parseGoogleVisualizationResponse(text: string) {
  return JSON.parse(
    text.substring(
      text.indexOf("{"),
      text.lastIndexOf("}") + 1
    )
  );
}

function toQty(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  if (!normalized) return 0;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ================= API =================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const rawBcns = Array.isArray(body?.bcns)
      ? body.bcns
      : [];

    if (!rawBcns.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Expected bcns array",
        },
        { status: 400 }
      );
    }

    // CLEAN BCN
    const bcns = rawBcns
      .map((bcn: any) => String(bcn).trim())
      .filter(Boolean);

    // ================= QUERY =================
    const whereClause = bcns
      .map((bcn: string) => `A='${bcn}'`)
      .join(" OR ");

    // ONLY RETURN IMPORTANT COLUMNS
    const query = encodeURIComponent(`
      SELECT 
        A,
        B,
        C,
        D,
        E,
        F,
        G,
        ${CLOSING_QTY_COLUMN}
      WHERE ${whereClause}
    `);

    // ================= FETCH DATA =================
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(
      SHEET_NAME
    )}&tq=${query}`;

    const response = await fetch(url, {
      cache: "no-store",
    });

    const rawText = await response.text();

    const json =
      parseGoogleVisualizationResponse(rawText);

    const rows = json?.table?.rows || [];

    // ================= FORMAT =================
    const items = rows.map((row: any) => ({
      bcn: row?.c?.[0]?.v || null,
      itemName: row?.c?.[1]?.v || null,
      category: row?.c?.[2]?.v || null,
      unit: row?.c?.[3]?.v || null,
      minStock: row?.c?.[4]?.v || 0,
      location: row?.c?.[5]?.v || null,
      group: row?.c?.[6]?.v || null,

      qty: toQty(row?.c?.[7]?.v),
      currentQty: toQty(row?.c?.[7]?.v),
      qtyColumn: CLOSING_QTY_COLUMN,
    }));

    // ================= RESPONSE =================
    return NextResponse.json({
      success: true,
      date: new Date().toLocaleDateString("en-GB"),
      qtyColumn: CLOSING_QTY_COLUMN,
      total: items.length,
      items,
    });
  } catch (error: any) {
    console.error(
      "IMS bulk lookup failed:",
      error?.message || error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to fetch IMS quantities",
      },
      { status: 500 }
    );
  }
}
