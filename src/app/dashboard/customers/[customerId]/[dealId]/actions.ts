

'use server'

import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { Deal, DealProduct, DealProductsDoc, Quotation, DealOrder, DealVisit, DealMeasurement, DeliveryInstallationItem, Cpd, Dimension, AdvanceDetail, OrderType, Order, O2DStatus, MeasurementEntry, O2DProcess, Selection, Stock, Receipt } from '@/lib/types';
import { FormValues as QuotationFormValues } from '@/components/features/order-management/CreateQuotationDialog';

import { getMilestonesForOrder } from '@/lib/constants';
import { buildWorkflowMilestones } from '@/lib/order-workflow';
import { dedupeO2DMilestones, upsertO2DMilestone } from '@/lib/o2d-milestones';
import { FieldValue } from 'firebase-admin/firestore';
import { Readable } from 'stream';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { firebase } from 'googleapis/build/src/apis/firebase';
import { db } from '@/lib/firebase';
import { firestore } from 'firebase-admin';
import { VisitFormValues } from '@/components/features/customer/VisitForm';
import { CpdFormValues } from '@/components/features/customer/CpdForm';
import { getNextSequenceValue } from '@/lib/id-sequence';
import { upsertVasStockItemsAction } from '@/app/dashboard/inventory/actions';


// This function sends an SMS using the Fast2SMS API.
async function sendVisitSms(customerPhone: string, message: string) {
    // This is a placeholder. For a real app, you'd use a WhatsApp API provider.
    const whatsappLink = `https://wa.me/${customerPhone}?text=${encodeURIComponent(message)}`;
    console.log(`Generated WhatsApp link: ${whatsappLink}`);
    // In a real implementation, you would return this link or use a service to send it.
    return { success: true, message: "WhatsApp link generated." , link: whatsappLink};
}

const base64Marker = "base64,";

const normalizeBase64 = (value: string) => {
  if (!value) return "";
  const markerIndex = value.indexOf(base64Marker);
  return markerIndex >= 0 ? value.slice(markerIndex + base64Marker.length) : value;
};

const sanitizeFileName = (value: string) =>
  (value || "file").replace(/[^\w.-]/g, "_");

const stripUndefined = (value: Record<string, any>) =>
  Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined));

const toTrimmedString = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const stripUndefinedDeep = (value: any): any => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    const cleaned = value
      .map((entry) => stripUndefinedDeep(entry))
      .filter((entry) => entry !== undefined);
    return cleaned;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
      .filter(([, entry]) => entry !== undefined);
    return Object.fromEntries(entries);
  }
  return value;
};

const buildDealProductMeta = (product: DealProduct) => {
  const cloned: Record<string, any> = { ...product };
  delete cloned.file;
  delete cloned.meta;
  return stripUndefinedDeep(cloned);
};

const toUpper = (value: unknown) => {
  const text = toTrimmedString(value);
  return text ? text.toUpperCase() : undefined;
};

const resolveDealProductType = (product: DealProduct) => {
  const raw = toTrimmedString(product.productType || product.productSource || product.category);
  if (!raw) return "FABRIC";
  if (raw.toUpperCase() === "VAS") return "VAS";
  return raw.toUpperCase();
};

const resolveDealProductCategory = (product: DealProduct) =>
  toTrimmedString(product.categoryGroup || product.productCategory || product.category);

const resolveDealProductGroup = (product: DealProduct) =>
  toTrimmedString(product.group || product.productSource || product.productType || product.VasType);

const resolveDealProductDescription = (product: DealProduct) => {
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

const buildDealProductItem = (product: DealProduct) =>
  stripUndefined({
    roomName: toTrimmedString(product.room),
    type: resolveDealProductType(product),
    category: resolveDealProductCategory(product),
    bcn: toTrimmedString(product.bcn || product.collectionBrand),
    description: resolveDealProductDescription(product),
    unit: toUpper(product.unit),
    rate: toNumber(product.rate ?? product.mrp),
    qty: toNumber(product.quantity ?? (product as any).noOfBlind),
    gst: toNumber(product.gstPercent),
    hsn: toTrimmedString(product.hsnOrSac || product.hsnCode),
    group: resolveDealProductGroup(product),
    itemName: toTrimmedString(product.itemName),
    meta: buildDealProductMeta(product),
  });
const normalizeVisitType = (value?: string) => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "measurement") return "MEASUREMENT";
  if (normalized === "sales") return "SALES";
  if (normalized === "follow_up" || normalized === "follow up" || normalized === "follow-up") {
    return "FOLLOW_UP";
  }
  return value.toUpperCase().replace(/\s+/g, "_");
};

const deriveVisitPurpose = (value?: string) => {
  const normalized = normalizeVisitType(value);
  if (normalized) return normalized;
  return value?.trim() || "VISIT";
};

const buildVisitNo = (existing?: string, createdAt?: string) => {
  if (existing) return existing;
  const date = createdAt ? new Date(createdAt) : new Date();
  const year = date.getFullYear();
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `VIS-${year}-${seq}`;
};

const getDateOnly = (value?: string) => {
  if (!value) return undefined;
  const [datePart] = value.split("T");
  return datePart || undefined;
};

const resolveUserName = async (userId?: string) => {
  if (!userId) return undefined;
  try {
    const userSnap = await adminDb.collection("users").doc(userId).get();
    return userSnap.exists ? userSnap.data()?.name : undefined;
  } catch (error) {
    console.warn("Failed to resolve user name:", userId, error);
    return undefined;
  }
};

const uploadBufferToStorage = async (
  bucket: any,
  filePath: string,
  buffer: Buffer,
  mimeType: string
) => {
  const file = bucket.file(filePath);

  // ✅ Upload file (no ACL changes)
  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType: mimeType,
      cacheControl: "private, max-age=0, no-cache",
    },
  });

  // ✅ Signed URL (works with UBLA)
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  });

  return url;
};

export async function uploadFileToStorageAction(
  fileName: string,
  mimeType: string,
  base64Data: string,
  folder: string = "measurements"
): Promise<string> {
  if (!adminStorage) {
    throw new Error(
      "Firebase Admin Storage is not initialized. Ensure FIREBASE_SERVICE_ACCOUNT_KEY and FIREBASE_STORAGE_BUCKET are set."
    );
  }

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error("FIREBASE_STORAGE_BUCKET env missing. Example: studio-3799785967-d0d9d.firebasestorage.app");
  }

  const bucket = adminStorage.bucket(bucketName); // ✅ explicit bucket
  const safeName = sanitizeFileName(fileName);
  const filePath = `${folder}/${Date.now()}_${safeName}`;

  const cleanBase64 = normalizeBase64(base64Data);
  if (!cleanBase64) throw new Error("Empty file payload.");

  const buffer = Buffer.from(cleanBase64, "base64");
  return uploadBufferToStorage(bucket, filePath, buffer, mimeType);
}


export async function getDealById(customerId: string, dealId: string): Promise<Deal | null> {
    try {
        const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
        const docSnap = await dealRef.get();

        if (docSnap.exists) {
            const dealData = { id: docSnap.id, ...docSnap.data() } as Deal;
            // Firestore data is not directly serializable, so we need to convert it
            return JSON.parse(JSON.stringify(dealData));
        }
        return null;
    } catch (error) {
        console.error(`Error fetching deal ${dealId} for customer ${customerId}:`, error);
        return null;
    }
}

export async function getDealProducts(dealId: string): Promise<DealProductsDoc | null> {
  try {
    const docRef = adminDb.collection("dealProducts").doc(String(dealId));
    const snap = await docRef.get();
    if (!snap.exists) return null;
    const payload = { dealProductId: snap.id, ...snap.data() } as DealProductsDoc;
    return JSON.parse(JSON.stringify(payload));
  } catch (error) {
    console.error(`Error fetching dealProducts for deal ${dealId}:`, error);
    return null;
  }
}

export async function updateDealProducts(
  customerId: string,
  dealId: string,
  products: DealProduct[],
  actor?: { id?: string; name?: string }
): Promise<{ success: boolean; message: string }> {
  try {
    const dealProductsRef = adminDb.collection("dealProducts").doc(String(dealId));
    const existingSnap = await dealProductsRef.get();
    const existing = existingSnap.exists ? (existingSnap.data() as DealProductsDoc) : null;

    const safeProducts = Array.isArray(products) ? products.filter(Boolean) : [];

    const now = new Date().toISOString();
    const createdAt = existing?.createdAt || now;
    const createdBy = existing?.createdBy || actor?.name || actor?.id || "System";
    const status = existing?.status || "DRAFT";

    const normalItems = safeProducts
      .filter((product) => String(product.productType || "").toUpperCase() !== "VAS")
      .map(buildDealProductItem);

    const vasItems = safeProducts
      .filter((product) => String(product.productType || "").toUpperCase() === "VAS")
      .map(buildDealProductItem);

    const updates = Array.isArray(existing?.updates) ? [...existing!.updates] : [];
    updates.push(
      stripUndefined({
        updatedAt: now,
        updatedBy: actor ? stripUndefined({ id: actor.id, name: actor.name }) : undefined,
        action: "UPDATED",
        message: `Products updated (${safeProducts.length}).`,
      })
    );

    const payload: DealProductsDoc = stripUndefined({
      dealProductId: String(dealId),
      dealId: String(dealId),
      customerId: String(customerId),
      sections: {
        NORMAL: { items: normalItems },
        VAS: { items: vasItems },
      },
      status,
      updates,
      createdAt,
      updatedAt: now,
      createdBy,
    }) as DealProductsDoc;

    await dealProductsRef.set(payload, { merge: true });

    return { success: true, message: "Products updated successfully." };
  } catch (error) {
    console.error(`Error updating dealProducts for deal ${dealId}:`, error);
    return { success: false, message: `Failed to update products: ${(error as Error)?.message || "Unknown error"}` };
  }
}


type QuotationFormWithMeta = QuotationFormValues & { createdBy?: string };

