'use server';

import { adminDb } from '@/lib/firebase-admin';
import { InvoiceBatch, InvoiceBatchItem } from '@/lib/types';
import { collection, doc, writeBatch, Timestamp } from 'firebase-admin/firestore';

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
    const firestoreBatch = writeBatch(adminDb);

    // 1. Combine all items from the selected batches
    const combinedItems: InvoiceBatchItem[] = batchesToCombine.flatMap((b) => b.items);

    // 2. Create a new invoice batch with the combined items
    const newBatchRef = doc(collection(adminDb, 'invoiceBatches'));
    const newCombinedBatch: Omit<InvoiceBatch, 'id'> = {
      orderId: firstBatch.orderId,
      customerName: firstBatch.customerName,
      customerPhone: firstBatch.customerPhone,
      createdAt: Timestamp.now(),
      status: 'pendingInvoice',
      items: combinedItems,
    };
    firestoreBatch.set(newBatchRef, newCombinedBatch);

    // 3. Delete the old batches
    batchesToCombine.forEach((batch) => {
      const batchRef = doc(adminDb, 'invoiceBatches', batch.id);
      firestoreBatch.delete(batchRef);
    });

    await firestoreBatch.commit();

    return { success: true, message: 'Successfully combined invoices.' };
  } catch (error: any) {
    console.error('Error combining invoice batches:', error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}
