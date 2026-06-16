import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ================= CONFIG =================
const SHEET_ID =
  "1EpfQfhfNA0AKSLoPVRsi62fsBwU4GbIoVHgCBBZs69Y";

const SHEET_NAME = "IMS";
const CLOSING_QTY_COLUMN = "L";

// ================= HELPERS =================
function parseGoogleVisualizationResponse(
  text: string
) {
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
export async function GET(
  request: NextRequest
) {
  try {
    // ================= BCN =================
    const bcn = String(
      request.nextUrl.searchParams.get(
        "bcn"
      ) ?? ""
    ).trim();

    if (!bcn) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing bcn query parameter.",
        },
        { status: 400 }
      );
    }

    // ================= QUERY =================
    // ONLY RETURN REQUIRED COLUMNS
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
      WHERE A='${bcn}'
    `);

    // ================= FETCH =================
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(
      SHEET_NAME
    )}&tq=${query}`;

    const response = await fetch(url, {
      cache: "no-store",
    });

    const rawText =
      await response.text();

    const json =
      parseGoogleVisualizationResponse(
        rawText
      );

    const row =
      json?.table?.rows?.[0];

    // ================= NOT FOUND =================
    if (!row) {
      return NextResponse.json({
        success: true,
        found: false,
        bcn,
        qty: null,
        message: `BCN ${bcn} not found in IMS sheet.`,
      });
    }

    // ================= RESPONSE =================
    return NextResponse.json({
      success: true,
      found: true,

      qtyColumn:
        CLOSING_QTY_COLUMN,

      item: {
        bcn:
          row?.c?.[0]?.v || null,

        itemName:
          row?.c?.[1]?.v || null,

        category:
          row?.c?.[2]?.v || null,

        unit:
          row?.c?.[3]?.v || null,

        minStock:
          row?.c?.[4]?.v || 0,

        location:
          row?.c?.[5]?.v || null,

        group:
          row?.c?.[6]?.v || null,

        qty:
          toQty(row?.c?.[7]?.v),
      },
    });
  } catch (error: any) {
    console.error(
      "IMS lookup failed:",
      error?.message || error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to fetch IMS quantity from Google Sheet.",
      },
      { status: 500 }
    );
  }
}
