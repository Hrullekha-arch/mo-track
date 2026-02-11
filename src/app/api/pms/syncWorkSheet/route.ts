import { NextResponse } from "next/server";
import { google } from "googleapis";
import { buildPmsWorkSheetRowsFromDb } from "@/services/pms-work-sheet";

const DEFAULT_SHEET_ID = "1RZLIuQM6p3v0QHnCIhBogMQoU1x8zcaTiXmTBpRUe98";
const DEFAULT_SHEET_NAME = "PMS_WORK";

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
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    let rows = Array.isArray(body?.rows) ? body.rows : null;
    if (!rows || rows.length === 0) {
      rows = await buildPmsWorkSheetRowsFromDb();
    }
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: true, appended: 0 });
    }

    const sheetId = process.env.PMS_WORK_SHEET_ID || DEFAULT_SHEET_ID;
    const sheetName = process.env.PMS_WORK_SHEET_NAME || DEFAULT_SHEET_NAME;
    const sheets = await getSheetsClient();

    const canonicalHeader = [
      "Order No",
      "Customer",
      "Vas Item",
      "Qty",
      "PMS Product",
      "Status",
      "Next Step",
      "Machine",
      "Person",
      "Process (step)",
      "Planned Start",
      "Planned End",
    ];

    const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
    const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
    const normalizedHeader = headerRow.map(normalize);
    const headerMatchCount = canonicalHeader.filter((label) =>
      normalizedHeader.includes(normalize(label))
    ).length;
    const hasHeader = headerMatchCount >= 3;
    const headerIndex = new Map<string, number>();
    if (hasHeader) {
      normalizedHeader.forEach((key, index) => {
        if (key && !headerIndex.has(key)) headerIndex.set(key, index);
      });
    } else {
      canonicalHeader.forEach((label, index) => {
        headerIndex.set(normalize(label), index);
      });
    }

    const getValue = (row: any[], label: string) => {
      const index = headerIndex.get(normalize(label));
      if (index === undefined) return "";
      return row[index] ?? "";
    };

    const getValueByLabels = (row: any[], labels: string[]) => {
      for (const label of labels) {
        const value = getValue(row, label);
        if (String(value).trim() !== "") return value;
      }
      return "";
    };

    const dataRows = hasHeader ? rows.slice(1) : rows;
    const normalizedRows = dataRows.map((row: any[]) => {
      const safeRow = Array.isArray(row) ? row : [];
      return [
        getValueByLabels(safeRow, ["Order No"]),
        getValueByLabels(safeRow, ["Customer"]),
        getValueByLabels(safeRow, ["Vas Item", "VAS Item"]),
        getValueByLabels(safeRow, ["Qty", "Quantity"]),
        getValueByLabels(safeRow, ["PMS Product", "Product", "PMS Product Name"]),
        getValueByLabels(safeRow, ["Status"]),
        getValueByLabels(safeRow, ["Next Step"]),
        getValueByLabels(safeRow, ["Machine"]),
        getValueByLabels(safeRow, ["Person"]),
        getValueByLabels(safeRow, ["Process (step)", "Process", "Current Step"]),
        getValueByLabels(safeRow, ["Planned Start", "Current Planned Start"]),
        getValueByLabels(safeRow, ["Planned End", "Current Planned End"]),
      ];
    });

    const isRowBlank = (row: any[]) =>
      !Array.isArray(row) ||
      row.length === 0 ||
      row.every((cell) => String(cell ?? "").trim() === "");

    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:L`,
    });

    const existingValues = existingResponse.data.values || [];
    const existingHeader = existingValues[0] || [];
    const existingHeaderNormalized = (existingHeader || []).map(normalize);
    const existingHeaderMatchCount = canonicalHeader.filter((label) =>
      existingHeaderNormalized.includes(normalize(label))
    ).length;
    const existingHasHeader = existingHeaderMatchCount >= 3;
    const existingDataRows = existingHasHeader ? existingValues.slice(1) : existingValues;

    const normalizeCell = (value: unknown) => normalize(value);
    const toCanonicalRow = (row: any[]) => canonicalHeader.map((_, index) => row?.[index] ?? "");
    const serializeRow = (row: any[]) =>
      toCanonicalRow(row).map(normalizeCell).join("\u001f");

    const existingRowKeys = new Set<string>();
    existingDataRows.forEach((row) => {
      if (!isRowBlank(row)) {
        existingRowKeys.add(serializeRow(row));
      }
    });

    const seenRowKeys = new Set<string>();
    const rowsToAppend = normalizedRows.filter((row) => {
      if (isRowBlank(row)) return false;
      const key = serializeRow(row);
      if (existingRowKeys.has(key) || seenRowKeys.has(key)) return false;
      seenRowKeys.add(key);
      return true;
    });

    const sheetIsEmpty =
      existingValues.length === 0 ||
      existingValues.every((row) => isRowBlank(row));
    const payloadRows = sheetIsEmpty ? [canonicalHeader, ...rowsToAppend] : rowsToAppend;

    if (payloadRows.length === 0) {
      return NextResponse.json({ success: true, appended: 0 });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: payloadRows,
      },
    });

    return NextResponse.json({ success: true, appended: rowsToAppend.length });
  } catch (error) {
    console.error("PMS work sheet sync failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
