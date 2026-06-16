import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import ts from "typescript";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const shouldApply = process.argv.includes("--apply");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const loadPricingModule = () => {
  const sourcePath = resolve(root, "src/lib/quotation-order-pricing.ts");
  const source = readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: sourcePath,
  }).outputText;
  const loadedModule = { exports: {} };
  const execute = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    output
  );
  execute(
    loadedModule.exports,
    () => {
      throw new Error("Unexpected runtime import in pricing module.");
    },
    loadedModule,
    sourcePath,
    dirname(sourcePath)
  );
  return loadedModule.exports;
};

const { buildOrderPricingFromQuotation } = loadPricingModule();
assert.equal(typeof buildOrderPricingFromQuotation, "function");

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || ""
);
const db = getFirestore(
  initializeApp(
    { credential: cert(serviceAccount) },
    `all-invoice-pricing-audit-${Date.now()}`
  )
);

const numberValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const optionalNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const stripUndefinedDeep = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value
      .map((entry) => stripUndefinedDeep(entry))
      .filter((entry) => entry !== undefined);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
        .filter(([, entry]) => entry !== undefined)
    );
  }
  return value;
};

const roundMoney = (value) =>
  Math.round((numberValue(value) + Number.EPSILON) * 100) / 100;

const normalized = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const itemLabel = (item) =>
  String(
    item?.bcn ||
      item?.description ||
      item?.salesDescription ||
      item?.vasName ||
      item?.itemName ||
      "Unnamed item"
  ).trim();

const identityValues = (item) => ({
  itemId: normalized(item?.itemId ?? item?.id),
  bcn: normalized(item?.bcn ?? item?.collectionBrand),
  description: normalized(
    item?.description ??
      item?.salesDescription ??
      item?.vasName ??
      item?.itemName
  ),
  room: normalized(item?.roomName ?? item?.room),
});

const findSourceItem = (target, sourceItems) => {
  const targetIdentity = identityValues(target);
  const exactId =
    targetIdentity.itemId &&
    sourceItems.find(
      (source) => identityValues(source).itemId === targetIdentity.itemId
    );
  if (exactId) return exactId;

  const findUnique = (predicate) => {
    const matches = sourceItems.filter(predicate);
    return matches.length === 1 ? matches[0] : undefined;
  };

  if (targetIdentity.bcn && targetIdentity.room) {
    const exactBcnRoom = findUnique((source) => {
      const identity = identityValues(source);
      return (
        identity.bcn === targetIdentity.bcn &&
        identity.room === targetIdentity.room
      );
    });
    if (exactBcnRoom) return exactBcnRoom;
  }

  if (targetIdentity.description && targetIdentity.room) {
    const exactDescriptionRoom = findUnique((source) => {
      const identity = identityValues(source);
      return (
        identity.description === targetIdentity.description &&
        identity.room === targetIdentity.room
      );
    });
    if (exactDescriptionRoom) return exactDescriptionRoom;
  }

  if (targetIdentity.bcn) {
    const uniqueBcn = findUnique(
      (source) => identityValues(source).bcn === targetIdentity.bcn
    );
    if (uniqueBcn) return uniqueBcn;
  }

  if (targetIdentity.description) {
    return findUnique(
      (source) =>
        identityValues(source).description === targetIdentity.description
    );
  }

  return undefined;
};

