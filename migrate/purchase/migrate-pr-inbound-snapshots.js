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
  writeReport: process.env.MIGRATE_WRITE_REPORT !== "false",
  limit: Number(process.env.MIGRATE_LIMIT || 0),
  scanPageSize: Number(process.env.MIGRATE_SCAN_PAGE_SIZE || 500),
  batchSize: 380,
};

const REPORT_PATH = path.join(__dirname, "purchase-inbound-snapshot-report.json");

const toText = (value) => String(value ?? "").trim();
const normalizeKey = (value) => toText(value).toLowerCase().replace(/\s+/g, " ");

const normalizeUnit = (value, fallback = "Mtr") => {
  const normalized = toText(value).toLowerCase();
  if (["pcs", "pc", "piece", "pieces"].includes(normalized)) return "Pcs";
  if (["mtr", "mt", "m", "meter", "meters", "metre", "metres"].includes(normalized)) return "Mtr";
  return fallback;
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
    if (value instanceof Date) return value;
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const next = stripUndefinedDeep(nested);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return value;
};

const deepEqual = (a, b) =>
  JSON.stringify(stripUndefinedDeep(a)) === JSON.stringify(stripUndefinedDeep(b));

const sortStockDetails = (items) =>
  [...items].sort((a, b) => normalizeKey(a?.bcn).localeCompare(normalizeKey(b?.bcn)));

const ensureStockDetailShape = (detail, fallback = {}, request = {}) => {
  const bcn = toText(detail?.bcn || fallback?.bcn);
  if (!bcn) return null;

  const qty = toText(detail?.qty ?? fallback?.qty ?? "0") || "0";

  const unit = normalizeUnit(
    detail?.unit || fallback?.unit,
    fallback?.unit || "Mtr"
  );

  const vendorName = toText(detail?.vendorName ?? fallback?.vendorName);

  const supplierCollectionCode = toText(
    detail?.supplierCollectionCode ?? fallback?.supplierCollectionCode
  );

  const supplierCollectionName = toText(
    detail?.supplierCollectionName ?? fallback?.supplierCollectionName
  );

  const itemCode = toText(detail?.itemCode || fallback?.itemCode || bcn) || bcn;

  const expectedDeliveryDate = toText(
    detail?.expectedDeliveryDate || fallback?.expectedDeliveryDate
  );

  /* ---------- Fix: safely read milestone docket ---------- */

  const milestoneDocket = (request?.poMilestones || []).find(
    (m) =>
      m?.stepId === 2 &&
      (m?.itemName === detail?.fabricName ||
        m?.itemName === detail?.bcn ||
        m?.itemName === fallback?.fabricName ||
        m?.itemName === fallback?.bcn)
  )?.docketNo;

  const docketNo = toText(
    detail?.docketNo ||
      detail?.docketNumber ||
      fallback?.docketNo ||
      fallback?.docketNumber ||
      milestoneDocket
  );

  return stripUndefinedDeep({
    bcn,
    qty,
    unit,
    vendorName: vendorName || "",
    supplierCollectionCode: supplierCollectionCode || "",
    supplierCollectionName: supplierCollectionName || "",
    itemCode,
    expectedDeliveryDate: expectedDeliveryDate || undefined,
    docketNo: docketNo || undefined,
  });
};

const mergeStockDetail = (base, incoming) =>
  ensureStockDetailShape(
    {
      ...base,
      ...incoming,
      expectedDeliveryDate:
        toText(incoming?.expectedDeliveryDate) || toText(base?.expectedDeliveryDate) || undefined,
      docketNo: toText(incoming?.docketNo) || toText(base?.docketNo) || undefined,
    },
    base || incoming || {}
  );

const stockCache = new Map();
const getStockByBcn = async (bcn) => {
  const key = normalizeKey(bcn);
  if (!key) return null;
  if (stockCache.has(key)) return stockCache.get(key);

  const snap = await db.collection("stocks").where("bcn", "==", toText(bcn)).limit(1).get();
  const stock = snap.empty ? null : { id: snap.docs[0].id, ...(snap.docs[0].data() || {}) };
  stockCache.set(key, stock);
  return stock;
};