export async function createQuotationAction(customerId: string, dealId: string, values: QuotationFormWithMeta, totalAmount: number): Promise<{ success: boolean; message: string, quotationId?: string, quotation?: Quotation }> {
  try {
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
 
    const quotationRef = dealRef.collection('quotations').doc();
    let quotationNo = "";
    for (let attempt = 0; attempt < 1000; attempt++) {
      const candidate = await getNextSequenceValue("quotationNo");
      const existing = await adminDb
        .collectionGroup("quotations")
        .where("quotationNo", "==", candidate)
        .limit(1)
        .get();
      if (existing.empty) {
        quotationNo = candidate;
        break;
      }
    }

    if (!quotationNo) {
      throw new Error("Unable to allocate a unique quotation number.");
    }

    const vasRowsForStock = (Array.isArray(values?.vasDetails) ? values.vasDetails : [])
      .map((vas: any) => ({
        vasName: String(vas?.vasName || "").trim(),
        rate: Number(vas?.rate) || 0,
        gstPercent: Number(vas?.gstPercent) || 0,
        hsnCode: String(vas?.hsnCode || "").trim() || undefined,
      }))
      .filter((vas) => vas.vasName);

    if (vasRowsForStock.length > 0) {
      const syncResult = await upsertVasStockItemsAction(vasRowsForStock);
      if (!syncResult.success) {
        throw new Error(syncResult.message || "Failed to sync VAS stock catalog.");
      }
    }

    const newQuotation: Quotation = {
        id: quotationRef.id,
        quotationNo,
        ...values,
        createdAt: new Date().toISOString(),
        status: 'Pending Approval', // Initially pending
        totalAmount: totalAmount,
        cpdId: values.selectedCpdId || "No CPD ID",
    };
    
    // Automation: Mark Quotation Making (4) as complete in O2D
    const o2dProcessRef = adminDb.collection('o2d').doc(dealId);
    const o2dProcessDoc = await o2dProcessRef.get();
    const batch = adminDb.batch();

    batch.set(quotationRef, newQuotation);

    if (o2dProcessDoc.exists) {
        const quotationStepId = 4; // Corresponds to "Quotation Making"
        const existingMilestones = dedupeO2DMilestones(
            (o2dProcessDoc.data()?.milestones || []) as O2DStatus[]
        );
        
        // Avoid adding duplicate milestones
        if (!existingMilestones.some(m => m.stepId === quotationStepId)) {
            const newMilestone: O2DStatus = {
                stepId: quotationStepId,
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: values.createdBy || 'System',
                remarks: `Quotation #${newQuotation.quotationNo} created.`,
                selection: 'Done'
            };
            batch.update(o2dProcessRef, {
                milestones: upsertO2DMilestone(existingMilestones, newMilestone)
            });
        }
    }
    
    await batch.commit();

    return { 
        success: true, 
        message: 'Quotation created successfully!', 
        quotationId: quotationRef.id,
        quotation: JSON.parse(JSON.stringify(newQuotation))
    };

  } catch (error: any) {
    console.error("Error creating quotation:", error);
    return { success: false, message: `Failed to create quotation: ${error.message}` };
  }
}

