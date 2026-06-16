import { adminDb } from "@/lib/firebase-admin";
import { createZohoInventoryAdjustment } from "@/lib/zoho-sync/stock";
import { resolveZohoItemForStock } from "@/lib/zoho-sync/items";
import { failureSyncPatch, successSyncPatch, writeZohoSyncLog } from "@/lib/zoho-sync/logger";
import {
  emptySyncResult,
  fetchCollectionCandidates,
  runRecordSync,
  type ZohoSyncRunOptions,
  type ZohoSyncResult,
} from "./queue-sync";

const asText = (value: unknown) => String(value ?? "").trim();
const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const sanitizeDocId = (value: string) => value.replace(/\//g, "-");
const toIsoDate = (value: unknown) => {
  const raw = asText(value);
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct?.[1]) return direct[1];
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
};

async function findStockForInboundItem(item: any) {
  const bcn = asText(item?.bcn || item?.itemName).split(" - ")[0].trim();
  if (!bcn) return null;
  const direct = await adminDb.collection("stocks").doc(sanitizeDocId(bcn)).get();
  if (direct.exists) return { id: direct.id, data: direct.data() };
  const exact = await adminDb.collection("stocks").where("bcn", "==", bcn).limit(1).get();
  if (!exact.empty) {
    const doc = exact.docs[0];
    return { id: doc.id, data: doc.data() };
  }
  return null;
}

export async function syncStockRecord(
  inboundId: string,
  inbound: any,
  queueId?: string
): Promise<"synced" | "skipped"> {
  if (asText(inbound?.zohoStockAdjustmentId || inbound?.zohoId)) return "skipped";

  try {
    const items = Array.isArray(inbound?.items) ? inbound.items : [];
    const receivedItems = items.filter((item: any) => asNumber(item?.receivedQty, 0) > 0);
    if (!receivedItems.length) return "skipped";

    const lineItems = [];
    for (const item of receivedItems) {
      const stock = await findStockForInboundItem(item);
      if (!stock) throw new Error(`Stock item not found for inbound line "${asText(item?.itemName)}".`);
      const itemId =
        asText(item?.zohoItemId || item?.stockDetail?.zohoItemId) ||
        (await resolveZohoItemForStock(stock.id, stock.data, "purchase"));
      lineItems.push({
        itemId,
        quantityAdjusted: asNumber(item?.receivedQty, 0),
        rate: asNumber(item?.rate ?? item?.costPriceRs, 0) || undefined,
        description: asText(item?.itemName || item?.bcn) || undefined,
      });
    }

    const adjustment = await createZohoInventoryAdjustment({
      date: toIsoDate(inbound?.completedAt || inbound?.updatedAt || inbound?.createdAt),
      reason: "Inbound Stock",
      referenceNumber: asText(inbound?.poNumber || inboundId) || inboundId,
      description: `Synced from inbounds/${inboundId}.`,
      lineItems,
    });

    await adminDb.collection("inbounds").doc(inboundId).set(
      successSyncPatch({
        zohoId: adjustment.id,
        zohoNumber: adjustment.number,
        extra: {
          zohoStockAdjustmentId: adjustment.id,
          zohoStockAdjustmentNumber: adjustment.number || null,
        },
      }),
      { merge: true }
    );
    await writeZohoSyncLog({
      queueId,
      entityType: "stock",
      entityId: inboundId,
      status: "synced",
      message: `Zoho stock adjustment ${adjustment.number || adjustment.id} created.`,
    });
    return "synced";
  } catch (error) {
    await adminDb.collection("inbounds").doc(inboundId).set(failureSyncPatch(error), { merge: true });
    throw error;
  }
}

export async function syncPendingStock(options?: ZohoSyncRunOptions): Promise<ZohoSyncResult> {
  const result = emptySyncResult();
  const candidates = await fetchCollectionCandidates("inbounds", options);
  for (const entry of candidates) {
    await runRecordSync({
      entityType: "stock",
      sourceCollection: "inbounds",
      sourceId: entry.id,
      sourcePath: `inbounds/${entry.id}`,
      result,
      sync: (queueId) => syncStockRecord(entry.id, entry.data, queueId),
    });
  }
  return result;
}

