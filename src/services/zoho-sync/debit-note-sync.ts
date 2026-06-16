import { adminDb } from "@/lib/firebase-admin";
import {
  applyZohoVendorCreditToBill,
  createZohoVendorCredit,
} from "@/lib/zoho-books";
import {
  failureSyncPatch,
  successSyncPatch,
  writeZohoSyncLog,
} from "@/lib/zoho-sync/logger";
import {
  emptySyncResult,
  fetchCollectionCandidates,
  runRecordSync,
  type ZohoSyncResult,
  type ZohoSyncRunOptions,
} from "./queue-sync";

export const DEBIT_NOTES_COLLECTION = "debitNotes";

const asText = (value: unknown) => String(value ?? "").trim();

const buildDebitNoteNumber = (debitNoteId: string, debitNote: any) => {
  const existing = asText(
    debitNote?.debitNoteNumber ||
      debitNote?.zohoRequestedNumber ||
      debitNote?.zohoVendorCreditNumber
  );
  if (existing) return existing;

  const datePart = asText(debitNote?.date).replace(/\D/g, "").slice(0, 8);
  const idPart = asText(debitNoteId).replace(/[^a-z0-9]/gi, "").slice(0, 10).toUpperCase();
  return `MT-DN-${datePart || "DATE"}-${idPart || "NOTE"}`;
};

export async function syncDebitNoteRecord(
  debitNoteId: string,
  debitNote: any,
  queueId?: string
): Promise<"synced" | "skipped"> {
  if (debitNote?.zohoSyncStatus === "synced") {
    return "skipped";
  }

  const lines = Array.isArray(debitNote?.items) ? debitNote.items : [];
  const lineItems = lines
    .map((line: any) => ({
      itemId: asText(line?.zohoItemId),
      quantity: Number(line?.quantity),
      rate: Number(line?.rate),
      description: asText(line?.description || line?.itemName) || undefined,
      taxId: asText(line?.taxId) || undefined,
    }))
    .filter(
      (line: any) =>
        line.itemId &&
        Number.isFinite(line.quantity) &&
        line.quantity > 0 &&
        Number.isFinite(line.rate) &&
        line.rate >= 0
    );

  if (!lineItems.length) throw new Error("No valid debit-note items found.");

  const debitNoteNumber = buildDebitNoteNumber(debitNoteId, debitNote);
  const zohoBillId = asText(debitNote?.zohoBillId);
  const billNumber = asText(debitNote?.billNumber);
  if (!zohoBillId || !billNumber) {
    throw new Error("Select the associated Zoho bill number.");
  }

  try {
    await adminDb.collection(DEBIT_NOTES_COLLECTION).doc(debitNoteId).set(
      {
        debitNoteNumber,
        zohoRequestedNumber: debitNoteNumber,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    const existingCreditId = asText(
      debitNote?.zohoVendorCreditId || debitNote?.zohoId
    );
    const created = existingCreditId
      ? {
          id: existingCreditId,
          number:
            asText(debitNote?.zohoVendorCreditNumber || debitNote?.zohoNumber) ||
            debitNoteNumber,
          vendorId: asText(debitNote?.zohoVendorId),
          vendorName: asText(debitNote?.zohoVendorName || debitNote?.vendorName),
          total: Number(debitNote?.total),
        }
      : await createZohoVendorCredit({
          vendorId: asText(debitNote?.zohoVendorId),
          vendorCreditNumber: debitNoteNumber,
          date: asText(debitNote?.date) || new Date().toISOString().slice(0, 10),
          referenceNumber:
            asText(debitNote?.referenceNumber || debitNote?.poNumber) || undefined,
          notes:
            asText(debitNote?.reason || debitNote?.notes) ||
            `Synced from ${DEBIT_NOTES_COLLECTION}/${debitNoteId}.`,
          lineItems,
        });

    await adminDb.collection(DEBIT_NOTES_COLLECTION).doc(debitNoteId).set(
      {
        zohoId: created.id,
        zohoNumber: created.number,
        zohoVendorCreditId: created.id,
        zohoVendorCreditNumber: created.number,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    const creditTotal = Number.isFinite(Number(created.total))
      ? Number(created.total)
      : Number(debitNote?.total);
    const billBalance = Number(debitNote?.billBalance);
    const amountApplied =
      Number.isFinite(billBalance) && billBalance > 0
        ? Math.min(creditTotal, billBalance)
        : creditTotal;
    await applyZohoVendorCreditToBill({
      vendorCreditId: created.id,
      billId: zohoBillId,
      amount: amountApplied,
    });

    await adminDb.collection(DEBIT_NOTES_COLLECTION).doc(debitNoteId).set(
      successSyncPatch({
        zohoId: created.id,
        zohoNumber: created.number,
        extra: {
          zohoVendorCreditId: created.id,
          zohoVendorCreditNumber: created.number,
          debitNoteNumber,
          zohoRequestedNumber: debitNoteNumber,
          zohoVendorId: created.vendorId,
          zohoVendorName: created.vendorName || debitNote?.vendorName || null,
          zohoBillId,
          billNumber,
          zohoBillApplied: true,
          zohoBillAmountApplied: amountApplied,
          status: "synced",
        },
      }),
      { merge: true }
    );

    await writeZohoSyncLog({
      queueId,
      entityType: "debitNote",
      entityId: debitNoteId,
      status: "synced",
      message: `Zoho debit note ${created.number || created.id} created.`,
    });
    return "synced";
  } catch (error) {
    await adminDb.collection(DEBIT_NOTES_COLLECTION).doc(debitNoteId).set(
      {
        ...failureSyncPatch(error),
        status: "failed",
      },
      { merge: true }
    );
    throw error;
  }
}

export async function syncPendingDebitNotes(
  options?: ZohoSyncRunOptions
): Promise<ZohoSyncResult> {
  const result = emptySyncResult();
  const candidates = await fetchCollectionCandidates(DEBIT_NOTES_COLLECTION, options);

  for (const entry of candidates) {
    await runRecordSync({
      entityType: "debitNote",
      sourceCollection: DEBIT_NOTES_COLLECTION,
      sourceId: entry.id,
      sourcePath: `${DEBIT_NOTES_COLLECTION}/${entry.id}`,
      result,
      sync: (queueId) => syncDebitNoteRecord(entry.id, entry.data, queueId),
    });
  }
  return result;
}
