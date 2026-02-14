import { NextResponse } from "next/server";
import { google } from "googleapis";
import { adminDb } from "@/lib/firebase-admin";

const DEFAULT_SHEET_ID = "11gMXD3ZQiH7D9NtCFx1q3COH18jQQRTh3mLSaa8RFKA";
const DEFAULT_SHEET_NAME = "Sheet2";
const DEFAULT_PURCHASE_SHEET_NAME = "Purchase";

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
  "Quotation Approval Time",
  "Quotation To Order Time",
  "Stock Verification Timestamp",
  "Stock Verification Status",
  "Order Type",
];

const purchaseCanonicalHeader = [
  "DealId",
  "OrderId",
  "ItemName",
  "Vendor Name",
  "Qty",
  "Unit",
  "Salesman",
  "PO Generate Time",
  "PO Follow Up Time",
  "Expected Delivery (Days)",
  "PO Receiving Time",
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

const formatOrderTypeLabel = (value?: string) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "";
  return normalized
    .split("+")
    .map((part) =>
      part
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
        .join(" ")
    )
    .join(" + ");
};

const normalizeStockVerificationStatus = (value?: string) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "";
  if (
    normalized === "in stock" ||
    normalized === "instock" ||
    normalized === "in_stock" ||
    normalized === "allocated"
  ) {
    return "Instock";
  }
  if (
    normalized === "out of stock" ||
    normalized === "outstock" ||
    normalized === "out_stock" ||
    normalized === "pr created" ||
    normalized === "po generated" ||
    normalized === "pending for po"
  ) {
    return "Outstock";
  }
  if (normalized.includes("pending")) return "Pending";
  return String(value ?? "").trim();
};

type QuotationRecord = {
  id: string;
  dealId: string;
  quotationNo?: string;
  createdAt?: string;
  status?: string;
  approvedAt?: string;
  convertedAt?: string;
  updatedAt?: string;
  items: string[];
};

