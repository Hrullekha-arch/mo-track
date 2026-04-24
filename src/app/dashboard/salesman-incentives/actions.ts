'use server';

import { revalidatePath } from 'next/cache';

import { adminDb } from '@/lib/firebase-admin';
import type { Order, SalesmanIncentiveItem, SalesmanIncentiveOrderDoc } from '@/lib/types';
import {
  buildSalesmanIncentiveDocId,
  buildSalesmanIncentiveOrderDoc,
  getSalesmanIncentiveDashboardData,
  recomputeSalesmanIncentiveOrderDoc,
  SALESMAN_INCENTIVE_COLLECTION,
  SALESMAN_INCENTIVE_EFFECTIVE_FROM,
  SALESMAN_INCENTIVE_ORDERS_SUBCOLLECTION,
  SalesmanIncentiveDashboardData,
  upsertSalesmanIncentivePreparedOrderEntry,
} from '@/lib/server/salesman-incentive';

export async function getSalesmanIncentiveDashboardAction(): Promise<SalesmanIncentiveDashboardData> {
  return getSalesmanIncentiveDashboardData({ maxOrdersPerSalesman: 250 });
}

const SALESMAN_INCENTIVE_EFFECTIVE_FROM_MS = Date.parse(SALESMAN_INCENTIVE_EFFECTIVE_FROM);
const MANUAL_INCENTIVE_SOURCE = 'MANUAL_ADMIN_BACKFILL';
const OVERRIDE_EPSILON = 0.0001;

type SalesmanLite = {
  id: string;
  name: string;
  salesmanCode?: string;
};

export type SalesmanIncentiveSalesmanOption = {
  id: string;
  name: string;
  salesmanCode?: string;
  docId: string;
};

export type SalesmanIncentiveOrderOption = {
  orderId: string;
  orderNo?: string;
  crmOrderNo?: string;
  customerName?: string;
  customerPhone?: string;
  createdAt?: string;
  orderDate?: string;
  incentiveExists: boolean;
};

export type SalesmanIncentiveOrderPreviewResult = {
  salesman: SalesmanIncentiveSalesmanOption;
  order: SalesmanIncentiveOrderDoc;
};

type ManualLineEdit = {
  lineId: string;
  incentivePercent?: number | string;
  incentiveAmount?: number | string;
};

type ManualSaveActor = {
  id?: string;
  name?: string;
};

const toSafeString = (value: unknown) => String(value || '').trim();

const toNonNegativeNumberOrUndefined = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

const normalizeSalesmanCode = (salesmanCode?: string) => {
  const normalized = String(salesmanCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return normalized || undefined;
};

const toNormalizedToken = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '');

const getIncentiveLineFallbackKey = (line: Partial<SalesmanIncentiveItem>) => {
  const bcn = toNormalizedToken(line.bcn);
  const itemName = toNormalizedToken(line.itemName);
  if (!bcn && !itemName) return '';
  return `${bcn}|${itemName}`;
};

const resolveOrderDate = (order: Partial<Order>) =>
  String(order.createdAt || order.approvedAt || order.completedAt || '').trim();

const isOrderAfterIncentiveEffectiveDate = (order: Partial<Order>) => {
  const orderDate = resolveOrderDate(order);
  if (!orderDate) return false;
  const parsedMs = Date.parse(orderDate);
  if (!Number.isFinite(parsedMs)) return false;
  return parsedMs >= SALESMAN_INCENTIVE_EFFECTIVE_FROM_MS;
};

const isConvertedOrder = (order: Partial<Order>) =>
  Boolean(
    order.quotationId ||
      order.quotationNo ||
      order.quotationSnapshotMeta?.createdAt ||
      order.quotationSnapshotMeta?.statusAtConversion
  );

async function getSalesmanById(salesmanId: string): Promise<SalesmanLite | null> {
  const safeSalesmanId = toSafeString(salesmanId);
  if (!safeSalesmanId) return null;

  const salesmanSnap = await adminDb.collection('users').doc(safeSalesmanId).get();
  if (!salesmanSnap.exists) return null;

  const data = salesmanSnap.data() as Record<string, unknown> | undefined;
  const name = toSafeString(data?.name);
  if (!name) return null;

  return {
    id: safeSalesmanId,
    name,
    salesmanCode: normalizeSalesmanCode(String(data?.salesmanCode || '')),
  };
}

