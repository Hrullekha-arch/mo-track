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
  dryRun: process.env.MIGRATE_DRY_RUN === "true",
  deleteOldDocs: process.env.MIGRATE_DELETE_OLD !== "false",
  copySubcollections: true,
  writeIdMap: true,
};

const OUTPUT_MAP_PATH = path.join(__dirname, "deal-id-map.json");

const stripUndefined = (value) =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );

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

const toNumber = (value, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ensureFourDigitId = (value) => {
  const cleaned = String(value || "").replace(/\D/g, "");
  if (cleaned.length === 4) return cleaned;
  return "";
};

const generateDealId = () => String(Math.floor(1000 + Math.random() * 9000));

const buildDealCode = (dealId) => {
  const year = new Date().getFullYear();
  return `DEAL-${year}-${dealId}`;
};

const resolveSalesPerson = async (dealData) => {
  if (dealData?.assignedSalesPerson?.id || dealData?.assignedSalesPerson?.name) {
    return dealData.assignedSalesPerson;
  }
  const repId = dealData?.representativeId || dealData?.salesmanId;
  if (!repId) return undefined;
  try {
    const repSnap = await db.collection("users").doc(repId).get();
    const repName = repSnap.exists ? repSnap.data()?.name : undefined;
    return stripUndefined({ id: repId, name: repName });
  } catch (error) {
    console.warn("Failed to resolve representative name:", repId, error);
    return { id: repId };
  }
};

const buildDealPayload = async ({ dealData, dealId, customerId, customer }) => {
  const now = new Date().toISOString();
  const title = dealData?.title || dealData?.dealName || "Untitled Deal";
  const description = dealData?.description || "";
  const assignedSalesPerson = await resolveSalesPerson(dealData);

  const createdAt = dealData?.createdAt || now;
  const lastUpdatedAt = dealData?.lastUpdatedAt || dealData?.updatedAt || now;

  const dates = stripUndefined({
    createdAt,
    firstVisitDate: dealData?.dates?.firstVisitDate,
    measurementDate: dealData?.dates?.measurementDate,
    quotationDate: dealData?.dates?.quotationDate,
    orderDate: dealData?.dates?.orderDate,
    closedDate: dealData?.dates?.closedDate,
  });

  return stripUndefinedDeep({
    dealId,
    dealCode: dealData?.dealCode || buildDealCode(dealId),
    customer: stripUndefined({
      id: customerId,
      name: customer?.name || "",
      phone: customer?.phone || customer?.mobileNo || "",
      customerType: customer?.customerType || "INDIVIDUAL",
    }),
    title,
    description,
    dealType: dealData?.dealType || "NEW",
    dealSource: dealData?.dealSource || dealData?.source || "REFERENCE",
    assignedSalesPerson,
    expectedValue: toNumber(dealData?.expectedValue ?? dealData?.dealAmount, 0),
    actualQuotationValue: toNumber(dealData?.actualQuotationValue, 0),
    actualOrderValue: toNumber(dealData?.actualOrderValue, 0),
    status: dealData?.status || "OPEN",
    lostReason: dealData?.lostReason,
    dates: Object.keys(dates).length ? dates : undefined,
    recent: dealData?.recent || { visits: [], quotations: [], orders: [] },
    lastUpdatedAt,

    // Legacy fields for compatibility
    dealName: title,
    dealAmount: toNumber(dealData?.dealAmount, toNumber(dealData?.expectedValue, 0)),
    representativeId: assignedSalesPerson?.id,
    createdAt,
    customerId,
  });
};

const copyDocument = async (sourceRef, targetRef) => {
  const snap = await sourceRef.get();
  if (!snap.exists) return;
  const data = snap.data();
  if (!CONFIG.dryRun) {
    await targetRef.set(stripUndefined({ ...data, id: targetRef.id }), { merge: false });
  }
};

const copySubcollections = async (sourceRef, targetRef) => {
  const collections = await sourceRef.listCollections();
  for (const collectionRef of collections) {
    const snapshot = await collectionRef.get();
    for (const docSnap of snapshot.docs) {
      const destDocRef = targetRef.collection(collectionRef.id).doc(docSnap.id);
      await copyDocument(docSnap.ref, destDocRef);
      if (CONFIG.copySubcollections) {
        await copySubcollections(docSnap.ref, destDocRef);
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
  const idMap = [];

  console.log(`Found ${customersSnap.size} customers.`);
  console.log(`Dry run: ${CONFIG.dryRun}`);

  for (const customerSnap of customersSnap.docs) {
    const customerId = customerSnap.id;
    const customerData = customerSnap.data();
    const dealsRef = customerSnap.ref.collection("deals");
    const dealsSnap = await dealsRef.get();

    if (dealsSnap.empty) {
      continue;
    }

    const existingIds = new Set(dealsSnap.docs.map((doc) => doc.id));

    for (const dealSnap of dealsSnap.docs) {
      const dealData = dealSnap.data() || {};
      const oldId = dealSnap.id;

      let dealId = ensureFourDigitId(dealData.dealId || oldId);
      if (!dealId) {
        do {
          dealId = generateDealId();
        } while (existingIds.has(dealId));
      }
      existingIds.add(dealId);

      const newDocRef = dealsRef.doc(dealId);
      const payload = await buildDealPayload({
        dealData,
        dealId,
        customerId,
        customer: customerData,
      });

      idMap.push({
        customerId,
        oldId,
        newId: dealId,
        title: payload.title,
      });

      console.log(`Customer ${customerId}: ${oldId} -> ${dealId}`);

      if (CONFIG.dryRun) continue;

      await newDocRef.set(payload, { merge: false });
      if (CONFIG.copySubcollections) {
        await copySubcollections(dealSnap.ref, newDocRef);
      }

      if (CONFIG.deleteOldDocs && oldId !== dealId) {
        await deleteDocumentWithSubcollections(dealSnap.ref);
      }
    }
  }

  if (CONFIG.writeIdMap) {
    fs.writeFileSync(OUTPUT_MAP_PATH, JSON.stringify(idMap, null, 2));
    console.log(`ID map written to ${OUTPUT_MAP_PATH}`);
  }

  console.log("Deal migration complete.");
};

run().catch((error) => {
  console.error("Deal migration failed:", error);
  process.exit(1);
});