const coerceNumber = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toIsoString = (value?: string | Date | null) => {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const resolveOrderItemType = (item: any) => {
  const raw = String(item?.type || item?.productType || item?.bcnType || "").trim().toUpperCase();
  if (raw.includes("HARDWARE")) return "HARDWARE";
  if (raw.includes("CHANNEL")) return "CHANNEL";
  if (raw.includes("ACCESSORY")) return "ACCESSORY";
  if (raw.includes("VAS")) return "VAS";
  return "FABRIC";
};

const resolveOrderItemUnit = (itemType: string, item: any) => {
  const unit = String(item?.unit || item?.stockUnit || "").trim().toUpperCase();
  if (unit) return unit;
  if (itemType === "FABRIC") return "MTR";
  return "PCS";
};

const summarizeOrderItems = (items: Array<{ taxableAmount?: number; gstAmount?: number; totalAmount?: number }>) => {
  return items.reduce(
    (acc, item) => {
      acc.subTotal += coerceNumber(item.taxableAmount);
      acc.gstTotal += coerceNumber(item.gstAmount);
      acc.grandTotal += coerceNumber(item.totalAmount);
      return acc;
    },
    { subTotal: 0, gstTotal: 0, grandTotal: 0 }
  );
};

export async function createDealOrderAction(
  customerId: string,
  dealId: string,
  quotation: Quotation,
  creator: { id: string; name: string },
  orderType: OrderType
): Promise<{ success: boolean; message: string; order?: Order }> {
  try {
    const customerRef = adminDb.collection('customers').doc(customerId);
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const quotationRef = dealRef.collection('quotations').doc(quotation.id);

    const [customerSnap, dealSnap, currentQuotationSnap] = await Promise.all([
      customerRef.get(),
      dealRef.get(),
      quotationRef.get()
    ]);

    if (currentQuotationSnap.exists && currentQuotationSnap.data()?.status === 'Converted to Order') {
      return { success: false, message: 'This quotation has already been converted to an order.' };
    }

    if (!customerSnap.exists) {
        return { success: false, message: 'Customer not found.' };
    }
    if (!dealSnap.exists) {
        return { success: false, message: 'Deal not found.' };
    }

    const customerData = customerSnap.data() as any;
    const dealData = dealSnap.data() as Deal;

    let salesmanName = 'N/A';
    const representativeId = dealData.assignedSalesPerson?.id || dealData.representativeId;
    if (representativeId) {
        const salesmanRef = adminDb.collection('users').doc(representativeId);
        const salesmanSnap = await salesmanRef.get();
        if (salesmanSnap.exists) {
            salesmanName = salesmanSnap.data()?.name || 'N/A';
        }
    }

    const batch = adminDb.batch();

    const dealOrdersRef = dealRef.collection('orders');
    const newDealOrderRef = dealOrdersRef.doc();

    const orderId = `MOTRACK-${quotation.quotationNo}`;
    const newOrderRef = adminDb.collection('orders').doc(orderId);

    const now = new Date().toISOString();

    const rawNormalItems = Array.isArray((quotation as any).sections?.NORMAL?.items)
      ? (quotation as any).sections.NORMAL.items
      : (quotation.items || []);
    const rawVasItems = Array.isArray((quotation as any).sections?.VAS?.items)
      ? (quotation as any).sections.VAS.items
      : (quotation.vasDetails || []);

    const normalItems = rawNormalItems.map((item: any) => {
      const itemType = resolveOrderItemType(item);
      const qty = coerceNumber(item.qty ?? item.quantity);
      const gst = coerceNumber(item.gst ?? item.gstPercent);
      const discountPercent = coerceNumber(item.discountPercent ?? item.discount, 0);
      const gstMode = String(item.gstMode ?? item.gstType ?? "").toUpperCase() === "EXCL" ? "EXCL" : "INCL";

      const inputRate = coerceNumber(item.rate ?? item.originalMrp ?? item.mrp ?? item.unitPrice);
      let exclusiveRate = coerceNumber(item.exclusiveRate, Number.NaN);
      if (!Number.isFinite(exclusiveRate)) {
        if (gstMode === "INCL" && gst > 0 && Number.isFinite(inputRate)) {
          exclusiveRate = inputRate / (1 + gst / 100);
        } else if (Number.isFinite(inputRate)) {
          exclusiveRate = inputRate;
        } else {
          exclusiveRate = 0;
        }
      }

      let grossRate = inputRate;
      if (!Number.isFinite(grossRate) || grossRate === 0) {
        if (gstMode === "INCL" && gst > 0) {
          grossRate = exclusiveRate * (1 + gst / 100);
        } else {
          grossRate = exclusiveRate;
        }
      }

      const grossAmount = grossRate * qty;
      const discountAmount = grossAmount * (discountPercent / 100);
      const amountAfterDiscount = grossAmount - discountAmount;

      let taxableAmount = 0;
      let gstAmount = 0;
      let totalAmount = 0;
      if (gstMode === "EXCL") {
        taxableAmount = amountAfterDiscount;
        gstAmount = taxableAmount * (gst / 100);
        totalAmount = taxableAmount + gstAmount;
      } else {
        taxableAmount = gst > 0 ? amountAfterDiscount / (1 + gst / 100) : amountAfterDiscount;
        gstAmount = amountAfterDiscount - taxableAmount;
        totalAmount = amountAfterDiscount;
      }

      return stripUndefinedDeep({
        roomName: toTrimmedString(item.roomName ?? item.room),
        type: itemType,
        category: toTrimmedString(item.category || item.subCategory),
        itemId: toTrimmedString(item.itemId),
        bcn: toTrimmedString(item.bcn ?? item.collectionBrand),
        description: toTrimmedString(item.description || item.salesDescription || item.collectionBrand),
        unit: resolveOrderItemUnit(itemType, item),
        rate: exclusiveRate,
        exclusiveRate,
        qty,
        gst,
        gstMode,
        discountPercent,
        hsn: toTrimmedString(item.hsn ?? item.hsnCode),
        group: toTrimmedString(item.group),
        taxableAmount,
        gstAmount,
        totalAmount,
        allocation: {
          status: "PENDING",
          lengths: [],
          lots: [],
        },
      });
    });

    const vasItems = rawVasItems.map((vas: any) => {
      const qty = coerceNumber(vas.qty ?? vas.quantity);
      const gst = coerceNumber(vas.gst ?? vas.gstPercent);
      const discountPercent = coerceNumber(vas.discountPercent ?? vas.discount, 0);
      const gstMode = String(vas.gstMode ?? vas.gstType ?? "").toUpperCase() === "EXCL" ? "EXCL" : "INCL";
      const inputRate = coerceNumber(vas.rate ?? vas.originalMrp ?? vas.mrp ?? vas.unitPrice);
      const exclusiveRate =
        gstMode === "INCL" && gst > 0 ? inputRate / (1 + gst / 100) : inputRate;
      const grossRate = gstMode === "INCL" && gst > 0 ? inputRate : exclusiveRate;
      const grossAmount = grossRate * qty;
      const discountAmount = grossAmount * (discountPercent / 100);
      const amountAfterDiscount = grossAmount - discountAmount;

      let taxableAmount = 0;
      let gstAmount = 0;
      let totalAmount = 0;
      if (gstMode === "EXCL") {
        taxableAmount = amountAfterDiscount;
        gstAmount = taxableAmount * (gst / 100);
        totalAmount = taxableAmount + gstAmount;
      } else {
        taxableAmount = gst > 0 ? amountAfterDiscount / (1 + gst / 100) : amountAfterDiscount;
        gstAmount = amountAfterDiscount - taxableAmount;
        totalAmount = amountAfterDiscount;
      }

      return stripUndefinedDeep({
        roomName: toTrimmedString(vas.roomName ?? vas.room),
        type: "VAS",
        description: toTrimmedString(vas.description ?? vas.vasName),
        unit: resolveOrderItemUnit("VAS", vas),
        rate: exclusiveRate,
        exclusiveRate,
        qty,
        gst,
        gstMode,
        discountPercent,
        hsn: toTrimmedString(vas.hsn ?? vas.hsnCode),
        group: toTrimmedString(vas.group),
        taxableAmount,
        gstAmount,
        totalAmount,
      });
    });

    const normalSummary = summarizeOrderItems(normalItems);
    const vasSummary = summarizeOrderItems(vasItems);

    const sections = {
      NORMAL: { items: normalItems, summary: normalSummary },
      VAS: { items: vasItems, summary: vasSummary },
    };

    const overallSummary = {
      goodsTotal: normalSummary.grandTotal,
      vasTotal: vasSummary.grandTotal,
      grandTotal: normalSummary.grandTotal + vasSummary.grandTotal,
    };

    const workflowMilestones = buildWorkflowMilestones(orderType, creator);

    const billingAddress = stripUndefinedDeep(
      customerData.billingAddress || {
        line1: customerData.addressPinCode || undefined,
        city: customerData.city || undefined,
        state: customerData.state || undefined,
        pincode: customerData.pinCode || customerData.addressPinCode || undefined,
      }
    );

    const customerSnapshot = stripUndefinedDeep({
      name: customerData.name || quotation.customerName,
      phone: customerData.phone || customerData.mobileNo || '',
      gstin: customerData.gstin,
      billingAddress,
      shippingAddress: customerData.shippingAddress,
    });

    const dealSnapshot = stripUndefinedDeep({
      dealCode: dealData.dealCode,
      title: dealData.title || dealData.dealName,
    });

    const quotationSnapshotMeta = stripUndefinedDeep({
      createdAt: toIsoString(quotation.createdAt),
      validTill: toIsoString(quotation.validTillDate),
      statusAtConversion: quotation.status,
    });

    const legacyFabricDetails = rawNormalItems.map((item: any) => ({
      fabricName: item.bcn ?? item.collectionBrand ?? item.description ?? "N/A",
      quantity: String(item.qty ?? item.quantity ?? 0),
      status: "pending for po",
      rate: coerceNumber(item.exclusiveRate ?? item.rate),
      discountPercent: coerceNumber(item.discountPercent),
    }));

    const legacyVasDetails = (quotation.vasDetails && quotation.vasDetails.length > 0)
      ? quotation.vasDetails
      : rawVasItems.map((vas: any) => ({
          vasName: vas.vasName ?? vas.description ?? "VAS",
          rate: String(vas.rate ?? 0),
          quantity: String(vas.qty ?? vas.quantity ?? 0),
          room: vas.roomName ?? vas.room ?? undefined,
          gstPercent: coerceNumber(vas.gst ?? vas.gstPercent),
          hsnCode: vas.hsn ?? vas.hsnCode,
        }));

    const initialMilestones = getMilestonesForOrder(orderType);
    const firstMilestone = initialMilestones.find(m => m.id === 1);
    if (firstMilestone) {
      firstMilestone.completed = true;
      firstMilestone.completedAt = now;
      firstMilestone.completedBy = creator.name;
    }

    const isVasOnly = normalItems.length === 0 && vasItems.length > 0;

    const newOrder: Order = stripUndefinedDeep({
      id: orderId,
      orderId,
      orderNo: orderId,
      quotationId: quotation.id,
      quotationNo: quotation.quotationNo,
      customerId: customerId,
      dealId: dealData.dealId || dealId,
      customerSnapshot,
      dealSnapshot,
      quotationSnapshotMeta,
      sections,
      overallSummary,
      workflow: {
        status: "CREATED",
        milestones: workflowMilestones,
      },
      invoicing: {
        status: "NOT_INVOICED",
        invoices: [],
        canCreateGoodsInvoice: normalItems.length > 0,
        canCreateVasInvoice: vasItems.length > 0,
        invoiceRequired: true,
      },
      updates: [
        {
          updatedAt: now,
          updatedBy: stripUndefined({ id: creator.id, name: creator.name }),
          action: "ORDER_CREATED",
          message: `Order created from quotation ${quotation.quotationNo}.`,
        },
      ],
      createdAt: now,
      updatedAt: now,
      createdBy: { id: creator.id, name: creator.name },

      // Legacy fields (kept to avoid breaking existing dashboards)
      crmOrderNo: quotation.quotationNo,
      customerName: quotation.customerName,
      customerPhone: customerData.phone || customerData.mobileNo || '',
      customerAddress: customerData.billingAddress?.line1 || customerData.addressPinCode || `${customerData.city || ""}${customerData.state ? `, ${customerData.state}` : ""}`,
      salesPerson: salesmanName,
      orderType: orderType,
      milestones: initialMilestones,
      storeName: quotation.store,
      fabricDetails: legacyFabricDetails,
      totalAmount: overallSummary.grandTotal || quotation.totalAmount,
      vasDetails: legacyVasDetails,
      status: isVasOnly ? 'Approved' : 'Pending Approval',
      isAcknowledged: true,
      dealOrderDocId: newDealOrderRef.id,
      representativeId: representativeId,
    }) as Order;

    batch.set(newOrderRef, newOrder);

    const newDealOrder: DealOrder = stripUndefinedDeep({
      id: newDealOrderRef.id,
      orderId: newOrder.id,
      orderNo: newOrder.orderNo ?? newOrder.id,
      orderDate: now,
      createdBy: creator.name,
      remark: quotation.billingName || undefined,
      status: newOrder.workflow?.status ?? "CREATED",
      overallSummary: newOrder.overallSummary,
    });

    batch.set(newDealOrderRef, newDealOrder);

    batch.update(quotationRef, { 
      status: 'Converted to Order',
      orderNo: newOrder.id,
    });

    await batch.commit();

    return {
      success: true,
      message: isVasOnly ? 'Order created and sent directly for invoicing.' : 'Order created and sent for approval.',
      order: JSON.parse(JSON.stringify(newOrder)),
    };
  } catch (error: any) {
    console.error('Error creating deal order:', error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}

export async function getQuotationsForDeal(customerId: string, dealId: string): Promise<Quotation[]> {
    try {
        const snapshot = await adminDb
            .collection('customers')
            .doc(customerId)
            .collection('deals')
            .doc(dealId)
            .collection('quotations')
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const quotations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quotation));
        return JSON.parse(JSON.stringify(quotations));
    } catch (error) {
        console.error("Error fetching quotations:", error);
        return [];
    }
}

export async function updateQuotationStatusAction(
  customerId: string,
  dealId: string,
  quotationId: string,
  status: Quotation["status"]
): Promise<{ success: boolean; message: string }> {
  try {
    const quotationRef = adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('quotations')
      .doc(quotationId);

    const quotationSnap = await quotationRef.get();
    if (!quotationSnap.exists) {
      return { success: false, message: 'Quotation not found.' };
    }

    const currentStatus = quotationSnap.data()?.status as Quotation["status"] | undefined;
    if (currentStatus === 'Converted to Order' && status === 'Closed') {
      return { success: false, message: 'Converted quotations cannot be closed.' };
    }

    await quotationRef.update({ status });
    return { success: true, message: `Quotation marked as ${status}.` };
  } catch (error: any) {
    console.error('Error updating quotation status:', error);
    return { success: false, message: `Failed to update quotation: ${error.message}` };
  }
}

type DeleteQuotationActor = {
  id?: string;
  name?: string;
  role?: string;
};

type InventoryDelta = {
  availableQty?: number;
  availableLength?: number;
  reservedQty?: number;
  cutQty?: number;
};

const DELTA_EPSILON = 0.0001;

const toPositiveNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const addInventoryDelta = (
  map: Map<string, InventoryDelta>,
  key: string,
  delta: InventoryDelta
) => {
  if (!key) return;
  const existing = map.get(key) || {};
  map.set(key, {
    availableQty: (existing.availableQty || 0) + (delta.availableQty || 0),
    availableLength: (existing.availableLength || 0) + (delta.availableLength || 0),
    reservedQty: (existing.reservedQty || 0) + (delta.reservedQty || 0),
    cutQty: (existing.cutQty || 0) + (delta.cutQty || 0),
  });
};

const hasDelta = (delta: InventoryDelta) =>
  Math.abs(delta.availableQty || 0) > DELTA_EPSILON ||
  Math.abs(delta.availableLength || 0) > DELTA_EPSILON ||
  Math.abs(delta.reservedQty || 0) > DELTA_EPSILON ||
  Math.abs(delta.cutQty || 0) > DELTA_EPSILON;

const buildStockKey = (stockId?: string, bcn?: string) => {
  const safeStockId = String(stockId || "").trim();
  if (safeStockId) return `id:${safeStockId}`;
  const safeBcn = String(bcn || "").trim().toUpperCase();
  return safeBcn ? `bcn:${safeBcn}` : "";
};

const sanitizeStockDocId = (value: string) => String(value || "").trim().replace(/\//g, "-");

export async function deleteQuotationCascadeAction(
  customerId: string,
  dealId: string,
  quotationId: string,
  actor?: DeleteQuotationActor
): Promise<{
  success: boolean;
  message: string;
  summary?: {
    ordersDeleted: number;
    dealOrdersDeleted: number;
    invoicesDeleted: number;
    allocationReservationsDeleted: number;
  };
}> {
  try {
    const requestedRole = String(actor?.role || "").trim().toLowerCase();
    let isAdmin = requestedRole === "admin";

    if (actor?.id) {
      const actorSnap = await adminDb.collection("users").doc(actor.id).get();
      if (actorSnap.exists) {
        const persistedRole = String(actorSnap.data()?.role || "").trim().toLowerCase();
        isAdmin = persistedRole === "admin";
      }
    }

    if (!isAdmin) {
      return { success: false, message: "Only admin can delete quotations with cascade." };
    }

    const dealRef = adminDb.collection("customers").doc(customerId).collection("deals").doc(dealId);
    const quotationRef = dealRef.collection("quotations").doc(quotationId);
    const quotationSnap = await quotationRef.get();

    if (!quotationSnap.exists) {
      return { success: false, message: "Quotation not found." };
    }

    const quotationData = quotationSnap.data() as Quotation & Record<string, any>;
    const quotationNo = String(quotationData?.quotationNo || "").trim();
    const directOrderId = String(quotationData?.orderNo || "").trim();

    const ordersRef = adminDb.collection("orders");
    const orderDocs = new Map<string, FirebaseFirestore.DocumentSnapshot>();

    if (directOrderId) {
      const directOrderSnap = await ordersRef.doc(directOrderId).get();
      if (directOrderSnap.exists) {
        orderDocs.set(directOrderSnap.id, directOrderSnap);
      }
    }

    const orderQueryPromises: Promise<FirebaseFirestore.QuerySnapshot>[] = [
      ordersRef.where("quotationId", "==", quotationId).get(),
    ];

    if (quotationNo) {
      orderQueryPromises.push(
        ordersRef.where("quotationNo", "==", quotationNo).get(),
        ordersRef.where("crmOrderNo", "==", quotationNo).get()
      );
    }

    const orderQueryResults = await Promise.all(orderQueryPromises);
    orderQueryResults.forEach((snapshot) => {
      snapshot.forEach((docSnap) => orderDocs.set(docSnap.id, docSnap));
    });

    const stockHints = new Map<string, { stockId?: string; bcn?: string }>();
    const stockDeltas = new Map<string, InventoryDelta>();
    const lengthDeltas = new Map<string, { stockKey: string; lengthId: string; delta: InventoryDelta }>();
    const reservationCleanupTargets = new Map<string, { stockKey: string; lengthId: string; orderId: string }>();

    const registerStockDelta = (stockId: unknown, bcn: unknown, delta: InventoryDelta) => {
      const key = buildStockKey(
        String(stockId || "").trim() || undefined,
        String(bcn || "").trim() || undefined
      );
      if (!key) return;
      if (!stockHints.has(key)) {
        stockHints.set(key, {
          stockId: String(stockId || "").trim() || undefined,
          bcn: String(bcn || "").trim() || undefined,
        });
      }
      addInventoryDelta(stockDeltas, key, delta);
    };

    const registerLengthDelta = (
      stockId: unknown,
      bcn: unknown,
      lengthId: unknown,
      delta: InventoryDelta
    ) => {
      const safeLengthId = String(lengthId || "").trim();
      if (!safeLengthId) return;
      const stockKey = buildStockKey(
        String(stockId || "").trim() || undefined,
        String(bcn || "").trim() || undefined
      );
      if (!stockKey) return;
      registerStockDelta(stockId, bcn, {});
      const key = `${stockKey}::${safeLengthId}`;
      const existing = lengthDeltas.get(key);
      if (!existing) {
        lengthDeltas.set(key, { stockKey, lengthId: safeLengthId, delta: { ...delta } });
        return;
      }
      existing.delta = {
        availableQty: (existing.delta.availableQty || 0) + (delta.availableQty || 0),
        availableLength: (existing.delta.availableLength || 0) + (delta.availableLength || 0),
        reservedQty: (existing.delta.reservedQty || 0) + (delta.reservedQty || 0),
        cutQty: (existing.delta.cutQty || 0) + (delta.cutQty || 0),
      };
    };

    const registerReservationTarget = (
      stockId: unknown,
      bcn: unknown,
      lengthId: unknown,
      orderId: string
    ) => {
      const safeLengthId = String(lengthId || "").trim();
      if (!safeLengthId || !orderId) return;
      const stockKey = buildStockKey(
        String(stockId || "").trim() || undefined,
        String(bcn || "").trim() || undefined
      );
      if (!stockKey) return;
      const key = `${stockKey}::${safeLengthId}::${orderId}`;
      reservationCleanupTargets.set(key, { stockKey, lengthId: safeLengthId, orderId });
    };

    let invoicesDeleted = 0;
    let ordersDeleted = 0;
    let dealOrdersDeleted = 0;
    let allocationReservationsDeleted = 0;

    const MAX_BATCH_OPS = 400;
    let batch = adminDb.batch();
    let pendingOps = 0;

    const flushBatch = async () => {
      if (pendingOps === 0) return;
      await batch.commit();
      batch = adminDb.batch();
      pendingOps = 0;
    };

    const queueDelete = async (docRef: FirebaseFirestore.DocumentReference) => {
      batch.delete(docRef);
      pendingOps += 1;
      if (pendingOps >= MAX_BATCH_OPS) {
        await flushBatch();
      }
    };

    const queueUpdate = async (
      docRef: FirebaseFirestore.DocumentReference,
      data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>
    ) => {
      batch.update(docRef, data);
      pendingOps += 1;
      if (pendingOps >= MAX_BATCH_OPS) {
        await flushBatch();
      }
    };

    for (const [orderId, orderDocSnap] of orderDocs.entries()) {
      if (!orderDocSnap.exists) continue;
      const orderData = orderDocSnap.data() as Order;

      const invoiceSnapshot = await adminDb.collection("invoices").where("orderId", "==", orderId).get();
      for (const invoiceDoc of invoiceSnapshot.docs) {
        const invoiceData = invoiceDoc.data() as any;
        const normalItems = Array.isArray(invoiceData?.sections?.NORMAL?.items)
          ? invoiceData.sections.NORMAL.items
          : [];

        normalItems.forEach((item: any) => {
          const qty = toPositiveNumber(item?.qty);
          if (qty <= 0) return;
          const stockItemId = String(item?.allocationRef?.stockItemId || "").trim() || undefined;
          const bcn = String(item?.bcn || "").trim() || undefined;
          registerStockDelta(stockItemId, bcn, { reservedQty: qty, cutQty: -qty });

          const lengthId = String(item?.allocationRef?.lengthId || "").trim();
          if (lengthId && !lengthId.startsWith("MIG-LEN-")) {
            registerLengthDelta(stockItemId, bcn, lengthId, {
              reservedQty: qty,
              cutQty: -qty,
            });
          }
        });

        await queueDelete(invoiceDoc.ref);
        invoicesDeleted += 1;
      }

      const normalOrderItems = Array.isArray(orderData?.sections?.NORMAL?.items)
        ? orderData.sections?.NORMAL?.items || []
        : Array.isArray((orderData as any)?.items)
        ? (orderData as any).items
        : [];

      normalOrderItems.forEach((item: any) => {
        const bcn = String(item?.bcn || item?.collectionBrand || "").trim() || undefined;
        const stockItemId =
          String(
            item?.stockId || item?.stockItemId || item?.allocation?.stockItemId || ""
          ).trim() || undefined;
        const allocation = item?.allocation || {};
        const lengths = Array.isArray(allocation?.lengths) ? allocation.lengths : [];
        const lots = Array.isArray(allocation?.lots) ? allocation.lots : [];

        let allocatedTotal = 0;

        lengths.forEach((entry: any) => {
          const lengthId = String(entry?.lengthId || "").trim();
          const allocatedQty = toPositiveNumber(entry?.allocatedQty ?? entry?.qty ?? entry?.quantity);
          if (!lengthId || allocatedQty <= 0) return;
          allocatedTotal += allocatedQty;
          registerLengthDelta(stockItemId, bcn, lengthId, {
            availableQty: allocatedQty,
            availableLength: allocatedQty,
            reservedQty: -allocatedQty,
          });
          registerReservationTarget(stockItemId, bcn, lengthId, orderId);
        });

        lots.forEach((entry: any) => {
          const allocatedQty = toPositiveNumber(entry?.allocatedQty ?? entry?.qty ?? entry?.quantity);
          if (allocatedQty <= 0) return;
          allocatedTotal += allocatedQty;
        });

        if (allocatedTotal > 0) {
          registerStockDelta(stockItemId, bcn, {
            availableQty: allocatedTotal,
            reservedQty: -allocatedTotal,
          });
        }
      });

      const dealOrdersRef = dealRef.collection("orders");
      const dealOrderRefs = new Map<string, FirebaseFirestore.DocumentReference>();

      const dealOrderDocId = String(orderData?.dealOrderDocId || "").trim();
      if (dealOrderDocId) {
        const dealOrderSnap = await dealOrdersRef.doc(dealOrderDocId).get();
        if (dealOrderSnap.exists) {
          dealOrderRefs.set(dealOrderSnap.id, dealOrderSnap.ref);
        }
      }

      const orderNo = String(orderData?.orderNo || orderId).trim();
      const dealOrderQueryPromises: Promise<FirebaseFirestore.QuerySnapshot>[] = [
        dealOrdersRef.where("orderId", "==", orderId).get(),
      ];

      if (orderNo) {
        dealOrderQueryPromises.push(dealOrdersRef.where("orderNo", "==", orderNo).get());
      }

      const dealOrderQueryResults = await Promise.all(dealOrderQueryPromises);
      dealOrderQueryResults.forEach((snapshot) => {
        snapshot.forEach((docSnap) => dealOrderRefs.set(docSnap.id, docSnap.ref));
      });

      for (const dealOrderRef of dealOrderRefs.values()) {
        await queueDelete(dealOrderRef);
        dealOrdersDeleted += 1;
      }

      await queueDelete(orderDocSnap.ref);
      ordersDeleted += 1;
    }

    const stockRefCache = new Map<string, FirebaseFirestore.DocumentReference | null>();
    const resolveStockRef = async (stockKey: string) => {
      if (stockRefCache.has(stockKey)) return stockRefCache.get(stockKey) || null;
      const hint = stockHints.get(stockKey);
      if (!hint) {
        stockRefCache.set(stockKey, null);
        return null;
      }

      const stocksRef = adminDb.collection("stocks");
      const stockId = String(hint.stockId || "").trim();
      if (stockId) {
        const stockDoc = await stocksRef.doc(stockId).get();
        if (stockDoc.exists) {
          stockRefCache.set(stockKey, stockDoc.ref);
          return stockDoc.ref;
        }
      }

      const bcn = String(hint.bcn || "").trim();
      if (bcn) {
        const sanitizedDocId = sanitizeStockDocId(bcn);
        if (sanitizedDocId) {
          const docBySanitizedId = await stocksRef.doc(sanitizedDocId).get();
          if (docBySanitizedId.exists) {
            stockRefCache.set(stockKey, docBySanitizedId.ref);
            return docBySanitizedId.ref;
          }
        }

        const stockByBcnSnapshot = await stocksRef.where("bcn", "==", bcn).limit(1).get();
        if (!stockByBcnSnapshot.empty) {
          const resolvedRef = stockByBcnSnapshot.docs[0].ref;
          stockRefCache.set(stockKey, resolvedRef);
          return resolvedRef;
        }
      }

      stockRefCache.set(stockKey, null);
      return null;
    };

    const updateTimestamp = new Date().toISOString();

    for (const [stockKey, delta] of stockDeltas.entries()) {
      if (!hasDelta(delta)) continue;
      const stockRef = await resolveStockRef(stockKey);
      if (!stockRef) continue;
      const payload: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        lastUpdatedAt: updateTimestamp,
      };
      if (Math.abs(delta.availableQty || 0) > DELTA_EPSILON) {
        payload.availableQty = FieldValue.increment(delta.availableQty || 0);
      }
      if (Math.abs(delta.reservedQty || 0) > DELTA_EPSILON) {
        payload.reservedQty = FieldValue.increment(delta.reservedQty || 0);
      }
      if (Math.abs(delta.cutQty || 0) > DELTA_EPSILON) {
        payload.cutQty = FieldValue.increment(delta.cutQty || 0);
      }
      await queueUpdate(stockRef, payload);
    }

    for (const target of lengthDeltas.values()) {
      if (!hasDelta(target.delta)) continue;
      const stockRef = await resolveStockRef(target.stockKey);
      if (!stockRef) continue;

      const lengthRef = stockRef.collection("lengths").doc(target.lengthId);
      const lengthSnap = await lengthRef.get();
      if (!lengthSnap.exists) continue;

      const payload: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        lastUpdatedAt: updateTimestamp,
      };
      if (Math.abs(target.delta.availableQty || 0) > DELTA_EPSILON) {
        payload.availableQty = FieldValue.increment(target.delta.availableQty || 0);
      }
      if (Math.abs(target.delta.availableLength || 0) > DELTA_EPSILON) {
        payload.availableLength = FieldValue.increment(target.delta.availableLength || 0);
      }
      if (Math.abs(target.delta.reservedQty || 0) > DELTA_EPSILON) {
        payload.reservedQty = FieldValue.increment(target.delta.reservedQty || 0);
      }
      if (Math.abs(target.delta.cutQty || 0) > DELTA_EPSILON) {
        payload.cutQty = FieldValue.increment(target.delta.cutQty || 0);
      }
      await queueUpdate(lengthRef, payload);
    }

    for (const target of reservationCleanupTargets.values()) {
      const stockRef = await resolveStockRef(target.stockKey);
      if (!stockRef) continue;
      const lengthRef = stockRef.collection("lengths").doc(target.lengthId);
      const reservedSnapshot = await lengthRef.collection("reservedQty").where("orderId", "==", target.orderId).get();
      for (const reservedDoc of reservedSnapshot.docs) {
        await queueDelete(reservedDoc.ref);
        allocationReservationsDeleted += 1;
      }
    }

    await queueDelete(quotationRef);
    await flushBatch();

    const summary = {
      ordersDeleted,
      dealOrdersDeleted,
      invoicesDeleted,
      allocationReservationsDeleted,
    };

    const label = quotationNo || quotationId;
    return {
      success: true,
      message: `Quotation ${label} deleted. Removed ${ordersDeleted} order(s), ${dealOrdersDeleted} deal-order record(s), ${invoicesDeleted} invoice(s), and ${allocationReservationsDeleted} allocation reservation record(s).`,
      summary,
    };
  } catch (error: any) {
    console.error("Error deleting quotation with cascade:", error);
    return { success: false, message: `Failed to delete quotation: ${error.message}` };
  }
}

