import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { isVasInvoice } from "@/lib/zoho-sync/invoice-eligibility";
import { getZohoInvoiceBotSettings } from "@/lib/zoho-sync/bot-settings";
import {
  createZohoInvoice,
  searchZohoCustomers,
  searchZohoItems,
  type ZohoCustomer,
  type ZohoItem,
} from "@/lib/zoho-books";

type InvoiceLineCandidate = {
  index: number;
  label: string;
  searchText: string;
  quantity: number;
  rate?: number;
  discountAmount?: number;
  discountPercent?: number;
};

const asText = (value: unknown) => String(value ?? "").trim();

const asNumber = (value: unknown): number => {
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

const toIsoDate = (value: unknown): string => {
  const raw = asText(value);
  if (raw) {
    const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct?.[1]) return direct[1];
  }

  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
};

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
      const label = asText(
        row?.bcn || row?.description || row?.name || row?.itemName || `Line ${index + 1}`
      );
      const searchText = asText(row?.bcn || row?.itemName || row?.description || row?.name);
      const rateValue = row?.exclusiveRate ?? row?.rate;
      const rate = Number.isFinite(Number(rateValue)) ? Number(rateValue) : undefined;
      const discountAmountValue = row?.discountAmount;
      const discountPercentValue = row?.discountPercent ?? row?.discount;
      const discountAmountParsed = Number(discountAmountValue);
      const discountPercentParsed = Number(discountPercentValue);
      const hasDiscountAmount = Number.isFinite(discountAmountParsed) && discountAmountParsed > 0;
      const hasDiscountPercent = Number.isFinite(discountPercentParsed) && discountPercentParsed > 0;
      const computedDiscountAmount =
        !hasDiscountAmount &&
        hasDiscountPercent &&
        typeof rate === "number" &&
        Number.isFinite(rate) &&
        quantity > 0
          ? (rate * quantity * discountPercentParsed) / 100
          : undefined;

      return {
        index: index + 1,
        label,
        searchText: searchText || label,
        quantity,
        rate,
        discountAmount: hasDiscountAmount ? discountAmountParsed : computedDiscountAmount,
        discountPercent: hasDiscountPercent ? discountPercentParsed : undefined,
      };
    })
    .filter((line: InvoiceLineCandidate) => line.quantity > 0);
};

const pickBestCustomer = (
  customers: ZohoCustomer[],
  customerName: string,
  gstin: string
): ZohoCustomer | undefined => {
  if (!customers.length) return undefined;
  const nameKey = normalizeKey(customerName);
  const gstKey = asText(gstin).toUpperCase();

  if (gstKey) {
    const byGst = customers.find((customer) => asText(customer.gstNo).toUpperCase() === gstKey);
    if (byGst) return byGst;
  }

  const exact = customers.find((customer) => normalizeKey(customer.name) === nameKey);
  if (exact) return exact;

  const prefix = customers.find((customer) => normalizeKey(customer.name).startsWith(nameKey));
  if (prefix) return prefix;

  const contains = customers.find((customer) => normalizeKey(customer.name).includes(nameKey));
  return contains || customers[0];
};

