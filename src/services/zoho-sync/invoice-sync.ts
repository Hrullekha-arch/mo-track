import { adminDb } from "@/lib/firebase-admin";
import { searchZohoItems, type ZohoItem } from "@/lib/zoho-books";
import { createZohoInvoice } from "@/lib/zoho-sync/invoices";
import { resolveZohoCustomerForInvoice } from "@/lib/zoho-sync/customers";
import { isVasInvoice } from "@/lib/zoho-sync/invoice-eligibility";
import { failureSyncPatch, successSyncPatch, writeZohoSyncLog } from "@/lib/zoho-sync/logger";
import {
  DEFAULT_MAX_RETRIES,
  emptySyncResult,
  runRecordSync,
  shouldAttemptZohoSync,
  type ZohoSyncRunOptions,
  type ZohoSyncResult,
} from "./queue-sync";

type InvoiceLineCandidate = {
  index: number;
  label: string;
  searchText: string;
  zohoItemId?: string;
  zohoTaxId?: string;
  quantity: number;
  rate?: number;
  discountAmount?: number;
  discountPercent?: number;
};

const asText = (value: unknown) => String(value ?? "").trim();
const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const normalizeKey = (value: unknown) =>
  asText(value)
    .toLowerCase()
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s/-]/g, "")
    .trim();
const toIsoDate = (value: unknown) => {
  const raw = asText(value);
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct?.[1]) return direct[1];
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
};

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

const getInvoiceRows = (invoice: any) => {
  const rows = Array.isArray(invoice?.items) && invoice.items.length > 0
    ? invoice.items
    : [
        ...(Array.isArray(invoice?.sections?.NORMAL?.items)
          ? invoice.sections.NORMAL.items
          : []),
        ...(Array.isArray(invoice?.sections?.VAS?.items)
          ? invoice.sections.VAS.items
          : []),
      ];
  return rows;
};

export function validateInvoiceForZoho(invoice: any) {
  const issues: string[] = [];
  const approvalStatus = asText(invoice?.approvalStatus).toLowerCase();
  const isApprovedLegacyInvoice = invoice?.status === "ISSUED" && invoice?.isLocked === true;
  if (approvalStatus !== "approved" && !isApprovedLegacyInvoice) {
    issues.push("Invoice is not approved.");
  }

  const customerName = asText(invoice?.customerSnapshot?.name || invoice?.customer?.name);
  if (!customerName) issues.push("Customer name is missing.");

  const customerGstin = asText(
    invoice?.customerSnapshot?.billingDetails?.gstin || invoice?.customerSnapshot?.gstin
  ).toUpperCase();
  if (customerGstin && !GSTIN_PATTERN.test(customerGstin)) {
    issues.push("Customer GSTIN is invalid.");
  }

  const sellerGstin = asText(invoice?.sellerSnapshot?.gstin).toUpperCase();
  if (sellerGstin && !GSTIN_PATTERN.test(sellerGstin)) {
    issues.push("Seller GSTIN is invalid.");
  }

  const rows = getInvoiceRows(invoice);
  let calculatedTotal = 0;
  if (!rows.length) issues.push("Invoice has no product lines.");
  rows.forEach((row: any, index: number) => {
    const quantity = asNumber(row?.qty ?? row?.quantity ?? row?.quantityAllocated);
    const rate = asNumber(row?.exclusiveRate ?? row?.rate);
    const label = asText(row?.bcn || row?.itemName || row?.description || row?.name);
    const gst = Number(row?.gst ?? row?.gstPercent ?? 0);
    if (!label) issues.push(`Product line ${index + 1} has no item name or BCN.`);
    if (quantity <= 0) issues.push(`Product line ${index + 1} has an invalid quantity.`);
    if (rate < 0) issues.push(`Product line ${index + 1} has an invalid rate.`);
    if (!Number.isFinite(gst) || gst < 0 || gst > 100) {
      issues.push(`Product line ${index + 1} has invalid GST information.`);
    }

    const storedLineTotal = Number(row?.totalAmount ?? row?.total);
    if (Number.isFinite(storedLineTotal)) {
      calculatedTotal += storedLineTotal;
    } else {
      const discountPercent = asNumber(row?.discountPercent ?? row?.discount);
      const taxable = Math.max(0, quantity * rate * (1 - discountPercent / 100));
      calculatedTotal += taxable * (1 + (Number.isFinite(gst) ? gst : 0) / 100);
    }
  });

  const grandTotal = asNumber(
    invoice?.totals?.grandTotal ?? invoice?.overallSummary?.grandTotal
  );
  if (grandTotal <= 0) issues.push("Invoice amount must be greater than zero.");
  if (grandTotal > 0 && rows.length > 0 && Math.abs(calculatedTotal - grandTotal) > 1) {
    issues.push("Invoice line totals do not match the invoice amount.");
  }

  const stockStatus = asText(invoice?.stockAllocationStatus).toLowerCase();
  const hasGoods = Array.isArray(invoice?.sections?.NORMAL?.items)
    ? invoice.sections.NORMAL.items.length > 0
    : rows.some((row: any) => asText(row?.type).toUpperCase() !== "VAS");
  if (
    hasGoods &&
    invoice?.stockAllocationValidated !== true &&
    !["allocated", "verified", "verified_override"].includes(stockStatus)
  ) {
    issues.push("Stock allocation has not been validated.");
  }

  return { ok: issues.length === 0, issues };
}

