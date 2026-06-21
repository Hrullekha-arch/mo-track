import { getZohoToken, invalidateZohoTokenCache } from "@/lib/zoho";
import {
  applyZohoInvoicePrefixForStore,
  invoiceNumberMatchesStoreSeries,
  resolveZohoInvoiceSeriesForStore,
} from "@/lib/zoho-invoice-series";

const ZOHO_BOOKS_BASE_URL =
  process.env.ZOHO_BOOKS_BASE_URL?.replace(/\/$/, "") || "https://www.zohoapis.in/books/v3";

const PURCHASE_CAPABLE_ITEM_TYPES = new Set([
  "purchases",
  "sales_and_purchases",
  "inventory",
]);

const SALES_CAPABLE_ITEM_TYPES = new Set([
  "sales",
  "sales_and_purchases",
  "inventory",
]);

type ZohoEnvelope = {
  code?: number;
  message?: string;
  [key: string]: any;
};

export type ZohoVendor = {
  id: string;
  name: string;
  email?: string;
  mobile?: string;
  gstNo?: string;
  contactType?: string;
};

export type ZohoCustomer = {
  id: string;
  name: string;
  email?: string;
  mobile?: string;
  gstNo?: string;
  contactType?: string;
  placeOfContact?: string;
  gstTreatment?: string;
  contactPersons?: Array<{
    id: string;
    email?: string;
    mobile?: string;
    isPrimary?: boolean;
  }>;
};

export type ZohoCustomerAddressInput = {
  attention?: string;
  address?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
};

export type CreateZohoCustomerInput = {
  contactName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  billingAddress?: ZohoCustomerAddressInput;
  shippingAddress?: ZohoCustomerAddressInput;
  gstNo?: string;
  placeOfContact?: string;
  gstTreatment?: "business_gst" | "business_none" | "consumer" | "overseas";
  notes?: string;
};

export type CreatedZohoCustomer = {
  id: string;
  name: string;
  email?: string;
  mobile?: string;
  gstNo?: string;
  placeOfContact?: string;
  gstTreatment?: string;
};

export type ZohoItem = {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  unit?: string;
  purchaseRate?: number;
  rate?: number;
  itemType?: string;
  productType?: string;
  preferredVendorId?: string;
  taxId?: string;
  taxExemptionId?: string;
  reverseChargeTaxId?: string;
  reverseChargeVatId?: string;
  stockOnHand?: number;
  availableStock?: number;
  actualAvailableStock?: number;
};

export type CreateZohoItemInput = {
  name: string;
  rate: number;
  description?: string;
  sku?: string;
  unit?: string;
  productType?: "goods" | "service" | "digital_service";
  itemType?: "sales" | "purchases" | "sales_and_purchases" | "inventory";
  hsnOrSac?: string;
  isTaxable?: boolean;
  taxPercentage?: number;
  purchaseDescription?: string;
  purchaseRate?: number;
};

export type ZohoPurchaseOrderLineItemInput = {
  itemId: string;
  quantity: number;
  rate?: number;
  description?: string;
  taxId?: string;
  taxExemptionId?: string;
  reverseChargeTaxId?: string;
  reverseChargeVatId?: string;
};

export type CreateZohoPurchaseOrderInput = {
  vendorId: string;
  purchaseOrderNumber: string;
  date: string;
  deliveryDate?: string;
  referenceNumber?: string;
  notes?: string;
  lineItems: ZohoPurchaseOrderLineItemInput[];
};

export type CreatedZohoPurchaseOrder = {
  id: string;
  number: string;
  vendorId: string;
  vendorName?: string;
};

export type ZohoVendorCreditLineItemInput = {
  itemId: string;
  quantity: number;
  rate: number;
  description?: string;
  taxId?: string;
};

export type CreateZohoVendorCreditInput = {
  vendorId: string;
  vendorCreditNumber?: string;
  date: string;
  referenceNumber?: string;
  notes?: string;
  lineItems: ZohoVendorCreditLineItemInput[];
};

export type CreatedZohoVendorCredit = {
  id: string;
  number: string;
  vendorId: string;
  vendorName?: string;
  total?: number;
};

export type ZohoBill = {
  id: string;
  number: string;
  vendorId: string;
  vendorName?: string;
  referenceNumber?: string;
  date?: string;
  status?: string;
  total: number;
  balance: number;
};

export type ZohoPurchaseOrderDetails = {
  id: string;
  number: string;
  vendorId: string;
  vendorName?: string;
  date?: string;
  deliveryDate?: string;
  referenceNumber?: string;
  notes?: string;
  lineItems: Array<{
    lineItemId?: string;
    itemId: string;
    name?: string;
    description?: string;
    quantity: number;
    rate?: number;
    taxId?: string;
    taxExemptionId?: string;
  }>;
};

export type UpdateZohoPurchaseOrderInput = {
  purchaseOrderId: string;
  vendorId: string;
  date: string;
  deliveryDate?: string;
  referenceNumber?: string;
  notes?: string;
  lineItems: ZohoPurchaseOrderDetails["lineItems"];
};

export type ZohoInvoiceLineItemInput = {
  itemId: string;
  quantity: number;
  rate?: number;
  description?: string;
  taxId?: string;
  discountAmount?: number;
  discountPercent?: number;
};

export type CreateZohoInvoiceInput = {
  customerId: string;
  salesperson?: string;
  store?: string;
  invoiceNumber?: string;
  date: string;
  dueDate?: string;
  referenceNumber?: string;
  notes?: string;
  adjustment?: number;
  adjustmentDescription?: string;
  lineItems: ZohoInvoiceLineItemInput[];
};

export type CreatedZohoInvoice = {
  id: string;
  number: string;
  customerId: string;
  customerName?: string;
  status?: string;
};

const getZohoOrgId = () => {
  const orgId = String(process.env.ZOHO_ORG_ID || "").trim();
  if (!orgId) throw new Error("Missing ZOHO_ORG_ID.");
  return orgId;
};

const asTrimmedString = (value: unknown) => String(value ?? "").trim();

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = asTrimmedString(value);
    if (candidate) return candidate;
  }
  return "";
};

const buildZohoAddressPayload = (address?: ZohoCustomerAddressInput) => {
  if (!address) return undefined;

  const payload: Record<string, unknown> = {};
  const attention = asTrimmedString(address.attention);
  const line1 = asTrimmedString(address.address);
  const line2 = asTrimmedString(address.street2);
  const city = asTrimmedString(address.city);
  const state = asTrimmedString(address.state);
  const zip = asTrimmedString(address.zip);
  const country = asTrimmedString(address.country);
  const phone = asTrimmedString(address.phone);

  if (attention) payload.attention = attention;
  if (line1) payload.address = line1;
  if (line2) payload.street2 = line2;
  if (city) payload.city = city;
  if (state) payload.state = state;
  if (zip) payload.zip = zip;
  if (country) payload.country = country;
  if (phone) payload.phone = phone;

  return Object.keys(payload).length > 0 ? payload : undefined;
};

const splitContactName = (name: string) => {
  const normalized = asTrimmedString(name).replace(/\s+/g, " ");
  if (!normalized) {
    return { firstName: "Customer", lastName: "" };
  }
  const [first, ...rest] = normalized.split(" ");
  return {
    firstName: first || "Customer",
    lastName: rest.join(" ").trim(),
  };
};

type ZohoLineTaxContext = {
  taxId?: string;
  taxExemptionId?: string;
  reverseChargeTaxId?: string;
  reverseChargeVatId?: string;
  interstateTaxId?: string;
  intrastateTaxId?: string;
};

type ZohoTaxRate = {
  id: string;
  name?: string;
  percentage?: number;
  type?: string;
  specificType?: string;
};

