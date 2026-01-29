
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Stock, StockTransaction, CuttingTask, CuttingTaskItem } from '@/lib/types';
import * as XLSX from "xlsx";
import {FieldValue } from 'firebase-admin/firestore';

const BATCH_SIZE = 499; // Firestore batch limit is 500 operations
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

export async function getStockData(): Promise<Stock[]> {
    try {
        const stockSnapshot = await adminDb.collection('stocks').get();
        if (stockSnapshot.empty) {
            return [];
        }
        const stockData = stockSnapshot.docs.map(doc => {
            const data = doc.data();
            // Ensure lastUpdatedAt is a string, defaulting if necessary
            const lastUpdatedAt = data.lastUpdatedAt ? new Date(data.lastUpdatedAt).toISOString() : new Date().toISOString();
            return {
                id: doc.id,
                ...data,
                lastUpdatedAt,
            } as Stock;
        });
        return JSON.parse(JSON.stringify(stockData));
    } catch (error) {
        console.error("Error fetching stock data from server:", error);
        return [];
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
  field: "supplierCompanyName" | "type" | "unit",
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

export async function createStockItemAction(payload: {
  bcn: string;
  itemName: string;
  closingstock?: number;
  maxlevel?: number;
  category?: string;
  categoryGroup?: string;
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
  rack?: string;
  productId?: string;
}): Promise<{ success: boolean; message: string; stock?: Stock }> {
  try {
    const rawBcn = String(payload?.bcn ?? "").trim();
    const itemName = String(payload?.itemName ?? "").trim();

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

    const supplierCompanyName = cleanString(payload.supplierCompanyName);
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

    const stockDoc: Record<string, any> = {
      bcn: rawBcn,
      bcnDigits,
      itemName,
      unit: cleanString(payload.unit) || "Mtr",
      type: (cleanString(payload.type) || "fabric").toLowerCase(),
      closingstock,
      quantity: closingstock,
      availableQty: closingstock,
      reservedQty: 0,
      cutQty: 0,
      supplierCompanyName,
      supplierCollectionName,
      supplierCollectionCode,
      costPriceRs,
      costMultiplierRs,
      rrpWithGstRs,
      lastUpdatedAt: now,
      updatedAt: now,
    };

    const assignIfDefined = (key: string, value: any) => {
      if (value !== undefined && value !== "") {
        stockDoc[key] = value;
      }
    };

    assignIfDefined("maxlevel", maxlevel);
    assignIfDefined("category", cleanString(payload.category));
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
    assignIfDefined("rack", cleanString(payload.rack));
    assignIfDefined("productId", cleanString(payload.productId));

    const lengthRef = closingstock > 0 ? stockRef.collection("lengths").doc() : null;

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(stockRef);
      if (snap.exists) {
        throw new Error("Stock BCN already exists.");
      }

      tx.set(stockRef, stockDoc, { merge: true });

      if (lengthRef) {
        const lengthDoc = {
          ...stockDoc,
          id: lengthRef.id,
          quantity: closingstock,
          availableQty: closingstock,
          reservedQty: 0,
          cutQty: 0,
          lastUpdatedAt: now,
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
      { key: "itemName", candidates: ["itemname", "item name"] },
      { key: "closingStock", candidates: ["closing stock", "closingstock"] },
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
      bcn: idx(["bcn"]),
      itemName: idx(["itemName", "item name"]),
      categoryGroup: idx(["category group", "categorygroup"]),
      category: idx(["category"]),
      unit: idx(["unit"]),
      type: idx(["type"]),
      width: idx(["width"]),
      moCollection: idx(["mo collection", "mocollection"]),
      moCollectionCode: idx(["mo collection code", "mocollectioncode"]),
      maxlevel: idx(["maxlevel", "max level"]),
      closingStock: idx(["closing stock", "closingstock"]),
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
    };

    // ✅ Helpers for safe value parsing
    const s = (row: any[], i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");
    const n = (row: any[], i: number, def = 0) => {
      if (i < 0) return def;
      const val = row[i];
      const num = Number(String(val ?? "").replace(/,/g, "").trim());
      return Number.isFinite(num) ? num : def;
    };

    const allItems = (json.slice(1) as any[])
      .map((row) => {
        const bcn = s(row, COL.bcn);
        if (!bcn) return null;

        const closingStock = n(row, COL.closingStock, 0);

        const stockItem = {
          // keep sheet id if present (stable), else will be auto id later
          _sheetId: s(row, COL.id),
          productId: s(row, COL.id),

          bcn,
          itemName: s(row, COL.itemName),

          categoryGroup: s(row, COL.categoryGroup),
          category: s(row, COL.category),

          unit: s(row, COL.unit) || "Mtr",
          type: (s(row, COL.type) || "fabric").toLowerCase(),

          width: n(row, COL.width, 0),

          moCollection: s(row, COL.moCollection),
          moCollectionCode: s(row, COL.moCollectionCode),

          maxlevel: n(row, COL.maxlevel, 0),

          quantity: closingStock,
          availableQty: closingStock,
          reservedQty: 0,
          cutQty: 0,

          supplierCompanyName: s(row, COL.supplierCompanyName),
          supplierCollectionName: s(row, COL.supplierCollectionName),
          supplierCollectionCode: s(row, COL.supplierCollectionCode),

          composition: s(row, COL.composition),
          martindale: n(row, COL.martindale, 0),
          weightGsm: n(row, COL.weightGsm, 0),

          horizontalRepeatCms: n(row, COL.horizontalRepeat, 0),
          verticalRepeatCms: n(row, COL.verticalRepeat, 0),
          
          costPriceRs: n(row, COL.costPrice, 0),
          costMultiplierRs: n(row, COL.costMultiplier, 0),
          rrpWithGstRs: n(row, COL.rrpWithGst, 0),

          lastUpdatedAt: new Date().toISOString(),
        };

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

    for (const item of allItems) {
    const bcnDocRef = adminDb.collection("stocks").doc(item.bcn);
    const bcnDigits = extractBcnDigits(item.bcn);

    // Parent doc
    batch.set(
        bcnDocRef,
        {
        bcn: item.bcn,
        bcnDigits,
        closingstock: item.quantity,
        itemName: item.itemName,
        categoryGroup: item.categoryGroup,
        category: item.category,
        unit: item.unit,
        type: item.type,
        width: item.width,
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
        productId: item.productId,
        costPriceRs: item.costPriceRs,
        costMultiplierRs: item.costMultiplierRs,
        rrpWithGstRs: item.rrpWithGstRs,
        maxlevel: item.maxlevel,
        updatedAt: new Date().toISOString(),
        },
        { merge: true }
    );

    // Length sub-doc
    const lengthsCol = bcnDocRef.collection("lengths");
    const lengthDocRef = item._sheetId
        ? lengthsCol.doc(item._sheetId)
        : lengthsCol.doc();

    const { _sheetId, ...payload } = item;

    batch.set(lengthDocRef, {
        ...payload,
        id: lengthDocRef.id,
    });

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


    return { success: true, message: "Import successful!", count: allItems.length };
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
    if (!trimmed || trimmed.length < 2) {
        return [];
    }

    try {
        const stockRef = adminDb.collection('stocks');
        const normalizedQuery = normalizeBcn(trimmed);
        const digitQuery = extractBcnDigits(trimmed);
        const resultsMap = new Map<string, Stock>();

        const addDocs = (docs: any[]) => {
          docs.forEach(doc => {
            resultsMap.set(doc.id, { id: doc.id, ...doc.data() } as Stock);
          });
        };

        const bcnSnap = await stockRef
            .where('bcn', '>=', trimmed)
            .where('bcn', '<=', trimmed + '\uf8ff')
            .limit(20)
            .get();
        addDocs(bcnSnap.docs);

        if (digitQuery.length >= 2) {
            const digitsSnap = await stockRef
                .where('bcnDigits', '>=', digitQuery)
                .where('bcnDigits', '<=', digitQuery + '\uf8ff')
                .limit(20)
                .get();
            addDocs(digitsSnap.docs);
        }

        if (resultsMap.size === 0 && normalizedQuery.length >= 4) {
            const scanSnap = await stockRef.get();
            scanSnap.docs.forEach(doc => {
                const data = doc.data();
                const bcnValue = String(data.bcn || doc.id || "");
                const bcnNormalized = normalizeBcn(bcnValue);
                const bcnDigits = extractBcnDigits(bcnValue);
                const matchesNormalized = normalizedQuery && bcnNormalized.includes(normalizedQuery);
                const matchesDigits = digitQuery && bcnDigits.includes(digitQuery);
                if (matchesNormalized || matchesDigits) {
                    resultsMap.set(doc.id, { id: doc.id, ...data } as Stock);
                }
            });
        }

        return JSON.parse(JSON.stringify(Array.from(resultsMap.values()).slice(0, 20)));
    } catch (error) {
        console.error("Error searching stock by BCN:", error);
        return [];
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
): Promise<{ success: boolean; message: string; newStock?: Stock }> {
  const stockRef = adminDb.collection('stocks').doc(stockId);
  
  if (transaction.type === 'addition') {
    let finalStockData: Stock;
    const bcnDigits = extractBcnDigits(transaction.bcn || stockId);
    
    try {
      // Let Firestore generate a unique ID for each new length document
      const newLengthRef = stockRef.collection('lengths').doc();

      await adminDb.runTransaction(async (tx) => {
          const stockDoc = await tx.get(stockRef); // READ FIRST
          const stockData = stockDoc.exists ? (stockDoc.data() as Stock) : null;
          const resolvedUnit = (transaction.unit || stockData?.unit || "Mtr").trim() || "Mtr";
          
          const newLengthData: Partial<Stock> & { bcnDigits?: string } = {
              bcn: transaction.bcn,
              bcnDigits,
              itemName: transaction.bcn,
              quantity: transaction.quantityChange,
              availableQty: transaction.quantityChange,
              reservedQty: 0,
              cutQty: 0,
              unit: resolvedUnit,
              lastUpdatedAt: transaction.createdAt,
              poNumber: transaction.poNumber,
              salesman: transaction.salesman,
          };

          tx.set(
            newLengthRef,
            stripUndefined({ ...newLengthData, id: newLengthRef.id })
          ); // WRITE

          if (!stockDoc.exists) {
              tx.set(stockRef, { // WRITE
                  bcn: stockId,
                  bcnDigits,
                  itemName: transaction.bcn,
                  quantity: transaction.quantityChange,
                  availableQty: transaction.quantityChange,
                  reservedQty: 0,
                  cutQty: 0,
                  tax: 0,
                  rack: "",
                  vendorName: "",
                  hsnCode: "",
                  category: "",
                  serialNo: "",
                  mrp: 0
              }, { merge: true });
          } else {
              tx.update(stockRef, { // WRITE
                  bcnDigits,
                  quantity: FieldValue.increment(transaction.quantityChange),
                  availableQty: FieldValue.increment(transaction.quantityChange),
              });
          }
      });
      
      const updatedStockDoc = await stockRef.get();
      finalStockData = { id: updatedStockDoc.id, ...updatedStockDoc.data() } as Stock;
      
      return { success: true, message: 'Stock added successfully.', newStock: JSON.parse(JSON.stringify(finalStockData)) };

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
    const quantityToRevert = lengthData.quantity;

    await adminDb.runTransaction(async (transaction) => {
        // 1. Delete the length document
        transaction.delete(lengthDoc.ref);

        // 2. Decrement the main stock document quantities
        transaction.update(stockRef, {
            quantity: FieldValue.increment(-quantityToRevert),
            availableQty: FieldValue.increment(-quantityToRevert)
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
                bcn: bcn,
                type: 'addition',
                quantityChange: Number(data.quantity) || 0,
                createdAt: data.lastUpdatedAt || new Date().toISOString(),
                salesman: data.salesman || 'N/A',
                createdBy: "Inbound Process", // Or fetch from the original PR
                cutHistory: cutHistory,
            } as StockTransaction;
        });
  
        const addedTransactions = await Promise.all(addedTransactionsPromises);
  
        const allTransactions = [...addedTransactions, ...soldTransactions];
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
            if (data.availableQty > 0) {
                 availableLengths.push({ length: data.availableQty, transactionId: doc.id });
            }
        });

        return { success: true, message: 'Lengths fetched.', lengths: JSON.parse(JSON.stringify(availableLengths.sort((a,b) => a.length - b.length))) };

    } catch (error: any) {
        console.error("Error fetching available stock lengths:", error);
        return { success: false, message: 'Failed to fetch available stock.' };
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

    for (const item of itemsToUpdate) {
        const docRef = adminDb.collection('stocks').doc(item.id);
        const { id, ...updateData } = item;
        batch.update(docRef, updateData);
        opCount++;

        if (opCount >= 499) {
            await batch.commit();
            batch = adminDb.batch();
            opCount = 0;
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
            .map(doc => ({ length: doc.data().availableQty, transactionId: doc.id }))
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