async function loadBaseIncentiveOrderDoc(
  salesman: SalesmanLite,
  orderId: string
): Promise<{
  order: Order;
  orderDoc: SalesmanIncentiveOrderDoc;
  salesmanOption: SalesmanIncentiveSalesmanOption;
}> {
  const safeOrderId = toSafeString(orderId);
  if (!safeOrderId) {
    throw new Error('Order ID is required.');
  }

  const orderSnap = await adminDb.collection('orders').doc(safeOrderId).get();
  if (!orderSnap.exists) {
    throw new Error(`Order ${safeOrderId} not found.`);
  }

  const order = { ...(orderSnap.data() as Order), id: orderSnap.id } as Order;
  if (!isOrderAfterIncentiveEffectiveDate(order)) {
    throw new Error(
      `Order ${safeOrderId} is before ${SALESMAN_INCENTIVE_EFFECTIVE_FROM}, so incentive is not applicable.`
    );
  }

  const orderSalesmanId = toSafeString(order.representativeId);
  const orderSalesmanName = toSafeString(order.salesPerson);
  if (orderSalesmanId && orderSalesmanId !== salesman.id) {
    throw new Error(`Order ${safeOrderId} is assigned to another salesman.`);
  }
  if (!orderSalesmanId && orderSalesmanName && orderSalesmanName !== salesman.name) {
    throw new Error(`Order ${safeOrderId} is assigned to another salesman.`);
  }

  const salesmanDocId = buildSalesmanIncentiveDocId(salesman.name, salesman.salesmanCode);
  const existingOrderRef = adminDb
    .collection(SALESMAN_INCENTIVE_COLLECTION)
    .doc(salesmanDocId)
    .collection(SALESMAN_INCENTIVE_ORDERS_SUBCOLLECTION)
    .doc(safeOrderId);
  const existingOrderSnap = await existingOrderRef.get();
  const rebuiltFromOrder = buildSalesmanIncentiveOrderDoc({
    order,
    salesman: {
      id: salesman.id,
      name: salesman.name,
      salesmanCode: salesman.salesmanCode,
    },
    source: MANUAL_INCENTIVE_SOURCE,
  });

  let baseOrderDoc = rebuiltFromOrder;

  if (existingOrderSnap.exists) {
    const existingOrderDoc = existingOrderSnap.data() as SalesmanIncentiveOrderDoc;
    const existingLines = Array.isArray(existingOrderDoc.fabricDetails)
      ? existingOrderDoc.fabricDetails
      : [];

    const existingByLineId = new Map<string, SalesmanIncentiveItem>();
    const existingByApprovedStockId = new Map<string, SalesmanIncentiveItem>();
    const existingByFallbackKey = new Map<string, SalesmanIncentiveItem>();

    for (const line of existingLines) {
      const safeLineId = toSafeString(line.lineId);
      if (safeLineId && !existingByLineId.has(safeLineId)) {
        existingByLineId.set(safeLineId, line);
      }

      const safeApprovedStockId = toSafeString(line.approvedStockId);
      if (safeApprovedStockId && !existingByApprovedStockId.has(safeApprovedStockId)) {
        existingByApprovedStockId.set(safeApprovedStockId, line);
      }

      const fallbackKey = getIncentiveLineFallbackKey(line);
      if (fallbackKey && !existingByFallbackKey.has(fallbackKey)) {
        existingByFallbackKey.set(fallbackKey, line);
      }
    }

    const mergedLines = rebuiltFromOrder.fabricDetails.map((line) => {
      const safeLineId = toSafeString(line.lineId);
      const safeApprovedStockId = toSafeString(line.approvedStockId);
      const fallbackKey = getIncentiveLineFallbackKey(line);

      const existingLine =
        (safeLineId ? existingByLineId.get(safeLineId) : undefined) ||
        (safeApprovedStockId ? existingByApprovedStockId.get(safeApprovedStockId) : undefined) ||
        (fallbackKey ? existingByFallbackKey.get(fallbackKey) : undefined);

      if (!existingLine) return line;

      return {
        ...line,
        approvedStockId:
          toSafeString(line.approvedStockId || existingLine.approvedStockId) || undefined,
        isInStock: typeof existingLine.isInStock === 'boolean' ? existingLine.isInStock : line.isInStock,
        stockVerifiedAt: existingLine.stockVerifiedAt,
        stockVerificationSource: existingLine.stockVerificationSource,
        manualOverride: existingLine.manualOverride,
      };
    });

    baseOrderDoc = {
      ...rebuiltFromOrder,
      sourceMeta: existingOrderDoc.sourceMeta || rebuiltFromOrder.sourceMeta,
      fabricDetails: mergedLines,
      updatedAt: existingOrderDoc.updatedAt || rebuiltFromOrder.updatedAt,
    };
  }

  const recomputedOrderDoc = recomputeSalesmanIncentiveOrderDoc({
    ...baseOrderDoc,
    orderId: safeOrderId,
    salesmanSnapshot: {
      ...baseOrderDoc.salesmanSnapshot,
      id: salesman.id,
      name: salesman.name,
      salesmanCode: salesman.salesmanCode,
    },
  });

  return {
    order,
    orderDoc: recomputedOrderDoc,
    salesmanOption: {
      id: salesman.id,
      name: salesman.name,
      salesmanCode: salesman.salesmanCode,
      docId: salesmanDocId,
    },
  };
}

