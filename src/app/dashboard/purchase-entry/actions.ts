'use server';

import { adminDb } from '@/lib/firebase-admin';
import { normalizePurchaseEntryStatus } from '@/lib/purchase-entry';
import { PendingPurchaseEntry } from '@/lib/types';

const stripUndefined = <T extends Record<string, any>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  ) as T;

export async function getPendingPurchaseEntriesAction(): Promise<PendingPurchaseEntry[]> {
  try {
    const snapshot = await adminDb
      .collection('PendingPurchaseEntry')
      .orderBy('updatedAt', 'desc')
      .get();

    const rows = snapshot.docs.map((docSnap) => {
      const data = docSnap.data() as Partial<PendingPurchaseEntry>;
      const purchaseEntryStatus = normalizePurchaseEntryStatus(
        data.purchaseEntryStatus || data.status
      );
      return {
        id: docSnap.id,
        poNumber: String(data.poNumber || ''),
        status: purchaseEntryStatus,
        purchaseEntryStatus,
        stockId: String(data.stockId || ''),
        lengthId: String(data.lengthId || ''),
        bcn: String(data.bcn || ''),
        itemName: data.itemName,
        quantity: Number(data.quantity || 0),
        unit: data.unit,
        dealId: data.dealId,
        customerName: data.customerName,
        vendorName: data.vendorName,
        salesman: data.salesman,
        purchaseRequestId: data.purchaseRequestId,
        inboundId: data.inboundId,
        receivedAt: data.receivedAt,
        receivedBy: data.receivedBy,
        doneAt: data.doneAt,
        doneBy: data.doneBy,
        createdAt: String(data.createdAt || ''),
        updatedAt: String(data.updatedAt || data.createdAt || ''),
      } as PendingPurchaseEntry;
    });

    return JSON.parse(JSON.stringify(rows));
  } catch (error) {
    console.error('Failed to fetch pending purchase entries:', error);
    return [];
  }
}

export async function markPendingPurchaseEntryDoneAction(input: {
  entryId: string;
  actor?: { id?: string; name?: string; role?: string };
}): Promise<{ success: boolean; message: string }> {
  const entryId = String(input?.entryId || '').trim();
  if (!entryId) {
    return { success: false, message: 'Entry id is required.' };
  }

  try {
    await adminDb.runTransaction(async (tx) => {
      const entryRef = adminDb.collection('PendingPurchaseEntry').doc(entryId);
      const entrySnap = await tx.get(entryRef);
      if (!entrySnap.exists) {
        throw new Error('Purchase entry not found.');
      }

      const entry = entrySnap.data() as PendingPurchaseEntry;
      const now = new Date().toISOString();
      const doneBy = stripUndefined({
        id: input?.actor?.id,
        name: input?.actor?.name,
        role: input?.actor?.role,
      });

      tx.set(
        entryRef,
        stripUndefined({
          status: 'Done',
          purchaseEntryStatus: 'Done',
          doneAt: now,
          doneBy: Object.keys(doneBy).length ? doneBy : undefined,
          updatedAt: now,
        }),
        { merge: true }
      );

      const stockId = String(entry.stockId || '').trim();
      const lengthId = String(entry.lengthId || '').trim();
      if (stockId && lengthId) {
        const lengthRef = adminDb.collection('stocks').doc(stockId).collection('lengths').doc(lengthId);
        const lengthSnap = await tx.get(lengthRef);
        if (lengthSnap.exists) {
          tx.set(
            lengthRef,
            stripUndefined({
              purchaseEntryStatus: 'Done',
              purchaseEntryDoneAt: now,
              purchaseEntryDoneBy: Object.keys(doneBy).length ? doneBy : undefined,
              purchaseEntryUpdatedAt: now,
              purchaseEntryId: entryId,
            }),
            { merge: true }
          );
        }
      }
    });

    return { success: true, message: 'Purchase entry marked as done.' };
  } catch (error: any) {
    console.error('Failed to mark purchase entry as done:', error);
    return { success: false, message: error?.message || 'Failed to update purchase entry.' };
  }
}