const pickBestItem = (items: ZohoItem[], line: InvoiceLineCandidate): ZohoItem | undefined => {
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

export async function POST(req: NextRequest) {
  try {
    const settings = await getZohoInvoiceBotSettings();
    if (!settings.enabled) {
      return NextResponse.json(
        {
          error:
            "Automated Zoho invoicing is inactive. The invoice remains available only in Mo Track.",
        },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const invoiceId = asText(body?.invoiceId);
    const force = body?.force === true;
    const customerIdOverride = asText(body?.customerId);
    const customerNameOverride = asText(body?.customerName);

    if (!invoiceId) {
      return NextResponse.json({ error: "invoiceId is required." }, { status: 400 });
    }

    const invoiceRef = adminDb.collection("invoices").doc(invoiceId);
    const invoiceSnap = await invoiceRef.get();
    if (!invoiceSnap.exists) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const invoice = { id: invoiceSnap.id, ...(invoiceSnap.data() as Record<string, unknown>) } as any;
    if (isVasInvoice(invoice)) {
      await invoiceRef.set(
        {
          zohoSyncStatus: "not_applicable",
          zohoSyncError: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return NextResponse.json(
        { error: "VAS invoices are recorded only in Mo Track and cannot be sent to Zoho." },
        { status: 400 }
      );
    }

    const existingZohoInvoiceNo = asText(invoice?.zohoInvoiceNo || invoice?.tallyVoucherNo);
    const existingZohoInvoiceId = asText(invoice?.zohoInvoiceId);

    if (existingZohoInvoiceNo && existingZohoInvoiceId && !force) {
      return NextResponse.json({
        invoice: {
          id: existingZohoInvoiceId,
          number: existingZohoInvoiceNo,
          customerId: asText(invoice?.zohoCustomerId),
          customerName: asText(invoice?.zohoCustomerName) || undefined,
        },
        reused: true,
      });
    }

    const customerName = asText(invoice?.customerSnapshot?.name || invoice?.customer?.name);
    const customerGstin = asText(
      invoice?.customerSnapshot?.billingDetails?.gstin || invoice?.customerSnapshot?.gstin
    );

    let selectedCustomerId = customerIdOverride || asText(invoice?.zohoCustomerId);
    let selectedCustomerName = customerNameOverride || asText(invoice?.zohoCustomerName);

    if (!selectedCustomerId) {
      if (!customerName) {
        throw new Error("Invoice customer name is missing. Unable to map Zoho customer.");
      }

      const customers = await searchZohoCustomers(customerName, 25);
      const picked = pickBestCustomer(customers, customerName, customerGstin);
      if (!picked) {
        throw new Error(`No Zoho customer found for "${customerName}".`);
      }

      selectedCustomerId = picked.id;
      selectedCustomerName = picked.name;
    }

    const lineCandidates = buildLineCandidates(invoice);
    if (!lineCandidates.length) {
      throw new Error("Invoice has no valid line items to regenerate in Zoho.");
    }

    const itemSearchCache = new Map<string, ZohoItem[]>();
    const unresolvedLines: string[] = [];
    const mappedLines: Array<{
      itemId: string;
      quantity: number;
      rate?: number;
      discountAmount?: number;
      discountPercent?: number;
      description?: string;
      taxId?: string;
    }> = [];

    for (const line of lineCandidates) {
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

      if (!items.length && normalizeKey(line.label) !== normalizeKey(query)) {
        const labelKey = line.label.toLowerCase();
        items = itemSearchCache.get(labelKey);
        if (!items) {
          items = await searchZohoItems(line.label, { usage: "sales", limit: 40 });
          itemSearchCache.set(labelKey, items);
        }
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
      throw new Error(
        `Unable to map ${unresolvedLines.length} line item(s) to Zoho: ${unresolvedLines
          .slice(0, 8)
          .join(", ")}.`
      );
    }

    const created = await createZohoInvoice({
      customerId: selectedCustomerId,
      store: asText(invoice?.storeName || invoice?.store),
      salesperson: asText(
        invoice?.salesPerson || invoice?.salesperson || invoice?.createdBy?.name || invoice?.createdBy
      ),
      invoiceNumber: existingZohoInvoiceNo || undefined,
      date: toIsoDate(invoice?.invoiceDate || invoice?.createdAt),
      referenceNumber: asText(invoice?.orderNo || invoice?.orderId || invoice?.id) || undefined,
      notes: `Regenerated from invoice history (${asText(invoice?.invoiceNo || invoiceId)}).`,
      adjustment: asNumber(invoice?.totals?.roundOff),
      adjustmentDescription: "Round Off",
      lineItems: mappedLines,
    });

    await invoiceRef.set(
      {
        zohoCustomerId: created.customerId || selectedCustomerId,
        zohoCustomerName: created.customerName || selectedCustomerName || undefined,
        zohoInvoiceId: created.id,
        zohoInvoiceNo: created.number,
        tallyVoucherNo: created.number,
        zohoSyncStatus: "synced",
        zohoSyncError: null,
        zohoSyncedAt: new Date().toISOString(),
        zohoId: created.id,
        zohoNumber: created.number,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({ invoice: created, reused: false });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to regenerate Zoho voucher from invoice history." },
      { status: 500 }
    );
  }
}
