import { NextResponse } from "next/server";
import { google } from "googleapis";
import { adminDb } from "@/lib/firebase-admin";

const DEFAULT_SHEET_ID = "1wrA0GcLf9Kdqj2mbfJD_WR5NbjEuIYhdh_PuAc2T138";
const DEFAULT_SHEET_NAME = "First_details";
const SYNC_WALKIN_ROUTE_VERSION = "2026-03-20-walkin-sheet-v3";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const canonicalHeader = [
  "Timestamp",
  "Full Name",
  "Mobile No",
  "How did you hear about us",
  "Store",
  "Walkin id",
  "Email Address",
  "Attend By",
  "Looking for",
  "Handover To",
  "Status",
  "Deal Cerated Yes /No",
  "Cashsale yes/no",
  "DealId No",
  "Order No",
  "Order Amount",
  "Invoice No",
  "Invoice Amount",
  "Acknowledged Yes/No",
  "Acknowledged By",
  "Acknowledged At",
  "Went Back Yes/No",
  "Went Back Reason Summary",
  "Went Back Follow Up Dates",
  "Went Back Response Count",
  "Inquiry Status",
  "Advance Received (Lead)",
  "Measurement Required (Lead)",
  "Remarks",
  "Action",
  "Created By Name",
  "Created By Email",
  "Created By ID",
  "Attended By ID",
  "Salesman ID",
  "Original Owner Type",
  "Original Owner ID",
  "Assigned Owner Type",
  "Assigned Owner ID",
  "Assignment Reason",
  "Handover Request ID",
  "Assigned At",
  "Last Updated At",
  "Latest Deal ID",
  "Latest Deal Doc ID",
  "Deal Snapshot Status",
  "Deal Snapshot Deal ID",
  "Deal Snapshot Deal Doc ID",
  "Deal Snapshot Customer ID",
  "Deal Snapshot Deal Name",
  "Deal Snapshot Advance Received",
  "Deal Snapshot Measurement Required",
  "Deal Snapshot Created At",
  "Cashsale Created",
  "Cashsale Deal Type",
  "Cashsale Type",
  "Cashsale Status",
  "Cashsale Created At",
  "Cashsale Deal ID",
  "Cashsale Order ID",
  "Order Workflow Status",
  "Order Status",
  "Invoicing Status",
  "Invoice Count",
  "Invoice IDs",
  "Invoice Types",
  "Invoice First Created At",
  "Invoice Total From Order",
  "Deal Created Flag",
  "Is Deal Created Flag",
];

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

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
  return google.sheets({ version: "v4", auth: authClient as any });
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
};

const pickFirst = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const toBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = normalize(value);
  return normalized === "true" || normalized === "yes" || normalized === "1";
};

const formatLookingFor = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean).join(", ");
  }
  return String(value ?? "").trim();
};

const formatYesNo = (value: unknown) => (toBoolean(value) ? "Yes" : "No");

const formatTimestampIfAny = (value: unknown) => {
  const formatted = formatTimestamp(value);
  return formatted || pickFirst(value);
};

const getWentBackResponses = (value: unknown) =>
  Array.isArray(value) ? value : [];

const formatWentBackReasonSummary = (value: unknown) => {
  const responses = getWentBackResponses(value);
  if (!responses.length) return "";
  return responses
    .map((entry) => {
      const item = toRecord(entry);
      const question = pickFirst(item.question);
      const answer = pickFirst(item.answer);
      const wentBackDate = pickFirst(item.wentBackdate);
      const dateLabel =
        wentBackDate && normalize(wentBackDate) !== "not required" ? ` (Follow-up: ${wentBackDate})` : "";
      return question ? `${question}${answer ? ` -> ${answer}` : ""}${dateLabel}` : "";
    })
    .filter(Boolean)
    .join(" | ");
};

