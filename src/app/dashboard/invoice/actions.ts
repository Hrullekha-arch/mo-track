

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { InvoiceBatch, InvoiceBatchItem } from '@/lib/types';
import admin from "firebase-admin";


export async function combineInvoiceBatchesAction(
  batchesToCombine: InvoiceBatch[]
): Promise<{ success: boolean; message: string }> {
  if (batchesToCombine.length < 2) {
    return { success: false, message: 'At least two batches are required to combine.' };
  }

  const firstBatch = batchesToCombine[0];
  const orderId = firstBatch.orderId;

  // Verify all batches belong to the same order and are pending
  if (batchesToCombine.some((b) => b.orderId !== orderId)) {
    return { success: false, message: 'All selected batches must belong to the same order.' };
  }
  if (batchesToCombine.some((b) => b.status !== 'pendingInvoice')) {
    return { success: false, message: 'Only batches pending invoice generation can be combined.' };
  }

  try {
    const firestoreBatch = adminDb.batch();

    // 1. Combine all items from the selected batches
    const combinedItems: InvoiceBatchItem[] = batchesToCombine.flatMap((b) => b.items);

    // 2. Create a new invoice batch with the combined items
    const newBatchRef = adminDb.collection('invoiceBatches').doc();
    const newCombinedBatch: Omit<InvoiceBatch, 'id'> = {
      orderId: firstBatch.orderId,
      customerName: firstBatch.customerName,
      customerPhone: firstBatch.customerPhone,
      createdAt: admin.firestore.Timestamp.now(),
      status: 'pendingInvoice',
      items: combinedItems,
      isCombined: true,
    };
    firestoreBatch.set(newBatchRef, newCombinedBatch);

    // 3. Delete the old batches
    batchesToCombine.forEach((batch) => {
      const batchRef = adminDb.collection("invoiceBatches").doc(batch.id);
      firestoreBatch.delete(batchRef);
    });

    await firestoreBatch.commit();

    return { success: true, message: 'Successfully combined invoices.' };
  } catch (error: any) {
    console.error('Error combining invoice batches:', error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}