const extractZohoLineTaxContext = (
  item: any,
  usage: "purchase" | "sales" = "purchase"
): ZohoLineTaxContext => {
  const preferences = Array.isArray(item?.item_tax_preferences)
    ? item.item_tax_preferences
    : [];
  const primaryPreference = preferences[0] || {};
  const interstatePreference = preferences.find(
    (pref: any) => asLowerTrimmed(pref?.tax_specification) === "inter"
  );
  const intrastatePreference = preferences.find(
    (pref: any) => asLowerTrimmed(pref?.tax_specification) === "intra"
  );

  const taxId =
    usage === "purchase"
      ? firstNonEmptyString(
          item?.purchase_tax_id,
          item?.tax_id,
          primaryPreference?.tax_id
        ) || undefined
      : firstNonEmptyString(
          item?.tax_id,
          item?.sales_tax_id,
          primaryPreference?.tax_id
        ) || undefined;

  const taxExemptionId =
    usage === "purchase"
      ? firstNonEmptyString(
          item?.purchase_tax_exemption_id,
          item?.tax_exemption_id
        ) || undefined
      : firstNonEmptyString(item?.tax_exemption_id) || undefined;

  const reverseChargeTaxId =
    usage === "purchase"
      ? firstNonEmptyString(item?.reverse_charge_tax_id) || undefined
      : undefined;
  const reverseChargeVatId =
    usage === "purchase"
      ? firstNonEmptyString(item?.reverse_charge_vat_id) || undefined
      : undefined;
  const interstateTaxId = firstNonEmptyString(
    interstatePreference?.tax_id,
    item?.interstate_tax_id
  ) || undefined;
  const intrastateTaxId = firstNonEmptyString(
    intrastatePreference?.tax_id,
    item?.intrastate_tax_id
  ) || undefined;

  return {
    taxId,
    taxExemptionId,
    reverseChargeTaxId,
    reverseChargeVatId,
    interstateTaxId,
    intrastateTaxId,
  };
};

const asLowerTrimmed = (value: unknown) => asTrimmedString(value).toLowerCase();

const asFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = asTrimmedString(value).replace(/%/g, "");
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const sumZohoLocationQuantity = (
  locations: unknown,
  field: "location_stock_on_hand" | "location_available_stock" | "location_actual_available_stock"
): number | undefined => {
  if (!Array.isArray(locations)) return undefined;

  const values = locations
    .map((location: any) => asFiniteNumber(location?.[field]))
    .filter((value): value is number => value !== undefined);

  return values.length ? values.reduce((total, value) => total + value, 0) : undefined;
};

const roundToScale = (value: number, scale: number) => {
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
};

const normalizeZohoTaxRate = (tax: any): ZohoTaxRate | null => {
  const id = asTrimmedString(tax?.tax_id);
  if (!id) return null;

  return {
    id,
    name: asTrimmedString(tax?.tax_name) || undefined,
    percentage: asFiniteNumber(tax?.tax_percentage),
    type: asTrimmedString(tax?.tax_type) || undefined,
    specificType:
      asTrimmedString(tax?.tax_specific_type || tax?.tax_specification) || undefined,
  };
};

const isInterstateTaxRate = (tax: ZohoTaxRate): boolean => {
  const specificType = asLowerTrimmed(tax.specificType);
  const name = asLowerTrimmed(tax.name);
  if (specificType === "igst" || specificType === "inter") return true;
  if (specificType.includes("igst") || specificType.includes("inter")) return true;
  return name.includes("igst") || name.includes("interstate");
};

const isIntrastateTaxRate = (tax: ZohoTaxRate): boolean => {
  const specificType = asLowerTrimmed(tax.specificType);
  const name = asLowerTrimmed(tax.name);
  if (specificType === "intra" || specificType === "cgst" || specificType === "sgst") return true;
  if (specificType.includes("intra") || specificType.includes("cgst") || specificType.includes("sgst")) {
    return true;
  }
  return name.includes("cgst") || name.includes("sgst") || name.includes("intrastate");
};

const fetchZohoTaxes = async (): Promise<ZohoTaxRate[]> => {
  const organizationId = getZohoOrgId();
  const taxes: ZohoTaxRate[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams({
      organization_id: organizationId,
      page: String(page),
      per_page: "200",
    });
    const url = buildUrlWithQuery("/settings/taxes", params);
    const data = await callZohoBooks<{ taxes?: any[]; page_context?: { has_more_page?: boolean } }>(
      url,
      { method: "GET" }
    );

    const rows = Array.isArray(data.taxes) ? data.taxes : [];
    rows.forEach((row) => {
      const normalized = normalizeZohoTaxRate(row);
      if (normalized) taxes.push(normalized);
    });

    if (!data?.page_context?.has_more_page) break;
  }

  return taxes;
};

const withInterstateTaxIds = async (
  lineItems: Array<Record<string, unknown>>
): Promise<{ lineItems: Array<Record<string, unknown>>; changedCount: number }> => {
  const taxes = await fetchZohoTaxes();
  if (!taxes.length) return { lineItems, changedCount: 0 };

  const taxById = new Map(taxes.map((tax) => [tax.id, tax]));
  const interTaxes = taxes.filter(isInterstateTaxRate);
  if (!interTaxes.length) return { lineItems, changedCount: 0 };

  const defaultInterstateTaxId =
    firstNonEmptyString(
      process.env.ZOHO_DEFAULT_INTERSTATE_TAX_ID,
      process.env.ZOHO_INTERSTATE_TAX_ID
    ) || undefined;

  const chooseReplacement = (currentTaxId: string): string | undefined => {
    const currentTax = taxById.get(currentTaxId);
    if (currentTax && isInterstateTaxRate(currentTax)) return currentTaxId;
    if (currentTax && !isIntrastateTaxRate(currentTax) && !isInterstateTaxRate(currentTax)) {
      return currentTaxId;
    }

    const currentRate = currentTax?.percentage;
    const currentType = asLowerTrimmed(currentTax?.type);

    if (currentRate !== undefined) {
      const sameRate = interTaxes.filter(
        (tax) =>
          tax.percentage !== undefined &&
          Math.abs((tax.percentage as number) - currentRate) < 0.0001
      );
      if (sameRate.length > 0) {
        const sameType = sameRate.find((tax) => asLowerTrimmed(tax.type) === currentType);
        return (sameType || sameRate[0]).id;
      }
    }

    const defaultTax = defaultInterstateTaxId ? taxById.get(defaultInterstateTaxId) : undefined;
    if (defaultTax && isInterstateTaxRate(defaultTax)) return defaultTax.id;

    return defaultInterstateTaxId || interTaxes[0]?.id;
  };

  let changedCount = 0;
  const nextLineItems = lineItems.map((line) => {
    const taxId = asTrimmedString(line.tax_id);
    if (!taxId) return line;

    const replacementTaxId = chooseReplacement(taxId);
    if (!replacementTaxId || replacementTaxId === taxId) return line;

    changedCount += 1;
    return {
      ...line,
      tax_id: replacementTaxId,
    };
  });

  return {
    lineItems: nextLineItems,
    changedCount,
  };
};

