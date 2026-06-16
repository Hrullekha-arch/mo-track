"use server";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { deleteZohoVendorCredit } from "@/lib/zoho-books";
import {
  createZohoSyncQueueEntry,
  markZohoSyncQueueEntry,
  optionalSyncDefaults,
  ZOHO_SYNC_QUEUE_COLLECTION,
  writeZohoSyncLog,
} from "@/lib/zoho-sync/logger";
import {
  DEBIT_NOTES_COLLECTION,
  syncDebitNoteRecord,
} from "@/services/zoho-sync/debit-note-sync";

export type DebitNoteLineInput = {
  zohoItemId: string;
  itemName: string;
  sku?: string;
  description?: string;
  quantity: number;
  rate: number;
  taxId?: string;
};

export type CreateDebitNoteInput = {
  vendorName: string;
  zohoVendorId: string;
  zohoBillId: string;
  billNumber: string;
  billBalance: number;
  poNumber?: string;
  referenceNumber?: string;
  date: string;
  reason: string;
  items: DebitNoteLineInput[];
};

const asText = (value: unknown) => String(value ?? "").trim();

export async function createDebitNoteAction(
  input: CreateDebitNoteInput,
  actor: { id: string; name: string }
) {
  if (!actor?.id) return { success: false, message: "Missing user context." };

  const vendorName = asText(input?.vendorName);
  const zohoVendorId = asText(input?.zohoVendorId);
  const zohoBillId = asText(input?.zohoBillId);
  const billNumber = asText(input?.billNumber);
  const billBalance = Number(input?.billBalance);
  const reason = asText(input?.reason);
  const date = asText(input?.date);
  const items = (Array.isArray(input?.items) ? input.items : [])
    .map((line) => ({
      zohoItemId: asText(line.zohoItemId),
      itemName: asText(line.itemName),
      sku: asText(line.sku) || null,
      description: asText(line.description) || null,
      quantity: Number(line.quantity),
      rate: Number(line.rate),
      taxId: asText(line.taxId) || null,
    }))
    .filter(
      (line) =>
        line.zohoItemId &&
        line.itemName &&
        Number.isFinite(line.quantity) &&
        line.quantity > 0 &&
        Number.isFinite(line.rate) &&
        line.rate >= 0
    );

  if (!vendorName || !zohoVendorId) {
    return { success: false, message: "Select a Zoho vendor." };
  }
  if (!zohoBillId || !billNumber) {
    return { success: false, message: "Select the associated Zoho bill number." };
  }
  if (!date) return { success: false, message: "Debit-note date is required." };
  if (!reason) return { success: false, message: "Reason is required." };
  if (!items.length) return { success: false, message: "Add at least one valid item." };

  const subtotal = items.reduce((sum, line) => sum + line.quantity * line.rate, 0);
  const now = new Date().toISOString();
  const noteRef = adminDb.collection(DEBIT_NOTES_COLLECTION).doc();
  const document = {
    id: noteRef.id,
    vendorName,
    zohoVendorId,
    zohoBillId,
    billNumber,
    billBalance: Number.isFinite(billBalance) ? billBalance : null,
    poNumber: asText(input.poNumber) || null,
    referenceNumber: asText(input.referenceNumber) || asText(input.poNumber) || null,
    date,
    reason,
    items,
    subtotal,
    total: subtotal,
    currency: "INR",
    status: "pending",
    createdAt: now,
    updatedAt: now,
    createdBy: { id: actor.id, name: actor.name || "User" },
    ...optionalSyncDefaults(),
  };

  await noteRef.set(document);
  let queueId = "";
  try {
    queueId = await createZohoSyncQueueEntry({
      entityType: "debitNote",
      entityId: noteRef.id,
      sourceCollection: DEBIT_NOTES_COLLECTION,
      sourcePath: `${DEBIT_NOTES_COLLECTION}/${noteRef.id}`,
    });
    await syncDebitNoteRecord(noteRef.id, document, queueId);
    await markZohoSyncQueueEntry(queueId, "synced", "Debit note synced.");
    return {
      success: true,
      id: noteRef.id,
      message: "Debit note saved and transferred to Zoho.",
    };
  } catch (error: any) {
    const message = error?.message || "Zoho sync failed.";
    await Promise.allSettled([
      queueId
        ? markZohoSyncQueueEntry(queueId, "failed", message)
        : Promise.resolve(),
      noteRef.set(
        {
          zohoSyncStatus: "failed",
          zohoSyncError: message,
          status: "failed",
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      ),
      writeZohoSyncLog({
        queueId: queueId || undefined,
        entityType: "debitNote",
        entityId: noteRef.id,
        status: "failed",
        message,
      }),
    ]);
    return {
      success: true,
      id: noteRef.id,
      message: `Debit note saved in Mo Track. Zoho sync can be retried: ${message}`,
      syncFailed: true,
    };
  }
}

export async function retryDebitNoteSyncAction(
  debitNoteIdInput: string,
  actor: { id: string; name: string }
) {
  const debitNoteId = asText(debitNoteIdInput);
  if (!debitNoteId || !actor?.id) {
    return { success: false, message: "Missing debit note or user context." };
  }

  const ref = adminDb.collection(DEBIT_NOTES_COLLECTION).doc(debitNoteId);
  const snap = await ref.get();
  if (!snap.exists) return { success: false, message: "Debit note not found." };
  const data = snap.data() as any;
  if (data?.zohoSyncStatus === "synced" || asText(data?.zohoId)) {
    return { success: true, message: "Debit note is already synced." };
  }

  await ref.set(
    {
      zohoSyncStatus: "pending",
      zohoSyncError: null,
      status: "pending",
      updatedAt: new Date().toISOString(),
      retryRequestedBy: { id: actor.id, name: actor.name || "User" },
      manualRetryCount: FieldValue.increment(1),
    },
    { merge: true }
  );

  const queueId = await createZohoSyncQueueEntry({
    entityType: "debitNote",
    entityId: debitNoteId,
    sourceCollection: DEBIT_NOTES_COLLECTION,
    sourcePath: `${DEBIT_NOTES_COLLECTION}/${debitNoteId}`,
  });

  try {
    await syncDebitNoteRecord(debitNoteId, { ...data, zohoSyncStatus: "pending" }, queueId);
    await markZohoSyncQueueEntry(queueId, "synced", "Debit note synced.");
    return { success: true, message: "Debit note transferred to Zoho." };
  } catch (error: any) {
    const message = error?.message || "Zoho sync failed.";
    await markZohoSyncQueueEntry(queueId, "failed", message);
    return { success: false, message };
  }
}

export async function deleteFailedDebitNoteAction(
  debitNoteIdInput: string,
  actor: { id: string; name: string }
) {
  const debitNoteId = asText(debitNoteIdInput);
  if (!debitNoteId || !actor?.id) {
    return { success: false, message: "Missing debit note or user context." };
  }

  const noteRef = adminDb.collection(DEBIT_NOTES_COLLECTION).doc(debitNoteId);
  const noteSnap = await noteRef.get();
  if (!noteSnap.exists) {
    return { success: true, message: "The failed debit note was already deleted." };
  }

  const data = noteSnap.data() as any;
  if (data?.zohoSyncStatus !== "failed") {
    return { success: false, message: "Only failed debit notes can be deleted." };
  }

  const zohoVendorCreditId = asText(data?.zohoVendorCreditId || data?.zohoId);
  if (zohoVendorCreditId) {
    try {
      await deleteZohoVendorCredit(zohoVendorCreditId);
    } catch (error: any) {
      return {
        success: false,
        message:
          error?.message ||
          "The Zoho vendor credit could not be deleted, so the local record was kept.",
      };
    }
  }

  const queueSnap = await adminDb
    .collection(ZOHO_SYNC_QUEUE_COLLECTION)
    .where("entityId", "==", debitNoteId)
    .get();
  const batch = adminDb.batch();
  queueSnap.docs
    .filter(
      (queueDoc: FirebaseFirestore.QueryDocumentSnapshot) =>
        queueDoc.data()?.entityType === "debitNote"
    )
    .forEach((queueDoc: FirebaseFirestore.QueryDocumentSnapshot) =>
      batch.delete(queueDoc.ref)
    );
  batch.delete(noteRef);
  await batch.commit();

  await Promise.allSettled([
    writeZohoSyncLog({
      entityType: "debitNote",
      entityId: debitNoteId,
      status: "skipped",
      message: `Failed debit note deleted by ${actor.name || actor.id}.`,
    }),
  ]);

  return { success: true, message: "Failed debit note deleted." };
}