export async function getOrdersForDeal(customerId: string, dealId: string): Promise<DealOrder[]> {
    try {
        const snapshot = await adminDb
            .collection('customers')
            .doc(customerId)
            .collection('deals')
            .doc(dealId)
            .collection('orders')
            .orderBy('orderDate', 'desc')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DealOrder));
        return JSON.parse(JSON.stringify(orders));
    } catch (error) {
        console.error("Error fetching orders:", error);
        return [];
    }
}


export async function addVisitAction(
  customerId: string,
  dealId: string,
  visitData: Omit<VisitFormValues, 'date'> & { typeOfVisit: string, orderId?: string },
  creatorName: string
): Promise<{ success: boolean; message: string; visit?: DealVisit, whatsAppUrl?: string }> {
  try {
    console.log("🟡 addVisitAction STARTED");
    console.log("➡ incoming visitData:", visitData);

    // Fetch customer
    const customerRef = adminDb.collection('customers').doc(customerId);
    const customerSnap = await customerRef.get();
    if (!customerSnap.exists) {
      return { success: false, message: "Customer not found." };
    }
    const customerData = customerSnap.data() as any;

    // Fetch deal
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const dealSnap = await dealRef.get();
    const dealData = dealSnap.data() as Deal;

    console.log("🟢 LOADED DEAL:", dealData);

    // ⭐ FIXED SELECTION-ID LOGIC ⭐
    let finalSelectionId: string | null = null;

    if (visitData.selectionId && visitData.selectionId !== "none") {
      finalSelectionId = visitData.selectionId;
      console.log("🎯 Using selectionId from UI:", finalSelectionId);
    } else if (dealData?.latestSelectionId) {
      finalSelectionId = dealData.latestSelectionId;
      console.log("🎯 Using latestSelectionId from deal:", finalSelectionId);
    } else {
      finalSelectionId = "none";
      console.log("🚫 No selection found → storing 'none'");
    }

    const visitsRef = dealRef.collection('visits');
    const newVisitRef = visitsRef.doc();

    const nowIso = new Date().toISOString();
    const visitNo = buildVisitNo(undefined, nowIso);
    const repId =
      visitData.representative ||
      dealData?.assignedSalesPerson?.id ||
      dealData?.representativeId;
    const repName =
      dealData?.assignedSalesPerson?.name ||
      (await resolveUserName(repId));

    const assignedSalesPerson = stripUndefined({
      id: repId,
      name: repName,
    });
    const assignedSalesPersonPayload =
      Object.keys(assignedSalesPerson).length > 0 ? assignedSalesPerson : undefined;

    const customerSnapshot = stripUndefined({
      id: customerId,
      name: customerData?.name || "",
      phone: customerData?.phone || customerData?.mobileNo || "",
      address:
        customerData?.billingAddress?.line1 ||
        customerData?.addressPinCode ||
        customerData?.address ||
        "",
      customerType: customerData?.customerType,
    });
    const customerSnapshotPayload =
      Object.keys(customerSnapshot).length > 0 ? customerSnapshot : undefined;

    const dealSnapshot = stripUndefined({
      dealCode: dealData?.dealCode,
      title: dealData?.title || dealData?.dealName || "",
    });
    const dealSnapshotPayload =
      Object.keys(dealSnapshot).length > 0 ? dealSnapshot : undefined;

    const location = stripUndefined({
      address:
        visitData.customerAddress ||
        customerData?.billingAddress?.line1 ||
        customerData?.addressPinCode ||
        customerData?.address ||
        undefined,
    });
    const locationPayload = Object.keys(location).length > 0 ? location : undefined;

    const slotDate = getDateOnly(visitData.dueDate);
    const assignmentSlot = stripUndefined({
      date: slotDate,
    });
    const assignment = stripUndefined({
      slot: Object.keys(assignmentSlot).length > 0 ? assignmentSlot : undefined,
    });
    const assignmentPayload =
      Object.keys(assignment).length > 0 ? assignment : undefined;

    const purpose = deriveVisitPurpose(visitData.typeOfVisit);

    const updates = [
      stripUndefined({
        updatedAt: nowIso,
        updatedBy: { name: creatorName },
        action: "CREATED",
        message: `Visit created${visitData.typeOfVisit ? ` (${visitData.typeOfVisit})` : ""}.`,
      }),
    ];

    // ⭐ FULL visit object (with selectionId FIXED)
    const newVisit: Omit<DealVisit, 'id'> = {
      visitId: newVisitRef.id,
      visitNo,
      customerId,
      dealId: dealData?.dealId || dealId,
      customerSnapshot: customerSnapshotPayload,
      dealSnapshot: dealSnapshotPayload,
      assignedSalesPerson: assignedSalesPersonPayload,
      visitType: normalizeVisitType(visitData.typeOfVisit) || visitData.typeOfVisit,
      purpose,
      assignment: assignmentPayload,
      location: locationPayload,
      updates,
      updatedAt: nowIso,
      representative: visitData.representative,
      typeOfVisit: visitData.typeOfVisit,
      createdAt: nowIso,
      createdBy: creatorName,

      // ⭐ CRITICAL FIELD ADDED
      selectionId: finalSelectionId ?? undefined,


      measurements: visitData.measurements || [],
      blinds: visitData.blinds || [],
      curtain: visitData.curtain || [],
      otherCurtain: visitData.otherCurtain || "",

      deliveryInstallations: (visitData.deliveryInstallations || [])
        .filter(Boolean) as DeliveryInstallationItem[],

      subDeliveryInstallations: (visitData.subDeliveryInstallations || [])
        .filter(Boolean) as DeliveryInstallationItem[],

      otherDelivery: visitData.otherDelivery || "",

      dealId: dealData.dealId,
      status: "approved",          // your existing workflow
      orderId: visitData.orderId ?? undefined,
      remark: visitData.remark ?? undefined,


      // ⭐ REQUIRED EMPTY dueDate (your schema requires it)
      dueDate: visitData.dueDate ?? "",
    };

    console.log("🧩 FINAL VISIT SAVING:", newVisit);

    const batch = adminDb.batch();
    batch.set(newVisitRef, newVisit);

    // Delivery logic (unchanged)
    if (visitData.typeOfVisit === "delivery") {
      const o2dProcessRef = adminDb.collection('o2d').doc(dealId);
      const o2dProcessDoc = await o2dProcessRef.get();
      if (o2dProcessDoc.exists) {
        const existingMilestones = dedupeO2DMilestones(
          (o2dProcessDoc.data()?.milestones || []) as O2DStatus[]
        );
        const newMilestone: O2DStatus = {
          stepId: 12,
          status: "completed",
          completedAt: new Date().toISOString(),
          completedBy: creatorName,
          remarks: `Direct delivery visit created for order ${visitData.orderId || 'N/A'}.`,
          selection: "Done",
        };
        batch.update(o2dProcessRef, {
          milestones: upsertO2DMilestone(existingMilestones, newMilestone),
        });
      }
    }

    await batch.commit();

    const savedVisit: DealVisit = {
      id: newVisitRef.id,
      ...newVisit,
    };

    // Create WhatsApp link
    const confirmationLink = `https://mo-track-yerq.vercel.app/visit/confirm/${newVisitRef.id}?customerId=${customerId}&dealId=${dealId}`;

    const smsMessage = `Dear ${customerData.name},
Please confirm your visit from Mo Design Pvt. Ltd.:
${confirmationLink}`;

    const smsResult = await sendVisitSms(customerData.phone || customerData.mobileNo || "", smsMessage);

    return {
      success: true,
      message: "Visit request created successfully",
      visit: JSON.parse(JSON.stringify(savedVisit)),
      whatsAppUrl: smsResult.link,
    };
  } catch (error: any) {
    console.error("❌ ERROR addVisitAction:", error);
    return { success: false, message: error.message };
  }
}



