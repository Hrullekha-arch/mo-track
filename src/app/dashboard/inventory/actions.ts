
'use server';

import { adminDb } from '@/lib/firebase-admin';
import {
  getStockSubcategories,
  resolveStockCategory,
  resolveStockCategoryGroup,
} from '@/lib/stock-category-rules';
import { Stock, StockTransaction, CuttingTask, CuttingTaskItem } from '@/lib/types';
import { normalizePurchaseEntryStatus } from '@/lib/purchase-entry';
import * as XLSX from "xlsx";
import {FieldValue } from 'firebase-admin/firestore';

const BATCH_SIZE = 499; // Firestore batch limit is 500 operations
const SUPPLIER_COMPANIES_COLLECTION = "supplierCompanies";
const normalizeBcn = (value: string) =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const extractBcnDigits = (value: string) =>
  String(value ?? "").replace(/\D/g, "");
const sanitizeBcnDocId = (value: string) =>
  String(value ?? "").trim().replace(/\//g, "-");
const stripUndefined = <T extends Record<string, any>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  ) as T;
const cleanSupplierCompanyName = (value: any) => {
  const normalizedWhitespace = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalizedWhitespace || undefined;
};
const normalizeSupplierCompanyName = (value: string) =>
  cleanSupplierCompanyName(value)?.toLowerCase() || "";
