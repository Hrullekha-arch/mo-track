import "server-only";

import { adminDb } from "@/lib/firebase-admin";

export const ZOHO_INVOICE_BOT_SETTINGS_COLLECTION = "integrationSettings";
export const ZOHO_INVOICE_BOT_SETTINGS_ID = "zohoInvoiceBot";
export const ZOHO_PURCHASE_BOT_SETTINGS_ID = "zohoPurchaseBot";

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

export type ZohoPurchaseBotSettings = ZohoInvoiceBotSettings;

const settingsRef = (settingsId = ZOHO_INVOICE_BOT_SETTINGS_ID) =>
  adminDb
    .collection(ZOHO_INVOICE_BOT_SETTINGS_COLLECTION)
    .doc(settingsId);

const mapSettings = (data: Record<string, any> | undefined): ZohoInvoiceBotSettings => ({
  enabled: data?.enabled === true,
  updatedAt: data?.updatedAt || null,
  updatedBy: data?.updatedBy || null,
  lastRunAt: data?.lastRunAt || null,
  lastRunStatus: data?.lastRunStatus || null,
  lastRunSummary: data?.lastRunSummary || null,
  lastRunError: data?.lastRunError || null,
});

export async function getZohoInvoiceBotSettings(): Promise<ZohoInvoiceBotSettings> {
  const snapshot = await settingsRef().get();
  const data = snapshot.exists ? snapshot.data() || {} : {};

  return mapSettings(data);
}

export async function getZohoPurchaseBotSettings(): Promise<ZohoPurchaseBotSettings> {
  const snapshot = await settingsRef(ZOHO_PURCHASE_BOT_SETTINGS_ID).get();
  const data = snapshot.exists ? snapshot.data() || {} : {};

  return mapSettings(data);
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

export async function setZohoPurchaseBotEnabled(input: {
  enabled: boolean;
  actor: NonNullable<ZohoPurchaseBotSettings["updatedBy"]>;
}) {
  const updatedAt = new Date().toISOString();
  await settingsRef(ZOHO_PURCHASE_BOT_SETTINGS_ID).set(
    {
      enabled: input.enabled,
      updatedAt,
      updatedBy: input.actor,
    },
    { merge: true }
  );

  return getZohoPurchaseBotSettings();
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

export async function recordZohoPurchaseBotRun(input: {
  status: NonNullable<ZohoPurchaseBotSettings["lastRunStatus"]>;
  summary?: NonNullable<ZohoPurchaseBotSettings["lastRunSummary"]>;
  error?: string | null;
}) {
  await settingsRef(ZOHO_PURCHASE_BOT_SETTINGS_ID).set(
    {
      lastRunAt: new Date().toISOString(),
      lastRunStatus: input.status,
      lastRunSummary: input.summary || null,
      lastRunError: input.error || null,
    },
    { merge: true }
  );
}
