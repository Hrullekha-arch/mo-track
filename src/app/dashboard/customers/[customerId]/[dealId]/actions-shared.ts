import { adminDb, adminStorage } from '@/lib/firebase-admin';
import {
  Deal,
  DealMeasurement,
  DealProduct,
  DealProductsDoc,
  DealVisit,
  O2DStatus,
  VisitUpdateLog,
} from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';
import { buildWorkflowMilestones } from '@/lib/order-workflow';
import { dedupeO2DMilestones, upsertO2DMilestone } from '@/lib/o2d-milestones';
import { getNextSequenceValue } from '@/lib/id-sequence';
import { upsertVasStockItemsAction } from '@/app/dashboard/inventory/actions';
import { upsertSalesmanIncentiveOrderEntry } from '@/lib/server/salesman-incentive';
import admin from 'firebase-admin';

export {
  admin,
  adminDb,
  adminStorage,
  FieldValue,
  buildWorkflowMilestones,
  dedupeO2DMilestones,
  getNextSequenceValue,
  upsertO2DMilestone,
  upsertSalesmanIncentiveOrderEntry,
  upsertVasStockItemsAction,
};

export async function sendVisitSms(customerPhone: string, message: string) {
  const whatsappLink = `https://wa.me/${customerPhone}?text=${encodeURIComponent(message)}`;
  console.log(`Generated WhatsApp link: ${whatsappLink}`);
  return { success: true, message: 'WhatsApp link generated.', link: whatsappLink };
}

const base64Marker = 'base64,';

export const normalizeBase64 = (value: string) => {
  if (!value) return '';
  const markerIndex = value.indexOf(base64Marker);
  return markerIndex >= 0 ? value.slice(markerIndex + base64Marker.length) : value;
};

export const sanitizeFileName = (value: string) => (value || 'file').replace(/[^\w.-]/g, '_');

export const stripUndefined = (value: Record<string, any>) =>
  Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined));

export const toTrimmedString = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text ? text : undefined;
};

export const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const stripUndefinedDeep = (value: any): any => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedDeep(entry)).filter((entry) => entry !== undefined);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
        .filter(([, entry]) => entry !== undefined),
    );
  }
  return value;
};

export const buildDealProductMeta = (product: DealProduct) => {
  const cloned: Record<string, any> = { ...product };
  delete cloned.file;
  delete cloned.meta;
  return stripUndefinedDeep(cloned);
};

export const toUpper = (value: unknown) => {
  const text = toTrimmedString(value);
  return text ? text.toUpperCase() : undefined;
};

export type BillingDetailsSnapshot = {
  billingName?: string;
  billingPhone?: string;
  billingAddress?: string;
  gstin?: string;
  isDefault?: boolean;
};

export const normalizeBillingDetailsSnapshot = (
  value: unknown,
): BillingDetailsSnapshot | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const normalized = stripUndefined({
    billingName: toTrimmedString(record.billingName),
    billingPhone: toTrimmedString(record.billingPhone),
    billingAddress: toTrimmedString(record.billingAddress),
    gstin: toUpper(record.gstin),
    isDefault: record.isDefault === true ? true : undefined,
  });
  const hasValues =
    Boolean(normalized.billingName) ||
    Boolean(normalized.billingPhone) ||
    Boolean(normalized.billingAddress) ||
    Boolean(normalized.gstin);
  if (!hasValues) return undefined;
  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

export const resolvePreferredBillingDetails = (
  customerData: Record<string, any>,
): BillingDetailsSnapshot | undefined => {
  const entries = Array.isArray(customerData?.billingDetails)
    ? customerData.billingDetails
        .map((entry: unknown) => normalizeBillingDetailsSnapshot(entry))
        .filter((entry): entry is BillingDetailsSnapshot => Boolean(entry))
    : [];
  if (entries.length === 0) return undefined;
  return entries.find((entry) => entry.isDefault) || entries[0];
};

export const resolveDealProductType = (product: DealProduct) => {
  const raw = toTrimmedString(product.productType || product.productSource || product.category);
  if (!raw) return 'FABRIC';
  if (raw.toUpperCase() === 'VAS') return 'VAS';
  return raw.toUpperCase();
};

export const resolveDealProductCategory = (product: DealProduct) =>
  toTrimmedString(product.categoryGroup || product.productCategory || product.category);

export const resolveDealProductGroup = (product: DealProduct) =>
  toTrimmedString(product.group || product.productSource || product.productType || product.VasType);

export const resolveDealProductDescription = (product: DealProduct) => {
  const supplierName = toTrimmedString(product.supplierCollectionName);
  const supplierCode = toTrimmedString(product.supplierCollectionCode);
  const combined = [supplierName, supplierCode].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  return (
    toTrimmedString(product.salesDescription) ||
    toTrimmedString(product.subCategory) ||
    toTrimmedString(product.itemName) ||
    toTrimmedString(product.collectionBrand)
  );
};