export async function getVisitsForDeal(customerId: string, dealId: string): Promise<DealVisit[]> {
    try {
        const snapshot = await adminDb
            .collection('customers')
            .doc(customerId)
            .collection('deals')
            .doc(dealId)
            .collection('visits')
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            return []; // NOT NULL
        }

        const visits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DealVisit));
        return JSON.parse(JSON.stringify(visits));

    } catch (error) {
        console.error("Error fetching visits:", error);
        return []; // NEVER return null
    }
}


export async function addMeasurementAction(
  customerId: string,
  dealId: string,
  visitId: string,
  measurementData: Omit<DealMeasurement, 'id' | 'createdAt' | 'createdBy'>,
  creatorName: string,
  pdfUrl: string
): Promise<{ success: boolean; message: string; measurement?: DealMeasurement }> {
    try {
        const batch = adminDb.batch();
        
        const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
        const measurementsRef = dealRef.collection('measurements');
        const newMeasurementRef = measurementsRef.doc();
        
        const newMeasurementForDb: Omit<DealMeasurement, 'id'> = {
            ...measurementData,
            createdAt: new Date().toISOString(),
            createdBy: creatorName,
            pdfUrl: pdfUrl,
        };
        
        batch.set(newMeasurementRef, newMeasurementForDb);

        // Update the visit document with status and PDF URL
        const visitRef = dealRef.collection('visits').doc(visitId);
        batch.update(visitRef, {
            status: 'completed',
            measurementPdfUrl: pdfUrl,
            updatedAt: new Date().toISOString(),
        });

        // Update the O2D process if it's the first measurement for this deal
        const o2dProcessRef = adminDb.collection('o2d').doc(dealId);
        const o2dProcessDoc = await o2dProcessRef.get();
        
        if (o2dProcessDoc.exists) {
            const measurementStepId = 2; // Corresponds to "Measurement"
            const existingMilestones = dedupeO2DMilestones(
                (o2dProcessDoc.data()?.milestones || []) as O2DStatus[]
            );
            
            if (!existingMilestones.some(m => m.stepId === measurementStepId)) {
                const newMilestone: O2DStatus = {
                    stepId: measurementStepId,
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    completedBy: creatorName,
                    remarks: `Measurement recorded. PDF: ${pdfUrl}`,
                    selection: 'Done'
                };
                batch.update(o2dProcessRef, {
                    milestones: upsertO2DMilestone(existingMilestones, newMilestone)
                });
            }
        }
        
        await batch.commit();
        
        const savedMeasurement = { ...newMeasurementForDb, id: newMeasurementRef.id };

        return { success: true, message: "Measurement added successfully.", measurement: JSON.parse(JSON.stringify(savedMeasurement)) };
    } catch (error: any) {
        console.error("Error adding measurement:", error);
        return { success: false, message: `Server error: ${error.message}` };
    }
}


