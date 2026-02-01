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
  deleteOldLengths: process.env.MIGRATE_DELETE_OLD !== "false",
  writeIdMap: true,
};

const OUTPUT_MAP_PATH = path.join(__dirname, "inventory-id-map.json");

const stripUndefined = (value) =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );

const normalizeCategory = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.toUpperCase() : "FABRIC";
};

const extractBcnDigits = (value) => String(value ?? "").replace(/\D/g, "");

const run = async () => {
  const stocksSnap = await db.collection("stocks").get();
  const idMap = [];

  console.log(`Found ${stocksSnap.size} stock master docs.`);
  console.log(`Dry run: ${CONFIG.dryRun}`);

  for (const stockSnap of stocksSnap.docs) {
    const stockRef = stockSnap.ref;
    const data = stockSnap.data() || {};

    const bcn = data.bcn || stockSnap.id;
    const bcnDigits = data.bcnDigits || extractBcnDigits(bcn);
    const name = data.name || data.itemName || "";
    const category = normalizeCategory(data.category || data.type);
    const isService = data.isService ?? category === "VAS";
    const unit = String(data.unit || "MTR").toUpperCase();

    const lengthsSnap = await stockRef.collection("lengths").get();

    let totalQty = 0;
    let availableQty = 0;
    let reservedQty = 0;
    let cutQty = 0;
    let damagedQty = 0;

    const lengthEntries = lengthsSnap.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() || {},
    }));

    // Sort by received/updated, fallback to doc id for stability
    lengthEntries.sort((a, b) => {
      const aTime = new Date(a.data.receivedAt || a.data.lastUpdatedAt || 0).getTime();
      const bTime = new Date(b.data.receivedAt || b.data.lastUpdatedAt || 0).getTime();
      if (aTime && bTime && aTime !== bTime) return aTime - bTime;
      return a.id.localeCompare(b.id);
    });

    let lengthNo = 0;
    for (const length of lengthEntries) {
      lengthNo += 1;
      const originalLength = Number(length.data.originalLength ?? length.data.quantity ?? 0);
      const availableLength = Number(
        length.data.availableLength ?? length.data.availableQty ?? originalLength
      );
      const reserved = Number(length.data.reservedQty ?? 0);
      const cut = Number(length.data.cutQty ?? 0);
      const damaged = Number(length.data.damagedQty ?? 0);

      totalQty += originalLength;
      availableQty += availableLength;
      reservedQty += reserved;
      cutQty += cut;
      damagedQty += damaged;

      const nextLengthId = `${bcn}_${lengthNo}`;
      const lengthRef = stockRef.collection("lengths").doc(nextLengthId);

      const payload = stripUndefined({
        id: nextLengthId,
        lengthId: nextLengthId,
        lengthNo,
        batchNo: length.data.batchNo || length.data.poNumber || "",
        warehouseId: length.data.warehouseId || "",
        originalLength,
        availableLength,
        unit,
        rack: length.data.rack || data.rack || "",
        status: length.data.status || "AVAILABLE",
        reservation: length.data.reservation || null,
        cutHistory: Array.isArray(length.data.cutHistory) ? length.data.cutHistory : [],
        receivedAt: length.data.receivedAt || length.data.lastUpdatedAt || data.createdAt || new Date().toISOString(),
        lastUpdatedAt: length.data.lastUpdatedAt || new Date().toISOString(),
        // legacy mirrors
        bcn,
        bcnDigits,
        itemName: data.itemName || name,
        quantity: originalLength,
        availableQty: availableLength,
        reservedQty: reserved,
        cutQty: cut,
        poNumber: length.data.poNumber || "",
        salesman: length.data.salesman,
      });

      idMap.push({
        bcn,
        oldLengthId: length.id,
        newLengthId: nextLengthId,
      });

      if (CONFIG.dryRun) continue;
      await lengthRef.set(payload, { merge: false });
      if (CONFIG.deleteOldLengths && length.id !== nextLengthId) {
        await stockRef.collection("lengths").doc(length.id).delete();
      }
    }

    const now = new Date().toISOString();
    const masterPayload = stripUndefined({
      itemId: stockSnap.id,
      productId: data.productId,
      bcn,
      bcnDigits,
      name,
      itemName: data.itemName || name,
      category,
      categoryGroup: data.categoryGroup,
      isService,
      unit,
      isActive: data.isActive ?? true,
      totalQty: totalQty || Number(data.totalQty ?? data.quantity ?? data.closingstock ?? 0),
      availableQty: availableQty || Number(data.availableQty ?? 0),
      reservedQty: reservedQty || Number(data.reservedQty ?? 0),
      damagedQty: damagedQty || Number(data.damagedQty ?? 0),
      cutQty: cutQty || Number(data.cutQty ?? 0),
      closingstock: totalQty || Number(data.closingstock ?? data.quantity ?? 0),
      quantity: totalQty || Number(data.quantity ?? data.closingstock ?? 0),
      supplierCompanyName: data.supplierCompanyName || data.vendorName,
      supplierCollectionName: data.supplierCollectionName,
      supplierCollectionCode: data.supplierCollectionCode,
      costPriceRs: data.costPriceRs,
      costMultiplierRs: data.costMultiplierRs,
      rrpWithGstRs: data.rrpWithGstRs,
      hsnOrSac: data.hsnOrSac || data.hsnCode,
      hsnCode: data.hsnCode || data.hsnOrSac,
      gstPercent: data.gstPercent,
      createdAt: data.createdAt || now,
      updatedAt: now,
      lastUpdatedAt: now,
      nextLengthNo: lengthNo + 1,
    });

    if (!CONFIG.dryRun) {
      await stockRef.set(masterPayload, { merge: true });
    }
  }

  if (CONFIG.writeIdMap) {
    fs.writeFileSync(OUTPUT_MAP_PATH, JSON.stringify(idMap, null, 2));
    console.log(`ID map written to ${OUTPUT_MAP_PATH}`);
  }

  console.log("Inventory migration complete.");
};

run().catch((error) => {
  console.error("Inventory migration failed:", error);
  process.exit(1);
});