const formatWentBackFollowUpDates = (value: unknown) => {
  const responses = getWentBackResponses(value);
  if (!responses.length) return "";
  return responses
    .map((entry) => pickFirst(toRecord(entry).wentBackdate))
    .map((date) => date.trim())
    .filter((date) => date && normalize(date) !== "not required")
    .join(", ");
};

const toDateInstance = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === "object") {
    const candidate = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof candidate.toDate === "function") {
      const date = candidate.toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const seconds = Number(candidate.seconds ?? candidate._seconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      const date = new Date(seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatTimestamp = (value: unknown) => {
  const date = toDateInstance(value);
  if (!date) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const normalized = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatAmount = (value: unknown) => {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return "";
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2);
};

const computeDealCreatedYesNo = (walkin: Record<string, unknown>) => {
  const status = normalize(walkin.status);
  const dealCreatedFlag = toBoolean(walkin.dealCreated) || toBoolean(walkin.isDealCreated);
  const dealSnapshot = toRecord(walkin.dealSnapshot);
  const dealId = pickFirst(
    walkin.dealId,
    walkin.latestDealId,
    walkin.latestDealDocId,
    walkin.crmDealId,
    dealSnapshot.dealId,
    dealSnapshot.dealDocId
  );
  const cashsale = toRecord(walkin.cashsale);
  const cashsaleCreated =
    toBoolean(cashsale.created) || !!pickFirst(cashsale.dealId, cashsale.OrderId, cashsale.orderId);

  if (status.includes("deal created") || dealCreatedFlag || !!dealId || cashsaleCreated) {
    return "Yes";
  }
  return "No";
};

const computeCashsaleYesNo = (walkin: Record<string, unknown>) => {
  const cashsale = toRecord(walkin.cashsale);
  const hasCashsaleLinks = !!pickFirst(cashsale.OrderId, cashsale.orderId, cashsale.orderID, cashsale.dealId);
  return toBoolean(cashsale.created) || hasCashsaleLinks ? "Yes" : "No";
};

const chunkArray = <T>(values: T[], size: number): T[][] => {
  if (!values.length) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

const getColumnLetter = (columnNumber: number) => {
  let dividend = columnNumber;
  let columnName = "";
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return columnName;
};

const WALKIN_ID_HEADER = "Walkin id";

const getWalkinIdSortValue = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return Number.MAX_SAFE_INTEGER;
  const match = text.match(/(\d+)/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const sortRowsByWalkinId = (rows: string[][]) => {
  const walkinIdIndex = canonicalHeader.findIndex(
    (label) => normalize(label) === normalize(WALKIN_ID_HEADER)
  );
  if (walkinIdIndex < 0) return [...rows];

  return [...rows].sort((a, b) => {
    const aId = String(a[walkinIdIndex] ?? "").trim();
    const bId = String(b[walkinIdIndex] ?? "").trim();
    const aSort = getWalkinIdSortValue(aId);
    const bSort = getWalkinIdSortValue(bId);

    if (aSort !== bSort) return aSort - bSort;
    return aId.localeCompare(bId);
  });
};

const SHEET_LAST_COLUMN = getColumnLetter(canonicalHeader.length);
const MAX_BATCH_UPDATE_ROWS = 500;
const MAX_APPEND_ROWS = 1000;

type FirestoreDocSnap = FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;

export async function POST() {
  try {
    const sheets = await getSheetsClient();
    const sheetId =
      process.env.WALKIN_SHEET_ID || process.env.WALKING_SHEET_ID || process.env.ORDERS_SHEET_ID || DEFAULT_SHEET_ID;
    const sheetName = process.env.WALKIN_SHEET_NAME || process.env.WALKING_SHEET_NAME || DEFAULT_SHEET_NAME;

    const walkinSnapshot = await adminDb.collection("Walkin_Customer").get();
    const creatorIdsForStoreLookup = new Set<string>();
    walkinSnapshot.docs.forEach((docSnap: FirestoreDocSnap) => {
      const walkin = docSnap.data() as Record<string, unknown>;
      const createdBy = toRecord(walkin.createdBy);
      const createdById = pickFirst(walkin.createdById, createdBy.id);
      if (createdById) creatorIdsForStoreLookup.add(createdById);
    });

    const creatorStoreById = new Map<string, string>();
    const creatorRefs = Array.from(creatorIdsForStoreLookup).map((id) =>
      adminDb.collection("users").doc(id)
    );
    for (const batch of chunkArray(creatorRefs, 500)) {
      const docs = await adminDb.getAll(...batch);
      docs.forEach((docSnap: FirestoreDocSnap) => {
        if (!docSnap.exists) return;
        const data = docSnap.data() as Record<string, unknown>;
        const store = String(data?.store ?? "").trim();
        if (store) creatorStoreById.set(docSnap.id, store);
      });
    }

    const orderIdsForLookup = new Set<string>();
    walkinSnapshot.docs.forEach((docSnap: FirestoreDocSnap) => {
      const walkin = docSnap.data() as Record<string, unknown>;
      const cashsale = toRecord(walkin.cashsale);
      const orderId = pickFirst(cashsale.OrderId, cashsale.orderId, cashsale.orderID);
      if (orderId) orderIdsForLookup.add(orderId);
    });

    const orderById = new Map<string, Record<string, unknown>>();
    const orderRefs = Array.from(orderIdsForLookup).map((id) =>
      adminDb.collection("orders").doc(id)
    );
    for (const batch of chunkArray(orderRefs, 500)) {
      const docs = await adminDb.getAll(...batch);
      docs.forEach((docSnap: FirestoreDocSnap) => {
        if (!docSnap.exists) return;
        orderById.set(docSnap.id, docSnap.data() as Record<string, unknown>);
      });
    }

    const preparedRows = walkinSnapshot.docs.map((docSnap: FirestoreDocSnap) => {
      const walkin = docSnap.data() as Record<string, unknown>;
      const attendedBy = toRecord(walkin.attendedBy);
      const createdBy = toRecord(walkin.createdBy);
      const cashsale = toRecord(walkin.cashsale);
      const dealSnapshot = toRecord(walkin.dealSnapshot);
      const acknowledgedStatus = toRecord(walkin.acknowledgedStatus);
      const wentBackResponses = getWentBackResponses(walkin.wentBackResponses);
      const orderId = pickFirst(cashsale.OrderId, cashsale.orderId, cashsale.orderID);
      const orderData = orderId ? orderById.get(orderId) : undefined;
      const safeOrderData = orderData || {};
      const invoicing = toRecord(safeOrderData.invoicing);
      const workflow = toRecord(safeOrderData.workflow);
      const invoices = Array.isArray(invoicing.invoices) ? invoicing.invoices : [];

      const invoiceNos: string[] = [];
      const invoiceIds: string[] = [];
      const invoiceTypes: string[] = [];
      let invoiceAmountTotal = 0;
      let hasInvoiceAmount = false;
      let firstInvoiceCreatedAt = "";
      invoices.forEach((entry) => {
        const invoiceEntry = toRecord(entry);
        const invoiceNo = pickFirst(invoiceEntry.invoiceNo);
        if (invoiceNo) invoiceNos.push(invoiceNo);
        const invoiceId = pickFirst(invoiceEntry.invoiceId);
        if (invoiceId) invoiceIds.push(invoiceId);
        const invoiceType = pickFirst(invoiceEntry.invoiceType);
        if (invoiceType) invoiceTypes.push(invoiceType);
        const createdAt = pickFirst(invoiceEntry.createdAt);
        if (!firstInvoiceCreatedAt && createdAt) firstInvoiceCreatedAt = createdAt;
        const amount = toFiniteNumber(invoiceEntry.amount);
        if (amount !== null) {
          invoiceAmountTotal += amount;
          hasInvoiceAmount = true;
        }
      });

      const createdById = pickFirst(walkin.createdById, createdBy.id);
      const fallbackStore = createdById ? String(creatorStoreById.get(createdById) || "").trim() : "";

      const firstName = pickFirst(walkin.firstName);
      const familyName = pickFirst(walkin.familyName);
      const fullName = pickFirst(
        `${firstName} ${familyName}`.trim(),
        walkin.fullName,
        walkin.name,
        walkin.customerName
      );

      const acknowledged = toBoolean(acknowledgedStatus.status);
      const dealCreatedYesNo = computeDealCreatedYesNo(walkin);
      const cashsaleYesNo = computeCashsaleYesNo(walkin);
      const rowByHeader: Record<string, string> = {
        Timestamp: formatTimestamp(walkin.createdAt),
        "Full Name": fullName,
        "Mobile No": pickFirst(walkin.mobile, walkin.phone, walkin.mobileNo),
        "How did you hear about us": pickFirst(
          walkin.howDidYouHearAboutUs,
          walkin.leadSource,
          walkin.source,
          walkin.customerType,
          "Walk-in"
        ),
        Store: pickFirst(walkin.store, fallbackStore, walkin.branch, walkin.location),
        "Walkin id": pickFirst(walkin.walkinId),
        "Email Address": pickFirst(walkin.email),
        "Attend By": pickFirst(attendedBy.name, walkin.attendedByName, walkin.createdByName, createdBy.name),
        "Looking for": formatLookingFor(walkin.lookingFor),
        "Handover To": pickFirst(walkin.salesmanName, walkin.handoverToName),
        Status: pickFirst(walkin.status),
        "Deal Cerated Yes /No": dealCreatedYesNo,
        "Cashsale yes/no": cashsaleYesNo,
        "DealId No": pickFirst(cashsale.dealId, walkin.latestDealId, dealSnapshot.dealId, safeOrderData.dealId),
        "Order No": pickFirst(
          cashsale.orderNo,
          cashsale.orderNumber,
          safeOrderData.orderNo,
          safeOrderData.crmOrderNo,
          orderId
        ),
        "Order Amount": formatAmount(
          cashsale.totalOrderAmount ?? safeOrderData.totalAmount ?? toRecord(safeOrderData.overallSummary).grandTotal
        ),
        "Invoice No": pickFirst(cashsale.invoiceNo, Array.from(new Set(invoiceNos)).join(", ")),
        "Invoice Amount": formatAmount(cashsale.invoiceAmount ?? (hasInvoiceAmount ? invoiceAmountTotal : "")),
        "Acknowledged Yes/No": acknowledged ? "Yes" : "No",
        "Acknowledged By": pickFirst(acknowledgedStatus.acknowledgedBy),
        "Acknowledged At": formatTimestampIfAny(acknowledgedStatus.updatedAt),
        "Went Back Yes/No":
          normalize(walkin.status) === "went-back" || wentBackResponses.length > 0 ? "Yes" : "No",
        "Went Back Reason Summary": formatWentBackReasonSummary(walkin.wentBackResponses),
        "Went Back Follow Up Dates": formatWentBackFollowUpDates(walkin.wentBackResponses),
        "Went Back Response Count": String(wentBackResponses.length),
        "Inquiry Status": pickFirst(walkin.inquiryStatus),
        "Advance Received (Lead)": pickFirst(walkin.advanceReceived),
        "Measurement Required (Lead)": pickFirst(walkin.measurementRequired),
        Remarks: pickFirst(walkin.remarks),
        Action: [pickFirst(walkin.action), pickFirst(walkin.leadType)].filter(Boolean).join(" | "),
        "Created By Name": pickFirst(walkin.createdByName, createdBy.name),
        "Created By Email": pickFirst(walkin.createdByEmail, createdBy.email),
        "Created By ID": pickFirst(walkin.createdById, createdBy.id),
        "Attended By ID": pickFirst(attendedBy.id),
        "Salesman ID": pickFirst(walkin.salesmanId),
        "Original Owner Type": pickFirst(walkin.originalOwnerType),
        "Original Owner ID": pickFirst(walkin.originalOwnerId),
        "Assigned Owner Type": pickFirst(walkin.assignedOwnerType),
        "Assigned Owner ID": pickFirst(walkin.assignedOwnerId),
        "Assignment Reason": pickFirst(walkin.assignmentReason),
        "Handover Request ID": pickFirst(walkin.handoverRequestId),
        "Assigned At": formatTimestampIfAny(walkin.assignedAt),
        "Last Updated At": formatTimestampIfAny(walkin.lastUpdatedAt),
        "Latest Deal ID": pickFirst(walkin.latestDealId),
        "Latest Deal Doc ID": pickFirst(walkin.latestDealDocId),
        "Deal Snapshot Status": pickFirst(dealSnapshot.status),
        "Deal Snapshot Deal ID": pickFirst(dealSnapshot.dealId),
        "Deal Snapshot Deal Doc ID": pickFirst(dealSnapshot.dealDocId),
        "Deal Snapshot Customer ID": pickFirst(dealSnapshot.customerId),
        "Deal Snapshot Deal Name": pickFirst(dealSnapshot.dealName),
        "Deal Snapshot Advance Received": pickFirst(dealSnapshot.advanceReceived),
        "Deal Snapshot Measurement Required": pickFirst(dealSnapshot.measurementRequired),
        "Deal Snapshot Created At": formatTimestampIfAny(dealSnapshot.createdAt),
        "Cashsale Created": formatYesNo(cashsale.created),
        "Cashsale Deal Type": pickFirst(cashsale.dealType),
        "Cashsale Type": pickFirst(cashsale.type),
        "Cashsale Status": pickFirst(cashsale.status),
        "Cashsale Created At": formatTimestampIfAny(cashsale.createdAt),
        "Cashsale Deal ID": pickFirst(cashsale.dealId),
        "Cashsale Order ID": pickFirst(orderId),
        "Order Workflow Status": pickFirst(workflow.status),
        "Order Status": pickFirst(safeOrderData.status),
        "Invoicing Status": pickFirst(invoicing.status),
        "Invoice Count": String(invoices.length),
        "Invoice IDs": Array.from(new Set(invoiceIds)).join(", "),
        "Invoice Types": Array.from(new Set(invoiceTypes)).join(", "),
        "Invoice First Created At": formatTimestampIfAny(firstInvoiceCreatedAt),
        "Invoice Total From Order": formatAmount(hasInvoiceAmount ? invoiceAmountTotal : ""),
        "Deal Created Flag": formatYesNo(walkin.dealCreated),
        "Is Deal Created Flag": formatYesNo(walkin.isDealCreated),
      };

      return canonicalHeader.map((headerLabel) => rowByHeader[headerLabel] ?? "");
    });

    const sortedPreparedRows = sortRowsByWalkinId(preparedRows);

    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:${SHEET_LAST_COLUMN}`,
    });

    const existingValues = existingResponse.data.values || [];
    const existingHeader = existingValues[0] || [];
    const headerNormalized = existingHeader.map(normalize);
    const headerMatchCount = canonicalHeader.filter((label) =>
      headerNormalized.includes(normalize(label))
    ).length;
    const hasHeader = headerMatchCount >= 3;
    const isHeaderExact =
      existingHeader.length >= canonicalHeader.length &&
      canonicalHeader.every((label, index) => normalize(existingHeader[index]) === normalize(label));
    const dataRows = hasHeader ? existingValues.slice(1) : existingValues;

    const headerIndex = new Map<string, number>();
    (hasHeader ? existingHeader : canonicalHeader).forEach((label: string, index: number) => {
      const key = normalize(label);
      if (key && !headerIndex.has(key)) headerIndex.set(key, index);
    });

    const getCell = (row: unknown[], label: string) => {
      const idx = headerIndex.get(normalize(label));
      if (idx === undefined) return "";
      return String(row?.[idx] ?? "");
    };

    const existingCanonicalRows = (hasHeader ? dataRows : []).map((row) =>
      canonicalHeader.map((label) => getCell(row, label))
    );

    const rowsToClear: string[] = [];
    const rowsToAppend: string[][] = [];
    const rowsToUpdate: { range: string; values: string[][] }[] = [];

    const comparableCount = Math.min(existingCanonicalRows.length, sortedPreparedRows.length);
    for (let index = 0; index < comparableCount; index += 1) {
      const canonicalRow = canonicalHeader.map((_, colIndex) =>
        String(sortedPreparedRows[index]?.[colIndex] ?? "")
      );
      const existingCanonicalRow = existingCanonicalRows[index] || [];
      const same =
        existingCanonicalRow.length === canonicalRow.length &&
        existingCanonicalRow.every(
          (cell, cellIndex) =>
            String(cell ?? "").trim() === String(canonicalRow[cellIndex] ?? "").trim()
        );

      if (!same) {
        const rowNumber = index + 2;
        rowsToUpdate.push({
          range: `${sheetName}!A${rowNumber}:${SHEET_LAST_COLUMN}${rowNumber}`,
          values: [canonicalRow],
        });
      }
    }

    if (sortedPreparedRows.length > existingCanonicalRows.length) {
      rowsToAppend.push(
        ...sortedPreparedRows
          .slice(existingCanonicalRows.length)
          .map((row) => canonicalHeader.map((_, colIndex) => String(row[colIndex] ?? "")))
      );
    }

    if (existingCanonicalRows.length > sortedPreparedRows.length) {
      const clearStart = sortedPreparedRows.length + 2;
      const clearEnd = existingCanonicalRows.length + 1;
      rowsToClear.push(`${sheetName}!A${clearStart}:${SHEET_LAST_COLUMN}${clearEnd}`);
    }

    if (!hasHeader && existingValues.length > 0) {
      rowsToClear.push(`${sheetName}!A1:${SHEET_LAST_COLUMN}${existingValues.length}`);
    }

    if (!hasHeader) {
      rowsToAppend.unshift(canonicalHeader);
    }

    if (rowsToClear.length > 0) {
      await sheets.spreadsheets.values.batchClear({
        spreadsheetId: sheetId,
        requestBody: {
          ranges: rowsToClear,
        },
      });
    }

    if (hasHeader && !isHeaderExact) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${sheetName}!A1:${SHEET_LAST_COLUMN}1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [canonicalHeader],
        },
      });
    }

    if (rowsToUpdate.length > 0) {
      for (const chunk of chunkArray(rowsToUpdate, MAX_BATCH_UPDATE_ROWS)) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            valueInputOption: "USER_ENTERED",
            data: chunk,
          },
        });
      }
    }

    if (rowsToAppend.length > 0) {
      for (const chunk of chunkArray(rowsToAppend, MAX_APPEND_ROWS)) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: `${sheetName}!A1`,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: {
            values: chunk,
          },
        });
      }
    }

    const cashsaleColIndex = canonicalHeader.findIndex(
      (label) => normalize(label) === normalize("Cashsale yes/no")
    );
    const cashsaleYesCount = sortedPreparedRows.reduce((count: number, row: string[]) => {
      if (cashsaleColIndex < 0) return count;
      return count + (normalize(row[cashsaleColIndex]) === "yes" ? 1 : 0);
    }, 0);

    return NextResponse.json({
      success: true,
      syncVersion: SYNC_WALKIN_ROUTE_VERSION,
      rowsPrepared: sortedPreparedRows.length,
      appended: rowsToAppend.length,
      updated: rowsToUpdate.length,
      cashsaleYes: cashsaleYesCount,
    });
  } catch (error) {
    console.error("Walk-in sheet sync failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