const fetchZohoItemTaxContextByIds = async (
  itemIds: string[],
  usage: "purchase" | "sales" = "purchase"
): Promise<Map<string, ZohoLineTaxContext>> => {
  const uniqueIds = [...new Set(itemIds.map((id) => asTrimmedString(id)).filter(Boolean))];
  if (!uniqueIds.length) return new Map();
  const organizationId = getZohoOrgId();

  let rows: any[] = [];
  for (let index = 0; index < uniqueIds.length; index += 50) {
    const chunk = uniqueIds.slice(index, index + 50);
    const params = new URLSearchParams({
      organization_id: organizationId,
      item_ids: chunk.join(","),
    });
    const url = buildUrlWithQuery("/itemdetails", params);
    try {
      const data = await callZohoBooks<{ items?: any[] }>(url, { method: "GET" });
      const chunkRows = Array.isArray(data.items) ? data.items : [];
      if (chunkRows.length) rows = rows.concat(chunkRows);
    } catch (error: any) {
      console.warn(
        "[Zoho] Unable to read itemdetails for purchase tax context:",
        error?.message || error
      );
    }
  }

  if (!rows.length) {
    for (const itemId of uniqueIds) {
      const singleUrl = buildUrlWithQuery(
        `/items/${encodeURIComponent(itemId)}`,
        new URLSearchParams({
          organization_id: organizationId,
        })
      );
      try {
        const data = await callZohoBooks<{ item?: any }>(singleUrl, { method: "GET" });
        if (data.item) rows.push(data.item);
      } catch {
        // Best effort lookup; unresolved rows are handled by caller validation.
      }
    }
  }

  const contextByItemId = new Map<string, ZohoLineTaxContext>();
  for (const row of rows) {
    const itemId = asTrimmedString(row?.item_id);
    if (!itemId) continue;
    contextByItemId.set(itemId, extractZohoLineTaxContext(row, usage));
  }

  return contextByItemId;
};

const extractNumericTail = (value: string): number | null => {
  const match = value.match(/(\d+)(?!.*\d)/);
  if (!match) return null;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? numeric : null;
};

const incrementDocumentNumber = (value: string): string | null => {
  const match = value.match(/^(.*?)(\d+)([^\d]*)$/);
  if (!match) return null;

  const [, prefix, digits, suffix] = match;
  const next = String(Number(digits) + 1).padStart(digits.length, "0");
  return `${prefix}${next}${suffix || ""}`;
};