export async function getSalesmanIncentiveSalesmenAction(): Promise<SalesmanIncentiveSalesmanOption[]> {
  const snapshot = await adminDb.collection('users').where('role', '==', 'salesman').get();

  const options = snapshot.docs
    .map((doc: any): SalesmanIncentiveSalesmanOption | null => {
      const data = (doc.data() || {}) as Record<string, unknown>;
      const name = toSafeString(data.name);
      if (!name) return null;
      const salesmanCode = normalizeSalesmanCode(String(data.salesmanCode || ''));
      return {
        id: doc.id,
        name,
        salesmanCode,
        docId: buildSalesmanIncentiveDocId(name, salesmanCode),
      };
    })
    .filter(
      (value: SalesmanIncentiveSalesmanOption | null): value is SalesmanIncentiveSalesmanOption =>
        value !== null
    )
    .sort(
      (a: SalesmanIncentiveSalesmanOption, b: SalesmanIncentiveSalesmanOption) =>
        a.name.localeCompare(b.name)
    );

  return options;
}

export async function getSalesmanConvertedOrdersAction(input: {
  salesmanId: string;
}): Promise<{
  success: boolean;
  message?: string;
  salesman?: SalesmanIncentiveSalesmanOption;
  orders: SalesmanIncentiveOrderOption[];
}> {
  try {
    const salesman = await getSalesmanById(input.salesmanId);
    if (!salesman) {
      return { success: false, message: 'Salesman not found.', orders: [] };
    }

    const [byRepresentative, byName] = await Promise.all([
      adminDb.collection('orders').where('representativeId', '==', salesman.id).get(),
      adminDb.collection('orders').where('salesPerson', '==', salesman.name).get(),
    ]);

    const byId = new Map<string, Order>();
    for (const snap of [...byRepresentative.docs, ...byName.docs]) {
      const order = { ...(snap.data() as Order), id: snap.id } as Order;
      byId.set(order.id, order);
    }

    const incentiveDocId = buildSalesmanIncentiveDocId(salesman.name, salesman.salesmanCode);
    const incentiveOrdersSnap = await adminDb
      .collection(SALESMAN_INCENTIVE_COLLECTION)
      .doc(incentiveDocId)
      .collection(SALESMAN_INCENTIVE_ORDERS_SUBCOLLECTION)
      .get();
    const existingIncentiveOrderIds = new Set(incentiveOrdersSnap.docs.map((doc: any) => doc.id));

    const orders = Array.from(byId.values())
      .filter((order) => isOrderAfterIncentiveEffectiveDate(order))
      .filter((order) => isConvertedOrder(order))
      .sort((a, b) => {
        const aMs = Date.parse(resolveOrderDate(a) || '0');
        const bMs = Date.parse(resolveOrderDate(b) || '0');
        return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
      })
      .map((order) => ({
        orderId: order.id,
        orderNo: toSafeString(order.orderNo) || undefined,
        crmOrderNo: toSafeString(order.crmOrderNo || order.quotationNo) || undefined,
        customerName: toSafeString(order.customerSnapshot?.name || order.customerName) || undefined,
        customerPhone:
          toSafeString(order.customerSnapshot?.phone || order.customerPhone) || undefined,
        createdAt: toSafeString(order.createdAt) || undefined,
        orderDate: resolveOrderDate(order) || undefined,
        incentiveExists: existingIncentiveOrderIds.has(order.id),
      }));

    return {
      success: true,
      salesman: {
        id: salesman.id,
        name: salesman.name,
        salesmanCode: salesman.salesmanCode,
        docId: incentiveDocId,
      },
      orders,
    };
  } catch (error: any) {
    console.error('[salesman-incentive] Failed to fetch converted orders:', error);
    return {
      success: false,
      message: error?.message || 'Unable to fetch converted orders for selected salesman.',
      orders: [],
    };
  }
}