const orderCache = new Map();
const getOrderForDealId = async (dealId) => {
  const key = toText(dealId);
  if (!key) return null;
  if (orderCache.has(key)) return orderCache.get(key);

  const directDoc = await db.collection("orders").doc(key).get();
  if (directDoc.exists) {
    const result = { id: directDoc.id, ...(directDoc.data() || {}) };
    orderCache.set(key, result);
    return result;
  }

  const byCrmOrderNo = await db
    .collection("orders")
    .where("crmOrderNo", "==", key)
    .limit(1)
    .get();
  if (!byCrmOrderNo.empty) {
    const doc = byCrmOrderNo.docs[0];
    const result = { id: doc.id, ...(doc.data() || {}) };
    orderCache.set(key, result);
    return result;
  }

  const byDealId = await db
    .collection("orders")
    .where("dealId", "==", key)
    .limit(1)
    .get();
  if (!byDealId.empty) {
    const doc = byDealId.docs[0];
    const result = { id: doc.id, ...(doc.data() || {}) };
    orderCache.set(key, result);
    return result;
  }

  orderCache.set(key, null);
  return null;
};

const buildSnapshots = ({ request, inbound, order }) => {
  const customerSnapshot = stripUndefinedDeep({
    name:
      order?.customerSnapshot?.name ||
      request?.customerSnapshot?.name ||
      request?.customerName ||
      inbound?.customerName ||
      undefined,
    phone:
      order?.customerSnapshot?.phone ||
      order?.customerPhone ||
      request?.customerSnapshot?.phone ||
      undefined,
    email: request?.customerSnapshot?.email || request?.email || undefined,
    address:
      order?.customerAddress || request?.customerSnapshot?.address || inbound?.customerSnapshot?.address || undefined,
    customerId: order?.customerId || request?.customerSnapshot?.customerId || undefined,
  });

  const dealSnapshot = stripUndefinedDeep({
    dealId:
      request?.dealSnapshot?.dealId ||
      request?.dealId ||
      inbound?.dealSnapshot?.dealId ||
      inbound?.dealId ||
      order?.dealId ||
      undefined,
    quotationNo: request?.dealSnapshot?.quotationNo || request?.quotationNo || order?.quotationNo || undefined,
    orderId: request?.dealSnapshot?.orderId || order?.id || undefined,
    crmOrderNo:
      request?.dealSnapshot?.crmOrderNo || order?.crmOrderNo || request?.dealId || inbound?.dealId || undefined,
  });

  const orderSnapshot = stripUndefinedDeep({
    id: request?.orderSnapshot?.id || order?.id || undefined,
    crmOrderNo:
      request?.orderSnapshot?.crmOrderNo || order?.crmOrderNo || request?.dealId || inbound?.dealId || undefined,
    orderNo: request?.orderSnapshot?.orderNo || order?.orderNo || order?.orderId || undefined,
    orderType: request?.orderSnapshot?.orderType || order?.orderType || undefined,
    status: request?.orderSnapshot?.status || order?.status || undefined,
    createdAt: request?.orderSnapshot?.createdAt || order?.createdAt || undefined,
    totalAmount:
      request?.orderSnapshot?.totalAmount !== undefined
        ? request.orderSnapshot.totalAmount
        : order?.totalAmount,
  });

  const assignedSalesman = stripUndefinedDeep({
    id: request?.assignedSalesman?.id || order?.representativeId || undefined,
    name:
      request?.assignedSalesman?.name ||
      order?.salesPerson ||
      request?.salesman ||
      inbound?.assignedSalesman?.name ||
      undefined,
  });

  return {
    customerSnapshot,
    dealSnapshot,
    orderSnapshot,
    assignedSalesman,
  };
};

