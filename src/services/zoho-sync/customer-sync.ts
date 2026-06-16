import { adminDb } from "@/lib/firebase-admin";
import { createZohoCustomer, searchZohoCustomers } from "@/lib/zoho-books";
import { saveZohoCustomerMapping } from "@/lib/zoho-sync/customers";
import { failureSyncPatch, successSyncPatch, writeZohoSyncLog } from "@/lib/zoho-sync/logger";
import {
  emptySyncResult,
  fetchCollectionCandidates,
  runRecordSync,
  type ZohoSyncRunOptions,
  type ZohoSyncResult,
} from "./queue-sync";

const asText = (value: unknown) => String(value ?? "").trim();

export async function syncCustomerRecord(
  customerId: string,
  customer: any,
  queueId?: string
): Promise<"synced" | "skipped"> {
  if (asText(customer?.zohoCustomerId || customer?.zohoId)) return "skipped";

  try {
    const name = asText(customer?.name || customer?.customerName || customer?.companyName);
    if (!name) throw new Error("Customer name is missing.");

    const existing = await searchZohoCustomers(name, 20);
    const picked =
      existing.find((row) => asText(row.name).toLowerCase() === name.toLowerCase()) || existing[0];

    const zohoCustomer =
      picked ||
      (await createZohoCustomer({
        contactName: name,
        companyName: asText(customer?.companyName) || undefined,
        email: asText(customer?.email) || undefined,
        phone: asText(customer?.phone || customer?.mobile) || undefined,
        billingAddress: { address: asText(customer?.address) || undefined },
        gstNo: asText(customer?.gstNo || customer?.gstin) || undefined,
      }));

    await saveZohoCustomerMapping({
      sourceCollection: "customers",
      sourceId: customerId,
      zohoCustomer,
    });
    await adminDb.collection("customers").doc(customerId).set(
      successSyncPatch({
        zohoId: zohoCustomer.id,
        extra: {
          zohoCustomerId: zohoCustomer.id,
          zohoCustomerName: zohoCustomer.name,
        },
      }),
      { merge: true }
    );
    await writeZohoSyncLog({
      queueId,
      entityType: "customer",
      entityId: customerId,
      status: "synced",
      message: `Zoho customer ${zohoCustomer.id} synced.`,
    });
    return "synced";
  } catch (error) {
    await adminDb.collection("customers").doc(customerId).set(failureSyncPatch(error), { merge: true });
    throw error;
  }
}

export async function syncPendingCustomers(options?: ZohoSyncRunOptions): Promise<ZohoSyncResult> {
  const result = emptySyncResult();
  const candidates = await fetchCollectionCandidates("customers", options);
  for (const entry of candidates) {
    await runRecordSync({
      entityType: "customer",
      sourceCollection: "customers",
      sourceId: entry.id,
      sourcePath: `customers/${entry.id}`,
      result,
      sync: (queueId) => syncCustomerRecord(entry.id, entry.data, queueId),
    });
  }
  return result;
}