export const buildDealProductItem = (product: DealProduct) =>
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

export const normalizeVisitType = (value?: string) => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'measurement') return 'MEASUREMENT';
  if (normalized === 'sales') return 'SALES';
  if (normalized === 'follow_up' || normalized === 'follow up' || normalized === 'follow-up') {
    return 'FOLLOW_UP';
  }
  return value.toUpperCase().replace(/\s+/g, '_');
};

export const deriveVisitPurpose = (value?: string) => normalizeVisitType(value) || value?.trim() || 'VISIT';

export const buildVisitNo = (existing?: string, createdAt?: string) => {
  if (existing) return existing;
  const date = createdAt ? new Date(createdAt) : new Date();
  return `VIS-${date.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
};

export const getDateOnly = (value?: string) => value?.split('T')[0] || undefined;

export const resolveUserName = async (userId?: string) => {
  if (!userId) return undefined;
  try {
    const userSnap = await adminDb.collection('users').doc(userId).get();
    return userSnap.exists ? userSnap.data()?.name : undefined;
  } catch (error) {
    console.warn('Failed to resolve user name:', userId, error);
    return undefined;
  }
};

export const uploadBufferToStorage = async (
  bucket: any,
  filePath: string,
  buffer: Buffer,
  mimeType: string,
) => {
  const file = bucket.file(filePath);
  await file.save(buffer, {
    metadata: { contentType: mimeType },
    resumable: false,
    public: false,
  });
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });
  return url;
};

export const coerceNumber = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const toIsoString = (value?: string | Date | null) => {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

export const resolveOrderItemType = (item: any) => {
  const raw = String(item?.type || item?.productType || item?.bcnType || '').trim().toUpperCase();
  if (raw.includes('HARDWARE')) return 'HARDWARE';
  if (raw.includes('CHANNEL')) return 'CHANNEL';
  if (raw.includes('ACCESSORY')) return 'ACCESSORY';
  if (raw.includes('VAS')) return 'VAS';
  return 'FABRIC';
};

export const resolveOrderItemUnit = (itemType: string, item: any) => {
  const unit = String(item?.unit || item?.stockUnit || '').trim().toUpperCase();
  if (unit) return unit;
  if (itemType === 'FABRIC') return 'MTR';
  return 'PCS';
};

export const summarizeOrderItems = (
  items: Array<{ taxableAmount?: number; gstAmount?: number; totalAmount?: number }>,
) =>
  items.reduce(
    (acc, item) => {
      acc.subTotal += coerceNumber(item.taxableAmount);
      acc.gstTotal += coerceNumber(item.gstAmount);
      acc.grandTotal += coerceNumber(item.totalAmount);
      return acc;
    },
    { subTotal: 0, gstTotal: 0, grandTotal: 0 },
  );

export type DeleteQuotationActor = {
  id?: string;
  name?: string;
  role?: string;
};

export type InventoryDelta = {
  availableQty?: number;
  availableLength?: number;
  reservedQty?: number;
  cutQty?: number;
};

export const DELTA_EPSILON = 0.0001;

export const toPositiveNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const addInventoryDelta = (
  map: Map<string, InventoryDelta>,
  key: string,
  delta: InventoryDelta,
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

export const hasDelta = (delta: InventoryDelta) =>
  Math.abs(delta.availableQty || 0) > DELTA_EPSILON ||
  Math.abs(delta.availableLength || 0) > DELTA_EPSILON ||
  Math.abs(delta.reservedQty || 0) > DELTA_EPSILON ||
  Math.abs(delta.cutQty || 0) > DELTA_EPSILON;

export const buildStockKey = (stockId?: string, bcn?: string) => {
  const safeStockId = String(stockId || '').trim();
  if (safeStockId) return `id:${safeStockId}`;
  const safeBcn = String(bcn || '').trim().toUpperCase();
  return safeBcn ? `bcn:${safeBcn}` : '';
};

export const sanitizeStockDocId = (value: string) => String(value || '').trim().replace(/\//g, '-');

export const stripPrivateKeys = (obj: any) => {
  if (!obj || typeof obj !== 'object') return {};
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    out[k] = v;
  }
  return out;
};

export const sanitizeMeasurementRooms = (rooms: any[] = []) =>
  rooms.map((room) => ({
    roomName: room.roomName || '',
    items: (room.items || []).map((item: any) => ({
      type: item.type || '',
      data: stripPrivateKeys(item.data || {}),
      remark: item.remark || '',
      photos: Array.isArray(item.photos) ? item.photos.filter(Boolean) : [],
    })),
  }));

export type SaveMeasurementArgs = {
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
};
