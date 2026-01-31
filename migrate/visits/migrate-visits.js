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
  writeIdMap: true,
};

const OUTPUT_MAP_PATH = path.join(__dirname, "visit-id-map.json");

const stripUndefined = (value) =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );

const normalizeVisitType = (value) => {
  if (!value) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "measurement") return "MEASUREMENT";
  if (normalized === "sales") return "SALES";
  if (normalized === "follow_up" || normalized === "follow up" || normalized === "follow-up") {
    return "FOLLOW_UP";
  }
  return String(value).toUpperCase().replace(/\s+/g, "_");
};

const deriveVisitPurpose = (value) => {
  const normalized = normalizeVisitType(value);
  if (normalized) return normalized;
  return value ? String(value).trim() : "VISIT";
};

const buildVisitNo = (existing, createdAt) => {
  if (existing) return existing;
  const date = createdAt ? new Date(createdAt) : new Date();
  const year = date.getFullYear();
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `VIS-${year}-${seq}`;
};

const getDateOnly = (value) => {
  if (!value) return undefined;
  const [datePart] = String(value).split("T");
  return datePart || undefined;
};

const resolveUser = async (userId) => {
  if (!userId) return undefined;
  try {
    const snap = await db.collection("users").doc(userId).get();
    if (!snap.exists) return { id: userId };
    const data = snap.data() || {};
    return stripUndefined({
      id: userId,
      name: data.name,
      role: data.role ? String(data.role).toUpperCase() : undefined,
    });
  } catch (error) {
    console.warn("Failed to resolve user:", userId, error);
    return { id: userId };
  }
};

const buildVisitPayload = async ({
  visitData,
  visitId,
  customerId,
  dealDocId,
  customer,
  deal,
}) => {
  const createdAt = visitData?.createdAt || new Date().toISOString();
  const updatedAt = visitData?.updatedAt || createdAt;

  const visitNo = buildVisitNo(visitData?.visitNo, createdAt);
  const visitType =
    visitData?.visitType ||
    normalizeVisitType(visitData?.typeOfVisit) ||
    visitData?.typeOfVisit;

  const representativeId =
    visitData?.representative ||
    deal?.assignedSalesPerson?.id ||
    deal?.representativeId;

  const assignedSalesPerson =
    deal?.assignedSalesPerson && (deal.assignedSalesPerson.id || deal.assignedSalesPerson.name)
      ? deal.assignedSalesPerson
      : await resolveUser(representativeId);

  const assignee = await resolveUser(visitData?.assignedTo);
  const slotDate = visitData?.slotDate || getDateOnly(visitData?.dueDate);
  const assignmentSlot = stripUndefined({
    date: slotDate,
    timeFrom: visitData?.slotStart,
    timeTo: visitData?.slotEnd,
  });
  const assignment = stripUndefined({
    assignedTo: assignee,
    assignedAt: visitData?.assignedAt,
    slot: Object.keys(assignmentSlot).length > 0 ? assignmentSlot : undefined,
  });

  const location = stripUndefined({
    address:
      visitData?.customerAddress ||
      customer?.billingAddress?.line1 ||
      customer?.addressPinCode ||
      customer?.address ||
      undefined,
    latitude: visitData?.geofenceLat,
    longitude: visitData?.geofenceLng,
  });

  const customerSnapshot = stripUndefined({
    id: customerId,
    name: customer?.name || "",
    phone: customer?.phone || customer?.mobileNo || "",
    address:
      customer?.billingAddress?.line1 ||
      customer?.addressPinCode ||
      customer?.address ||
      "",
    customerType: customer?.customerType,
  });

  const dealSnapshot = stripUndefined({
    dealCode: deal?.dealCode,
    title: deal?.title || deal?.dealName || "",
  });

  const purpose = visitData?.purpose || deriveVisitPurpose(visitType || visitData?.typeOfVisit);

  const newFields = stripUndefined({
    visitId,
    visitNo,
    customerId,
    dealId: deal?.dealId || visitData?.dealId || dealDocId,
    customerSnapshot: Object.keys(customerSnapshot).length ? customerSnapshot : undefined,
    dealSnapshot: Object.keys(dealSnapshot).length ? dealSnapshot : undefined,
    assignedSalesPerson:
      assignedSalesPerson && Object.keys(assignedSalesPerson).length ? assignedSalesPerson : undefined,
    visitType,
    purpose,
    assignment: Object.keys(assignment).length ? assignment : undefined,
    location: Object.keys(location).length ? location : undefined,
    updates: Array.isArray(visitData?.updates)
      ? visitData.updates
      : [
          stripUndefined({
            updatedAt: createdAt,
            updatedBy: representativeId ? { id: representativeId } : undefined,
            action: "CREATED",
            message: "Migrated visit record.",
          }),
        ],
    updatedAt,
  });

  const cleanedVisitData = stripUndefined(visitData || {});
  return stripUndefined({ ...cleanedVisitData, ...newFields });
};

const run = async () => {
  const customersSnap = await db.collection("customers").get();
  const idMap = [];

  console.log(`Found ${customersSnap.size} customers.`);
  console.log(`Dry run: ${CONFIG.dryRun}`);

  for (const customerSnap of customersSnap.docs) {
    const customerId = customerSnap.id;
    const customerData = customerSnap.data() || {};
    const dealsSnap = await customerSnap.ref.collection("deals").get();

    if (dealsSnap.empty) continue;

    for (const dealSnap of dealsSnap.docs) {
      const dealData = dealSnap.data() || {};
      const visitsSnap = await dealSnap.ref.collection("visits").get();

      if (visitsSnap.empty) continue;

      for (const visitSnap of visitsSnap.docs) {
        const visitData = visitSnap.data() || {};
        const visitId = visitSnap.id;

        const payload = await buildVisitPayload({
          visitData,
          visitId,
          customerId,
          dealDocId: dealSnap.id,
          customer: customerData,
          deal: dealData,
        });

        idMap.push({
          customerId,
          dealDocId: dealSnap.id,
          visitId,
          visitNo: payload.visitNo || null,
        });

        console.log(`Visit ${visitId} (customer ${customerId}, deal ${dealSnap.id})`);

        if (CONFIG.dryRun) continue;
        await visitSnap.ref.set(payload, { merge: false });
      }
    }
  }

  if (CONFIG.writeIdMap) {
    fs.writeFileSync(OUTPUT_MAP_PATH, JSON.stringify(idMap, null, 2));
    console.log(`ID map written to ${OUTPUT_MAP_PATH}`);
  }

  console.log("Visit migration complete.");
};

run().catch((error) => {
  console.error("Visit migration failed:", error);
  process.exit(1);
});
