/* eslint-disable no-console */
const path = require("path");
const readline = require("readline");
const admin = require("firebase-admin");
const dotenv = require("dotenv");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(ROOT_DIR, ".env") });
dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });

const SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!SERVICE_ACCOUNT) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY missing in env");
}

let serviceAccountJson;
try {
  serviceAccountJson = JSON.parse(SERVICE_ACCOUNT);
} catch {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON");
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountJson),
  });
}

const db = admin.firestore();

const CONFIG = {
  dryRun: process.env.MIGRATE_DRY_RUN === "true",
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
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
      .filter(([, entry]) => entry !== undefined);
    return Object.fromEntries(entries);
  }
  return value;
};

const ask = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });

const coerceNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeGstMode = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "EXCL" || raw === "EXCLUSIVE") return "EXCL";
  if (raw === "INCL" || raw === "INCLUSIVE") return "INCL";
  return undefined;
};

const resolveOrderItemType = (item) => {
  const raw = String(item?.type || item?.productType || item?.bcnType || "").trim().toUpperCase();
  if (raw.includes("HARDWARE")) return "HARDWARE";
  if (raw.includes("CHANNEL")) return "CHANNEL";
  if (raw.includes("ACCESSORY")) return "ACCESSORY";
  if (raw.includes("VAS")) return "VAS";
  if (raw.includes("FURNITURE")) return "FURNITURE";
  return "FABRIC";
};

const resolveOrderItemUnit = (itemType, item) => {
  const unit = String(item?.unit || "").trim().toUpperCase();
  if (unit) return unit;
  if (itemType === "FABRIC") return "MTR";
  return "PCS";
};

const computeAmounts = ({ qty, gst, gstMode, discountPercent, inputRate }) => {
  const safeQty = coerceNumber(qty, 0);
  const safeGst = coerceNumber(gst, 0);
  const safeDiscount = coerceNumber(discountPercent, 0);
  const safeRate = coerceNumber(inputRate, 0);

  let exclusiveRate = safeRate;
  if (gstMode === "INCL" && safeGst > 0 && safeRate > 0) {
    exclusiveRate = safeRate / (1 + safeGst / 100);
  }

  const grossRate = gstMode === "EXCL" ? exclusiveRate : safeRate;
  const grossAmount = grossRate * safeQty;
  const discountAmount = grossAmount * (safeDiscount / 100);
  const amountAfterDiscount = grossAmount - discountAmount;

  let taxableAmount = 0;
  let gstAmount = 0;
  let totalAmount = 0;

  if (gstMode === "EXCL") {
    taxableAmount = amountAfterDiscount;
    gstAmount = taxableAmount * (safeGst / 100);
    totalAmount = taxableAmount + gstAmount;
  } else {
    taxableAmount = safeGst > 0 ? amountAfterDiscount / (1 + safeGst / 100) : amountAfterDiscount;
    gstAmount = amountAfterDiscount - taxableAmount;
    totalAmount = amountAfterDiscount;
  }

  return {
    exclusiveRate,
    taxableAmount,
    gstAmount,
    totalAmount,
  };
};