const buildLineCandidates = (invoice: any): InvoiceLineCandidate[] => {
  const fromItems = Array.isArray(invoice?.items) ? invoice.items : [];
  const fromSections = [
    ...(Array.isArray(invoice?.sections?.NORMAL?.items) ? invoice.sections.NORMAL.items : []),
    ...(Array.isArray(invoice?.sections?.VAS?.items) ? invoice.sections.VAS.items : []),
  ];
  const rows = fromItems.length > 0 ? fromItems : fromSections;

  return rows
    .map((row: any, index: number) => {
      const quantity = asNumber(row?.qty ?? row?.quantity ?? row?.quantityAllocated);
      const label = asText(row?.bcn || row?.description || row?.name || row?.itemName || `Line ${index + 1}`);
      const searchText = asText(row?.bcn || row?.itemName || row?.description || row?.name);
      const rateValue = row?.exclusiveRate ?? row?.rate;
      const rate = Number.isFinite(Number(rateValue)) ? Number(rateValue) : undefined;
      const discountAmountParsed = Number(row?.discountAmount);
      const discountPercentParsed = Number(row?.discountPercent ?? row?.discount);
      const hasDiscountAmount = Number.isFinite(discountAmountParsed) && discountAmountParsed > 0;
      const hasDiscountPercent = Number.isFinite(discountPercentParsed) && discountPercentParsed > 0;
      const computedDiscountAmount =
        !hasDiscountAmount && hasDiscountPercent && typeof rate === "number" && quantity > 0
          ? (rate * quantity * discountPercentParsed) / 100
          : undefined;

      return {
        index: index + 1,
        label,
        searchText: searchText || label,
        zohoItemId: asText(row?.zohoItemId),
        zohoTaxId: asText(row?.zohoTaxId || row?.taxId),
        quantity,
        rate,
        discountAmount: hasDiscountAmount ? discountAmountParsed : computedDiscountAmount,
        discountPercent: hasDiscountPercent ? discountPercentParsed : undefined,
      };
    })
    .filter((line: InvoiceLineCandidate) => line.quantity > 0);
};