export async function getSalesmanIncentiveOrderPreviewAction(input: {
  salesmanId: string;
  orderId: string;
}): Promise<{ success: boolean; message?: string; data?: SalesmanIncentiveOrderPreviewResult }> {
  try {
    const salesman = await getSalesmanById(input.salesmanId);
    if (!salesman) {
      return { success: false, message: 'Salesman not found.' };
    }

    const loaded = await loadBaseIncentiveOrderDoc(salesman, input.orderId);

    return {
      success: true,
      data: {
        salesman: loaded.salesmanOption,
        order: loaded.orderDoc,
      },
    };
  } catch (error: any) {
    console.error('[salesman-incentive] Failed to load manual incentive preview:', error);
    return {
      success: false,
      message: error?.message || 'Unable to load incentive preview.',
    };
  }
}

export async function saveManualSalesmanIncentiveAction(input: {
  salesmanId: string;
  orderId: string;
  lineEdits: ManualLineEdit[];
  actor?: ManualSaveActor;
}): Promise<{ success: boolean; message: string; salesmanDocId?: string }> {
  try {
    const salesman = await getSalesmanById(input.salesmanId);
    if (!salesman) {
      return { success: false, message: 'Salesman not found.' };
    }

    const { orderDoc } = await loadBaseIncentiveOrderDoc(salesman, input.orderId);
    const nowIso = new Date().toISOString();

    const editsByLineId = new Map<string, ManualLineEdit>();
    for (const lineEdit of input.lineEdits || []) {
      const lineId = toSafeString(lineEdit?.lineId);
      if (!lineId) continue;
      editsByLineId.set(lineId, lineEdit);
    }

    const patchedLines = orderDoc.fabricDetails.map((line) => {
      const safeLineId = toSafeString(line.lineId);
      const edit = editsByLineId.get(safeLineId);
      if (!edit) return line;

      const nextPercent = toNonNegativeNumberOrUndefined(edit.incentivePercent);
      const nextAmount = toNonNegativeNumberOrUndefined(edit.incentiveAmount);
      const existingManualPercent = toNonNegativeNumberOrUndefined(
        line.manualOverride?.incentivePercent
      );
      const existingManualAmount = toNonNegativeNumberOrUndefined(
        line.manualOverride?.incentiveAmount
      );

      const effectivePercent =
        typeof existingManualPercent === 'number' ? existingManualPercent : line.incentivePercent;
      const effectiveAmount =
        typeof existingManualAmount === 'number' ? existingManualAmount : line.incentiveAmount;

      const percentChanged =
        typeof nextPercent === 'number' &&
        Math.abs(nextPercent - Number(effectivePercent || 0)) > OVERRIDE_EPSILON;
      const amountChanged =
        typeof nextAmount === 'number' &&
        Math.abs(nextAmount - Number(effectiveAmount || 0)) > OVERRIDE_EPSILON;

      if (!percentChanged && !amountChanged) {
        return line;
      }

      return {
        ...line,
        manualOverride: {
          incentivePercent: percentChanged
            ? nextPercent
            : typeof existingManualPercent === 'number'
              ? existingManualPercent
              : undefined,
          incentiveAmount: amountChanged
            ? nextAmount
            : typeof existingManualAmount === 'number'
              ? existingManualAmount
              : undefined,
          updatedAt: nowIso,
          updatedBy: {
            id: toSafeString(input.actor?.id) || undefined,
            name: toSafeString(input.actor?.name) || undefined,
          },
        },
      };
    });

    const recomputedOrderDoc = recomputeSalesmanIncentiveOrderDoc({
      ...orderDoc,
      fabricDetails: patchedLines,
      sourceMeta: {
        ...orderDoc.sourceMeta,
        source: MANUAL_INCENTIVE_SOURCE,
        createdBy: orderDoc.sourceMeta?.createdBy || {
          id: toSafeString(input.actor?.id) || undefined,
          name: toSafeString(input.actor?.name) || 'Admin',
        },
      },
      updatedAt: nowIso,
    });

    const writeResult = await upsertSalesmanIncentivePreparedOrderEntry({
      orderDoc: recomputedOrderDoc,
      salesman: {
        id: salesman.id,
        name: salesman.name,
        salesmanCode: salesman.salesmanCode,
      },
    });

    if (!writeResult.success) {
      return {
        success: false,
        message: writeResult.message || 'Failed to save manual incentive details.',
      };
    }

    revalidatePath('/dashboard/salesman-incentives');

    return {
      success: true,
      message: 'Manual incentive saved successfully.',
      salesmanDocId: writeResult.salesmanDocId,
    };
  } catch (error: any) {
    console.error('[salesman-incentive] Failed to save manual incentive details:', error);
    return {
      success: false,
      message: error?.message || 'Unable to save manual incentive details.',
    };
  }
}
