import dotenv from "dotenv";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const orderId = String(process.argv[2] || "").trim();
const shouldApply = process.argv.includes("--apply");

if (!orderId) {
  throw new Error("Usage: node scripts/repair-order-pricing-from-quotation.mjs <orderId> [--apply]");
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "");
const db = getFirestore(
  initializeApp({ credential: cert(serviceAccount) }, `pricing-repair-${Date.now()}`)
);

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMoney = (value) =>
  Math.round((number(value) + Number.EPSILON) * 100) / 100;

const stripUndefinedDeep = (value) => {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => stripUndefinedDeep(entry))
      .filter((entry) => entry !== undefined);
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
      .filter(([, entry]) => entry !== undefined)
  );
};

const normalizeKey = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const resolveGstMode = (item, fallback = "INCL") => {
  const explicit = String(item?.gstMode || item?.gstType || "").trim().toUpperCase();
  if (explicit === "EXCL" || explicit === "INCL") return explicit;

  const qty = number(item?.qty ?? item?.quantity);
  const rate = number(item?.rate ?? item?.originalMrp ?? item?.mrp);
  const gst = number(item?.gst ?? item?.gstPercent);
  const discount = number(item?.discountPercent ?? item?.discount);
  const storedTotal = number(item?.totalAmount ?? item?.total, Number.NaN);
  if (qty > 0 && rate > 0 && gst > 0 && Number.isFinite(storedTotal)) {
    const discountedBase = qty * rate * (1 - discount / 100);
    const exclusiveTotal = discountedBase * (1 + gst / 100);
    return Math.abs(storedTotal - exclusiveTotal) < Math.abs(storedTotal - discountedBase)
      ? "EXCL"
      : "INCL";
  }
  return fallback;
};

const buildPricing = (source, qtyOverride, defaultGstMode = "INCL") => {
  const qty = number(qtyOverride ?? source?.qty ?? source?.quantity);
  const inputRate = number(
    source?.rate ?? source?.originalMrp ?? source?.mrp ?? source?.unitPrice
  );
  const gst = number(source?.gst ?? source?.gstPercent);
  const discountPercent = number(source?.discountPercent ?? source?.discount);
  const gstMode = resolveGstMode(source, defaultGstMode);
  const exclusiveRate =
    gstMode === "INCL" && gst > 0 ? inputRate / (1 + gst / 100) : inputRate;
  const grossAmount = inputRate * qty;
  const discountAmount = grossAmount * (discountPercent / 100);
  const amountAfterDiscount = grossAmount - discountAmount;
  const taxableAmount =
    gstMode === "INCL" && gst > 0
      ? amountAfterDiscount / (1 + gst / 100)
      : amountAfterDiscount;
  const gstAmount =
    gstMode === "INCL"
      ? amountAfterDiscount - taxableAmount
      : taxableAmount * (gst / 100);

  return {
    qty,
    gst,
    gstMode,
    rate: exclusiveRate,
    exclusiveRate,
    discountPercent,
    discountAmount: exclusiveRate * qty * (discountPercent / 100),
    taxableAmount,
    gstAmount,
    totalAmount: taxableAmount + gstAmount,
  };
};

const summarizeSection = (items) =>
  items.reduce(
    (summary, item) => ({
      subTotal: summary.subTotal + number(item.taxableAmount),
      gstTotal: summary.gstTotal + number(item.gstAmount),
      grandTotal: summary.grandTotal + number(item.totalAmount),
    }),
    { subTotal: 0, gstTotal: 0, grandTotal: 0 }
  );