const buildUrlWithQuery = (path: string, query: URLSearchParams) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${ZOHO_BOOKS_BASE_URL}${normalizedPath}?${query.toString()}`;
};

async function callZohoBooks<T = ZohoEnvelope>(
  url: string,
  init: RequestInit,
  options?: { retryUnauthorized?: boolean }
): Promise<T> {
  const token = await getZohoToken();
  if (!token) throw new Error("Unable to authenticate with Zoho.");

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Zoho-oauthtoken ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  const data: ZohoEnvelope = await response.json().catch(() => ({}));

  if (response.status === 401 && options?.retryUnauthorized !== false) {
    invalidateZohoTokenCache();
    return callZohoBooks<T>(url, init, { retryUnauthorized: false });
  }

  if (!response.ok || (typeof data.code === "number" && data.code !== 0)) {
    const reason = asTrimmedString(data.message) || `Zoho request failed with ${response.status}.`;
    throw new Error(reason);
  }

  return data as T;
}

export async function searchZohoVendors(search: string, limit = 20): Promise<ZohoVendor[]> {
  const query = asTrimmedString(search);
  if (!query) return [];

  const params = new URLSearchParams({
    organization_id: getZohoOrgId(),
    contact_name_contains: query,
    per_page: String(Math.max(limit, 20)),
    page: "1",
  });

  const url = buildUrlWithQuery("/contacts", params);
  const data = await callZohoBooks<{ contacts?: any[] }>(url, { method: "GET" });
  const contacts = Array.isArray(data.contacts) ? data.contacts : [];

  const mapped: ZohoVendor[] = contacts.map((contact: any) => ({
    id: asTrimmedString(contact.contact_id),
    name:
      asTrimmedString(contact.contact_name) ||
      asTrimmedString(contact.company_name) ||
      asTrimmedString(contact.contact_number),
    email: asTrimmedString(contact.email) || undefined,
    mobile:
      asTrimmedString(contact.mobile) ||
      asTrimmedString(contact.phone) ||
      asTrimmedString(contact.contact_persons?.[0]?.mobile) ||
      undefined,
    gstNo: asTrimmedString(contact.gst_no || contact.gstin) || undefined,
    contactType: asTrimmedString(contact.contact_type) || undefined,
  }));

  const onlyVendors = mapped.filter((vendor) => vendor.contactType === "vendor");
  const finalList = onlyVendors.length > 0 ? onlyVendors : mapped;

  return finalList.filter((vendor) => !!vendor.id && !!vendor.name).slice(0, limit);
}

export async function searchZohoBills(
  vendorIdInput: string,
  search = "",
  limit = 30
): Promise<ZohoBill[]> {
  const vendorId = asTrimmedString(vendorIdInput);
  if (!vendorId) return [];

  const params = new URLSearchParams({
    organization_id: getZohoOrgId(),
    vendor_id: vendorId,
    filter_by: "Status.Open",
    sort_column: "date",
    sort_order: "D",
    per_page: String(Math.max(1, Math.min(limit, 200))),
    page: "1",
  });
  const searchText = asTrimmedString(search);
  if (searchText) params.set("search_text", searchText);

  const url = buildUrlWithQuery("/bills", params);
  const data = await callZohoBooks<{ bills?: any[] }>(url, { method: "GET" });
  const bills = Array.isArray(data.bills) ? data.bills : [];

  return bills
    .map((bill: any) => ({
      id: asTrimmedString(bill?.bill_id),
      number: asTrimmedString(bill?.bill_number),
      vendorId: asTrimmedString(bill?.vendor_id) || vendorId,
      vendorName: asTrimmedString(bill?.vendor_name) || undefined,
      referenceNumber: asTrimmedString(bill?.reference_number) || undefined,
      date: asTrimmedString(bill?.date) || undefined,
      status: asTrimmedString(bill?.status) || undefined,
      total: Number.isFinite(Number(bill?.total)) ? Number(bill.total) : 0,
      balance: Number.isFinite(Number(bill?.balance)) ? Number(bill.balance) : 0,
    }))
    .filter((bill: ZohoBill) => !!bill.id && !!bill.number && bill.balance > 0)
    .slice(0, limit);
}

export async function searchZohoCustomers(search: string, limit = 20): Promise<ZohoCustomer[]> {
  const query = asTrimmedString(search);
  if (!query) return [];

  const params = new URLSearchParams({
    organization_id: getZohoOrgId(),
    contact_name_contains: query,
    per_page: String(Math.max(limit, 20)),
    page: "1",
  });

  const url = buildUrlWithQuery("/contacts", params);
  const data = await callZohoBooks<{ contacts?: any[] }>(url, { method: "GET" });
  const contacts = Array.isArray(data.contacts) ? data.contacts : [];

  const mapped: ZohoCustomer[] = contacts.map((contact: any) => ({
    id: asTrimmedString(contact.contact_id),
    name:
      asTrimmedString(contact.contact_name) ||
      asTrimmedString(contact.company_name) ||
      asTrimmedString(contact.contact_number),
    email: asTrimmedString(contact.email) || undefined,
    mobile:
      asTrimmedString(contact.mobile) ||
      asTrimmedString(contact.phone) ||
      asTrimmedString(contact.contact_persons?.[0]?.mobile) ||
      undefined,
    gstNo: asTrimmedString(contact.gst_no || contact.gstin) || undefined,
    contactType: asTrimmedString(contact.contact_type) || undefined,
    placeOfContact: asTrimmedString(contact.place_of_contact) || undefined,
    gstTreatment: asTrimmedString(contact.gst_treatment) || undefined,
    contactPersons: Array.isArray(contact.contact_persons)
      ? contact.contact_persons.map((person: any) => ({
          id: asTrimmedString(person.contact_person_id),
          email: asTrimmedString(person.email) || undefined,
          mobile: asTrimmedString(person.mobile) || undefined,
          isPrimary: person.is_primary_contact === true ? true : undefined,
        }))
      : undefined,
  }));

  const onlyCustomers = mapped.filter((customer) => customer.contactType === "customer");
  const finalList = onlyCustomers.length > 0 ? onlyCustomers : mapped;

  return finalList.filter((customer) => !!customer.id && !!customer.name).slice(0, limit);
}

export async function createZohoCustomer(
  input: CreateZohoCustomerInput
): Promise<CreatedZohoCustomer> {
  const contactName = asTrimmedString(input.contactName);
  if (!contactName) throw new Error("contactName is required.");

  const companyName = asTrimmedString(input.companyName) || contactName;
  const email = asTrimmedString(input.email) || undefined;
  const phone = asTrimmedString(input.phone) || undefined;
  const gstNo = asTrimmedString(input.gstNo) || undefined;
  const placeOfContact = asTrimmedString(input.placeOfContact) || undefined;
  const gstTreatment =
    asTrimmedString(input.gstTreatment) ||
    (gstNo ? "business_gst" : "business_none");
  const notes = asTrimmedString(input.notes) || undefined;

  const billingAddress = buildZohoAddressPayload(input.billingAddress);
  const shippingAddress = buildZohoAddressPayload(input.shippingAddress || input.billingAddress);

  const payload: Record<string, unknown> = {
    contact_name: contactName,
    company_name: companyName,
    contact_type: "customer",
    customer_sub_type: "business",
  };

  if (phone) payload.phone = phone;
  if (notes) payload.notes = notes;
  if (billingAddress) payload.billing_address = billingAddress;
  if (shippingAddress) payload.shipping_address = shippingAddress;

  // India-specific fields are optional; include only if supplied/derived.
  if (placeOfContact) payload.place_of_contact = placeOfContact;
  if (gstNo) payload.gst_no = gstNo;
  if (gstTreatment) payload.gst_treatment = gstTreatment;

  if (email || phone) {
    const { firstName, lastName } = splitContactName(contactName);
    payload.contact_persons = [
      {
        first_name: firstName,
        ...(lastName ? { last_name: lastName } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone, mobile: phone } : {}),
        is_primary_contact: true,
      },
    ];
  }

  const query = new URLSearchParams({
    organization_id: getZohoOrgId(),
  });
  const url = buildUrlWithQuery("/contacts", query);
  const data = await callZohoBooks<{ contact?: any }>(url, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const contact = data.contact || {};
  const id = asTrimmedString(contact.contact_id);
  const name =
    asTrimmedString(contact.contact_name) ||
    asTrimmedString(contact.company_name) ||
    contactName;
  if (!id || !name) {
    throw new Error("Zoho did not return a valid customer response.");
  }

  return {
    id,
    name,
    email: asTrimmedString(contact.email) || email,
    mobile:
      asTrimmedString(contact.mobile) ||
      asTrimmedString(contact.phone) ||
      phone,
    gstNo: asTrimmedString(contact.gst_no) || gstNo,
    placeOfContact: asTrimmedString(contact.place_of_contact) || placeOfContact,
    gstTreatment: asTrimmedString(contact.gst_treatment) || gstTreatment,
  };
}

export async function searchZohoItems(
  search: string,
  options?: { vendorId?: string; limit?: number; usage?: "purchase" | "sales" }
): Promise<ZohoItem[]> {
  const query = asTrimmedString(search);
  if (!query) return [];

  const params = new URLSearchParams({
    organization_id: getZohoOrgId(),
    filter_by: "Status.Active",
    search_text: query,
    per_page: String(Math.max(options?.limit || 30, 30)),
    page: "1",
  });

  const url = buildUrlWithQuery("/items", params);
  const data = await callZohoBooks<{ items?: any[] }>(url, { method: "GET" });
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const usage = options?.usage === "sales" ? "sales" : "purchase";
  const allowedItemTypes =
    usage === "sales" ? SALES_CAPABLE_ITEM_TYPES : PURCHASE_CAPABLE_ITEM_TYPES;

  const normalized = rawItems.reduce<ZohoItem[]>((acc, item: any) => {
    const itemType = asTrimmedString(item.item_type).toLowerCase();
    if (itemType && !allowedItemTypes.has(itemType)) {
      return acc;
    }

    const parsed: ZohoItem = {
      id: asTrimmedString(item.item_id),
      name: asTrimmedString(item.name),
      sku: asTrimmedString(item.sku) || undefined,
      description: asTrimmedString(item.description) || undefined,
      unit: asTrimmedString(item.unit) || undefined,
      purchaseRate:
        item.purchase_rate === undefined || item.purchase_rate === null
          ? undefined
          : Number(item.purchase_rate),
      rate: item.rate === undefined || item.rate === null ? undefined : Number(item.rate),
      itemType: asTrimmedString(item.item_type) || undefined,
      productType: asTrimmedString(item.product_type) || undefined,
      preferredVendorId: asTrimmedString(item.vendor_id) || undefined,
      stockOnHand: asFiniteNumber(item.stock_on_hand),
      availableStock: asFiniteNumber(item.available_stock),
      actualAvailableStock: asFiniteNumber(item.actual_available_stock),
      ...extractZohoLineTaxContext(item, usage),
    };

    if (parsed.id && parsed.name) {
      acc.push(parsed);
    }
    return acc;
  }, []);

  const vendorId = asTrimmedString(options?.vendorId);

  const scored = normalized
    .map((item) => {
      const sku = asTrimmedString(item.sku).toLowerCase();
      const name = asTrimmedString(item.name).toLowerCase();
      const needle = query.toLowerCase();
      const score =
        (sku === needle ? 200 : 0) +
        (sku.startsWith(needle) ? 100 : 0) +
        (sku.includes(needle) ? 40 : 0) +
        (name.startsWith(needle) ? 20 : 0) +
        (name.includes(needle) ? 10 : 0) +
        (vendorId && item.preferredVendorId === vendorId ? 50 : 0);

      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.map((entry) => entry.item).slice(0, options?.limit || 30);
}

export async function getZohoItemById(itemId: string): Promise<ZohoItem | null> {
  const id = asTrimmedString(itemId);
  if (!id) return null;

  const query = new URLSearchParams({
    organization_id: getZohoOrgId(),
  });
  const url = buildUrlWithQuery(`/items/${encodeURIComponent(id)}`, query);
  const data = await callZohoBooks<{ item?: any }>(url, { method: "GET" });
  const item = data.item || {};
  const resolvedId = asTrimmedString(item.item_id);
  const name = asTrimmedString(item.name);
  if (!resolvedId || !name) return null;

  return {
    id: resolvedId,
    name,
    sku: asTrimmedString(item.sku) || undefined,
    description: asTrimmedString(item.description) || undefined,
    unit: asTrimmedString(item.unit) || undefined,
    purchaseRate: asFiniteNumber(item.purchase_rate),
    rate: asFiniteNumber(item.rate),
    itemType: asTrimmedString(item.item_type) || undefined,
    productType: asTrimmedString(item.product_type) || undefined,
    preferredVendorId: asTrimmedString(item.vendor_id) || undefined,
    stockOnHand:
      sumZohoLocationQuantity(item.locations, "location_stock_on_hand") ??
      asFiniteNumber(item.stock_on_hand),
    availableStock:
      sumZohoLocationQuantity(item.locations, "location_available_stock") ??
      asFiniteNumber(item.available_stock ?? item.available_for_sale_stock),
    actualAvailableStock:
      sumZohoLocationQuantity(item.locations, "location_actual_available_stock") ??
      asFiniteNumber(item.actual_available_stock),
    ...extractZohoLineTaxContext(item, "sales"),
  };
}

export async function createZohoItem(input: CreateZohoItemInput): Promise<ZohoItem> {
  const name = asTrimmedString(input.name);
  if (!name) throw new Error("Item name is required.");

  const rate = Number(input.rate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error("Valid item rate is required.");
  }

  const payload: Record<string, unknown> = {
    name,
    rate: roundToScale(rate, 4),
    item_type: asTrimmedString(input.itemType) || "sales",
    product_type: asTrimmedString(input.productType) || "goods",
  };

  const description = asTrimmedString(input.description);
  if (description) payload.description = description;

  const sku = asTrimmedString(input.sku);
  if (sku) payload.sku = sku;

  const unit = asTrimmedString(input.unit);
  if (unit) payload.unit = unit;

  const hsnOrSac = asTrimmedString(input.hsnOrSac);
  if (hsnOrSac) payload.hsn_or_sac = hsnOrSac;

  if (input.isTaxable !== undefined) {
    payload.is_taxable = input.isTaxable === true;
  }

  const taxPercentage =
    input.taxPercentage === undefined || input.taxPercentage === null
      ? undefined
      : Number(input.taxPercentage);
  if (taxPercentage !== undefined && Number.isFinite(taxPercentage) && taxPercentage >= 0) {
    payload.tax_percentage = roundToScale(taxPercentage, 4);
  }

  const purchaseDescription = asTrimmedString(input.purchaseDescription);
  if (purchaseDescription) payload.purchase_description = purchaseDescription;

  const purchaseRate =
    input.purchaseRate === undefined || input.purchaseRate === null
      ? undefined
      : Number(input.purchaseRate);
  if (purchaseRate !== undefined && Number.isFinite(purchaseRate) && purchaseRate >= 0) {
    payload.purchase_rate = roundToScale(purchaseRate, 4);
  }

  const query = new URLSearchParams({
    organization_id: getZohoOrgId(),
  });
  const url = buildUrlWithQuery("/items", query);

  const data = await callZohoBooks<{ item?: any }>(url, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const item = data.item || {};
  const created: ZohoItem = {
    id: asTrimmedString(item.item_id),
    name: asTrimmedString(item.name),
    sku: asTrimmedString(item.sku) || undefined,
    description: asTrimmedString(item.description) || undefined,
    unit: asTrimmedString(item.unit) || undefined,
    purchaseRate:
      item.purchase_rate === undefined || item.purchase_rate === null
        ? undefined
        : Number(item.purchase_rate),
    rate: item.rate === undefined || item.rate === null ? undefined : Number(item.rate),
    itemType: asTrimmedString(item.item_type) || undefined,
    productType: asTrimmedString(item.product_type) || undefined,
    preferredVendorId: asTrimmedString(item.vendor_id) || undefined,
    ...extractZohoLineTaxContext(item, "sales"),
  };

  if (!created.id || !created.name) {
    throw new Error("Zoho did not return a valid item response.");
  }

  return created;
}

export async function getNextZohoPurchaseOrderNumber(vendorId?: string): Promise<string | null> {
  const params = new URLSearchParams({
    organization_id: getZohoOrgId(),
    per_page: "200",
    page: "1",
    sort_column: "created_time",
  });

  const trimmedVendor = asTrimmedString(vendorId);
  if (trimmedVendor) params.set("vendor_id", trimmedVendor);

  const url = buildUrlWithQuery("/purchaseorders", params);
  const data = await callZohoBooks<{ purchaseorders?: any[] }>(url, { method: "GET" });
  const purchaseOrders = Array.isArray(data.purchaseorders) ? data.purchaseorders : [];

  if (!purchaseOrders.length) return null;

  let bestNumber = "";
  let bestNumeric = -1;
  for (const po of purchaseOrders) {
    const current = asTrimmedString(po.purchaseorder_number);
    if (!current) continue;

    const numericPart = extractNumericTail(current);
    if (numericPart === null) continue;

    if (numericPart > bestNumeric) {
      bestNumeric = numericPart;
      bestNumber = current;
    }
  }

  if (!bestNumber) return null;
  return incrementDocumentNumber(bestNumber);
}

type ZohoInvoiceSeriesSnapshot = {
  mo1: { last: string | null; next: string };
  mo2: { last: string | null; next: string };
};

const parseZohoPageContext = (raw: unknown): Record<string, unknown> => {
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : {};
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
};

const readHasMorePage = (pageContext: Record<string, unknown>): boolean => {
  const value = pageContext.has_more_page;
  if (typeof value === "boolean") return value;
  return asLowerTrimmed(value) === "true";
};

const fetchAllZohoInvoicesForNumbering = async (): Promise<any[]> => {
  const invoices: any[] = [];
  const maxPages = 25;

  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({
      organization_id: getZohoOrgId(),
      per_page: "200",
      page: String(page),
      sort_column: "created_time",
      sort_order: "D",
    });

    const url = buildUrlWithQuery("/invoices", params);
    const data = await callZohoBooks<{ invoices?: any[]; page_context?: unknown }>(url, {
      method: "GET",
    });
    const rows = Array.isArray(data.invoices) ? data.invoices : [];
    if (rows.length > 0) invoices.push(...rows);

    const pageContext = parseZohoPageContext(data.page_context);
    const hasMorePage = readHasMorePage(pageContext);
    if (!hasMorePage || rows.length === 0) break;
  }

  return invoices;
};

export async function getZohoInvoiceSeriesSnapshot(): Promise<ZohoInvoiceSeriesSnapshot> {
  const invoices = await fetchAllZohoInvoicesForNumbering();

  let lastMo1 = "";
  let lastMo2 = "";
  let bestMo1 = -1;
  let bestMo2 = -1;

  for (const invoice of invoices) {
    const invoiceNumber = asTrimmedString(invoice?.invoice_number);
    if (!invoiceNumber) continue;

    const numericTail = extractNumericTail(invoiceNumber);
    if (numericTail === null) continue;

    const isMo1Series = invoiceNumberMatchesStoreSeries(invoiceNumber, "MG");
    if (isMo1Series) {
      if (numericTail > bestMo1) {
        bestMo1 = numericTail;
        lastMo1 = invoiceNumber;
      }
      continue;
    }

    if (numericTail > bestMo2) {
      bestMo2 = numericTail;
      lastMo2 = invoiceNumber;
    }
  }

  const mo1Next =
    applyZohoInvoicePrefixForStore(
      lastMo1 ? incrementDocumentNumber(lastMo1) : "1",
      "MG"
    ) || "1";
  const mo2Next =
    applyZohoInvoicePrefixForStore(
      lastMo2 ? incrementDocumentNumber(lastMo2) : "1",
      "GCR"
    ) || "BS/1";

  return {
    mo1: { last: lastMo1 || null, next: mo1Next },
    mo2: { last: lastMo2 || null, next: mo2Next },
  };
}

export async function getNextZohoInvoiceNumber(input?: {
  customerId?: string;
  store?: string;
}): Promise<string | null> {
  const trimmedCustomer = asTrimmedString(input?.customerId);
  void trimmedCustomer;
  const storeSeries = resolveZohoInvoiceSeriesForStore(input?.store);
  const seriesSnapshot = await getZohoInvoiceSeriesSnapshot();
  return storeSeries.seriesName === "MO-2" ? seriesSnapshot.mo2.next : seriesSnapshot.mo1.next;
}

export async function createZohoInvoice(
  input: CreateZohoInvoiceInput
): Promise<CreatedZohoInvoice> {
  const customerId = asTrimmedString(input.customerId);
  if (!customerId) throw new Error("Zoho customer is required.");
  if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) {
    throw new Error("At least one Zoho item is required to create invoice.");
  }

  const taxContextByItemId = await fetchZohoItemTaxContextByIds(
    input.lineItems.map((line) => line.itemId),
    "sales"
  );
  const defaultSalesTaxId =
    firstNonEmptyString(
      process.env.ZOHO_DEFAULT_SALES_TAX_ID,
      process.env.ZOHO_SALES_TAX_ID
    ) || undefined;
  const linesMissingTaxContext = new Set<string>();

  const filteredLineItems = input.lineItems
    .map((line) => {
      const itemId = asTrimmedString(line.itemId);
      const quantity = Number(line.quantity);
      const rate = line.rate === undefined || line.rate === null ? undefined : Number(line.rate);
      const discountAmount =
        line.discountAmount === undefined || line.discountAmount === null
          ? undefined
          : Number(line.discountAmount);
      const discountPercent =
        line.discountPercent === undefined || line.discountPercent === null
          ? undefined
          : Number(line.discountPercent);
      if (!itemId || !Number.isFinite(quantity) || quantity <= 0) return null;

      const payload: Record<string, unknown> = {
        item_id: itemId,
        quantity,
      };

      if (typeof rate === "number" && Number.isFinite(rate)) {
        payload.rate = roundToScale(rate, 2);
      }
      if (
        typeof discountPercent === "number" &&
        Number.isFinite(discountPercent) &&
        discountPercent > 0
      ) {
        payload.discount = `${roundToScale(discountPercent, 2)}%`;
      } else if (
        typeof discountAmount === "number" &&
        Number.isFinite(discountAmount) &&
        discountAmount > 0
      ) {
        payload.discount_amount = roundToScale(discountAmount, 2);
      }

      const itemTaxContext = taxContextByItemId.get(itemId) || {};
      const taxId =
        asTrimmedString(line.taxId) ||
        itemTaxContext.taxId ||
        itemTaxContext.intrastateTaxId ||
        undefined;

      if (taxId) {
        payload.tax_id = taxId;
      } else if (defaultSalesTaxId) {
        payload.tax_id = defaultSalesTaxId;
      } else {
        linesMissingTaxContext.add(itemId);
      }

      const description = asTrimmedString(line.description);
      if (description) payload.description = description;

      return payload;
    })
    .filter((line): line is Record<string, unknown> => !!line);

  if (!filteredLineItems.length) {
    throw new Error("No valid line items found for Zoho invoice.");
  }
  if (linesMissingTaxContext.size > 0) {
    const missingList = [...linesMissingTaxContext].slice(0, 10).join(", ");
    throw new Error(
      `Tax setup is missing for Zoho item(s): ${missingList}. Set sales tax on Zoho item or configure ZOHO_DEFAULT_SALES_TAX_ID.`
    );
  }

  const query = new URLSearchParams({
    organization_id: getZohoOrgId(),
  });

  let invoiceNumber = applyZohoInvoicePrefixForStore(input.invoiceNumber, input.store);
  const storeSeries = resolveZohoInvoiceSeriesForStore(input.store);
  if (!invoiceNumber && storeSeries.invoicePrefix) {
    const suggestedNumber = await getNextZohoInvoiceNumber({
      customerId,
      store: input.store,
    });
    invoiceNumber = applyZohoInvoicePrefixForStore(suggestedNumber, input.store);
  }
  if (invoiceNumber) query.set("ignore_auto_number_generation", "true");

  const payload: Record<string, unknown> = {
    customer_id: customerId,
    date: asTrimmedString(input.date),
    line_items: filteredLineItems,
  };

  const salespersonName = asTrimmedString(input.salesperson);
  if (salespersonName) {
    payload.salesperson_name = salespersonName;
  }

  if (
    filteredLineItems.some((line) => {
      const discountAmount =
        typeof line.discount_amount === "number" ? Number(line.discount_amount) : 0;
      const rawDiscount = line.discount;
      if (Number.isFinite(discountAmount) && discountAmount > 0) return true;
      if (typeof rawDiscount === "number" && Number(rawDiscount) > 0) return true;
      if (typeof rawDiscount === "string") {
        const parsed = Number(rawDiscount.replace("%", "").trim());
        return Number.isFinite(parsed) && parsed > 0;
      }
      return false;
    })
  ) {
    payload.discount = 0;
    payload.discount_type = "item_level";
    payload.is_discount_before_tax = true;
  }

  if (invoiceNumber) payload.invoice_number = invoiceNumber;

  const dueDate = asTrimmedString(input.dueDate);
  if (dueDate) payload.due_date = dueDate;

  if (input.referenceNumber !== undefined) {
    payload.reference_number = asTrimmedString(input.referenceNumber);
  }

  const notes = asTrimmedString(input.notes);
  if (notes) payload.notes = notes;

  const adjustment = Number(input.adjustment);
  if (Number.isFinite(adjustment) && adjustment !== 0) {
    payload.adjustment = Math.round((adjustment + Number.EPSILON) * 100) / 100;
    payload.adjustment_description =
      asTrimmedString(input.adjustmentDescription) || "Round Off";
  }

  const url = buildUrlWithQuery("/invoices", query);
  const isInterstateIgstError = (message: string) =>
    /igst has to be applied as this is an interstate transaction/i.test(message);

  let data: { invoice?: any };
  try {
    data = await callZohoBooks<{ invoice?: any }>(url, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error: any) {
    const reason = asTrimmedString(error?.message);
    if (!isInterstateIgstError(reason)) throw error;

    const retryPayload = { ...payload };
    const retryTaxResult = await withInterstateTaxIds(filteredLineItems);
    if (retryTaxResult.changedCount <= 0) throw error;

    console.warn(
      `[Zoho] Retrying invoice create with interstate IGST mapping for ${retryTaxResult.changedCount} line item(s).`
    );
    retryPayload.line_items = retryTaxResult.lineItems;

    data = await callZohoBooks<{ invoice?: any }>(url, {
      method: "POST",
      body: JSON.stringify(retryPayload),
    });
  }

  const invoice = data.invoice || {};
  const id = asTrimmedString(invoice.invoice_id);
  const number = asTrimmedString(invoice.invoice_number);

  if (!id || !number) {
    throw new Error("Zoho did not return a valid invoice response.");
  }

  return {
    id,
    number,
    customerId: asTrimmedString(invoice.customer_id) || customerId,
    customerName: asTrimmedString(invoice.customer_name) || undefined,
    status: asTrimmedString(invoice.status) || undefined,
  };
}

export async function createZohoPurchaseOrder(
  input: CreateZohoPurchaseOrderInput
): Promise<CreatedZohoPurchaseOrder> {
  const vendorId = asTrimmedString(input.vendorId);
  if (!vendorId) throw new Error("Zoho vendor is required.");
  const purchaseOrderNumber = asTrimmedString(input.purchaseOrderNumber);
  if (!purchaseOrderNumber) {
    throw new Error("Purchase order number is required for Zoho.");
  }
  if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) {
    throw new Error("At least one Zoho item is required to create purchase order.");
  }

  const taxContextByItemId = await fetchZohoItemTaxContextByIds(
    input.lineItems.map((line) => line.itemId)
  );
  const defaultPurchaseTaxId =
    firstNonEmptyString(
      process.env.ZOHO_DEFAULT_PURCHASE_TAX_ID,
      process.env.ZOHO_PURCHASE_TAX_ID
    ) || undefined;
  const linesMissingTaxContext = new Set<string>();

  const filteredLineItems = input.lineItems
    .map((line) => {
      const itemId = asTrimmedString(line.itemId);
      const quantity = Number(line.quantity);
      const rate = line.rate === undefined || line.rate === null ? undefined : Number(line.rate);

      if (!itemId || !Number.isFinite(quantity) || quantity <= 0) return null;

      const payload: Record<string, unknown> = {
        item_id: itemId,
        quantity,
      };

      if (Number.isFinite(rate)) {
        payload.rate = rate;
      }

      const lineTaxContext: ZohoLineTaxContext = {
        taxId: asTrimmedString(line.taxId) || undefined,
        taxExemptionId: asTrimmedString(line.taxExemptionId) || undefined,
        reverseChargeTaxId: asTrimmedString(line.reverseChargeTaxId) || undefined,
        reverseChargeVatId: asTrimmedString(line.reverseChargeVatId) || undefined,
      };
      const itemTaxContext = taxContextByItemId.get(itemId) || {};

      const taxId = lineTaxContext.taxId || itemTaxContext.taxId;
      const taxExemptionId = lineTaxContext.taxExemptionId || itemTaxContext.taxExemptionId;
      const reverseChargeTaxId = lineTaxContext.reverseChargeTaxId || itemTaxContext.reverseChargeTaxId;
      const reverseChargeVatId = lineTaxContext.reverseChargeVatId || itemTaxContext.reverseChargeVatId;

      if (taxId) {
        payload.tax_id = taxId;
      } else if (taxExemptionId) {
        payload.tax_exemption_id = taxExemptionId;
      } else if (reverseChargeTaxId) {
        payload.reverse_charge_tax_id = reverseChargeTaxId;
      } else if (reverseChargeVatId) {
        payload.reverse_charge_vat_id = reverseChargeVatId;
      } else if (defaultPurchaseTaxId) {
        payload.tax_id = defaultPurchaseTaxId;
      } else {
        linesMissingTaxContext.add(itemId);
      }

      const description = asTrimmedString(line.description);
      if (description) payload.description = description;

      return payload;
    })
    .filter((line): line is Record<string, unknown> => !!line);

  if (!filteredLineItems.length) {
    throw new Error("No valid line items found for Zoho purchase order.");
  }
  if (linesMissingTaxContext.size > 0) {
    const missingList = [...linesMissingTaxContext].slice(0, 10).join(", ");
    throw new Error(
      `Tax setup is missing for Zoho item(s): ${missingList}. Set tax on the Zoho item or configure ZOHO_DEFAULT_PURCHASE_TAX_ID.`
    );
  }

  const query = new URLSearchParams({
    organization_id: getZohoOrgId(),
    ignore_auto_number_generation: "true",
  });

  const payload: Record<string, unknown> = {
    vendor_id: vendorId,
    purchaseorder_number: purchaseOrderNumber,
    date: asTrimmedString(input.date),
    line_items: filteredLineItems,
  };

  const deliveryDate = asTrimmedString(input.deliveryDate);
  if (deliveryDate) payload.delivery_date = deliveryDate;

  if (input.referenceNumber !== undefined) {
    payload.reference_number = asTrimmedString(input.referenceNumber);
  }

  const notes = asTrimmedString(input.notes);
  if (notes) payload.notes = notes;

  const url = buildUrlWithQuery("/purchaseorders", query);

  const isInterstateIgstError = (message: string) =>
    /igst has to be applied as this is an interstate transaction/i.test(message);

  let data: { purchaseorder?: any };
  try {
    data = await callZohoBooks<{ purchaseorder?: any }>(url, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error: any) {
    const reason = asTrimmedString(error?.message);
    if (isInterstateIgstError(reason)) {
      const retryPayload = { ...payload };
      const retryTaxResult = await withInterstateTaxIds(filteredLineItems);
      if (retryTaxResult.changedCount <= 0) {
        throw error;
      }
      console.warn(
        `[Zoho] Retrying PO create with interstate IGST mapping for ${retryTaxResult.changedCount} line item(s).`
      );
      retryPayload.line_items = retryTaxResult.lineItems;

      data = await callZohoBooks<{ purchaseorder?: any }>(url, {
        method: "POST",
        body: JSON.stringify(retryPayload),
      });
    } else if (/already exists|duplicate/i.test(reason)) {
      const lookupUrl = buildUrlWithQuery(
        "/purchaseorders",
        new URLSearchParams({
          organization_id: getZohoOrgId(),
          purchaseorder_number: purchaseOrderNumber,
          per_page: "1",
        })
      );
      const lookup = await callZohoBooks<{ purchaseorders?: any[] }>(lookupUrl, {
        method: "GET",
      });
      const existing = Array.isArray(lookup.purchaseorders)
        ? lookup.purchaseorders.find(
            (purchaseOrder: any) =>
              asTrimmedString(purchaseOrder?.purchaseorder_number) ===
                purchaseOrderNumber &&
              asTrimmedString(purchaseOrder?.vendor_id) === vendorId
          )
        : undefined;
      if (!existing) throw error;
      data = { purchaseorder: existing };
    } else {
      throw error;
    }
  }

  const purchaseOrder = data.purchaseorder || {};

  const id = asTrimmedString(purchaseOrder.purchaseorder_id);
  const number = asTrimmedString(purchaseOrder.purchaseorder_number);

  if (!id || !number) {
    throw new Error("Zoho did not return a valid purchase order response.");
  }

  return {
    id,
    number,
    vendorId: asTrimmedString(purchaseOrder.vendor_id) || vendorId,
    vendorName: asTrimmedString(purchaseOrder.vendor_name) || undefined,
  };
}

export async function getZohoPurchaseOrder(
  purchaseOrderIdInput: string
): Promise<ZohoPurchaseOrderDetails> {
  const purchaseOrderId = asTrimmedString(purchaseOrderIdInput);
  if (!purchaseOrderId) throw new Error("Zoho purchase order ID is required.");

  const url = buildUrlWithQuery(
    `/purchaseorders/${encodeURIComponent(purchaseOrderId)}`,
    new URLSearchParams({ organization_id: getZohoOrgId() })
  );
  const data = await callZohoBooks<{ purchaseorder?: any }>(url, { method: "GET" });
  const purchaseOrder = data.purchaseorder || {};
  const id = asTrimmedString(purchaseOrder.purchaseorder_id);
  const number = asTrimmedString(purchaseOrder.purchaseorder_number);
  const vendorId = asTrimmedString(purchaseOrder.vendor_id);

  if (!id || !number || !vendorId) {
    throw new Error("Zoho did not return a valid purchase order.");
  }

  return {
    id,
    number,
    vendorId,
    vendorName: asTrimmedString(purchaseOrder.vendor_name) || undefined,
    date: asTrimmedString(purchaseOrder.date) || undefined,
    deliveryDate: asTrimmedString(purchaseOrder.delivery_date) || undefined,
    referenceNumber: asTrimmedString(purchaseOrder.reference_number) || undefined,
    notes: asTrimmedString(purchaseOrder.notes) || undefined,
    lineItems: (Array.isArray(purchaseOrder.line_items) ? purchaseOrder.line_items : [])
      .map((line: any) => ({
        lineItemId: asTrimmedString(line.line_item_id) || undefined,
        itemId: asTrimmedString(line.item_id),
        name: asTrimmedString(line.name) || undefined,
        description: asTrimmedString(line.description) || undefined,
        quantity: Number(line.quantity),
        rate:
          line.rate === undefined || line.rate === null || !Number.isFinite(Number(line.rate))
            ? undefined
            : Number(line.rate),
        taxId: asTrimmedString(line.tax_id) || undefined,
        taxExemptionId: asTrimmedString(line.tax_exemption_id) || undefined,
      }))
      .filter((line: ZohoPurchaseOrderDetails["lineItems"][number]) => {
        return !!line.itemId && Number.isFinite(line.quantity) && line.quantity > 0;
      }),
  };
}

export async function updateZohoPurchaseOrder(
  input: UpdateZohoPurchaseOrderInput
): Promise<CreatedZohoPurchaseOrder> {
  const purchaseOrderId = asTrimmedString(input.purchaseOrderId);
  const vendorId = asTrimmedString(input.vendorId);
  if (!purchaseOrderId) throw new Error("Zoho purchase order ID is required.");
  if (!vendorId) throw new Error("Zoho vendor is required.");

  const lineItems = input.lineItems
    .map((line) => {
      const itemId = asTrimmedString(line.itemId);
      const quantity = Number(line.quantity);
      if (!itemId || !Number.isFinite(quantity) || quantity <= 0) return null;

      const payload: Record<string, unknown> = {
        item_id: itemId,
        quantity: roundToScale(quantity, 4),
      };
      const lineItemId = asTrimmedString(line.lineItemId);
      if (lineItemId) payload.line_item_id = lineItemId;
      const description = asTrimmedString(line.description);
      if (description) payload.description = description;
      if (line.rate !== undefined && Number.isFinite(Number(line.rate))) {
        payload.rate = roundToScale(Number(line.rate), 4);
      }
      const taxId = asTrimmedString(line.taxId);
      if (taxId) payload.tax_id = taxId;
      const taxExemptionId = asTrimmedString(line.taxExemptionId);
      if (taxExemptionId) payload.tax_exemption_id = taxExemptionId;
      return payload;
    })
    .filter((line): line is Record<string, unknown> => !!line);

  if (!lineItems.length) {
    throw new Error("At least one valid line item is required to update the Zoho PO.");
  }

  const payload: Record<string, unknown> = {
    vendor_id: vendorId,
    date: asTrimmedString(input.date),
    line_items: lineItems,
  };
  const deliveryDate = asTrimmedString(input.deliveryDate);
  if (deliveryDate) payload.delivery_date = deliveryDate;
  if (input.referenceNumber !== undefined) {
    payload.reference_number = asTrimmedString(input.referenceNumber);
  }
  const notes = asTrimmedString(input.notes);
  if (notes) payload.notes = notes;

  const url = buildUrlWithQuery(
    `/purchaseorders/${encodeURIComponent(purchaseOrderId)}`,
    new URLSearchParams({ organization_id: getZohoOrgId() })
  );
  const data = await callZohoBooks<{ purchaseorder?: any }>(url, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  const purchaseOrder = data.purchaseorder || {};

  return {
    id: asTrimmedString(purchaseOrder.purchaseorder_id) || purchaseOrderId,
    number: asTrimmedString(purchaseOrder.purchaseorder_number),
    vendorId: asTrimmedString(purchaseOrder.vendor_id) || vendorId,
    vendorName: asTrimmedString(purchaseOrder.vendor_name) || undefined,
  };
}

export async function deleteZohoPurchaseOrder(purchaseOrderIdInput: string): Promise<void> {
  const purchaseOrderId = asTrimmedString(purchaseOrderIdInput);
  if (!purchaseOrderId) throw new Error("Zoho purchase order ID is required.");

  const url = buildUrlWithQuery(
    `/purchaseorders/${encodeURIComponent(purchaseOrderId)}`,
    new URLSearchParams({ organization_id: getZohoOrgId() })
  );
  await callZohoBooks(url, { method: "DELETE" });
}

export async function createZohoVendorCredit(
  input: CreateZohoVendorCreditInput
): Promise<CreatedZohoVendorCredit> {
  const vendorId = asTrimmedString(input.vendorId);
  if (!vendorId) throw new Error("Zoho vendor is required.");
  const vendorCreditNumber = asTrimmedString(input.vendorCreditNumber);
  if (!vendorCreditNumber) {
    throw new Error("Debit note number is required for Zoho.");
  }

  const lineItems = input.lineItems
    .map((line) => {
      const itemId = asTrimmedString(line.itemId);
      const quantity = Number(line.quantity);
      const rate = Number(line.rate);
      if (
        !itemId ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(rate) ||
        rate < 0
      ) {
        return null;
      }

      const payload: Record<string, unknown> = {
        item_id: itemId,
        quantity: roundToScale(quantity, 4),
        rate: roundToScale(rate, 4),
      };
      const description = asTrimmedString(line.description);
      if (description) payload.description = description;
      const taxId = asTrimmedString(line.taxId);
      if (taxId) payload.tax_id = taxId;
      return payload;
    })
    .filter((line): line is Record<string, unknown> => !!line);

  if (!lineItems.length) {
    throw new Error("At least one valid debit-note line is required.");
  }

  const payload: Record<string, unknown> = {
    vendor_id: vendorId,
    vendor_credit_number: vendorCreditNumber,
    date: asTrimmedString(input.date),
    line_items: lineItems,
  };
  const referenceNumber = asTrimmedString(input.referenceNumber);
  if (referenceNumber) payload.reference_number = referenceNumber;
  const notes = asTrimmedString(input.notes);
  if (notes) payload.notes = notes;

  const url = buildUrlWithQuery(
    "/vendorcredits",
    new URLSearchParams({ organization_id: getZohoOrgId() })
  );
  let data: { vendor_credit?: any };
  try {
    data = await callZohoBooks<{ vendor_credit?: any }>(url, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error: any) {
    const reason = asTrimmedString(error?.message);
    if (!/already exists|duplicate/i.test(reason)) throw error;

    const lookupUrl = buildUrlWithQuery(
      "/vendorcredits",
      new URLSearchParams({
        organization_id: getZohoOrgId(),
        vendor_credit_number: vendorCreditNumber,
        per_page: "1",
      })
    );
    const lookup = await callZohoBooks<{ vendorcredits?: any[] }>(lookupUrl, {
      method: "GET",
    });
    const existing = Array.isArray(lookup.vendorcredits)
      ? lookup.vendorcredits.find(
          (credit: any) =>
            asTrimmedString(credit?.vendor_credit_number) === vendorCreditNumber &&
            asTrimmedString(credit?.vendor_id) === vendorId
        )
      : undefined;
    if (!existing) throw error;
    data = { vendor_credit: existing };
  }
  const vendorCredit = data.vendor_credit || {};
  const id = asTrimmedString(vendorCredit.vendor_credit_id);
  const number = asTrimmedString(vendorCredit.vendor_credit_number);
  if (!id || !number) {
    throw new Error("Zoho did not return a valid debit note response.");
  }

  return {
    id,
    number,
    vendorId: asTrimmedString(vendorCredit.vendor_id) || vendorId,
    vendorName: asTrimmedString(vendorCredit.vendor_name) || undefined,
    total: Number.isFinite(Number(vendorCredit.total))
      ? Number(vendorCredit.total)
      : undefined,
  };
}

export async function applyZohoVendorCreditToBill(input: {
  vendorCreditId: string;
  billId: string;
  amount: number;
}): Promise<void> {
  const vendorCreditId = asTrimmedString(input.vendorCreditId);
  const billId = asTrimmedString(input.billId);
  const amount = roundToScale(Number(input.amount), 2);
  if (!vendorCreditId) throw new Error("Zoho debit note ID is required.");
  if (!billId) throw new Error("Associated Zoho bill is required.");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Debit-note amount applied to the bill must be greater than zero.");
  }

  const query = new URLSearchParams({ organization_id: getZohoOrgId() });
  const creditedUrl = buildUrlWithQuery(
    `/vendorcredits/${encodeURIComponent(vendorCreditId)}/bills`,
    query
  );
  const credited = await callZohoBooks<{ bills_credited?: any[] }>(creditedUrl, {
    method: "GET",
  });
  const alreadyApplied = (Array.isArray(credited.bills_credited)
    ? credited.bills_credited
    : []
  ).some((bill: any) => asTrimmedString(bill?.bill_id) === billId);
  if (alreadyApplied) return;

  await callZohoBooks(creditedUrl, {
    method: "POST",
    body: JSON.stringify({
      bills: [{ bill_id: billId, amount_applied: amount }],
    }),
  });
}

export async function deleteZohoVendorCredit(
  vendorCreditIdInput: string
): Promise<void> {
  const vendorCreditId = asTrimmedString(vendorCreditIdInput);
  if (!vendorCreditId) return;

  const url = buildUrlWithQuery(
    `/vendorcredits/${encodeURIComponent(vendorCreditId)}`,
    new URLSearchParams({ organization_id: getZohoOrgId() })
  );
  await callZohoBooks(url, { method: "DELETE" });
}
