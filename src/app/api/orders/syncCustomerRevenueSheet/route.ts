import { NextResponse } from "next/server";
import { google } from "googleapis";
import { adminDb } from "@/lib/firebase-admin";

const DEFAULT_SHEET_ID = "11lql9tv_As-DfhxuMlQ9jhm2kQRBXMNqVXWfkJHuvK8";
const DEFAULT_CUSTOMER_SHEET_NAME = "CUSTOMER MASTER SHEET";
const DEFAULT_ORDER_REVENUE_SHEET_NAME = "ORDER / REVENUE SHEET";
const SYNC_VERSION = "2026-03-23-customer-order-revenue-v1";

const CUSTOMER_HEADER = [
  "Customer ID",
  "Customer Name",
  "Mobile No",
  "Email",
  "City",
  "Source (Walk-in / Instagram / Reference)",
  "First Visit Date",
  "Last Visit Date",
  "Total Visits",
  "Repeat Customer (Yes/No)",
  "Total Revenue",
  "Avg Order Size",
];

const ORDER_REVENUE_HEADER = [
  "Order ID",
  "Date",
  "Customer ID",
  "Customer Name",
  "Order Value",
  "Advance",
  "Balance",
  "Order Size Category",
  "Status",
  "Dispatch Date",
  "Payment Status",
  "Sales Person",
];

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

const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase();

const normalizePhone = (value: unknown) => {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
};

const pickFirstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const toDate = (value: unknown): Date | null => {
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

const formatDate = (value: unknown) => {
  const date = value instanceof Date ? value : toDate(value);
  if (!date) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const parseNumber = (value: unknown): number | null => {
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

const formatAmount = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

const normalizeSource = (value: unknown) => {
  const raw = String(value ?? "").trim();
  const normalized = normalizeText(raw);
  if (!normalized) return "";
  if (normalized.includes("walk")) return "Walk-in";
  if (normalized.includes("insta")) return "Instagram";
  if (normalized.includes("refer")) return "Reference";
  return raw;
};

const getOrderValue = (order: Record<string, unknown>) => {
  const overallSummary = toRecord(order.overallSummary);
  return (
    parseNumber(order.totalAmount) ??
    parseNumber(overallSummary.grandTotal) ??
    parseNumber(order.grandTotal) ??
    parseNumber(order.orderValue) ??
    parseNumber(order.amount)
  );
};

const getOrderAdvance = (order: Record<string, unknown>) => {
  const payment = toRecord(order.payment);
  return (
    parseNumber(order.advance) ??
    parseNumber(order.advanceAmount) ??
    parseNumber(payment.advance) ??
    parseNumber(payment.advanceAmount) ??
    parseNumber(order.receivedAmount)
  );
};

const getOrderBalance = (order: Record<string, unknown>, orderValue: number | null, advance: number | null) => {
  const explicit =
    parseNumber(order.balance) ??
    parseNumber(order.balanceAmount) ??
    parseNumber(order.pendingAmount);
  if (explicit !== null) return explicit;
  if (orderValue === null) return null;
  const effectiveAdvance = advance ?? 0;
  return Math.max(orderValue - effectiveAdvance, 0);
};

const getDispatchDate = (order: Record<string, unknown>) => {
  const direct = toDate(
    pickFirstText(order.dispatchedAt, order.dispatchDate, order.deliveryDate, order.completedAt)
  );
  if (direct) return direct;

  const workflow = toRecord(order.workflow);
  const milestones = Array.isArray(workflow.milestones) ? workflow.milestones : [];
  let best: Date | null = null;

  milestones.forEach((entry) => {
    const milestone = toRecord(entry);
    const key = normalizeText(milestone.key);
    const label = normalizeText(milestone.label);
    const status = normalizeText(milestone.status);
    const isDispatchMilestone = key.includes("dispatch") || label.includes("dispatch");
    if (!isDispatchMilestone || status !== "done") return;
    const at = toDate(milestone.at);
    if (!at) return;
    if (!best || at.getTime() > best.getTime()) best = at;
  });

  return best;
};

const getOrderSizeCategory = (orderValue: number | null) => {
  if (orderValue === null) return "";
  if (orderValue < 50_000) return "Small";
  if (orderValue < 200_000) return "Medium";
  return "Large";
};

const getPaymentStatus = (order: Record<string, unknown>, balance: number | null, advance: number | null) => {
  const explicit = pickFirstText(order.paymentStatus);
  if (explicit) return explicit;
  if (order.paymentConfirmed === true) return "Paid";
  if (balance !== null && balance <= 0) return "Paid";
  if ((advance ?? 0) > 0) return "Partial";
  return "Pending";
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
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient as any });
};

type VisitStats = { total: number; first: Date | null; last: Date | null };
type RevenueStats = { totalRevenue: number; orderCount: number };

const updateVisitStats = (map: Map<string, VisitStats>, key: string, date: Date | null) => {
  if (!key) return;
  const current = map.get(key) || { total: 0, first: null, last: null };
  current.total += 1;
  if (date) {
    if (!current.first || date.getTime() < current.first.getTime()) current.first = date;
    if (!current.last || date.getTime() > current.last.getTime()) current.last = date;
  }
  map.set(key, current);
};

const updateRevenueStats = (map: Map<string, RevenueStats>, key: string, orderValue: number | null) => {
  if (!key) return;
  const current = map.get(key) || { totalRevenue: 0, orderCount: 0 };
  current.totalRevenue += orderValue ?? 0;
  current.orderCount += 1;
  map.set(key, current);
};

export async function POST() {
  try {
    const sheetId = process.env.CUSTOMER_REVENUE_SHEET_ID || DEFAULT_SHEET_ID;
    const customerSheetName = process.env.CUSTOMER_MASTER_SHEET_NAME || DEFAULT_CUSTOMER_SHEET_NAME;
    const orderSheetName = process.env.ORDER_REVENUE_SHEET_NAME || DEFAULT_ORDER_REVENUE_SHEET_NAME;

    const sheets = await getSheetsClient();

    const [customerSnapshot, orderSnapshot, visitSnapshot, walkinSnapshot] = await Promise.all([
      adminDb.collection("customers").get(),
      adminDb.collection("orders").get(),
      adminDb.collectionGroup("visits").get(),
      adminDb.collection("Walkin_Customer").get(),
    ]);

    const customerById = new Map<string, Record<string, unknown>>();
    const customerIdByPhone = new Map<string, string>();
    const customerNameByPhone = new Map<string, string>();

    customerSnapshot.docs.forEach((doc) => {
      const customer = doc.data() as Record<string, unknown>;
      customerById.set(doc.id, customer);
      const phone = normalizePhone(pickFirstText(customer.phone, customer.mobileNo));
      if (phone) {
        customerIdByPhone.set(phone, doc.id);
        const customerName = pickFirstText(customer.name);
        if (customerName) customerNameByPhone.set(phone, customerName);
      }
    });

    const walkinSourceByPhone = new Map<string, { source: string; createdAt: number }>();
    walkinSnapshot.docs.forEach((doc) => {
      const walkin = doc.data() as Record<string, unknown>;
      const phone = normalizePhone(pickFirstText(walkin.mobile, walkin.phone, walkin.mobileNo));
      if (!phone) return;
      const source = normalizeSource(
        pickFirstText(walkin.howDidYouHearAboutUs, walkin.source, walkin.leadSource, walkin.customerType)
      );
      if (!source) return;
      const createdAtDate = toDate(walkin.createdAt);
      const createdAt = createdAtDate ? createdAtDate.getTime() : 0;
      const existing = walkinSourceByPhone.get(phone);
      if (!existing || createdAt >= existing.createdAt) {
        walkinSourceByPhone.set(phone, { source, createdAt });
      }
    });

    const visitStatsByCustomerId = new Map<string, VisitStats>();
    const visitStatsByPhone = new Map<string, VisitStats>();
    visitSnapshot.docs.forEach((doc) => {
      const visit = doc.data() as Record<string, unknown>;
      const pathParts = doc.ref.path.split("/");
      const customerId = pickFirstText(pathParts[1], visit.customerId);
      const phone = normalizePhone(
        pickFirstText(toRecord(visit.customerSnapshot).phone, visit.customerPhone, visit.phone)
      );
      const visitDate = toDate(
        pickFirstText(visit.visitEndTime, visit.measurementSavedAt, visit.updatedAt, visit.createdAt, visit.slotDate)
      );

      updateVisitStats(visitStatsByCustomerId, customerId, visitDate);
      updateVisitStats(visitStatsByPhone, phone, visitDate);
    });

    const revenueByCustomerId = new Map<string, RevenueStats>();
    const revenueByPhone = new Map<string, RevenueStats>();
    const orderRows: Array<{ sortTime: number; row: string[] }> = [];

    orderSnapshot.docs.forEach((doc) => {
      const order = doc.data() as Record<string, unknown>;
      const orderId = pickFirstText(order.crmOrderNo, order.orderNo, order.orderId, doc.id);
      const orderDate = toDate(pickFirstText(order.createdAt, order.orderDate, order.updatedAt));
      const orderValue = getOrderValue(order);
      const advance = getOrderAdvance(order);
      const balance = getOrderBalance(order, orderValue, advance);

      const orderPhone = normalizePhone(pickFirstText(order.customerPhone, toRecord(order.customerSnapshot).phone));
      const customerId = pickFirstText(order.customerId, customerIdByPhone.get(orderPhone));
      const customerName =
        pickFirstText(order.customerName, toRecord(order.customerSnapshot).name) ||
        (customerId ? pickFirstText(customerById.get(customerId)?.name) : "") ||
        customerNameByPhone.get(orderPhone) ||
        "";

      updateRevenueStats(revenueByCustomerId, customerId, orderValue);
      updateRevenueStats(revenueByPhone, orderPhone, orderValue);

      const status = pickFirstText(order.status, toRecord(order.workflow).status);
      const dispatchDate = getDispatchDate(order);
      const paymentStatus = getPaymentStatus(order, balance, advance);
      const salesPerson = pickFirstText(order.salesPerson, toRecord(order.createdBy).name);

      orderRows.push({
        sortTime: orderDate ? orderDate.getTime() : 0,
        row: [
          orderId,
          formatDate(orderDate),
          customerId,
          customerName,
          formatAmount(orderValue),
          formatAmount(advance),
          formatAmount(balance),
          getOrderSizeCategory(orderValue),
          status,
          formatDate(dispatchDate),
          paymentStatus,
          salesPerson,
        ],
      });
    });

    const customerRows = customerSnapshot.docs.map((doc) => {
      const customer = doc.data() as Record<string, unknown>;
      const phone = normalizePhone(pickFirstText(customer.phone, customer.mobileNo));
      const customerId = pickFirstText(customer.customerId, customer.customerCode, doc.id);
      const customerName = pickFirstText(customer.name);
      const email = pickFirstText(customer.email);
      const billingAddress = toRecord(customer.billingAddress);
      const shippingAddress = toRecord(customer.shippingAddress);
      const city = pickFirstText(customer.city, billingAddress.city, shippingAddress.city);
      const source =
        normalizeSource(pickFirstText(customer.sourceOfCustomer, customer.customerType)) ||
        walkinSourceByPhone.get(phone)?.source ||
        "";

      const visitStats = visitStatsByCustomerId.get(doc.id) || visitStatsByPhone.get(phone);
      const totalVisits = visitStats?.total || 0;

      const revenueStats = revenueByCustomerId.get(doc.id) || revenueByPhone.get(phone) || {
        totalRevenue: 0,
        orderCount: 0,
      };
      const avgOrderSize =
        revenueStats.orderCount > 0 ? revenueStats.totalRevenue / revenueStats.orderCount : null;

      return [
        customerId,
        customerName,
        pickFirstText(customer.phone, customer.mobileNo),
        email,
        city,
        source,
        formatDate(visitStats?.first || null),
        formatDate(visitStats?.last || null),
        String(totalVisits),
        totalVisits > 1 ? "Yes" : "No",
        formatAmount(revenueStats.totalRevenue),
        formatAmount(avgOrderSize),
      ];
    });

    customerRows.sort((a, b) => a[1].localeCompare(b[1]));
    orderRows.sort((a, b) => b.sortTime - a.sortTime);

    const customerLastColumn = getColumnLetter(CUSTOMER_HEADER.length);
    const orderLastColumn = getColumnLetter(ORDER_REVENUE_HEADER.length);

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${customerSheetName}!A1:${customerLastColumn}`,
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${customerSheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [CUSTOMER_HEADER, ...customerRows],
      },
    });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${orderSheetName}!A1:${orderLastColumn}`,
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${orderSheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [ORDER_REVENUE_HEADER, ...orderRows.map((entry) => entry.row)],
      },
    });

    return NextResponse.json({
      success: true,
      syncVersion: SYNC_VERSION,
      sheetId,
      customerSheetName,
      orderSheetName,
      customersWritten: customerRows.length,
      ordersWritten: orderRows.length,
    });
  } catch (error) {
    console.error("Customer/Revenue sheet sync failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