const buildOrderItem = (item, overrides = {}) => {
  const type = overrides.type || resolveOrderItemType(item);
  const qty = coerceNumber(item.qty ?? item.quantity ?? item.count ?? 0);
  const gst = coerceNumber(item.gst ?? item.gstPercent ?? item.taxPercent ?? 0);
  const discountPercent = coerceNumber(item.discountPercent ?? item.discount ?? 0);
  const gstMode =
    normalizeGstMode(item.gstMode ?? item.gstType) ||
    (item.taxableAmt || item.taxableAmount ? "EXCL" : undefined) ||
    "INCL";
  const inputRate = coerceNumber(
    item.rate ?? item.originalMrp ?? item.mrp ?? item.unitPrice ?? item.unitRate ?? 0
  );

  const amounts = computeAmounts({
    qty,
    gst,
    gstMode,
    discountPercent,
    inputRate,
  });

  const baseItem = {
    roomName: item.roomName ?? item.room ?? undefined,
    type,
    category: item.category ?? item.subCategory ?? undefined,
    itemId: item.itemId ?? undefined,
    bcn: item.bcn ?? item.collectionBrand ?? item.fabricName ?? item.furnitureName ?? undefined,
    description:
      item.description ??
      item.salesDescription ??
      item.fabricName ??
      item.furnitureName ??
      item.vasName ??
      undefined,
    unit: resolveOrderItemUnit(type, item),
    rate: coerceNumber(item.exclusiveRate ?? item.rate ?? amounts.exclusiveRate ?? inputRate, 0),
    exclusiveRate: coerceNumber(item.exclusiveRate ?? amounts.exclusiveRate ?? inputRate, 0),
    qty,
    gst,
    gstMode,
    discountPercent,
    hsn: item.hsn ?? item.hsnCode ?? undefined,
    group: item.group ?? undefined,
    taxableAmount: item.taxableAmount ?? item.taxableAmt ?? amounts.taxableAmount,
    gstAmount:
      item.gstAmount ??
      ((coerceNumber(item.cgst, 0) + coerceNumber(item.sgst, 0) + coerceNumber(item.igst, 0)) ||
      amounts.gstAmount),
    totalAmount:
      item.totalAmount ??
      item.total ??
      item.amount ??
      (amounts.taxableAmount + (amounts.gstAmount || 0)),
  };

  if (type !== "VAS") {
    baseItem.allocation = item.allocation || {
      status: "PENDING",
      lengths: [],
      lots: [],
    };
  }

  return { ...baseItem, ...overrides };
};

const summarizeItems = (items) =>
  items.reduce(
    (acc, item) => {
      acc.subTotal += coerceNumber(item.taxableAmount);
      acc.gstTotal += coerceNumber(item.gstAmount);
      acc.grandTotal += coerceNumber(item.totalAmount);
      return acc;
    },
    { subTotal: 0, gstTotal: 0, grandTotal: 0 }
  );

const isFabricItem = (item) => {
  const type = String(item?.type || "").trim().toUpperCase();
  const unit = String(item?.unit || "").trim().toUpperCase();
  return type === "FABRIC" || unit === "MTR";
};

const ensureFabricAllocations = (items) => {
  let changed = false;
  const updated = items.map((item, index) => {
    if (!isFabricItem(item)) return item;

    const existing = item?.allocation || {};
    const hasLengths = Array.isArray(existing.lengths) && existing.lengths.length > 0;
    const hasLots = Array.isArray(existing.lots) && existing.lots.length > 0;
    if (hasLengths || hasLots) return item;

    const qty = coerceNumber(item?.qty ?? item?.quantity ?? 0);
    if (!qty || qty <= 0) return item;

    changed = true;
    const lengthId = `MIG-LEN-${String(index + 1).padStart(3, "0")}`;
    const stockItemId =
      item?.bcn || item?.description || item?.itemName || `ITEM-${String(index + 1).padStart(3, "0")}`;

    return {
      ...item,
      allocation: {
        status: "ALLOCATED",
        lengths: [
          {
            lengthId,
            stockItemId,
            allocatedQty: qty,
          },
        ],
        lots: [],
      },
    };
  });

  return { items: updated, changed };
};