export async function getMeasurementsForDeal(customerId: string, dealId: string) {
  try {
    const ref = adminDb
      .collection("customers")
      .doc(customerId)
      .collection("deals")
      .doc(dealId)
      .collection("measurements")
      .orderBy("createdAt", "desc");

    const snapshot = await ref.get();

    const measurements = snapshot.docs.map(doc => {
      const data = doc.data();

      return {
        id: doc.id,
        typeOf: data.typeOf || "-",
        doerName: data.doerName || data.createdBy || "-",
        createdBy: data.createdBy || "-",
        createdAt: data.createdAt || null,
        entries: data.entries || [],
        rooms: data.rooms || [],
        selectionId: data.selectionId || null,       // ←🔥 IMPORTANT
        status: data.status || "unknown",            // ←🔥 IMPORTANT
        flags: data.flags || [],                     // ←🔥 OPTIONAL
        pdfUrl: data.pdfUrl || null
      };
    });

    return measurements;
  } catch (err) {
    console.error("❌ ERROR getMeasurementsForDeal:", err);
    return [];
  }
}


export async function addCpdAction(
  customerId: string,
  dealId: string,
  cpdData: CpdFormValues,
  creatorName: string
): Promise<{ success: boolean; message: string; cpd?: Cpd }> {
  try {
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const cpdsRef = dealRef.collection('cpds');
    
    // Generate a unique 4-digit cpdId
    let newCpdId: string;
    let isUnique = false;
    do {
      newCpdId = Math.floor(1000 + Math.random() * 9000).toString();
      const existingCpdQuery = cpdsRef.where('cpdId', '==', newCpdId);
      const snapshot = await existingCpdQuery.get();
      if (snapshot.empty) {
        isUnique = true;
      }
    } while (!isUnique);

    // Normalize to satisfy Cpd types (ids required, arrays normalized)
    const normalizeCpd = (data: CpdFormValues): Omit<Cpd, "id" | "cpdId" | "createdAt" | "createdBy"> => ({
      representative: data.representative,
      customerName: data.customerName,
      telNo: data.telNo,
      date: data.date,
      rooms: (data.rooms || []).map((room) => ({
        room: room.room,
        items: (room.items || []).map((item) => ({
          itemName: item.itemName,
          type: item.type,
          qty: item.qty,
          rate: item.rate,
          dis: item.dis,
          amount: item.amount,
          fabricType: item.fabricType,
          hasDimension: item.hasDimension,
          hasStitchDimension: item.hasStitchDimension,
          dimensions: (item.dimensions || []).map((d) => ({
            id: d.id ?? `${Date.now()}-${Math.random()}`,
            length: d.length,
            width: d.width,
            type: Array.isArray(d.type) ? d.type : d.type ? [d.type] : [],
            advanceDetails: (d.advanceDetails || []).map((a) => ({
              id: a.id ?? `${Date.now()}-${Math.random()}`,
              name: a.name,
              pcs: a.pcs,
              imageUrl: (a as any).imageUrl ?? (a as any).img ?? undefined,
            })),
          })),
          stitchDimensions: (item.stitchDimensions || []).map((s) => ({
            id: s.id ?? `${Date.now()}-${Math.random()}`,
            vas: s.vas,
            lengths: s.lengths,
            width: s.width,
            operation: s.operation,
            noOfPanels: s.noOfPanels,
            remark: s.remark,
          })),
        })),
      })),
    });

    const newCpdRef = cpdsRef.doc();
    const normalized = normalizeCpd(cpdData);
    const fullCpdData: Omit<Cpd, 'id'> = {
      representative: normalized.representative,
      customerName: normalized.customerName,
      telNo: normalized.telNo,
      date: normalized.date,
      rooms: normalized.rooms,
      cpdId: newCpdId,
      createdAt: new Date().toISOString(),
      createdBy: creatorName,
    };
    
    const batch = adminDb.batch();
    batch.set(newCpdRef, fullCpdData);
    
    // Update the O2D process
    const o2dProcessRef = adminDb.collection('o2d').doc(dealId);
    const o2dProcessDoc = await o2dProcessRef.get();
    
    if (o2dProcessDoc.exists) {
        const finalSelectionStepId = 3; // Corresponds to "Final Material Selection"
         const existingMilestones = dedupeO2DMilestones(
            (o2dProcessDoc.data()?.milestones || []) as O2DStatus[]
         );
        
        if (!existingMilestones.some(m => m.stepId === finalSelectionStepId)) {
            const newMilestone: O2DStatus = {
                stepId: finalSelectionStepId,
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: creatorName,
                remarks: `CPD #${newCpdId} created for this deal.`,
                selection: 'Done'
            };
            batch.update(o2dProcessRef, {
                milestones: upsertO2DMilestone(existingMilestones, newMilestone)
            });
        }
    }
    
    await batch.commit();

    const savedCpd = { ...fullCpdData, id: newCpdRef.id };

    return { success: true, message: 'CPD saved successfully and material selection marked as complete.', cpd: JSON.parse(JSON.stringify(savedCpd)) };
  } catch (error: any) {
    console.error('Error saving CPD:', error);
    return { success: false, message: `Failed to save CPD: ${error.message}` };
  }
}

export async function getCpdsForDeal(customerId: string, dealId: string): Promise<Cpd[]> {
    try {
        const snapshot = await adminDb
            .collection('customers')
            .doc(customerId)
            .collection('deals')
            .doc(dealId)
            .collection('cpds')
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const cpds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cpd));
        return JSON.parse(JSON.stringify(cpds));
    } catch (error) {
        console.error("Error fetching CPDs:", error);
        return [];
    }
}