const buildInvoiceTotals = (items) => {
  const totals = items.reduce(
    (result, item) => {
      const baseAmount = number(item.rate) * number(item.qty);
      result.subTotal += baseAmount;
      result.discount += number(item.discountAmount);
      result.taxableValue += number(item.taxableAmount);
      result.cgst += number(item.gstAmount) / 2;
      result.sgst += number(item.gstAmount) / 2;
      return result;
    },
    { subTotal: 0, discount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
  );
  const netAmount =
    totals.taxableValue + totals.cgst + totals.sgst + totals.igst;
  const grandTotal = Math.round(netAmount);
  return {
    ...totals,
    roundOff: roundMoney(grandTotal - netAmount),
    grandTotal,
    totalGst: totals.cgst + totals.sgst + totals.igst,
  };
};

const orderRef = db.collection("orders").doc(orderId);
const orderSnap = await orderRef.get();
if (!orderSnap.exists) throw new Error(`Order ${orderId} not found.`);

const order = { id: orderSnap.id, ...orderSnap.data() };
if (!order.customerId || !order.dealId || !order.quotationId) {
  throw new Error("Order is missing customerId, dealId, or quotationId.");
}

const quotationRef = db
  .collection("customers")
  .doc(order.customerId)
  .collection("deals")
  .doc(order.dealId)
  .collection("quotations")
  .doc(order.quotationId);
const quotationSnap = await quotationRef.get();
if (!quotationSnap.exists) throw new Error("Converted quotation not found.");

const quotation = quotationSnap.data();
const quotationItems =
  Array.isArray(quotation?.sections?.NORMAL?.items) &&
  quotation.sections.NORMAL.items.length > 0
    ? quotation.sections.NORMAL.items
    : Array.isArray(quotation?.items)
    ? quotation.items
    : [];
const quotationVasItems =
  Array.isArray(quotation?.sections?.VAS?.items) &&
  quotation.sections.VAS.items.length > 0
    ? quotation.sections.VAS.items
    : Array.isArray(quotation?.vasDetails)
    ? quotation.vasDetails
    : [];

const buildSourceMap = (items) => {
  const result = new Map();
  items.forEach((item) => {
    const key = normalizeKey(
      item?.bcn ??
        item?.collectionBrand ??
        item?.description ??
        item?.vasName
    );
    if (key && !result.has(key)) result.set(key, item);
  });
  return result;
};

const quotationByKey = buildSourceMap(quotationItems);
const quotationVasByKey = buildSourceMap(quotationVasItems);
const correctItems = (
  items,
  sourceMap,
  fallbackItems = [],
  defaultGstMode = "INCL"
) =>
  items.map((item, index) => {
    const key = normalizeKey(
      item?.bcn ?? item?.description ?? item?.vasName
    );
    const quotationItem = sourceMap.get(key) || fallbackItems[index];
    if (!quotationItem) return item;
    return {
      ...item,
      ...buildPricing(
        quotationItem,
        item.qty ?? item.quantity,
        defaultGstMode
      ),
      allocation: item.allocation,
      allocationRef: item.allocationRef,
    };
  });
const buildOrderItemsFromSource = (items, type) =>
  items.map((item, index) => ({
    itemId: String(item?.itemId || item?.id || `${type.toLowerCase()}-${index + 1}`),
    type,
    bcn: item?.bcn || item?.collectionBrand || undefined,
    description:
      item?.description ||
      item?.salesDescription ||
      item?.vasName ||
      item?.collectionBrand ||
      type,
    unit: item?.unit || item?.stockUnit || (type === "VAS" ? "PCS" : "MTR"),
    hsn: item?.hsn || item?.hsnCode || undefined,
    roomName: item?.roomName || item?.room || undefined,
    ...buildPricing(item, undefined, type === "VAS" ? "EXCL" : "INCL"),
  }));

const currentOrderItems = Array.isArray(order?.sections?.NORMAL?.items)
  ? order.sections.NORMAL.items
  : [];
const currentOrderVasItems = Array.isArray(order?.sections?.VAS?.items)
  ? order.sections.VAS.items
  : [];
const correctedOrderItems = correctItems(currentOrderItems, quotationByKey);
const correctedOrderVasItems =
  currentOrderVasItems.length > 0
    ? correctItems(
        currentOrderVasItems,
        quotationVasByKey,
        quotationVasItems,
        "EXCL"
      )
    : buildOrderItemsFromSource(quotationVasItems, "VAS");

const normalSummary = summarizeSection(correctedOrderItems);
const vasSummary = summarizeSection(correctedOrderVasItems);
const overallSummary = {
  goodsTotal: normalSummary.grandTotal,
  vasTotal: number(vasSummary.grandTotal),
  grandTotal: normalSummary.grandTotal + number(vasSummary.grandTotal),
};

const invoiceSnapshot = await db
  .collection("invoices")
  .where("orderId", "==", orderId)
  .get();
const invoices = invoiceSnapshot.docs.map((doc) => ({
  id: doc.id,
  ref: doc.ref,
  ...doc.data(),
}));

const syncedInvoice = invoices.find(
  (invoice) => invoice.zohoId || invoice.zohoNumber || invoice.zohoInvoiceId
);
if (syncedInvoice) {
  throw new Error(
    `Invoice ${syncedInvoice.invoiceNo || syncedInvoice.id} is synced to Zoho; automatic repair aborted.`
  );
}

const correctedInvoices = invoices.map((invoice) => {
  const currentNormalItems = Array.isArray(invoice?.sections?.NORMAL?.items)
    ? invoice.sections.NORMAL.items
    : [];
  const currentVasItems = Array.isArray(invoice?.sections?.VAS?.items)
    ? invoice.sections.VAS.items
    : [];
  const normalItems = correctItems(currentNormalItems, quotationByKey);
  const vasItems = correctItems(
    currentVasItems,
    quotationVasByKey,
    [],
    "EXCL"
  );
  const items = [...normalItems, ...vasItems];
  const normalSummary = summarizeSection(normalItems);
  const vasSummary = summarizeSection(vasItems);
  const totals = buildInvoiceTotals(items);
  const printableItems = items.map((item) => ({
    name: item.description || item.bcn || "",
    bcn: item.bcn || "",
    hsn: item.hsn || "",
    quantity: number(item.qty),
    uom: item.unit || "MTR",
    rate: number(item.rate),
    exclusiveRate: number(item.exclusiveRate),
    discountPercent: number(item.discountPercent),
    taxableAmount: number(item.taxableAmount),
    cgst: number(item.gstAmount) / 2,
    sgst: number(item.gstAmount) / 2,
    igst: 0,
    total: number(item.totalAmount),
    discountAmount: number(item.discountAmount),
  }));

  return {
    ...invoice,
    correctedNormalItems: normalItems,
    correctedVasItems: vasItems,
    correctedNormalSummary: normalSummary,
    correctedVasSummary: vasSummary,
    correctedTotals: totals,
    correctedPrintableItems: printableItems,
  };
});

const result = {
  orderId,
  quotationNo: quotation.quotationNo,
  beforeOrderTotal: number(order?.overallSummary?.grandTotal ?? order.totalAmount),
  afterOrderTotal: overallSummary.grandTotal,
  vas: {
    before: number(order?.overallSummary?.vasTotal),
    after: vasSummary.grandTotal,
    currentLines: currentOrderVasItems.map((item) => ({
      label: item?.bcn || item?.description || item?.vasName,
      qty: number(item?.qty ?? item?.quantity),
      rate: number(item?.rate ?? item?.exclusiveRate),
      gst: number(item?.gst ?? item?.gstPercent),
      total: number(item?.totalAmount),
    })),
    correctedLines: correctedOrderVasItems.map((item) => ({
      label: item?.bcn || item?.description || item?.vasName,
      qty: number(item?.qty ?? item?.quantity),
      rate: number(item?.rate ?? item?.exclusiveRate),
      gst: number(item?.gst ?? item?.gstPercent),
      total: number(item?.totalAmount),
    })),
  },
  invoices: correctedInvoices.map((invoice) => ({
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    before: number(invoice?.totals?.grandTotal),
    after: invoice.correctedTotals.grandTotal,
  })),
};

console.log(JSON.stringify(result, null, 2));

if (shouldApply) {
  const now = new Date().toISOString();
  const batch = db.batch();
  const repairedInvoiceAmounts = new Map(
    correctedInvoices.map((invoice) => [invoice.id, invoice.correctedTotals.grandTotal])
  );
  const invoicing = {
    ...(order.invoicing || {}),
    invoices: Array.isArray(order?.invoicing?.invoices)
      ? order.invoicing.invoices.map((entry) => ({
          ...entry,
          amount: repairedInvoiceAmounts.get(entry.invoiceId) ?? entry.amount,
        }))
      : [],
  };

  batch.update(orderRef, {
    "sections.NORMAL.items": stripUndefinedDeep(correctedOrderItems),
    "sections.NORMAL.summary": normalSummary,
    "sections.VAS.items": stripUndefinedDeep(correctedOrderVasItems),
    "sections.VAS.summary": vasSummary,
    overallSummary,
    totalAmount: overallSummary.grandTotal,
    invoicing,
    pricingRepair: {
      source: "EXACT_CONVERTED_QUOTATION",
      quotationId: order.quotationId,
      quotationNo: quotation.quotationNo,
      previousTotal: number(order?.overallSummary?.grandTotal ?? order.totalAmount),
      correctedTotal: overallSummary.grandTotal,
      repairedAt: now,
    },
    updatedAt: now,
  });

  if (order.dealOrderDocId) {
    const dealOrderRef = db
      .collection("customers")
      .doc(order.customerId)
      .collection("deals")
      .doc(order.dealId)
      .collection("orders")
      .doc(order.dealOrderDocId);
    batch.set(dealOrderRef, { overallSummary }, { merge: true });
  }

  correctedInvoices.forEach((invoice) => {
    const normalTax = {
      cgst: number(invoice.correctedNormalSummary.gstTotal) / 2,
      sgst: number(invoice.correctedNormalSummary.gstTotal) / 2,
      igst: 0,
    };
    const vasTax = {
      cgst: number(invoice.correctedVasSummary.gstTotal) / 2,
      sgst: number(invoice.correctedVasSummary.gstTotal) / 2,
      igst: 0,
    };
    batch.update(invoice.ref, {
      "sections.NORMAL.items": stripUndefinedDeep(
        invoice.correctedNormalItems
      ),
      "sections.NORMAL.summary": invoice.correctedNormalSummary,
      "sections.VAS.items": stripUndefinedDeep(invoice.correctedVasItems),
      "sections.VAS.summary": invoice.correctedVasSummary,
      "overallSummary.goodsTotal": invoice.correctedNormalSummary.grandTotal,
      "overallSummary.vasTotal": invoice.correctedVasSummary.grandTotal,
      "overallSummary.grandTotal":
        invoice.correctedNormalSummary.grandTotal +
        invoice.correctedVasSummary.grandTotal,
      "taxSummary.NORMAL": normalTax,
      "taxSummary.VAS": vasTax,
      items: stripUndefinedDeep(invoice.correctedPrintableItems),
      totals: invoice.correctedTotals,
      pricingRepair: {
        source: "EXACT_CONVERTED_QUOTATION",
        quotationId: order.quotationId,
        quotationNo: quotation.quotationNo,
        previousTotal: number(invoice?.totals?.grandTotal),
        correctedTotal: invoice.correctedTotals.grandTotal,
        repairedAt: now,
      },
      updatedAt: now,
    });
  });

  await batch.commit();
  console.log("Repair applied.");
}
