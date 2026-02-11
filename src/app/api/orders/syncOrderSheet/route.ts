import { NextResponse } from "next/server";
import { google } from "googleapis";
import { adminDb } from "@/lib/firebase-admin";

const DEFAULT_SHEET_ID = "11gMXD3ZQiH7D9NtCFx1q3COH18jQQRTh3mLSaa8RFKA";
const DEFAULT_SHEET_NAME = "Main";

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

const canonicalHeader = [
  "Timestamp",
  "Customer Name",
  "Mobile no",
  "Item",
  "SalesMan",
  "DealId",
  "Address",
  "OrderId",
  "Measurement Actual",
  "Quotation Actual",
  "Order Approval Actual",
];

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

const formatSheetDate = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
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

type QuotationRecord = {
  id: string;
  dealId: string;
  quotationNo?: string;
  createdAt?: string;
  status?: string;
  items: string[];
};

const formatAddressParts = (address: any) => {
  if (!address) return "";
  const parts = [
    address.line1 || address.addressLine1 || address.address,
    address.line2 || address.addressLine2,
    address.landmark,
    address.city,
    address.state,
    address.pincode || address.pinCode || address.zip || address.zipCode,
  ]
    .filter(Boolean)
    .join(", ");
  return parts;
};

const buildAddress = (customer: any) => {
  if (!customer) return "";
  const address =
    customer.shippingAddress ||
    customer.billingAddress ||
    (customer.savedAddresses?.length
      ? { line1: customer.savedAddresses[0].address, landmark: customer.savedAddresses[0].landmark }
      : null);
  const formatted = formatAddressParts(address);
  if (formatted) return formatted;
  const legacy = [
    customer.billingAddress?.line1,
    customer.address,
    customer.addressPinCode,
    customer.landmark,
    customer.city,
    customer.state,
    customer.pinCode,
  ]
    .filter(Boolean)
    .join(", ");
  return legacy;
};

const buildOrderAddress = (order: any) => {
  if (!order) return "";
  const fromSnapshot = formatAddressParts(
    order.customerSnapshot?.shippingAddress || order.customerSnapshot?.billingAddress
  );
  if (fromSnapshot) return fromSnapshot;
  return (
    order.customerAddress ||
    order.address ||
    order.billingAddress ||
    ""
  );
};

const getItemLabel = (item: any) =>
  String(
    item?.salesDescription ||
      item?.description ||
      item?.itemName ||
      item?.vasName ||
      item?.collectionBrand ||
      item?.bcn ||
      item?.type ||
      item?.category ||
      item?.name ||
      item?.title ||
      ""
  )
    .trim();

const getQuotationItemLabels = (quotation: any) => {
  if (!quotation) return [];
  const normalItems =
    Array.isArray(quotation.items) && quotation.items.length > 0
      ? quotation.items
      : quotation.sections?.NORMAL?.items || [];
  const vasItems =
    Array.isArray(quotation.vasDetails) && quotation.vasDetails.length > 0
      ? quotation.vasDetails
      : quotation.sections?.VAS?.items || [];
  return [...normalItems, ...vasItems].map(getItemLabel).filter(Boolean);
};

const getOrderItemLabels = (order: any) => {
  if (!order) return [];
  const normalItems = order.sections?.NORMAL?.items || [];
  const vasItems = order.sections?.VAS?.items || [];
  return [...normalItems, ...vasItems].map(getItemLabel).filter(Boolean);
};

const getDealProductItemLabels = (dealProducts: any) => {
  const items = [
    ...(dealProducts?.sections?.NORMAL?.items || []),
    ...(dealProducts?.sections?.VAS?.items || []),
  ]
    .map(getItemLabel)
    .filter(Boolean);
  return Array.from(new Set(items));
};

const getRowKey = (row: string[]) => {
  const base = row[5] || row[7] || `${row[1]}|${row[0]}`;
  const item = row[3] || "";
  return item ? `${base}|${item}` : base;
};