export async function createSelectionAction(customerId: string, dealId: string, products: DealProduct[], creatorName: string): Promise<{ success: boolean; message: string; selection?: Selection }> {
    try {
      const selectionsRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId).collection('selections');
  
      let selectionId: string;
      let isUnique = false;
      do {
        selectionId = Math.floor(1000 + Math.random() * 9000).toString();
        const existingDoc = await selectionsRef.doc(selectionId).get();
        if (!existingDoc.exists) {
          isUnique = true;
        }
      } while (!isUnique);
      
      const fullProducts = products.map(p => ({
        ...p,
        id: p.id || `${Date.now()}-${Math.random()}` // ensure every product has id
      }));

      
      const totalMrp = products.reduce((sum, p) => sum + ((Number(p.quantity) || 0) * (Number(p.mrp) || 0)), 0);
      const totalPcs = products.reduce((sum, p) => sum + (Number(p.noOfPcs) || 1), 0);
      const totalRooms = new Set(products.map(p => p.room)).size;
  
      const newSelection: Selection = {
        id: selectionId,
        products: fullProducts,
        createdAt: new Date().toISOString(),
        createdBy: creatorName,
        totalMrp: totalMrp,
        totalPcs: totalPcs,
        totalRooms: totalRooms,
        status: 'draft',
      };
  
      await selectionsRef.doc(selectionId).set(newSelection);
  
      return { 
        success: true, 
        message: 'Selection created successfully!', 
        selection: JSON.parse(JSON.stringify(newSelection))
      };
  
    } catch (error: any) {
      console.error("Error creating selection:", error);
      return { success: false, message: `Failed to create selection: ${error.message}` };
    }
  }

export async function getProductsByIds(productIds: string[]): Promise<DealProduct[]> {
    // In a real application, you would query your database for products with these IDs.
    // Since the products are part of the deal document, we can't query them directly.
    // This function is a placeholder and would need a better data model to work efficiently.
    // For now, we will return an empty array.
    console.warn("getProductsByIds is a placeholder and not implemented efficiently.");
    return [];
}


export async function getSelectionsForDeal(customerId: string, dealId: string): Promise<Selection[]> {
    try {
        const snapshot = await adminDb
            .collection('customers')
            .doc(customerId)
            .collection('deals')
            .doc(dealId)
            .collection('selections')
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const selections = snapshot.docs.map(doc => doc.data() as Selection);
        return JSON.parse(JSON.stringify(selections));
    } catch (error) {
        console.error("Error fetching selections:", error);
        return [];
    }
}

export async function updateSelectionStatusAction(
  customerId: string,
  dealId: string,
  selectionId: string,
  status: 'draft' | 'final'
): Promise<{ success: boolean; message: string }> {
  try {
    const selectionRef = adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('selections')
      .doc(selectionId);

    await selectionRef.update({ status });

    return { success: true, message: `Selection status updated to ${status}.` };
  } catch (error: any) {
    console.error('Error updating selection status:', error);
    return { success: false, message: 'Failed to update selection status.' };
  }
}

export async function getSelectionById(
  customerId: string,
  dealId: string,
  selectionId: string
) {
  try {
    const ref = adminDb
      .collection("customers")
      .doc(customerId)
      .collection("deals")
      .doc(dealId)
      .collection("selections")
      .doc(selectionId);

    const snap = await ref.get();

    if (!snap.exists) return null;

    return JSON.parse(JSON.stringify({ id: snap.id, ...snap.data() }));
  } catch (e) {
    console.log("🔥 Error fetching selection:", e);
    return null;
  }
}


//////////////////////////////////////////////// UPDATE BLINDS ACTION (ADMIN MODE) ///////

export async function updateBlindsAction({
  customerId,
  dealId,
  selectionId,
  roomName,
  blinds
}: {
  customerId: string;
  dealId: string;
  selectionId: string;
  roomName: string;
  blinds: any[];
}) {
  console.log("=======================================");
  console.log("🔥 updateBlindsAction called (ADMIN MODE)");
  console.log("customerId:", customerId);
  console.log("dealId:", dealId);
  console.log("selectionId:", selectionId);
  console.log("roomName:", roomName);
  console.log("incoming blinds:", blinds);

  try {
    if (!selectionId) {
      console.log("❌ Selection ID missing");
      return { success: false, error: "Selection ID missing" };
    }

    // ------------------------------------------------
    // ✅ ADMIN FIRESTORE REF (bypasses all rules)
    // ------------------------------------------------
    const selectionRef = adminDb
      .collection("customers")
      .doc(customerId)
      .collection("deals")
      .doc(dealId)
      .collection("selections")
      .doc(selectionId);

    console.log("📌 selectionRef path:", selectionRef.path);

    // ------------------------------------------------
    // ✅ FETCH CURRENT SELECTION DOCUMENT
    // ------------------------------------------------
    const snap = await selectionRef.get();

    if (!snap.exists) {
      console.log("❌ Selection NOT FOUND");
      return { success: false, error: "Selection not found" };
    }

    const selectionData = snap.data() || {};
    const existingProducts = selectionData.products || [];

    console.log("📄 CURRENT PRODUCTS:", existingProducts);

    // ------------------------------------------------
    // 1️⃣ UPDATE EXISTING BLINDS
    // ------------------------------------------------
    const updatedExisting = existingProducts.map((prod: any) => {
      const match = blinds.find((b) => b.id === prod.id);

      if (match) {
        console.log(`🟢 MATCH FOUND → Updating product: ${prod.id}`);

        return {
          ...prod,
          ...match, // copy all blind fields
          room: roomName,
          isBlind: true
        };
      }

      console.log(`⏭ Skipping (no match): ${prod.id}`);
      return prod;
    });

    // ------------------------------------------------
    // 2️⃣ DETECT NEW BLINDS (NOT PRESENT IN FIRESTORE)
    // ------------------------------------------------
    const newBlinds = blinds.filter(
      (b) => !existingProducts.some((p: any) => p.id === b.id)
    );

    console.log("🟡 NEW BLINDS TO ADD:", newBlinds);

    // Attach defaults for new blinds
    const formattedNewBlinds = newBlinds.map((b) => ({
      ...b,
      isBlind: true,
      room: roomName,
      salesDescription: "",
      collectionBrand: b.shadeNo || "",
      quantity: "0",
      remarks: ""
    }));

    // ------------------------------------------------
    // 3️⃣ FINAL PRODUCT LIST
    // ------------------------------------------------
    const finalProducts = [...updatedExisting, ...formattedNewBlinds];

    console.log("🧩 FINAL PRODUCT LIST TO SAVE:", finalProducts);

    // ------------------------------------------------
    // 4️⃣ SAVE TO FIRESTORE
    // ------------------------------------------------
    console.log("📤 Writing updated product data to Firestore...");

    await selectionRef.update({
      products: finalProducts
    });

    console.log("✅ BLIND UPDATE SUCCESS");
    console.log("=======================================");

    return { success: true };

  } catch (err: any) {
    console.log("❌ updateBlindsAction ERROR:", err);
    console.log("=======================================");
    return { success: false, error: err.message };
  }
}

//////////////////////////////////update SOfa Action///////////////////
export async function updateSofasAction({
  customerId,
  dealId,
  selectionId,
  roomName,
  sofas
}: {
  customerId: string;
  dealId: string;
  selectionId: string;
  roomName: string;
  sofas: any[];
}) {
  console.log("=======================================");
  console.log("🔥 updateSofasAction CALLED");
  console.log("incoming sofas:", sofas);

  try {
    const selectionRef = adminDb
      .collection("customers")
      .doc(customerId)
      .collection("deals")
      .doc(dealId)
      .collection("selections")
      .doc(selectionId);

    const snap = await selectionRef.get();

    if (!snap.exists) {
      return { success: false, error: "Selection not found" };
    }

    const selectionData = snap.data() || {};
    const existingProducts = selectionData.products || [];

    console.log("📄 Current Products Count:", existingProducts.length);

    // ----------------------------
    // 🔥 UPDATE OR ADD SOFAS
    // ----------------------------
    const updatedProducts = [...existingProducts];

    sofas.forEach((sofa) => {
      const existingIndex = updatedProducts.findIndex((p) => p.id === sofa.id);

      const sofaData = {
        id: sofa.id,
        isSofa: true,
        room: roomName,
        itemName: sofa.itemName,
        noOfSeat: sofa.noOfSeat,
        fabricQty: sofa.fabricQty,
        stitchingRate: sofa.stitchingRate,

        foam: sofa.foam || null,
        casement: sofa.casement || null,
        marking: sofa.marking || null,

        // Default required firestore fields
        quantity: "0",
        noOfPcs: "1",
        collectionBrand: "",
        mrp: "0",
        remarks: "",
        salesDescription: "",
        verticalRepeat: "",
        horizontalRepeat: ""
      };

      if (existingIndex !== -1) {
        console.log("🟢 Updating existing sofa:", sofa.id);
        updatedProducts[existingIndex] = {
          ...updatedProducts[existingIndex],
          ...sofaData
        };
      } else {
        console.log("🟡 Adding NEW sofa:", sofa.id);
        updatedProducts.push(sofaData);
      }
    });

    // ----------------------------
    // 🔥 SAVE TO FIRESTORE
    // ----------------------------
    await selectionRef.update({
      products: updatedProducts
    });

    console.log("✅ Sofa update success");

    return { success: true };
  } catch (err: any) {
    console.log("❌ ERROR in updateSofasAction:", err);
    return { success: false, error: err.message };
  }
}

