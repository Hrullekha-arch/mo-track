import { adminDb } from "@/lib/firebase-admin";
import {
  createZohoPurchaseOrder,
  getZohoPurchaseOrder,
  updateZohoPurchaseOrder,
} from "@/lib/zoho-sync/purchase-orders";
import { resolveZohoItemForStock } from "@/lib/zoho-sync/items";
import { resolveZohoVendorId } from "@/lib/zoho-sync/vendors";
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
const today = () => new Date().toISOString().slice(0, 10);

const buildPurchaseOrderNumber = (requestId: string, request: any) => {
  const fabricDetails = Array.isArray(request?.fabricDetails) ? request.fabricDetails : [];
  const linePoNumber = fabricDetails
    .map((line: any) => asText(line?.poNumber))
    .find(Boolean);
  const existing = asText(
    request?.zohoRequestedPurchaseOrderNumber ||
      request?.zohoPurchaseOrderNumber ||
      request?.poNumber ||
      linePoNumber
  );
  if (existing) return existing;

  const idPart = asText(requestId).replace(/[^a-z0-9]/gi, "").slice(0, 18).toUpperCase();
  return `MT-PO-${idPart || "REQUEST"}`;
};

async function findStockForLine(line: any) {
  const bcn = asText(line?.bcn || line?.itemName || line?.fabricName).split(" - ")[0].trim();
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

export async function syncPurchaseRecord(
  requestId: string,
  request: any,
  queueId?: string
): Promise<"synced" | "skipped"> {
  try {
    const vendorId = await resolveZohoVendorId(requestId, request);
    const fabricDetails = Array.isArray(request?.fabricDetails) ? request.fabricDetails : [];
    const lineItems = [];

    for (const line of fabricDetails) {
      const qty = asNumber(line?.quantity ?? line?.neededQty ?? line?.qty, 0);
      if (qty <= 0) continue;

      const explicitZohoItemId = asText(line?.zohoItemId);
      let itemId = explicitZohoItemId;
      if (!itemId) {
        const stock = await findStockForLine(line);
        if (!stock) {
          throw new Error(`Stock item not found for PO line "${asText(line?.fabricName || line?.itemName)}".`);
        }
        itemId = await resolveZohoItemForStock(stock.id, stock.data, "purchase");
      }

      lineItems.push({
        itemId,
        quantity: qty,
        rate: asNumber(line?.rate ?? line?.costPriceRs, 0) || undefined,
        description: asText(line?.fabricName || line?.itemName || line?.bcn) || undefined,
      });
    }

    if (!lineItems.length) throw new Error("No valid PO line items found.");

    const existingPurchaseOrderId = asText(request?.zohoPurchaseOrderId || request?.zohoId);
    const purchaseOrderNumber = buildPurchaseOrderNumber(requestId, request);
    if (!existingPurchaseOrderId) {
      await adminDb.collection("purchaseRequests").doc(requestId).set(
        {
          zohoRequestedPurchaseOrderNumber: purchaseOrderNumber,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
    const po = existingPurchaseOrderId
      ? await (async () => {
          const currentPo = await getZohoPurchaseOrder(existingPurchaseOrderId);
          const quantitiesByItemId = new Map<string, number[]>();
          lineItems.forEach((line) => {
            if (!quantitiesByItemId.has(line.itemId)) quantitiesByItemId.set(line.itemId, []);
            quantitiesByItemId.get(line.itemId)!.push(line.quantity);
          });
          return updateZohoPurchaseOrder({
            purchaseOrderId: existingPurchaseOrderId,
            vendorId: currentPo.vendorId || vendorId,
            date: currentPo.date || today(),
            deliveryDate: asText(request?.promiseDeliveryDate) || currentPo.deliveryDate,
            referenceNumber: asText(request?.tallyPoNumber),
            notes: currentPo.notes || `Synced from purchaseRequests/${requestId}.`,
            lineItems: currentPo.lineItems.map((line) => ({
              ...line,
              quantity: quantitiesByItemId.get(line.itemId)?.shift() || line.quantity,
            })),
          });
        })()
      : await createZohoPurchaseOrder({
          vendorId,
          purchaseOrderNumber,
          date: today(),
          deliveryDate: asText(request?.promiseDeliveryDate) || undefined,
          referenceNumber: asText(request?.tallyPoNumber || request?.quotationNo || request?.dealId) ||
            undefined,
          notes: `Synced from purchaseRequests/${requestId}.`,
          lineItems,
        });

    await adminDb.collection("purchaseRequests").doc(requestId).set(
      successSyncPatch({
        zohoId: po.id,
        zohoNumber: po.number,
        extra: {
          zohoVendorId: po.vendorId || vendorId,
          zohoPurchaseOrderId: po.id,
          zohoPurchaseOrderNumber: po.number,
          zohoRequestedPurchaseOrderNumber: purchaseOrderNumber,
        },
      }),
      { merge: true }
    );
    await writeZohoSyncLog({
      queueId,
      entityType: "purchase",
      entityId: requestId,
      status: "synced",
      message: `Zoho purchase order ${po.number} ${existingPurchaseOrderId ? "updated" : "created"}.`,
    });
    return "synced";
  } catch (error) {
    await adminDb.collection("purchaseRequests").doc(requestId).set(failureSyncPatch(error), {
      merge: true,
    });
    throw error;
  }
}

export async function syncPendingPurchases(options?: ZohoSyncRunOptions): Promise<ZohoSyncResult> {
  const result = emptySyncResult();
  const candidates = await fetchCollectionCandidates("purchaseRequests", options);
  for (const entry of candidates) {
    await runRecordSync({
      entityType: "purchase",
      sourceCollection: "purchaseRequests",
      sourceId: entry.id,
      sourcePath: `purchaseRequests/${entry.id}`,
      result,
      sync: (queueId) => syncPurchaseRecord(entry.id, entry.data, queueId),
    });
  }
  return result;
}
