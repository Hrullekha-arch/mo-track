export type ZohoInvoiceSeriesName = "MO-1" | "MO-2";

export type ZohoInvoiceSeriesRule = {
  seriesName: ZohoInvoiceSeriesName;
  invoicePrefix: string;
};

const MG_PREFIX = "BS/";
const MG_PREFIX_REGEX = /^BS\//i;

const normalizeStoreName = (store: unknown) =>
  String(store ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

const isMgStore = (store: unknown) => {
  const normalized = normalizeStoreName(store);
  if (!normalized) return false;
  if (normalized === "MG") return true;
  if (normalized.includes("MG ROAD")) return true;
  return /\bMG\b/.test(normalized);
};

const isGcrStore = (store: unknown) => {
  const normalized = normalizeStoreName(store);
  if (!normalized) return false;
  if (normalized === "GCR") return true;
  if (normalized.includes("GCR BRANCH")) return true;
  return /\bGCR\b/.test(normalized);
};

export const resolveZohoInvoiceSeriesForStore = (store: unknown): ZohoInvoiceSeriesRule => {
  if (isGcrStore(store)) {
    return { seriesName: "MO-2", invoicePrefix: MG_PREFIX };
  }
  if (isMgStore(store)) return { seriesName: "MO-1", invoicePrefix: "" };
  // Default non-GCR stores to normal numbering.
  return { seriesName: "MO-1", invoicePrefix: "" };
};

export const applyZohoInvoicePrefixForStore = (
  invoiceNumber: unknown,
  store: unknown
): string | undefined => {
  const raw = String(invoiceNumber ?? "").trim();
  if (!raw) return undefined;

  const { invoicePrefix } = resolveZohoInvoiceSeriesForStore(store);
  const withoutMgPrefix = raw.replace(MG_PREFIX_REGEX, "").trim();

  if (invoicePrefix) {
    return `${invoicePrefix}${withoutMgPrefix}`.replace(/\/{2,}/g, "/");
  }

  return withoutMgPrefix;
};

export const invoiceNumberMatchesStoreSeries = (
  invoiceNumber: unknown,
  store: unknown
): boolean => {
  const number = String(invoiceNumber ?? "").trim();
  if (!number) return false;

  const { invoicePrefix } = resolveZohoInvoiceSeriesForStore(store);
  if (invoicePrefix) return MG_PREFIX_REGEX.test(number);
  return !MG_PREFIX_REGEX.test(number);
};
