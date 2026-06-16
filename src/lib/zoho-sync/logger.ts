import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

export type ZohoSyncEntityType =
  | "product"
  | "purchase"
  | "invoice"
  | "stock"
  | "customer"
  | "vendor"
  | "debitNote";
export type ZohoSyncStatus =
  | "pending"
  | "processing"
  | "synced"
  | "retry_required"
  | "failed"
  | "not_applicable"
  | "local_only";

export const ZOHO_SYNC_QUEUE_COLLECTION = "zohoSyncQueue";
export const ZOHO_SYNC_LOGS_COLLECTION = "zohoSyncLogs";

const asText = (value: unknown) => String(value ?? "").trim();

export function nowIso() {
  return new Date().toISOString();
}

export function optionalSyncDefaults() {
  return {
    zohoSyncStatus: "pending" as ZohoSyncStatus,
    zohoSyncError: null,
    zohoSyncedAt: null,
    zohoId: null,
    zohoNumber: null,
    zohoRetryCount: 0,
  };
}

export function successSyncPatch(input: {
  zohoId?: string | null;
  zohoNumber?: string | null;
  extra?: Record<string, unknown>;
}) {
  const syncedAt = nowIso();
  return {
    zohoSyncStatus: "synced" as ZohoSyncStatus,
    zohoSyncError: null,
    zohoSyncedAt: syncedAt,
    zohoId: asText(input.zohoId) || null,
    zohoNumber: asText(input.zohoNumber) || null,
    updatedAt: syncedAt,
    ...(input.extra || {}),
  };
}

export function failureSyncPatch(error: unknown) {
  const message = error instanceof Error ? error.message : asText(error) || "Zoho sync failed.";
  return {
    zohoSyncStatus: "failed" as ZohoSyncStatus,
    zohoSyncError: message,
    zohoRetryCount: FieldValue.increment(1),
    updatedAt: nowIso(),
  };
}

export async function writeZohoSyncLog(input: {
  entityType: ZohoSyncEntityType;
  entityId: string;
  status: ZohoSyncStatus | "skipped";
  message: string;
  queueId?: string;
  details?: Record<string, unknown>;
}) {
  const createdAt = nowIso();
  await adminDb.collection(ZOHO_SYNC_LOGS_COLLECTION).add({
    ...input,
    createdAt,
  });
}

export async function createZohoSyncQueueEntry(input: {
  entityType: ZohoSyncEntityType;
  entityId: string;
  sourceCollection: string;
  sourcePath?: string;
}) {
  const now = nowIso();
  const queueRef = adminDb.collection(ZOHO_SYNC_QUEUE_COLLECTION).doc();
  await queueRef.set({
    ...input,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  });
  return queueRef.id;
}

export async function markZohoSyncQueueEntry(
  queueId: string,
  status: ZohoSyncStatus,
  message?: string
) {
  if (!queueId) return;
  await adminDb.collection(ZOHO_SYNC_QUEUE_COLLECTION).doc(queueId).set(
    {
      status,
      message: asText(message) || null,
      attempts: FieldValue.increment(1),
      updatedAt: nowIso(),
    },
    { merge: true }
  );
}
