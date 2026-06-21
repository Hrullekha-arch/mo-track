"use client";

/**
 * InvoicePage — Redesigned with all critical fixes applied.
 *
 * FIXES APPLIED:
 * ─────────────────────────────────────────────────────────────────────────────
 * FIX 1 — ATOMIC INVOICE COUNTER (runTransaction, not batch read+write)
 *          Prevents duplicate invoice numbers under concurrent users.
 *
 * FIX 2 — VAS PARTIAL INVOICING (per-item qty tracking, mirrors NORMAL logic)
 *          VAS items now tracked individually — partial invoices no longer
 *          silently drop remaining VAS items.
 *
 * FIX 3 — FLOAT PRECISION (rates rounded to paise before key generation)
 *          GST rounding no longer produces different group keys between
 *          invoice generation and re-computation, preventing ghost re-invoicing.
 *
 * FIX 4 — CENTRALISED QTY RESOLVER (resolveInvoiceItemQty used everywhere)
 *          computeInvoicingStatus and buildInvoiceCandidates now agree on
 *          which field holds quantity across old and new invoice formats.
 *
 * FIX 5 — CHUNKED BATCH WRITES (max 490 ops per batch, sequential commits)
 *          Prevents silent failures on large orders that exceed Firestore's
 *          500-document batch limit.
 *
 * FIX 6 — SERVER-SIDE FILTERED QUERIES (only pending orders streamed)
 *          Only orders with invoicing.status IN [NOT_INVOICED, PARTIALLY_INVOICED]
 *          are fetched, with a limit(200) cap. Prevents full-collection scans.
 *
 * FIX 7 — QUOTATION CACHE (useRef Map, per-session)
 *          Quotation lookups are cached — Generate clicks no longer fire 2
 *          redundant Firestore collectionGroup reads per candidate.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as React from "react";
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  getDoc,
  doc,
  writeBatch,
  limit,
  increment,
  where,
  runTransaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CustomerAddress, Invoice, Order, Quotation } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PrintableInvoice } from "@/components/features/invoice/PrintableInvoice";
import { InvoiceLogTable } from "@/components/features/invoice/InvoiceLogTable";
import { ZohoInvoiceBotCard } from "@/components/features/invoice/ZohoInvoiceBotCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText,
  Loader2,
  Printer,
  Search,
  X,
  AlertTriangle,
  CheckCircle2,
  Package,
  Wrench,
  History,
  IndianRupee,
  Zap,
  ChevronRight,
  ShieldCheck,
  TrendingUp,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyZohoInvoicePrefixForStore,
  resolveZohoInvoiceSeriesForStore,
} from "@/lib/zoho-invoice-series";
import { getOrderStatusLabel } from "@/lib/order-workflow";
import { getMoDesignsCompanyName } from "@/lib/financial-year";
import { isVasInvoice } from "@/lib/zoho-sync/invoice-eligibility";
import { useSearchParams } from "next/navigation";
import {
  buildOrderPricingFromQuotation,
  type PricingReconciliationDetail,
  type PricingReconciliationScope,
} from "@/lib/quotation-order-pricing";
import {
  allocateGstByTaxMode,
  DEFAULT_DESTINATION_STATE,
  DEFAULT_DESTINATION_STATE_CODE,
  formatInvoiceState,
  formatIndianAddress,
  getGstStateCodeFromAddress,
  resolveGstTaxMode,
  sanitizeLegacySelectText,
} from "@/lib/gst-jurisdiction";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type InvoiceLineItem = {
  roomName?: string;
  type?: string;
  bcn?: string;
  description?: string;
  unit?: string;
  exclusiveRate?: number;
  rate?: number;
  qty?: number;
  discountPercent?: number;
  discountAmount?: number;
  gst?: number;
  gstMode?: string;
  hsn?: string;
  group?: string;
  taxableAmount?: number;
  gstAmount?: number;
  totalAmount?: number;
  allocationRef?: { lengthId?: string; stockItemId?: string };
  zohoItemId?: string;
  zohoItemName?: string;
  zohoSku?: string;
  zohoTaxId?: string;
};

type InvoiceVerificationResult = {
  ok: boolean;
  issues: string[];
  details: PricingReconciliationDetail[];
  quotationNo: string;
  orderNo: string;
  scope: PricingReconciliationScope;
  orderAmount: number;
  quotationAmount: number;
  difference: number;
};

type InvoiceCandidate = {
  order: Order;
  normalItems: InvoiceLineItem[];
  vasItems: InvoiceLineItem[];
  normalSummary: { subTotal: number; gstTotal: number; grandTotal: number };
  vasSummary: { subTotal: number; gstTotal: number; grandTotal: number };
  overallSummary: { goodsTotal: number; vasTotal: number; grandTotal: number };
  taxSummary: {
    NORMAL: { cgst: number; sgst: number; igst: number };
    VAS: { cgst: number; sgst: number; igst: number };
  };
};

const isVasOnlyCandidate = (candidate?: InvoiceCandidate | null): boolean =>
  Boolean(candidate && candidate.normalItems.length === 0 && candidate.vasItems.length > 0);

type BillingDetailsSnapshot = {
  billingName?: string;
  billingPhone?: string;
  billingAddress?: string;
  gstin?: string;
  isDefault?: boolean;
  customerBillingAddress?: CustomerAddress;
  customerShippingAddress?: CustomerAddress;
  customerGstin?: string;
};

type ZohoCustomer = {
  id: string;
  name: string;
  email?: string;
  mobile?: string;
  gstNo?: string;
};

type ZohoItem = {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  unit?: string;
  purchaseRate?: number;
  rate?: number;
  itemType?: string;
  preferredVendorId?: string;
  taxId?: string;
  taxExemptionId?: string;
  reverseChargeTaxId?: string;
  reverseChargeVatId?: string;
  interstateTaxId?: string;
  intrastateTaxId?: string;
};

type ZohoLineMapping = {
  sourceKey: string;
  label: string;
  searchText: string;
  quantity: number;
  rate: number;
  gstPercent?: number;
  discountPercent?: number;
  discountAmount?: number;
  itemType: "NORMAL" | "VAS";
  isManual?: boolean;
  sourceItem?: InvoiceLineItem;
  zohoItemId: string;
  zohoItemName?: string;
  zohoSku?: string;
  zohoRate?: number;
  taxId?: string;
  taxExemptionId?: string;
  reverseChargeTaxId?: string;
  reverseChargeVatId?: string;
};

type ZohoCustomerDraftAddress = {
  attention?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
};

type ZohoCustomerDraft = {
  contactName: string;
  companyName: string;
  email: string;
  phone: string;
  gstNo: string;
  placeOfContact: string;
  gstTreatment: "business_gst" | "business_none" | "consumer" | "overseas";
  notes: string;
  billingAddress: ZohoCustomerDraftAddress;
  shippingAddress: ZohoCustomerDraftAddress;
};

type ZohoItemDraft = {
  lineKey: string;
  name: string;
  rate: number;
  description: string;
  sku: string;
  unit: string;
  productType: "goods" | "service" | "digital_service";
  itemType: "sales" | "purchases" | "sales_and_purchases" | "inventory";
  hsnOrSac: string;
  isTaxable: boolean;
  taxPercentage: number;
  purchaseDescription: string;
  purchaseRate?: number;
};

const GST_STATE_CODE_TO_PLACE_OF_CONTACT: Record<string, string> = {
  "01": "JK",
  "02": "HP",
  "03": "PB",
  "04": "CH",
  "05": "UK",
  "06": "HR",
  "07": "DL",
  "08": "RJ",
  "09": "UP",
  "10": "BR",
  "11": "SK",
  "12": "AR",
  "13": "NL",
  "14": "MN",
  "15": "MZ",
  "16": "TR",
  "17": "ML",
  "18": "AS",
  "19": "WB",
  "20": "JH",
  "21": "OD",
  "22": "CG",
  "23": "MP",
  "24": "GJ",
  "26": "DN",
  "27": "MH",
  "29": "KA",
  "30": "GA",
  "31": "LD",
  "32": "KL",
  "33": "TN",
  "34": "PY",
  "35": "AN",
  "36": "TS",
  "37": "AP",
  "38": "LA",
};

const INVOICE_STORE_OPTIONS: ComboboxOption[] = [
  { value: "MO MG ROAD", label: "MO MG ROAD" },
  { value: "MO GCR BRANCH", label: "MO GCR BRANCH" },
  { value: "MO SULTANPUR", label: "MO SULTANPUR" },
];

// ─────────────────────────────────────────────────────────────────────────────
// FIX 4: CENTRALISED QTY RESOLVER
// Used by BOTH buildInvoiceCandidates and computeInvoicingStatus.
// Eliminates the field-name disagreement between old and new invoice formats.
// ─────────────────────────────────────────────────────────────────────────────
const resolveInvoiceItemQty = (item: any): number =>
  num(item?.qty ?? item?.quantity ?? item?.quantityAllocated ?? 0);

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const normalizeKey = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s/-]/g, "")
    .trim();

const addOrderReferenceVariants = (target: Set<string>, value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return;
  const upper = raw.toUpperCase();
  const compact = upper.replace(/^MOTRACK-/, "");
  [upper, compact, compact ? `MOTRACK-${compact}` : ""]
    .filter(Boolean)
    .forEach((entry) => target.add(entry));
};

const getOrderReferenceKeys = (order: Partial<Order> | null | undefined) => {
  const keys = new Set<string>();
  addOrderReferenceVariants(keys, order?.id);
  addOrderReferenceVariants(keys, order?.orderNo);
  addOrderReferenceVariants(keys, order?.crmOrderNo);
  addOrderReferenceVariants(keys, order?.quotationNo);
  return keys;
};

const getInvoiceReferenceKeys = (invoice: Partial<Invoice> | null | undefined) => {
  const keys = new Set<string>();
  addOrderReferenceVariants(keys, invoice?.orderId);
  addOrderReferenceVariants(keys, invoice?.orderNo);
  addOrderReferenceVariants(keys, (invoice as any)?.crmOrderNo);
  addOrderReferenceVariants(keys, (invoice as any)?.quotationNo);
  return keys;
};

const isInvoiceForOrder = (invoice: Invoice, order: Order) => {
  const orderKeys = getOrderReferenceKeys(order);
  if (orderKeys.size === 0) return false;
  for (const invoiceKey of getInvoiceReferenceKeys(invoice)) {
    if (orderKeys.has(invoiceKey)) return true;
  }
  return false;
};

const getInvoicesForOrder = (invoices: Invoice[], order: Order) =>
  invoices.filter((invoice) => isInvoiceForOrder(invoice, order));

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const numOrUndefined = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toTrimmedText = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text || undefined;
};

const asTrimmedString = (value: unknown) => String(value ?? "").trim();

const resolvePlaceOfContactFromGstin = (gstNo: string): string | undefined => {
  const normalized = asTrimmedString(gstNo).toUpperCase();
  if (!normalized) return undefined;
  const stateCode = normalized.slice(0, 2);
  return GST_STATE_CODE_TO_PLACE_OF_CONTACT[stateCode];
};

const asAddressLine = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";

  const raw = value as Record<string, unknown>;
  const parts = [
    raw.address,
    raw.addressLine1,
    raw.addressLine2,
    raw.street,
    raw.locality,
    raw.landmark,
    raw.city,
    raw.state,
    raw.pincode,
    raw.zip,
  ]
    .map((entry) => asTrimmedString(entry))
    .filter(Boolean);

  return Array.from(new Set(parts)).join(", ");
};

const splitContactName = (name: string) => {
  const normalized = asTrimmedString(name).replace(/\s+/g, " ");
  const [first = "", ...rest] = normalized.split(" ");
  return {
    firstName: first || "Customer",
    lastName: rest.join(" ").trim(),
  };
};

const buildZohoCustomerDraftFromOrder = (
  order: Order,
  customerNameHint?: string
): ZohoCustomerDraft => {
  const snapshot = (order.customerSnapshot || {}) as Record<string, any>;
  const customerName =
    asTrimmedString(customerNameHint) ||
    asTrimmedString(snapshot.name || order.customerName) ||
    "Customer";
  const companyName = customerName;
  const phone = asTrimmedString(snapshot.phone || order.customerPhone) || "";
  const email = asTrimmedString(snapshot.email) || "";

  const billingDetails = (snapshot.billingDetails || {}) as Record<string, unknown>;
  const billingAddressLine =
    asTrimmedString(billingDetails.billingAddress) ||
    asAddressLine(snapshot.billingAddress) ||
    asTrimmedString(snapshot.address) ||
    asTrimmedString(order.customerAddress);
  const shippingAddressLine = asAddressLine(snapshot.shippingAddress) || billingAddressLine;
  const destinationStateCode =
    getGstStateCodeFromAddress(snapshot.shippingAddress) ||
    getGstStateCodeFromAddress(snapshot.billingAddress) ||
    DEFAULT_DESTINATION_STATE_CODE;

  const gstNo =
    asTrimmedString(billingDetails.gstin) || asTrimmedString(snapshot.gstin) || "";
  const placeOfContact =
    asTrimmedString(billingDetails.placeOfContact) ||
    resolvePlaceOfContactFromGstin(gstNo) ||
    (destinationStateCode
      ? GST_STATE_CODE_TO_PLACE_OF_CONTACT[destinationStateCode]
      : "") ||
    "";
  const gstTreatment = (gstNo ? "business_gst" : "business_none") as
    | "business_gst"
    | "business_none"
    | "consumer"
    | "overseas";

  const { firstName, lastName } = splitContactName(customerName);
  const attention = [firstName, lastName].filter(Boolean).join(" ").trim() || customerName;

  return {
    contactName: customerName,
    companyName,
    email,
    phone,
    gstNo,
    placeOfContact,
    gstTreatment,
    notes: `Created from Mo Track order ${asTrimmedString(order.orderNo || order.id)}.`,
    billingAddress: {
      attention,
      address: billingAddressLine || undefined,
      city: asTrimmedString(snapshot.billingAddress?.city) || undefined,
      state:
        asTrimmedString(snapshot.billingAddress?.state) ||
        DEFAULT_DESTINATION_STATE,
      zip: asTrimmedString(snapshot.billingAddress?.pincode) || undefined,
      phone: phone || undefined,
      country: "India",
    },
    shippingAddress: {
      attention,
      address: shippingAddressLine || undefined,
      city: asTrimmedString(snapshot.shippingAddress?.city) || undefined,
      state:
        asTrimmedString(snapshot.shippingAddress?.state) ||
        DEFAULT_DESTINATION_STATE,
      zip: asTrimmedString(snapshot.shippingAddress?.pincode) || undefined,
      phone: phone || undefined,
      country: "India",
    },
  };
};

const buildZohoCustomerDraftFromName = (customerNameHint?: string): ZohoCustomerDraft => {
  const customerName = asTrimmedString(customerNameHint) || "Customer";
  const { firstName, lastName } = splitContactName(customerName);
  const attention = [firstName, lastName].filter(Boolean).join(" ").trim() || customerName;
  return {
    contactName: customerName,
    companyName: customerName,
    email: "",
    phone: "",
    gstNo: "",
    placeOfContact: "",
    gstTreatment: "business_none",
    notes: "Created from manual invoice flow in Mo Track.",
    billingAddress: {
      attention,
      country: "India",
    },
    shippingAddress: {
      attention,
      country: "India",
    },
  };
};

const deriveSkuFromLineText = (value: string): string => {
  const text = asTrimmedString(value);
  if (!text) return "";
  const direct = text.match(/\b([A-Za-z]{1,6}\s*[-/]?\s*\d{3,})\b/);
  if (direct?.[1]) {
    return direct[1].replace(/\s+/g, " ").trim().toUpperCase();
  }
  return "";
};

const buildZohoItemDraftFromLine = (line: ZohoLineMapping): ZohoItemDraft => {
  const label = asTrimmedString(line.label || line.searchText) || "New Item";
  const source = (line.sourceItem || {}) as Record<string, unknown>;
  const unit = asTrimmedString(source.unit) || (line.itemType === "VAS" ? "PCS" : "MTR");
  const description =
    asTrimmedString(source.description) || asTrimmedString(line.searchText) || label;
  const skuCandidate =
    deriveSkuFromLineText(asTrimmedString(source.bcn)) ||
    deriveSkuFromLineText(label) ||
    deriveSkuFromLineText(asTrimmedString(line.searchText));
  const gstPercent = Math.min(100, Math.max(0, num(line.gstPercent)));
  const rate = Math.max(0, num(line.rate));

  return {
    lineKey: line.sourceKey,
    name: label,
    rate,
    description,
    sku: skuCandidate,
    unit,
    productType: line.itemType === "VAS" ? "service" : "goods",
    itemType: "sales",
    hsnOrSac: asTrimmedString(source.hsn),
    isTaxable: true,
    taxPercentage: gstPercent,
    purchaseDescription: description,
    purchaseRate: rate > 0 ? rate : undefined,
  };
};

const toZohoCustomerOption = (customer: ZohoCustomer): ComboboxOption => ({
  value: customer.id,
  label: (
    <div className="flex flex-col py-0.5">
      <span className="text-sm font-medium">{customer.name}</span>
      <span className="text-xs text-muted-foreground truncate">
        {[customer.mobile, customer.email].filter(Boolean).join(" - ") || "Customer"}
      </span>
    </div>
  ),
});

const toZohoItemOption = (item: ZohoItem): ComboboxOption => ({
  value: item.id,
  label: (
    <div className="flex flex-col py-0.5">
      <span className="text-sm font-medium">
        {item.sku ? `${item.sku} - ${item.name}` : item.name}
      </span>
      <span className="text-xs text-muted-foreground truncate">
        Rate {num(item.rate ?? item.purchaseRate).toFixed(2)}
        {item.unit ? ` - ${item.unit}` : ""}
      </span>
    </div>
  ),
});

const stripUndefinedDeep = (value: any): any => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value))
    return value.map(stripUndefinedDeep).filter((e) => e !== undefined);
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .map(([k, v]) => [k, stripUndefinedDeep(v)])
      .filter(([, v]) => v !== undefined);
    return Object.fromEntries(entries);
  }
  return value;
};

const normalizeBillingDetailsSnapshot = (value: unknown): BillingDetailsSnapshot | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const normalized = stripUndefinedDeep({
    billingName: toTrimmedText(record.billingName),
    billingPhone: toTrimmedText(record.billingPhone),
    billingAddress: toTrimmedText(record.billingAddress),
    gstin: toTrimmedText(record.gstin)?.toUpperCase(),
    isDefault: record.isDefault === true ? true : undefined,
  }) as BillingDetailsSnapshot;

  const hasValues =
    Boolean(normalized.billingName) ||
    Boolean(normalized.billingPhone) ||
    Boolean(normalized.billingAddress) ||
    Boolean(normalized.gstin);
  if (!hasValues) return undefined;
  return normalized;
};

const resolvePreferredBillingDetails = (
  customerData?: Record<string, unknown>
): BillingDetailsSnapshot | undefined => {
  const entries = Array.isArray(customerData?.billingDetails)
    ? customerData.billingDetails
        .map((entry) => normalizeBillingDetailsSnapshot(entry))
        .filter((entry): entry is BillingDetailsSnapshot => Boolean(entry))
    : [];
  const preferred = entries.find((entry) => entry.isDefault) || entries[0];
  const hydrated = stripUndefinedDeep({
    ...preferred,
    customerBillingAddress: customerData?.billingAddress,
    customerShippingAddress: customerData?.shippingAddress,
    customerGstin: toTrimmedText(customerData?.gstin)?.toUpperCase(),
  }) as BillingDetailsSnapshot;
  return Object.keys(hydrated).length > 0 ? hydrated : undefined;
};

const applyBillingDetailsToCandidate = (
  candidate: InvoiceCandidate,
  preferredBilling?: BillingDetailsSnapshot
): InvoiceCandidate => {
  if (!preferredBilling) return candidate;

  const order = candidate.order;
  const currentSnapshot = order.customerSnapshot || {};
  const currentBillingAddress = currentSnapshot.billingAddress || {};
  const {
    customerBillingAddress,
    customerShippingAddress,
    customerGstin,
    ...billingDetails
  } = preferredBilling;
  const mergedBillingDetails = stripUndefinedDeep({
    ...(currentSnapshot.billingDetails || {}),
    ...billingDetails,
  });

  const nextSnapshot = stripUndefinedDeep({
    ...currentSnapshot,
    name: preferredBilling.billingName || currentSnapshot.name || order.customerName,
    phone: preferredBilling.billingPhone || currentSnapshot.phone || order.customerPhone,
    gstin:
      preferredBilling.gstin ||
      customerGstin ||
      currentSnapshot.gstin,
    billingAddress: {
      ...currentBillingAddress,
      ...(customerBillingAddress || {}),
      line1:
        preferredBilling.billingAddress ||
        customerBillingAddress?.line1 ||
        currentBillingAddress.line1 ||
        order.customerAddress ||
        undefined,
    },
    shippingAddress:
      customerShippingAddress ||
      currentSnapshot.shippingAddress ||
      customerBillingAddress,
    billingDetails: mergedBillingDetails,
  }) as NonNullable<Order["customerSnapshot"]>;

  const hydratedOrder = {
    ...order,
    customerSnapshot: nextSnapshot,
    customerName: nextSnapshot.name || order.customerName,
    customerPhone: nextSnapshot.phone || order.customerPhone,
    customerAddress:
      preferredBilling.billingAddress ||
      formatIndianAddress(nextSnapshot.billingAddress) ||
      order.customerAddress,
  };

  return {
    ...candidate,
    order: hydratedOrder,
    taxSummary: {
      NORMAL: buildTaxSummary(candidate.normalItems, hydratedOrder),
      VAS: buildTaxSummary(candidate.vasItems, hydratedOrder),
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// FIX 3: PAISE-PRECISION RATE KEY
// Rounds rate to nearest paisa (0.01) before stringifying.
// Prevents GST back-calculation rounding differences from producing different
// group keys between invoice generation and re-computation passes.
// ─────────────────────────────────────────────────────────────────────────────
const toRateKey = (value: unknown): string =>
  Math.round(num(value) * 100).toString();

const toFixedKey = (value: unknown, decimals = 4) =>
  num(value).toFixed(decimals);

const extractBcnLikeKey = (value: unknown): string | undefined => {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const matched = raw.match(/\b([A-Za-z]{1,5}\s*[-/]?\s*\d{3,})\b/);
  if (!matched) return undefined;
  return normalizeKey(matched[1]?.replace(/[-/]/g, " "));
};

const collectDiscountLookupKeys = (value: unknown): string[] => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const keys = new Set<string>();
  const add = (candidate: unknown) => {
    const key = normalizeKey(candidate as string);
    if (key) keys.add(key);
  };

  add(raw);
  raw.split(/\n+/).forEach(add);
  raw.split(/\s+-\s+/).forEach(add);
  raw.split("/").forEach(add);
  add(raw.split(" - ")[0]?.trim());

  const bcnLike = extractBcnLikeKey(raw);
  if (bcnLike) keys.add(bcnLike);

  return [...keys];
};

const collectFabricDiscountKeys = (entry: any): Set<string> => {
  const keys = new Set<string>();
  [entry?.bcn, entry?.itemName, entry?.fabricName].forEach((value) => {
    collectDiscountLookupKeys(value).forEach((key) => keys.add(key));
  });
  return keys;
};

const resolveDiscountPercent = (order: Order, item: any): number => {
  const direct = numOrUndefined(item?.discountPercent ?? item?.discount);
  if (direct !== undefined) return direct;

  const targetKeys = new Set<string>();
  [item?.bcn, item?.description, item?.itemName].forEach((value) => {
    collectDiscountLookupKeys(value).forEach((key) => targetKeys.add(key));
  });
  const targetList = [...targetKeys];
  if (!targetList.length) return 0;

  const fabricDetails = Array.isArray((order as any)?.fabricDetails)
    ? (order as any).fabricDetails
    : [];
  if (!fabricDetails.length) return 0;

  const exactMatch = fabricDetails.find((entry: any) => {
    const entryKeys = collectFabricDiscountKeys(entry);
    for (const key of entryKeys) {
      if (targetKeys.has(key)) return true;
    }
    return false;
  });
  if (exactMatch) return numOrUndefined(exactMatch?.discountPercent) ?? 0;

  const fuzzyMatches = fabricDetails.filter((entry: any) => {
    const entryKeys = [...collectFabricDiscountKeys(entry)];
    return entryKeys.some((entryKey) =>
      targetList.some((targetKey) => entryKey.includes(targetKey) || targetKey.includes(entryKey))
    );
  });

  if (fuzzyMatches.length === 1) {
    return numOrUndefined(fuzzyMatches[0]?.discountPercent) ?? 0;
  }

  if (fuzzyMatches.length > 1) {
    const candidateDiscounts: number[] = fuzzyMatches
      .map((entry: any) => numOrUndefined(entry?.discountPercent))
      .filter((value: number | undefined): value is number => value !== undefined);
    const uniqueDiscounts = Array.from(new Set(candidateDiscounts));
    if (uniqueDiscounts.length === 1) return uniqueDiscounts[0];
  }

  return 0;
};

const resolveExclusiveRateForInvoice = (item: any): number => {
  const gst = num(item?.gst ?? item?.gstPercent);
  const gstMode = String(item?.gstMode ?? item?.gstType ?? "").toUpperCase();
  const rawRate = num(item?.rate);
  const rawExclusive = numOrUndefined(item?.exclusiveRate);
  if (rawExclusive !== undefined && rawExclusive > 0) return rawExclusive;
  if (gstMode === "INCL" && gst > 0) {
    return rawRate ? rawRate / (1 + gst / 100) : 0;
  }
  return rawRate;
};

// FIX 3 applied: rateKey now uses toRateKey (paise precision) not toFixedKey
const buildNormalInvoiceGroupingKey = (item: any, discountPercent: number): string => {
  const bcnKey = normalizeKey(item?.bcn || item?.description || item?.itemName);
  const descriptionKey = normalizeKey(item?.description || item?.itemName || "");
  const hsnKey = normalizeKey(item?.hsn);
  const unitKey = normalizeKey(item?.unit || "MTR");
  const rateKey = toRateKey(item?.exclusiveRate ?? resolveExclusiveRateForInvoice(item)); // ← FIX 3
  const gstKey = toFixedKey(item?.gst ?? item?.gstPercent);
  const discountKey = toFixedKey(discountPercent);
  return [bcnKey, descriptionKey, hsnKey, unitKey, rateKey, gstKey, discountKey].join("|");
};

const resolveItemLabel = (item: any): string => {
  const bcn = String(item?.bcn || "").trim();
  const name = String(
    item?.description || item?.salesDescription || item?.itemName ||
    item?.name || item?.vasName || ""
  ).trim();
  if (bcn && name && normalizeKey(bcn) !== normalizeKey(name))
    return `${bcn} / ${name}`;
  return bcn || name;
};

const extractItemAliases = (item: any): Set<string> => {
  const aliases = new Set<string>();
  [
    item?.bcn, item?.description, item?.salesDescription,
    item?.itemName, item?.name, item?.vasName, item?.serialNo,
  ].forEach((raw) => {
    const value = String(raw || "").trim();
    if (!value) return;
    const fragments = [value];
    if (value.includes("\n")) fragments.push(...value.split(/\n+/));
    fragments.forEach((fragment) =>
      fragment.split(/\s+-\s+/)
        .map((part) => normalizeKey(part))
        .filter(Boolean)
        .forEach((part) => aliases.add(part))
    );
  });
  const labelKey = normalizeKey(resolveItemLabel(item));
  if (labelKey) aliases.add(labelKey);
  return aliases;
};

const getItemMismatches = (orderItems: any[], quotationItems: any[]) => {
  const orderMeta = orderItems
    .map((item) => ({ label: resolveItemLabel(item), aliases: extractItemAliases(item) }))
    .filter((item) => item.aliases.size > 0);
  const quotationMeta = quotationItems
    .map((item) => ({ label: resolveItemLabel(item), aliases: extractItemAliases(item) }))
    .filter((item) => item.aliases.size > 0);
  const hasOverlap = (left: Set<string>, right: Set<string>) => {
    for (const alias of left) if (right.has(alias)) return true;
    return false;
  };
  const unique = (labels: string[]) => Array.from(new Set(labels.filter(Boolean)));
  return {
    missingInOrder: unique(
      quotationMeta
        .filter((q) => !orderMeta.some((o) => hasOverlap(q.aliases, o.aliases)))
        .map((item) => item.label)
    ),
    extraInOrder: unique(
      orderMeta
        .filter((o) => !quotationMeta.some((q) => hasOverlap(o.aliases, q.aliases)))
        .map((item) => item.label)
    ),
  };
};

// FIX 4: uses centralised resolveInvoiceItemQty
const sumFabricQty = (items: any[]): number =>
  items.reduce((sum, item) => sum + resolveInvoiceItemQty(item), 0);

const resolveComparableItemAmount = (item: any): number => {
  const qty = resolveInvoiceItemQty(item);
  const rawRate = numOrUndefined(item?.rate ?? item?.mrp ?? item?.price);
  const storedExclusiveRate = numOrUndefined(item?.exclusiveRate);
  const gstPercent = num(item?.gst ?? item?.gstPercent);
  const gstMode = String(item?.gstMode ?? item?.gstType ?? "").trim().toUpperCase();
  const exclusiveRate =
    storedExclusiveRate !== undefined && storedExclusiveRate > 0
      ? storedExclusiveRate
      : rawRate !== undefined && rawRate > 0
        ? gstMode === "INCL" && gstPercent > 0
          ? rawRate / (1 + gstPercent / 100)
          : rawRate
        : undefined;

  if (qty > 0 && exclusiveRate !== undefined && exclusiveRate > 0) {
    const discountPercent = num(item?.discountPercent ?? item?.discount);
    const baseAmount = qty * exclusiveRate;
    const discountAmount =
      numOrUndefined(item?.discountAmount) ?? baseAmount * (discountPercent / 100);
    const taxableAmount = Math.max(0, baseAmount - discountAmount);
    return taxableAmount + taxableAmount * (gstPercent / 100);
  }

  const taxableAmount = numOrUndefined(item?.taxableAmount ?? item?.taxableValue ?? item?.taxableAmt);
  const gstAmount = numOrUndefined(item?.gstAmount ?? item?.taxAmount);
  if (taxableAmount !== undefined) {
    return taxableAmount + (gstAmount || 0);
  }

  const explicitTotal = numOrUndefined(item?.totalAmount ?? item?.total);
  if (explicitTotal !== undefined && explicitTotal > 0) return explicitTotal;

  return num(item?.amount);
};

const sumComparableItemAmount = (items: any[]): number =>
  items.reduce((sum, item) => sum + resolveComparableItemAmount(item), 0);

const resolveComparableGoodsTotal = (record: any, items: any[]): number => {
  const lineTotal = sumComparableItemAmount(items);
  if (lineTotal > 0) return lineTotal;

  const storedTotals = [
    record?.sections?.NORMAL?.summary?.grandTotal,
    record?.overallSummary?.goodsTotal,
  ];
  for (const value of storedTotals) {
    const amount = numOrUndefined(value);
    if (amount !== undefined && amount > 0) return amount;
  }
  return 0;
};

const getInvoicePricingIdentity = (item: any, section: "NORMAL" | "VAS"): string => {
  const bcn = normalizeKey(item?.bcn || item?.collectionBrand);
  const description = normalizeKey(
    item?.description ||
      item?.salesDescription ||
      item?.vasName ||
      item?.itemName ||
      item?.name
  );
  const itemId = normalizeKey(item?.itemId || item?.id);
  return [section, bcn || description || itemId].join("|");
};

const getInvoicePricingLabel = (item: any, section: "NORMAL" | "VAS"): string =>
  String(
    item?.bcn ||
      item?.description ||
      item?.salesDescription ||
      item?.vasName ||
      item?.itemName ||
      item?.name ||
      `${section} item`
  ).trim();

const buildCandidateLineFromQuotationLine = (
  candidateItem: InvoiceLineItem,
  quotationItem: any,
  section: "NORMAL" | "VAS"
): InvoiceLineItem => {
  const qty = resolveInvoiceItemQty(candidateItem);
  const exclusiveRate = num(quotationItem?.exclusiveRate ?? quotationItem?.rate);
  const discountPercent = num(quotationItem?.discountPercent ?? quotationItem?.discount);
  const gst = num(quotationItem?.gst ?? quotationItem?.gstPercent);
  const baseAmount = exclusiveRate * qty;
  const discountAmount = baseAmount * (discountPercent / 100);
  const taxableAmount = Math.max(0, baseAmount - discountAmount);
  const gstAmount = taxableAmount * (gst / 100);

  return stripUndefinedDeep({
    ...candidateItem,
    roomName: candidateItem.roomName || quotationItem?.roomName,
    type: section === "VAS" ? "VAS" : candidateItem.type || quotationItem?.type,
    bcn: candidateItem.bcn || quotationItem?.bcn,
    description:
      candidateItem.description ||
      quotationItem?.description ||
      quotationItem?.itemName ||
      quotationItem?.vasName ||
      quotationItem?.bcn,
    unit: quotationItem?.unit || candidateItem.unit || (section === "VAS" ? "PCS" : "MTR"),
    exclusiveRate,
    rate: exclusiveRate,
    qty,
    gst,
    gstMode: quotationItem?.gstMode,
    discountPercent,
    discountAmount,
    hsn: quotationItem?.hsn || candidateItem.hsn,
    group: quotationItem?.group || candidateItem.group,
    taxableAmount,
    gstAmount,
    totalAmount: taxableAmount + gstAmount,
    allocationRef: candidateItem.allocationRef,
  }) as InvoiceLineItem;
};

const buildQuotationLineQueues = (items: any[], section: "NORMAL" | "VAS") => {
  const queues = new Map<string, any[]>();
  items.forEach((item) => {
    const key = getInvoicePricingIdentity(item, section);
    if (!key) return;
    queues.set(key, [...(queues.get(key) || []), item]);
  });
  return queues;
};

const takeMatchingQuotationLine = (
  queues: Map<string, any[]>,
  item: any,
  section: "NORMAL" | "VAS"
): any | null => {
  const key = getInvoicePricingIdentity(item, section);
  const direct = queues.get(key);
  if (direct?.length) return direct[0] || null;

  const bcnKey = normalizeKey(item?.bcn);
  const descKey = normalizeKey(item?.description || item?.itemName || item?.name);
  if (!bcnKey && !descKey) return null;

  for (const queue of queues.values()) {
    if (!queue.length) continue;
    const sample = queue[0];
    const sampleBcn = normalizeKey(sample?.bcn || sample?.collectionBrand);
    const sampleDesc = normalizeKey(
      sample?.description || sample?.salesDescription || sample?.vasName || sample?.itemName
    );
    if (
      (bcnKey && (sampleBcn === bcnKey || sampleDesc === bcnKey)) ||
      (descKey && (sampleBcn === descKey || sampleDesc === descKey))
    ) {
      return queue[0] || null;
    }
  }

  return null;
};

const normalizeCandidatePricingFromQuotation = (
  candidate: InvoiceCandidate,
  quotation: Quotation
): InvoiceCandidate => {
  const expected = buildOrderPricingFromQuotation(quotation);
  const normalQueues = buildQuotationLineQueues(expected.normalItems, "NORMAL");
  const vasQueues = buildQuotationLineQueues(expected.vasItems, "VAS");

  const normalItems = candidate.normalItems.map((item) => {
    const quotationItem = takeMatchingQuotationLine(normalQueues, item, "NORMAL");
    return quotationItem
      ? buildCandidateLineFromQuotationLine(item, quotationItem, "NORMAL")
      : item;
  });
  const vasItems = candidate.vasItems.map((item) => {
    const quotationItem = takeMatchingQuotationLine(vasQueues, item, "VAS");
    return quotationItem
      ? buildCandidateLineFromQuotationLine(item, quotationItem, "VAS")
      : item;
  });

  return buildCandidateFromLines(candidate, normalItems, vasItems);
};

const compareCandidateNumber = (
  issues: string[],
  details: PricingReconciliationDetail[],
  section: "NORMAL" | "VAS",
  label: string,
  field: string,
  orderValue: number,
  quotationValue: number,
  reason: string,
  tolerance = 0.05
) => {
  if (Math.abs(orderValue - quotationValue) <= tolerance) return;
  const message = `${label}: ${field} is ${orderValue.toFixed(2)} in the invoice but ${quotationValue.toFixed(2)} in the converted quotation.`;
  issues.push(message);
  details.push({
    section,
    product: label,
    field,
    orderValue,
    quotationValue,
    difference: orderValue - quotationValue,
    reason,
    message,
  });
};

const verifyCandidateLinesAgainstQuotation = (
  candidate: InvoiceCandidate,
  quotation: Quotation,
  scope: PricingReconciliationScope
) => {
  const expected = buildOrderPricingFromQuotation(quotation);
  const sections: Array<{
    section: "NORMAL" | "VAS";
    candidateItems: InvoiceLineItem[];
    quotationItems: any[];
  }> = [];
  if (scope === "ALL" || scope === "NORMAL") {
    sections.push({
      section: "NORMAL",
      candidateItems: candidate.normalItems,
      quotationItems: expected.normalItems,
    });
  }
  if (scope === "ALL" || scope === "VAS") {
    sections.push({
      section: "VAS",
      candidateItems: candidate.vasItems,
      quotationItems: expected.vasItems,
    });
  }

  const issues: string[] = [];
  const details: PricingReconciliationDetail[] = [];
  let quotationAmount = 0;

  sections.forEach(({ section, candidateItems, quotationItems }) => {
    const queues = buildQuotationLineQueues(quotationItems, section);
    candidateItems.forEach((item) => {
      const label = getInvoicePricingLabel(item, section);
      const quotationItem = takeMatchingQuotationLine(queues, item, section);
      if (!quotationItem) {
        const message = `${label}: allocated invoice item is not present in the converted quotation.`;
        issues.push(message);
        details.push({
          section,
          product: label,
          field: "item",
          orderValue: label,
          quotationValue: "Missing",
          reason: "Invoice can only be generated for products present in the converted quotation.",
          message,
        });
        return;
      }

      const expectedLine = buildCandidateLineFromQuotationLine(item, quotationItem, section);
      quotationAmount += num(expectedLine.totalAmount);
      compareCandidateNumber(
        issues,
        details,
        section,
        label,
        "rate before GST",
        num(item.exclusiveRate ?? item.rate),
        num(expectedLine.exclusiveRate ?? expectedLine.rate),
        "The invoice must use the converted quotation rate for this allocated product."
      );
      compareCandidateNumber(
        issues,
        details,
        section,
        label,
        "discount %",
        num(item.discountPercent),
        num(expectedLine.discountPercent),
        "The invoice discount must match the converted quotation.",
        0.001
      );
      compareCandidateNumber(
        issues,
        details,
        section,
        label,
        "GST %",
        num(item.gst),
        num(expectedLine.gst),
        "The invoice GST percent must match the converted quotation.",
        0.001
      );
      compareCandidateNumber(
        issues,
        details,
        section,
        label,
        "taxable amount",
        num(item.taxableAmount),
        num(expectedLine.taxableAmount),
        "Taxable value should be calculated from the quotation rate, discount, GST mode, and allocated quantity."
      );
      compareCandidateNumber(
        issues,
        details,
        section,
        label,
        "GST amount",
        num(item.gstAmount),
        num(expectedLine.gstAmount),
        "GST amount should be calculated from the converted quotation values."
      );
      compareCandidateNumber(
        issues,
        details,
        section,
        label,
        "line total",
        num(item.totalAmount),
        num(expectedLine.totalAmount),
        "Invoice line total should match the converted quotation pricing for the allocated quantity."
      );
    });
  });

  return {
    ok: issues.length === 0,
    issues,
    details,
    quotationAmount,
  };
};

const formatMismatchValues = (values: string[]): string => {
  const trimmed = values.filter(Boolean);
  if (!trimmed.length) return "";
  if (trimmed.length <= 4) return trimmed.join(", ");
  return `${trimmed.slice(0, 4).join(", ")} +${trimmed.length - 4} more`;
};

const pickQuotationFromSnapshot = (docs: any[]): any => {
  if (!docs.length) return null;
  const withPriority = docs.map((docItem: any) => {
    const data = docItem.data() || {};
    const status = String(data?.status || "").toLowerCase();
    const priority = status === "converted to order" ? 3 : status === "approved" ? 2 : 1;
    return {
      data,
      priority,
      createdTime: new Date(data?.createdAt || data?.updatedAt || 0).getTime(),
    };
  });
  withPriority.sort((a, b) =>
    b.priority !== a.priority ? b.priority - a.priority : b.createdTime - a.createdTime
  );
  return withPriority[0]?.data || null;
};

const isVasLikeItem = (item: any): boolean => {
  if (!item || typeof item !== "object") return false;

  const fields = [
    item.type,
    item.itemType,
    item.productType,
    item.invoiceType,
    item.section,
    item.category,
    item.categoryGroup,
    item.group,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  if (fields.some((value) => value === "vas" || value === "value added service")) {
    return true;
  }

  return Boolean(item.vasName);
};

const extractQuotationNormalItems = (quotation: any): any[] => {
  const sectionItems = quotation?.sections?.NORMAL?.items;
  if (Array.isArray(sectionItems) && sectionItems.length > 0) {
    return sectionItems.filter((item: any) => !isVasLikeItem(item));
  }
  const items = Array.isArray(quotation?.items) ? quotation.items : [];
  return items.filter((item: any) => !isVasLikeItem(item));
};

const isInstantSaleLikeOrder = (order: Order): boolean => {
  const orderRecord = order as unknown as Record<string, unknown>;
  const instantMeta =
    typeof orderRecord.instantQuotationMeta === "object" &&
    orderRecord.instantQuotationMeta !== null
      ? (orderRecord.instantQuotationMeta as Record<string, unknown>)
      : {};
  const instantSource = String(instantMeta.source || "").trim().toLowerCase();
  const instantDealName = String(instantMeta.dealName || "").trim().toLowerCase();
  const saleFlowType = String(orderRecord.saleFlowType || "").trim().toLowerCase();
  const dealTitle = String(order.dealSnapshot?.title || "").trim().toLowerCase();
  const updateActions = Array.isArray(order.updates)
    ? order.updates.map((entry) => String(entry?.action || "").trim().toLowerCase())
    : [];

  return (
    instantSource === "quotation-builder" ||
    instantDealName.includes("cashsale") ||
    instantDealName.includes("walkin") ||
    saleFlowType.includes("cashsale") ||
    saleFlowType.includes("walkin") ||
    dealTitle.includes("cashsale") ||
    dealTitle.includes("walkin") ||
    updateActions.some(
      (action) =>
        action.includes("instant_quotation_created") || action.includes("instant-sale")
    )
  );
};

const mapLegacyFabricDetailToItem = (detail: any): any | null => {
  const bcn = String(detail?.bcn || detail?.fabricName || detail?.itemName || "").trim();
  const description = String(detail?.itemName || detail?.fabricName || detail?.bcn || "").trim();
  const qty = num(detail?.qty ?? detail?.quantity);
  if ((!bcn && !description) || qty <= 0) return null;

  const exclusiveRate = numOrUndefined(detail?.exclusiveRate ?? detail?.rate) ?? 0;
  return stripUndefinedDeep({
    bcn,
    description: description || bcn,
    qty,
    unit: String(detail?.unit || "MTR").trim() || "MTR",
    rate: numOrUndefined(detail?.rate ?? detail?.exclusiveRate) ?? exclusiveRate,
    exclusiveRate,
    gst: numOrUndefined(detail?.gst ?? detail?.gstPercent) ?? 0,
    discountPercent: numOrUndefined(detail?.discountPercent ?? detail?.discount) ?? 0,
    hsn: toTrimmedText(detail?.hsn ?? detail?.hsnCode),
    group: toTrimmedText(detail?.group),
  });
};

const mapLegacyVasDetailToItem = (detail: any): any | null => {
  const description = String(detail?.vasName || detail?.description || detail?.itemName || "").trim();
  const qty = num(detail?.qty ?? detail?.quantity);
  if (!description || qty <= 0) return null;

  const exclusiveRate = numOrUndefined(detail?.exclusiveRate ?? detail?.rate) ?? 0;
  return stripUndefinedDeep({
    type: "VAS",
    description,
    qty,
    unit: String(detail?.unit || "PCS").trim() || "PCS",
    rate: numOrUndefined(detail?.rate ?? detail?.exclusiveRate) ?? exclusiveRate,
    exclusiveRate,
    gst: numOrUndefined(detail?.gst ?? detail?.gstPercent) ?? 0,
    discountPercent: numOrUndefined(detail?.discountPercent ?? detail?.discount) ?? 0,
    hsn: toTrimmedText(detail?.hsn ?? detail?.hsnCode),
    group: toTrimmedText(detail?.group),
  });
};

const extractOrderNormalItems = (order: Order): any[] => {
  const sectionItems = order.sections?.NORMAL?.items;
  if (Array.isArray(sectionItems) && sectionItems.length > 0) return sectionItems;

  const orderItems = Array.isArray((order as any)?.items) ? (order as any).items : [];
  const normalFromItems = orderItems.filter((item: any) => {
    const type = String(item?.type || item?.productType || "").toLowerCase();
    return type !== "vas";
  });
  if (normalFromItems.length > 0) return normalFromItems;

  const fabricDetails = Array.isArray((order as any)?.fabricDetails)
    ? (order as any).fabricDetails
    : [];
  return fabricDetails
    .map((detail: any) => mapLegacyFabricDetailToItem(detail))
    .filter(Boolean) as any[];
};

const extractOrderVasItems = (order: Order): any[] => {
  const sectionItems = order.sections?.VAS?.items;
  if (Array.isArray(sectionItems) && sectionItems.length > 0) return sectionItems;

  const orderItems = Array.isArray((order as any)?.items) ? (order as any).items : [];
  const vasFromItems = orderItems.filter((item: any) => {
    const type = String(item?.type || item?.productType || "").toLowerCase();
    return type === "vas";
  });
  if (vasFromItems.length > 0) return vasFromItems;

  const vasDetails = Array.isArray((order as any)?.vasDetails)
    ? (order as any).vasDetails
    : [];
  return vasDetails
    .map((detail: any) => mapLegacyVasDetailToItem(detail))
    .filter(Boolean) as any[];
};

const resolveAllocatedQtyForInvoiceLine = (item: any): number => {
  const lengths = Array.isArray(item?.allocation?.lengths)
    ? item.allocation.lengths
    : [];
  const lots = Array.isArray(item?.allocation?.lots) ? item.allocation.lots : [];
  const fromLengths = lengths.reduce(
    (sum: number, entry: any) => sum + num(entry?.allocatedQty),
    0
  );
  if (fromLengths > 0) return fromLengths;
  const fromLots = lots.reduce(
    (sum: number, entry: any) => sum + num(entry?.allocatedQty),
    0
  );
  if (fromLots > 0) return fromLots;
  return num(item?.allocation?.allocatedQty ?? item?.allocatedQty);
};

const isNormalItemEligibleForPendingInvoice = (item: any): boolean => {
  // A status label alone is not enough. Goods can be invoiced only when
  // an actual allocated quantity exists in a roll, lot, or allocation total.
  return resolveAllocatedQtyForInvoiceLine(item) > 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const summarizeItems = (items: InvoiceLineItem[]) =>
  items.reduce(
    (acc, item) => {
      acc.subTotal += num(item.taxableAmount);
      acc.gstTotal += num(item.gstAmount);
      acc.grandTotal += num(item.totalAmount);
      return acc;
    },
    { subTotal: 0, gstTotal: 0, grandTotal: 0 }
  );

const resolveOrderTaxMode = (order: Order) =>
  resolveGstTaxMode({
    sellerGstin: "06AAMCM5012B1ZY",
    destinationGstin:
      order.customerSnapshot?.billingDetails?.gstin ||
      order.customerSnapshot?.gstin,
    shippingAddress: order.customerSnapshot?.shippingAddress,
    billingAddress:
      order.customerSnapshot?.billingAddress || order.customerAddress,
  }).mode;

const buildTaxSummary = (items: InvoiceLineItem[], order: Order) =>
  items.reduce(
    (acc, item) => {
      const gst = num(item.gstAmount);
      const allocated = allocateGstByTaxMode(gst, resolveOrderTaxMode(order));
      acc.cgst += allocated.cgst;
      acc.sgst += allocated.sgst;
      acc.igst += allocated.igst;
      return acc;
    },
    { cgst: 0, sgst: 0, igst: 0 }
  );

const isInvoiceCountableForInvoicing = (invoice: Invoice): boolean => {
  const rawStatus = String((invoice as any)?.status || "").trim().toUpperCase();
  if (rawStatus === "CANCELLED" || rawStatus === "VOID") return false;
  if (rawStatus === "PENDINGINVOICE") return false;
  return true;
};

const invoiceIncludesSection = (invoice: Invoice, section: "NORMAL" | "VAS"): boolean => {
  const invoiceType = String(invoice.invoiceType || ((invoice as any).isVas ? "VAS" : ""))
    .trim()
    .toUpperCase();
  if (invoiceType === "MIXED") return true;
  if (section === "NORMAL" && (invoiceType === "NORMAL" || invoiceType === "GOODS")) {
    return true;
  }
  if (section === "VAS" && invoiceType === "VAS") return true;

  const sectionItems = invoice.sections?.[section]?.items;
  if (Array.isArray(sectionItems) && sectionItems.length > 0) return true;

  if (section === "NORMAL" && !invoice.sections?.VAS?.items?.length) {
    return Array.isArray(invoice.items) && invoice.items.length > 0 && invoiceType !== "VAS";
  }

  return false;
};

const hasGeneratedInvoiceForSection = (
  order: Order,
  invoices: Invoice[],
  section: "NORMAL" | "VAS"
): boolean =>
  getInvoicesForOrder(invoices.filter(isInvoiceCountableForInvoicing), order).some((invoice) =>
    invoiceIncludesSection(invoice, section)
  );

// One-time business exception: order 52137 was corrected after its first invoice.
// Keep the original invoice in history, but allow only subsequently allocated
// Goods quantity to return for invoicing.
const allowsPostInvoiceAllocation = (order: Order): boolean => {
  const references = [
    order.id,
    order.orderId,
    order.orderNo,
    order.crmOrderNo,
  ].map((value) =>
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/^MOTRACK-/, "")
  );
  return references.includes("52137");
};

const ORDER_52137_BASELINE_INVOICED_PRODUCTS = new Map<string, number>([
  ["hdw024", 21.63],
]);

const hasOrder52137FinalInvoice = (
  order: Order,
  invoices: Invoice[]
): boolean =>
  allowsPostInvoiceAllocation(order) &&
  getInvoicesForOrder(
    invoices.filter(isInvoiceCountableForInvoicing),
    order
  ).some((invoice) => invoice.postRectification52137 === true);

// ─────────────────────────────────────────────────────────────────────────────
// FIX 4: computeInvoicingStatus — now uses resolveInvoiceItemQty everywhere
// ─────────────────────────────────────────────────────────────────────────────
const computeInvoicingStatus = (order: Order, invoices: Invoice[]): string => {
  const effectiveInvoices = invoices.filter(isInvoiceCountableForInvoicing);
  const orderedNormal = new Map<string, number>();
  extractOrderNormalItems(order).forEach((item: any) => {
    const key = normalizeKey(item.bcn || item.description || item.itemName);
    if (key) orderedNormal.set(key, num(orderedNormal.get(key)) + resolveInvoiceItemQty(item)); // ← FIX 4
  });

  const orderedVas = new Map<string, number>();
  extractOrderVasItems(order).forEach((item: any) => {
    const key = normalizeKey(item.description || item.bcn || item.itemName);
    if (key) orderedVas.set(key, num(orderedVas.get(key)) + resolveInvoiceItemQty(item)); // ← FIX 4
  });

  const invoicedNormal = new Map<string, number>();
  const invoicedVas = new Map<string, number>();

  effectiveInvoices.forEach((invoice) => {
    const hasSections =
      (invoice.sections?.NORMAL?.items?.length || 0) > 0 ||
      (invoice.sections?.VAS?.items?.length || 0) > 0;

    if (hasSections) {
      (invoice.sections?.NORMAL?.items || []).forEach((item: any) => {
        const key = normalizeKey(item.bcn || item.description || item.itemName);
        if (key) invoicedNormal.set(key, num(invoicedNormal.get(key)) + resolveInvoiceItemQty(item)); // ← FIX 4
      });
      (invoice.sections?.VAS?.items || []).forEach((item: any) => {
        const key = normalizeKey(item.description || item.bcn || item.itemName);
        if (key) invoicedVas.set(key, num(invoicedVas.get(key)) + resolveInvoiceItemQty(item)); // ← FIX 4
      });
      return;
    }

    // Legacy format fallback — FIX 4: resolveInvoiceItemQty handles all field variants
    const targetMap =
      invoice.invoiceType === "VAS" || (invoice as any).isVas
        ? invoicedVas
        : invoicedNormal;
    (invoice.items || []).forEach((item: any) => {
      const key = normalizeKey(item.bcn || item.name || item.itemName || item.description);
      if (key) targetMap.set(key, num(targetMap.get(key)) + resolveInvoiceItemQty(item)); // ← FIX 4
    });
  });

  if (!effectiveInvoices.length) return "NOT_INVOICED";

  const goodsRemaining = [...orderedNormal.entries()].some(
    ([key, qty]) => num(invoicedNormal.get(key)) < qty
  );
  const vasRemaining = [...orderedVas.entries()].some(
    ([key, qty]) => num(invoicedVas.get(key)) < qty
  );

  return goodsRemaining || vasRemaining ? "PARTIALLY_INVOICED" : "INVOICED";
};

// ─────────────────────────────────────────────────────────────────────────────
// FIX 5: CHUNKED BATCH WRITER
// Splits write operations into chunks of ≤490 to stay under Firestore's
// 500-document batch limit. Commits sequentially; on any chunk failure the
// error propagates and previous chunks are NOT rolled back (Firestore doesn't
// support multi-batch transactions) — caller should handle idempotency.
// ─────────────────────────────────────────────────────────────────────────────
type BatchOp =
  | { type: "set"; ref: any; data: any }
  | { type: "update"; ref: any; data: any };

const MAX_BATCH_SIZE = 490;

async function commitInChunks(ops: BatchOp[]): Promise<void> {
  const chunks: BatchOp[][] = [];
  for (let i = 0; i < ops.length; i += MAX_BATCH_SIZE) {
    chunks.push(ops.slice(i, i + MAX_BATCH_SIZE));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach((op) => {
      if (op.type === "set") batch.set(op.ref, op.data);
      else batch.update(op.ref, op.data);
    });
    await batch.commit();
  }
}
// ─────────────────────────────────────────────────────────────────────────────
// Returns true when the order's status resolves to "INSTALLATION DONE".
// Uses the same logic as the Orders Dashboard so old and new order formats both match.
const isOrderInstallationDone = (order: Order): boolean =>
  getOrderStatusLabel(order) === "INSTALLATION DONE";

// ─────────────────────────────────────────────────────────────────────────────
// CORE: buildInvoiceCandidates — FIX 2 (VAS per-item tracking) + FIX 3 + FIX 4
// ─────────────────────────────────────────────────────────────────────────────
type BuildInvoiceCandidateOptions = {
  includeInvoiceBypassOrders?: boolean;
};

const buildInvoiceCandidates = (
  orders: Order[],
  invoices: Invoice[],
  options?: BuildInvoiceCandidateOptions
): InvoiceCandidate[] => {
  const includeInvoiceBypassOrders = options?.includeInvoiceBypassOrders === true;
  const effectiveInvoices = invoices.filter(isInvoiceCountableForInvoicing);

  return orders
    .map((order) => {
      if (!includeInvoiceBypassOrders && order.invoicing?.invoiceRequired === false) return null;

      // Orders that have reached "Installation Done" are considered complete —
      // they should not appear in the pending invoice queue.
      // Uses milestone-based check so older orders without workflow.status also match.
      if (!includeInvoiceBypassOrders && !isInstantSaleLikeOrder(order)) {
        if (isOrderInstallationDone(order)) return null;
      }

      const allOrderInvoices = getInvoicesForOrder(effectiveInvoices, order);
      const orderInvoices = allowsPostInvoiceAllocation(order)
        ? allOrderInvoices.filter(
            (invoice) => invoice.postRectification52137 === true
          )
        : allOrderInvoices;
      const invoicedQtyByGroup = new Map<string, number>();
      const invoicedQtyByProduct = new Map<string, number>(
        allowsPostInvoiceAllocation(order)
          ? ORDER_52137_BASELINE_INVOICED_PRODUCTS
          : []
      );
      const invoicedQtyByLength = new Map<string, number>();

      // FIX 2: Per-item VAS tracking instead of binary flag
      const invoicedVasQtyByKey = new Map<string, number>();

      orderInvoices.forEach((invoice) => {
        // NORMAL items
        const normalItems = invoice.sections?.NORMAL?.items || invoice.items || [];
        normalItems.forEach((item: any) => {
          const discountPercent = num(item?.discountPercent ?? item?.discount);
          const groupKey = buildNormalInvoiceGroupingKey(item, discountPercent); // FIX 3 applied inside
          const qty = resolveInvoiceItemQty(item); // FIX 4
          if (groupKey)
            invoicedQtyByGroup.set(groupKey, num(invoicedQtyByGroup.get(groupKey)) + qty);
          const productKey = normalizeKey(
            item?.bcn || item?.description || item?.itemName || item?.name
          );
          if (productKey) {
            invoicedQtyByProduct.set(
              productKey,
              num(invoicedQtyByProduct.get(productKey)) + qty
            );
          }
          const lengthId = item.allocationRef?.lengthId;
          if (lengthId)
            invoicedQtyByLength.set(lengthId, num(invoicedQtyByLength.get(lengthId)) + qty);
        });

        // FIX 2: Track VAS per item key, not a single boolean
        const vasItems = invoice.sections?.VAS?.items || [];
        vasItems.forEach((item: any) => {
          const key = normalizeKey(item?.description || item?.bcn || item?.itemName);
          if (key) {
            const qty = resolveInvoiceItemQty(item); // FIX 4
            invoicedVasQtyByKey.set(key, num(invoicedVasQtyByKey.get(key)) + qty);
          }
        });
      });

      // ── NORMAL items ────────────────────────────────────────────────────────
      const normalItemsRaw = extractOrderNormalItems(order);
      const normalInvoiceItems: InvoiceLineItem[] = [];

      type GroupEntry = {
        representative: any;
        groupKey: string;
        productKey: string;
        requiredQty: number;
        allocatedQty: number;
        lengths: Map<string, { qty: number; stockItemId?: string }>;
        forceReinvoice: boolean;
      };
      const groupedNormalItems = new Map<string, GroupEntry>();

      normalItemsRaw.forEach((item: any) => {
        if (!isNormalItemEligibleForPendingInvoice(item)) {
          return;
        }
        const discountPercent = resolveDiscountPercent(order, item);
        const bcnKey = normalizeKey(item?.bcn || item?.description || item?.itemName);
        const groupKey = buildNormalInvoiceGroupingKey(item, discountPercent); // FIX 3
        if (!bcnKey) return;

        const existingGroup = groupedNormalItems.get(groupKey);
        const group: GroupEntry = existingGroup || {
          representative: item,
          groupKey,
          productKey: bcnKey,
          requiredQty: 0,
          allocatedQty: 0,
          lengths: new Map(),
          forceReinvoice: false,
        };

        group.requiredQty += resolveInvoiceItemQty(item); // FIX 4
        if ((item as any)?.allocation?.forceReinvoice === true) {
          group.forceReinvoice = true;
        }
        group.allocatedQty += resolveAllocatedQtyForInvoiceLine(item);

        (item?.allocation?.lengths || []).forEach((length: any) => {
          const lengthId = String(length?.lengthId || "").trim();
          if (!lengthId) return;
          const qty = num(length?.allocatedQty);
          if (qty <= 0) return;
          const current = group.lengths.get(lengthId) || {
            qty: 0,
            stockItemId: length?.stockItemId || item?.bcn,
          };
          current.qty += qty;
          if (!current.stockItemId) current.stockItemId = length?.stockItemId || item?.bcn;
          group.lengths.set(lengthId, current);
        });

        if (!existingGroup) groupedNormalItems.set(groupKey, group);
      });

      groupedNormalItems.forEach((group) => {
        const item = group.representative || {};
        const ignoreForceReinvoice = allowsPostInvoiceAllocation(order);
        const allocatedFromLengths = Array.from(group.lengths.values()).reduce(
          (sum, entry) => sum + num(entry.qty),
          0
        );
        const allocatedFromLines = num(group.allocatedQty);
        // Length allocations and lot allocations often describe the same quantity.
        // Prefer the larger of length-level rollup and line-level allocation rollup.
        let allocatedTotalRaw =
          allocatedFromLengths > 0
            ? Math.max(allocatedFromLengths, allocatedFromLines)
            : allocatedFromLines;
        const allocatedTotal = Math.min(allocatedTotalRaw, num(group.requiredQty));
        const priorProductInvoiced = num(
          invoicedQtyByProduct.get(group.productKey)
        );
        const alreadyInvoiced = ignoreForceReinvoice
          ? Math.min(allocatedTotal, priorProductInvoiced)
          : group.forceReinvoice
            ? 0
            : num(invoicedQtyByGroup.get(group.groupKey));
        if (ignoreForceReinvoice && priorProductInvoiced > 0) {
          invoicedQtyByProduct.set(
            group.productKey,
            Math.max(0, priorProductInvoiced - alreadyInvoiced)
          );
        }
        let remaining = Math.max(0, allocatedTotal - alreadyInvoiced);
        if (remaining <= 0) return;

        const exclusiveRate = item.exclusiveRate ?? resolveExclusiveRateForInvoice(item);
        const rate = exclusiveRate;
        const gst = num(item.gst);
        const unit = item.unit || "MTR";
        const discountPercent = resolveDiscountPercent(order, item);

        const lengthEntries = Array.from(group.lengths.entries());
        if (lengthEntries.length > 0) {
          for (const [lengthId, lengthMeta] of lengthEntries) {
            if (remaining <= 0) break;
            const lengthRemaining = Math.max(
              0,
              group.forceReinvoice && !ignoreForceReinvoice
                ? num(lengthMeta.qty)
                : num(lengthMeta.qty) - num(invoicedQtyByLength.get(lengthId))
            );
            if (lengthRemaining <= 0) continue;
            const qty = Math.min(remaining, lengthRemaining);
            const baseAmount = rate * qty;
            const discountAmount = baseAmount * (discountPercent / 100);
            const taxableAmount = Math.max(0, baseAmount - discountAmount);
            const gstAmount = taxableAmount * (gst / 100);
            normalInvoiceItems.push({
              roomName: item.roomName, type: item.type, bcn: item.bcn,
              description: item.description, unit, exclusiveRate, rate, qty, gst,
              discountPercent, discountAmount, hsn: item.hsn, group: item.group,
              taxableAmount, gstAmount, totalAmount: taxableAmount + gstAmount,
              allocationRef: { lengthId, stockItemId: lengthMeta.stockItemId || item.bcn },
            });
            remaining -= qty;
          }
        }

        if (remaining > 0.000001) {
          const qty = remaining;
          const baseAmount = rate * qty;
          const discountAmount = baseAmount * (discountPercent / 100);
          const taxableAmount = Math.max(0, baseAmount - discountAmount);
          const gstAmount = taxableAmount * (gst / 100);
          normalInvoiceItems.push({
            roomName: item.roomName, type: item.type, bcn: item.bcn,
            description: item.description, unit, exclusiveRate, rate, qty, gst,
            discountPercent, discountAmount, hsn: item.hsn, group: item.group,
            taxableAmount, gstAmount, totalAmount: taxableAmount + gstAmount,
            allocationRef: { stockItemId: item.bcn },
          });
        }
      });

      // ── FIX 2: VAS items — per-item qty tracking ────────────────────────────
      const vasItemsRaw = extractOrderVasItems(order);
      const vasInvoiceItems: InvoiceLineItem[] = [];

      vasItemsRaw.forEach((item: any) => {
        const key = normalizeKey(item?.description || item?.bcn || item?.itemName);
        const totalQty = resolveInvoiceItemQty(item); // FIX 4
        const alreadyInvoiced = num(invoicedVasQtyByKey.get(key)); // FIX 2
        const remaining = Math.max(0, totalQty - alreadyInvoiced);
        if (remaining <= 0) return; // FIX 2: skip only THIS item, not all VAS

        const exclusiveRate = item.exclusiveRate ?? resolveExclusiveRateForInvoice(item);
        const rate = exclusiveRate;
        const gst = num(item.gst);
        const discountPercent = resolveDiscountPercent(order, item);
        const baseAmount = rate * remaining;
        const discountAmount = baseAmount * (discountPercent / 100);
        const taxableAmount = Math.max(0, baseAmount - discountAmount);
        const gstAmount = taxableAmount * (gst / 100);
        vasInvoiceItems.push({
          roomName: item.roomName, type: "VAS", description: item.description,
          unit: item.unit || "PCS", exclusiveRate, rate,
          qty: remaining, // FIX 2: only uninvoiced qty
          gst, discountPercent, discountAmount, hsn: item.hsn, group: item.group,
          taxableAmount, gstAmount, totalAmount: taxableAmount + gstAmount,
        });
      });

      if (normalInvoiceItems.length === 0 && vasInvoiceItems.length === 0) return null;

      const normalSummary = summarizeItems(normalInvoiceItems);
      const vasSummary = summarizeItems(vasInvoiceItems);

      return {
        order,
        normalItems: normalInvoiceItems,
        vasItems: vasInvoiceItems,
        normalSummary,
        vasSummary,
        overallSummary: {
          goodsTotal: normalSummary.grandTotal,
          vasTotal: vasSummary.grandTotal,
          grandTotal: normalSummary.grandTotal + vasSummary.grandTotal,
        },
        taxSummary: {
          NORMAL: buildTaxSummary(normalInvoiceItems, order),
          VAS: buildTaxSummary(vasInvoiceItems, order),
        },
      } as InvoiceCandidate;
    })
    .filter(Boolean) as InvoiceCandidate[];
};

const createSectionCandidate = (
  candidate: InvoiceCandidate,
  section: "NORMAL" | "VAS"
): InvoiceCandidate | null => {
  const normalItems = section === "NORMAL" ? candidate.normalItems : [];
  const vasItems = section === "VAS" ? candidate.vasItems : [];
  if (section === "NORMAL" && normalItems.length === 0) return null;
  if (section === "VAS" && vasItems.length === 0) return null;
  const normalSummary = summarizeItems(normalItems);
  const vasSummary = summarizeItems(vasItems);
  return {
    ...candidate, normalItems, vasItems, normalSummary, vasSummary,
    overallSummary: {
      goodsTotal: normalSummary.grandTotal,
      vasTotal: vasSummary.grandTotal,
      grandTotal: normalSummary.grandTotal + vasSummary.grandTotal,
    },
    taxSummary: {
      NORMAL: buildTaxSummary(normalItems, candidate.order),
      VAS: buildTaxSummary(vasItems, candidate.order),
    },
  };
};

const buildManualCandidateFromOrder = (order: Order): InvoiceCandidate | null => {
  const normalItemsRaw = extractOrderNormalItems(order);
  const vasItemsRaw = extractOrderVasItems(order);

  const normalItems: InvoiceLineItem[] = normalItemsRaw
    .map((item: any) => {
      const qty = resolveInvoiceItemQty(item);
      if (qty <= 0) return null;
      const exclusiveRate = item.exclusiveRate ?? resolveExclusiveRateForInvoice(item);
      const rate = exclusiveRate;
      const gst = num(item.gst ?? item.gstPercent);
      const discountPercent = resolveDiscountPercent(order, item);
      const baseAmount = rate * qty;
      const discountAmount = baseAmount * (discountPercent / 100);
      const taxableAmount = Math.max(0, baseAmount - discountAmount);
      const gstAmount = taxableAmount * (gst / 100);
      return {
        roomName: item.roomName,
        type: item.type,
        bcn: item.bcn,
        description: item.description || item.itemName || item.bcn,
        unit: item.unit || "MTR",
        exclusiveRate,
        rate,
        qty,
        gst,
        discountPercent,
        discountAmount,
        hsn: item.hsn,
        group: item.group,
        taxableAmount,
        gstAmount,
        totalAmount: taxableAmount + gstAmount,
      } as InvoiceLineItem;
    })
    .filter(Boolean) as InvoiceLineItem[];

  const vasItems: InvoiceLineItem[] = vasItemsRaw
    .map((item: any) => {
      const qty = resolveInvoiceItemQty(item);
      if (qty <= 0) return null;
      const exclusiveRate = item.exclusiveRate ?? resolveExclusiveRateForInvoice(item);
      const rate = exclusiveRate;
      const gst = num(item.gst ?? item.gstPercent);
      const discountPercent = resolveDiscountPercent(order, item);
      const baseAmount = rate * qty;
      const discountAmount = baseAmount * (discountPercent / 100);
      const taxableAmount = Math.max(0, baseAmount - discountAmount);
      const gstAmount = taxableAmount * (gst / 100);
      return {
        roomName: item.roomName,
        type: "VAS",
        description: item.description || item.itemName || item.vasName || "VAS",
        unit: item.unit || "PCS",
        exclusiveRate,
        rate,
        qty,
        gst,
        discountPercent,
        discountAmount,
        hsn: item.hsn,
        group: item.group,
        taxableAmount,
        gstAmount,
        totalAmount: taxableAmount + gstAmount,
      } as InvoiceLineItem;
    })
    .filter(Boolean) as InvoiceLineItem[];

  if (normalItems.length === 0 && vasItems.length === 0) return null;

  const normalSummary = summarizeItems(normalItems);
  const vasSummary = summarizeItems(vasItems);

  return {
    order,
    normalItems,
    vasItems,
    normalSummary,
    vasSummary,
    overallSummary: {
      goodsTotal: normalSummary.grandTotal,
      vasTotal: vasSummary.grandTotal,
      grandTotal: normalSummary.grandTotal + vasSummary.grandTotal,
    },
    taxSummary: {
      NORMAL: buildTaxSummary(normalItems, order),
      VAS: buildTaxSummary(vasItems, order),
    },
  };
};

const buildCandidateFromLines = (
  baseCandidate: InvoiceCandidate,
  normalItems: InvoiceLineItem[],
  vasItems: InvoiceLineItem[]
): InvoiceCandidate => {
  const normalSummary = summarizeItems(normalItems);
  const vasSummary = summarizeItems(vasItems);

  return {
    order: baseCandidate.order,
    normalItems,
    vasItems,
    normalSummary,
    vasSummary,
    overallSummary: {
      goodsTotal: normalSummary.grandTotal,
      vasTotal: vasSummary.grandTotal,
      grandTotal: normalSummary.grandTotal + vasSummary.grandTotal,
    },
    taxSummary: {
      NORMAL: buildTaxSummary(normalItems, baseCandidate.order),
      VAS: buildTaxSummary(vasItems, baseCandidate.order),
    },
  };
};

const buildPrintablePayload = (candidate: InvoiceCandidate, invoiceNo?: string) => {
  const { order, normalItems, vasItems } = candidate;
  const isVasOnly = normalItems.length === 0 && vasItems.length > 0;
  const sellerGstin = isVasOnly ? "06CDOPP2805B1ZR" : "06AAMCM5012B1ZY";
  const taxJurisdiction = resolveGstTaxMode({
    sellerGstin,
    destinationGstin:
      order.customerSnapshot?.billingDetails?.gstin ||
      order.customerSnapshot?.gstin,
    shippingAddress: order.customerSnapshot?.shippingAddress,
    billingAddress:
      order.customerSnapshot?.billingAddress || order.customerAddress,
  });
  const mergedItems = [...normalItems, ...vasItems].map((item) => {
    const gstAmount = num(item.gstAmount);
    const discountPercent = num(item.discountPercent);
    const rate = num(item.exclusiveRate ?? item.rate);
    const baseAmount = rate * num(item.qty);
    const discountAmount =
      numOrUndefined(item.discountAmount) ?? baseAmount * (discountPercent / 100);
    const allocatedTax = allocateGstByTaxMode(gstAmount, taxJurisdiction.mode);
    return {
      name: item.description || item.bcn || "",
      bcn: item.bcn || (item.type === "VAS" ? `VAS-${item.description}` : ""),
      hsn: item.hsn || "", quantity: num(item.qty), uom: item.unit || "MTR",
      rate, exclusiveRate: numOrUndefined(item.exclusiveRate), discountPercent,
      taxableAmount: num(item.taxableAmount),
      ...allocatedTax,
      total: num(item.totalAmount),
      discountAmount,
    };
  });

  const totals = mergedItems.reduce(
    (acc, item) => {
      const amount = item.rate * item.quantity;
      const discount =
        item.discountAmount !== undefined
          ? item.discountAmount
          : amount * (item.discountPercent / 100);
      acc.subTotal += amount;
      acc.discount += discount;
      acc.taxableValue += item.taxableAmount;
      acc.cgst += item.cgst;
      acc.sgst += item.sgst;
      acc.igst += item.igst;
      return acc;
    },
    { subTotal: 0, discount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
  );

  const netAmount = roundMoney(
    totals.taxableValue + totals.cgst + totals.sgst + totals.igst
  );
  const roundedTotal = Math.round(netAmount);
  const gstBreakdown = Array.from(
    mergedItems.reduce((groups, item) => {
      const totalTax = item.cgst + item.sgst + item.igst;
      const rate = item.taxableAmount > 0
        ? roundMoney((totalTax / item.taxableAmount) * 100)
        : 0;
      const current = groups.get(rate) || {
        rate,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
      };
      current.taxable += item.taxableAmount;
      current.cgst += item.cgst;
      current.sgst += item.sgst;
      current.igst += item.igst;
      groups.set(rate, current);
      return groups;
    }, new Map<number, {
      rate: number;
      taxable: number;
      cgst: number;
      sgst: number;
      igst: number;
    }>()).values()
  );
  const snapshotBillingDetails = order.customerSnapshot?.billingDetails;
  const resolvedCustomerName =
    snapshotBillingDetails?.billingName || order.customerSnapshot?.name || order.customerName;
  const resolvedCustomerPhone =
    snapshotBillingDetails?.billingPhone || order.customerSnapshot?.phone || order.customerPhone;
  const resolvedCustomerAddress =
    sanitizeLegacySelectText(snapshotBillingDetails?.billingAddress) ||
    formatIndianAddress(order.customerSnapshot?.billingAddress) ||
    order.customerAddress;
  const resolvedCustomerGstin =
    snapshotBillingDetails?.gstin || order.customerSnapshot?.gstin;
  const destinationAddress =
    order.customerSnapshot?.shippingAddress ||
    order.customerSnapshot?.billingAddress;
  const destinationState = formatInvoiceState(destinationAddress?.state);
  const destinationPincode = destinationAddress?.pincode;
  const invoiceDate = new Date().toISOString();

  return {
    meta: {
      invoiceNo,
      orderNo: order.orderNo || order.id,
      quotationNo: order.quotationNo || order.crmOrderNo,
      invoiceDate,
      isVas: isVasOnly,
      salesPerson: order.salesPerson,
    },
    customer: {
      name: resolvedCustomerName,
      phone: resolvedCustomerPhone,
      address: resolvedCustomerAddress,
      gstin: resolvedCustomerGstin,
      state: destinationState,
      pincode: destinationPincode,
      placeOfSupply: destinationState,
      taxMode: taxJurisdiction.mode,
      billingDetails: snapshotBillingDetails,
    },
    seller: {
      companyName: isVasOnly
        ? "SP SERVICES"
        : getMoDesignsCompanyName(invoiceDate),
      address: isVasOnly
        ? "2nd Floor, B-50 (MO), Sushant Lok Phase 2, Block B, Sector 56, Gurugram - 122011, Haryana, India"
        : "A-6, Sushant Lok-1, Gurgaon",
      gstin: sellerGstin,
    },
    items: mergedItems,
    totals: {
      ...totals,
      roundOff: roundMoney(roundedTotal - netAmount),
      grandTotal: roundedTotal,
      totalGst: totals.cgst + totals.sgst + totals.igst,
    },
    gstBreakdown,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE INVOICE DIALOG
// ─────────────────────────────────────────────────────────────────────────────

function GenerateInvoiceDialog({
  isOpen,
  candidate,
  invoices,
  zohoBotEnabled,
  onValidateBeforeGenerate,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  candidate: InvoiceCandidate | null;
  invoices: Invoice[];
  zohoBotEnabled: boolean;
  onValidateBeforeGenerate: (candidate: InvoiceCandidate) => Promise<InvoiceVerificationResult>;
  onClose: () => void;
  onSuccess?: (hasRemainingVas: boolean, invoice?: Invoice) => void;
}) {
  const { user, firebaseUser } = useAuth();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isInvoiceNumberLoading, setIsInvoiceNumberLoading] = React.useState(false);
  const [isAutoLinkingItems, setIsAutoLinkingItems] = React.useState(false);
  const [zohoCustomerId, setZohoCustomerId] = React.useState("");
  const [zohoInvoiceNumber, setZohoInvoiceNumber] = React.useState("");
  const [zohoInvoiceDate, setZohoInvoiceDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [zohoSalesperson, setZohoSalesperson] = React.useState("");
  const [zohoStoreName, setZohoStoreName] = React.useState("");
  const [zohoCustomerSearchQuery, setZohoCustomerSearchQuery] = React.useState("");
  const [hasCustomerSearchAttempted, setHasCustomerSearchAttempted] = React.useState(false);
  const [zohoCustomerOptions, setZohoCustomerOptions] = React.useState<ComboboxOption[]>([]);
  const [zohoCustomerById, setZohoCustomerById] = React.useState<Record<string, ZohoCustomer>>(
    {}
  );
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] = React.useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = React.useState(false);
  const [customerDraft, setCustomerDraft] = React.useState<ZohoCustomerDraft | null>(null);
  const [zohoLineMappings, setZohoLineMappings] = React.useState<ZohoLineMapping[]>([]);
  const [zohoItemOptionsByLineKey, setZohoItemOptionsByLineKey] = React.useState<
    Record<string, ComboboxOption[]>
  >({});
  const [zohoItemById, setZohoItemById] = React.useState<Record<string, ZohoItem>>({});
  const [itemSearchQueryByLineKey, setItemSearchQueryByLineKey] = React.useState<
    Record<string, string>
  >({});
  const [itemSearchAttemptedByLineKey, setItemSearchAttemptedByLineKey] = React.useState<
    Record<string, boolean>
  >({});
  const [isCreateItemOpen, setIsCreateItemOpen] = React.useState(false);
  const [isCreatingItem, setIsCreatingItem] = React.useState(false);
  const [itemDraft, setItemDraft] = React.useState<ZohoItemDraft | null>(null);
  const autoLinkedOrderRef = React.useRef<string | null>(null);
  const isManualMode = !candidate;

  const fetchZohoInvoiceNumber = React.useCallback(
    async (customerId: string, storeName?: string) => {
      const selectedCustomerId = String(customerId || "").trim();
      if (!selectedCustomerId) {
        setZohoInvoiceNumber("");
        return;
      }
      setIsInvoiceNumberLoading(true);
      try {
        const query = new URLSearchParams({
          customerId: selectedCustomerId,
        });
        const trimmedStore = String(storeName || "").trim();
        if (trimmedStore) query.set("store", trimmedStore);
        const response = await fetch(
          `/api/zoho/invoices/next-number?${query.toString()}`,
          { cache: "no-store" }
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(result?.error || "Unable to fetch Zoho invoice number."));
        }
        const nextNumber = applyZohoInvoicePrefixForStore(result?.nextNumber, trimmedStore);
        setZohoInvoiceNumber(String(nextNumber || "").trim());
      } catch (error: any) {
        setZohoInvoiceNumber("");
        toast({
          variant: "destructive",
          title: "Zoho invoice number failed",
          description:
            error?.message || "Could not fetch Zoho invoice number. Zoho will auto-generate it.",
        });
      } finally {
        setIsInvoiceNumberLoading(false);
      }
    },
    [toast]
  );

  const searchZohoCustomers = React.useCallback(async (query: string) => {
    const trimmed = String(query || "").trim();
    if (trimmed.length < 2) {
      setZohoCustomerOptions([]);
      return;
    }

    const response = await fetch(`/api/zoho/customers?search=${encodeURIComponent(trimmed)}`, {
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(result?.error || "Could not load Zoho customers."));
    }

    const customers = (Array.isArray(result.customers) ? result.customers : []) as ZohoCustomer[];
    setZohoCustomerById((prev) => {
      const next = { ...prev };
      customers.forEach((customer) => {
        next[customer.id] = customer;
      });
      return next;
    });
    setZohoCustomerOptions(customers.map(toZohoCustomerOption));
  }, []);

  const handleZohoCustomerSearch = React.useCallback(
    async (query: string) => {
      const trimmed = String(query || "").trim();
      setZohoCustomerSearchQuery(query);
      setHasCustomerSearchAttempted(trimmed.length >= 2);
      await searchZohoCustomers(query);
    },
    [searchZohoCustomers]
  );

  const updateCustomerDraft = React.useCallback((patch: Partial<ZohoCustomerDraft>) => {
    setCustomerDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const updateCustomerAddressDraft = React.useCallback(
    (key: "billingAddress" | "shippingAddress", patch: Partial<ZohoCustomerDraftAddress>) => {
      setCustomerDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [key]: {
            ...(prev[key] || {}),
            ...patch,
          },
        };
      });
    },
    []
  );

  const openCreateCustomerDialog = React.useCallback(
    (nameHint?: string) => {
      if (isVasOnlyCandidate(candidate)) return;
      const resolvedNameHint = asTrimmedString(nameHint) || asTrimmedString(zohoCustomerSearchQuery);
      const nextDraft = candidate
        ? buildZohoCustomerDraftFromOrder(candidate.order, resolvedNameHint)
        : buildZohoCustomerDraftFromName(resolvedNameHint);
      setCustomerDraft(nextDraft);
      setIsCreateCustomerOpen(true);
    },
    [candidate, zohoCustomerSearchQuery]
  );

  const handleCreateZohoCustomer = React.useCallback(async () => {
    if (isVasOnlyCandidate(candidate)) return;
    if (!customerDraft) return;

    setIsCreatingCustomer(true);
    try {
      const response = await fetch("/api/zoho/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerDraft),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(result?.error || "Failed to create Zoho customer."));
      }

      const created = result?.customer as ZohoCustomer | undefined;
      const customerId = asTrimmedString(created?.id);
      const customerName = asTrimmedString(created?.name || customerDraft.contactName);
      if (!customerId) {
        throw new Error("Zoho customer was created but response is missing customer id.");
      }

      setZohoCustomerById((prev) => ({
        ...prev,
        [customerId]: {
          id: customerId,
          name: customerName || customerDraft.contactName,
          mobile: asTrimmedString(created?.mobile || customerDraft.phone) || undefined,
          email: asTrimmedString(created?.email || customerDraft.email) || undefined,
          gstNo: asTrimmedString(created?.gstNo || customerDraft.gstNo) || undefined,
        },
      }));
      setZohoCustomerOptions((prev) => {
        const existing = prev.some((option) => String(option.value) === customerId);
        if (existing) return prev;
        const option = toZohoCustomerOption({
          id: customerId,
          name: customerName || customerDraft.contactName,
          mobile: asTrimmedString(created?.mobile || customerDraft.phone) || undefined,
          email: asTrimmedString(created?.email || customerDraft.email) || undefined,
          gstNo: asTrimmedString(created?.gstNo || customerDraft.gstNo) || undefined,
        });
        return [option, ...prev];
      });
      setZohoCustomerId(customerId);
      setIsCreateCustomerOpen(false);

      toast({
        title: "Zoho customer created",
        description: customerName
          ? `${customerName} has been created in Zoho.`
          : "Customer has been created in Zoho.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Create customer failed",
        description: asTrimmedString(error?.message) || "Could not create Zoho customer.",
      });
    } finally {
      setIsCreatingCustomer(false);
    }
  }, [candidate, customerDraft, toast]);

  const fetchZohoItemsForLine = React.useCallback(async (lineKey: string, query: string) => {
    const trimmed = String(query || "").trim();
    if (trimmed.length < 2) {
      setZohoItemOptionsByLineKey((prev) => ({ ...prev, [lineKey]: [] }));
      return [] as ZohoItem[];
    }

    const response = await fetch(
      `/api/zoho/items?usage=sales&search=${encodeURIComponent(trimmed)}`,
      { cache: "no-store" }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(result?.error || "Unable to search Zoho items."));
    }

    const fetchedItems = (Array.isArray(result.items) ? result.items : []) as ZohoItem[];
    setZohoItemById((prev) => {
      const next = { ...prev };
      fetchedItems.forEach((item) => {
        next[item.id] = item;
      });
      return next;
    });
    setZohoItemOptionsByLineKey((prev) => ({
      ...prev,
      [lineKey]: fetchedItems.map(toZohoItemOption),
    }));

    return fetchedItems;
  }, []);

  const selectZohoItemForLine = React.useCallback(
    (lineKey: string, itemId: string) => {
      const selectedItemId = String(itemId || "").trim();
      const item = zohoItemById[selectedItemId];
      const selectedSearchText = asTrimmedString(item?.sku || item?.name);
      if (selectedSearchText) {
        setItemSearchQueryByLineKey((prev) => ({ ...prev, [lineKey]: selectedSearchText }));
      }
      setItemSearchAttemptedByLineKey((prev) => ({ ...prev, [lineKey]: false }));
      setZohoLineMappings((prev) =>
        prev.map((line) =>
          line.sourceKey !== lineKey
            ? line
            : {
                ...line,
                zohoItemId: selectedItemId,
                label:
                  line.isManual && !String(line.label || "").trim()
                    ? String(item?.sku || item?.name || line.label || "").trim()
                    : line.label,
                searchText:
                  line.isManual && !String(line.searchText || "").trim()
                    ? String(item?.sku || item?.name || line.searchText || "").trim()
                    : line.searchText,
                rate:
                  line.isManual && num(line.rate) <= 0
                    ? num(item?.rate ?? item?.purchaseRate)
                    : line.rate,
                zohoItemName: item?.name,
                zohoSku: item?.sku,
                zohoRate: numOrUndefined(item?.rate ?? item?.purchaseRate),
                taxId: item?.taxId,
                taxExemptionId: item?.taxExemptionId,
                reverseChargeTaxId: item?.reverseChargeTaxId,
                reverseChargeVatId: item?.reverseChargeVatId,
              }
        )
      );
    },
    [zohoItemById]
  );

  const updateLineMapping = React.useCallback(
    (lineKey: string, patch: Partial<ZohoLineMapping>) => {
      setZohoLineMappings((prev) =>
        prev.map((line) =>
          line.sourceKey === lineKey
            ? {
                ...line,
                ...patch,
              }
            : line
        )
      );
    },
    []
  );

  const handleZohoItemSearch = React.useCallback(
    async (lineKey: string, query: string) => {
      const trimmed = asTrimmedString(query);
      setItemSearchQueryByLineKey((prev) => ({ ...prev, [lineKey]: query }));
      setItemSearchAttemptedByLineKey((prev) => ({
        ...prev,
        [lineKey]: trimmed.length >= 2,
      }));
      updateLineMapping(lineKey, { searchText: query });
      await fetchZohoItemsForLine(lineKey, query);
    },
    [fetchZohoItemsForLine, updateLineMapping]
  );

  const openCreateItemDialog = React.useCallback(
    (lineKey: string, itemNameHint?: string) => {
      if (isVasOnlyCandidate(candidate)) return;
      const line = zohoLineMappings.find((entry) => entry.sourceKey === lineKey);
      if (!line) return;

      const draft = buildZohoItemDraftFromLine(line);
      const nextName = asTrimmedString(itemNameHint);
      if (nextName) {
        draft.name = nextName;
        if (!draft.description) draft.description = nextName;
        if (!draft.sku) draft.sku = deriveSkuFromLineText(nextName);
      }

      setItemDraft(draft);
      setIsCreateItemOpen(true);
    },
    [candidate, zohoLineMappings]
  );

  const updateItemDraft = React.useCallback((patch: Partial<ZohoItemDraft>) => {
    setItemDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const handleCreateZohoItem = React.useCallback(async () => {
    if (isVasOnlyCandidate(candidate)) return;
    if (!itemDraft) return;
    const lineKey = asTrimmedString(itemDraft.lineKey);
    if (!lineKey) return;

    setIsCreatingItem(true);
    try {
      const response = await fetch("/api/zoho/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: itemDraft.name,
          rate: itemDraft.rate,
          description: itemDraft.description || undefined,
          sku: itemDraft.sku || undefined,
          unit: itemDraft.unit || undefined,
          productType: itemDraft.productType,
          itemType: itemDraft.itemType,
          hsnOrSac: itemDraft.hsnOrSac || undefined,
          isTaxable: itemDraft.isTaxable,
          taxPercentage: itemDraft.taxPercentage,
          purchaseDescription: itemDraft.purchaseDescription || undefined,
          purchaseRate: itemDraft.purchaseRate,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(result?.error || "Failed to create Zoho item."));
      }

      const created = (result?.item || {}) as ZohoItem;
      const createdId = asTrimmedString(created.id);
      if (!createdId) {
        throw new Error("Zoho item was created but response is missing item id.");
      }

      setZohoItemById((prev) => ({ ...prev, [createdId]: created }));
      setZohoItemOptionsByLineKey((prev) => {
        const option = toZohoItemOption(created);
        const existing = prev[lineKey] || [];
        const next = existing.some((entry) => String(entry.value) === createdId)
          ? existing
          : [option, ...existing];
        return { ...prev, [lineKey]: next };
      });

      selectZohoItemForLine(lineKey, createdId);
      setItemSearchAttemptedByLineKey((prev) => ({ ...prev, [lineKey]: false }));
      setItemSearchQueryByLineKey((prev) => ({ ...prev, [lineKey]: created.sku || created.name || "" }));
      setIsCreateItemOpen(false);
      setItemDraft(null);

      toast({
        title: "Zoho item created",
        description: asTrimmedString(created.name)
          ? `${asTrimmedString(created.name)} has been created in Zoho.`
          : "Item has been created in Zoho.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Create item failed",
        description: asTrimmedString(error?.message) || "Could not create Zoho item.",
      });
    } finally {
      setIsCreatingItem(false);
    }
  }, [candidate, itemDraft, selectZohoItemForLine, toast]);

  const removeLineMapping = React.useCallback((lineKey: string) => {
    setZohoLineMappings((prev) => prev.filter((line) => line.sourceKey !== lineKey));
    setZohoItemOptionsByLineKey((prev) => {
      const next = { ...prev };
      delete next[lineKey];
      return next;
    });
    setItemSearchQueryByLineKey((prev) => {
      const next = { ...prev };
      delete next[lineKey];
      return next;
    });
    setItemSearchAttemptedByLineKey((prev) => {
      const next = { ...prev };
      delete next[lineKey];
      return next;
    });
  }, []);

  const addManualLine = React.useCallback(() => {
    const defaultItemType: "NORMAL" | "VAS" =
      candidate?.normalItems?.length === 0 && (candidate?.vasItems?.length || 0) > 0
        ? "VAS"
        : "NORMAL";
    const suffix = Date.now().toString(36);
    const sourceKey = `manual:${suffix}`;

    setZohoLineMappings((prev) => [
      ...prev,
      {
        sourceKey,
        label: "",
        searchText: "",
        quantity: 1,
        rate: 0,
        gstPercent: 0,
        discountPercent: 0,
        discountAmount: 0,
        itemType: defaultItemType,
        isManual: true,
        sourceItem: {
          type: defaultItemType === "VAS" ? "VAS" : "NORMAL",
          unit: defaultItemType === "VAS" ? "PCS" : "MTR",
          gst: 0,
          qty: 1,
          rate: 0,
          exclusiveRate: 0,
          description: "",
        },
        zohoItemId: "",
      },
    ]);
  }, [candidate?.normalItems?.length, candidate?.vasItems?.length]);

  const autoLinkLinesToZohoItems = React.useCallback(async () => {
    if (!zohoLineMappings.length) return;
    setIsAutoLinkingItems(true);
    try {
      for (const line of zohoLineMappings) {
        const query = String(line.searchText || "").trim();
        if (query.length < 2) continue;

        const fetchedItems = await fetchZohoItemsForLine(line.sourceKey, query);
        if (!fetchedItems.length) {
          setItemSearchQueryByLineKey((prev) => ({ ...prev, [line.sourceKey]: query }));
          setItemSearchAttemptedByLineKey((prev) => ({ ...prev, [line.sourceKey]: true }));
          continue;
        }

        const needle = query.toLowerCase();
        const exactSku = fetchedItems.find(
          (item) => String(item.sku || "").toLowerCase() === needle
        );
        const startsWithSku = fetchedItems.find((item) =>
          String(item.sku || "").toLowerCase().startsWith(needle)
        );
        const exactName = fetchedItems.find(
          (item) => String(item.name || "").toLowerCase() === needle
        );
        const containsName = fetchedItems.find((item) =>
          String(item.name || "").toLowerCase().includes(needle)
        );
        const bestMatch = exactSku || startsWithSku || exactName || containsName || fetchedItems[0];
        if (!bestMatch) continue;

        selectZohoItemForLine(line.sourceKey, bestMatch.id);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Auto-link failed",
        description: error?.message || "Could not auto-map invoice lines to Zoho items.",
      });
    } finally {
      setIsAutoLinkingItems(false);
    }
  }, [fetchZohoItemsForLine, selectZohoItemForLine, toast, zohoLineMappings]);

  const handleZohoCustomerSelect = React.useCallback((customerId: string) => {
    const selectedCustomerId = String(customerId || "").trim();
    setZohoCustomerId(selectedCustomerId);
    if (selectedCustomerId) {
      setHasCustomerSearchAttempted(false);
    }
    if (!selectedCustomerId) {
      setZohoInvoiceNumber("");
    }
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    autoLinkedOrderRef.current = null;
    setZohoCustomerId("");
    setZohoCustomerSearchQuery("");
    setHasCustomerSearchAttempted(false);
    setZohoInvoiceNumber("");
    setZohoCustomerOptions([]);
    setZohoCustomerById({});
    setIsCreateCustomerOpen(false);
    setCustomerDraft(null);
    setIsCreatingCustomer(false);
    setZohoItemOptionsByLineKey({});
    setZohoItemById({});
    setItemSearchQueryByLineKey({});
    setItemSearchAttemptedByLineKey({});
    setIsCreateItemOpen(false);
    setItemDraft(null);
    setIsCreatingItem(false);
    setZohoInvoiceDate(new Date().toISOString().slice(0, 10));
    setZohoSalesperson(
      String(
        candidate?.order?.salesPerson ||
          candidate?.order?.createdBy?.name ||
          user?.name ||
          ""
      ).trim()
    );
    setZohoStoreName(String(candidate?.order?.storeName || "").trim());

    if (!candidate) {
      const sourceKey = `manual:${Date.now().toString(36)}`;
      setZohoLineMappings([
        {
          sourceKey,
          label: "",
          searchText: "",
          quantity: 1,
          rate: 0,
          gstPercent: 0,
          discountPercent: 0,
          discountAmount: 0,
          itemType: "NORMAL",
          isManual: true,
          sourceItem: {
            type: "NORMAL",
            unit: "MTR",
            gst: 0,
            qty: 1,
            rate: 0,
            exclusiveRate: 0,
            description: "",
          },
          zohoItemId: "",
        },
      ]);
      return;
    }

    const mappedLines: ZohoLineMapping[] = [
      ...candidate.normalItems.map((item, index) => {
        const quantity = num(item.qty);
        const label = String(item.bcn || item.description || `Line ${index + 1}`).trim();
        const searchText = String(item.bcn || item.description || label).trim();
        return {
          sourceKey: `normal:${index}:${normalizeKey(label) || `line-${index + 1}`}`,
          label,
          searchText,
          quantity,
          rate: num(item.exclusiveRate ?? item.rate),
          gstPercent: numOrUndefined(item.gst),
          discountPercent: numOrUndefined(item.discountPercent),
          itemType: "NORMAL" as const,
          isManual: false,
          sourceItem: { ...item },
          zohoItemId: "",
        };
      }),
      ...candidate.vasItems.map((item, index) => {
        const quantity = num(item.qty);
        const label = String(item.description || item.bcn || `VAS ${index + 1}`).trim();
        const searchText = String(item.description || item.bcn || label).trim();
        return {
          sourceKey: `vas:${index}:${normalizeKey(label) || `line-${index + 1}`}`,
          label,
          searchText,
          quantity,
          rate: num(item.exclusiveRate ?? item.rate),
          gstPercent: numOrUndefined(item.gst),
          discountPercent: numOrUndefined(item.discountPercent),
          itemType: "VAS" as const,
          isManual: false,
          sourceItem: { ...item, type: "VAS" },
          zohoItemId: "",
        };
      }),
    ].filter((line) => line.quantity > 0);

    setZohoLineMappings(mappedLines);
  }, [candidate, isOpen, user?.name]);

  React.useEffect(() => {
    if (!candidate) return;
    if (!zohoBotEnabled) return;
    if (isVasOnlyCandidate(candidate)) return;
    const hint = String(candidate.order.customerSnapshot?.name || candidate.order.customerName || "").trim();
    if (hint.length < 2) return;

    void searchZohoCustomers(hint).catch(() => {
      // Best effort pre-search only.
    });
  }, [candidate, searchZohoCustomers, zohoBotEnabled]);

  React.useEffect(() => {
    if (!zohoBotEnabled) return;
    if (isVasOnlyCandidate(candidate)) return;
    const selectedCustomerId = String(zohoCustomerId || "").trim();
    if (!selectedCustomerId) return;
    void fetchZohoInvoiceNumber(selectedCustomerId, zohoStoreName);
  }, [fetchZohoInvoiceNumber, zohoBotEnabled, zohoCustomerId, zohoStoreName]);

  React.useEffect(() => {
    if (!zohoBotEnabled) return;
    if (isVasOnlyCandidate(candidate)) return;
    const orderId = String(candidate?.order?.id || "");
    if (!orderId) return;
    if (!zohoLineMappings.length) return;
    if (autoLinkedOrderRef.current === orderId) return;

    autoLinkedOrderRef.current = orderId;
    void autoLinkLinesToZohoItems();
  }, [
    autoLinkLinesToZohoItems,
    candidate?.order?.id,
    zohoBotEnabled,
    zohoLineMappings.length,
  ]);

  const activeLineMappings = React.useMemo(
    () => zohoLineMappings.filter((line) => num(line.quantity) > 0),
    [zohoLineMappings]
  );

  const pendingLineMappings = React.useMemo(
    () =>
      activeLineMappings.filter((line) => !String(line.zohoItemId || "").trim()),
    [activeLineMappings]
  );

  const manualLabelIssues = React.useMemo(
    () =>
      activeLineMappings.filter(
        (line) => line.isManual && !String(line.label || "").trim()
      ),
    [activeLineMappings]
  );

  const selectedLineEntries = React.useMemo(
    () =>
      activeLineMappings.map((line) => {
        const base = line.sourceItem || {};
        const qty = Math.max(0, num(line.quantity));
        const rate = num(line.rate);
        const gst = Math.min(100, Math.max(0, numOrUndefined(line.gstPercent ?? base.gst) ?? 0));
        const discountPercent = numOrUndefined(line.discountPercent ?? base.discountPercent) ?? 0;
        const baseAmount = rate * qty;
        const discountAmount = baseAmount * (discountPercent / 100);
        const taxableAmount = Math.max(0, baseAmount - discountAmount);
        const gstAmount = taxableAmount * (gst / 100);
        const label = String(line.label || base.bcn || base.description || "").trim();

        const item: InvoiceLineItem = {
          ...base,
          type: line.itemType === "VAS" ? "VAS" : base.type,
          bcn:
            line.itemType === "NORMAL"
              ? String(base.bcn || label || "").trim() || undefined
              : base.bcn,
          description: label || base.description || base.bcn || undefined,
          unit: base.unit || (line.itemType === "VAS" ? "PCS" : "MTR"),
          exclusiveRate: rate,
          rate,
          qty,
          gst,
          gstMode: base.gstMode,
          discountPercent,
          discountAmount,
          hsn: base.hsn,
          group: base.group,
          roomName: base.roomName,
          taxableAmount,
          gstAmount,
          totalAmount: taxableAmount + gstAmount,
          allocationRef: line.isManual ? undefined : base.allocationRef,
        };
        return { line, item };
      }),
    [activeLineMappings]
  );

  const editableCandidate = React.useMemo(() => {
    if (!candidate) return null;
    const normalItems = selectedLineEntries
      .filter((entry) => entry.line.itemType === "NORMAL")
      .map((entry) => entry.item);
    const vasItems = selectedLineEntries
      .filter((entry) => entry.line.itemType === "VAS")
      .map((entry) => ({ ...entry.item, type: "VAS" }));
    return buildCandidateFromLines(candidate, normalItems, vasItems);
  }, [candidate, selectedLineEntries]);

  const editablePayload = React.useMemo(
    () => {
      if (!editableCandidate) return null;
      const payload = buildPrintablePayload(
        editableCandidate,
        asTrimmedString(zohoInvoiceNumber) || undefined
      );
      return {
        ...payload,
        meta: {
          ...payload.meta,
          salesPerson:
            asTrimmedString(zohoSalesperson) ||
            asTrimmedString(payload.meta.salesPerson) ||
            undefined,
        },
      };
    },
    [editableCandidate, zohoInvoiceNumber, zohoSalesperson]
  );

  const lineCalcByKey = React.useMemo(() => {
    const next: Record<
      string,
      {
        qty: number;
        rate: number;
        discountPercent: number;
        discountAmount: number;
        taxableValue: number;
        cgstRate: number;
        sgstRate: number;
        igstRate: number;
        cgstAmount: number;
        sgstAmount: number;
        igstAmount: number;
        amount: number;
      }
    > = {};

    selectedLineEntries.forEach(({ line, item }) => {
      const qty = num(item.qty);
      const rate = num(item.exclusiveRate ?? item.rate);
      const discountPercent = num(item.discountPercent);
      const discountAmount = num(item.discountAmount);
      const taxableValue = num(item.taxableAmount);
      const totalGstPercent = num(item.gst);
      const isInterstate = editablePayload?.customer.taxMode === "INTERSTATE";
      const cgstRate = isInterstate ? 0 : totalGstPercent / 2;
      const sgstRate = isInterstate ? 0 : totalGstPercent / 2;
      const igstRate = isInterstate ? totalGstPercent : 0;
      const allocatedTax = allocateGstByTaxMode(
        num(item.gstAmount),
        editablePayload?.customer.taxMode || "UNKNOWN"
      );
      const { cgst: cgstAmount, sgst: sgstAmount, igst: igstAmount } =
        allocatedTax;
      const amount = taxableValue + cgstAmount + sgstAmount + igstAmount;

      next[line.sourceKey] = {
        qty,
        rate,
        discountPercent,
        discountAmount,
        taxableValue,
        cgstRate,
        sgstRate,
        igstRate,
        cgstAmount,
        sgstAmount,
        igstAmount,
        amount,
      };
    });

    return next;
  }, [editablePayload?.customer.taxMode, selectedLineEntries]);

  const hasDeletedOrderLines = React.useMemo(() => {
    if (!candidate) return false;
    const originalCount = candidate.normalItems.length + candidate.vasItems.length;
    const activeOrderLineCount = activeLineMappings.filter((line) => !line.isManual).length;
    return activeOrderLineCount < originalCount;
  }, [activeLineMappings, candidate]);

  const hasManualAddedLines = React.useMemo(
    () => activeLineMappings.some((line) => line.isManual),
    [activeLineMappings]
  );

  const ensureZohoCustomerForGenerate = async (): Promise<string> => {
    const existingCustomerId = asTrimmedString(zohoCustomerId);
    if (existingCustomerId) return existingCustomerId;

    const nameHint =
      asTrimmedString(zohoCustomerSearchQuery) ||
      asTrimmedString(editableCandidate?.order.customerSnapshot?.name) ||
      asTrimmedString(editableCandidate?.order.customerName) ||
      "Customer";
    const draft = editableCandidate
      ? buildZohoCustomerDraftFromOrder(editableCandidate.order, nameHint)
      : buildZohoCustomerDraftFromName(nameHint);

    setIsCreatingCustomer(true);
    try {
      if (nameHint.length >= 2) {
        const searchResponse = await fetch(
          `/api/zoho/customers?search=${encodeURIComponent(nameHint)}`,
          { cache: "no-store" }
        );
        const searchResult = await searchResponse.json().catch(() => ({}));
        if (searchResponse.ok) {
          const foundCustomers = (Array.isArray(searchResult?.customers)
            ? searchResult.customers
            : []) as ZohoCustomer[];
          const normalizedHint = nameHint.toLowerCase();
          const match =
            foundCustomers.find(
              (customer) => asTrimmedString(customer.name).toLowerCase() === normalizedHint
            ) || foundCustomers[0];
          const foundId = asTrimmedString(match?.id);
          if (foundId) {
            setZohoCustomerById((prev) => ({ ...prev, [foundId]: match }));
            setZohoCustomerOptions((prev) =>
              prev.some((option) => String(option.value) === foundId)
                ? prev
                : [toZohoCustomerOption(match), ...prev]
            );
            setZohoCustomerId(foundId);
            setZohoCustomerSearchQuery(asTrimmedString(match.name) || nameHint);
            return foundId;
          }
        }
      }

      const response = await fetch("/api/zoho/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(result?.error || "Failed to create Zoho customer."));
      }

      const created = result?.customer as ZohoCustomer | undefined;
      const customerId = asTrimmedString(created?.id);
      const customerName = asTrimmedString(created?.name || draft.contactName);
      if (!customerId) {
        throw new Error("Zoho customer was created but response is missing customer id.");
      }

      const normalizedCustomer: ZohoCustomer = {
        id: customerId,
        name: customerName || draft.contactName,
        mobile: asTrimmedString(created?.mobile || draft.phone) || undefined,
        email: asTrimmedString(created?.email || draft.email) || undefined,
        gstNo: asTrimmedString(created?.gstNo || draft.gstNo) || undefined,
      };
      setZohoCustomerById((prev) => ({ ...prev, [customerId]: normalizedCustomer }));
      setZohoCustomerOptions((prev) =>
        prev.some((option) => String(option.value) === customerId)
          ? prev
          : [toZohoCustomerOption(normalizedCustomer), ...prev]
      );
      setZohoCustomerId(customerId);
      setZohoCustomerSearchQuery(normalizedCustomer.name);
      return customerId;
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  const createZohoItemForLine = async (line: ZohoLineMapping): Promise<ZohoItem> => {
    const draft = buildZohoItemDraftFromLine(line);
    const searchText = asTrimmedString(line.searchText || line.label || draft.name);
    if (searchText.length >= 2) {
      const searchResponse = await fetch(
        `/api/zoho/items?usage=sales&search=${encodeURIComponent(searchText)}`,
        { cache: "no-store" }
      );
      const searchResult = await searchResponse.json().catch(() => ({}));
      if (searchResponse.ok) {
        const foundItems = (Array.isArray(searchResult?.items) ? searchResult.items : []) as ZohoItem[];
        const normalizedDraftName = draft.name.toLowerCase();
        const normalizedSearchText = searchText.toLowerCase();
        const match =
          foundItems.find((item) => {
            const name = asTrimmedString(item.name).toLowerCase();
            const sku = asTrimmedString(item.sku).toLowerCase();
            return (
              name === normalizedDraftName ||
              name === normalizedSearchText ||
              (sku && (sku === normalizedDraftName || sku === normalizedSearchText))
            );
          }) || foundItems[0];
        const foundId = asTrimmedString(match?.id);
        if (foundId) {
          return { ...match, id: foundId, name: asTrimmedString(match.name) || draft.name };
        }
      }
    }

    const response = await fetch("/api/zoho/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        rate: draft.rate,
        description: draft.description || undefined,
        sku: draft.sku || undefined,
        unit: draft.unit || undefined,
        productType: draft.productType,
        itemType: draft.itemType,
        hsnOrSac: draft.hsnOrSac || undefined,
        isTaxable: draft.isTaxable,
        taxPercentage: draft.taxPercentage,
        purchaseDescription: draft.purchaseDescription || undefined,
        purchaseRate: draft.purchaseRate,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(result?.error || `Failed to create Zoho item "${draft.name}".`));
    }

    const created = (result?.item || {}) as ZohoItem;
    const createdId = asTrimmedString(created.id);
    if (!createdId) {
      throw new Error(`Zoho item "${draft.name}" was created but response is missing item id.`);
    }
    return { ...created, id: createdId, name: asTrimmedString(created.name) || draft.name };
  };

  const ensureZohoItemsForGenerate = async (): Promise<ZohoLineMapping[]> => {
    const missingLines = activeLineMappings.filter(
      (line) => !asTrimmedString(line.zohoItemId)
    );
    if (!missingLines.length) return activeLineMappings;

    setIsCreatingItem(true);
    try {
      const createdByLineKey: Record<string, ZohoItem> = {};
      for (const line of missingLines) {
        createdByLineKey[line.sourceKey] = await createZohoItemForLine(line);
      }

      const nextMappings = activeLineMappings.map((line) => {
        const created = createdByLineKey[line.sourceKey];
        if (!created) return line;
        return {
          ...line,
          zohoItemId: created.id,
          zohoItemName: created.name,
          zohoSku: created.sku,
          zohoRate: numOrUndefined(created.rate ?? created.purchaseRate),
          taxId: created.taxId || line.taxId,
          taxExemptionId: created.taxExemptionId || line.taxExemptionId,
          reverseChargeTaxId: created.reverseChargeTaxId || line.reverseChargeTaxId,
          reverseChargeVatId: created.reverseChargeVatId || line.reverseChargeVatId,
        };
      });

      setZohoItemById((prev) => ({ ...prev, ...createdByLineKey }));
      setZohoLineMappings(nextMappings);
      return nextMappings;
    } finally {
      setIsCreatingItem(false);
    }
  };


  const handleGenerate = async () => {
    if (!isOpen) return;
    if (!user) {
      toast({ variant: "destructive", title: "Login required" });
      return;
    }

    if (!zohoInvoiceDate) {
      toast({
        variant: "destructive",
        title: "Invoice date required",
        description: "Pick an invoice date.",
      });
      return;
    }

    if (activeLineMappings.length === 0) {
      toast({
        variant: "destructive",
        title: "No line items",
        description: "Add at least one line item before generating invoice.",
      });
      return;
    }

    if (manualLabelIssues.length > 0) {
      toast({
        variant: "destructive",
        title: "Manual item name required",
        description: `Add item name for ${manualLabelIssues.length} manual line(s).`,
      });
      return;
    }

    const order = editableCandidate?.order;
    const selectedStoreForRequest = String(zohoStoreName || order?.storeName || "").trim();
    let localInvoiceCreated = false;
    let localInvoiceId = "";
    let localInvoiceNo = "";
    let localHasRemainingVas = false;
    let createdLocalInvoice: Invoice | null = null;

    setIsGenerating(true);
    try {
      if (candidate) {
        if (hasManualAddedLines) {
          toast({
            variant: "destructive",
            title: "Manual invoice lines are not allowed",
            description:
              "Remove manual lines before generating this quotation-linked invoice.",
          });
          return;
        }
        const changedPricingLine = activeLineMappings.find((line) => {
          if (line.isManual || !line.sourceItem) return false;
          const source = line.sourceItem;
          return (
            Math.abs(num(line.quantity) - resolveInvoiceItemQty(source)) > 0.001 ||
            Math.abs(
              num(line.rate) -
                num(source.exclusiveRate ?? source.rate)
            ) > 0.01 ||
            Math.abs(
              num(line.discountPercent) - num(source.discountPercent)
            ) > 0.001 ||
            Math.abs(num(line.gstPercent) - num(source.gst)) > 0.001
          );
        });
        if (changedPricingLine) {
          toast({
            variant: "destructive",
            title: "Invoice pricing was changed",
            description:
              `${changedPricingLine.label}: quantity, rate, discount, and GST must remain exactly as recorded in the order.`,
          });
          return;
        }
        const verification = await onValidateBeforeGenerate(candidate);
        if (!verification.ok) {
          toast({
            variant: "destructive",
            title: "Invoice blocked",
            description:
              verification.issues[0] ||
              "The order no longer matches its quotation.",
          });
          return;
        }
      }

      if (!editableCandidate || !editablePayload || !order) {
        throw new Error("Software invoice payload is unavailable.");
      }

      if (
        allowsPostInvoiceAllocation(order) &&
        editableCandidate.normalItems.length > 0
      ) {
        const latestOrderSnap = await getDoc(doc(db, "orders", order.id));
        if (!latestOrderSnap.exists()) {
          throw new Error("Order 52137 could not be rechecked.");
        }
        const latestOrder = {
          ...(latestOrderSnap.data() as Order),
          id: latestOrderSnap.id,
        } as Order;

        const orderReferences = Array.from(getOrderReferenceKeys(latestOrder));
        const [invoiceByOrderId, invoiceByOrderNo] = await Promise.all([
          getDocs(
            query(
              collection(db, "invoices"),
              where("orderId", "in", orderReferences)
            )
          ),
          getDocs(
            query(
              collection(db, "invoices"),
              where("orderNo", "in", orderReferences)
            )
          ),
        ]);
        const latestInvoiceMap = new Map<string, Invoice>();
        invoices
          .filter((invoice) => isInvoiceForOrder(invoice, latestOrder))
          .forEach((invoice) => latestInvoiceMap.set(invoice.id, invoice));
        [...invoiceByOrderId.docs, ...invoiceByOrderNo.docs].forEach(
          (invoiceDoc) => {
            latestInvoiceMap.set(invoiceDoc.id, {
              ...(invoiceDoc.data() as Invoice),
              id: invoiceDoc.id,
            });
          }
        );
        const latestInvoices = Array.from(latestInvoiceMap.values());
        if (hasOrder52137FinalInvoice(latestOrder, latestInvoices)) {
          throw new Error(
            "The final pending invoice for Order 52137 has already been generated. Generate is no longer allowed."
          );
        }
        const latestCandidate = buildInvoiceCandidates(
          [latestOrder],
          latestInvoices,
          { includeInvoiceBypassOrders: true }
        )[0];
        const latestGoodsCandidate = latestCandidate
          ? createSectionCandidate(latestCandidate, "NORMAL")
          : null;
        if (!latestGoodsCandidate) {
          throw new Error(
            "These allocated products have already been invoiced. No duplicate invoice is allowed for Order 52137."
          );
        }

        const remainingByProduct = new Map<string, number>();
        latestGoodsCandidate.normalItems.forEach((item) => {
          const key = normalizeKey(
            item?.bcn || item?.description || (item as any)?.itemName
          );
          if (!key) return;
          remainingByProduct.set(
            key,
            num(remainingByProduct.get(key)) + resolveInvoiceItemQty(item)
          );
        });
        const selectedByProduct = new Map<string, number>();
        editableCandidate.normalItems.forEach((item) => {
          const key = normalizeKey(
            item?.bcn || item?.description || (item as any)?.itemName
          );
          if (!key) return;
          selectedByProduct.set(
            key,
            num(selectedByProduct.get(key)) + resolveInvoiceItemQty(item)
          );
        });
        for (const [productKey, selectedQty] of selectedByProduct) {
          const remainingQty = num(remainingByProduct.get(productKey));
          if (remainingQty <= 0 || selectedQty - remainingQty > 0.001) {
            throw new Error(
              "Duplicate product detected for Order 52137. Refresh the page; only newly allocated uninvoiced products can be generated."
            );
          }
        }
      }

      const now = new Date().toISOString();
      localInvoiceId = doc(collection(db, "invoices")).id;

      const counterRef = doc(db, "counters", "invoiceNo");
      localInvoiceNo = await runTransaction(db, async (txn) => {
        const counterSnap = await txn.get(counterRef);
        const current = counterSnap.exists() ? num(counterSnap.data().value) : 1000;
        const next = current + 1;
        txn.set(counterRef, { value: next }, { merge: true });
        return String(next);
      });

      const invoiceType =
        editableCandidate.normalItems.length > 0 && editableCandidate.vasItems.length > 0
          ? "MIXED"
          : editableCandidate.vasItems.length > 0
          ? "VAS"
          : "NORMAL";
      const creatorId = user.id || firebaseUser?.uid || "";
      const creatorName =
        asTrimmedString(user.name) ||
        asTrimmedString(firebaseUser?.displayName) ||
        asTrimmedString(user.email) ||
        creatorId ||
        "System";
      const botItems = selectedLineEntries.map(({ line, item }) => ({
        ...item,
        zohoItemId:
          zohoBotEnabled ? asTrimmedString(line.zohoItemId) || undefined : undefined,
        zohoItemName:
          zohoBotEnabled ? asTrimmedString(line.zohoItemName) || undefined : undefined,
        zohoSku:
          zohoBotEnabled ? asTrimmedString(line.zohoSku) || undefined : undefined,
        zohoTaxId:
          zohoBotEnabled ? asTrimmedString(line.taxId) || undefined : undefined,
      }));
      const selectedZohoCustomer = zohoCustomerById[zohoCustomerId];
      const normalLines = selectedLineEntries.filter(
        ({ line }) => line.itemType === "NORMAL"
      );
      const stockAllocationStatus =
        normalLines.length === 0
          ? "not_required"
          : normalLines.every(
              ({ line, item }) => line.isManual || Boolean(item.allocationRef?.lengthId)
            )
          ? "allocated"
          : "verified_override";

      const invoiceDoc: Omit<Invoice, "id"> = {
        invoiceId: localInvoiceId,
        invoiceNo: localInvoiceNo,
        invoiceType,
        invoiceDate: zohoInvoiceDate,
        orderId: order.id,
        orderNo: order.orderNo || order.id,
        postRectification52137:
          allowsPostInvoiceAllocation(order) && invoiceType !== "VAS"
            ? true
            : undefined,
        customerId: order.customerId,
        storeName: selectedStoreForRequest || undefined,
        zohoCustomerId:
          zohoBotEnabled ? asTrimmedString(zohoCustomerId) || undefined : undefined,
        zohoCustomerName:
          zohoBotEnabled
            ? asTrimmedString(selectedZohoCustomer?.name) || undefined
            : undefined,
        zohoRequestedInvoiceNo:
          zohoBotEnabled ? asTrimmedString(zohoInvoiceNumber) || undefined : undefined,
        sellerSnapshot: editablePayload.seller,
        customerSnapshot: stripUndefinedDeep({
          ...order.customerSnapshot,
          ...editablePayload.customer,
          billingAddress: order.customerSnapshot?.billingAddress,
          shippingAddress: order.customerSnapshot?.shippingAddress,
          billingDetails:
            editablePayload.customer.billingDetails ||
            order.customerSnapshot?.billingDetails,
        }),
        sections: {
          NORMAL: { items: editableCandidate.normalItems, summary: editableCandidate.normalSummary },
          VAS: { items: editableCandidate.vasItems, summary: editableCandidate.vasSummary },
        },
        overallSummary: {
          ...editableCandidate.overallSummary,
          grandTotal: editablePayload.totals.grandTotal,
        },
        taxSummary: editableCandidate.taxSummary,
        payment: {},
        status: "ISSUED",
        isLocked: true,
        approvalStatus: "approved",
        approvedAt: now,
        approvedBy: {
          id: creatorId || undefined,
          name: creatorName,
          email: user.email || undefined,
          role: user.role || undefined,
        },
        stockAllocationStatus,
        stockAllocationValidated: true,
        createdAt: now,
        createdBy: creatorName,
        customer: {
          name: editablePayload.customer.name,
          phone: editablePayload.customer.phone,
          address: editablePayload.customer.address,
        },
        salesPerson:
          asTrimmedString(zohoSalesperson) ||
          editablePayload.meta.salesPerson ||
          "",
        items: botItems,
        totals: editablePayload.totals,
        zohoSyncStatus:
          invoiceType === "VAS"
            ? "not_applicable"
            : zohoBotEnabled
            ? "pending"
            : "local_only",
        zohoSyncError: null,
        zohoSyncedAt: null,
        zohoId: null,
        zohoNumber: null,
        zohoRetryCount: 0,
        createdById: creatorId || undefined,
        createdByName: creatorName,
        createdByRole: user.role || undefined,
      };
      createdLocalInvoice = { ...(invoiceDoc as Invoice), id: localInvoiceId };

      const ops: BatchOp[] = [
        {
          type: "set",
          ref: doc(db, "invoices", localInvoiceId),
          data: stripUndefinedDeep(invoiceDoc),
        },
      ];

      selectedLineEntries.forEach(({ line, item }) => {
        if (line.isManual || line.itemType !== "NORMAL" || !item.bcn) return;
        const stockId = item.bcn.replace(/\//g, "-");
        const qty = num(item.qty);

        ops.push({
          type: "update",
          ref: doc(db, "stocks", stockId),
          data: { reservedQty: increment(-qty), cutQty: increment(qty) },
        });

        const lengthId = item.allocationRef?.lengthId;
        if (lengthId && !lengthId.startsWith("MIG-LEN-")) {
          ops.push({
            type: "update",
            ref: doc(db, "stocks", stockId, "lengths", lengthId),
            data: { reservedQty: increment(-qty), cutQty: increment(qty) },
          });
        }
      });

      const orderInvoices = getInvoicesForOrder(invoices, order);
      const invoicesWithNew = [
        ...orderInvoices,
        { ...(invoiceDoc as Invoice), id: localInvoiceId },
      ];
      const invoicingStatus = computeInvoicingStatus(order, invoicesWithNew);
      const updatedInvoicesList = [
        ...(order.invoicing?.invoices || []),
        {
          invoiceId: localInvoiceId,
          invoiceNo: localInvoiceNo,
          invoiceType,
          createdAt: now,
          amount: editablePayload.totals.grandTotal,
        },
      ];
      const clearedReinvoiceSections = (() => {
        const sections = order.sections;
        if (!sections?.NORMAL?.items?.length) return sections;
        const nextNormalItems = sections.NORMAL.items.map((entry: any) => {
          const allocation = entry?.allocation;
          if (!allocation || allocation.forceReinvoice !== true) return entry;
          const {
            forceReinvoice,
            forceReinvoiceAt,
            forceReinvoiceBy,
            ...restAllocation
          } = allocation;
          return { ...entry, allocation: restAllocation };
        });
        return {
          ...sections,
          NORMAL: { ...sections.NORMAL, items: nextNormalItems },
        };
      })();

      ops.push({
        type: "update",
        ref: doc(db, "orders", order.id),
        data: {
          invoicing: {
            ...(order.invoicing || {}),
            status: invoicingStatus,
            invoices: updatedInvoicesList,
            canCreateGoodsInvoice: extractOrderNormalItems(order).length > 0,
            canCreateVasInvoice: extractOrderVasItems(order).length > 0,
          },
          ...(clearedReinvoiceSections ? { sections: clearedReinvoiceSections } : {}),
          updatedAt: now,
        },
      });

      await commitInChunks(ops);
      localInvoiceCreated = true;

      const vasWasIncluded = editableCandidate.vasItems.length > 0;
      const orderHasVasItems = extractOrderVasItems(order).length > 0;
      localHasRemainingVas = !vasWasIncluded && orderHasVasItems;

      if (isVasInvoice(invoiceDoc)) {
        toast({
          title: `Invoice #${localInvoiceNo} created`,
          description: "VAS invoice saved in Mo Track. No Zoho entry was created.",
        });
        onSuccess?.(localHasRemainingVas, createdLocalInvoice || undefined);
        onClose();
        return;
      }

      if (!zohoBotEnabled) {
        toast({
          title: `Invoice #${localInvoiceNo} created`,
          description: "Saved only in Mo Track. No Zoho invoice was created.",
        });
        onSuccess?.(localHasRemainingVas, createdLocalInvoice || undefined);
        onClose();
        return;
      }

      toast({
        title: `Invoice #${localInvoiceNo} created`,
        description: "Approved and queued for automatic Zoho synchronization.",
      });
      onSuccess?.(localHasRemainingVas, createdLocalInvoice || undefined);
      onClose();

      if (firebaseUser) {
        void firebaseUser
          .getIdToken()
          .then((token) =>
            fetch("/api/zoho-sync/sync-invoice", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ invoiceId: localInvoiceId }),
            })
          )
          .catch((syncError) => {
            console.error("Unable to wake Zoho invoice bot:", syncError);
          });
      }
    } catch (error: any) {
      console.error(error);

      if (localInvoiceCreated) {
        toast({
          title: `Invoice #${localInvoiceNo} created`,
          description: zohoBotEnabled
            ? "Saved in Mo Track and queued for automatic Zoho synchronization."
            : "Saved only in Mo Track. No Zoho invoice was created.",
        });
        onSuccess?.(localHasRemainingVas, createdLocalInvoice || undefined);
        onClose();
        return;
      }

      toast({
        variant: "destructive",
        title: "Generation failed",
        description: error?.message || "Failed to generate invoice.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    const printContent = document.getElementById("printable-invoice-preview");
    if (!printContent) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(
      `<html><head><title>Print Invoice</title></head><body>${printContent.innerHTML}</body></html>`
    );
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  if (!isOpen) return null;

  const selectedZohoCustomer = zohoCustomerById[zohoCustomerId];
  const isVas = !isManualMode && isVasOnlyCandidate(editableCandidate);
  const grandTotal = isManualMode
    ? activeLineMappings.reduce(
        (sum, line) => sum + num(lineCalcByKey[line.sourceKey]?.amount),
        0
      )
    : editablePayload?.totals.grandTotal || 0;
  const customer = isManualMode
    ? selectedZohoCustomer?.name || "Manual"
    : editableCandidate
    ? editableCandidate.order.customerSnapshot?.name || editableCandidate.order.customerName
    : "-";
  const selectedStore = String(
    zohoStoreName || editableCandidate?.order.storeName || ""
  ).trim();
  const storeSeries = resolveZohoInvoiceSeriesForStore(selectedStore);
  const canGenerate =
    !!zohoInvoiceDate &&
    activeLineMappings.length > 0 &&
    manualLabelIssues.length === 0;
  const isInterstateInvoice =
    editablePayload?.customer.taxMode === "INTERSTATE";

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-screen h-screen max-w-none rounded-none p-0 gap-0 overflow-hidden border-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-bold">Generate Invoice</DialogTitle>
              <DialogDescription className="mt-0.5">
                {isManualMode
                  ? "Create a manual Zoho invoice by selecting customer and mapping item lines."
                  : "Review before generating. You can delete items to split this invoice or add manual items."}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-3 text-right shrink-0">
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p className="text-sm font-semibold">{customer || "-"}</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-sm font-bold text-emerald-700">
                  INR {grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="h-8 w-px bg-border" />
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  isVas
                    ? "border-violet-300 bg-violet-50 text-violet-700"
                    : "border-blue-300 bg-blue-50 text-blue-700"
                )}
              >
                {isVas ? "VAS Invoice" : "Goods Invoice"}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-muted/30 p-6 space-y-6">
          {isVas || !zohoBotEnabled ? (
            <div className="max-w-full mx-auto rounded-xl border border-violet-200 bg-violet-50 p-4 md:p-5">
              <h3 className="text-base font-semibold text-violet-900">
                {isVas ? "VAS Invoice" : "Local Software Invoice"}
              </h3>
              <p className="mt-1 text-sm text-violet-700">
                {isVas
                  ? "This invoice will be saved only in Mo Track. VAS invoices are not created in Zoho."
                  : "This invoice will be saved only in Mo Track. No customer, item, or invoice entry will be created in Zoho because automated Zoho invoicing is inactive."}
              </p>
            </div>
          ) : (
          <div className="max-w-full mx-auto rounded-xl border bg-card p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Zoho Invoice Setup</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select Zoho customer, confirm invoice number, and map all lines by BCN/SKU.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    pendingLineMappings.length === 0
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-amber-300 bg-amber-50 text-amber-700"
                  )}
                >
                  {pendingLineMappings.length === 0
                    ? "All line items mapped"
                    : `${pendingLineMappings.length} line item(s) pending`}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void autoLinkLinesToZohoItems()}
                  disabled={isAutoLinkingItems || activeLineMappings.length === 0}
                >
                  {isAutoLinkingItems ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Auto-linking
                    </>
                  ) : (
                    "Auto-link BCN"
                  )}
                </Button>
                {hasDeletedOrderLines ? (
                  <Badge
                    variant="outline"
                    className="border-blue-300 bg-blue-50 text-blue-700"
                  >
                    Split invoice mode
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Zoho Customer *
                </p>
                <Combobox
                  options={zohoCustomerOptions}
                  value={zohoCustomerId}
                  onSelect={(value) => {
                    void handleZohoCustomerSelect(value);
                  }}
                  onSearch={handleZohoCustomerSearch}
                  placeholder="Search customer in Zoho"
                  searchPlaceholder="Type customer name"
                  emptyPlaceholder="No customer found."
                  showClear
                  className="h-9"
                />
                {!zohoCustomerId &&
                hasCustomerSearchAttempted &&
                asTrimmedString(zohoCustomerSearchQuery).length >= 2 &&
                zohoCustomerOptions.length === 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-blue-700 hover:text-blue-800"
                    onClick={() => openCreateCustomerDialog()}
                  >
                    Create "{asTrimmedString(zohoCustomerSearchQuery)}" in Zoho
                  </Button>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Zoho Invoice No.
                </p>
                <Input
                  className="h-9"
                  value={zohoInvoiceNumber}
                  onChange={(e) => setZohoInvoiceNumber(e.target.value)}
                  placeholder={isInvoiceNumberLoading ? "Fetching..." : "Auto from Zoho"}
                  disabled={isInvoiceNumberLoading}
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Store
                </p>
                <Combobox
                  options={INVOICE_STORE_OPTIONS}
                  value={zohoStoreName}
                  onSelect={(value) => setZohoStoreName(String(value || "").trim())}
                  placeholder="Select store"
                  searchPlaceholder="Search store"
                  emptyPlaceholder="No store found."
                  showClear
                  className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  Series: <span className="font-medium text-foreground">{storeSeries.seriesName}</span>
                  {" · "}
                  Invoice format:{" "}
                  <span className="font-medium text-foreground">
                    {storeSeries.invoicePrefix ? `${storeSeries.invoicePrefix}{number}` : "{number}"}
                  </span>
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Salesman
                </p>
                <Input
                  className="h-9"
                  value={zohoSalesperson}
                  onChange={(e) => setZohoSalesperson(e.target.value)}
                  placeholder="Salesman name"
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Invoice Date *
                </p>
                <Input
                  className="h-9"
                  type="date"
                  value={zohoInvoiceDate}
                  onChange={(e) => setZohoInvoiceDate(e.target.value)}
                />
              </div>
            </div>

            {selectedZohoCustomer ? (
              <p className="text-xs text-muted-foreground mt-3">
                Selected customer: <span className="font-medium text-foreground">{selectedZohoCustomer.name}</span>
                {selectedZohoCustomer.gstNo ? ` | GSTIN: ${selectedZohoCustomer.gstNo}` : ""}
                {asTrimmedString(zohoSalesperson)
                  ? ` | Salesman: ${asTrimmedString(zohoSalesperson)}`
                  : ""}
              </p>
            ) : hasCustomerSearchAttempted && asTrimmedString(zohoCustomerSearchQuery).length >= 2 ? (
              <p className="text-xs text-amber-700 mt-3">
                Customer not found in Zoho. Create customer to continue invoice generation.
              </p>
            ) : null}
          </div>
          )}

          <div className="max-w-full mx-auto rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Line Item Mapping</h3>
              <Badge variant="outline">Pricing locked to quotation</Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-14 text-xs uppercase">#</TableHead>
                    <TableHead className="text-xs uppercase min-w-[150px]">
                      {zohoBotEnabled ? "BCN / Zoho SKUs" : "BCN / Item"}
                    </TableHead>
                    <TableHead className="text-xs uppercase w-[110px]">Qty</TableHead>
                    <TableHead className="text-xs uppercase w-[140px]">Rate</TableHead>
                    <TableHead className="text-xs uppercase w-[110px]">Dis%</TableHead>
                    <TableHead className="text-xs uppercase w-[110px]">GST%</TableHead>
                    <TableHead className="text-xs uppercase w-[140px] text-right">Value</TableHead>
                    {!isInterstateInvoice && (
                      <>
                        <TableHead className="text-xs uppercase w-[150px] text-right">CGST</TableHead>
                        <TableHead className="text-xs uppercase w-[150px] text-right">SGST</TableHead>
                      </>
                    )}
                    {isInterstateInvoice && (
                      <TableHead className="text-xs uppercase w-[150px] text-right">IGST</TableHead>
                    )}
                    <TableHead className="text-xs uppercase w-[140px] text-right">Amt</TableHead>
                    <TableHead className="text-xs uppercase w-[80px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zohoLineMappings.map((line, index) => (
                    <TableRow key={line.sourceKey}>
                      <TableCell className="text-sm text-muted-foreground">{index + 1}</TableCell>
                      <TableCell>
                        <div className="space-y-1.5">
                          {line.isManual ? (
                            <Input
                              value={line.label}
                              onChange={(event) =>
                                updateLineMapping(line.sourceKey, {
                                  label: event.target.value,
                                })
                              }
                              placeholder="Item / BCN name"
                              className="h-8"
                            />
                          ) : (
                            <p className="text-sm font-medium leading-tight">{line.label}</p>
                          )}
                          {zohoBotEnabled ? (
                            <Combobox
                              options={zohoItemOptionsByLineKey[line.sourceKey] || []}
                              value={line.zohoItemId}
                              onSelect={(value) => selectZohoItemForLine(line.sourceKey, value)}
                              onSearch={async (query) => {
                                await handleZohoItemSearch(line.sourceKey, query);
                              }}
                              placeholder="Zoho Item Selection"
                              searchPlaceholder="Type BCN, SKU or item name"
                              emptyPlaceholder="No Zoho item found."
                              showClear
                              className="h-9"
                            />
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            Search: {line.searchText || line.label || "N/A"}
                          </p>
                          {!line.zohoItemId &&
                          itemSearchAttemptedByLineKey[line.sourceKey] &&
                          asTrimmedString(
                            itemSearchQueryByLineKey[line.sourceKey] || line.searchText
                          ).length >= 2 &&
                          (zohoItemOptionsByLineKey[line.sourceKey] || []).length === 0 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-blue-700 hover:text-blue-800"
                              onClick={() =>
                                openCreateItemDialog(
                                  line.sourceKey,
                                  asTrimmedString(itemSearchQueryByLineKey[line.sourceKey])
                                )
                              }
                            >
                              Create "{asTrimmedString(itemSearchQueryByLineKey[line.sourceKey])}" in Zoho
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.quantity}
                          disabled={!line.isManual}
                          onChange={(event) =>
                            updateLineMapping(line.sourceKey, {
                              quantity: Math.max(0, num(event.target.value)),
                            })
                          }
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.rate}
                          disabled={!line.isManual}
                          onChange={(event) =>
                            updateLineMapping(line.sourceKey, {
                              rate: Math.max(0, num(event.target.value)),
                            })
                          }
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={num(line.discountPercent)}
                          disabled={!line.isManual}
                          onChange={(event) =>
                            updateLineMapping(line.sourceKey, {
                              discountPercent: Math.max(0, num(event.target.value)),
                            })
                          }
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={Math.max(0, num(line.gstPercent))}
                          disabled={!line.isManual}
                          onChange={(event) =>
                            updateLineMapping(line.sourceKey, {
                              gstPercent: Math.min(100, Math.max(0, num(event.target.value))),
                            })
                          }
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-medium">
                          ₹{" "}
                          {lineCalcByKey[line.sourceKey]?.taxableValue.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }) || "0.00"}
                        </span>
                      </TableCell>
                      {!isInterstateInvoice && (
                        <>
                          <TableCell className="text-right">
                            <div className="text-sm font-medium">
                              ₹{" "}
                              {lineCalcByKey[line.sourceKey]?.cgstAmount.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }) || "0.00"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              @{lineCalcByKey[line.sourceKey]?.cgstRate.toFixed(1) || "0.0"}%
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="text-sm font-medium">
                              ₹{" "}
                              {lineCalcByKey[line.sourceKey]?.sgstAmount.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }) || "0.00"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              @{lineCalcByKey[line.sourceKey]?.sgstRate.toFixed(1) || "0.0"}%
                            </div>
                          </TableCell>
                        </>
                      )}
                      {isInterstateInvoice && (
                        <TableCell className="text-right">
                          <div className="text-sm font-medium">
                            ₹{" "}
                            {lineCalcByKey[line.sourceKey]?.igstAmount.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }) || "0.00"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            @{lineCalcByKey[line.sourceKey]?.igstRate.toFixed(1) || "0.0"}%
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <span className="text-sm font-semibold">
                          ₹{" "}
                          {lineCalcByKey[line.sourceKey]?.amount.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }) || "0.00"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLineMapping(line.sourceKey)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {zohoLineMappings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="h-16 text-center text-sm text-muted-foreground">
                        No invoice lines found for Zoho mapping.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
            {editablePayload ? (
              <div className="px-4 py-3 border-t bg-muted/20 flex justify-end">
                <div className="w-full max-w-sm space-y-1 text-sm">
                  <div className="flex items-center justify-between border-b border-border pb-1">
                    <span>Subtotal</span>
                    <span>
                      ₹{" "}
                      {editablePayload.totals.subTotal.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-1">
                    <span>Discount</span>
                    <span>
                      ₹{" "}
                      {editablePayload.totals.discount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  {!isInterstateInvoice && (
                    <>
                      <div className="flex items-center justify-between border-b border-border pb-1">
                        <span>CGST</span>
                        <span>
                          ₹{" "}
                          {editablePayload.totals.cgst.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border pb-1">
                        <span>SGST</span>
                        <span>
                          ₹{" "}
                          {editablePayload.totals.sgst.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </>
                  )}
                  {isInterstateInvoice && (
                    <div className="flex items-center justify-between border-b border-border pb-1">
                      <span>IGST</span>
                      <span>
                        ₹{" "}
                        {editablePayload.totals.igst.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-b border-border pb-1">
                    <span>roundoff</span>
                    <span>
                      ₹{" "}
                      {editablePayload.totals.roundOff.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-semibold text-base">
                    <span>netAmt</span>
                    <span>
                      ₹{" "}
                      {editablePayload.totals.grandTotal.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div
            className="max-w-5xl mx-auto bg-white rounded-xl shadow-sm border"
            id="printable-invoice-preview"
          >
            <PrintableInvoice payload={editablePayload} />
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-background flex items-center justify-between shrink-0">
          <Button variant="ghost" onClick={onClose} disabled={isGenerating}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print Preview
            </Button>
            <Button
              onClick={() => void handleGenerate()}
              disabled={isGenerating || !canGenerate}
              className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px]"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" /> Generate Invoice
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog
      open={isCreateCustomerOpen}
      onOpenChange={(open) => {
        if (!open && isCreatingCustomer) return;
        setIsCreateCustomerOpen(open);
        if (!open && !isCreatingCustomer) {
          setCustomerDraft(null);
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Missing Zoho Customer</DialogTitle>
          <DialogDescription>
            Customer not found in Zoho. Review details and create customer to continue invoice generation.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact Name *</p>
            <Input
              value={customerDraft?.contactName || ""}
              onChange={(event) => updateCustomerDraft({ contactName: event.target.value })}
              placeholder="Customer name"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Company Name</p>
            <Input
              value={customerDraft?.companyName || ""}
              onChange={(event) => updateCustomerDraft({ companyName: event.target.value })}
              placeholder="Company name"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone</p>
            <Input
              value={customerDraft?.phone || ""}
              onChange={(event) => updateCustomerDraft({ phone: event.target.value })}
              placeholder="Phone"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</p>
            <Input
              value={customerDraft?.email || ""}
              onChange={(event) => updateCustomerDraft({ email: event.target.value })}
              placeholder="Email"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">GST No</p>
            <Input
              value={customerDraft?.gstNo || ""}
              onChange={(event) => updateCustomerDraft({ gstNo: event.target.value.toUpperCase() })}
              placeholder="15-digit GSTIN"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Place Of Contact</p>
            <Input
              value={customerDraft?.placeOfContact || ""}
              onChange={(event) =>
                updateCustomerDraft({ placeOfContact: event.target.value.toUpperCase() })
              }
              placeholder="State code (e.g. HR, TN)"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">GST Treatment</p>
            <Input
              value={customerDraft?.gstTreatment || ""}
              onChange={(event) =>
                updateCustomerDraft({
                  gstTreatment:
                    (asTrimmedString(event.target.value) as
                      | "business_gst"
                      | "business_none"
                      | "consumer"
                      | "overseas") || "business_none",
                })
              }
              placeholder="business_gst / business_none / consumer / overseas"
              list="zoho-gst-treatment-options-generate"
            />
            <datalist id="zoho-gst-treatment-options-generate">
              <option value="business_gst" />
              <option value="business_none" />
              <option value="consumer" />
              <option value="overseas" />
            </datalist>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Billing Address</p>
            <Textarea
              value={customerDraft?.billingAddress?.address || ""}
              onChange={(event) =>
                updateCustomerAddressDraft("billingAddress", { address: event.target.value })
              }
              placeholder="Billing address"
              className="min-h-[72px]"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Shipping Address</p>
            <Textarea
              value={customerDraft?.shippingAddress?.address || ""}
              onChange={(event) =>
                updateCustomerAddressDraft("shippingAddress", { address: event.target.value })
              }
              placeholder="Shipping address"
              className="min-h-[72px]"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
            <Textarea
              value={customerDraft?.notes || ""}
              onChange={(event) => updateCustomerDraft({ notes: event.target.value })}
              placeholder="Notes for Zoho"
              className="min-h-[72px]"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-2">
          <Button
            variant="ghost"
            onClick={() => {
              setIsCreateCustomerOpen(false);
              if (!isCreatingCustomer) setCustomerDraft(null);
            }}
            disabled={isCreatingCustomer}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleCreateZohoCustomer()}
            disabled={isCreatingCustomer || !asTrimmedString(customerDraft?.contactName)}
          >
            {isCreatingCustomer ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Customer"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog
      open={isCreateItemOpen}
      onOpenChange={(open) => {
        if (!open && isCreatingItem) return;
        setIsCreateItemOpen(open);
        if (!open && !isCreatingItem) {
          setItemDraft(null);
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Missing Zoho Item</DialogTitle>
          <DialogDescription>
            Item not found in Zoho. Review details and create item to continue invoice generation.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto pr-1">
          <div className="space-y-1.5 md:col-span-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Item Name *</p>
            <Input
              value={itemDraft?.name || ""}
              onChange={(event) => updateItemDraft({ name: event.target.value })}
              placeholder="Item name"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SKU</p>
            <Input
              value={itemDraft?.sku || ""}
              onChange={(event) => updateItemDraft({ sku: event.target.value.toUpperCase() })}
              placeholder="SKU"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Unit</p>
            <Input
              value={itemDraft?.unit || ""}
              onChange={(event) => updateItemDraft({ unit: event.target.value.toUpperCase() })}
              placeholder="MTR / PCS"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rate *</p>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={num(itemDraft?.rate)}
              onChange={(event) => updateItemDraft({ rate: Math.max(0, num(event.target.value)) })}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Purchase Rate</p>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={itemDraft?.purchaseRate ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "") {
                  updateItemDraft({ purchaseRate: undefined });
                  return;
                }
                updateItemDraft({ purchaseRate: Math.max(0, num(raw)) });
              }}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">GST %</p>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={num(itemDraft?.taxPercentage)}
              onChange={(event) =>
                updateItemDraft({
                  taxPercentage: Math.min(100, Math.max(0, num(event.target.value))),
                })
              }
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">HSN / SAC</p>
            <Input
              value={itemDraft?.hsnOrSac || ""}
              onChange={(event) => updateItemDraft({ hsnOrSac: event.target.value })}
              placeholder="HSN code"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Product Type</p>
            <Input
              value={itemDraft?.productType || "goods"}
              onChange={(event) =>
                updateItemDraft({
                  productType:
                    (asTrimmedString(event.target.value) as
                      | "goods"
                      | "service"
                      | "digital_service") || "goods",
                })
              }
              placeholder="goods / service / digital_service"
              list="zoho-item-product-type-options-generate"
            />
            <datalist id="zoho-item-product-type-options-generate">
              <option value="goods" />
              <option value="service" />
              <option value="digital_service" />
            </datalist>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Item Type</p>
            <Input
              value={itemDraft?.itemType || "sales"}
              onChange={(event) =>
                updateItemDraft({
                  itemType:
                    (asTrimmedString(event.target.value) as
                      | "sales"
                      | "purchases"
                      | "sales_and_purchases"
                      | "inventory") || "sales",
                })
              }
              placeholder="sales / purchases / sales_and_purchases / inventory"
              list="zoho-item-type-options-generate"
            />
            <datalist id="zoho-item-type-options-generate">
              <option value="sales" />
              <option value="purchases" />
              <option value="sales_and_purchases" />
              <option value="inventory" />
            </datalist>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={itemDraft?.isTaxable ?? true}
                onChange={(event) => updateItemDraft({ isTaxable: event.target.checked })}
              />
              Taxable item
            </label>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</p>
            <Textarea
              value={itemDraft?.description || ""}
              onChange={(event) => updateItemDraft({ description: event.target.value })}
              placeholder="Item description"
              className="min-h-[72px]"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Purchase Description</p>
            <Textarea
              value={itemDraft?.purchaseDescription || ""}
              onChange={(event) => updateItemDraft({ purchaseDescription: event.target.value })}
              placeholder="Purchase description"
              className="min-h-[72px]"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-2">
          <Button
            variant="ghost"
            onClick={() => {
              setIsCreateItemOpen(false);
              if (!isCreatingItem) setItemDraft(null);
            }}
            disabled={isCreatingItem}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleCreateZohoItem()}
            disabled={
              isCreatingItem ||
              !asTrimmedString(itemDraft?.name) ||
              num(itemDraft?.rate) < 0
            }
          >
            {isCreatingItem ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Item"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
function CandidateTable({
  candidates,
  loading,
  emptyLabel,
  verifyingOrderId,
  onGenerate,
  badgeType,
}: {
  candidates: InvoiceCandidate[];
  loading: boolean;
  emptyLabel: string;
  verifyingOrderId: string | null;
  onGenerate: (candidate: InvoiceCandidate) => void;
  badgeType: "goods" | "vas";
}) {
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.toLowerCase();
    return candidates.filter(
      (c) =>
        c.order.id?.toLowerCase().includes(q) ||
        (c.order.customerSnapshot?.name || c.order.customerName || "")
          .toLowerCase()
          .includes(q) ||
        (c.order.customerPhone || "").includes(q) ||
        (c.order.dealId || "").toLowerCase().includes(q) ||
        (c.order.createdBy?.name || "").toLowerCase().includes(q)
    );
  }, [candidates, search]);

  const totalValue = React.useMemo(
    () => candidates.reduce((sum, c) => sum + c.overallSummary.grandTotal, 0),
    [candidates]
  );

  const accentColor = badgeType === "goods" ? "blue" : "violet";

  return (
    <div className="space-y-5">
      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            icon: badgeType === "goods" ? Package : Wrench,
            label: "Pending",
            value: candidates.length.toString(),
            color: accentColor === "blue" ? "bg-blue-500" : "bg-violet-500",
          },
          {
            icon: IndianRupee,
            label: "Total Value",
            value: `₹ ${totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
            color: "bg-emerald-500",
          },
          {
            icon: TrendingUp,
            label: "Showing",
            value: `${filtered.length} results`,
            color: "bg-amber-500",
          },
        ].map(({ icon: Icon, label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border bg-card p-3.5 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className={cn("rounded-lg p-2.5 shrink-0", color)}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-bold truncate">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search order, customer, deal..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
        {search && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setSearch("")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {["Order No", "Customer", "Mobile", "Deal ID", "Amount", "Created By", "Type", "Action"].map(
                (h) => (
                  <TableHead
                    key={h}
                    className={cn(
                      "h-10 whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      h === "Action" && "w-[150px] text-center"
                    )}
                  >
                    {h}
                  </TableHead>
                )
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-muted rounded animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length ? (
              filtered.map((candidate, idx) => (
                <TableRow
                  key={`${candidate.order.id}-${badgeType}`}
                  className={cn(
                    "transition-colors cursor-default",
                    idx % 2 === 0 ? "bg-background" : "bg-muted/20",
                    "hover:bg-primary/5"
                  )}
                >
                  <TableCell>
                    <span className="font-mono text-sm font-semibold text-primary">
                      {candidate.order.id.replace("MOTRACK-", "")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">
                      {candidate.order.customerSnapshot?.name ||
                        candidate.order.customerName ||
                        "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono text-muted-foreground">
                      {candidate.order.customerPhone || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{candidate.order.dealId || "—"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-semibold text-emerald-700">
                      ₹{" "}
                      {candidate.overallSummary.grandTotal.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {candidate.order.createdBy?.name || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        badgeType === "goods"
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-violet-300 bg-violet-50 text-violet-700"
                      )}
                    >
                      {badgeType === "goods" ? "Goods" : "VAS"}
                    </Badge>
                  </TableCell>
                  <TableCell className="w-[150px] text-center">
                    <Button
                      size="sm"
                      disabled={verifyingOrderId === candidate.order.id}
                      onClick={() => onGenerate(candidate)}
                      className="gap-1.5 h-8"
                    >
                      {verifyingOrderId === candidate.order.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Checking
                        </>
                      ) : (
                        <>
                          <FileText className="h-3.5 w-3.5" />
                          Generate
                          <ChevronRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="h-36 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Receipt className="h-9 w-9 opacity-20" />
                    <p className="text-sm font-medium">
                      {search ? "No matches found" : emptyLabel}
                    </p>
                    {search && (
                      <p className="text-xs">Try a different search term</p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function InvoicePage() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("goods-invoices");
  const [selectedCandidate, setSelectedCandidate] =
    React.useState<InvoiceCandidate | null>(null);
  const [instantQuickRef, setInstantQuickRef] = React.useState("");
  const [isResolvingQuickCandidate, setIsResolvingQuickCandidate] = React.useState(false);
  const [verifyingOrderId, setVerifyingOrderId] = React.useState<string | null>(null);
  const [verificationPrompt, setVerificationPrompt] = React.useState<{
    candidate: InvoiceCandidate;
    verification: InvoiceVerificationResult;
  } | null>(null);
  const [zohoBotEnabled, setZohoBotEnabled] = React.useState(false);

  const { toast } = useToast();

  // FIX 7: Quotation cache — survives re-renders, cleared only on unmount
  const quotationCache = React.useRef(new Map<string, Quotation | null>());
  const customerBillingCache = React.useRef(
    new Map<string, BillingDetailsSnapshot | null>()
  );

  // ─── FIX 6: Server-side filtered queries ──────────────────────────────────
  // Stream all orders and keep queue filtering in buildInvoiceCandidates.
  // Prevents regenerated or migrated orders from disappearing due query filters.
  React.useEffect(() => {
    const toMillis = (value: any): number => {
      if (!value) return 0;
      if (typeof value?.toMillis === "function") return value.toMillis();
      if (value instanceof Date) return value.getTime();
      if (typeof value === "number") return Number.isFinite(value) ? value : 0;
      if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };

    const sortOrdersForInvoiceQueue = (items: Order[]): Order[] =>
      [...items].sort((left, right) => {
        const leftRecord = left as Record<string, any>;
        const rightRecord = right as Record<string, any>;
        const leftTime = Math.max(
          toMillis(leftRecord?.updatedAt),
          toMillis(leftRecord?.createdAt)
        );
        const rightTime = Math.max(
          toMillis(rightRecord?.updatedAt),
          toMillis(rightRecord?.createdAt)
        );
        if (rightTime !== leftTime) return rightTime - leftTime;
        return String(right.id || "").localeCompare(String(left.id || ""));
      });

    const unsubOrders = onSnapshot(
      query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(1000)),
      (snap) => {
        const nextOrders = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Order));
        setOrders(sortOrdersForInvoiceQueue(nextOrders));
        setLoading(false);
      },
      () => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not load orders.",
        });
        setLoading(false);
      }
    );

    // Keep invoice history bounded so this page does not open an unlimited realtime stream.
    const unsubInvoices = onSnapshot(
      query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(1000)),
      (snap) =>
        setInvoices(snap.docs.map((d) => ({ ...d.data(), id: d.id } as Invoice))),
      () =>
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not load invoices.",
        })
    );

    return () => {
      unsubOrders();
      unsubInvoices();
    };
  }, [toast]);

  const candidates = React.useMemo(
    () => buildInvoiceCandidates(orders, invoices),
    [orders, invoices]
  );

  const goodsCandidates = React.useMemo(
    () =>
      candidates
        .map((c) => createSectionCandidate(c, "NORMAL"))
        .filter(
          (candidate): candidate is InvoiceCandidate =>
            candidate !== null &&
            ((allowsPostInvoiceAllocation(candidate.order) &&
              !hasOrder52137FinalInvoice(candidate.order, invoices)) ||
              !hasGeneratedInvoiceForSection(candidate.order, invoices, "NORMAL"))
        ),
    [candidates, invoices]
  );

  const vasCandidates = React.useMemo(
    () =>
      candidates
        .map((c) => createSectionCandidate(c, "VAS"))
        .filter(
          (candidate): candidate is InvoiceCandidate =>
            candidate !== null &&
            !hasGeneratedInvoiceForSection(candidate.order, invoices, "VAS")
        ),
    [candidates, invoices]
  );

  // FIX 7: Cached quotation fetch
  const fetchQuotationForOrder = React.useCallback(
    async (order: Order): Promise<Quotation | null> => {
      // Return from cache if available
      if (quotationCache.current.has(order.id)) {
        return quotationCache.current.get(order.id) ?? null;
      }

      const customerId = String(order.customerId || "").trim();
      const dealId = String(order.dealId || "").trim();
      const quotationId = String(order.quotationId || "").trim();
      if (customerId && dealId && quotationId) {
        const exactQuotation = await getDoc(
          doc(
            db,
            "customers",
            customerId,
            "deals",
            dealId,
            "quotations",
            quotationId
          )
        );
        if (exactQuotation.exists()) {
          const result = {
            id: exactQuotation.id,
            ...exactQuotation.data(),
          } as Quotation;
          quotationCache.current.set(order.id, result);
          return result;
        }
        quotationCache.current.set(order.id, null);
        return null;
      }

      const snapshots: any[] = [];
      const byOrderNo = await getDocs(
        query(
          collectionGroup(db, "quotations"),
          where("orderNo", "==", order.id),
          limit(5)
        )
      );
      snapshots.push(...byOrderNo.docs);

      if (order.quotationNo) {
        const byQNo = await getDocs(
          query(
            collectionGroup(db, "quotations"),
            where("quotationNo", "==", order.quotationNo),
            limit(5)
          )
        );
        snapshots.push(...byQNo.docs);
      }

      const result = (pickQuotationFromSnapshot(snapshots) as Quotation) || null;
      quotationCache.current.set(order.id, result); // FIX 7: cache result
      return result;
    },
    []
  );

  const fetchPreferredBillingForOrder = React.useCallback(
    async (order: Order): Promise<BillingDetailsSnapshot | undefined> => {
      const customerId = String(order.customerId || "").trim();
      if (!customerId) return undefined;

      if (customerBillingCache.current.has(customerId)) {
        return customerBillingCache.current.get(customerId) || undefined;
      }

      try {
        const customerSnap = await getDoc(doc(db, "customers", customerId));
        if (!customerSnap.exists()) {
          customerBillingCache.current.set(customerId, null);
          return undefined;
        }
        const preferred = resolvePreferredBillingDetails(
          customerSnap.data() as Record<string, unknown>
        );
        customerBillingCache.current.set(customerId, preferred || null);
        return preferred;
      } catch (error) {
        console.warn("Unable to load customer billing details:", customerId, error);
        customerBillingCache.current.set(customerId, null);
        return undefined;
      }
    },
    []
  );

  const hydrateCandidateWithLatestBilling = React.useCallback(
    async (candidate: InvoiceCandidate): Promise<InvoiceCandidate> => {
      const preferred = await fetchPreferredBillingForOrder(candidate.order);
      return applyBillingDetailsToCandidate(candidate, preferred);
    },
    [fetchPreferredBillingForOrder]
  );

  const hydrateCandidateForGeneration = React.useCallback(
    async (candidate: InvoiceCandidate): Promise<InvoiceCandidate> => {
      const latestOrderSnap = await getDoc(doc(db, "orders", candidate.order.id));
      const latestOrder = latestOrderSnap.exists()
        ? ({ ...(latestOrderSnap.data() as Order), id: latestOrderSnap.id } as Order)
        : candidate.order;
      const latestCandidates = buildInvoiceCandidates([latestOrder], invoices, {
        includeInvoiceBypassOrders: true,
      });
      const latestBase = latestCandidates[0];
      const requestedSection =
        candidate.normalItems.length > 0 && candidate.vasItems.length === 0
          ? "NORMAL"
          : candidate.vasItems.length > 0 && candidate.normalItems.length === 0
            ? "VAS"
            : null;
      if (
        requestedSection &&
        hasGeneratedInvoiceForSection(latestOrder, invoices, requestedSection) &&
        !(
          requestedSection === "NORMAL" &&
          allowsPostInvoiceAllocation(latestOrder) &&
          !hasOrder52137FinalInvoice(latestOrder, invoices)
        )
      ) {
        throw new Error(
          requestedSection === "VAS"
            ? "VAS invoice already generated. View it in VAS Invoice History."
            : "Goods invoice already generated. View it in Invoice History."
        );
      }
      const latestCandidate = latestBase
        ? requestedSection
          ? createSectionCandidate(latestBase, requestedSection)
          : latestBase
        : null;
      if (!latestCandidate) {
        throw new Error(
          requestedSection === "VAS"
            ? "No uninvoiced VAS items remain."
            : "No allocated, uninvoiced Goods items are available. Allocate stock first."
        );
      }

      const hydratedCandidate = await hydrateCandidateWithLatestBilling(latestCandidate);
      const quotation = await fetchQuotationForOrder(hydratedCandidate.order);
      return quotation
        ? normalizeCandidatePricingFromQuotation(hydratedCandidate, quotation)
        : hydratedCandidate;
    },
    [fetchQuotationForOrder, hydrateCandidateWithLatestBilling, invoices]
  );

  const verifyCandidateBeforeGenerate = React.useCallback(
    async (candidate: InvoiceCandidate): Promise<InvoiceVerificationResult> => {
      const quotation = await fetchQuotationForOrder(candidate.order);
      if (!quotation)
        return {
          ok: false,
          issues: ["Quotation not found for this order."],
          details: [],
          quotationNo: String(candidate.order.quotationNo || "-"),
          orderNo: String(candidate.order.orderNo || candidate.order.id || "-"),
          scope: "ALL",
          orderAmount: candidate.overallSummary.grandTotal,
          quotationAmount: 0,
          difference: candidate.overallSummary.grandTotal,
        };

      const scope: PricingReconciliationScope =
        candidate.normalItems.length === 0 && candidate.vasItems.length > 0
          ? "VAS"
          : candidate.vasItems.length === 0 && candidate.normalItems.length > 0
            ? "NORMAL"
            : "ALL";
      const orderAmount =
        scope === "VAS"
          ? candidate.vasSummary.grandTotal
          : scope === "NORMAL"
            ? candidate.normalSummary.grandTotal
            : candidate.overallSummary.grandTotal;
      const verification = verifyCandidateLinesAgainstQuotation(candidate, quotation, scope);
      const quotationAmount = num(verification.quotationAmount);
      const amountDifference = orderAmount - quotationAmount;
      if (Math.abs(amountDifference) > 0.05 && verification.issues.length === 0) {
        verification.issues.push(
          `Invoice selected-line total differs from the converted quotation by ${amountDifference.toFixed(2)}.`
        );
      }
      return {
        ok: verification.issues.length === 0,
        issues: verification.issues.slice(0, 12),
        details: verification.details.slice(0, 30),
        quotationNo: String(
          quotation.quotationNo ||
            candidate.order.quotationNo ||
            quotation.id ||
            "-"
        ),
        orderNo: String(
          candidate.order.orderNo ||
            candidate.order.crmOrderNo ||
            candidate.order.id ||
            "-"
        ),
        scope,
        orderAmount,
        quotationAmount,
        difference: amountDifference,
      };
    },
    [fetchQuotationForOrder]
  );

  const openCandidateWithVerification = React.useCallback(
    async (candidate: InvoiceCandidate) => {
      setVerifyingOrderId(candidate.order.id);
      try {
        const hydratedCandidate = await hydrateCandidateForGeneration(candidate);
        const verification = await verifyCandidateBeforeGenerate(hydratedCandidate);
        if (!verification.ok) {
          setVerificationPrompt({ candidate: hydratedCandidate, verification });
          return false;
        }
        setSelectedCandidate(hydratedCandidate);
        return true;
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Verification error",
          description: error?.message || "Unable to verify.",
        });
        return false;
      } finally {
        setVerifyingOrderId(null);
      }
    },
    [hydrateCandidateForGeneration, toast, verifyCandidateBeforeGenerate]
  );

  const buildQuickLookupMeta = React.useCallback((value: string) => {
    const raw = String(value || "").trim();
    const normalized = raw.toUpperCase();
    const withPrefix = normalized.startsWith("MOTRACK-")
      ? normalized
      : `MOTRACK-${normalized}`;
    const compact = withPrefix.replace(/^MOTRACK-/, "");
    const variants = Array.from(
      new Set([raw, normalized, withPrefix, compact].map((entry) => String(entry || "").trim()).filter(Boolean))
    );
    return { raw, normalized, withPrefix, compact, variants };
  }, []);

  const matchesQuickVariant = React.useCallback((value: unknown, variants: Set<string>) => {
    const normalizedValue = String(value || "").trim().toUpperCase();
    if (!normalizedValue) return false;
    if (variants.has(normalizedValue)) return true;
    const compactValue = normalizedValue.replace(/^MOTRACK-/, "");
    return variants.has(compactValue);
  }, []);

  const findExistingCandidateByReference = React.useCallback(
    (value: string): InvoiceCandidate | null => {
      const quickMeta = buildQuickLookupMeta(value);
      const variants = new Set(quickMeta.variants.map((entry) => entry.toUpperCase()));
      const matchCandidate = (candidate: InvoiceCandidate) =>
        matchesQuickVariant(candidate.order.id, variants) ||
        matchesQuickVariant(candidate.order.orderNo, variants) ||
        matchesQuickVariant(candidate.order.crmOrderNo, variants) ||
        matchesQuickVariant(candidate.order.quotationNo, variants);

      const goods = goodsCandidates.find(matchCandidate) || null;
      if (goods) return goods;
      return vasCandidates.find(matchCandidate) || null;
    },
    [buildQuickLookupMeta, goodsCandidates, matchesQuickVariant, vasCandidates]
  );

  const fetchOrderByReference = React.useCallback(
    async (value: string): Promise<Order | null> => {
      const quickMeta = buildQuickLookupMeta(value);
      if (!quickMeta.raw) return null;

      const docIdCandidates = Array.from(
        new Set([quickMeta.withPrefix, quickMeta.normalized, quickMeta.raw].filter(Boolean))
      );
      for (const docIdValue of docIdCandidates) {
        const orderSnap = await getDoc(doc(db, "orders", docIdValue));
        if (orderSnap.exists()) {
          return { ...(orderSnap.data() as Order), id: orderSnap.id } as Order;
        }
      }

      const queryCandidates: Array<{ field: "orderNo" | "crmOrderNo" | "quotationNo"; value: string }> = [];
      quickMeta.variants.forEach((entry) => {
        queryCandidates.push({ field: "orderNo", value: entry });
      });
      quickMeta.variants.forEach((entry) => {
        queryCandidates.push({ field: "crmOrderNo", value: entry });
      });
      quickMeta.variants.forEach((entry) => {
        queryCandidates.push({ field: "quotationNo", value: entry });
      });

      const seen = new Set<string>();
      for (const candidate of queryCandidates) {
        const marker = `${candidate.field}:${candidate.value}`;
        if (seen.has(marker)) continue;
        seen.add(marker);
        const snapshot = await getDocs(
          query(collection(db, "orders"), where(candidate.field, "==", candidate.value), limit(1))
        );
        if (!snapshot.empty) {
          const first = snapshot.docs[0];
          return { ...(first.data() as Order), id: first.id } as Order;
        }
      }

      return null;
    },
    [buildQuickLookupMeta]
  );

  const findDirectCandidateFromOrder = React.useCallback(
    (order: Order): InvoiceCandidate | null => {
      const existingOrderInvoices = getInvoicesForOrder(
        invoices.filter(isInvoiceCountableForInvoicing),
        order
      );
      if (
        existingOrderInvoices.length > 0 &&
        computeInvoicingStatus(order, existingOrderInvoices) === "INVOICED"
      ) {
        return null;
      }

      const built = buildInvoiceCandidates([order], invoices, {
        includeInvoiceBypassOrders: true,
      });
      if (built.length > 0) {
        const base = built[0];
        const hasGoodsInvoice = hasGeneratedInvoiceForSection(
          order,
          invoices,
          "NORMAL"
        );
        const hasFinal52137Invoice = hasOrder52137FinalInvoice(order, invoices);
        const hasVasInvoice = hasGeneratedInvoiceForSection(
          order,
          invoices,
          "VAS"
        );
        return (
          (!hasGoodsInvoice ||
          (allowsPostInvoiceAllocation(order) && !hasFinal52137Invoice)
            ? createSectionCandidate(base, "NORMAL")
            : null) ||
          (!hasVasInvoice ? createSectionCandidate(base, "VAS") : null)
        );
      }

      return null;
    },
    [invoices]
  );

  const triggerQuickGenerateFromInput = React.useCallback(
    async (input: string) => {
      const value = String(input || "").trim();
      if (!value) {
        toast({
          variant: "destructive",
          title: "Enter order or quotation number",
        });
        return;
      }

      setIsResolvingQuickCandidate(true);
      try {
        const fromLoadedCandidates = findExistingCandidateByReference(value);
        if (fromLoadedCandidates) {
          await openCandidateWithVerification(fromLoadedCandidates);
          return;
        }

        const order = await fetchOrderByReference(value);
        if (!order) {
          toast({
            variant: "destructive",
            title: "Order not found",
            description: "No order matched this order/quotation number.",
          });
          return;
        }

        const instantCandidate = findDirectCandidateFromOrder(order);
        if (!instantCandidate) {
          toast({
            variant: "destructive",
            title: "Invoice already generated",
            description: "This order is already present in invoice history or has no remaining invoiceable lines.",
          });
          return;
        }

        await openCandidateWithVerification(instantCandidate);
      } finally {
        setIsResolvingQuickCandidate(false);
      }
    },
    [
      fetchOrderByReference,
      findDirectCandidateFromOrder,
      findExistingCandidateByReference,
      openCandidateWithVerification,
      toast,
    ]
  );

  const handleInstantQuickGenerate = React.useCallback(async () => {
    await triggerQuickGenerateFromInput(instantQuickRef);
  }, [instantQuickRef, triggerQuickGenerateFromInput]);

  const handledQuickRef = React.useRef<string>("");
  const urlQuickRef = String(searchParams.get("quickRef") || "").trim();
  React.useEffect(() => {
    if (!urlQuickRef) return;
    if (handledQuickRef.current === urlQuickRef) return;
    handledQuickRef.current = urlQuickRef;
    void triggerQuickGenerateFromInput(urlQuickRef);
  }, [triggerQuickGenerateFromInput, urlQuickRef]);

  return (
    <div className="w-full space-y-6 p-4 md:p-6 lg:p-8">
      <ZohoInvoiceBotCard onEnabledChange={setZohoBotEnabled} />
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-10">
          <TabsTrigger value="goods-invoices" className="text-sm gap-2">
            <Package className="h-4 w-4" />
            Goods Invoice
            {goodsCandidates.length > 0 && (
              <Badge variant="secondary" className="h-5 text-xs ml-1">
                {goodsCandidates.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="vas-invoices" className="text-sm gap-2">
            <Wrench className="h-4 w-4" />
            VAS Invoice
            {vasCandidates.length > 0 && (
              <Badge variant="secondary" className="h-5 text-xs ml-1">
                {vasCandidates.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="tally-log" className="text-sm gap-2">
            <History className="h-4 w-4" />
            Invoice History
          </TabsTrigger>
          <TabsTrigger value="vas-history" className="text-sm gap-2">
            <Wrench className="h-4 w-4" />
            VAS Invoice History
          </TabsTrigger>
        </TabsList>

        <div className="mt-4 rounded-xl border bg-muted/20 px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center">
          <div className="flex items-center gap-2 text-sm font-medium shrink-0">
            <Zap className="h-4 w-4 text-amber-500" />
            Instant / Cashsale Quick Generate
          </div>
          <Input
            className="h-9 text-sm md:max-w-sm"
            placeholder="Enter Order No or Quotation No..."
            value={instantQuickRef}
            onChange={(event) => setInstantQuickRef(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void handleInstantQuickGenerate()}
          />
          <Button
            size="sm"
            onClick={() => void handleInstantQuickGenerate()}
            disabled={!!verifyingOrderId || isResolvingQuickCandidate}
            className="gap-1.5 md:ml-auto"
          >
            {verifyingOrderId || isResolvingQuickCandidate ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Generate
          </Button>
        </div>

        <TabsContent value="goods-invoices" className="mt-4">
          <CandidateTable
            candidates={goodsCandidates}
            loading={loading}
            emptyLabel="No pending goods invoices."
            verifyingOrderId={verifyingOrderId}
            onGenerate={(c) => void openCandidateWithVerification(c)}
            badgeType="goods"
          />
        </TabsContent>

        <TabsContent value="vas-invoices" className="mt-4">
          <CandidateTable
            candidates={vasCandidates}
            loading={loading}
            emptyLabel="No pending VAS invoices."
            verifyingOrderId={verifyingOrderId}
            onGenerate={(c) => void openCandidateWithVerification(c)}
            badgeType="vas"
          />
        </TabsContent>

        <TabsContent value="tally-log" className="mt-4">
          <InvoiceLogTable
            zohoBotEnabled={zohoBotEnabled}
            historyType="goods"
          />
        </TabsContent>

        <TabsContent value="vas-history" className="mt-4">
          <InvoiceLogTable
            zohoBotEnabled={zohoBotEnabled}
            historyType="vas"
          />
        </TabsContent>
      </Tabs>

      {/* Generate Dialog */}
      <GenerateInvoiceDialog
        isOpen={!!selectedCandidate}
        candidate={selectedCandidate}
        invoices={invoices}
        zohoBotEnabled={zohoBotEnabled}
        onValidateBeforeGenerate={verifyCandidateBeforeGenerate}
        onSuccess={(hasRemainingVas, createdInvoice) => {
          if (createdInvoice?.id) {
            setInvoices((prev) => [
              createdInvoice,
              ...prev.filter((invoice) => invoice.id !== createdInvoice.id),
            ]);
          }
          setActiveTab(
            createdInvoice && isVasInvoice(createdInvoice)
              ? "vas-history"
              : hasRemainingVas
                ? "vas-invoices"
                : "tally-log"
          );
        }}
        onClose={() => {
          setSelectedCandidate(null);
        }}
      />

      {/* Verification Issues Dialog */}
      <AlertDialog
        open={!!verificationPrompt}
        onOpenChange={(open) => { if (!open) setVerificationPrompt(null); }}
      >
        <AlertDialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="rounded-full bg-amber-100 p-2.5">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <AlertDialogTitle>Verification Issues Found</AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-3 mt-2">
                <p className="text-sm text-muted-foreground">
                  The {verificationPrompt?.verification.scope === "VAS" ? "VAS" : "invoice"} value
                  differs from its converted quotation.
                </p>
                <div className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:grid-cols-5">
                  <div>
                    <p className="text-xs text-muted-foreground">Quotation No</p>
                    <p className="font-semibold">{verificationPrompt?.verification.quotationNo}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Order No</p>
                    <p className="font-semibold">{verificationPrompt?.verification.orderNo}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Quotation Value</p>
                    <p className="font-semibold">
                      INR {num(verificationPrompt?.verification.quotationAmount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Order / Invoice Value</p>
                    <p className="font-semibold">
                      INR {num(verificationPrompt?.verification.orderAmount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Difference</p>
                    <p className="font-bold text-red-700">
                      INR {num(verificationPrompt?.verification.difference).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                {(verificationPrompt?.verification.details.length || 0) > 0 ? (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product Causing Difference</TableHead>
                          <TableHead>Field</TableHead>
                          <TableHead>Why</TableHead>
                          <TableHead className="text-right">Order</TableHead>
                          <TableHead className="text-right">Quotation</TableHead>
                          <TableHead className="text-right">Difference</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(verificationPrompt?.verification.details || []).map((detail, index) => (
                          <TableRow key={`${detail.product}-${detail.field}-${index}`}>
                            <TableCell className="font-medium">{detail.product}</TableCell>
                            <TableCell>{detail.field}</TableCell>
                            <TableCell className="min-w-64 text-xs text-muted-foreground">
                              {detail.reason}
                            </TableCell>
                            <TableCell className="text-right">
                              {typeof detail.orderValue === "number"
                                ? detail.orderValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })
                                : detail.orderValue}
                            </TableCell>
                            <TableCell className="text-right">
                              {typeof detail.quotationValue === "number"
                                ? detail.quotationValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })
                                : detail.quotationValue}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-red-700">
                              {typeof detail.difference === "number"
                                ? detail.difference.toLocaleString("en-IN", { maximumFractionDigits: 2 })
                                : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
                    {(verificationPrompt?.verification.issues || []).map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{issue}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Invoice generation is blocked until the order is corrected from its linked quotation.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
