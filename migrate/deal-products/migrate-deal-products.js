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
  deleteOld: process.env.MIGRATE_DELETE_OLD === "true",
  overwriteExisting: process.env.MIGRATE_OVERWRITE === "true",
  writeReport: true,
};

const OUTPUT_REPORT_PATH = path.join(__dirname, "deal-products-report.json");

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

const toTrimmedString = (value) => {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
};

const toUpper = (value) => {
  const text = toTrimmedString(value);
  return text ? text.toUpperCase() : undefined;
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const buildDealProductMeta = (product) => {
  const cloned = { ...product };
  delete cloned.file;
  delete cloned.meta;
  return stripUndefinedDeep(cloned);
};

const resolveDealProductType = (product) => {
  const raw = toTrimmedString(product.productType || product.productSource || product.category);
  if (!raw) return "FABRIC";
  if (raw.toUpperCase() === "VAS") return "VAS";
  return raw.toUpperCase();
};

const resolveDealProductCategory = (product) =>
  toTrimmedString(product.categoryGroup || product.productCategory || product.category);

const resolveDealProductGroup = (product) =>
  toTrimmedString(product.group || product.productSource || product.productType || product.VasType);

const resolveDealProductDescription = (product) => {
  const supplierName = toTrimmedString(product.supplierCollectionName);
  const supplierCode = toTrimmedString(product.supplierCollectionCode);
  const combined = [supplierName, supplierCode].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  return (
    toTrimmedString(product.salesDescription) ||
    toTrimmedString(product.subCategory) ||
    toTrimmedString(product.itemName) ||
    toTrimmedString(product.collectionBrand)
  );
};

const buildDealProductItem = (product) =>
  stripUndefined({
    roomName: toTrimmedString(product.room),
    type: resolveDealProductType(product),
    category: resolveDealProductCategory(product),
    bcn: toTrimmedString(product.bcn || product.collectionBrand),
    description: resolveDealProductDescription(product),
    unit: toUpper(product.unit),
    rate: toNumber(product.rate ?? product.mrp),
    qty: toNumber(product.quantity ?? product.noOfBlind),
    gst: toNumber(product.gstPercent),
    hsn: toTrimmedString(product.hsnOrSac || product.hsnCode),
    group: resolveDealProductGroup(product),
    itemName: toTrimmedString(product.itemName),
    meta: buildDealProductMeta(product),
  });

const extractLegacyProducts = async (dealRef, dealData) => {
  const collected = [];
  if (Array.isArray(dealData?.products)) {
    collected.push(...dealData.products);
  }

  const productsSnap = await dealRef.collection("products").get();
  if (!productsSnap.empty) {
    for (const productDoc of productsSnap.docs) {
      const productData = productDoc.data() || {};
      if (Array.isArray(productData.products)) {
        collected.push(...productData.products);
      } else if (Object.keys(productData).length) {
        collected.push(productData);
      }
    }
  }

  return collected.filter(Boolean);
};

const removeLegacyProducts = async (dealRef, hasField, hasSubcollection) => {
  if (hasField) {
    await dealRef.update({ products: admin.firestore.FieldValue.delete() });
  }
  if (hasSubcollection) {
    const productsSnap = await dealRef.collection("products").get();
    for (const productDoc of productsSnap.docs) {
      await productDoc.ref.delete();
    }
  }
};

const run = async () => {
  const customersSnap = await db.collection("customers").get();
  const report = [];

  console.log(`Found ${customersSnap.size} customers.`);
  console.log(`Dry run: ${CONFIG.dryRun}`);

  for (const customerSnap of customersSnap.docs) {
    const customerId = customerSnap.id;
    const dealsSnap = await customerSnap.ref.collection("deals").get();

    if (dealsSnap.empty) continue;

    for (const dealSnap of dealsSnap.docs) {
      const dealData = dealSnap.data() || {};
      const dealId = String(dealData.dealId || dealSnap.id);
      const dealProductsRef = db.collection("dealProducts").doc(dealId);
      const existingSnap = await dealProductsRef.get();

      if (existingSnap.exists && !CONFIG.overwriteExisting) {
        report.push({
          customerId,
          dealId,
          status: "skipped_existing",
          legacyCount: 0,
          normalCount: 0,
          vasCount: 0,
        });
        continue;
      }

      const legacyProducts = await extractLegacyProducts(dealSnap.ref, dealData);
      const hasLegacyField = Array.isArray(dealData?.products);
      const hasLegacySubcollection = !(await dealSnap.ref.collection("products").limit(1).get()).empty;

      if (legacyProducts.length === 0) {
        report.push({
          customerId,
          dealId,
          status: "no_legacy_products",
          legacyCount: 0,
          normalCount: 0,
          vasCount: 0,
        });
        continue;
      }

      const mappedItems = legacyProducts.map(buildDealProductItem).filter(Boolean);
      const normalItems = mappedItems.filter((item) => item.type !== "VAS");
      const vasItems = mappedItems.filter((item) => item.type === "VAS");

      const now = new Date().toISOString();
      const payload = stripUndefinedDeep({
        dealProductId: dealId,
        dealId,
        customerId,
        sections: {
          NORMAL: { items: normalItems },
          VAS: { items: vasItems },
        },
        status: dealData?.dealProductsStatus || "DRAFT",
        updates: [
          stripUndefined({
            updatedAt: now,
            updatedBy: { name: "Migration" },
            action: "MIGRATED",
            message: `Migrated ${mappedItems.length} items.`,
          }),
        ],
        createdAt: dealData?.createdAt || now,
        updatedAt: now,
        createdBy: dealData?.createdBy || "Migration",
      });

      console.log(
        `Deal ${dealId} (customer ${customerId}): ${mappedItems.length} items -> NORMAL ${normalItems.length}, VAS ${vasItems.length}`
      );

      report.push({
        customerId,
        dealId,
        status: "migrated",
        legacyCount: legacyProducts.length,
        normalCount: normalItems.length,
        vasCount: vasItems.length,
      });

      if (CONFIG.dryRun) continue;

      await dealProductsRef.set(payload, { merge: false });

      if (CONFIG.deleteOld) {
        await removeLegacyProducts(dealSnap.ref, hasLegacyField, hasLegacySubcollection);
      }
    }
  }

  if (CONFIG.writeReport) {
    fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`Report written to ${OUTPUT_REPORT_PATH}`);
  }

  console.log("DealProducts migration complete.");
};

run().catch((error) => {
  console.error("DealProducts migration failed:", error);
  process.exit(1);
});
