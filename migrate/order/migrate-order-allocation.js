/* eslint-disable no-console */
const path = require("path");
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
  ORDER_ID: "MOTRACK-5393",
  dryRun: process.env.MIGRATE_DRY_RUN === "true",
};

const run = async () => {
  console.log("🔧 Order allocation migration");
  console.log("Order:", CONFIG.ORDER_ID);
  console.log("Dry run:", CONFIG.dryRun);

  const orderRef = db.collection("orders").doc(CONFIG.ORDER_ID);
  const snap = await orderRef.get();

  if (!snap.exists) {
    throw new Error(`Order ${CONFIG.ORDER_ID} not found`);
  }

  const order = snap.data();
  const items = order?.sections?.NORMAL?.items || [];

  if (!items.length) {
    console.log("No NORMAL items found. Nothing to migrate.");
    return;
  }

  let changed = false;

  const migratedItems = items.map((item, index) => {
    if (item.allocation?.lengths?.length || item.allocation?.lots?.length) {
      return item; // already allocated
    }

    const qty = Number(item.qty);
    if (!qty || qty <= 0) return item;

    changed = true;

    const lengthId = `MIG-LEN-${String(index + 1).padStart(3, "0")}`;

    console.log(
      `➕ Adding allocation → BCN=${item.bcn || item.description}, Qty=${qty}`
    );

    return {
      ...item,
      allocation: {
        lengths: [
          {
            lengthId,
            stockItemId: item.bcn || item.description || "UNKNOWN",
            allocatedQty: qty,
          },
        ],
      },
    };
  });

  if (!changed) {
    console.log("No allocation changes required.");
    return;
  }

  if (CONFIG.dryRun) {
    console.log("🟡 DRY RUN — no data written");
    return;
  }

  await orderRef.update({
    "sections.NORMAL.items": migratedItems,
    updatedAt: new Date().toISOString(),
  });

  console.log("✅ Allocation migration complete for order", CONFIG.ORDER_ID);
};

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
