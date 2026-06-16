import { adminDb } from "@/lib/firebase-admin";
import { createZohoItemFromStock } from "@/lib/zoho-sync/items";
import { failureSyncPatch, successSyncPatch, writeZohoSyncLog } from "@/lib/zoho-sync/logger";
import {
  emptySyncResult,
  fetchCollectionCandidates,
  runRecordSync,
  type ZohoSyncRunOptions,
  type ZohoSyncResult,
} from "./queue-sync";

const asText = (value: unknown) => String(value ?? "").trim();

export async function syncProductRecord(
  collectionName: "stocks" | "products",
  stockId: string,
  stock: any,
  queueId?: string
): Promise<"synced" | "skipped"> {
  const existingZohoItemId = asText(stock?.zohoItemId || stock?.zohoId);
  if (existingZohoItemId) return "skipped";

  try {
    const item = await createZohoItemFromStock(stockId, stock, collectionName);
    await adminDb.collection(collectionName).doc(stockId).set(
      successSyncPatch({
        zohoId: item.id,
        extra: {
          zohoItemId: item.id,
          zohoItemName: item.name,
        },
      }),
      { merge: true }
    );
    await writeZohoSyncLog({
      queueId,
      entityType: "product",
      entityId: stockId,
      status: "synced",
      message: `Zoho item ${item.id} created.`,
    });
    return "synced";
  } catch (error) {
    await adminDb.collection(collectionName).doc(stockId).set(failureSyncPatch(error), { merge: true });
    throw error;
  }
}

export async function syncPendingProducts(options?: ZohoSyncRunOptions): Promise<ZohoSyncResult> {
  const result = emptySyncResult();
  for (const collectionName of ["stocks", "products"] as const) {
    const candidates = await fetchCollectionCandidates(collectionName, options);
    for (const entry of candidates) {
      await runRecordSync({
        entityType: "product",
        sourceCollection: collectionName,
        sourceId: entry.id,
        sourcePath: `${collectionName}/${entry.id}`,
        result,
        sync: (queueId) => syncProductRecord(collectionName, entry.id, entry.data, queueId),
      });
    }
  }
  return result;
}