type ApprovedStockRecord = {
  id: string;
  orderId?: string;
  dealId?: string;
  fabricName?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
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

const SHEET_LAST_COLUMN = getColumnLetter(canonicalHeader.length);
const PURCHASE_SHEET_LAST_COLUMN = getColumnLetter(purchaseCanonicalHeader.length);

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

const getRecordTime = (record?: { updatedAt?: string; createdAt?: string }) =>
  new Date(record?.updatedAt || record?.createdAt || 0).getTime();

const pickLatestApprovedStockRecord = (records: ApprovedStockRecord[]) => {
  if (!records.length) return undefined;
  return records.reduce((latest, current) =>
    getRecordTime(current) > getRecordTime(latest) ? current : latest
  );
};

const findApprovedStockForItem = (records: ApprovedStockRecord[], itemLabel: string) => {
  if (!records.length) return undefined;
  const itemKey = normalize(itemLabel);
  if (itemKey) {
    const exactMatches = records.filter((record) => normalize(record.fabricName) === itemKey);
    if (exactMatches.length > 0) return pickLatestApprovedStockRecord(exactMatches);
    const fuzzyMatches = records.filter((record) => {
      const recordKey = normalize(record.fabricName);
      if (!recordKey) return false;
      return recordKey.includes(itemKey) || itemKey.includes(recordKey);
    });
    if (fuzzyMatches.length > 0) return pickLatestApprovedStockRecord(fuzzyMatches);
  }
  return pickLatestApprovedStockRecord(records);
};

const findOrderFabricStatusForItem = (order: any, itemLabel: string) => {
  const fabricDetails = Array.isArray(order?.fabricDetails) ? order.fabricDetails : [];
  if (!fabricDetails.length) return "";
  const itemKey = normalize(itemLabel);
  if (!itemKey) return "";
  const exactMatch = fabricDetails.find((fabric: any) => normalize(fabric?.fabricName) === itemKey);
  if (exactMatch) return normalizeStockVerificationStatus(exactMatch?.status);
  const fuzzyMatch = fabricDetails.find((fabric: any) => {
    const fabricName = normalize(fabric?.fabricName);
    if (!fabricName) return false;
    return fabricName.includes(itemKey) || itemKey.includes(fabricName);
  });
  return normalizeStockVerificationStatus(fuzzyMatch?.status);
};

const pickLatestMilestone = (
  milestones: any[] | undefined,
  stepId: number,
  itemName?: string
) => {
  const list = Array.isArray(milestones)
    ? milestones.filter((m) => Number(m?.stepId) === Number(stepId))
    : [];
  if (!list.length) return undefined;

  if (itemName) {
    const itemKey = normalize(itemName);
    const exact = list.filter((m) => normalize(m?.itemName) === itemKey);
    if (exact.length > 0) {
      return exact.reduce((latest, current) =>
        new Date(current?.completedAt || 0).getTime() > new Date(latest?.completedAt || 0).getTime()
          ? current
          : latest
      );
    }
    const fuzzy = list.filter((m) => {
      const key = normalize(m?.itemName);
      if (!key) return false;
      return key.includes(itemKey) || itemKey.includes(key);
    });
    if (fuzzy.length > 0) {
      return fuzzy.reduce((latest, current) =>
        new Date(current?.completedAt || 0).getTime() > new Date(latest?.completedAt || 0).getTime()
          ? current
          : latest
      );
    }
    const generic = list.filter((m) => !normalize(m?.itemName));
    if (generic.length > 0) {
      return generic.reduce((latest, current) =>
        new Date(current?.completedAt || 0).getTime() > new Date(latest?.completedAt || 0).getTime()
          ? current
          : latest
      );
    }
  }

  return list.reduce((latest, current) =>
    new Date(current?.completedAt || 0).getTime() > new Date(latest?.completedAt || 0).getTime()
      ? current
      : latest
  );
};

const getDaysBetween = (from?: string, to?: string) => {
  if (!from || !to) return "";
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return "";
  const millisPerDay = 24 * 60 * 60 * 1000;
  const days = Math.ceil((toDate.getTime() - fromDate.getTime()) / millisPerDay);
  return String(days);
};

const getPurchaseRowKey = (row: string[]) =>
  [row[0], row[1], row[2], row[3], row[4], row[6], row[7]].map(normalize).join("|");

const getDateTimeScore = (value?: string) => {
  const time = new Date(String(value || "")).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const mergeDuplicatePurchaseRows = (rows: string[][]) => {
  const byKey = new Map<string, string[]>();
  rows.forEach((row) => {
    const key = getPurchaseRowKey(row);
    if (!key) return;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      return;
    }

    const merged = existing.slice();
    row.forEach((value, idx) => {
      if (!String(merged[idx] ?? "").trim() && String(value ?? "").trim()) {
        merged[idx] = value;
      }
    });

    // Prefer latest timestamps when same logical PO row appears multiple times.
    [7, 8, 10].forEach((idx) => {
      if (getDateTimeScore(row[idx]) > getDateTimeScore(merged[idx])) {
        merged[idx] = row[idx];
      }
    });

    byKey.set(key, merged);
  });
  return Array.from(byKey.values());
};

export async function POST() {
  try {
    const sheets = await getSheetsClient();
    const sheetId = process.env.ORDER_SHEET_ID || DEFAULT_SHEET_ID;
    const sheetName = process.env.ORDER_SHEET_NAME || DEFAULT_SHEET_NAME;
    const purchaseSheetName = process.env.PURCHASE_SHEET_NAME || DEFAULT_PURCHASE_SHEET_NAME;

    const dealsSnapshot = await adminDb.collectionGroup("deals").get();

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
        approvedAt: data?.approvedAt,
        convertedAt: data?.convertedAt,
        updatedAt: data?.updatedAt,
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

    const approvedStockSnapshot = await adminDb.collection("approvedStock").get();
    const approvedStockByOrderId = new Map<string, ApprovedStockRecord[]>();
    const approvedStockByDealId = new Map<string, ApprovedStockRecord[]>();
    const addApprovedStockRecord = (
      map: Map<string, ApprovedStockRecord[]>,
      key: string | undefined,
      record: ApprovedStockRecord
    ) => {
      if (!key) return;
      const list = map.get(key) || [];
      list.push(record);
      map.set(key, list);
    };
    approvedStockSnapshot.docs.forEach((doc) => {
      const data = doc.data() as any;
      const record: ApprovedStockRecord = {
        id: doc.id,
        orderId: data?.orderId ? String(data.orderId) : undefined,
        dealId: data?.dealId ? String(data.dealId) : undefined,
        fabricName: data?.fabricName || data?.itemDetail?.fabricName,
        status: data?.status,
        createdAt: data?.createdAt,
        updatedAt: data?.updatedAt,
      };
      addApprovedStockRecord(approvedStockByOrderId, record.orderId, record);
      addApprovedStockRecord(approvedStockByDealId, record.dealId, record);
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
      const dealProducts = dealProductsByDealId.get(dealId);
      const quotationForItems = pickQuotationForItems(dealId, order);
      const measurementAt = measurementMilestone?.completedAt || measurementByDealId.get(dealId) || "";
      const quotationAt = quotationCreatedAtByDealId.get(dealId) || "";
      const approvalAt = order?.approvedAt || "";
      const quotationApprovalAt = quotationForItems?.approvedAt || "";
      const quotationToOrderAt =
        order?.createdAt ||
        quotationForItems?.convertedAt ||
        quotationForItems?.updatedAt ||
        "";
      const orderType = formatOrderTypeLabel(order?.orderType);
      const address =
        buildAddress(customer) ||
        buildOrderAddress(order) ||
        data.customerAddress ||
        data.address ||
        "";
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
      const approvedStockRecords = (() => {
        const combined: ApprovedStockRecord[] = [];
        const seen = new Set<string>();
        const addMany = (records?: ApprovedStockRecord[]) => {
          (records || []).forEach((record) => {
            if (seen.has(record.id)) return;
            seen.add(record.id);
            combined.push(record);
          });
        };
        addMany(order?.id ? approvedStockByOrderId.get(String(order.id)) : undefined);
        addMany(approvedStockByDealId.get(dealId));
        return combined;
      })();

      itemList.forEach((itemLabel) => {
        const stockRecord = findApprovedStockForItem(approvedStockRecords, itemLabel);
        const stockVerificationStatus =
          normalizeStockVerificationStatus(stockRecord?.status) ||
          findOrderFabricStatusForItem(order, itemLabel);
        const stockVerificationAt =
          stockVerificationStatus && stockVerificationStatus !== "Pending"
            ? formatSheetDate(stockRecord?.updatedAt || stockRecord?.createdAt)
            : "";
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
          formatSheetDate(quotationApprovalAt),
          formatSheetDate(quotationToOrderAt),
          stockVerificationAt,
          stockVerificationStatus,
          orderType,
        ]);
      });
    });

    const isRowBlank = (row: any[]) =>
      !Array.isArray(row) ||
      row.length === 0 ||
      row.every((cell) => String(cell ?? "").trim() === "");

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
            range: `${sheetName}!A${existing.rowIndex}:${SHEET_LAST_COLUMN}${existing.rowIndex}`,
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

    const purchaseRequestsSnapshot = await adminDb.collection("purchaseRequests").get();
    const inboundsSnapshot = await adminDb.collection("inbounds").get();

    const inboundByPoItem = new Map<string, { unit?: string; receivingAt?: string }>();
    inboundsSnapshot.docs.forEach((doc) => {
      const inboundData = doc.data() as any;
      const poNumber = String(inboundData?.id || doc.id);
      const inboundItems = Array.isArray(inboundData?.items) ? inboundData.items : [];
      inboundItems.forEach((inboundItem: any) => {
        const itemName = String(inboundItem?.itemName || "").trim();
        if (!itemName) return;
        const key = `${poNumber}|${normalize(itemName)}`;
        const receivingMilestone = pickLatestMilestone(inboundItem?.inboundMilestones, 3);
        inboundByPoItem.set(key, {
          unit: inboundItem?.unit,
          receivingAt: receivingMilestone?.completedAt,
        });
      });
    });

    const purchaseRows: string[][] = [];
    purchaseRequestsSnapshot.docs.forEach((doc) => {
      const request = { id: doc.id, ...(doc.data() as any) };
      const poGenerateMilestone = pickLatestMilestone(request.milestones, 4);
      const poConfirmationMilestone = pickLatestMilestone(request.poMilestones, 1);
      const poGenerateAt =
        poGenerateMilestone?.completedAt || poConfirmationMilestone?.completedAt || request.createdAt || "";
      const dealId = String(request.dealId || "");
      const orderId = String(request.quotationNo || request.dealId || request.id || "");
      const salesman = String(request.salesman || "");

      const requestItems = [
        ...((Array.isArray(request.fabricDetails) ? request.fabricDetails : []).map((item: any) => ({
          itemName: item?.fabricName,
          vendorName: item?.vendorName,
          quantity: item?.quantity,
          unit: item?.unit,
          poNumber: item?.poNumber,
          expectedDeliveryDate: item?.expectedDeliveryDate,
        }))),
        ...((Array.isArray(request.furnitureDetails) ? request.furnitureDetails : []).map((item: any) => ({
          itemName: item?.furnitureName,
          vendorName: item?.vendorName,
          quantity: item?.quantity,
          unit: item?.unit,
          poNumber: item?.poNumber,
          expectedDeliveryDate: item?.expectedDeliveryDate,
        }))),
      ];

      requestItems.forEach((item) => {
        const itemName = String(item?.itemName || "").trim();
        const poNumber = String(item?.poNumber || "").trim();
        if (!itemName || !poNumber) return;

        const poItemKey = `${poNumber}|${normalize(itemName)}`;
        const inboundMeta = inboundByPoItem.get(poItemKey);
        const followUpMilestone = pickLatestMilestone(request.poMilestones, 2, itemName);
        const receivingMilestone = pickLatestMilestone(request.poMilestones, 3, itemName);

        const expectedDeliveryAt =
          item?.expectedDeliveryDate || request.promiseDeliveryDate || request.poDeliveryDate || "";
        const expectedDeliveryDays = getDaysBetween(poGenerateAt || request.createdAt, expectedDeliveryAt);
        const poReceivingAt = receivingMilestone?.completedAt || inboundMeta?.receivingAt || "";
        const unit = String(
          item?.unit || inboundMeta?.unit || (String(request.type || "").toLowerCase() === "furniture" ? "Pcs" : "Mtr")
        );
        const vendorName = String(item?.vendorName || request.vendor || "");

        purchaseRows.push([
          dealId,
          orderId,
          itemName,
          vendorName,
          String(item?.quantity ?? ""),
          unit,
          salesman,
          formatSheetDate(poGenerateAt),
          formatSheetDate(followUpMilestone?.completedAt),
          expectedDeliveryDays,
          formatSheetDate(poReceivingAt),
        ]);
      });
    });
    const uniquePurchaseRows = mergeDuplicatePurchaseRows(purchaseRows);

    const existingPurchaseResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${purchaseSheetName}!A1:${PURCHASE_SHEET_LAST_COLUMN}`,
    });
    const existingPurchaseValues = existingPurchaseResponse.data.values || [];
    const existingPurchaseHeader = existingPurchaseValues[0] || [];
    const purchaseHeaderNormalized = existingPurchaseHeader.map(normalize);
    const purchaseHeaderMatchCount = purchaseCanonicalHeader.filter((label) =>
      purchaseHeaderNormalized.includes(normalize(label))
    ).length;
    const hasPurchaseHeader = purchaseHeaderMatchCount >= 3;
    const purchaseDataRows = hasPurchaseHeader ? existingPurchaseValues.slice(1) : existingPurchaseValues;

    const purchaseHeaderIndex = new Map<string, number>();
    (hasPurchaseHeader ? existingPurchaseHeader : purchaseCanonicalHeader).forEach(
      (label: string, index: number) => {
        const key = normalize(label);
        if (key && !purchaseHeaderIndex.has(key)) purchaseHeaderIndex.set(key, index);
      }
    );

    const getPurchaseCell = (row: any[], label: string) => {
      const idx = purchaseHeaderIndex.get(normalize(label));
      if (idx === undefined) return "";
      return row?.[idx] ?? "";
    };

    const existingPurchaseRowMap = new Map<string, { rowIndex: number; row: any[] }>();
    purchaseDataRows.forEach((row, idx) => {
      if (isRowBlank(row)) return;
      const normalizedRow = purchaseCanonicalHeader.map((label) => getPurchaseCell(row, label));
      const key = getPurchaseRowKey(normalizedRow);
      if (!key) return;
      existingPurchaseRowMap.set(key, { rowIndex: idx + 2, row });
    });

    const purchaseRowsToAppend: any[] = [];
    const purchaseRowsToUpdate: { range: string; values: any[][] }[] = [];
    uniquePurchaseRows.forEach((row) => {
      if (isRowBlank(row)) return;
      const key = getPurchaseRowKey(row);
      const existing = existingPurchaseRowMap.get(key);
      if (existing) {
        const existingRow = purchaseCanonicalHeader.map((label) => getPurchaseCell(existing.row, label));
        const same =
          existingRow.length === row.length &&
          existingRow.every((cell, idx) => String(cell ?? "").trim() === String(row[idx] ?? "").trim());
        if (!same) {
          purchaseRowsToUpdate.push({
            range: `${purchaseSheetName}!A${existing.rowIndex}:${PURCHASE_SHEET_LAST_COLUMN}${existing.rowIndex}`,
            values: [row],
          });
        }
      } else {
        purchaseRowsToAppend.push(row);
      }
    });

    if (!hasPurchaseHeader) {
      purchaseRowsToAppend.unshift(purchaseCanonicalHeader);
    }

    if (purchaseRowsToUpdate.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: purchaseRowsToUpdate,
        },
      });
    }

    if (purchaseRowsToAppend.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${purchaseSheetName}!A1`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: purchaseRowsToAppend,
        },
      });
    }

    return NextResponse.json({
      success: true,
      appended: rowsToAppend.length,
      updated: rowsToUpdate.length,
      purchaseAppended: purchaseRowsToAppend.length,
      purchaseUpdated: purchaseRowsToUpdate.length,
    });
  } catch (error) {
    console.error("Order sheet sync failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
