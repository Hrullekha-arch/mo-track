import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SHEET_ID = "1EpfQfhfNA0AKSLoPVRsi62fsBwU4GbIoVHgCBBZs69Y";
const DEFAULT_SHEET_NAME = "IMS";
const IST_TIMEZONE = "Asia/Kolkata";

const formatDateForSheetHeader = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

const parseQuantity = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .trim();

  if (!normalized) return null;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const getSheetsClient = async () => {
  const serviceAccountKey =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountKey) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_KEY or FIREBASE_SERVICE_ACCOUNT_KEY.");
  }

  const credentials = JSON.parse(serviceAccountKey);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
};

export async function GET(request: NextRequest) {
  const bcn = String(request.nextUrl.searchParams.get("bcn") ?? "").trim();
  if (!bcn) {
    return NextResponse.json(
      { success: false, error: "Missing bcn query parameter." },
      { status: 400 }
    );
  }

  const spreadsheetId = process.env.IMS_SHEET_ID || DEFAULT_SHEET_ID;
  const sheetName = process.env.IMS_SHEET_NAME || DEFAULT_SHEET_NAME;

  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
    });

    const rows = (response.data.values ?? []) as string[][];
    if (!rows.length) {
      return NextResponse.json({
        success: true,
        bcn,
        qty: null,
        message: "No data found in IMS sheet.",
      });
    }

    const todayHeader = formatDateForSheetHeader(new Date());
    //const todayHeader = "28/03/2026";
    const headerRow = rows[0] ?? [];
    const dateColumnIndex = headerRow.findIndex(
      (column) => String(column ?? "").trim() === todayHeader
    );

    if (dateColumnIndex === -1) {
      return NextResponse.json({
        success: true,
        bcn,
        qty: null,
        message: `Date column ${todayHeader} not found in IMS header.`,
      });
    }

    const row = rows.find(
      (entry) => String(entry?.[0] ?? "").trim().toLowerCase() === bcn.toLowerCase()
    );

    if (!row) {
      return NextResponse.json({
        success: true,
        bcn,
        qty: null,
        message: `BCN ${bcn} not found in IMS sheet.`,
      });
    }

    const qty = parseQuantity(row[dateColumnIndex]);

    return NextResponse.json({
      success: true,
      bcn,
      qty,
      date: todayHeader,
    });
  } catch (error: any) {
    console.error("IMS sheet lookup failed:", error?.message || error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch IMS quantity from Google Sheet.",
      },
      { status: 500 }
    );
  }
}