const buildLineStockDetail = async ({ line, request, inbound, fallbackUnit }) => {
  const bcn = toText(line?.fabricName || line?.furnitureName || line?.itemName || line?.bcn);
  if (!bcn) return null;

  const stock = await getStockByBcn(bcn);
  const qty = toText(line?.quantity ?? line?.qty ?? line?.neededQty ?? "0") || "0";
  const unit = normalizeUnit(line?.unit || stock?.unit, fallbackUnit);
  const vendorName = toText(
    line?.vendorName || request?.vendor || inbound?.vendor || stock?.supplierCompanyName || stock?.vendorName
  );
  const supplierCollectionCode = toText(line?.supplierCollectionCode || stock?.supplierCollectionCode);
  const supplierCollectionName = toText(line?.supplierCollectionName || stock?.supplierCollectionName);
  const itemCode = toText(line?.itemCode || line?.itemName || stock?.itemName || bcn) || bcn;
  const expectedDeliveryDate = toText(line?.expectedDeliveryDate || request?.promiseDeliveryDate);
  const docketNo = toText(line?.docketNo || line?.docketNumber);

  return ensureStockDetailShape({
    bcn,
    qty,
    unit,
    vendorName: vendorName || "",
    supplierCollectionCode: supplierCollectionCode || "",
    supplierCollectionName: supplierCollectionName || "",
    itemCode,
    expectedDeliveryDate: expectedDeliveryDate || undefined,
    docketNo: docketNo || undefined,
  });
};

const pickBestRequestForInbound = (linkedRequests = []) => {
  if (!linkedRequests.length) return null;
  return (
    linkedRequests.find(
      (req) =>
        (req.customerSnapshot && Object.keys(req.customerSnapshot).length > 0) ||
        (req.dealSnapshot && Object.keys(req.dealSnapshot).length > 0) ||
        (req.orderSnapshot && Object.keys(req.orderSnapshot).length > 0)
    ) || linkedRequests[0]
  );
};

const loadCollectionDocs = async (collectionName, limit = 0, pageSize = 500) => {
  const docs = [];
  let cursorId = null;

  while (true) {
    const remaining = limit > 0 ? limit - docs.length : pageSize;
    if (limit > 0 && remaining <= 0) break;

    const chunkSize = Math.max(1, Math.min(pageSize, remaining > 0 ? remaining : pageSize));
    let ref = db
      .collection(collectionName)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(chunkSize);

    if (cursorId) {
      ref = ref.startAfter(cursorId);
    }

    const snap = await ref.get();
    if (snap.empty) break;

    docs.push(...snap.docs);
    cursorId = snap.docs[snap.docs.length - 1].id;

    if (snap.docs.length < chunkSize) break;
  }

  return docs;
};