const priceLineFromSource = (source, currentLine, qtyOverride) => {
  const qty = numberValue(
    qtyOverride ??
      currentLine?.qty ??
      currentLine?.quantity ??
      source?.qty ??
      source?.quantity
  );
  const exclusiveRate = numberValue(source?.exclusiveRate ?? source?.rate);
  const discountPercent = numberValue(source?.discountPercent);
  const gst = numberValue(source?.gst ?? source?.gstPercent);
  const grossAmount = exclusiveRate * qty;
  const discountAmount = grossAmount * (discountPercent / 100);
  const taxableAmount = Math.max(0, grossAmount - discountAmount);
  const gstAmount = taxableAmount * (gst / 100);

  return {
    ...currentLine,
    roomName: source?.roomName ?? currentLine?.roomName,
    type: source?.type ?? currentLine?.type,
    category: source?.category ?? currentLine?.category,
    itemId: source?.itemId ?? currentLine?.itemId,
    bcn: source?.bcn ?? currentLine?.bcn,
    description: source?.description ?? currentLine?.description,
    unit: source?.unit ?? currentLine?.unit,
    rate: exclusiveRate,
    exclusiveRate,
    qty,
    gst,
    gstMode: source?.gstMode,
    discountPercent,
    discountAmount,
    hsn: source?.hsn ?? currentLine?.hsn,
    group: source?.group ?? currentLine?.group,
    taxableAmount,
    gstAmount,
    totalAmount: taxableAmount + gstAmount,
  };
};

const summarize = (items) =>
  items.reduce(
    (summary, item) => ({
      subTotal: summary.subTotal + numberValue(item?.taxableAmount),
      gstTotal: summary.gstTotal + numberValue(item?.gstAmount),
      grandTotal: summary.grandTotal + numberValue(item?.totalAmount),
    }),
    { subTotal: 0, gstTotal: 0, grandTotal: 0 }
  );