const supplierCompanyDocId = (value: string) =>
  normalizeSupplierCompanyName(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "supplier";
const trimToUndefined = (value: unknown) => {
  const normalizedWhitespace = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalizedWhitespace || undefined;
};
const parseFiniteNumber = (value: unknown, fallback?: number) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const buildSearchTokens = (value: string) => {
  const source = String(value ?? "").toLowerCase();
  const words = source
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  const compact = source.replace(/[^a-z0-9]/g, "");
  const mergedWord = words.join("");
  const set = new Set<string>(words);
  if (compact.length >= 2) set.add(compact);
  if (mergedWord.length >= 2) set.add(mergedWord);
  return Array.from(set);
};
const buildVasStockBcn = (name: string) => {
  const core = String(name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  return `VAS-${core || "SERVICE"}`;
};
const isTruthyServiceFlag = (value: unknown) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "1";
};
const isVasStockRecord = (data: Record<string, any> | Stock) => {
  const category = String((data as any)?.category ?? "").trim().toUpperCase();
  const type = String((data as any)?.type ?? "").trim().toUpperCase();
  return (
    category === "VAS" ||
    type === "VAS" ||
    Boolean((data as any)?.isService) ||
    isTruthyServiceFlag((data as any)?.serviceable) ||
    isTruthyServiceFlag((data as any)?.servicable)
  );
};

type VasStockUpsertInput = {
  vasName: string;
  bcn?: string;
  rate?: number | string;
  gstPercent?: number | string;
  hsnOrSac?: string | null;
  hsnCode?: string | null;
  unit?: string;
  serviceable?: boolean;
  servicable?: boolean;
  isActive?: boolean;
};

const buildSupplierCompanyPayload = (value: string, nowIso: string) => ({
  name: value,
  normalizedName: normalizeSupplierCompanyName(value),
  updatedAt: nowIso,
  lastUsedAt: nowIso,
  source: "inventory",
});

const setSupplierCompanyInBatch = (
  batch: FirebaseFirestore.WriteBatch,
  companyName: string,
  nowIso: string
) => {
  const cleanedName = cleanSupplierCompanyName(companyName);
  if (!cleanedName) return false;
  const supplierRef = adminDb
    .collection(SUPPLIER_COMPANIES_COLLECTION)
    .doc(supplierCompanyDocId(cleanedName));
  batch.set(supplierRef, buildSupplierCompanyPayload(cleanedName, nowIso), { merge: true });
  return true;
};

async function upsertSupplierCompanies(companyNames: Iterable<string | undefined>) {
  let batch = adminDb.batch();
  let opCount = 0;
  const nowIso = new Date().toISOString();
  const seenDocIds = new Set<string>();

  for (const rawName of companyNames) {
    const cleanedName = cleanSupplierCompanyName(rawName);
    if (!cleanedName) continue;
    const docId = supplierCompanyDocId(cleanedName);
    if (seenDocIds.has(docId)) continue;
    seenDocIds.add(docId);

    const supplierRef = adminDb.collection(SUPPLIER_COMPANIES_COLLECTION).doc(docId);
    batch.set(supplierRef, buildSupplierCompanyPayload(cleanedName, nowIso), { merge: true });
    opCount++;

    if (opCount >= BATCH_SIZE) {
      await batch.commit();
      batch = adminDb.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }
}

export async function getStockById(id: string): Promise<Stock | null> {
    try {
        const docRef = adminDb.collection("stocks").doc(id);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            const stockData = { id: docSnap.id, ...docSnap.data() };
            return JSON.parse(JSON.stringify(stockData)) as Stock;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching stock by ID ${id}:`, error);
        return null;
    }
}

export async function getStockFieldOptions(
  field: "supplierCompanyName" | "type" | "unit" | "category" | "categoryGroup",
  query: string = ""
): Promise<string[]> {
  try {
    const snapshot = await adminDb.collection("stocks").select(field).get();
    const values = new Set<string>();

    snapshot.forEach((doc) => {
      const value = String(doc.get(field) ?? "").trim();
      if (value) values.add(value);
    });

    let list = Array.from(values);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((value) => value.toLowerCase().includes(q));
    }

    list.sort((a, b) => a.localeCompare(b));
    return JSON.parse(JSON.stringify(list.slice(0, 50)));
  } catch (error) {
    console.error(`Error fetching stock field options (${field}):`, error);
    return [];
  }
}

export async function getSupplierCompanyOptionsAction(query: string = ""): Promise<string[]> {
  try {
    const snapshot = await adminDb
      .collection(SUPPLIER_COMPANIES_COLLECTION)
      .select("name")
      .get();

    const values = new Set<string>();
    snapshot.forEach((doc) => {
      const value = cleanSupplierCompanyName(doc.get("name"));
      if (value) values.add(value);
    });

    let list = Array.from(values);
    if (list.length === 0) {
      list = await getStockFieldOptions("supplierCompanyName");
      if (list.length > 0) {
        await upsertSupplierCompanies(list);
      }
    }

    if (query) {
      const q = query.toLowerCase();
      list = list.filter((value) => value.toLowerCase().includes(q));
    }

    list.sort((a, b) => a.localeCompare(b));
    return JSON.parse(JSON.stringify(list.slice(0, 100)));
  } catch (error) {
    console.error("Error fetching supplier company options:", error);
    return getStockFieldOptions("supplierCompanyName", query);
  }
}

export async function createStockItemAction(payload: {
  bcn: string;
  itemName?: string;
  name?: string;
  itemNameTokens?: string[];
  closingstock?: number;
  totalQty?: number;
  availableQty?: number;
  reservedQty?: number;
  damagedQty?: number;
  cutQty?: number;
  maxlevel?: number;
  category?: string;
  categoryGroup?: string;
  isService?: boolean;
  unit?: string;
  type?: string;
  width?: number;
  moCollection?: string;
  moCollectionCode?: string;
  supplierCompanyName?: string;
  supplierCollectionName?: string;
  supplierCollectionCode?: string;
  composition?: string;
  martindale?: number;
  weightGsm?: number;
  horizontalRepeatCms?: number;
  verticalRepeatCms?: number;
  costPriceRs?: number;
  costMultiplierRs?: number;
  rrpWithGstRs?: number;
  hsnOrSac?: string | null;
  gstPercent?: number;
  rack?: string | null;
  productId?: string | null;
}): Promise<{ success: boolean; message: string; stock?: Stock }> {
  try {
    console.log("Creating stock item with payload:", payload);
    const rawBcn = String(payload?.bcn ?? "").trim();
    const itemName = String(payload?.name ?? payload?.itemName ?? "").trim();

    if (!rawBcn) {
      return { success: false, message: "BCN is required." };
    }
    if (!itemName) {
      return { success: false, message: "Item name is required." };
    }

    const docId = sanitizeBcnDocId(rawBcn);
    const stockRef = adminDb.collection("stocks").doc(docId);

    const existingDoc = await stockRef.get();
    if (existingDoc.exists) {
      return { success: false, message: `Stock BCN already exists (${docId}).` };
    }

    const duplicateSnap = await adminDb
      .collection("stocks")
      .where("bcn", "==", rawBcn)
      .limit(1)
      .get();

    if (!duplicateSnap.empty) {
      return { success: false, message: "Stock BCN already exists." };
    }

    const toNumber = (value: any) => {
      if (value === undefined || value === null || value === "") return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const cleanString = (value: any) => {
      const trimmed = String(value ?? "").trim();
      return trimmed ? trimmed : undefined;
    };
    const itemNameTokens = payload.itemNameTokens;
    const supplierCompanyName = cleanSupplierCompanyName(payload.supplierCompanyName);
    const supplierCollectionName = cleanString(payload.supplierCollectionName);
    const supplierCollectionCode = cleanString(payload.supplierCollectionCode);

    if (!supplierCompanyName) {
      return { success: false, message: "Supplier company is required." };
    }
    if (!supplierCollectionName) {
      return { success: false, message: "Supplier collection name is required." };
    }
    if (!supplierCollectionCode) {
      return { success: false, message: "Supplier collection code is required." };
    }

    const closingstock = toNumber(payload.closingstock) ?? 0;
    const maxlevel = toNumber(payload.maxlevel);
    const width = toNumber(payload.width);
    const martindale = toNumber(payload.martindale);
    const weightGsm = toNumber(payload.weightGsm);
    const horizontalRepeatCms = toNumber(payload.horizontalRepeatCms);
    const verticalRepeatCms = toNumber(payload.verticalRepeatCms);
    const costPriceRs = toNumber(payload.costPriceRs);
    const costMultiplierRs = toNumber(payload.costMultiplierRs);
    const rrpWithGstRs = toNumber(payload.rrpWithGstRs);
    const gstPercent = toNumber(payload.gstPercent);

    if (closingstock < 0) {
      return { success: false, message: "Opening stock cannot be negative." };
    }
    if (maxlevel != null && maxlevel < 0) {
      return { success: false, message: "Max level cannot be negative." };
    }
    if (costPriceRs == null) {
      return { success: false, message: "Cost price is required." };
    }
    if (costMultiplierRs == null) {
      return { success: false, message: "Cost multiplier is required." };
    }
    if (rrpWithGstRs == null) {
      return { success: false, message: "RRP with GST is required." };
    }
    if (costPriceRs < 0 || costMultiplierRs < 0 || rrpWithGstRs < 0) {
      return { success: false, message: "Cost values cannot be negative." };
    }

    const now = new Date().toISOString();
    const bcnDigits = extractBcnDigits(rawBcn);

    const resolvedUnit = (cleanString(payload.unit) || "MTR").toUpperCase();
    const resolvedCategory = resolveStockCategory(cleanString(payload.category) || "FABRIC");
    if (!resolvedCategory) {
      return { success: false, message: "Invalid category. Please select a valid stock category." };
    }
    const resolvedCategoryGroup =
      resolveStockCategoryGroup(payload.categoryGroup, resolvedCategory) ||
      (getStockSubcategories(resolvedCategory)[0] || undefined);
    const isService = payload.isService ?? resolvedCategory === "VAS";
    const totalQty = toNumber(payload.totalQty) ?? closingstock;
    const availableQty = toNumber(payload.availableQty) ?? closingstock;
    const reservedQty = toNumber(payload.reservedQty) ?? 0;
    const damagedQty = toNumber(payload.damagedQty) ?? 0;
    const cutQty = toNumber(payload.cutQty) ?? 0;

    const stockDoc: Record<string, any> = {
      itemId: docId,
      productId: cleanString(payload.productId),
      bcn: rawBcn,
      bcnDigits,
      name: itemName,
      itemNameTokens,
      itemName,
      category: resolvedCategory,
      categoryGroup: resolvedCategoryGroup,
      isService,
      unit: resolvedUnit,
      type: cleanString(payload.type) || "fabric",
      totalQty,
      availableQty,
      reservedQty,
      damagedQty,
      cutQty,
      closingstock: totalQty,
      quantity: totalQty,
      supplierCompanyName,
      supplierCollectionName,
      supplierCollectionCode,
      costPriceRs,
      costMultiplierRs,
      rrpWithGstRs,
      hsnOrSac: cleanString(payload.hsnOrSac),
      hsnCode: cleanString(payload.hsnOrSac),
      gstPercent,
      isActive: true,
      lastUpdatedAt: now,
      updatedAt: now,
      createdAt: now,
      nextLengthNo: totalQty > 0 ? 2 : 1,
    };

    const assignIfDefined = (key: string, value: any) => {
      if (value !== undefined && value !== "") {
        stockDoc[key] = value;
      }
    };

    assignIfDefined("maxlevel", maxlevel);
    assignIfDefined("category", resolvedCategory);
    assignIfDefined("categoryGroup", cleanString(payload.categoryGroup));
    assignIfDefined("width", width);
    assignIfDefined("moCollection", cleanString(payload.moCollection));
    assignIfDefined("moCollectionCode", cleanString(payload.moCollectionCode));
    assignIfDefined("supplierCompanyName", supplierCompanyName);
    assignIfDefined("supplierCollectionName", supplierCollectionName);
    assignIfDefined("supplierCollectionCode", supplierCollectionCode);
    assignIfDefined("composition", cleanString(payload.composition));
    assignIfDefined("martindale", martindale);
    assignIfDefined("weightGsm", weightGsm);
    assignIfDefined("horizontalRepeatCms", horizontalRepeatCms);
    assignIfDefined("verticalRepeatCms", verticalRepeatCms);
    assignIfDefined("costPriceRs", costPriceRs);
    assignIfDefined("costMultiplierRs", costMultiplierRs);
    assignIfDefined("rrpWithGstRs", rrpWithGstRs);
    assignIfDefined("hsnOrSac", cleanString(payload.hsnOrSac));
    assignIfDefined("hsnCode", cleanString(payload.hsnOrSac));
    assignIfDefined("gstPercent", gstPercent);
    assignIfDefined("rack", cleanString(payload.rack));
    assignIfDefined("productId", cleanString(payload.productId));

    const lengthNo = totalQty > 0 ? 1 : null;
    const lengthId = lengthNo ? `${docId}_${lengthNo}` : null;
    const lengthRef = lengthId ? stockRef.collection("lengths").doc(lengthId) : null;

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(stockRef);
      if (snap.exists) {
        throw new Error("Stock BCN already exists.");
      }

      tx.set(stockRef, stockDoc, { merge: true });

      if (supplierCompanyName) {
        const supplierRef = adminDb
          .collection(SUPPLIER_COMPANIES_COLLECTION)
          .doc(supplierCompanyDocId(supplierCompanyName));
        tx.set(supplierRef, buildSupplierCompanyPayload(supplierCompanyName, now), { merge: true });
      }

      if (lengthRef && lengthNo) {
        const lengthDoc = {
          id: lengthRef.id,
          lengthId: lengthRef.id,
          lengthNo,
          batchNo: "",
          warehouseId: "",
          originalLength: totalQty,
          availableLength: availableQty,
          unit: resolvedUnit,
          rack: cleanString(payload.rack),
          status: "AVAILABLE",
          reservation: null,
          cutHistory: [],
          receivedAt: now,
          lastUpdatedAt: now,
          // legacy mirrors for compatibility
          bcn: rawBcn,
          bcnDigits,
          itemName,
          quantity: totalQty,
          availableQty,
          reservedQty,
          cutQty,
          poNumber: "",
        };
        tx.set(lengthRef, lengthDoc);
      }
    });

    return {
      success: true,
      message: "Stock item created successfully.",
      stock: { id: stockRef.id, ...stockDoc } as Stock,
    };
  } catch (error: any) {
    console.error("Error creating stock item:", error);
    return {
      success: false,
      message: error?.message || "Failed to create stock item.",
    };
  }
}

export async function importStockData(
  base64Data: string
): Promise<{ success: boolean; message: string; count?: number }> {
  try {
    const fileBuffer = Buffer.from(base64Data, "base64");
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (!json || json.length < 2) {
      return { success: false, message: "The Excel sheet is empty or invalid." };
    }

    // ✅ Normalize headers: lowercase + remove spaces + remove special chars like () etc.
    const norm = (v: any) =>
      String(v ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[()]/g, "")
        .replace(/[^a-z0-9 ]/g, "") // remove symbols like /, -, etc (keeps spaces)
        .trim();

    const rawHeaders = (json[0] as any[]).map((h) => String(h ?? ""));
    const headers = rawHeaders.map(norm);

    // ✅ Find header index by candidates (so small header changes won't break import)
    const idx = (candidates: string[]) => {
      const normalizedCandidates = candidates.map(norm);
      for (const c of normalizedCandidates) {
        const i = headers.indexOf(c);
        if (i !== -1) return i;
      }
      return -1;
    };

    // ✅ Required headers (core)
    const required = [
      { key: "bcn", candidates: ["bcn"] },
      { key: "itemName", candidates: ["itemname", "item name", "name"] },
      {
        key: "qty",
        candidates: [
          "closing stock",
          "closingstock",
          "qty",
          "quantity",
          "opening stock",
          "openingstock",
          "total qty",
          "totalqty",
        ],
      },
    ];

    const missing = required
      .filter((r) => idx(r.candidates) === -1)
      .map((r) => r.key);

    if (missing.length > 0) {
      return {
        success: false,
        message: `Missing required columns: ${missing.join(", ")}`,
      };
    }

    // ✅ Column indexes
    const COL = {
      id: idx(["id"]),
      productId: idx(["product id", "productid", "item code", "itemcode"]),
      bcn: idx(["bcn"]),
      itemName: idx(["itemName", "item name", "name"]),
      categoryGroup: idx(["category group", "categorygroup"]),
      category: idx(["category"]),
      unit: idx(["unit"]),
      type: idx(["type"]),
      isService: idx(["is service", "isservice", "service item", "service"]),
      width: idx(["width"]),
      rack: idx(["rack"]),
      moCollection: idx(["mo collection", "mocollection"]),
      moCollectionCode: idx(["mo collection code", "mocollectioncode"]),
      maxlevel: idx(["maxlevel", "max level"]),
      closingStock: idx([
        "closing stock",
        "closingstock",
        "qty",
        "quantity",
        "opening stock",
        "openingstock",
        "total qty",
        "totalqty",
      ]),
      availableQty: idx(["available qty", "availableqty"]),
      reservedQty: idx(["reserved qty", "reservedqty"]),
      damagedQty: idx(["damaged qty", "damagedqty"]),
      cutQty: idx(["cut qty", "cutqty"]),
      supplierCompanyName: idx(["supplier company name", "suppliercompanyname"]),
      supplierCollectionName: idx(["supplier collection name", "suppliercollectionname"]),
      supplierCollectionCode: idx(["supplier collection code", "suppliercollectioncode"]),
      composition: idx(["composition"]),
      martindale: idx(["martindale"]),
      weightGsm: idx(["weigthgsm", "weightgsm", "weigth gsm", "weight gsm"]), // you wrote "weigth(gsm)"
      horizontalRepeat: idx(["horizontal repeat cms", "horizontal repeat", "horizontal repeat cms "]),
      verticalRepeat: idx(["vertical repeat cms", "vertical repeat"]),
      costPrice: idx(["cost price rs", "cost price"]),
      costMultiplier: idx(["cost multiplier rs", "cost multiplier"]),
      rrpWithGst: idx(["rrp with gst rs", "rrp with gst"]),
      hsnOrSac: idx(["hsn", "hsn sac", "hsn/sac", "hsn sac code", "hsn code", "sac"]),
      gstPercent: idx(["gst", "gst percent", "gst %", "gstpercentage"]),
    };

    // ✅ Helpers for safe value parsing
    const s = (row: any[], i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");
    const n = (row: any[], i: number, def = 0) => {
      if (i < 0) return def;
      const val = row[i];
      const num = Number(String(val ?? "").replace(/,/g, "").trim());
      return Number.isFinite(num) ? num : def;
    };
    const nOpt = (row: any[], i: number) => {
      if (i < 0) return undefined;
      const raw = row[i];
      if (raw === undefined || raw === null || String(raw).trim() === "") return undefined;
      const num = Number(String(raw).replace(/,/g, "").trim());
      return Number.isFinite(num) ? num : undefined;
    };

    const allItems = (json.slice(1) as any[])
      .map((row) => {
        const rawBcn = s(row, COL.bcn);
        const bcn = rawBcn;
        if (!bcn) return null;
        const docId = sanitizeBcnDocId(rawBcn);

        const closingStock = n(row, COL.closingStock, 0);
        const availableQty = nOpt(row, COL.availableQty) ?? closingStock;
        const reservedQty = nOpt(row, COL.reservedQty) ?? 0;
        const cutQty = nOpt(row, COL.cutQty) ?? 0;
        const damagedQty = nOpt(row, COL.damagedQty) ?? 0;
        const resolvedCategory = (s(row, COL.category) || "FABRIC").toUpperCase();
        const resolvedUnit = (s(row, COL.unit) || "MTR").toUpperCase();
        const resolvedIsService =
          s(row, COL.isService).toLowerCase() === "true" ||
          s(row, COL.isService).toLowerCase() === "yes" ||
          resolvedCategory === "VAS";

        const itemNameTokens = buildSearchTokens(s(row, COL.itemName));

        const stockItem = {
          // keep sheet id if present (stable), else will be auto id later
          _sheetId: s(row, COL.id),
          productId: s(row, COL.productId) || s(row, COL.id),

          docId,
          bcn,
          name: s(row, COL.itemName),
          itemName: s(row, COL.itemName),
          itemNameTokens,

          categoryGroup: s(row, COL.categoryGroup),
          category: resolvedCategory,
          isService: resolvedIsService,

          unit: resolvedUnit,
          type: (s(row, COL.type) || "fabric").toLowerCase(),

          width: nOpt(row, COL.width),
          rack: s(row, COL.rack),

          moCollection: s(row, COL.moCollection),
          moCollectionCode: s(row, COL.moCollectionCode),

          maxlevel: nOpt(row, COL.maxlevel),

          totalQty: closingStock,
          availableQty,
          reservedQty,
          cutQty,
          damagedQty,

          supplierCompanyName: s(row, COL.supplierCompanyName),
          supplierCollectionName: s(row, COL.supplierCollectionName),
          supplierCollectionCode: s(row, COL.supplierCollectionCode),

          composition: s(row, COL.composition),
          martindale: nOpt(row, COL.martindale),
          weightGsm: nOpt(row, COL.weightGsm),

          horizontalRepeatCms: nOpt(row, COL.horizontalRepeat),
          verticalRepeatCms: nOpt(row, COL.verticalRepeat),
          
          costPriceRs: nOpt(row, COL.costPrice),
          costMultiplierRs: nOpt(row, COL.costMultiplier),
          rrpWithGstRs: nOpt(row, COL.rrpWithGst),
          hsnOrSac: s(row, COL.hsnOrSac),
          gstPercent: nOpt(row, COL.gstPercent),

          lastUpdatedAt: new Date().toISOString(),
        };
        console.log(`stock Details extracted from Excel:`, stockItem);
        return stockItem;
      })
      .filter(Boolean) as any[];

      

    if (allItems.length === 0) {
      return { success: false, message: "No valid rows found (BCN missing)." };
    }

    const MAX_ROWS_PER_BATCH = 200; // 200 rows = 400 writes (safe)
    let batch = adminDb.batch();
    let batchRowCount = 0;
    let totalImported = 0;
    const masterTotals = new Map<string, { totalQty: number; availableQty: number; reservedQty: number; cutQty: number; damagedQty: number }>();
    const lengthCountByBcn = new Map<string, number>();
    const writtenMasters = new Set<string>();
    const lengthNoByBcn = new Map<string, number>();

      allItems.forEach((item) => {
        const key = item.docId || item.bcn;
        const current = masterTotals.get(key) || {
          totalQty: 0,
          availableQty: 0,
          reservedQty: 0,
          cutQty: 0,
          damagedQty: 0,
        };
        masterTotals.set(key, {
          totalQty: current.totalQty + (Number(item.totalQty) || 0),
          availableQty: current.availableQty + (Number(item.availableQty) || 0),
          reservedQty: current.reservedQty + (Number(item.reservedQty) || 0),
          cutQty: current.cutQty + (Number(item.cutQty) || 0),
          damagedQty: current.damagedQty + (Number(item.damagedQty) || 0),
        });
        lengthCountByBcn.set(key, (lengthCountByBcn.get(key) || 0) + 1);
      });

      for (const item of allItems) {
      const docId = item.docId || item.bcn;
      const bcnDocRef = adminDb.collection("stocks").doc(docId);
      const bcnDigits = extractBcnDigits(item.bcn);
      const totals = masterTotals.get(docId) || {
        totalQty: Number(item.totalQty) || 0,
        availableQty: Number(item.availableQty) || 0,
        reservedQty: Number(item.reservedQty) || 0,
        cutQty: Number(item.cutQty) || 0,
        damagedQty: Number(item.damagedQty) || 0,
      };

      // Parent doc
      if (!writtenMasters.has(docId)) {
        const now = new Date().toISOString();
        batch.set(
            bcnDocRef,
            stripUndefined({
            itemId: docId,
            productId: item.productId || undefined,
            bcn: item.bcn,
            bcnDigits,
            name: item.name || item.itemName,
            itemName: item.itemName,
            itemNameTokens: item.itemNameTokens,
            categoryGroup: item.categoryGroup,
            category: item.category,
            isService: item.isService,
            unit: item.unit,
            type: item.type,
            width: item.width,
            rack: item.rack || undefined,
            moCollection: item.moCollection,
            moCollectionCode: item.moCollectionCode,
            supplierCompanyName: item.supplierCompanyName,
            supplierCollectionName: item.supplierCollectionName,
            supplierCollectionCode: item.supplierCollectionCode,
            composition: item.composition,
            martindale: item.martindale,
            weightGsm: item.weightGsm,
            horizontalRepeatCms: item.horizontalRepeatCms,
            verticalRepeatCms: item.verticalRepeatCms,
            costPriceRs: item.costPriceRs,
            costMultiplierRs: item.costMultiplierRs,
            rrpWithGstRs: item.rrpWithGstRs,
            hsnOrSac: item.hsnOrSac || undefined,
            hsnCode: item.hsnOrSac || undefined,
            gstPercent: item.gstPercent || undefined,
            maxlevel: item.maxlevel,
            totalQty: totals.totalQty,
            availableQty: totals.availableQty,
            reservedQty: totals.reservedQty,
            damagedQty: totals.damagedQty,
            cutQty: totals.cutQty,
            closingstock: totals.totalQty,
            quantity: totals.totalQty,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            lastUpdatedAt: now,
            nextLengthNo: totals.totalQty > 0 ? (lengthCountByBcn.get(docId) || 0) + 1 : 1,
            }),
            { merge: true }
        );
        console.log(batch);
        writtenMasters.add(docId);
      }

      // Length sub-doc
      const lengthsCol = bcnDocRef.collection("lengths");
      const currentLengthNo = (lengthNoByBcn.get(docId) || 0) + 1;
      lengthNoByBcn.set(docId, currentLengthNo);
      const lengthId = `${docId}_${currentLengthNo}`;
      const lengthDocRef = lengthsCol.doc(lengthId);

      const { _sheetId, ...payload } = item;

      batch.set(lengthDocRef, stripUndefined({
          id: lengthDocRef.id,
          lengthId: lengthDocRef.id,
          lengthNo: currentLengthNo,
          batchNo: "",
          warehouseId: "",
          originalLength: payload.totalQty,
          availableLength: payload.availableQty,
          unit: payload.unit,
          rack: payload.rack || "",
          status: "AVAILABLE",
          reservation: null,
          cutHistory: [],
          receivedAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
          // legacy mirrors
          ...payload,
          quantity: payload.totalQty,
          bcnDigits,
          bcn: payload.bcn,
          itemId: docId,
      }));

    batchRowCount++;
    totalImported++;

    // 🔥 Commit batch safely
    if (batchRowCount >= MAX_ROWS_PER_BATCH) {
        console.log(`✅ Committing batch of ${batchRowCount} rows...`);
        await batch.commit();

        // reset
        batch = adminDb.batch();
        batchRowCount = 0;
    }
    }

    // 🔚 Commit remaining rows
    if (batchRowCount > 0) {
    console.log(`✅ Committing final batch of ${batchRowCount} rows...`);
    await batch.commit();
    }


    await upsertSupplierCompanies(
      allItems.map((item) => cleanSupplierCompanyName(item?.supplierCompanyName))
    );

    return { success: true, message: "Import successful!", count: totalImported };
  } catch (error: any) {
    console.error("Error in importStockData server action:", error);
    return {
      success: false,
      message: `Server-side import failed: ${error.message}`,
    };
  }
}


export async function searchStockByBcn(query: string): Promise<Stock[]> {
  const trimmed = String(query ?? "").trim();
  if (!trimmed || trimmed.length < 2) return [];

  try {
    const stockRef = adminDb.collection("stocks");

    const normalizedQuery = normalizeBcn(trimmed);
    const digitQuery = extractBcnDigits(trimmed);

    const hasLetters = /[a-zA-Z]/.test(trimmed);
    const hasNumbers = /\d/.test(trimmed);

    const resultsMap = new Map<string, Stock>();

    const addDocs = (docs: any[]) => {
      docs.forEach((doc) => {
        if (!resultsMap.has(doc.id)) {
          resultsMap.set(doc.id, {
            id: doc.id,
            ...doc.data(),
          } as Stock);
        }
      });
    };

    console.log(
      `Search: "${trimmed}" | Letters: ${hasLetters} | Numbers: ${hasNumbers}`
    );

    // 🔥 CASE 1: Alphabet → Search itemNameTokens FIRST
    if (hasLetters) {
      const tokenQuery = trimmed
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .trim();

      if (tokenQuery.length >= 2) {
        const nameSnap = await stockRef
          .where("itemNameTokens", "array-contains", tokenQuery)
          .limit(20)
          .get();

        addDocs(nameSnap.docs);

        // If we already have results, return immediately
        if (resultsMap.size >= 50) {
          return Array.from(resultsMap.values()).slice(0, 30);
        }
      }
    }

    // 🔥 CASE 2: Numbers → Search BCN FIRST
    if (hasNumbers) {
      console.log("didgit qureey",digitQuery);
      if (digitQuery.length >= 2) {
        const digitsSnap = await stockRef
          .where("bcnDigits", ">=", digitQuery)
          .where("bcnDigits", "<=", digitQuery + "\uf8ff")
          .limit(30)
          .get();

        addDocs(digitsSnap.docs);

        console.log("snap",JSON.stringify(digitsSnap.docs), "length", digitsSnap.docs.length);

        if (resultsMap.size >= 20) {
          return Array.from(resultsMap.values()).slice(0, 30);
        }
      }
    }

    // 🔥 Fallback: BCN Prefix search
    const bcnSnap = await stockRef
      .where("bcn", ">=", trimmed)
      .where("bcn", "<=", trimmed + "\uf8ff")
      .limit(30)
      .get();

    addDocs(bcnSnap.docs);

    return Array.from(resultsMap.values()).slice(0, 30);

  } catch (error) {
    console.error("Error searching stock:", error);
    return [];
  }
}

export async function searchVasStockServicesAction(query: string): Promise<Stock[]> {
  const trimmed = String(query ?? "").trim();
  if (!trimmed || trimmed.length < 2) return [];

  try {
    const loweredQuery = trimmed.toLowerCase();
    const normalizedQuery = normalizeBcn(trimmed);
    const fromGenericSearch = (await searchStockByBcn(trimmed)).filter((stock) =>
      isVasStockRecord(stock)
    );
    if (fromGenericSearch.length > 0) {
      return fromGenericSearch.slice(0, 30);
    }

    const stockCollection = adminDb.collection("stocks");
    const directVasSnap = await stockCollection.where("category", "==", "VAS").limit(400).get();
    const directVasResults = directVasSnap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() } as Stock))
      .filter((stock: Stock) => {
        if (!isVasStockRecord(stock)) return false;
        const name = String(stock.itemName || stock.name || "").toLowerCase();
        const bcn = String(stock.bcn || "").toUpperCase();
        return name.includes(loweredQuery) || bcn.includes(normalizedQuery);
      });
    if (directVasResults.length > 0) {
      return directVasResults.slice(0, 30);
    }

    const serviceSnap = await stockCollection.where("isService", "==", true).limit(400).get();
    const serviceResults = serviceSnap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() } as Stock))
      .filter((stock: Stock) => {
        if (!isVasStockRecord(stock)) return false;
        const name = String(stock.itemName || stock.name || "").toLowerCase();
        const bcn = String(stock.bcn || "").toUpperCase();
        return name.includes(loweredQuery) || bcn.includes(normalizedQuery);
      });
    if (serviceResults.length > 0) {
      return serviceResults.slice(0, 30);
    }

    const tokenQuery = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (tokenQuery.length < 2) return [];

    const tokenSnap = await adminDb
      .collection("stocks")
      .where("itemNameTokens", "array-contains", tokenQuery)
      .limit(60)
      .get();

    const fallback = tokenSnap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() } as Stock))
      .filter((stock: Stock) => isVasStockRecord(stock));

    return fallback.slice(0, 30);
  } catch (error) {
    console.error("Error searching VAS stock services:", error);
    return [];
  }
}

export async function upsertVasStockItemsAction(
  entries: VasStockUpsertInput[]
): Promise<{ success: boolean; message: string; count: number; skipped: number }> {
  try {
    const rows = Array.isArray(entries) ? entries : [];
    if (!rows.length) {
      return { success: true, message: "No VAS rows to sync.", count: 0, skipped: 0 };
    }

    const now = new Date().toISOString();
    const seenDocIds = new Set<string>();
    let batch = adminDb.batch();
    let opCount = 0;
    let count = 0;
    let skipped = 0;

    for (const row of rows) {
      const vasName = trimToUndefined(row?.vasName);
      if (!vasName) {
        skipped++;
        continue;
      }

      const proposedBcn = trimToUndefined(row?.bcn) || buildVasStockBcn(vasName);
      const docId = sanitizeBcnDocId(proposedBcn);
      if (!docId || seenDocIds.has(docId)) {
        skipped++;
        continue;
      }
      seenDocIds.add(docId);

      const rate = Math.max(0, parseFiniteNumber(row?.rate, 0) ?? 0);
      const gstPercent = Math.max(0, parseFiniteNumber(row?.gstPercent, 0) ?? 0);
      const hsnOrSac = trimToUndefined(row?.hsnOrSac) || trimToUndefined(row?.hsnCode);
      const unit = String(trimToUndefined(row?.unit) || "PCS").toUpperCase();

      const payload = stripUndefined({
        itemId: docId,
        productId: docId,
        bcn: proposedBcn,
        bcnDigits: extractBcnDigits(proposedBcn),
        name: vasName,
        itemName: vasName,
        itemNameTokens: buildSearchTokens(vasName),
        category: "VAS",
        categoryGroup: "SERVICE",
        type: "vas",
        isService: true,
        serviceable: row?.serviceable ?? true,
        servicable: row?.servicable ?? true,
        unit,
        totalQty: 0,
        availableQty: 0,
        reservedQty: 0,
        damagedQty: 0,
        cutQty: 0,
        closingstock: 0,
        quantity: 0,
        maxlevel: 0,
        supplierCompanyName: "VAS SERVICES",
        supplierCollectionName: "VAS",
        supplierCollectionCode: "VAS",
        costPriceRs: 0,
        costMultiplierRs: 1,
        rrpWithGstRs: rate,
        mrp: rate,
        rlPrice: rate,
        clPrice: rate,
        hsnOrSac,
        hsnCode: hsnOrSac,
        gstPercent,
        tax: gstPercent,
        isActive: row?.isActive ?? true,
        createdAt: now,
        updatedAt: now,
        lastUpdatedAt: now,
      });

      const stockRef = adminDb.collection("stocks").doc(docId);
      batch.set(stockRef, payload, { merge: true });
      opCount++;
      count++;

      if (opCount >= BATCH_SIZE) {
        await batch.commit();
        batch = adminDb.batch();
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    return {
      success: true,
      message: `Synced ${count} VAS stock item(s).`,
      count,
      skipped,
    };
  } catch (error: any) {
    console.error("Error syncing VAS stock items:", error);
    return {
      success: false,
      message: error?.message || "Failed to sync VAS stock items.",
      count: 0,
      skipped: 0,
    };
  }
}


//=======================single stock search
export async function getStockDetailsForPendingItem(bcnOrId: string) {
  const key = String(bcnOrId ?? "").trim();
  if (!key) return null;

  // 1) First try: docId direct (fast, 1 read)
  const byId = await adminDb.collection("stocks").doc(key).get();
  if (byId.exists) {
    return { id: byId.id, ...byId.data() } as Stock;
  }

  // 2) Second try: exact BCN match (fast query)
  const exact = await adminDb.collection("stocks").where("bcn", "==", key).limit(1).get();
  if (!exact.empty) {
    const doc = exact.docs[0];
    return { id: doc.id, ...doc.data() } as Stock;
  }

  // 3) Third try: reuse your existing search (limited + safe)
  const results = await searchStockByBcn(key);
  if (!results.length) return null;

  // Prefer exact match if present
  const exactFromSearch =
    results.find((s) => String(s.bcn || "").trim().toLowerCase() === key.toLowerCase()) || results[0];

  return exactFromSearch;
}


export async function searchStockById(productId: string): Promise<Stock[]> {
    const trimmed = String(productId ?? "").trim();
    if (!trimmed) {
        return [];
    }

    try {
        const stockRef = adminDb.collection('stocks');
        const resultsMap = new Map<string, Stock>();

        const addDocs = (docs: any[]) => {
            docs.forEach(doc => {
                resultsMap.set(doc.id, { id: doc.id, ...doc.data() } as Stock);
            });
        };

        const productIdSnap = await stockRef
            .where('productId', '==', trimmed)
            .limit(10)
            .get();
        addDocs(productIdSnap.docs);

        if (resultsMap.size === 0) {
            const numericId = Number(trimmed);
            if (Number.isFinite(numericId)) {
                const numericSnap = await stockRef
                    .where('productId', '==', numericId)
                    .limit(10)
                    .get();
                addDocs(numericSnap.docs);
            }
        }

        return JSON.parse(JSON.stringify(Array.from(resultsMap.values())));
    } catch (error) {
        console.error("Error searching stock by productId:", error);
        return [];
    }
}


export async function updateStockQuantityAction(
  stockId: string, 
  transaction: Omit<StockTransaction, 'id'>
): Promise<{
  success: boolean;
  message: string;
  newStock?: Stock;
  createdLength?: { id: string; quantity: number; purchaseEntryStatus: "Pending" | "Done" };
}> {
  const stockRef = adminDb.collection('stocks').doc(stockId);
  
  if (transaction.type === 'addition') {
    let finalStockData: Stock;
    let createdLength:
      | { id: string; quantity: number; purchaseEntryStatus: "Pending" | "Done" }
      | undefined;
    const bcnDigits = extractBcnDigits(transaction.bcn || stockId);
    
    try {
      await adminDb.runTransaction(async (tx) => {
          const stockDoc = await tx.get(stockRef); // READ FIRST
          const stockData = stockDoc.exists ? (stockDoc.data() as Stock) : null;
          const resolvedUnit = (transaction.unit || stockData?.unit || "MTR").trim().toUpperCase() || "MTR";
          const nextLengthNo = Number(stockData?.nextLengthNo ?? 1);
          const lengthNo = Number.isFinite(nextLengthNo) && nextLengthNo > 0 ? nextLengthNo : 1;
          const lengthId = `${stockId}_${lengthNo}`;
          const newLengthRef = stockRef.collection('lengths').doc(lengthId);
          const source = String((transaction as any).source || "")
            .trim()
            .toUpperCase();
          const isInboundSource = source === "INBOUND_RECEIVE";
          const purchaseEntryStatus = normalizePurchaseEntryStatus(
            (transaction as any).purchaseEntryStatus
          );
          
          const newLengthData: Partial<Stock> & { bcnDigits?: string } = {
              id: newLengthRef.id,
              lengthId: newLengthRef.id,
              lengthNo,
              batchNo: transaction.batchNo || transaction.poNumber || "",
              warehouseId: transaction.warehouseId || "",
              originalLength: transaction.quantityChange,
              availableLength: transaction.quantityChange,
              unit: resolvedUnit,
              rack: transaction.rack || stockData?.rack || "",
              status: "AVAILABLE",
              reservation: null,
              cutHistory: [],
              receivedAt: transaction.createdAt,
              createdAt: transaction.createdAt,
              lastUpdatedAt: transaction.createdAt,
              bcn: transaction.bcn || stockId,
              bcnDigits,
              itemName: stockData?.itemName || transaction.bcn || stockId,
              quantity: transaction.quantityChange,
              availableQty: transaction.quantityChange,
              reservedQty: 0,
              cutQty: 0,
              poNumber: transaction.poNumber,
              salesman: transaction.salesman,
              purchaseEntryStatus,
              purchaseEntryUpdatedAt: transaction.createdAt,
              purchaseEntryId: isInboundSource && transaction.poNumber ? lengthId : undefined,
              purchaseRequestId: (transaction as any).purchaseRequestId,
              inboundId: (transaction as any).inboundId,
              source: isInboundSource ? "INBOUND_RECEIVE" : source || undefined,
          };

          tx.set(
            newLengthRef,
            stripUndefined({ ...newLengthData })
          ); // WRITE

          if (isInboundSource && transaction.poNumber) {
            const entryRef = adminDb.collection("PendingPurchaseEntry").doc(lengthId);
            tx.set(
              entryRef,
              stripUndefined({
                id: lengthId,
                poNumber: transaction.poNumber,
                status: purchaseEntryStatus,
                purchaseEntryStatus,
                stockId,
                lengthId,
                bcn: transaction.bcn || stockId,
                itemName: stockData?.itemName || transaction.bcn || stockId,
                quantity: transaction.quantityChange,
                unit: resolvedUnit,
                dealId: (transaction as any).dealId,
                customerName: transaction.customerName,
                vendorName: (transaction as any).vendorName,
                salesman: transaction.salesman,
                purchaseRequestId: (transaction as any).purchaseRequestId,
                inboundId: (transaction as any).inboundId,
                receivedAt: transaction.createdAt,
                receivedBy: transaction.createdBy,
                source: "INBOUND_RECEIVE",
                createdAt: transaction.createdAt,
                updatedAt: transaction.createdAt,
              }),
              { merge: true }
            );
          }

          createdLength = {
            id: lengthId,
            quantity: transaction.quantityChange,
            purchaseEntryStatus,
          };

          if (!stockDoc.exists) {
              tx.set(stockRef, { // WRITE
                  itemId: stockId,
                  bcn: stockId,
                  bcnDigits,
                  name: transaction.bcn || stockId,
                  itemName: transaction.bcn || stockId,
                  unit: resolvedUnit,
                  totalQty: transaction.quantityChange,
                  availableQty: transaction.quantityChange,
                  reservedQty: 0,
                  damagedQty: 0,
                  cutQty: 0,
                  closingstock: transaction.quantityChange,
                  quantity: transaction.quantityChange,
                  isActive: true,
                  updatedAt: transaction.createdAt,
                  lastUpdatedAt: transaction.createdAt,
                  createdAt: transaction.createdAt,
                  nextLengthNo: lengthNo + 1,
              }, { merge: true });
          } else {
              tx.update(stockRef, { // WRITE
                  bcnDigits,
                  totalQty: FieldValue.increment(transaction.quantityChange),
                  availableQty: FieldValue.increment(transaction.quantityChange),
                  quantity: FieldValue.increment(transaction.quantityChange),
                  closingstock: FieldValue.increment(transaction.quantityChange),
                  nextLengthNo: lengthNo + 1,
                  updatedAt: transaction.createdAt,
                  lastUpdatedAt: transaction.createdAt,
              });
          }
      });
      
      const updatedStockDoc = await stockRef.get();
      finalStockData = { id: updatedStockDoc.id, ...updatedStockDoc.data() } as Stock;
      
      return {
        success: true,
        message: 'Stock added successfully.',
        newStock: JSON.parse(JSON.stringify(finalStockData)),
        createdLength: createdLength ? JSON.parse(JSON.stringify(createdLength)) : undefined,
      };

    } catch (error: any) {
        console.error("Error in stock addition transaction:", error);
        return { success: false, message: `Failed to add stock: ${error.message}` };
    }
  }
  
  // Handling for deductions remains complex and should be managed via allocation/cutting flows.
  return { success: false, message: 'This function only supports additions. Deductions are handled elsewhere.' };
}

export async function revertStockAdditionAction(
  stockId: string, // This is now BCN
  poNumber: string,
  bcn: string,
  revertedBy: string
): Promise<{ success: boolean; message: string; }> {
  try {
    const stockRef = adminDb.collection('stocks').doc(stockId);
    
    // Find the length document by PO number and BCN.
    // This assumes one BCN per PO, which might need adjustment if a PO can have multiple rolls of the same BCN.
    const lengthsQuery = await stockRef.collection('lengths')
      .where('poNumber', '==', poNumber)
      .where('bcn', '==', bcn)
      .limit(1)
      .get();
      
    if (lengthsQuery.empty) {
      throw new Error(`No stock roll found for BCN ${bcn} and PO ${poNumber}.`);
    }

    const lengthDoc = lengthsQuery.docs[0];
    const lengthData = lengthDoc.data() as Stock;
    const lengthId = lengthDoc.id;
    const quantityToRevert = Number(lengthData.originalLength ?? lengthData.quantity ?? 0);

    await adminDb.runTransaction(async (transaction) => {
        // 1. Delete the length document
        transaction.delete(lengthDoc.ref);
        // 1b. Delete the linked pending purchase-entry record if present.
        transaction.delete(adminDb.collection('PendingPurchaseEntry').doc(lengthId));

        // 2. Decrement the main stock document quantities
        transaction.update(stockRef, {
            totalQty: FieldValue.increment(-quantityToRevert),
            availableQty: FieldValue.increment(-quantityToRevert),
            quantity: FieldValue.increment(-quantityToRevert),
            closingstock: FieldValue.increment(-quantityToRevert),
            updatedAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
        });
        
        // (Optional) Log the reversion
        const revertLogRef = stockRef.collection('reversions').doc();
        transaction.set(revertLogRef, {
            revertedLengthId: lengthId,
            revertedQuantity: quantityToRevert,
            revertedBy: revertedBy,
            timestamp: new Date().toISOString()
        });
    });
    
    return { success: true, message: `Successfully reverted stock addition for BCN ${bcn} from PO ${poNumber}.` };
  } catch (error: any) {
    console.error(`Error reverting stock addition for ${stockId}:`, error);
    return { success: false, message: `Failed to revert stock addition: ${error.message}` };
  }
}

export async function getStockTransactions(bcn: string): Promise<StockTransaction[]> {
    try {
        const stockRef = adminDb.collection('stocks').doc(bcn);
        const addedSnapshot = await stockRef.collection('lengths').get();
        
        // Fetch all cutting tasks to find relevant cuts for this BCN
        const cuttingTasksSnapshot = await adminDb.collection('Cutting').where("items", "array-contains", {bcn: bcn}).get();

        const allCuttingItemsForBcn: (CuttingTaskItem & { createdAt: string; orderId: string; salesman: string })[] = [];
        cuttingTasksSnapshot.forEach(doc => {
            const task = doc.data() as CuttingTask;
            task.items.forEach(item => {
                if (item.bcn === bcn) {
                    allCuttingItemsForBcn.push({ 
                        ...item, 
                        createdAt: task.createdAt, 
                        orderId: task.orderId,
                        salesman: task.salesPerson
                    });
                }
            });
        });

        const soldTransactions: StockTransaction[] = allCuttingItemsForBcn.map(cut => ({
            id: `${cut.orderId}-${cut.stockAddedId}-${new Date(cut.createdAt).getTime()}`, // Make key more unique
            stockId: bcn,
            bcn: cut.bcn,
            type: 'deduction',
            quantityChange: -cut.quantityAllocated,
            orderId: cut.orderId,
            createdAt: cut.createdAt,
            createdBy: (cut as any).cutBy || "Cutting Module", // Use the name of the user who cut
            status: cut.status,
            lengthId: cut.stockAddedId,
            salesman: cut.salesman,
        } as StockTransaction));

        const reservationTransactions: StockTransaction[] = [];
        await Promise.all(
            addedSnapshot.docs.map(async (doc) => {
                const reservedSnapshot = await doc.ref.collection('reservedQty').get();
                reservedSnapshot.forEach(reservedDoc => {
                    const data = reservedDoc.data() as any;
                    reservationTransactions.push({
                        id: reservedDoc.id,
                        stockId: bcn,
                        bcn,
                        type: 'reservation',
                        quantityChange: Number(data.reservedQty) || 0,
                        orderId: data.orderId,
                        createdAt: data.timestamp || data.createdAt || new Date().toISOString(),
                        createdBy: data.reservedBy || "System",
                        lengthId: doc.id,
                        customerName: data.customerName,
                        notes: data.notes,
                        unit: data.unit,
                    } as StockTransaction);
                });
            })
        );

        const addedTransactionsPromises = addedSnapshot.docs.map(async (doc) => {
            const data = doc.data();
            const lengthId = doc.id;
            
            // Filter the cutting items to get the history for this specific roll
            const cutHistory: StockTransaction[] = allCuttingItemsForBcn
                .filter(item => item.stockAddedId === lengthId)
                .map(cut => ({
                    id: `${cut.orderId}-${cut.stockAddedId}-${new Date(cut.createdAt).getTime()}`,
                    type: 'deduction',
                    quantityChange: -cut.quantityAllocated,
                    createdAt: cut.createdAt,
                    orderId: cut.orderId,
                    salesman: cut.salesman
                } as StockTransaction))
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            return { 
                ...data,
                id: doc.id,
                stockId: bcn,
                bcn: bcn,
                type: 'addition',
                quantityChange: Number(data.originalLength ?? data.quantity) || 0,
                createdAt: data.receivedAt || data.lastUpdatedAt || new Date().toISOString(),
                salesman: data.salesman || 'N/A',
                createdBy: "Inbound Process", // Or fetch from the original PR
                cutHistory: cutHistory,
            } as StockTransaction;
        });
  
        const addedTransactions = await Promise.all(addedTransactionsPromises);
  
        const allTransactions = [...addedTransactions, ...soldTransactions, ...reservationTransactions];
        allTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
        return JSON.parse(JSON.stringify(allTransactions));
    } catch (error) {
        console.error(`Error fetching transactions for stock ${bcn}:`, error);
        return [];
    }
}


export async function getAvailableStockLengths(bcn: string): Promise<{ success: boolean; message: string; lengths?: { length: number; transactionId: string }[] }> {
    try {
        const lengthsSnapshot = await adminDb.collection('stocks').doc(bcn).collection('lengths').get();
        
        const availableLengths: { length: number; transactionId: string; }[] = [];
        lengthsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const available = Number(data.availableLength ?? data.availableQty ?? 0);
            if (available > 0) {
                 availableLengths.push({ length: available, transactionId: doc.id });
            }
        });

        return { success: true, message: 'Lengths fetched.', lengths: JSON.parse(JSON.stringify(availableLengths.sort((a,b) => a.length - b.length))) };

    } catch (error: any) {
        console.error("Error fetching available stock lengths:", error);
        return { success: false, message: 'Failed to fetch available stock.' };
    }
}

export type StockHistoryCursor = {
  additionLastPath?: string | null;
  deductionLastId?: string | null;
};

export type StockHistoryPageInput = {
  pageSize?: number;
  cursor?: StockHistoryCursor | null;
  typeFilter?: "all" | "addition" | "deduction";
  fromDate?: string | null;
  toDate?: string | null;
};

export type StockHistoryPageResult = {
  items: StockTransaction[];
  cursor: StockHistoryCursor | null;
  hasMore: boolean;
};

const DEFAULT_HISTORY_PAGE_SIZE = 60;
const MAX_HISTORY_PAGE_SIZE = 200;

const toIsoStringSafe = (value: unknown) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
};

const toTimeSafe = (value: unknown) => {
  const date = new Date(String(value || ""));
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
};

const normalizeHistoryTypeFilter = (value?: string) => {
  if (value === "addition" || value === "deduction") return value;
  return "all";
};

export async function getStockTransactionHistoryPage(
  input: StockHistoryPageInput = {}
): Promise<StockHistoryPageResult> {
  try {
    const pageSize = Math.min(
      MAX_HISTORY_PAGE_SIZE,
      Math.max(1, Number(input.pageSize) || DEFAULT_HISTORY_PAGE_SIZE)
    );
    const sourceLimit = Math.max(pageSize, DEFAULT_HISTORY_PAGE_SIZE);
    const typeFilter = normalizeHistoryTypeFilter(input.typeFilter);
    const cursor = input.cursor || {};
    const fromDateIso = toIsoStringSafe(input.fromDate || undefined);
    const toDateIso = toIsoStringSafe(input.toDate || undefined);

    const includeAdditions = typeFilter !== "deduction";
    const includeDeductions = typeFilter !== "addition";

    type GroupRow = {
      source: "addition" | "deduction";
      cursor: string;
      createdAt: string;
      rows: StockTransaction[];
    };

    let additionGroups: GroupRow[] = [];
    let deductionGroups: GroupRow[] = [];
    let additionFetchedCount = 0;
    let deductionFetchedCount = 0;

    if (includeAdditions) {
      let additionsQuery: any = adminDb.collectionGroup("lengths");
      if (fromDateIso) additionsQuery = additionsQuery.where("lastUpdatedAt", ">=", fromDateIso);
      if (toDateIso) additionsQuery = additionsQuery.where("lastUpdatedAt", "<=", toDateIso);
      additionsQuery = additionsQuery.orderBy("lastUpdatedAt", "desc").limit(sourceLimit);

      if (cursor.additionLastPath) {
        const lastAdditionDoc = await adminDb.doc(cursor.additionLastPath).get();
        if (lastAdditionDoc.exists) {
          additionsQuery = additionsQuery.startAfter(lastAdditionDoc);
        }
      }

      const additionsSnapshot = await additionsQuery.get();
      additionFetchedCount = additionsSnapshot.docs.length;

      additionGroups = additionsSnapshot.docs
        .map((docSnap: any) => {
          const data = docSnap.data() || {};
          const parentStockId = docSnap.ref.parent?.parent?.id || String(data?.bcn || "");
          const bcn = String(data?.bcn || parentStockId || "").trim();
          const createdAt =
            toIsoStringSafe(data?.lastUpdatedAt || data?.receivedAt || data?.createdAt) ||
            new Date(0).toISOString();
          const quantityRaw = Number(data?.quantity ?? data?.originalLength ?? data?.availableLength ?? 0);
          const quantity = Number.isFinite(quantityRaw) ? quantityRaw : 0;
          if (!bcn) return null;

          return {
            source: "addition" as const,
            cursor: docSnap.ref.path,
            createdAt,
            rows: [
              {
                id: docSnap.ref.path,
                stockId: parentStockId || bcn,
                lengthId: docSnap.id,
                bcn,
                type: "addition",
                quantityChange: quantity,
                poNumber: data?.poNumber || "",
                createdAt,
                createdBy: data?.salesman || "Inbound Process",
                salesman: data?.salesman || "N/A",
                status: data?.status,
                rack: data?.rack,
                notes: data?.batchNo,
                unit: data?.unit,
              } as StockTransaction,
            ],
          };
        })
        .filter(Boolean) as GroupRow[];
    }

    if (includeDeductions) {
      let deductionsQuery: any = adminDb.collection("Cutting");
      if (fromDateIso) deductionsQuery = deductionsQuery.where("createdAt", ">=", fromDateIso);
      if (toDateIso) deductionsQuery = deductionsQuery.where("createdAt", "<=", toDateIso);
      deductionsQuery = deductionsQuery.orderBy("createdAt", "desc").limit(sourceLimit);

      if (cursor.deductionLastId) {
        const lastDeductionDoc = await adminDb.collection("Cutting").doc(cursor.deductionLastId).get();
        if (lastDeductionDoc.exists) {
          deductionsQuery = deductionsQuery.startAfter(lastDeductionDoc);
        }
      }

      const deductionsSnapshot = await deductionsQuery.get();
      deductionFetchedCount = deductionsSnapshot.docs.length;

      deductionGroups = deductionsSnapshot.docs
        .map((docSnap: any) => {
          const task = (docSnap.data() || {}) as CuttingTask;
          const createdAt = toIsoStringSafe(task?.createdAt) || new Date(0).toISOString();
          const rows: StockTransaction[] = Array.isArray(task?.items)
            ? task.items
                .filter((item) => !!item?.bcn)
                .map((item, index) => ({
                  id: `${docSnap.id}-${item.stockAddedId || item.bcn || "item"}-${index}`,
                  stockId: item.bcn,
                  bcn: item.bcn,
                  type: "deduction",
                  quantityChange: -Math.abs(Number(item.quantityAllocated) || 0),
                  orderId: task.orderId,
                  createdAt,
                  createdBy: (item as any)?.cutBy || "Cutting Module",
                  status: item.status,
                  lengthId: item.stockAddedId,
                  salesman: task.salesPerson || "N/A",
                } as StockTransaction))
            : [];

          if (!rows.length) return null;
          return {
            source: "deduction" as const,
            cursor: docSnap.id,
            createdAt,
            rows,
          };
        })
        .filter(Boolean) as GroupRow[];
    }

    const mergedGroups = [...additionGroups, ...deductionGroups].sort(
      (a, b) => toTimeSafe(b.createdAt) - toTimeSafe(a.createdAt)
    );

    const consumedAddition = new Set<string>();
    const consumedDeduction = new Set<string>();
    const pagedRows: StockTransaction[] = [];
    let nextAdditionCursor = cursor.additionLastPath || null;
    let nextDeductionCursor = cursor.deductionLastId || null;

    for (const group of mergedGroups) {
      if (pagedRows.length >= pageSize && pagedRows.length > 0) break;
      pagedRows.push(...group.rows);
      if (group.source === "addition") {
        consumedAddition.add(group.cursor);
        nextAdditionCursor = group.cursor;
      } else {
        consumedDeduction.add(group.cursor);
        nextDeductionCursor = group.cursor;
      }
    }

    const remainingAdditionInBatch =
      includeAdditions && additionGroups.some((group) => !consumedAddition.has(group.cursor));
    const remainingDeductionInBatch =
      includeDeductions && deductionGroups.some((group) => !consumedDeduction.has(group.cursor));

    const additionHasMore = includeAdditions && (remainingAdditionInBatch || additionFetchedCount === sourceLimit);
    const deductionHasMore =
      includeDeductions && (remainingDeductionInBatch || deductionFetchedCount === sourceLimit);

    const items = pagedRows.sort((a, b) => toTimeSafe(b.createdAt) - toTimeSafe(a.createdAt));

    return JSON.parse(
      JSON.stringify({
        items,
        cursor: {
          additionLastPath: includeAdditions ? nextAdditionCursor : cursor.additionLastPath || null,
          deductionLastId: includeDeductions ? nextDeductionCursor : cursor.deductionLastId || null,
        },
        hasMore: additionHasMore || deductionHasMore,
      } as StockHistoryPageResult)
    );
  } catch (error) {
    console.error("Error fetching stock transaction history page:", error);
    return {
      items: [],
      cursor: null,
      hasMore: false,
    };
  }
}


export async function getAllStockTransactions(): Promise<StockTransaction[]> {
    try {
        // Fetch all stock additions from the 'lengths' subcollection across all 'stocks' documents
        const addedSnapshot = await adminDb.collectionGroup('lengths').get();
        const addedTransactions: StockTransaction[] = addedSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                type: 'addition',
                quantityChange: Number(data.quantity) || 0,
                createdAt: data.lastUpdatedAt || new Date().toISOString(),
                createdBy: data.salesman || "Inbound Process",
                salesman: data.salesman || 'N/A',
            } as StockTransaction;
        });

        // Fetch all stock deductions from the 'Cutting' collection
        const cuttingTasksSnapshot = await adminDb.collection('Cutting').get();
        const soldTransactions: StockTransaction[] = [];
        cuttingTasksSnapshot.forEach(doc => {
            const task = doc.data() as CuttingTask;
            task.items.forEach(item => {
                soldTransactions.push({
                    id: `${task.orderId}-${item.bcn}-${item.stockAddedId || ''}-${new Date(task.createdAt).getTime()}`, // Make key more unique
                    bcn: item.bcn,
                    type: 'deduction',
                    quantityChange: -item.quantityAllocated,
                    orderId: task.orderId,
                    createdAt: task.createdAt,
                    createdBy: (item as any).cutBy || "Cutting Module", // Use the actual user if available
                    status: item.status,
                    lengthId: item.stockAddedId,
                    salesman: task.salesPerson, // Add salesman from the cutting task
                } as StockTransaction);
            });
        });

        // Merge and sort all transactions
        const allTransactions = [...addedTransactions, ...soldTransactions];
        allTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return JSON.parse(JSON.stringify(allTransactions));
    } catch (error) {
        console.error("Error fetching all stock transactions:", error);
        return [];
    }
}


export async function deleteStockTransaction(stockId: string, transactionId: string, type: 'addition' | 'deduction'): Promise<{ success: boolean; message: string }> {
  return { success: false, message: "Direct deletion of individual transactions is currently disabled. Please revert from the source (e.g., order page)." };
}

export async function deleteStockTransactions(transactions: StockTransaction[]): Promise<{ success: boolean; message: string }> {
    return { success: false, message: "Bulk deletion is disabled for the new nested stock structure." };
}

export async function updateStockBatchAction(
    itemsToUpdate: { id: string; [key: string]: any }[]
): Promise<{ success: boolean; message: string }> {
    if (!itemsToUpdate || itemsToUpdate.length === 0) {
        return { success: false, message: "No items provided for update." };
    }

    let batch = adminDb.batch();
    let opCount = 0;
    const nowIso = new Date().toISOString();
    const supplierDocIdsWritten = new Set<string>();

    const commitBatchIfNeeded = async () => {
      if (opCount >= BATCH_SIZE) {
        await batch.commit();
        batch = adminDb.batch();
        opCount = 0;
      }
    };

    for (const item of itemsToUpdate) {
        const docRef = adminDb.collection('stocks').doc(item.id);
        const { id, ...updateData } = item;
        const cleaned = Object.fromEntries(
            Object.entries(updateData).filter(([, value]) => value !== undefined)
        );
        if (Object.keys(cleaned).length === 0) {
            continue;
        }
        batch.update(docRef, cleaned);
        opCount++;
        await commitBatchIfNeeded();

        const supplierCompanyName = cleanSupplierCompanyName(cleaned.supplierCompanyName);
        if (supplierCompanyName) {
          const docId = supplierCompanyDocId(supplierCompanyName);
          if (!supplierDocIdsWritten.has(docId)) {
            supplierDocIdsWritten.add(docId);
            setSupplierCompanyInBatch(batch, supplierCompanyName, nowIso);
            opCount++;
            await commitBatchIfNeeded();
          }
        }
    }

    if (opCount > 0) {
        await batch.commit();
    }

    return { success: true, message: `${itemsToUpdate.length} items have been updated.` };
}
    
export async function getStockDetails(bcn: string) {
    try {
        const stockRef = adminDb.collection('stocks').doc(bcn);
        const stockDoc = await stockRef.get();
        if (!stockDoc.exists) {
            return { success: false, message: "Stock BCN not found" };
        }

        const stock = { id: stockDoc.id, ...stockDoc.data() } as Stock;
        
        // Correctly fetch transactions using the already fixed function
        const transactions = await getStockTransactions(bcn);
        
        // Correctly get available lengths from the lengths subcollection
        const lengthsSnapshot = await stockRef.collection('lengths').get();
        const availableLengths = lengthsSnapshot.docs
            .map(doc => {
                const data = doc.data() || {};
                const available = Number(data.availableLength ?? data.availableQty ?? 0);
                return { length: available, transactionId: doc.id };
            })
            .filter(l => l.length > 0)
            .sort((a,b) => a.length - b.length);
        
        return {
            success: true,
            message: "Details fetched successfully.",
            data: JSON.parse(JSON.stringify({
                stock,
                transactions,
                availableLengths
            }))
        };

    } catch (error: any) {
        console.error("Error fetching stock details:", error);
        return { success: false, message: `Failed to fetch details: ${error.message}` };
    }
}