const run = async () => {
  const report = {
    startedAt: new Date().toISOString(),
    dryRun: CONFIG.dryRun,
    limit: CONFIG.limit || null,
    purchaseRequests: { scanned: 0, updated: 0, unchanged: 0, failed: 0 },
    inbounds: { scanned: 0, updated: 0, unchanged: 0, failed: 0 },
    write: { operations: 0, commits: 0 },
    warnings: [],
  };

  const nowIso = new Date().toISOString();

  let batch = db.batch();
  let batchOps = 0;
  const queueSet = async (ref, payload) => {
    if (CONFIG.dryRun) return;
    batch.set(ref, payload, { merge: true });
    batchOps += 1;
    report.write.operations += 1;
    if (batchOps >= CONFIG.batchSize) {
      await batch.commit();
      report.write.commits += 1;
      batch = db.batch();
      batchOps = 0;
    }
  };
  const flushWrites = async () => {
    if (CONFIG.dryRun || batchOps === 0) return;
    await batch.commit();
    report.write.commits += 1;
    batch = db.batch();
    batchOps = 0;
  };

  const prDocs = await loadCollectionDocs(
    "purchaseRequests",
    CONFIG.limit,
    CONFIG.scanPageSize
  );
  console.log(`PurchaseRequests processing: ${prDocs.length}`);
  console.log(`Dry run: ${CONFIG.dryRun}`);

  const requestById = new Map();
  const poAggregate = new Map(); // poNumber -> { requestIds:Set<string>, detailByBcn: Map<string, detail> }

  for (const prDoc of prDocs) {
    report.purchaseRequests.scanned += 1;

    try {
      const request = { id: prDoc.id, ...(prDoc.data() || {}) };
      const fallbackUnit = request?.type === "furniture" ? "Pcs" : "Mtr";
      const fabricDetails = Array.isArray(request?.fabricDetails) ? request.fabricDetails : [];
      const furnitureDetails = Array.isArray(request?.furnitureDetails) ? request.furnitureDetails : [];

      const allLineDetails = [];

      const nextFabricDetails = [];
      for (const line of fabricDetails) {
        const detail = await buildLineStockDetail({ line, request, fallbackUnit });
        if (detail) allLineDetails.push(detail);

        const nextLine = { ...(line || {}) };
        if (detail) {
          if (!toText(nextLine.unit)) nextLine.unit = detail.unit;
          if (!toText(nextLine.itemCode)) nextLine.itemCode = detail.itemCode;
          if (!toText(nextLine.vendorName)) nextLine.vendorName = detail.vendorName;
          if (!toText(nextLine.supplierCollectionCode))
            nextLine.supplierCollectionCode = detail.supplierCollectionCode;
          if (!toText(nextLine.supplierCollectionName))
            nextLine.supplierCollectionName = detail.supplierCollectionName;
          if (!toText(nextLine.expectedDeliveryDate) && toText(detail.expectedDeliveryDate)) {
            nextLine.expectedDeliveryDate = detail.expectedDeliveryDate;
          }
          if (!toText(nextLine.docketNo) && toText(detail.docketNo)) {
            nextLine.docketNo = detail.docketNo;
          }
        }

        const poNumber = toText(nextLine.poNumber);
        if (poNumber && detail) {
          if (!poAggregate.has(poNumber)) {
            poAggregate.set(poNumber, { requestIds: new Set(), detailByBcn: new Map() });
          }
          const agg = poAggregate.get(poNumber);
          agg.requestIds.add(prDoc.id);
          const key = normalizeKey(detail.bcn);
          const current = agg.detailByBcn.get(key);
          agg.detailByBcn.set(key, current ? mergeStockDetail(current, detail) : detail);
        }

        nextFabricDetails.push(nextLine);
      }

      const nextFurnitureDetails = [];
      for (const line of furnitureDetails) {
        const detail = await buildLineStockDetail({
          line: { ...line, furnitureName: line?.furnitureName || line?.itemName },
          request: { ...request, type: "furniture" },
          fallbackUnit: "Pcs",
        });
        if (detail) allLineDetails.push(detail);

        const nextLine = { ...(line || {}) };
        if (detail) {
          if (!toText(nextLine.unit)) nextLine.unit = detail.unit;
          if (!toText(nextLine.itemCode)) nextLine.itemCode = detail.itemCode;
          if (!toText(nextLine.vendorName)) nextLine.vendorName = detail.vendorName;
          if (!toText(nextLine.supplierCollectionCode))
            nextLine.supplierCollectionCode = detail.supplierCollectionCode;
          if (!toText(nextLine.supplierCollectionName))
            nextLine.supplierCollectionName = detail.supplierCollectionName;
          if (!toText(nextLine.expectedDeliveryDate) && toText(detail.expectedDeliveryDate)) {
            nextLine.expectedDeliveryDate = detail.expectedDeliveryDate;
          }
          if (!toText(nextLine.docketNo) && toText(detail.docketNo)) {
            nextLine.docketNo = detail.docketNo;
          }
        }

        const poNumber = toText(nextLine.poNumber);
        if (poNumber && detail) {
          if (!poAggregate.has(poNumber)) {
            poAggregate.set(poNumber, { requestIds: new Set(), detailByBcn: new Map() });
          }
          const agg = poAggregate.get(poNumber);
          agg.requestIds.add(prDoc.id);
          const key = normalizeKey(detail.bcn);
          const current = agg.detailByBcn.get(key);
          agg.detailByBcn.set(key, current ? mergeStockDetail(current, detail) : detail);
        }

        nextFurnitureDetails.push(nextLine);
      }

      const detailMap = new Map();
      for (const detail of allLineDetails) {
        const key = normalizeKey(detail?.bcn);
        if (!key) continue;
        detailMap.set(key, detailMap.has(key) ? mergeStockDetail(detailMap.get(key), detail) : detail);
      }
      const stockDetails = sortStockDetails(Array.from(detailMap.values()).filter(Boolean));

      const linkedOrder = await getOrderForDealId(request.dealId);
      const snapshots = buildSnapshots({ request, order: linkedOrder });

      const fabricChanged = !deepEqual(fabricDetails, nextFabricDetails);
      const furnitureChanged = !deepEqual(furnitureDetails, nextFurnitureDetails);
      const stockChanged = !deepEqual(request.stockDetails || [], stockDetails);
      const customerChanged = !deepEqual(request.customerSnapshot || {}, snapshots.customerSnapshot || {});
      const dealChanged = !deepEqual(request.dealSnapshot || {}, snapshots.dealSnapshot || {});
      const orderChanged = !deepEqual(request.orderSnapshot || {}, snapshots.orderSnapshot || {});
      const assignedChanged = !deepEqual(request.assignedSalesman || {}, snapshots.assignedSalesman || {});

      const shouldUpdate =
        fabricChanged ||
        furnitureChanged ||
        stockChanged ||
        customerChanged ||
        dealChanged ||
        orderChanged ||
        assignedChanged;

      if (shouldUpdate) {
        const payload = stripUndefinedDeep({
          ...(fabricChanged ? { fabricDetails: nextFabricDetails } : {}),
          ...(furnitureChanged ? { furnitureDetails: nextFurnitureDetails } : {}),
          stockDetails,
          customerSnapshot: snapshots.customerSnapshot,
          dealSnapshot: snapshots.dealSnapshot,
          orderSnapshot: snapshots.orderSnapshot,
          assignedSalesman: snapshots.assignedSalesman,
          updatedAt: nowIso,
        });
        await queueSet(prDoc.ref, payload);
        report.purchaseRequests.updated += 1;
      } else {
        report.purchaseRequests.unchanged += 1;
      }

      requestById.set(prDoc.id, {
        ...request,
        ...(fabricChanged ? { fabricDetails: nextFabricDetails } : {}),
        ...(furnitureChanged ? { furnitureDetails: nextFurnitureDetails } : {}),
        stockDetails,
        customerSnapshot: snapshots.customerSnapshot,
        dealSnapshot: snapshots.dealSnapshot,
        orderSnapshot: snapshots.orderSnapshot,
        assignedSalesman: snapshots.assignedSalesman,
      });
    } catch (error) {
      report.purchaseRequests.failed += 1;
      report.warnings.push({
        type: "purchaseRequest_failed",
        id: prDoc.id,
        error: String(error?.message || error),
      });
      console.error("Failed purchaseRequest migration:", prDoc.id, error);
    }
  }

  const inboundDocs = await loadCollectionDocs("inbounds", CONFIG.limit, CONFIG.scanPageSize);
  console.log(`Inbounds processing: ${inboundDocs.length}`);

  for (const inboundDoc of inboundDocs) {
    report.inbounds.scanned += 1;

    try {
      const inbound = { id: inboundDoc.id, ...(inboundDoc.data() || {}) };
      const poNumber = inboundDoc.id;

      const linkedIds = new Set();
      const existingPrId = toText(inbound.purchaseRequestId);
      if (existingPrId) linkedIds.add(existingPrId);
      if (Array.isArray(inbound.purchaseRequestIds)) {
        inbound.purchaseRequestIds.forEach((id) => {
          const cleanId = toText(id);
          if (cleanId) linkedIds.add(cleanId);
        });
      }
      const poInfo = poAggregate.get(poNumber);
      if (poInfo) {
        poInfo.requestIds.forEach((id) => linkedIds.add(id));
      }

      const linkedRequests = [...linkedIds]
        .map((id) => requestById.get(id))
        .filter(Boolean);
      const primaryRequest = pickBestRequestForInbound(linkedRequests);

      const detailByBcn = new Map();
      const existingStockDetails = Array.isArray(inbound.stockDetails) ? inbound.stockDetails : [];
      for (const detail of existingStockDetails) {
        const shaped = ensureStockDetailShape(detail);
        if (!shaped) continue;
        detailByBcn.set(normalizeKey(shaped.bcn), shaped);
      }
      if (poInfo && poInfo.detailByBcn) {
        for (const [key, detail] of poInfo.detailByBcn.entries()) {
          const current = detailByBcn.get(key);
          detailByBcn.set(key, current ? mergeStockDetail(current, detail) : detail);
        }
      }
      for (const req of linkedRequests) {
        const reqDetails = Array.isArray(req.stockDetails) ? req.stockDetails : [];
        for (const detail of reqDetails) {
          const shaped = ensureStockDetailShape(detail);
          if (!shaped) continue;
          const key = normalizeKey(shaped.bcn);
          const current = detailByBcn.get(key);
          detailByBcn.set(key, current ? mergeStockDetail(current, shaped) : shaped);
        }
      }

      const inboundItems = Array.isArray(inbound.items) ? inbound.items : [];
      const fallbackUnit = primaryRequest?.type === "furniture" ? "Pcs" : "Mtr";
      const nextItems = [];

      for (const item of inboundItems) {
        const bcn = toText(item?.itemName || item?.stockDetail?.bcn);
        const key = normalizeKey(bcn);

        let detail = key ? detailByBcn.get(key) : null;
        if (!detail && bcn) {
          detail = await buildLineStockDetail({
            line: {
              bcn,
              itemName: item?.itemName,
              quantity: item?.quantity,
              unit: item?.unit,
              vendorName: item?.vendorName,
              supplierCollectionCode: item?.supplierCollectionCode,
              supplierCollectionName: item?.supplierCollectionName,
              expectedDeliveryDate: item?.expectedDeliveryDate,
              docketNo: item?.docketNo || item?.docketNumber,
            },
            request: primaryRequest || undefined,
            inbound,
            fallbackUnit,
          });
          if (detail && key) detailByBcn.set(key, detail);
        }

        const currentItemDetail = ensureStockDetailShape(
          {
            bcn: bcn || detail?.bcn,
            qty: item?.quantity || detail?.qty,
            unit: item?.unit || detail?.unit,
            vendorName: item?.vendorName || detail?.vendorName || inbound?.vendor || "",
            supplierCollectionCode: item?.supplierCollectionCode || detail?.supplierCollectionCode || "",
            supplierCollectionName: item?.supplierCollectionName || detail?.supplierCollectionName || "",
            itemCode: item?.itemCode || detail?.itemCode || bcn || "",
            expectedDeliveryDate: item?.expectedDeliveryDate || detail?.expectedDeliveryDate,
            docketNo: item?.docketNo || item?.docketNumber || detail?.docketNo,
          },
          detail || {}
        );

        if (currentItemDetail && key) detailByBcn.set(key, currentItemDetail);

        nextItems.push(
          stripUndefinedDeep({
            ...item,
            itemName: bcn || item?.itemName,
            itemCode: item?.itemCode || currentItemDetail?.itemCode || bcn || undefined,
            quantity: toText(item?.quantity || currentItemDetail?.qty || "0") || "0",
            unit: normalizeUnit(item?.unit || currentItemDetail?.unit, fallbackUnit),
            vendorName: item?.vendorName || currentItemDetail?.vendorName || inbound?.vendor || "",
            supplierCollectionCode:
              item?.supplierCollectionCode || currentItemDetail?.supplierCollectionCode || "",
            supplierCollectionName:
              item?.supplierCollectionName || currentItemDetail?.supplierCollectionName || "",
            expectedDeliveryDate:
              item?.expectedDeliveryDate || currentItemDetail?.expectedDeliveryDate || undefined,
            docketNo:
              item?.docketNo || item?.docketNumber || currentItemDetail?.docketNo || undefined,
            stockDetail: currentItemDetail || undefined,
          })
        );
      }

      const nextStockDetails = sortStockDetails(
        Array.from(detailByBcn.values())
          .map((detail) => ensureStockDetailShape(detail))
          .filter(Boolean)
      );

      const dealIdForOrder = toText(inbound.dealId || primaryRequest?.dealId);
      const linkedOrder = await getOrderForDealId(dealIdForOrder);
      const snapshots = buildSnapshots({
        request: primaryRequest || undefined,
        inbound,
        order: linkedOrder,
      });

      const linkedIdsList = [...linkedIds].filter(Boolean);
      const purchaseRequestId = toText(inbound.purchaseRequestId || linkedIdsList[0]);
      const resolvedDealId =
        toText(inbound.dealId) ||
        toText(primaryRequest?.dealId) ||
        toText(snapshots?.dealSnapshot?.dealId) ||
        undefined;
      const resolvedCustomerName =
        toText(inbound.customerName) ||
        toText(primaryRequest?.customerName) ||
        toText(snapshots?.customerSnapshot?.name) ||
        undefined;

      const itemsChanged = !deepEqual(inbound.items || [], nextItems);
      const stockChanged = !deepEqual(inbound.stockDetails || [], nextStockDetails);
      const customerChanged = !deepEqual(inbound.customerSnapshot || {}, snapshots.customerSnapshot || {});
      const dealChanged = !deepEqual(inbound.dealSnapshot || {}, snapshots.dealSnapshot || {});
      const orderChanged = !deepEqual(inbound.orderSnapshot || {}, snapshots.orderSnapshot || {});
      const assignedChanged = !deepEqual(inbound.assignedSalesman || {}, snapshots.assignedSalesman || {});
      const prIdChanged = !deepEqual(inbound.purchaseRequestId || "", purchaseRequestId || "");
      const prIdsChanged = !deepEqual(
        Array.isArray(inbound.purchaseRequestIds) ? inbound.purchaseRequestIds : [],
        linkedIdsList
      );
      const dealIdChanged = !deepEqual(inbound.dealId || "", resolvedDealId || "");
      const customerNameChanged = !deepEqual(inbound.customerName || "", resolvedCustomerName || "");

      const shouldUpdate =
        itemsChanged ||
        stockChanged ||
        customerChanged ||
        dealChanged ||
        orderChanged ||
        assignedChanged ||
        prIdChanged ||
        prIdsChanged ||
        dealIdChanged ||
        customerNameChanged;

      if (shouldUpdate) {
        const payload = stripUndefinedDeep({
          purchaseRequestId: purchaseRequestId || undefined,
          purchaseRequestIds: linkedIdsList.length ? linkedIdsList : undefined,
          dealId: resolvedDealId,
          customerName: resolvedCustomerName,
          items: nextItems,
          stockDetails: nextStockDetails,
          customerSnapshot: snapshots.customerSnapshot,
          dealSnapshot: snapshots.dealSnapshot,
          orderSnapshot: snapshots.orderSnapshot,
          assignedSalesman: snapshots.assignedSalesman,
          updatedAt: nowIso,
        });
        await queueSet(inboundDoc.ref, payload);
        report.inbounds.updated += 1;
      } else {
        report.inbounds.unchanged += 1;
      }
    } catch (error) {
      report.inbounds.failed += 1;
      report.warnings.push({
        type: "inbound_failed",
        id: inboundDoc.id,
        error: String(error?.message || error),
      });
      console.error("Failed inbound migration:", inboundDoc.id, error);
    }
  }

  await flushWrites();

  report.finishedAt = new Date().toISOString();
  if (CONFIG.writeReport) {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`Migration report written to ${REPORT_PATH}`);
  }

  console.log("Migration completed.");
  console.log(JSON.stringify(report, null, 2));
};

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