const pickBestItem = (items: ZohoItem[], line: InvoiceLineCandidate) => {
  if (!items.length) return undefined;
  const needle = normalizeKey(line.searchText);
  const labelNeedle = normalizeKey(line.label);
  return (
    items
      .map((item) => {
        const skuKey = normalizeKey(item.sku);
        const nameKey = normalizeKey(item.name);
        const score =
          (skuKey === needle ? 200 : 0) +
          (skuKey.startsWith(needle) ? 120 : 0) +
          (skuKey.includes(needle) ? 60 : 0) +
          (nameKey === needle ? 90 : 0) +
          (nameKey.startsWith(needle) ? 50 : 0) +
          (nameKey.includes(needle) ? 25 : 0) +
          (nameKey === labelNeedle ? 15 : 0);
        return { item, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.item || items[0]
  );
};

export async function syncInvoiceRecord(
  invoiceId: string,
  invoice: any,
  queueId?: string
): Promise<"synced" | "skipped"> {
  if (asText(invoice?.zohoInvoiceId || invoice?.zohoId)) return "skipped";
  if (isVasInvoice(invoice)) {
    await adminDb.collection("invoices").doc(invoiceId).set(
      {
        zohoSyncStatus: "not_applicable",
        zohoSyncError: null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return "skipped";
  }

  const invoiceRef = adminDb.collection("invoices").doc(invoiceId);
  const claimResult = await adminDb.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(invoiceRef);
    if (!snapshot.exists) return null;
    const current = snapshot.data() || {};
    if (!shouldAttemptZohoSync(current, { includeFailed: true })) return null;

    const validation = validateInvoiceForZoho(current);
    if (!validation.ok) {
      const retryCount = Number(current.zohoRetryCount || 0) + 1;
      transaction.set(
        invoiceRef,
        {
          zohoSyncStatus:
            retryCount >= DEFAULT_MAX_RETRIES ? "failed" : "retry_required",
          zohoSyncError: validation.issues.join(" "),
          zohoRetryCount: retryCount,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return { validationError: validation.issues.join(" ") };
    }

    transaction.set(
      invoiceRef,
      {
        zohoSyncStatus: "processing",
        zohoSyncError: null,
        zohoProcessingStartedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return { invoice: current };
  });

  if (!claimResult) return "skipped";
  if (claimResult.validationError) {
    throw new Error(claimResult.validationError);
  }
  invoice = claimResult.invoice;

  try {
    const customer = await resolveZohoCustomerForInvoice(invoiceId, invoice);
    const lineCandidates = buildLineCandidates(invoice);
    if (!lineCandidates.length) throw new Error("Invoice has no valid line items.");

    const itemSearchCache = new Map<string, ZohoItem[]>();
    const unresolvedLines: string[] = [];
    const mappedLines = [];

    for (const line of lineCandidates) {
      if (line.zohoItemId) {
        mappedLines.push({
          itemId: line.zohoItemId,
          quantity: line.quantity,
          rate: line.rate,
          discountAmount: line.discountAmount,
          discountPercent: line.discountPercent,
          description: line.label,
          taxId: line.zohoTaxId || undefined,
        });
        continue;
      }

      const query = asText(line.searchText);
      if (!query || query.length < 2) {
        unresolvedLines.push(`#${line.index} ${line.label}`);
        continue;
      }

      const cacheKey = query.toLowerCase();
      let items = itemSearchCache.get(cacheKey);
      if (!items) {
        items = await searchZohoItems(query, { usage: "sales", limit: 40 });
        itemSearchCache.set(cacheKey, items);
      }
      const picked = pickBestItem(items || [], line);
      if (!picked?.id) {
        unresolvedLines.push(`#${line.index} ${line.label}`);
        continue;
      }

      mappedLines.push({
        itemId: picked.id,
        quantity: line.quantity,
        rate: line.rate,
        discountAmount: line.discountAmount,
        discountPercent: line.discountPercent,
        description: line.label,
        taxId: asText(picked.taxId) || undefined,
      });
    }

    if (unresolvedLines.length > 0) {
      throw new Error(`Unable to map invoice line item(s) to Zoho: ${unresolvedLines.slice(0, 8).join(", ")}.`);
    }

    const created = await createZohoInvoice({
      customerId: customer.id,
      store: asText(invoice?.storeName || invoice?.store) || undefined,
      salesperson: asText(invoice?.salesPerson || invoice?.salesperson || invoice?.createdBy) || undefined,
      invoiceNumber:
        asText(
          invoice?.zohoRequestedInvoiceNo ||
            invoice?.zohoInvoiceNo ||
            invoice?.tallyVoucherNo
        ) || undefined,
      date: toIsoDate(invoice?.invoiceDate || invoice?.createdAt),
      referenceNumber: asText(invoice?.orderNo || invoice?.orderId || invoiceId) || undefined,
      notes: `Synced from invoices/${invoiceId}.`,
      adjustment: Number(invoice?.totals?.roundOff) || undefined,
      adjustmentDescription: "Round Off",
      lineItems: mappedLines,
    });

    await adminDb.collection("invoices").doc(invoiceId).set(
      successSyncPatch({
        zohoId: created.id,
        zohoNumber: created.number,
        extra: {
          zohoCustomerId: created.customerId || customer.id,
          zohoCustomerName: created.customerName || customer.name || undefined,
          zohoInvoiceId: created.id,
          zohoInvoiceNo: created.number,
          tallyVoucherNo: created.number,
          zohoStatus: created.status || "created",
          zohoProcessingStartedAt: null,
        },
      }),
      { merge: true }
    );
    await writeZohoSyncLog({
      queueId,
      entityType: "invoice",
      entityId: invoiceId,
      status: "synced",
      message: `Zoho invoice ${created.number} created.`,
    });
    return "synced";
  } catch (error) {
    const retryCount = Number(invoice?.zohoRetryCount || 0) + 1;
    await invoiceRef.set(
      {
        ...failureSyncPatch(error),
        zohoSyncStatus:
          retryCount >= DEFAULT_MAX_RETRIES ? "failed" : "retry_required",
        zohoRetryCount: retryCount,
        zohoProcessingStartedAt: null,
      },
      { merge: true }
    );
    throw error;
  }
}

export async function syncPendingInvoices(options?: ZohoSyncRunOptions): Promise<ZohoSyncResult> {
  const result = emptySyncResult();
  const limit = Math.max(1, Math.min(options?.limit || 50, 250));
  const statuses = options?.includeFailed
    ? ["pending", "retry_required", "processing", "failed"]
    : ["pending", "retry_required", "processing"];
  const snapshot = await adminDb
    .collection("invoices")
    .where("zohoSyncStatus", "in", statuses)
    .limit(limit * 2)
    .get();
  const candidates = snapshot.docs
    .map((doc: any) => ({ id: doc.id, ref: doc.ref, data: doc.data() }))
    .filter((entry: any) => shouldAttemptZohoSync(entry.data, options))
    .slice(0, limit);
  for (const entry of candidates) {
    if (isVasInvoice(entry.data)) {
      await entry.ref.set(
        {
          zohoSyncStatus: "not_applicable",
          zohoSyncError: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      result.processed += 1;
      result.skipped += 1;
      continue;
    }

    await runRecordSync({
      entityType: "invoice",
      sourceCollection: "invoices",
      sourceId: entry.id,
      sourcePath: `invoices/${entry.id}`,
      result,
      sync: (queueId) => syncInvoiceRecord(entry.id, entry.data, queueId),
    });
  }
  return result;
}

export async function syncInvoiceById(
  invoiceId: string,
  options?: ZohoSyncRunOptions
): Promise<ZohoSyncResult> {
  const result = emptySyncResult();
  const invoiceRef = adminDb.collection("invoices").doc(invoiceId);
  const snapshot = await invoiceRef.get();
  if (!snapshot.exists) {
    result.failed = 1;
    result.errors.push({ id: invoiceId, message: "Invoice not found." });
    return result;
  }

  const data = snapshot.data() || {};
  if (!shouldAttemptZohoSync(data, options)) {
    result.processed = 1;
    result.skipped = 1;
    return result;
  }

  await runRecordSync({
    entityType: "invoice",
    sourceCollection: "invoices",
    sourceId: invoiceId,
    sourcePath: `invoices/${invoiceId}`,
    result,
    sync: (queueId) => syncInvoiceRecord(invoiceId, data, queueId),
  });
  return result;
}
