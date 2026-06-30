'use server';

import { FormValues as QuotationFormValues } from '@/components/features/order-management/CreateQuotationDialog';
import { DealProductsDoc, O2DStatus, Order, Quotation } from '@/lib/types';
import {
  DeleteQuotationActor,
  FieldValue,
  addInventoryDelta,
  adminDb,
  buildStockKey,
  buildDealProductItem,
  dedupeO2DMilestones,
  getNextSequenceValue,
  hasDelta,
  normalizeBillingDetailsSnapshot,
  resolvePreferredBillingDetails,
  sanitizeStockDocId,
  stripUndefined,
  stripUndefinedDeep,
  toPositiveNumber,
  toTrimmedString,
  toUpper,
  upsertO2DMilestone,
  upsertVasStockItemsAction,
} from './actions-shared';

type QuotationFormWithMeta = QuotationFormValues & { createdBy?: string };
type InventoryDelta = {
  availableQty?: number;
  availableLength?: number;
  reservedQty?: number;
  cutQty?: number;
};

const DELTA_EPSILON = 0.0001;

export async function createQuotationAction(
  customerId: string,
  dealId: string,
  values: QuotationFormWithMeta,
  totalAmount: number,
): Promise<{ success: boolean; message: string; quotationId?: string; quotation?: Quotation }> {
  try {
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const quotationRef = dealRef.collection('quotations').doc();
    let quotationNo = '';

    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const candidate = await getNextSequenceValue('quotationNo');
      const existing = await adminDb
        .collectionGroup('quotations')
        .where('quotationNo', '==', candidate)
        .limit(1)
        .get();
      if (existing.empty) {
        quotationNo = candidate;
        break;
      }
    }

    if (!quotationNo) return { success: false, message: 'Could not generate a unique quotation number.' };

    const dealProductsRef = adminDb.collection('dealProducts').doc(String(dealId));
    const dealProductsSnap = await dealProductsRef.get();
    const dealProducts = dealProductsSnap.exists ? (dealProductsSnap.data() as DealProductsDoc) : null;
    const selectedProducts = Array.isArray(values.selectedProducts) ? values.selectedProducts.filter(Boolean) : [];
    const normalItems = selectedProducts
      .filter((product) => String(product.productType || '').toUpperCase() !== 'VAS')
      .map(buildDealProductItem);
    const vasItems = selectedProducts
      .filter((product) => String(product.productType || '').toUpperCase() === 'VAS')
      .map(buildDealProductItem);

    const quotationData: Omit<Quotation, 'id'> = {
      ...values,
      quotationNo,
      totalAmount,
      createdAt: new Date().toISOString(),
      items: values.items || [],
      selectedProducts,
      sections: {
        NORMAL: { items: normalItems },
        VAS: { items: vasItems },
      },
      dealProductsSnapshot: dealProducts || undefined,
      status: 'Draft',
    };

    await quotationRef.set(stripUndefinedDeep(quotationData));

    if (vasItems.length > 0) {
      const vasRowsForStock = vasItems.map((item) => ({
        itemName: item.itemName || item.description || 'VAS',
        code: item.bcn,
        hsnCode: item.hsn,
        uom: item.unit || 'PCS',
        gstRate: Number(item.gst || 0),
      }));
      const syncResult = await upsertVasStockItemsAction(vasRowsForStock);
      if (!syncResult.success) {
        console.warn('VAS stock sync failed while creating quotation', syncResult);
      }
    }

    const o2dProcessRef = adminDb.collection('o2d').doc(dealId);
    const o2dProcessDoc = await o2dProcessRef.get();
    if (o2dProcessDoc.exists) {
      const quotationStepId = 5;
      const existingMilestones = dedupeO2DMilestones((o2dProcessDoc.data()?.milestones || []) as O2DStatus[]);
      if (!existingMilestones.some((m) => m.stepId === quotationStepId)) {
        const newMilestone: O2DStatus = {
          stepId: quotationStepId,
          status: 'completed',
          completedAt: new Date().toISOString(),
          completedBy: values.createdBy || 'System',
          remarks: `Quotation #${quotationNo} created.`,
          selection: 'Done',
        };
        await o2dProcessRef.update({
          milestones: upsertO2DMilestone(existingMilestones, newMilestone),
        });
      }
    }

    const newQuotation = { id: quotationRef.id, ...quotationData } as Quotation;
    return {
      success: true,
      message: 'Quotation created successfully.',
      quotationId: quotationRef.id,
      quotation: JSON.parse(JSON.stringify(newQuotation)),
    };
  } catch (error: any) {
    console.error('Error creating quotation:', error);
    return { success: false, message: `Failed to create quotation: ${error.message}` };
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

    if (snapshot.empty) return [];
    const quotations = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Quotation));
    return JSON.parse(JSON.stringify(quotations));
  } catch (error) {
    console.error('Error fetching quotations:', error);
    return [];
  }
}

