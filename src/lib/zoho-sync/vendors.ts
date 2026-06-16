import { adminDb } from "@/lib/firebase-admin";
import { searchZohoVendors, type ZohoVendor } from "@/lib/zoho-books";

export const ZOHO_VENDOR_MAPPINGS_COLLECTION = "zohoVendorMappings";

const asText = (value: unknown) => String(value ?? "").trim();

export async function saveZohoVendorMapping(input: {
  sourceCollection: string;
  sourceId: string;
  zohoVendor: ZohoVendor;
}) {
  const mappingId = `${input.sourceCollection}_${input.sourceId}`.replace(/\//g, "_");
  await adminDb.collection(ZOHO_VENDOR_MAPPINGS_COLLECTION).doc(mappingId).set(
    {
      sourceCollection: input.sourceCollection,
      sourceId: input.sourceId,
      zohoVendorId: input.zohoVendor.id,
      zohoVendorName: input.zohoVendor.name,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function resolveZohoVendorId(sourceId: string, data: any) {
  const existing = asText(data?.zohoVendorId || data?.vendor?.zohoVendorId);
  if (existing) return existing;

  const vendorName = asText(data?.vendor || data?.vendorName || data?.supplierCompanyName);
  if (!vendorName) throw new Error("Vendor is missing. Select a Zoho vendor before syncing PO.");

  const vendors = await searchZohoVendors(vendorName, 20);
  const picked =
    vendors.find((vendor) => asText(vendor.name).toLowerCase() === vendorName.toLowerCase()) ||
    vendors[0];
  if (!picked?.id) throw new Error(`No Zoho vendor found for "${vendorName}".`);

  await saveZohoVendorMapping({ sourceCollection: "purchaseRequests", sourceId, zohoVendor: picked });
  return picked.id;
}