const buildInvoiceTotals = (items) => {
  const totals = items.reduce(
    (result, item) => {
      result.subTotal +=
        numberValue(item?.exclusiveRate ?? item?.rate) * numberValue(item?.qty);
      result.discount += numberValue(item?.discountAmount);
      result.taxableValue += numberValue(item?.taxableAmount);
      result.cgst += numberValue(item?.gstAmount) / 2;
      result.sgst += numberValue(item?.gstAmount) / 2;
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

const toPrintableItem = (item) => ({
  name: item?.description || item?.bcn || "",
  bcn: item?.bcn || "",
  hsn: item?.hsn || "",
  quantity: numberValue(item?.qty),
  uom: item?.unit || (item?.type === "VAS" ? "PCS" : "MTR"),
  rate: numberValue(item?.exclusiveRate ?? item?.rate),
  exclusiveRate: numberValue(item?.exclusiveRate ?? item?.rate),
  discountPercent: numberValue(item?.discountPercent),
  taxableAmount: numberValue(item?.taxableAmount),
  cgst: numberValue(item?.gstAmount) / 2,
  sgst: numberValue(item?.gstAmount) / 2,
  igst: 0,
  total: numberValue(item?.totalAmount),
  discountAmount: numberValue(item?.discountAmount),
});

const isZohoSynced = (invoice) => {
  const status = String(invoice?.zohoSyncStatus || "")
    .trim()
    .toLowerCase();
  return Boolean(
    invoice?.zohoInvoiceId ||
      invoice?.zohoInvoiceNo ||
      invoice?.zohoId ||
      invoice?.zohoNumber ||
      invoice?.tallyVoucherNo ||
      status === "synced" ||
      status === "processing"
  );
};

const moneyChanged = (left, right) =>
  Math.abs(numberValue(left) - numberValue(right)) > 0.05;

const pricingSignature = (item) => ({
  qty: roundMoney(numberValue(item?.qty)),
  rate: roundMoney(numberValue(item?.exclusiveRate ?? item?.rate)),
  gst: roundMoney(numberValue(item?.gst)),
  discountPercent: roundMoney(numberValue(item?.discountPercent)),
  taxableAmount: roundMoney(numberValue(item?.taxableAmount)),
  gstAmount: roundMoney(numberValue(item?.gstAmount)),
  totalAmount: roundMoney(numberValue(item?.totalAmount)),
});

const sectionChanged = (beforeItems, afterItems) =>
  JSON.stringify(beforeItems.map(pricingSignature)) !==
  JSON.stringify(afterItems.map(pricingSignature));

const invoicesSnapshot = await db.collection("invoices").get();
const invoices = invoicesSnapshot.docs.map((document) => ({
  id: document.id,
  ref: document.ref,
  ...document.data(),
}));
const invoicesByOrderId = new Map();
invoices.forEach((invoice) => {
  const orderId = String(invoice?.orderId || invoice?.orderNo || "").trim();
  if (!orderId) return;
  invoicesByOrderId.set(orderId, [
    ...(invoicesByOrderId.get(orderId) || []),
    invoice,
  ]);
});

const getAllInChunks = async (references, chunkSize = 100) => {
  const snapshots = [];
  for (let index = 0; index < references.length; index += chunkSize) {
    const chunk = references.slice(index, index + chunkSize);
    snapshots.push(...(await db.getAll(...chunk)));
  }
  return snapshots;
};

const orderReferences = Array.from(invoicesByOrderId.keys()).map((orderId) =>
  db.collection("orders").doc(orderId)
);
const orderSnapshots = await getAllInChunks(orderReferences);
const orderById = new Map(
  orderSnapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => [
      snapshot.id,
      { id: snapshot.id, ref: snapshot.ref, ...snapshot.data() },
    ])
);
const quotationReferencesByPath = new Map();
orderById.forEach((order) => {
  if (!order.customerId || !order.dealId || !order.quotationId) return;
  const reference = db
    .collection("customers")
    .doc(order.customerId)
    .collection("deals")
    .doc(order.dealId)
    .collection("quotations")
    .doc(order.quotationId);
  quotationReferencesByPath.set(reference.path, reference);
});
const quotationSnapshots = await getAllInChunks(
  Array.from(quotationReferencesByPath.values())
);
const quotationByPath = new Map(
  quotationSnapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => [
      snapshot.ref.path,
      { id: snapshot.id, ref: snapshot.ref, ...snapshot.data() },
    ])
);

const audit = {
  mode: shouldApply ? "apply" : "dry-run",
  invoiceCount: invoices.length,
  orderCount: invoicesByOrderId.size,
  repairedOrders: 0,
  repairedInvoices: 0,
  alreadyCorrectOrders: 0,
  alreadyCorrectInvoices: 0,
  blockedSyncedInvoices: [],
  skippedOrders: [],
  changes: [],
};

for (const [orderId, orderInvoices] of invoicesByOrderId) {
  const order = orderById.get(orderId);
  if (!order) {
    audit.skippedOrders.push({ orderId, reason: "Order not found" });
    continue;
  }

  const orderRef = order.ref;
  if (!order.customerId || !order.dealId || !order.quotationId) {
    audit.skippedOrders.push({
      orderId,
      reason: "Missing exact quotation reference",
    });
    continue;
  }

  const quotationRef = db
    .collection("customers")
    .doc(order.customerId)
    .collection("deals")
    .doc(order.dealId)
    .collection("quotations")
    .doc(order.quotationId);
  const quotation = quotationByPath.get(quotationRef.path);
  if (!quotation) {
    audit.skippedOrders.push({
      orderId,
      reason: "Linked quotation not found",
    });
    continue;
  }

  const expected = buildOrderPricingFromQuotation(quotation);
  const quotationTotal = optionalNumber(quotation?.totalAmount);
  if (
    quotationTotal !== undefined &&
    Math.abs(expected.overallSummary.grandTotal - quotationTotal) > 1
  ) {
    audit.skippedOrders.push({
      orderId,
      reason: "Quotation item total does not match quotation total",
      quotationTotal,
      itemTotal: expected.overallSummary.grandTotal,
      quotationDiscountPercent: numberValue(quotation?.discountPercent),
    });
    continue;
  }

  const currentNormalItems = Array.isArray(order?.sections?.NORMAL?.items)
    ? order.sections.NORMAL.items
    : [];
  const currentVasItems = Array.isArray(order?.sections?.VAS?.items)
    ? order.sections.VAS.items
    : [];
  const correctedNormalItems = expected.normalItems.map((source) => {
    const current = findSourceItem(source, currentNormalItems);
    return {
      ...source,
      allocation: current?.allocation ?? source?.allocation,
    };
  });
  const correctedVasItems = expected.vasItems.map((source) => {
    const current = findSourceItem(source, currentVasItems);
    return {
      ...source,
      allocation: current?.allocation ?? source?.allocation,
    };
  });
  const normalSummary = summarize(correctedNormalItems);
  const vasSummary = summarize(correctedVasItems);
  const overallSummary = {
    goodsTotal: normalSummary.grandTotal,
    vasTotal: vasSummary.grandTotal,
    grandTotal: normalSummary.grandTotal + vasSummary.grandTotal,
  };

  const correctedInvoices = [];
  let hasUnrepairableInvoice = false;
  for (const invoice of orderInvoices) {
    const invoiceNormalItems = Array.isArray(invoice?.sections?.NORMAL?.items)
      ? invoice.sections.NORMAL.items
      : [];
    const invoiceVasItems = Array.isArray(invoice?.sections?.VAS?.items)
      ? invoice.sections.VAS.items
      : [];
    const legacyItems =
      invoiceNormalItems.length === 0 &&
      invoiceVasItems.length === 0 &&
      Array.isArray(invoice?.items)
        ? invoice.items
        : [];
    const legacyIsVas =
      invoice?.invoiceType === "VAS" || invoice?.isVas === true;
    const sourceNormalItems = correctedNormalItems;
    const sourceVasItems = correctedVasItems;
    const effectiveNormalItems =
      invoiceNormalItems.length > 0
        ? invoiceNormalItems
        : legacyIsVas
          ? []
          : legacyItems;
    const effectiveVasItems =
      invoiceVasItems.length > 0
        ? invoiceVasItems
        : legacyIsVas
          ? legacyItems
          : [];

    const unmatched = [];
    const correctedInvoiceNormalItems = effectiveNormalItems.map((item) => {
      const source = findSourceItem(item, sourceNormalItems);
      if (!source) {
        unmatched.push(itemLabel(item));
        return item;
      }
      return priceLineFromSource(source, item);
    });
    const correctedInvoiceVasItems = effectiveVasItems.map((item) => {
      const source = findSourceItem(item, sourceVasItems);
      if (!source) {
        unmatched.push(itemLabel(item));
        return item;
      }
      return priceLineFromSource(source, item);
    });

    if (unmatched.length > 0) {
      hasUnrepairableInvoice = true;
      audit.skippedOrders.push({
        orderId,
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        reason: `Invoice lines not found in quotation: ${unmatched.join(", ")}`,
      });
      continue;
    }

    const allItems = [
      ...correctedInvoiceNormalItems,
      ...correctedInvoiceVasItems,
    ];
    const correctedNormalSummary = summarize(correctedInvoiceNormalItems);
    const correctedVasSummary = summarize(correctedInvoiceVasItems);
    const correctedOverallSummary = {
      goodsTotal: correctedNormalSummary.grandTotal,
      vasTotal: correctedVasSummary.grandTotal,
      grandTotal:
        correctedNormalSummary.grandTotal + correctedVasSummary.grandTotal,
    };
    const correctedTotals = buildInvoiceTotals(allItems);
    const changed =
      sectionChanged(effectiveNormalItems, correctedInvoiceNormalItems) ||
      sectionChanged(effectiveVasItems, correctedInvoiceVasItems) ||
      moneyChanged(invoice?.totals?.grandTotal, correctedTotals.grandTotal) ||
      moneyChanged(
        invoice?.overallSummary?.grandTotal,
        correctedOverallSummary.grandTotal
      );

    correctedInvoices.push({
      invoice,
      changed,
      normalItems: correctedInvoiceNormalItems,
      vasItems: correctedInvoiceVasItems,
      normalSummary: correctedNormalSummary,
      vasSummary: correctedVasSummary,
      overallSummary: correctedOverallSummary,
      totals: correctedTotals,
      printableItems: allItems.map(toPrintableItem),
    });
  }

  if (hasUnrepairableInvoice) continue;

  const orderChanged =
    sectionChanged(currentNormalItems, correctedNormalItems) ||
    sectionChanged(currentVasItems, correctedVasItems) ||
    moneyChanged(
      order?.overallSummary?.grandTotal ?? order?.totalAmount,
      overallSummary.grandTotal
    );
  const changedInvoices = correctedInvoices.filter((entry) => entry.changed);
  const syncedChangedInvoices = changedInvoices.filter((entry) =>
    isZohoSynced(entry.invoice)
  );

  if (syncedChangedInvoices.length > 0) {
    syncedChangedInvoices.forEach((entry) => {
      audit.blockedSyncedInvoices.push({
        orderId,
        invoiceId: entry.invoice.id,
        invoiceNo: entry.invoice.invoiceNo,
        currentTotal: numberValue(
          entry.invoice?.totals?.grandTotal ??
            entry.invoice?.overallSummary?.grandTotal
        ),
        correctedTotal: entry.totals.grandTotal,
        pricingReviewMarked: Boolean(entry.invoice?.pricingReviewRequired),
        zohoInvoiceNo:
          entry.invoice.zohoInvoiceNo ||
          entry.invoice.tallyVoucherNo ||
          entry.invoice.zohoNumber,
      });
    });
    if (shouldApply) {
      const reviewBatch = db.batch();
      const detectedAt = new Date().toISOString();
      syncedChangedInvoices.forEach((entry) => {
        reviewBatch.set(
          entry.invoice.ref,
          {
            pricingReviewRequired: {
              reason: "SYNCED_INVOICE_PRICING_MISMATCH",
              currentTotal: numberValue(
                entry.invoice?.totals?.grandTotal ??
                  entry.invoice?.overallSummary?.grandTotal
              ),
              expectedTotal: entry.totals.grandTotal,
              quotationId: order.quotationId,
              quotationNo: quotation.quotationNo,
              detectedAt,
            },
          },
          { merge: true }
        );
      });
      await reviewBatch.commit();
    }
    continue;
  }

  if (!orderChanged) audit.alreadyCorrectOrders += 1;
  audit.alreadyCorrectInvoices +=
    correctedInvoices.length - changedInvoices.length;

  if (!orderChanged && changedInvoices.length === 0) continue;

  audit.changes.push({
    orderId,
    quotationNo: quotation.quotationNo,
    orderBefore: numberValue(
      order?.overallSummary?.grandTotal ?? order?.totalAmount
    ),
    orderAfter: overallSummary.grandTotal,
    invoices: changedInvoices.map((entry) => ({
      invoiceId: entry.invoice.id,
      invoiceNo: entry.invoice.invoiceNo,
      before: numberValue(
        entry.invoice?.totals?.grandTotal ??
          entry.invoice?.overallSummary?.grandTotal
      ),
      after: entry.totals.grandTotal,
    })),
  });

  if (!shouldApply) continue;

  const now = new Date().toISOString();
  const batch = db.batch();
  const repairedInvoiceAmounts = new Map(
    correctedInvoices.map((entry) => [
      entry.invoice.id,
      entry.totals.grandTotal,
    ])
  );
  const invoicing = {
    ...(order.invoicing || {}),
    invoices: Array.isArray(order?.invoicing?.invoices)
      ? order.invoicing.invoices.map((entry) => ({
          ...entry,
          amount:
            repairedInvoiceAmounts.get(entry.invoiceId) ?? entry.amount,
        }))
      : [],
  };

  if (orderChanged) {
    batch.update(orderRef, stripUndefinedDeep({
      "sections.NORMAL.items": correctedNormalItems,
      "sections.NORMAL.summary": normalSummary,
      "sections.VAS.items": correctedVasItems,
      "sections.VAS.summary": vasSummary,
      overallSummary,
      totalAmount: overallSummary.grandTotal,
      invoicing,
      pricingRepair: {
        source: "BULK_EXACT_CONVERTED_QUOTATION",
        quotationId: order.quotationId,
        quotationNo: quotation.quotationNo,
        previousTotal: numberValue(
          order?.overallSummary?.grandTotal ?? order?.totalAmount
        ),
        correctedTotal: overallSummary.grandTotal,
        repairedAt: now,
      },
      updatedAt: now,
    }));

    if (order.dealOrderDocId) {
      const dealOrderRef = db
        .collection("customers")
        .doc(order.customerId)
        .collection("deals")
        .doc(order.dealId)
        .collection("orders")
        .doc(order.dealOrderDocId);
      batch.set(
        dealOrderRef,
        stripUndefinedDeep({ overallSummary }),
        { merge: true }
      );
    }
    audit.repairedOrders += 1;
  }

  changedInvoices.forEach((entry) => {
    const invoice = entry.invoice;
    batch.update(invoice.ref, stripUndefinedDeep({
      "sections.NORMAL.items": entry.normalItems,
      "sections.NORMAL.summary": entry.normalSummary,
      "sections.VAS.items": entry.vasItems,
      "sections.VAS.summary": entry.vasSummary,
      overallSummary: entry.overallSummary,
      taxSummary: {
        NORMAL: {
          cgst: entry.normalSummary.gstTotal / 2,
          sgst: entry.normalSummary.gstTotal / 2,
          igst: 0,
        },
        VAS: {
          cgst: entry.vasSummary.gstTotal / 2,
          sgst: entry.vasSummary.gstTotal / 2,
          igst: 0,
        },
      },
      items: entry.printableItems,
      totals: entry.totals,
      pricingRepair: {
        source: "BULK_EXACT_CONVERTED_QUOTATION",
        quotationId: order.quotationId,
        quotationNo: quotation.quotationNo,
        previousTotal: numberValue(
          invoice?.totals?.grandTotal ??
            invoice?.overallSummary?.grandTotal
        ),
        correctedTotal: entry.totals.grandTotal,
        repairedAt: now,
      },
      updatedAt: now,
    }));
    audit.repairedInvoices += 1;
  });

  await batch.commit();
}

const financiallyChanged = audit.changes.filter(
  (change) =>
    moneyChanged(change.orderBefore, change.orderAfter) ||
    change.invoices.some((invoice) => moneyChanged(invoice.before, invoice.after))
);
const output = {
  mode: audit.mode,
  invoiceCount: audit.invoiceCount,
  orderCount: audit.orderCount,
  repairedOrders: audit.repairedOrders,
  repairedInvoices: audit.repairedInvoices,
  alreadyCorrectOrders: audit.alreadyCorrectOrders,
  alreadyCorrectInvoices: audit.alreadyCorrectInvoices,
  candidateOrderCount: audit.changes.length,
  financiallyChangedOrderCount: financiallyChanged.length,
  financiallyChangedInvoiceCount: financiallyChanged.reduce(
    (count, change) =>
      count +
      change.invoices.filter((invoice) =>
        moneyChanged(invoice.before, invoice.after)
      ).length,
    0
  ),
  blockedSyncedInvoiceCount: audit.blockedSyncedInvoices.length,
  skippedOrderCount: audit.skippedOrders.length,
  blockedSyncedInvoices: audit.blockedSyncedInvoices,
  financiallyChanged,
  skippedReasonCounts: audit.skippedOrders.reduce((counts, entry) => {
    counts[entry.reason] = (counts[entry.reason] || 0) + 1;
    return counts;
  }, {}),
};
console.log(JSON.stringify(output, null, 2));
process.exit(0);