export async function POST() {
  try {
    const sheets = await getSheetsClient();
    const sheetId = process.env.ORDER_SHEET_ID || DEFAULT_SHEET_ID;
    const sheetName = process.env.ORDER_SHEET_NAME || DEFAULT_SHEET_NAME;

    const dealsSnapshot = await adminDb.collectionGroup("deals").get();
    if (dealsSnapshot.empty) {
      return NextResponse.json({ success: true, appended: 0, updated: 0 });
    }

    const customerIds = new Set<string>();
    const deals = dealsSnapshot.docs.map((doc) => {
      const data = doc.data() as any;
      const customerId = doc.ref.parent.parent?.id || data.customerId;
      if (customerId) customerIds.add(customerId);
      return {
        id: doc.id,
        customerId,
        data,
      };
    });

    const customerRefs = Array.from(customerIds).map((id) => adminDb.collection("customers").doc(id));
    const customerDocs = customerRefs.length ? await adminDb.getAll(...customerRefs) : [];
    const customersById = new Map<string, any>();
    customerDocs.forEach((doc) => {
      if (doc.exists) customersById.set(doc.id, doc.data());
    });

    const dealProductsSnapshot = await adminDb.collection("dealProducts").get();
    const dealProductsByDealId = new Map<string, any>();
    dealProductsSnapshot.docs.forEach((doc) => {
      dealProductsByDealId.set(doc.id, doc.data());
    });

    const o2dSnapshot = await adminDb.collection("o2d").get();
    const o2dByDealId = new Map<string, any>();
    o2dSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const key = String(data?.dealId || doc.id);
      o2dByDealId.set(key, data);
    });

    const quotationsSnapshot = await adminDb.collectionGroup("quotations").get();
    const quotationCreatedAtByDealId = new Map<string, string>();
    const quotationsByDealId = new Map<string, QuotationRecord[]>();
    const quotationById = new Map<string, QuotationRecord>();
    const quotationByNo = new Map<string, QuotationRecord>();
    quotationsSnapshot.docs.forEach((doc) => {
      const dealId = doc.ref.parent.parent?.id;
      if (!dealId) return;
      const data = doc.data() as any;
      const createdAt = data?.createdAt;
      if (createdAt) {
        const existing = quotationCreatedAtByDealId.get(dealId);
        if (!existing || new Date(createdAt).getTime() < new Date(existing).getTime()) {
          quotationCreatedAtByDealId.set(dealId, createdAt);
        }
      }

      const record: QuotationRecord = {
        id: doc.id,
        dealId,
        quotationNo: data?.quotationNo,
        createdAt,
        status: data?.status,
        items: getQuotationItemLabels(data),
      };

      quotationById.set(record.id, record);
      if (record.quotationNo) quotationByNo.set(String(record.quotationNo), record);
      const list = quotationsByDealId.get(dealId) || [];
      list.push(record);
      quotationsByDealId.set(dealId, list);
    });

    const measurementsSnapshot = await adminDb.collectionGroup("measurements").get();
    const measurementByDealId = new Map<string, string>();
    measurementsSnapshot.docs.forEach((doc) => {
      const dealId = doc.ref.parent.parent?.id;
      if (!dealId) return;
      const createdAt = doc.data()?.createdAt;
      if (!createdAt) return;
      const existing = measurementByDealId.get(dealId);
      if (!existing || new Date(createdAt).getTime() > new Date(existing).getTime()) {
        measurementByDealId.set(dealId, createdAt);
      }
    });

    const ordersSnapshot = await adminDb.collection("orders").get();
    const orderByDealId = new Map<string, any>();
    ordersSnapshot.docs.forEach((doc) => {
      const data = doc.data() as any;
      const dealId = data.dealId;
      if (!dealId) return;
      const existing = orderByDealId.get(dealId);
      const candidateTime = new Date(data.approvedAt || data.createdAt || 0).getTime();
      const existingTime = existing ? new Date(existing.approvedAt || existing.createdAt || 0).getTime() : 0;
      if (!existing || candidateTime > existingTime) {
        orderByDealId.set(dealId, { id: doc.id, ...data });
      }
    });

    const rows: string[][] = [];

    const pickQuotationForItems = (dealId: string, order: any) => {
      const byId = order?.quotationId ? quotationById.get(String(order.quotationId)) : undefined;
      if (byId) return byId;
      const orderQuotationNo = order?.quotationNo || order?.crmOrderNo;
      if (orderQuotationNo) {
        const byNo = quotationByNo.get(String(orderQuotationNo));
        if (byNo) return byNo;
      }
      const list = quotationsByDealId.get(dealId) || [];
      if (!list.length) return undefined;
      const converted = list.find((q) => q.status === "Converted to Order" && q.items.length > 0);
      if (converted) return converted;
      const approved = list.find((q) => q.status === "Approved" && q.items.length > 0);
      if (approved) return approved;
      const withItems = list.filter((q) => q.items.length > 0);
      if (withItems.length === 1) return withItems[0];
      if (withItems.length > 1) {
        return withItems.reduce((best, current) => {
          const bestTime = new Date(best.createdAt || 0).getTime();
          const currentTime = new Date(current.createdAt || 0).getTime();
          return currentTime > bestTime ? current : best;
        }, withItems[0]);
      }
      return list.reduce((best, current) => {
        const bestTime = new Date(best.createdAt || 0).getTime();
        const currentTime = new Date(current.createdAt || 0).getTime();
        return currentTime > bestTime ? current : best;
      }, list[0]);
    };

    deals.forEach(({ id, customerId, data }) => {
      const dealId = String(data.dealId || id);
      const customer = data.customer || customersById.get(customerId) || {};
      const customerName = customer.name || data.customerName || "N/A";
      const mobile = customer.phone || customer.mobileNo || data.customer?.phone || data.customer?.mobileNo || "";
      const order = orderByDealId.get(dealId);
      const salesMan =
        data.assignedSalesPerson?.name ||
        order?.salesPerson ||
        customersById.get(customerId)?.assignedSalesPerson?.name ||
        "";
      const o2d = o2dByDealId.get(dealId);
      const measurementMilestone = (Array.isArray(o2d?.milestones) ? o2d.milestones : []).find(
        (m: any) => Number(m?.stepId) === 2
      );
      const measurementAt = measurementMilestone?.completedAt || measurementByDealId.get(dealId) || "";
      const quotationAt = quotationCreatedAtByDealId.get(dealId) || "";
      const approvalAt = order?.approvedAt || "";
      const address =
        buildAddress(customer) ||
        buildOrderAddress(order) ||
        data.customerAddress ||
        data.address ||
        "";

      const dealProducts = dealProductsByDealId.get(dealId);
      const quotationForItems = pickQuotationForItems(dealId, order);
      const quotationItems = quotationForItems?.items || [];
      const orderItems = getOrderItemLabels(order);
      const dealProductItems = getDealProductItemLabels(dealProducts);
      const fallbackTitle = data.title || data.dealName || "";

      const itemList =
        quotationItems.length > 0
          ? quotationItems
          : orderItems.length > 0
            ? orderItems
            : dealProductItems.length > 0
              ? dealProductItems
              : fallbackTitle
                ? [fallbackTitle]
                : [""];

      const timestampSource = data.dates?.createdAt || data.createdAt || order?.createdAt || "";
      const orderId = order?.crmOrderNo || order?.orderNo || order?.id || "";

      itemList.forEach((itemLabel) => {
        rows.push([
          formatSheetDate(timestampSource),
          customerName,
          mobile,
          itemLabel,
          salesMan,
          dealId,
          address,
          orderId,
          formatSheetDate(measurementAt),
          formatSheetDate(quotationAt),
          formatSheetDate(approvalAt),
        ]);
      });
    });

    const isRowBlank = (row: any[]) =>
      !Array.isArray(row) ||
      row.length === 0 ||
      row.every((cell) => String(cell ?? "").trim() === "");

    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:K`,
    });

    const existingValues = existingResponse.data.values || [];
    const existingHeader = existingValues[0] || [];
    const headerNormalized = existingHeader.map(normalize);
    const headerMatchCount = canonicalHeader.filter((label) =>
      headerNormalized.includes(normalize(label))
    ).length;
    const hasHeader = headerMatchCount >= 3;
    const headerRowIndex = hasHeader ? 0 : -1;
    const dataRows = hasHeader ? existingValues.slice(1) : existingValues;

    const headerIndex = new Map<string, number>();
    (hasHeader ? existingHeader : canonicalHeader).forEach((label: string, index: number) => {
      const key = normalize(label);
      if (key && !headerIndex.has(key)) headerIndex.set(key, index);
    });

    const getCell = (row: any[], label: string) => {
      const idx = headerIndex.get(normalize(label));
      if (idx === undefined) return "";
      return row?.[idx] ?? "";
    };

    const existingRowMap = new Map<string, { rowIndex: number; row: any[] }>();
    dataRows.forEach((row, idx) => {
      if (isRowBlank(row)) return;
      const normalizedRow = canonicalHeader.map((label) => getCell(row, label));
      const key = getRowKey(normalizedRow);
      if (!key) return;
      existingRowMap.set(key, { rowIndex: idx + 2, row });
    });

    const rowsToAppend: any[] = [];
    const rowsToUpdate: { range: string; values: any[][] }[] = [];

    rows.forEach((row) => {
      if (isRowBlank(row)) return;
      const key = getRowKey(row);
      const existing = existingRowMap.get(key);
      if (existing) {
        const existingRow = canonicalHeader.map((label) => getCell(existing.row, label));
        const same =
          existingRow.length === row.length &&
          existingRow.every((cell, idx) => String(cell ?? "").trim() === String(row[idx] ?? "").trim());
        if (!same) {
          rowsToUpdate.push({
            range: `${sheetName}!A${existing.rowIndex}:K${existing.rowIndex}`,
            values: [row],
          });
        }
      } else {
        rowsToAppend.push(row);
      }
    });

    if (!hasHeader) {
      rowsToAppend.unshift(canonicalHeader);
    }

    if (rowsToUpdate.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: rowsToUpdate,
        },
      });
    }

    if (rowsToAppend.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${sheetName}!A1`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: rowsToAppend,
        },
      });
    }

    return NextResponse.json({
      success: true,
      appended: rowsToAppend.length,
      updated: rowsToUpdate.length,
    });
  } catch (error) {
    console.error("Order sheet sync failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
