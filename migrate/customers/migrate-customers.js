/* eslint-disable no-console */
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
const dotenv = require("dotenv");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(ROOT_DIR, ".env") });
dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });

const SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!SERVICE_ACCOUNT) {
  throw new Error(
    "FIREBASE_SERVICE_ACCOUNT_KEY is missing. Add it to .env/.env.local before running this migration."
  );
}

let serviceAccountJson = null;
try {
  serviceAccountJson = JSON.parse(SERVICE_ACCOUNT);
} catch (error) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON.");
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountJson),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

const db = admin.firestore();

const CONFIG = {
  dryRun: process.env.MIGRATE_DRY_RUN !== "false",
  deleteOldDocs: process.env.MIGRATE_DELETE_OLD === "true",
  updateCustomerIdInSubcollections: true,
  copySubcollections: true,
  writeIdMap: true,
};

const OUTPUT_MAP_PATH = path.join(__dirname, "customer-id-map.json");

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

const buildCustomerId = (name, phone) => {
  const normalizedName = normalizeName(name);
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedName || !normalizedPhone) return "";
  return `${normalizedName}_${normalizedPhone}`;
};

const stripUndefined = (value) =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );

const toStringValue = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const buildAddress = (source, fallback) => {
  const data = source && typeof source === "object" ? source : fallback || {};
  return stripUndefined({
    line1: toStringValue(data.line1 || data.addressLine1 || data.address || data.addressPinCode),
    line2: toStringValue(data.line2 || data.addressLine2 || data.landmark),
    city: toStringValue(data.city),
    state: toStringValue(data.state),
    pincode: toStringValue(data.pincode || data.pinCode),
  });
};

const defaultStats = () => ({
  totalVisits: 0,
  totalQuotations: 0,
  approvedQuotations: 0,
  totalOrders: 0,
  completedOrders: 0,
  totalInvoicedAmount: 0,
  totalPaidAmount: 0,
  totalPendingAmount: 0,
  lastVisitDate: null,
  lastOrderDate: null,
  lastInvoiceDate: null,
});

const defaultRecent = () => ({
  visits: [],
  quotations: [],
  orders: [],
});

const buildCustomerPayload = ({ data, newId, oldId, index }) => {
  const now = new Date().toISOString();

  const name = toStringValue(data.name || data.customerName);
  const phone = toStringValue(data.phone || data.mobileNo || data.customerPhone);

  const billingAddress = buildAddress(data.billingAddress, data);
  const shippingAddress = buildAddress(data.shippingAddress, data.billingAddress || data);

  const assignedSalesPerson =
    data.assignedSalesPerson ||
    (data.salesSupport
      ? {
          id: toStringValue(data.salesSupportId),
          name: toStringValue(data.salesSupport),
        }
      : undefined);

  const customerCode = toStringValue(data.customerCode || oldId || `CUST-${String(index + 1).padStart(6, "0")}`);

  return stripUndefined({
    customerId: newId,
    customerCode,
    name,
    phone,
    email: toStringValue(data.email),
    gstin: toStringValue(data.gstin),
    isGstRegistered:
      typeof data.isGstRegistered === "boolean"
        ? data.isGstRegistered
        : Boolean(toStringValue(data.gstin)),
    billingAddress,
    shippingAddress,
    customerType: toStringValue(data.customerType) || "INDIVIDUAL",
    tags: Array.isArray(data.tags) ? data.tags : [],
    assignedSalesPerson,
    stats: data.stats || defaultStats(),
    recent: data.recent || defaultRecent(),
    status: toStringValue(data.status) || "ACTIVE",
    createdAt: toStringValue(data.createdAt) || now,
    lastUpdatedAt: toStringValue(data.lastUpdatedAt || data.updatedAt) || now,
  });
};

const copyDocument = async (sourceRef, targetRef, customerId) => {
  const snap = await sourceRef.get();
  if (!snap.exists) return;
  const data = snap.data();
  if (CONFIG.updateCustomerIdInSubcollections && data && data.customerId) {
    data.customerId = customerId;
  }
  if (!CONFIG.dryRun) {
    await targetRef.set(stripUndefined({ ...data, id: targetRef.id }), { merge: false });
  }
};

const copySubcollections = async (sourceRef, targetRef, customerId) => {
  const collections = await sourceRef.listCollections();
  for (const collectionRef of collections) {
    const snapshot = await collectionRef.get();
    for (const docSnap of snapshot.docs) {
      const destDocRef = targetRef.collection(collectionRef.id).doc(docSnap.id);
      await copyDocument(docSnap.ref, destDocRef, customerId);
      if (CONFIG.copySubcollections) {
        await copySubcollections(docSnap.ref, destDocRef, customerId);
      }
    }
  }
};

const deleteDocumentWithSubcollections = async (docRef) => {
  const collections = await docRef.listCollections();
  for (const collectionRef of collections) {
    const snapshot = await collectionRef.get();
    for (const docSnap of snapshot.docs) {
      await deleteDocumentWithSubcollections(docSnap.ref);
    }
  }
  await docRef.delete();
};

const run = async () => {
  const customersSnap = await db.collection("customers").get();
  const existingIds = new Set(customersSnap.docs.map((doc) => doc.id));
  const usedIds = new Set();
  const idMap = [];

  console.log(`Found ${customersSnap.size} customers.`);
  console.log(`Dry run: ${CONFIG.dryRun}`);

  for (const [index, docSnap] of customersSnap.docs.entries()) {
    const oldId = docSnap.id;
    const data = docSnap.data() || {};
    const name = data.name || data.customerName || "";
    const phone = data.phone || data.mobileNo || data.customerPhone || "";

    let baseId = buildCustomerId(name, phone) || oldId;
    let newId = baseId;
    let counter = 1;

    while ((existingIds.has(newId) && newId !== oldId) || usedIds.has(newId)) {
      newId = `${baseId}__${counter}`;
      counter += 1;
    }
    usedIds.add(newId);

    const payload = buildCustomerPayload({ data, newId, oldId, index });
    idMap.push({ oldId, newId, name: toStringValue(name), phone: toStringValue(phone) });

    console.log(`[${index + 1}/${customersSnap.size}] ${oldId} -> ${newId}`);

    if (CONFIG.dryRun) {
      continue;
    }

    const newDocRef = db.collection("customers").doc(newId);
    await newDocRef.set(payload, { merge: false });

    if (CONFIG.copySubcollections) {
      await copySubcollections(docSnap.ref, newDocRef, newId);
    }

    if (CONFIG.deleteOldDocs && newId !== oldId) {
      await deleteDocumentWithSubcollections(docSnap.ref);
    }
  }

  if (CONFIG.writeIdMap) {
    fs.writeFileSync(OUTPUT_MAP_PATH, JSON.stringify(idMap, null, 2));
    console.log(`ID map written to ${OUTPUT_MAP_PATH}`);
  }

  console.log("Migration complete.");
};

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
