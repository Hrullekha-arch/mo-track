import { NextResponse } from "next/server";
import { google } from "googleapis";
import { adminDb } from "@/lib/firebase-admin";

const DEFAULT_SHEET_ID = "11gMXD3ZQiH7D9NtCFx1q3COH18jQQRTh3mLSaa8RFKA";
const DEFAULT_SHEET_NAME = "Sheet2";
const DEFAULT_PURCHASE_SHEET_NAME = "Purchase";
const SYNC_ROUTE_VERSION = "2026-02-28-purchase-docket-v4";

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
  "Customer Name",
  "ItemName",
  "Vendor Name",
  "Qty",
  "Unit",
  "Salesman",
  "PO Number",
  "PR Created",
  "PO Generate Time",
  "PO Follow Up Time",
  "Expected Delivery (Days)",
  "PO Receiving Time",
  "Stock Verification Timestamp",
  "InStock",
  "Docket No",
];

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

const IST_TIMEZONE = "Asia/Kolkata";

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

const formatSheetDate = (value?: unknown) => {
  if (!value) return "";
  const date = toDateInstance(value);
  if (!date) return "";
  return date.toLocaleString("en-IN", {
    timeZone: IST_TIMEZONE,
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

const normalizePrCreatedStatus = (value?: string) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "";
  if (
    normalized === "po generated" ||
    normalized === "pr created" ||
    normalized === "approved" ||
    normalized === "completed"
  ) {
    return "Yes";
  }
  if (normalized === "pending approval" || normalized === "pending for po" || normalized === "cancelled") {
    return "No";
  }
  return "";
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
const MAX_BATCH_UPDATE_ROWS = 500;
const MAX_APPEND_ROWS = 1000;

const chunkArray = <T>(values: T[], size: number): T[][] => {
  if (!values.length) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

const buildCompositeKey = (parts: unknown[]) => {
  const normalizedParts = parts.map((part) => normalize(part));
  if (!normalizedParts.some(Boolean)) return "";
  return normalizedParts.join("|");
};

const dedupeKeyCandidates = (candidates: string[]) => Array.from(new Set(candidates.filter(Boolean)));

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

const getOrderRowKeyCandidates = (row: string[]) => {
  const timestamp = row[0] || "";
  const customerName = row[1] || "";
  const itemName = row[3] || "";
  const dealId = row[5] || "";
  const orderId = row[7] || "";

  const candidates = [
    // Primary key expected for stable row identity.
    buildCompositeKey([dealId, orderId, customerName, itemName]),
    // Fallbacks to keep row stable when one identifier is temporarily missing.
    buildCompositeKey([dealId, "", customerName, itemName]),
    buildCompositeKey(["", orderId, customerName, itemName]),
    buildCompositeKey([dealId, orderId, "", itemName]),
    buildCompositeKey([dealId, "", "", itemName]),
    buildCompositeKey(["", orderId, "", itemName]),
    // Legacy fallback for previously synced rows.
    (() => {
      const legacyBase =
        normalize(dealId) || normalize(orderId) || buildCompositeKey([customerName, timestamp]);
      const itemKey = normalize(itemName);
      if (!legacyBase) return "";
      return itemKey ? `${legacyBase}|${itemKey}` : legacyBase;
    })(),
  ];

  return dedupeKeyCandidates(candidates);
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

const getOrderMaterialLines = (order: any) => {
  if (!order) return [];

  const lines: Array<{
    itemName: string;
    quantity?: string | number;
    unit?: string;
    status?: string;
  }> = [];

  const pushLine = (itemName: unknown, quantity?: unknown, unit?: unknown, status?: unknown) => {
    const label = String(itemName ?? "").trim();
    if (!label) return;
    lines.push({
      itemName: label,
      quantity: quantity === undefined || quantity === null ? "" : String(quantity),
      unit: String(unit ?? "").trim(),
      status: String(status ?? "").trim(),
    });
  };

  (Array.isArray(order.fabricDetails) ? order.fabricDetails : []).forEach((item: any) => {
    pushLine(item?.fabricName, item?.quantity, item?.unit || "Mtr", item?.status);
  });

  (Array.isArray(order.furnitureDetails) ? order.furnitureDetails : []).forEach((item: any) => {
    pushLine(item?.furnitureName, item?.quantity, item?.unit || "Pcs", item?.status);
  });

  if (lines.length > 0) return lines;

  const fallbackItems = order?.sections?.NORMAL?.items || [];
  fallbackItems.forEach((item: any) => {
    pushLine(item?.bcn || item?.description || item?.itemName, item?.qty, item?.unit, item?.status);
  });

  return lines;
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

const getPurchaseRowKeyCandidates = (row: string[]) => {
  const dealId = row[0] || "";
  const orderId = row[1] || "";
  const customerName = row[2] || "";
  const itemName = row[3] || "";

  const candidates = [
    // Primary key expected for stable row identity.
    buildCompositeKey([dealId, orderId, customerName, itemName]),
    // Legacy fallback used by previous sync versions.
    buildCompositeKey([dealId, orderId, "", itemName]),
    // Fallbacks for partial/in-flight records.
    buildCompositeKey([dealId, "", customerName, itemName]),
    buildCompositeKey(["", orderId, customerName, itemName]),
    buildCompositeKey([dealId, "", "", itemName]),
    buildCompositeKey(["", orderId, "", itemName]),
  ];

  return dedupeKeyCandidates(candidates);
};

const getPurchaseRowKey = (row: string[]) => getPurchaseRowKeyCandidates(row)[0] || "";

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
    [10, 11, 13, 14].forEach((idx) => {
      if (getDateTimeScore(row[idx]) > getDateTimeScore(merged[idx])) {
        merged[idx] = row[idx];
      }
    });

    // Prefer affirmative flags when duplicates collide.
    [9, 15].forEach((idx) => {
      const incoming = String(row[idx] || "").trim().toLowerCase();
      const current = String(merged[idx] || "").trim().toLowerCase();
      if (incoming === "yes" && current !== "yes") {
        merged[idx] = "Yes";
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
    const isHeaderExact =
      existingHeader.length >= canonicalHeader.length &&
      canonicalHeader.every((label, index) => normalize(existingHeader[index]) === normalize(label));
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

    type ExistingOrderRowRef = {
      rowIndex: number;
      canonicalRow: string[];
      consumed: boolean;
    };

    const existingOrderRowKeyMap = new Map<string, ExistingOrderRowRef[]>();
    const addOrderRowRef = (key: string, rowRef: ExistingOrderRowRef) => {
      if (!key) return;
      const list = existingOrderRowKeyMap.get(key) || [];
      list.push(rowRef);
      existingOrderRowKeyMap.set(key, list);
    };

    dataRows.forEach((row, idx) => {
      if (isRowBlank(row)) return;
      const canonicalRow = canonicalHeader.map((label) => String(getCell(row, label) ?? ""));
      const rowRef: ExistingOrderRowRef = {
        rowIndex: idx + 2,
        canonicalRow,
        consumed: false,
      };
      getOrderRowKeyCandidates(canonicalRow).forEach((key) => addOrderRowRef(key, rowRef));
    });

    const findMatchingOrderRow = (row: string[]) => {
      const candidates = getOrderRowKeyCandidates(row);
      for (const candidate of candidates) {
        const list = existingOrderRowKeyMap.get(candidate);
        if (!list || !list.length) continue;
        const match = list.find((entry) => !entry.consumed);
        if (match) return match;
      }
      return undefined;
    };

    const rowsToAppend: string[][] = [];
    const rowsToUpdate: { range: string; values: any[][] }[] = [];

    rows.forEach((row) => {
      if (isRowBlank(row)) return;
      const canonicalRow = canonicalHeader.map((_, index) => String(row[index] ?? ""));
      const existing = findMatchingOrderRow(canonicalRow);
      if (existing) {
        existing.consumed = true;
        const existingRow = existing.canonicalRow;
        const same =
          existingRow.length === canonicalRow.length &&
          existingRow.every(
            (cell, idx) => String(cell ?? "").trim() === String(canonicalRow[idx] ?? "").trim()
          );
        if (!same) {
          rowsToUpdate.push({
            range: `${sheetName}!A${existing.rowIndex}:${SHEET_LAST_COLUMN}${existing.rowIndex}`,
            values: [canonicalRow],
          });
        }
      } else {
        rowsToAppend.push(canonicalRow);
      }
    });

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

    if (!hasHeader) {
      rowsToAppend.unshift(canonicalHeader);
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

    const dealMetaByDealId = new Map<
      string,
      {
        customerName: string;
        salesman: string;
      }
    >();
    deals.forEach(({ id, customerId, data }) => {
      const dealId = String(data?.dealId || id || "");
      if (!dealId) return;
      const customer = data?.customer || customersById.get(customerId) || {};
      const customerName = String(customer?.name || data?.customerName || "").trim();
      const salesman = String(
        data?.assignedSalesPerson?.name ||
          customersById.get(customerId)?.assignedSalesPerson?.name ||
          ""
      ).trim();
      dealMetaByDealId.set(dealId, { customerName, salesman });
    });

    const getApprovedStockRecordsForDeal = (dealId: string, orderForDeal: any) => {
      const combined: ApprovedStockRecord[] = [];
      const seen = new Set<string>();
      const addMany = (records?: ApprovedStockRecord[]) => {
        (records || []).forEach((record) => {
          if (seen.has(record.id)) return;
          seen.add(record.id);
          combined.push(record);
        });
      };
      addMany(orderForDeal?.id ? approvedStockByOrderId.get(String(orderForDeal.id)) : undefined);
      addMany(approvedStockByDealId.get(dealId));
      return combined;
    };

    // Baseline: include all BCN/items present in order/deal regardless of PR creation.
    deals.forEach(({ id, data }) => {
      const dealId = String(data?.dealId || id || "").trim();
      if (!dealId) return;
      const orderForDeal = orderByDealId.get(dealId);
      const orderId = String(orderForDeal?.crmOrderNo || orderForDeal?.orderNo || orderForDeal?.id || dealId);
      const dealMeta = dealMetaByDealId.get(dealId);
      const customerName = String(
        orderForDeal?.customerName || orderForDeal?.customerSnapshot?.name || dealMeta?.customerName || ""
      ).trim();
      const salesman = String(orderForDeal?.salesPerson || dealMeta?.salesman || "").trim();
      const approvedStockRecords = getApprovedStockRecordsForDeal(dealId, orderForDeal);

      const baselineItems = (() => {
        const lines = getOrderMaterialLines(orderForDeal);
        if (lines.length > 0) return lines;
        const productItems = getDealProductItemLabels(dealProductsByDealId.get(dealId));
        return productItems.map((itemName) => ({ itemName }));
      })();

      baselineItems.forEach((line: any) => {
        const itemName = String(line?.itemName || "").trim();
        if (!itemName) return;
        const stockRecord = findApprovedStockForItem(approvedStockRecords, itemName);
        const stockVerificationStatus =
          normalizeStockVerificationStatus(stockRecord?.status) ||
          normalizeStockVerificationStatus(line?.status) ||
          findOrderFabricStatusForItem(orderForDeal, itemName);
        const inStockYesNo = stockVerificationStatus === "Instock" ? "Yes" : "No";
        const prCreatedYesNo = normalizePrCreatedStatus(line?.status) || "No";

        purchaseRows.push([
          dealId,
          orderId,
          customerName,
          itemName,
          "",
          String(line?.quantity ?? ""),
          String(line?.unit || ""),
          salesman,
          "",
          prCreatedYesNo,
          "",
          "",
          "",
          "",
          formatSheetDate(stockRecord?.updatedAt || stockRecord?.createdAt),
          inStockYesNo,
          "",
        ]);
      });
    });

    // Enrichment: overlay PR/PO details on top of baseline rows.
    purchaseRequestsSnapshot.docs.forEach((doc) => {
      const request = { id: doc.id, ...(doc.data() as any) };
      const dealId = String(request.dealId || "").trim();
      if (!dealId) return;

      const orderForDeal = orderByDealId.get(dealId);
      const orderId = String(
        orderForDeal?.crmOrderNo || request.quotationNo || request.dealId || request.id || ""
      ).trim();
      const dealMeta = dealMetaByDealId.get(dealId);
      const customerName = String(
        request.customerName || orderForDeal?.customerName || orderForDeal?.customerSnapshot?.name || dealMeta?.customerName || ""
      ).trim();
      const salesman = String(request.salesman || orderForDeal?.salesPerson || dealMeta?.salesman || "").trim();
      const approvedStockRecordsForRequest = getApprovedStockRecordsForDeal(dealId, orderForDeal);

      const poGenerateMilestone = pickLatestMilestone(request.milestones, 4);
      const poConfirmationMilestone = pickLatestMilestone(request.poMilestones, 1);
      const poGenerateAt =
        poGenerateMilestone?.completedAt || poConfirmationMilestone?.completedAt || request.createdAt || "";

      const requestItems = [
        ...((Array.isArray(request.fabricDetails) ? request.fabricDetails : []).map((item: any) => ({
          itemName: item?.fabricName,
          vendorName: item?.vendorName,
          quantity: item?.quantity,
          unit: item?.unit,
          poNumber: item?.poNumber,
          expectedDeliveryDate: item?.expectedDeliveryDate,
          status: item?.status,
        }))),
        ...((Array.isArray(request.furnitureDetails) ? request.furnitureDetails : []).map((item: any) => ({
          itemName: item?.furnitureName,
          vendorName: item?.vendorName,
          quantity: item?.quantity,
          unit: item?.unit,
          poNumber: item?.poNumber,
          expectedDeliveryDate: item?.expectedDeliveryDate,
          status: item?.status,
        }))),
      ];

      requestItems.forEach((item) => {
        const itemName = String(item?.itemName || "").trim();
        if (!itemName) return;

        const poNumber = String(item?.poNumber || "").trim();
        const poItemKey = poNumber ? `${poNumber}|${normalize(itemName)}` : "";
        const inboundMeta = poItemKey ? inboundByPoItem.get(poItemKey) : undefined;
        const followUpMilestone = pickLatestMilestone(request.poMilestones, 2, itemName);
        const receivingMilestone = pickLatestMilestone(request.poMilestones, 3, itemName);
        const docketNo = String(followUpMilestone?.docketNo || "").trim();

        const expectedDeliveryAt =
          item?.expectedDeliveryDate || request.promiseDeliveryDate || request.poDeliveryDate || "";
        const expectedDeliveryDays = getDaysBetween(poGenerateAt || request.createdAt, expectedDeliveryAt);
        const poReceivingAt = receivingMilestone?.completedAt || inboundMeta?.receivingAt || "";
        const unit = String(
          item?.unit || inboundMeta?.unit || (String(request.type || "").toLowerCase() === "furniture" ? "Pcs" : "Mtr")
        );
        const vendorName = String(item?.vendorName || request.vendor || "");
        const stockRecord = findApprovedStockForItem(approvedStockRecordsForRequest, itemName);
        const stockVerificationStatus =
          normalizeStockVerificationStatus(stockRecord?.status) ||
          normalizeStockVerificationStatus(item?.status) ||
          findOrderFabricStatusForItem(orderForDeal, itemName);
        const stockVerificationAtRaw =
          stockRecord?.updatedAt ||
          stockRecord?.createdAt ||
          (stockVerificationStatus === "Instock" ? poReceivingAt : "");
        const inStockYesNo = stockVerificationStatus === "Instock" ? "Yes" : "No";
        const prCreatedYesNo =
          normalizePrCreatedStatus(request.status) ||
          normalizePrCreatedStatus(item?.status) ||
          (poNumber ? "Yes" : "No");

        purchaseRows.push([
          dealId,
          orderId,
          customerName,
          itemName,
          vendorName,
          String(item?.quantity ?? ""),
          unit,
          salesman,
          poNumber,
          prCreatedYesNo || "Yes",
          formatSheetDate(poGenerateAt),
          formatSheetDate(followUpMilestone?.completedAt),
          expectedDeliveryDays,
          formatSheetDate(poReceivingAt),
          formatSheetDate(stockVerificationAtRaw),
          inStockYesNo,
          docketNo,
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
    const isPurchaseHeaderExact =
      existingPurchaseHeader.length >= purchaseCanonicalHeader.length &&
      purchaseCanonicalHeader.every(
        (label, index) => normalize(existingPurchaseHeader[index]) === normalize(label)
      );
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

    type ExistingPurchaseRowRef = {
      rowIndex: number;
      canonicalRow: string[];
      consumed: boolean;
    };

    const existingPurchaseRowKeyMap = new Map<string, ExistingPurchaseRowRef[]>();
    const addPurchaseRowRef = (key: string, rowRef: ExistingPurchaseRowRef) => {
      if (!key) return;
      const list = existingPurchaseRowKeyMap.get(key) || [];
      list.push(rowRef);
      existingPurchaseRowKeyMap.set(key, list);
    };

    purchaseDataRows.forEach((row, idx) => {
      if (isRowBlank(row)) return;
      const canonicalRow = purchaseCanonicalHeader.map((label) => String(getPurchaseCell(row, label) ?? ""));
      const rowRef: ExistingPurchaseRowRef = {
        rowIndex: idx + 2,
        canonicalRow,
        consumed: false,
      };
      getPurchaseRowKeyCandidates(canonicalRow).forEach((key) => addPurchaseRowRef(key, rowRef));
    });

    const findMatchingPurchaseRow = (row: string[]) => {
      const candidates = getPurchaseRowKeyCandidates(row);
      for (const candidate of candidates) {
        const list = existingPurchaseRowKeyMap.get(candidate);
        if (!list || !list.length) continue;
        const match = list.find((entry) => !entry.consumed);
        if (match) return match;
      }
      return undefined;
    };

    const purchaseRowsToAppend: string[][] = [];
    const purchaseRowsToUpdate: { range: string; values: any[][] }[] = [];
    uniquePurchaseRows.forEach((row) => {
      if (isRowBlank(row)) return;
      const canonicalRow = purchaseCanonicalHeader.map((_, index) => String(row[index] ?? ""));
      const existing = findMatchingPurchaseRow(canonicalRow);
      if (existing) {
        existing.consumed = true;
        const existingRow = existing.canonicalRow;
        const same =
          existingRow.length === canonicalRow.length &&
          existingRow.every(
            (cell, idx) => String(cell ?? "").trim() === String(canonicalRow[idx] ?? "").trim()
          );
        if (!same) {
          purchaseRowsToUpdate.push({
            range: `${purchaseSheetName}!A${existing.rowIndex}:${PURCHASE_SHEET_LAST_COLUMN}${existing.rowIndex}`,
            values: [canonicalRow],
          });
        }
      } else {
        purchaseRowsToAppend.push(canonicalRow);
      }
    });

    if (!hasPurchaseHeader) {
      purchaseRowsToAppend.unshift(purchaseCanonicalHeader);
    }

    if (hasPurchaseHeader && !isPurchaseHeaderExact) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${purchaseSheetName}!A1:${PURCHASE_SHEET_LAST_COLUMN}1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [purchaseCanonicalHeader],
        },
      });
    }

    if (purchaseRowsToUpdate.length > 0) {
      for (const chunk of chunkArray(purchaseRowsToUpdate, MAX_BATCH_UPDATE_ROWS)) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            valueInputOption: "USER_ENTERED",
            data: chunk,
          },
        });
      }
    }

    if (purchaseRowsToAppend.length > 0) {
      for (const chunk of chunkArray(purchaseRowsToAppend, MAX_APPEND_ROWS)) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: `${purchaseSheetName}!A1`,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: {
            values: chunk,
          },
        });
      }
    }

    const purchaseStatusSummary = uniquePurchaseRows.reduce(
      (acc, row) => {
        const yesNo = String(row[15] ?? "").trim().toLowerCase();
        if (yesNo === "yes") acc.yes += 1;
        else if (yesNo === "no") acc.no += 1;
        else acc.blank += 1;
        return acc;
      },
      { yes: 0, no: 0, blank: 0 }
    );

    return NextResponse.json({
      success: true,
      syncVersion: SYNC_ROUTE_VERSION,
      appended: rowsToAppend.length,
      updated: rowsToUpdate.length,
      purchaseAppended: purchaseRowsToAppend.length,
      purchaseUpdated: purchaseRowsToUpdate.length,
      purchaseRowsPrepared: uniquePurchaseRows.length,
      purchaseInStockSummary: purchaseStatusSummary,
    });
  } catch (error) {
    console.error("Order sheet sync failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
