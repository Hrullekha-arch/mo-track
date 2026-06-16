import { adminDb } from "@/lib/firebase-admin";
import {
  createZohoCustomer,
  searchZohoCustomers,
  type CreatedZohoCustomer,
  type ZohoCustomer,
} from "@/lib/zoho-books";

export const ZOHO_CUSTOMER_MAPPINGS_COLLECTION = "zohoCustomerMappings";

const asText = (value: unknown) => String(value ?? "").trim();

export async function saveZohoCustomerMapping(input: {
  sourceCollection: string;
  sourceId: string;
  zohoCustomer: ZohoCustomer | CreatedZohoCustomer;
}) {
  const mappingId = `${input.sourceCollection}_${input.sourceId}`.replace(/\//g, "_");
  await adminDb.collection(ZOHO_CUSTOMER_MAPPINGS_COLLECTION).doc(mappingId).set(
    {
      sourceCollection: input.sourceCollection,
      sourceId: input.sourceId,
      zohoCustomerId: input.zohoCustomer.id,
      zohoCustomerName: input.zohoCustomer.name,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function resolveZohoCustomerForInvoice(invoiceId: string, invoice: any) {
  const existing = asText(invoice?.zohoCustomerId);
  if (existing) return { id: existing, name: asText(invoice?.zohoCustomerName) || undefined };

  const customerName = asText(invoice?.customerSnapshot?.name || invoice?.customer?.name);
  if (!customerName) throw new Error("Invoice customer name is missing.");

  const gstNo = asText(invoice?.customerSnapshot?.billingDetails?.gstin || invoice?.customerSnapshot?.gstin);
  const matches = await searchZohoCustomers(customerName, 25);
  const picked =
    (gstNo && matches.find((customer) => asText(customer.gstNo).toUpperCase() === gstNo.toUpperCase())) ||
    matches.find((customer) => asText(customer.name).toLowerCase() === customerName.toLowerCase()) ||
    matches[0];

  if (picked?.id) {
    await saveZohoCustomerMapping({
      sourceCollection: "invoices",
      sourceId: invoiceId,
      zohoCustomer: picked,
    });
    return { id: picked.id, name: picked.name };
  }

  const created = await createZohoCustomer({
    contactName: customerName,
    phone: asText(invoice?.customerSnapshot?.phone || invoice?.customer?.phone) || undefined,
    billingAddress: {
      address: asText(invoice?.customerSnapshot?.address || invoice?.customer?.address) || undefined,
    },
    gstNo: gstNo || undefined,
  });
  await saveZohoCustomerMapping({ sourceCollection: "invoices", sourceId: invoiceId, zohoCustomer: created });
  return { id: created.id, name: created.name };
}

