import "server-only";

import { adminDb } from "@/lib/firebase-admin";

export const ZOHO_INVOICE_BOT_SETTINGS_COLLECTION = "integrationSettings";
export const ZOHO_INVOICE_BOT_SETTINGS_ID = "zohoInvoiceBot";

export type ZohoInvoiceBotSettings = {
  enabled: boolean;
  updatedAt?: string | null;
  updatedBy?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
  } | null;
  lastRunAt?: string | null;
  lastRunStatus?: "success" | "partial" | "failed" | "disabled" | null;
  lastRunSummary?: {
    processed: number;
    synced: number;
    failed: number;
    skipped: number;
  } | null;
  lastRunError?: string | null;
};

const settingsRef = () =>
  adminDb
    .collection(ZOHO_INVOICE_BOT_SETTINGS_COLLECTION)
    .doc(ZOHO_INVOICE_BOT_SETTINGS_ID);

export async function getZohoInvoiceBotSettings(): Promise<ZohoInvoiceBotSettings> {
  const snapshot = await settingsRef().get();
  const data = snapshot.exists ? snapshot.data() || {} : {};

  return {
    enabled: data.enabled === true,
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || null,
    lastRunAt: data.lastRunAt || null,
    lastRunStatus: data.lastRunStatus || null,
    lastRunSummary: data.lastRunSummary || null,
    lastRunError: data.lastRunError || null,
  };
}

export async function setZohoInvoiceBotEnabled(input: {
  enabled: boolean;
  actor: NonNullable<ZohoInvoiceBotSettings["updatedBy"]>;
}) {
  const updatedAt = new Date().toISOString();
  await settingsRef().set(
    {
      enabled: input.enabled,
      updatedAt,
      updatedBy: input.actor,
    },
    { merge: true }
  );

  return getZohoInvoiceBotSettings();
}

export async function recordZohoInvoiceBotRun(input: {
  status: NonNullable<ZohoInvoiceBotSettings["lastRunStatus"]>;
  summary?: NonNullable<ZohoInvoiceBotSettings["lastRunSummary"]>;
  error?: string | null;
}) {
  await settingsRef().set(
    {
      lastRunAt: new Date().toISOString(),
      lastRunStatus: input.status,
      lastRunSummary: input.summary || null,
      lastRunError: input.error || null,
    },
    { merge: true }
  );
}
