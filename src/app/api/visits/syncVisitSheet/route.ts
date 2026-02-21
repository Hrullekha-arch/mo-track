import { NextResponse } from "next/server";
import { google } from "googleapis";
import { adminDb } from "@/lib/firebase-admin";

const DEFAULT_SHEET_ID = "1VDQdBW-Csf_f4IJIMhbhCTHGfswnBkMpFykoIsqT_ag";
const DEFAULT_SHEET_NAME = "CRM_VISIT_DATA";
const SYNC_VISIT_ROUTE_VERSION = "2026-02-20-installer-dedupe-v2";

const canonicalHeader = [
  "Deal",
  "Customer Name",
  "Slot date and Time",
  "Competed at Date and time",
  "Installer name",
  "Type",
];

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

const chunkArray = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const parseDateValue = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  return new Date(value);
};

const formatDateOnly = (value?: string) => {
  if (!value) return "";
  const date = parseDateValue(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value?: string) => {
  if (!value) return "";
  const date = parseDateValue(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

export async function POST() {
  try {
    const sheets = await getSheetsClient();
    const sheetId = process.env.VISITS_SHEET_ID || DEFAULT_SHEET_ID;
    const sheetName = process.env.VISITS_SHEET_NAME || DEFAULT_SHEET_NAME;

    const visitsSnapshot = await adminDb.collectionGroup("visits").get();
    if (visitsSnapshot.empty) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: `${sheetName}!A1:Z`,
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${sheetName}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [canonicalHeader] },
      });
      return NextResponse.json({ success: true, rows: 0 });
    }

    const customerIdsNeedingLookup = new Set<string>();
    const installerIds = new Set<string>();
    const visits = visitsSnapshot.docs.map((docSnap) => {
      const visit = docSnap.data() as any;
      const parts = docSnap.ref.path.split("/");
      const customerId = parts[1];
      const dealDocId = parts[3];
      const customerName =
        visit.customerSnapshot?.name || visit.customerName || "";
      if (!customerName && customerId) customerIdsNeedingLookup.add(customerId);
      if (visit.assignedTo) installerIds.add(String(visit.assignedTo));
      return { visit, customerId, dealDocId, customerName };
    });

    const customersById = new Map<string, any>();
    const customerRefs = Array.from(customerIdsNeedingLookup).map((id) =>
      adminDb.collection("customers").doc(id)
    );
    for (const batch of chunkArray(customerRefs, 500)) {
      const docs = await adminDb.getAll(...batch);
      docs.forEach((doc) => {
        if (doc.exists) customersById.set(doc.id, doc.data());
      });
    }

    const installerNameById = new Map<string, string>();
    const installerRefs = Array.from(installerIds).map((id) =>
      adminDb.collection("users").doc(id)
    );
    for (const batch of chunkArray(installerRefs, 500)) {
      const docs = await adminDb.getAll(...batch);
      docs.forEach((doc) => {
        if (!doc.exists) return;
        const data = doc.data() as any;
        if (data?.name) installerNameById.set(doc.id, data.name);
      });
    }

    const rowMap = new Map<string, string[]>();
    const rowScore = (row: string[]) => row.filter((cell) => String(cell ?? "").trim() !== "").length;
    visits.forEach(({ visit, customerId, dealDocId, customerName }) => {
      const customer = customersById.get(customerId) || {};
      const resolvedCustomerName =
        customerName || customer.name || "Unknown";

      const dealId = String(
        visit.dealId || visit.dealSnapshot?.dealCode || dealDocId || ""
      );

      const slotDate = visit.slotDate || visit.dueDate || "";
      const slotLabel =
        visit.slotLabel ||
        (visit.slotStart && visit.slotEnd ? `${visit.slotStart} - ${visit.slotEnd}` : "");
      const slotText = [formatDateOnly(slotDate), slotLabel].filter(Boolean).join(" ");

      const completedAt =
        visit.visitEndTime || (visit.status === "completed" ? visit.updatedAt : "");

      const installerName = visit.assignedTo
        ? installerNameById.get(visit.assignedTo) || ""
        : "";

      const type = visit.typeOfVisit || visit.visitType || "";

      const row = [
        dealId,
        resolvedCustomerName,
        slotText,
        formatDateTime(completedAt),
        installerName,
        type,
      ];
      const dedupeKey = row.map((cell) => normalize(cell)).join("|");
      if (!dedupeKey) return;
      const existing = rowMap.get(dedupeKey);
      if (!existing || rowScore(row) > rowScore(existing)) {
        rowMap.set(dedupeKey, row);
      }
    });

    const rows = Array.from(rowMap.values());
    rows.sort((a, b) => a[0].localeCompare(b[0]));

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:Z`,
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [canonicalHeader, ...rows],
      },
    });

    return NextResponse.json({
      success: true,
      syncVersion: SYNC_VISIT_ROUTE_VERSION,
      rows: rows.length,
      dedupedRows: visits.length - rows.length,
    });
  } catch (error) {
    console.error("Visit sheet sync failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