export async function updateQuotationStatusAction(
  customerId: string,
  dealId: string,
  quotationId: string,
  status: Quotation['status'],
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

    if (!quotationSnap.exists) return { success: false, message: 'Quotation not found.' };
    const currentStatus = quotationSnap.data()?.status as Quotation['status'] | undefined;
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

export async function deleteQuotationCascadeAction(
  customerId: string,
  dealId: string,
  quotationId: string,
  actor?: DeleteQuotationActor,
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
    const requestedRole = String(actor?.role || '').trim().toLowerCase();
    let isAdmin = requestedRole === 'admin';
    if (actor?.id) {
      const actorSnap = await adminDb.collection('users').doc(actor.id).get();
      if (actorSnap.exists) {
        isAdmin = String(actorSnap.data()?.role || '').trim().toLowerCase() === 'admin';
      }
    }
    if (!isAdmin) return { success: false, message: 'Only admin can delete quotations with cascade.' };

    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const quotationRef = dealRef.collection('quotations').doc(quotationId);
    const quotationSnap = await quotationRef.get();
    if (!quotationSnap.exists) return { success: false, message: 'Quotation not found.' };

    const quotationData = quotationSnap.data() as Quotation & Record<string, any>;
    const quotationNo = String(quotationData?.quotationNo || '').trim();
    const directOrderId = String(quotationData?.orderNo || '').trim();
    const ordersRef = adminDb.collection('orders');
    const orderDocs = new Map<string, FirebaseFirestore.DocumentSnapshot>();

    if (directOrderId) {
      const directOrderSnap = await ordersRef.doc(directOrderId).get();
      if (directOrderSnap.exists) orderDocs.set(directOrderSnap.id, directOrderSnap);
    }

    const orderQueryResults = await Promise.all([
      ordersRef.where('quotationId', '==', quotationId).get(),
      ...(quotationNo
        ? [
            ordersRef.where('quotationNo', '==', quotationNo).get(),
            ordersRef.where('crmOrderNo', '==', quotationNo).get(),
          ]
        : []),
    ]);
    orderQueryResults.forEach((snapshot) => snapshot.forEach((docSnap) => orderDocs.set(docSnap.id, docSnap)));

    const stockHints = new Map<string, { stockId?: string; bcn?: string }>();
    const stockDeltas = new Map<string, InventoryDelta>();
    const lengthDeltas = new Map<string, { stockKey: string; lengthId: string; delta: InventoryDelta }>();
    const reservationCleanupTargets = new Map<string, { stockKey: string; lengthId: string; orderId: string }>();

    const registerStockDelta = (stockId: unknown, bcn: unknown, delta: InventoryDelta) => {
      const key = buildStockKey(
        String(stockId || '').trim() || undefined,
        String(bcn || '').trim() || undefined,
      );
      if (!key) return;
      if (!stockHints.has(key)) {
        stockHints.set(key, {
          stockId: String(stockId || '').trim() || undefined,
          bcn: String(bcn || '').trim() || undefined,
        });
      }
      addInventoryDelta(stockDeltas, key, delta);
    };

    const registerLengthDelta = (stockId: unknown, bcn: unknown, lengthId: unknown, delta: InventoryDelta) => {
      const safeLengthId = String(lengthId || '').trim();
      if (!safeLengthId) return;
      const stockKey = buildStockKey(
        String(stockId || '').trim() || undefined,
        String(bcn || '').trim() || undefined,
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

    const registerReservationTarget = (stockId: unknown, bcn: unknown, lengthId: unknown, orderId: string) => {
      const safeLengthId = String(lengthId || '').trim();
      if (!safeLengthId || !orderId) return;
      const stockKey = buildStockKey(
        String(stockId || '').trim() || undefined,
        String(bcn || '').trim() || undefined,
      );
      if (!stockKey) return;
      reservationCleanupTargets.set(`${stockKey}::${safeLengthId}::${orderId}`, {
        stockKey,
        lengthId: safeLengthId,
        orderId,
      });
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
      if (pendingOps >= MAX_BATCH_OPS) await flushBatch();
    };
    const queueUpdate = async (
      docRef: FirebaseFirestore.DocumentReference,
      data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
    ) => {
      batch.update(docRef, data);
      pendingOps += 1;
      if (pendingOps >= MAX_BATCH_OPS) await flushBatch();
    };

    for (const [orderId, orderDocSnap] of orderDocs.entries()) {
      if (!orderDocSnap.exists) continue;
      const orderData = orderDocSnap.data() as Order;
      const invoiceSnapshot = await adminDb.collection('invoices').where('orderId', '==', orderId).get();

      for (const invoiceDoc of invoiceSnapshot.docs) {
        const normalItems = Array.isArray(invoiceDoc.data()?.sections?.NORMAL?.items)
          ? invoiceDoc.data().sections.NORMAL.items
          : [];
        normalItems.forEach((item: any) => {
          const qty = toPositiveNumber(item?.qty);
          if (qty <= 0) return;
          const stockItemId = String(item?.allocationRef?.stockItemId || '').trim() || undefined;
          const bcn = String(item?.bcn || '').trim() || undefined;
          registerStockDelta(stockItemId, bcn, { reservedQty: qty, cutQty: -qty });
          const lengthId = String(item?.allocationRef?.lengthId || '').trim();
          if (lengthId && !lengthId.startsWith('MIG-LEN-')) {
            registerLengthDelta(stockItemId, bcn, lengthId, { reservedQty: qty, cutQty: -qty });
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
        const bcn = String(item?.bcn || item?.collectionBrand || '').trim() || undefined;
        const stockItemId =
          String(item?.stockId || item?.stockItemId || item?.allocation?.stockItemId || '').trim() || undefined;
        const allocation = item?.allocation || {};
        const lengths = Array.isArray(allocation?.lengths) ? allocation.lengths : [];
        const lots = Array.isArray(allocation?.lots) ? allocation.lots : [];
        let allocatedTotal = 0;

        lengths.forEach((entry: any) => {
          const lengthId = String(entry?.lengthId || '').trim();
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
          if (allocatedQty > 0) allocatedTotal += allocatedQty;
        });

        if (allocatedTotal > 0) {
          registerStockDelta(stockItemId, bcn, { availableQty: allocatedTotal, reservedQty: -allocatedTotal });
        }
      });

      const dealOrdersRef = dealRef.collection('orders');
      const dealOrderRefs = new Map<string, FirebaseFirestore.DocumentReference>();
      const dealOrderDocId = String(orderData?.dealOrderDocId || '').trim();

      if (dealOrderDocId) {
        const dealOrderSnap = await dealOrdersRef.doc(dealOrderDocId).get();
        if (dealOrderSnap.exists) dealOrderRefs.set(dealOrderSnap.id, dealOrderSnap.ref);
      }

      const orderNo = String(orderData?.orderNo || orderId).trim();
      const dealOrderQueryResults = await Promise.all([
        dealOrdersRef.where('orderId', '==', orderId).get(),
        ...(orderNo ? [dealOrdersRef.where('orderNo', '==', orderNo).get()] : []),
      ]);
      dealOrderQueryResults.forEach((snapshot) => snapshot.forEach((docSnap) => dealOrderRefs.set(docSnap.id, docSnap.ref)));

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
      if (!hint) return null;
      const stocksRef = adminDb.collection('stocks');
      const stockId = String(hint.stockId || '').trim();

      if (stockId) {
        const stockDoc = await stocksRef.doc(stockId).get();
        if (stockDoc.exists) {
          stockRefCache.set(stockKey, stockDoc.ref);
          return stockDoc.ref;
        }
      }

      const bcn = String(hint.bcn || '').trim();
      if (bcn) {
        const sanitizedDocId = sanitizeStockDocId(bcn);
        if (sanitizedDocId) {
          const docBySanitizedId = await stocksRef.doc(sanitizedDocId).get();
          if (docBySanitizedId.exists) {
            stockRefCache.set(stockKey, docBySanitizedId.ref);
            return docBySanitizedId.ref;
          }
        }
        const stockByBcnSnapshot = await stocksRef.where('bcn', '==', bcn).limit(1).get();
        if (!stockByBcnSnapshot.empty) {
          stockRefCache.set(stockKey, stockByBcnSnapshot.docs[0].ref);
          return stockByBcnSnapshot.docs[0].ref;
        }
      }

      stockRefCache.set(stockKey, null);
      return null;
    };

    const updateTimestamp = new Date().toISOString();
    for (const [stockKey, delta] of stockDeltas.entries()) {
      const stockRef = await resolveStockRef(stockKey);
      if (!stockRef) continue;
      const payload: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = { lastUpdatedAt: updateTimestamp };
      if (Math.abs(delta.availableQty || 0) > DELTA_EPSILON) payload.availableQty = FieldValue.increment(delta.availableQty || 0);
      if (Math.abs(delta.reservedQty || 0) > DELTA_EPSILON) payload.reservedQty = FieldValue.increment(delta.reservedQty || 0);
      if (Math.abs(delta.cutQty || 0) > DELTA_EPSILON) payload.cutQty = FieldValue.increment(delta.cutQty || 0);
      await queueUpdate(stockRef, payload);
    }

    for (const target of lengthDeltas.values()) {
      const stockRef = await resolveStockRef(target.stockKey);
      if (!stockRef) continue;
      const lengthRef = stockRef.collection('lengths').doc(target.lengthId);
      if (!(await lengthRef.get()).exists) continue;
      const payload: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = { lastUpdatedAt: updateTimestamp };
      if (Math.abs(target.delta.availableQty || 0) > DELTA_EPSILON) payload.availableQty = FieldValue.increment(target.delta.availableQty || 0);
      if (Math.abs(target.delta.availableLength || 0) > DELTA_EPSILON) payload.availableLength = FieldValue.increment(target.delta.availableLength || 0);
      if (Math.abs(target.delta.reservedQty || 0) > DELTA_EPSILON) payload.reservedQty = FieldValue.increment(target.delta.reservedQty || 0);
      if (Math.abs(target.delta.cutQty || 0) > DELTA_EPSILON) payload.cutQty = FieldValue.increment(target.delta.cutQty || 0);
      await queueUpdate(lengthRef, payload);
    }

    for (const target of reservationCleanupTargets.values()) {
      const stockRef = await resolveStockRef(target.stockKey);
      if (!stockRef) continue;
      const reservedSnapshot = await stockRef
        .collection('lengths')
        .doc(target.lengthId)
        .collection('reservedQty')
        .where('orderId', '==', target.orderId)
        .get();
      for (const reservedDoc of reservedSnapshot.docs) {
        await queueDelete(reservedDoc.ref);
        allocationReservationsDeleted += 1;
      }
    }

    await queueDelete(quotationRef);
    await flushBatch();

    return {
      success: true,
      message: `Quotation ${quotationNo || quotationId} deleted. Removed ${ordersDeleted} order(s), ${dealOrdersDeleted} deal-order record(s), ${invoicesDeleted} invoice(s), and ${allocationReservationsDeleted} allocation reservation record(s).`,
      summary: { ordersDeleted, dealOrdersDeleted, invoicesDeleted, allocationReservationsDeleted },
    };
  } catch (error: any) {
    console.error('Error deleting quotation with cascade:', error);
    return { success: false, message: `Failed to delete quotation: ${error.message}` };
  }
}