const buildSectionsFromLegacy = (order) => {
  const existingNormal = Array.isArray(order?.sections?.NORMAL?.items)
    ? order.sections.NORMAL.items
    : [];
  const existingVas = Array.isArray(order?.sections?.VAS?.items)
    ? order.sections.VAS.items
    : [];

  if (existingNormal.length || existingVas.length) {
    return {
      normalItems: existingNormal,
      vasItems: existingVas,
      usedLegacy: false,
    };
  }

  const legacyItems = Array.isArray(order?.items) ? order.items : [];
  if (legacyItems.length) {
    const mapped = legacyItems.map((item) => buildOrderItem(item));
    return {
      normalItems: mapped.filter((item) => item.type !== "VAS"),
      vasItems: mapped.filter((item) => item.type === "VAS"),
      usedLegacy: true,
    };
  }

  const fabricDetails = Array.isArray(order?.fabricDetails) ? order.fabricDetails : [];
  const furnitureDetails = Array.isArray(order?.furnitureDetails) ? order.furnitureDetails : [];
  const vasDetails = Array.isArray(order?.vasDetails) ? order.vasDetails : [];

  const fabricItems = fabricDetails.map((item) =>
    buildOrderItem(
      {
        ...item,
        qty: item.quantity,
        bcn: item.fabricName,
        description: item.fabricName,
      },
      { type: "FABRIC" }
    )
  );

  const furnitureItems = furnitureDetails.map((item) =>
    buildOrderItem(
      {
        ...item,
        qty: item.quantity,
        bcn: item.furnitureName,
        description: item.furnitureName,
      },
      { type: "FURNITURE", unit: "PCS" }
    )
  );

  const vasItems = vasDetails.map((item) =>
    buildOrderItem(
      {
        ...item,
        qty: item.quantity,
        description: item.vasName,
        gstPercent: item.gstPercent,
        hsnCode: item.hsnCode,
        taxableAmount: item.taxableAmt,
      },
      { type: "VAS" }
    )
  );

  return {
    normalItems: [...fabricItems, ...furnitureItems],
    vasItems,
    usedLegacy: true,
  };
};

const run = async () => {
  console.log("Order schema migration (single order)");
  console.log("Dry run:", CONFIG.dryRun);

  const input = await ask("Enter order ID or CRM order no: ");
  if (!input) {
    console.log("No order ID provided. Exiting.");
    return;
  }

  let orderRef = db.collection("orders").doc(input);
  let orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    const byCrmSnap = await db
      .collection("orders")
      .where("crmOrderNo", "==", input)
      .limit(2)
      .get();
    if (byCrmSnap.empty) {
      throw new Error(`Order not found for "${input}".`);
    }
    orderSnap = byCrmSnap.docs[0];
    orderRef = orderSnap.ref;
  }

  const order = orderSnap.data() || {};
  console.log(
    `Found order ${orderRef.id} (CRM: ${order.crmOrderNo || "N/A"}, Customer: ${
      order.customerName || "N/A"
    })`
  );

  const proceed = await ask("Proceed with migration? (y/N): ");
  if (!/^y(es)?$/i.test(proceed)) {
    console.log("Migration cancelled.");
    return;
  }

  const { normalItems: rawNormalItems, vasItems, usedLegacy } = buildSectionsFromLegacy(order);
  const allocationResult = ensureFabricAllocations(rawNormalItems);
  const normalItems = allocationResult.items;
  const allocationChanged = allocationResult.changed;

  const normalSummary = summarizeItems(normalItems);
  const vasSummary = summarizeItems(vasItems);
  const overallSummary = {
    goodsTotal: normalSummary.grandTotal,
    vasTotal: vasSummary.grandTotal,
    grandTotal: normalSummary.grandTotal + vasSummary.grandTotal,
  };

  const sections = {
    NORMAL: {
      items: normalItems,
      summary: normalSummary,
    },
    VAS: {
      items: vasItems,
      summary: vasSummary,
    },
  };

  const hasSections =
    Array.isArray(order?.sections?.NORMAL?.items) ||
    Array.isArray(order?.sections?.VAS?.items);
  const hasOverall = !!order?.overallSummary?.grandTotal;

  if (hasSections && hasOverall && !usedLegacy && !allocationChanged) {
    console.log("Order already has the new schema. No changes needed.");
    return;
  }

  const now = new Date().toISOString();
  const updates = Array.isArray(order.updates) ? [...order.updates] : [];
  updates.push({
    updatedAt: now,
    action: "MIGRATE_ORDER_SCHEMA",
    message: "Migrated order to new schema sections/summary.",
  });

  const payload = stripUndefinedDeep({
    sections,
    overallSummary,
    updates,
    updatedAt: now,
  });

  if (CONFIG.dryRun) {
    console.log("DRY RUN - no data written");
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  await orderRef.update(payload);
  console.log("Order migration complete:", orderRef.id);
};

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