///////////////////////////Update Item Action
export async function updateItemsAction({
  customerId,
  dealId,
  selectionId,
  roomName,
  items
}: {
  customerId: string;
  dealId: string;
  selectionId: string;
  roomName: string;
  items: any[];
}) {
  console.log("=======================================");
  console.log("🔥 updateItemsAction CALLED");
  console.log("incoming items:", items);

  try {
    const selectionRef = adminDb
      .collection("customers")
      .doc(customerId)
      .collection("deals")
      .doc(dealId)
      .collection("selections")
      .doc(selectionId);

    const snap = await selectionRef.get();

    if (!snap.exists) {
      return { success: false, error: "Selection not found" };
    }

    const selectionData = snap.data() || {};
    const existingProducts = Array.isArray(selectionData.products)
      ? selectionData.products
      : [];

    console.log("📄 Current Products Count:", existingProducts.length);


    console.log("📄 Current Products Count:", existingProducts.length);

    // ----------------------------
    // CLEAN existingProducts
    // ----------------------------
    const updatedProducts = [...existingProducts];

    // ----------------------------
    // PROCESS ITEMS
    // ----------------------------
      items.forEach(item => {
        let id = item.id;

        // If item has no valid ID → generate new one
        if (!id) {
          id = adminDb.collection("_").doc().id;
        }

        // Find existing document
        const index = updatedProducts.findIndex(p => p.id === id);

        const itemData = {
          id,
          room: roomName,
          itemType: item.itemType || "",
          itemName: item.itemName || "",
          noOfPannel: item.noOfPannel || "",
          height: item.height || "",
          width: item.width || "",
          remark: item.remark || "",
          casement: item.casement || null,
          marking: item.marking || null,
          niwar: item.niwar || null,
          isBlind: false,
          isSofa: false,
          quantity: "0",
          noOfPcs: "1",
          collectionBrand: "",
          mrp: "0",
          remarks: "",
          salesDescription: "",
          verticalRepeat: "",
          horizontalRepeat: ""
        };

        if (index !== -1) {
          updatedProducts[index] = { ...updatedProducts[index], ...itemData };
        } else {
          updatedProducts.push(itemData);
        }
      });


    // ----------------------------
    // SAVE
    // ----------------------------
    await selectionRef.update({
      products: updatedProducts
    });

    console.log("✅ Items update success");

    return { success: true };
  } catch (err: any) {
    console.log("❌ ERROR in updateItemsAction:", err);
    return { success: false, error: err.message };
  }
}

//////////////////////////////////////////
// CORRECT — SAVE MEASUREMENT TO DEAL
//////////////////////////////////////////

import admin from "firebase-admin";

export async function saveMeasurementToDeal({
  customerId,
  dealId,
  visitId,
  selectionId,
  typeOf,
  doerName,
  rooms,
  itemDetails = [],
  createdBy,
  pdfUrl,
  status,
  flags,
}: {
  customerId?: string;
  dealId?: string;
  visitId?: string;
  selectionId?: string | null;
  typeOf?: string | null;
  doerName?: string | null;
  rooms: any[];
  itemDetails?: any[];
  createdBy?: string;
  pdfUrl?: string | null;
  status?: string;
  flags?: string[];
}) {
  try {
    console.log("🔥 saveMeasurementToDeal CALLED");
    console.log({ customerId, dealId, visitId, createdBy, doerName });

    const safeCreatedBy =
      (createdBy && createdBy.trim()) ||
      (doerName && doerName.trim()) ||
      "System";

    const safeStatus = status || "completed";
    const safeFlags = Array.isArray(flags) ? flags : [];

    let dealRef: FirebaseFirestore.DocumentReference | null = null;
    let visitRef: FirebaseFirestore.DocumentReference | null = null;

    if (customerId && dealId) {
      dealRef = adminDb
        .collection("customers")
        .doc(customerId)
        .collection("deals")
        .doc(dealId);

      if (visitId) {
        visitRef = dealRef.collection("visits").doc(visitId);
      }
    }

    if (!dealRef) {
      if (!visitId) throw new Error("visitId missing (cannot resolve deal)");

      const cg = await adminDb
        .collectionGroup("visits")
        .where(admin.firestore.FieldPath.documentId(), "==", visitId)
        .limit(1)
        .get();

      if (!cg.empty) {
        visitRef = cg.docs[0].ref;
        dealRef = visitRef.parent.parent || null;
      }

      if (!dealRef) {
        const direct = await adminDb.collection("visits").doc(visitId).get();
        if (direct.exists) {
          visitRef = direct.ref;

          const v = direct.data() || {};
          const cid = v.customerId;
          const did = v.dealId; 

          if (cid && did) {
            dealRef = adminDb
              .collection("customers")
              .doc(cid)
              .collection("deals")
              .doc(did);
          }
        }
      }

      if (!dealRef) {
        throw new Error(
          "Could not resolve dealRef from visitId. Visit not found in Firestore."
        );
      }
    }

    const stripPrivateKeys = (obj: any) => {
      if (!obj || typeof obj !== "object") return {};
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith("_")) continue;
        out[k] = v;
      }
      return out;
    };

    const sanitizeRooms = (rooms || []).map((room) => ({
      roomName: room.roomName || "",
      items: (room.items || []).map((item: any) => ({
        type: item.type || "",
        data: stripPrivateKeys(item.data || {}),
        remark: item.remark || "",
        photos: Array.isArray(item.photos) ? item.photos.filter(Boolean) : [],
      })),
    }));

    const safeItemDetails = Array.isArray(itemDetails)
      ? itemDetails.filter(Boolean)
      : [];

    const measurementRef = dealRef.collection("measurements").doc();

    const saveData: Record<string, any> = {
      id: measurementRef.id,
      createdAt: new Date().toISOString(),
      createdBy: safeCreatedBy,
      selectionId: selectionId ?? null,
      typeOf: typeOf ?? null,
      doerName: doerName ?? null,
      rooms: sanitizeRooms,
      itemDetails: safeItemDetails,
      status: safeStatus,
      flags: safeFlags,
    };
    if (pdfUrl) {
      saveData.pdfUrl = pdfUrl;
    }

    const batch = adminDb.batch();
    batch.set(measurementRef, saveData, { merge: true });

    if (visitRef) {
      const visitUpdate: Record<string, any> = {
        status: "completed",
        visitEndTime: new Date().toISOString(),
        measurementId: measurementRef.id,
        measurementSavedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (pdfUrl) {
        visitUpdate.measurementPdfUrl = pdfUrl;
      }

      batch.set(visitRef, visitUpdate, { merge: true });
    }

    batch.set(
      dealRef,
      {
        latestMeasurementId: measurementRef.id,
        latestMeasurementAt: new Date().toISOString(),
      },
      { merge: true }
    );

    await batch.commit();

    console.log("✅ Measurement saved:", measurementRef.path);

    return {
      success: true,
      measurementId: measurementRef.id,
      dealPath: dealRef.path,
      visitPath: visitRef?.path || null,
    };
  } catch (err: any) {
    console.error("❌ saveMeasurementToDeal ERROR:", err);
    return {
      success: false,
      error: err.message || "Failed to save measurement",
    };
  }
}


//////////////////////Inventory look Up///////////////////
export async function inventoryLookupAction({ bcnList }: { bcnList: string[] }) {
  try {
    const results: Record<string, any> = {};

    for (let raw of bcnList) {
      const bcn = String(raw || "").trim();
      console

      // ⛔ SKIP invalid BCN values
      if (
        !bcn ||
        bcn === "N/A" ||
        bcn === "-" ||
        bcn === "null" ||
        bcn === "undefined"
      ) {
        console.log("⛔ Skipping invalid BCN:", raw);
        results[bcn] = { mrp: 0 };
        continue;
      }

      try {
        const snap = await adminDb
          .collection("stocks")
          .doc(bcn)
          .get();

        if (!snap.exists) {
          console.log("⚠️ BCN not found in stocks:", bcn);
          results[bcn] = { mrp: 0 };
        } else {
          results[bcn] = snap.data();
        }
      } catch (inner) {
        console.log("🔥 Firestore error for BCN:", bcn, inner);
        results[bcn] = { mrp: 0 };
      }
    }

    return results;

  } catch (e) {
    console.log("🔥 inventoryLookupAction failed:", e);
    return {};
  }
}


/////////////////////get Selection id Action/////////////////// 

export async function getMeasurementById(customerId:string, dealId:string, measurementId:string): Promise<DealMeasurement | null> {
  console.log("SERVER getMeasurementById args:", {
    customerId,
    dealId,
    measurementId
  });

  try {
    const ref = adminDb
      .collection("customers")
      .doc(String(customerId))
      .collection("deals")
      .doc(String(dealId))
      .collection("measurements")
      .doc(String(measurementId));

    const snap = await ref.get();

    if (!snap.exists) return null;

    // It's crucial to return a plain object, not a Firestore DocumentSnapshot
    const data = { id: snap.id, ...snap.data() } as DealMeasurement;
    return JSON.parse(JSON.stringify(data));
    
  } catch (e) {
    console.log("🔥 error fetching measurement", e);
    return null;
  }
}

export async function addReceiptAction(
  customerId: string,
  dealId: string,
  receiptData: Omit<Receipt, 'id'>
): Promise<{ success: boolean; message: string }> {
  try {
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const receiptRef = dealRef.collection('receipts').doc();

    await receiptRef.set({
      ...receiptData,
      id: receiptRef.id,
    });
    
    return { success: true, message: 'Receipt added successfully.' };
  } catch (error: any) {
    console.error("Error adding receipt:", error);
    return { success: false, message: `Failed to add receipt: ${error.message}` };
  }
}

export async function getReceiptsForDeal(customerId: string, dealId: string): Promise<Receipt[]> {
  try {
      const snapshot = await adminDb
          .collection('customers')
          .doc(customerId)
          .collection('deals')
          .doc(dealId)
          .collection('receipts')
          .orderBy('date', 'desc')
          .get();

      if (snapshot.empty) {
          return [];
      }

      const receipts = snapshot.docs.map(doc => doc.data() as Receipt);
      return JSON.parse(JSON.stringify(receipts));
  } catch (error) {
      console.error("Error fetching receipts:", error);
      return [];
  }
}

export async function startVisitAction(customerId: string, dealDocId: string, visitId: string, geo?: { lat: number; lng: number; radiusM?: number }): Promise<{ success: boolean; message: string }> {
  try {
    const visitRef = adminDb.collection("customers").doc(customerId).collection("deals").doc(dealDocId).collection("visits").doc(visitId);
    const visitSnap = await visitRef.get();
    if (visitSnap.exists && !visitSnap.data()?.visitStartTime) {
      await visitRef.update({
        visitStartTime: new Date().toISOString(),
        visitStatus: "Working",
        updatedAt: new Date().toISOString(),
      });
    }
    return { success: true, message: "Visit started." };
  } catch (error: any) {
    console.error("Error starting visit:", error);
    return { success: false, message: `Failed to start visit: ${error.message}` };
  }
}
