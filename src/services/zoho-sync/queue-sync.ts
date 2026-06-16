import { adminDb } from "@/lib/firebase-admin";
import {
  createZohoSyncQueueEntry,
  markZohoSyncQueueEntry,
  writeZohoSyncLog,
  type ZohoSyncEntityType,
} from "@/lib/zoho-sync/logger";

export type ZohoSyncResult = {
  processed: number;
  synced: number;
  failed: number;
  skipped: number;
  errors: Array<{ id: string; message: string }>;
};

export type ZohoSyncRunOptions = {
  limit?: number;
  includeFailed?: boolean;
  maxRetries?: number;
};

export const DEFAULT_SYNC_LIMIT = 50;
export const DEFAULT_MAX_RETRIES = 3;

const asText = (value: unknown) => String(value ?? "").trim();

export function emptySyncResult(): ZohoSyncResult {
  return { processed: 0, synced: 0, failed: 0, skipped: 0, errors: [] };
}

export function mergeSyncResults(results: ZohoSyncResult[]) {
  return results.reduce((acc, result) => {
    acc.processed += result.processed;
    acc.synced += result.synced;
    acc.failed += result.failed;
    acc.skipped += result.skipped;
    acc.errors.push(...result.errors);
    return acc;
  }, emptySyncResult());
}

export function shouldAttemptZohoSync(data: any, options?: ZohoSyncRunOptions) {
  const status = asText(data?.zohoSyncStatus).toLowerCase();
  const retryCount = Number(data?.zohoRetryCount ?? 0);
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const processingStartedAt = Date.parse(asText(data?.zohoProcessingStartedAt));
  const processingIsStale =
    status === "processing" &&
    (!Number.isFinite(processingStartedAt) || Date.now() - processingStartedAt > 10 * 60 * 1000);

  if (asText(data?.zohoId) || status === "synced") return false;
  if (status === "failed" && !options?.includeFailed) return false;
  if ((status === "failed" || status === "retry_required") && retryCount >= maxRetries) {
    return false;
  }
  return (
    status === "pending" ||
    status === "retry_required" ||
    status === "failed" ||
    processingIsStale ||
    !status
  );
}

export async function fetchCollectionCandidates(
  collectionName: string,
  options?: ZohoSyncRunOptions
) {
  const limit = Math.max(1, Math.min(options?.limit || DEFAULT_SYNC_LIMIT, 250));
  const snap = await adminDb.collection(collectionName).limit(limit).get();
  return snap.docs
    .map((doc: any) => ({ id: doc.id, ref: doc.ref, data: doc.data() }))
    .filter((entry: any) => shouldAttemptZohoSync(entry.data, options));
}

export async function runRecordSync(input: {
  entityType: ZohoSyncEntityType;
  sourceCollection: string;
  sourceId: string;
  sourcePath?: string;
  sync: (queueId: string) => Promise<"synced" | "skipped">;
  result: ZohoSyncResult;
}) {
  input.result.processed += 1;
  const queueId = await createZohoSyncQueueEntry({
    entityType: input.entityType,
    entityId: input.sourceId,
    sourceCollection: input.sourceCollection,
    sourcePath: input.sourcePath,
  });

  try {
    const status = await input.sync(queueId);
    if (status === "skipped") {
      input.result.skipped += 1;
      await markZohoSyncQueueEntry(queueId, "synced", "Skipped.");
      await writeZohoSyncLog({
        queueId,
        entityType: input.entityType,
        entityId: input.sourceId,
        status: "skipped",
        message: "Skipped.",
      });
      return;
    }

    input.result.synced += 1;
    await markZohoSyncQueueEntry(queueId, "synced", "Synced.");
  } catch (error: any) {
    const message = error?.message || "Zoho sync failed.";
    input.result.failed += 1;
    input.result.errors.push({ id: input.sourceId, message });
    await markZohoSyncQueueEntry(queueId, "failed", message);
    await writeZohoSyncLog({
      queueId,
      entityType: input.entityType,
      entityId: input.sourceId,
      status: "failed",
      message,
    });
  }
}
