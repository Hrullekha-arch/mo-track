import dotenv from "dotenv";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const quotationNo = String(process.argv[2] || "").trim();
if (!quotationNo) {
  throw new Error(
    "Usage: node scripts/audit-quotation-combined-total.mjs <quotationNo>"
  );
}

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || ""
);
const db = getFirestore(
  initializeApp(
    { credential: cert(serviceAccount) },
    `quotation-combined-total-audit-${Date.now()}`
  )
);

const numberValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMoney = (value) =>
  Math.round((numberValue(value) + Number.EPSILON) * 100) / 100;

const calculateLine = (item, defaultGstMode) => {
  const quantity = numberValue(item?.quantity ?? item?.qty);
  const rate = numberValue(
    item?.rate ?? item?.originalMrp ?? item?.mrp ?? item?.unitPrice
  );
  const gstPercent = numberValue(item?.gstPercent ?? item?.gst);
  const discountPercent = numberValue(
    item?.discountPercent ?? item?.discount
  );
  const gstMode = String(item?.gstMode || defaultGstMode)
    .trim()
    .toUpperCase();
  const exclusiveRate =
    gstMode === "INCL" && gstPercent > 0
      ? rate / (1 + gstPercent / 100)
      : numberValue(item?.exclusiveRate, rate);
  const gross = quantity * exclusiveRate;
  const discount = gross * (discountPercent / 100);
  const taxable = Math.max(0, gross - discount);
  const gst = taxable * (gstPercent / 100);
  return {
    label: String(
      item?.bcn ||
        item?.collectionBrand ||
        item?.vasName ||
        item?.salesDescription ||
        item?.description ||
        "Unnamed"
    ).trim(),
    quantity,
    rate,
    exclusiveRate: roundMoney(exclusiveRate),
    gstPercent,
    discountPercent,
    taxable: roundMoney(taxable),
    gst: roundMoney(gst),
    total: roundMoney(taxable + gst),
    storedTotal: numberValue(
      item?.totalAmount ?? item?.amount,
      Number.NaN
    ),
  };
};

const quotationSnapshot = await db
  .collectionGroup("quotations")
  .where("quotationNo", "==", quotationNo)
  .get();

if (quotationSnapshot.empty) {
  throw new Error(`Quotation ${quotationNo} not found.`);
}

const results = [];
for (const document of quotationSnapshot.docs) {
  const quotation = document.data();
  const goodsRows = (
    Array.isArray(quotation?.sections?.NORMAL?.items) &&
    quotation.sections.NORMAL.items.length > 0
      ? quotation.sections.NORMAL.items
      : Array.isArray(quotation?.items)
      ? quotation.items
      : []
  ).map((item) => calculateLine(item, "INCL"));
  const vasRows = (
    Array.isArray(quotation?.sections?.VAS?.items) &&
    quotation.sections.VAS.items.length > 0
      ? quotation.sections.VAS.items
      : Array.isArray(quotation?.vasDetails)
      ? quotation.vasDetails
      : []
  ).map((item) => calculateLine(item, "EXCL"));

  const goodsTotal = roundMoney(
    goodsRows.reduce((total, row) => total + row.total, 0)
  );
  const vasTotal = roundMoney(
    vasRows.reduce((total, row) => total + row.total, 0)
  );
  const combinedTotal = roundMoney(goodsTotal + vasTotal);
  const orderId = String(
    quotation?.orderNo || `MOTRACK-${quotationNo}`
  ).trim();
  const orderSnapshot = await db.collection("orders").doc(orderId).get();
  const order = orderSnapshot.exists ? orderSnapshot.data() : null;
  const invoiceSnapshot = await db
    .collection("invoices")
    .where("orderId", "==", orderId)
    .get();
  const invoices = invoiceSnapshot.docs.map((invoiceDocument) => {
    const invoice = invoiceDocument.data();
    return {
      id: invoiceDocument.id,
      invoiceNo: invoice?.invoiceNo,
      type: invoice?.invoiceType || (invoice?.isVas ? "VAS" : "NORMAL"),
      total: numberValue(
        invoice?.totals?.grandTotal ??
          invoice?.overallSummary?.grandTotal
      ),
      zohoSyncStatus: invoice?.zohoSyncStatus,
      zohoInvoiceNo: invoice?.zohoInvoiceNo,
    };
  });

  results.push({
    path: document.ref.path,
    status: quotation?.status,
    orderId,
    storedQuotationTotal: numberValue(quotation?.totalAmount),
    goodsTotal,
    vasTotal,
    combinedTotal,
    storedVsCombinedDifference: roundMoney(
      numberValue(quotation?.totalAmount) - combinedTotal
    ),
    goodsRows,
    vasRows,
    orderTotal: numberValue(
      order?.overallSummary?.grandTotal ?? order?.totalAmount
    ),
    orderGoodsTotal: numberValue(order?.overallSummary?.goodsTotal),
    orderVasTotal: numberValue(order?.overallSummary?.vasTotal),
    invoices,
    invoiceTotal: roundMoney(
      invoices.reduce((total, invoice) => total + invoice.total, 0)
    ),
  });
}

console.log(JSON.stringify(results, null, 2));
