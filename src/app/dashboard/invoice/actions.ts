'use server';

import { adminDb } from '@/lib/firebase-admin';
import { InvoiceBatch, InvoiceBatchItem } from '@/lib/types';

/* =========================================================
   COMBINE INVOICE BATCHES
========================================================= */
export async function combineInvoiceBatchesAction(
  batchesToCombine: InvoiceBatch[]
): Promise<{ success: boolean; message: string }> {

  // Basic validations
  if (!Array.isArray(batchesToCombine) || batchesToCombine.length < 2) {
    return { success: false, message: 'At least two batches are required.' };
  }

  const firstBatch = batchesToCombine[0];
  const orderId = firstBatch.orderId;
  const isVasInvoice = firstBatch.isVas === true;

  // All batches must belong to same order
  if (batchesToCombine.some(b => b.orderId !== orderId)) {
    return { success: false, message: 'All batches must belong to the same order.' };
  }

  // All batches must be pending
  if (batchesToCombine.some(b => b.status !== 'pendingInvoice')) {
    return { success: false, message: 'Only pending invoices can be combined.' };
  }

  // VAS consistency
  if (batchesToCombine.some(b => (b.isVas === true) !== isVasInvoice)) {
    return { success: false, message: 'VAS and non-VAS invoices cannot be combined.' };
  }

  try {
    const firestoreBatch = adminDb.batch();

    /* ---------- Combine Items ---------- */
    const combinedItems: InvoiceBatchItem[] = [];
    batchesToCombine.forEach(batch => {
      if (Array.isArray(batch.items)) {
        combinedItems.push(...batch.items);
      }
    });

    if (combinedItems.length === 0) {
      return { success: false, message: 'No invoice items found to combine.' };
    }

    /* ---------- Create New Batch ---------- */
    const newBatchRef = adminDb.collection('invoiceBatches').doc();

    const newCombinedBatch: Omit<InvoiceBatch, 'id'> = {
      orderId,
      customerName: firstBatch.customerName,
      customerPhone: firstBatch.customerPhone,
      customerAddress: firstBatch.customerAddress,
      salesPerson: firstBatch.salesPerson || '',
      createdAt: new Date().toISOString(),
      status: 'pendingInvoice',
      items: combinedItems,
      isCombined: true,
      isVas: isVasInvoice,
      combinedFromBatches: batchesToCombine.map(b => b.id),
    };

    firestoreBatch.set(newBatchRef, newCombinedBatch);

    /* ---------- Delete Old Batches ---------- */
    batchesToCombine.forEach(batch => {
      firestoreBatch.delete(
        adminDb.collection('invoiceBatches').doc(batch.id)
      );
    });

    await firestoreBatch.commit();

    return {
      success: true,
      message: `Successfully combined ${batchesToCombine.length} invoice batches.`,
    };

  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Failed to combine invoices.',
    };
  }
}

/* =========================================================
   FETCH GST FROM QUOTATION (SOURCE OF TRUTH)
========================================================= */

export interface GSTData {
  cgstPercent: number;
  sgstPercent: number;
  igstPercent: number;
  totalGstPercent: number;
  source: 'quotation' | 'default';
}

export async function fetchGSTFromQuotationAction(
  orderNo: string
): Promise<GSTData> {

  const DEFAULT_GST = {
    cgstPercent: 2.5,
    sgstPercent: 2.5,
    igstPercent: 0,
    totalGstPercent: 5,
    source: 'default' as const,
  };

  if (!orderNo) return DEFAULT_GST;

  try {
    // quotationNo === numeric part of orderNo
    const numericOrderNo = orderNo.replace('MOTRACK-', '');

    const quotationSnap = await adminDb
      .collectionGroup('quotations')
      .where('quotationNo', '==', numericOrderNo)
      .limit(1)
      .get();

    if (quotationSnap.empty) return DEFAULT_GST;

    const quotation = quotationSnap.docs[0].data();
    const items = quotation.items;

    if (!Array.isArray(items) || items.length === 0) {
      return DEFAULT_GST;
    }

    const gstPercent = Number(items[0].gstPercent);
    if (!Number.isFinite(gstPercent) || gstPercent <= 0) {
      return DEFAULT_GST;
    }

    return {
      cgstPercent: gstPercent / 2,
      sgstPercent: gstPercent / 2,
      igstPercent: 0,
      totalGstPercent: gstPercent,
      source: 'quotation',
    };

  } catch {
    return DEFAULT_GST;
  }
}
