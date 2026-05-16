import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ================= CONFIG =================
const SHEET_ID =
  "1EpfQfhfNA0AKSLoPVRsi62fsBwU4GbIoVHgCBBZs69Y";

const SHEET_NAME = "IMS";

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

// COLUMN NUMBER => LETTER
function getColumnLetter(column: number) {
  let temp = "";
  let letter = "";

  while (column > 0) {
    temp = ((column - 1) % 26).toString();

    letter =
      String.fromCharCode(
        Number(temp) + 65
      ) + letter;

    column =
      (column - (Number(temp) + 1)) /
      26;
  }

  return letter;
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

    // ================= GET HEADER =================
    const headerUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(
      SHEET_NAME
    )}&range=M1:CC1&tq=${encodeURIComponent(
      "SELECT *"
    )}`;

    const headerResponse =
      await fetch(headerUrl, {
        cache: "no-store",
      });

    const headerText =
      await headerResponse.text();

    const headerJson =
      parseGoogleVisualizationResponse(
        headerText
      );

    const headerRow =
      headerJson?.table?.rows?.[0]?.c ||
      [];

    // ================= FIND TODAY DATE COLUMN =================
    let dateColumnLetter = "M";

    const today = new Date();

    const todayDate =
      today.getDate();

    const todayMonth =
      today.getMonth();

    const todayYear =
      today.getFullYear();

    for (
      let i = 0;
      i < headerRow.length;
      i++
    ) {
      const value =
        headerRow?.[i]?.v;

      if (!value) continue;

      const headerValue = String(
        value
      ).trim();

      // FORMAT:
      // Date(2026,4,11)
      const match =
        headerValue.match(
          /Date\((\d+),(\d+),(\d+)\)/
        );

      if (!match) continue;

      const year = Number(
        match[1]
      );

      // ZERO INDEXED
      const month = Number(
        match[2]
      );

      const day = Number(
        match[3]
      );

      // MATCH TODAY
      if (
        day === todayDate &&
        month === todayMonth &&
        year === todayYear
      ) {
        // M starts from 13
        dateColumnLetter =
          getColumnLetter(i + 13);

        break;
      }
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
        ${dateColumnLetter}
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

      dateColumn:
        dateColumnLetter,

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
          row?.c?.[7]?.v || 0,
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