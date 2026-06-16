export type GstTaxMode = "INTRASTATE" | "INTERSTATE" | "UNKNOWN";

export const DEFAULT_DESTINATION_STATE = "Haryana";
export const DEFAULT_DESTINATION_STATE_CODE = "06";

type AddressLike =
  | string
  | {
      address?: unknown;
      addressLine1?: unknown;
      addressLine2?: unknown;
      line1?: unknown;
      line2?: unknown;
      street?: unknown;
      locality?: unknown;
      landmark?: unknown;
      city?: unknown;
      state?: unknown;
      pincode?: unknown;
      pinCode?: unknown;
      zip?: unknown;
    }
  | null
  | undefined;

const STATE_CODE_BY_NAME: Record<string, string> = {
  "andaman and nicobar islands": "35",
  "andhra pradesh": "37",
  "arunachal pradesh": "12",
  assam: "18",
  bihar: "10",
  chandigarh: "04",
  chhattisgarh: "22",
  "dadra and nagar haveli and daman and diu": "26",
  "daman and diu": "26",
  delhi: "07",
  goa: "30",
  gujarat: "24",
  haryana: "06",
  "himachal pradesh": "02",
  "jammu and kashmir": "01",
  jharkhand: "20",
  karnataka: "29",
  kerala: "32",
  ladakh: "38",
  lakshadweep: "31",
  "madhya pradesh": "23",
  maharashtra: "27",
  manipur: "14",
  meghalaya: "17",
  mizoram: "15",
  nagaland: "13",
  odisha: "21",
  orissa: "21",
  puducherry: "34",
  pondicherry: "34",
  punjab: "03",
  rajasthan: "08",
  sikkim: "11",
  "tamil nadu": "33",
  telangana: "36",
  tripura: "16",
  "uttar pradesh": "09",
  uttarakhand: "05",
  uttaranchal: "05",
  "west bengal": "19",
};

const normalizeText = (value: unknown): string =>
  sanitizeLegacySelectText(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const textValue = (value: unknown): string => String(value ?? "").trim();

export const sanitizeLegacySelectText = (value: unknown): string =>
  String(value ?? "")
    .replace(/-*\s*\bselect\b\s*-*/gi, " ")
    .replace(/\s*,\s*,+/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^\s*,|,\s*$/g, "")
    .trim();

export const formatInvoiceState = (
  value: unknown,
  fallback = DEFAULT_DESTINATION_STATE
): string => {
  const state = sanitizeLegacySelectText(value) || fallback;
  return state.toUpperCase();
};

export const getGstStateCodeFromGstin = (gstin: unknown): string | undefined => {
  const normalized = textValue(gstin).toUpperCase();
  const code = normalized.slice(0, 2);
  return /^\d{2}$/.test(code) ? code : undefined;
};

export const getGstStateCodeFromState = (state: unknown): string | undefined => {
  const normalized = normalizeText(state);
  if (!normalized) return undefined;
  if (/^\d{2}$/.test(normalized)) return normalized;
  return STATE_CODE_BY_NAME[normalized];
};

export const formatIndianAddress = (address: AddressLike): string => {
  if (typeof address === "string") return sanitizeLegacySelectText(address);
  if (!address || typeof address !== "object") return "";

  const candidateParts = [
    address.address,
    address.addressLine1,
    address.line1,
    address.addressLine2,
    address.line2,
    address.street,
    address.locality,
    address.landmark,
    address.city,
    address.state,
    address.pincode,
    address.pinCode,
    address.zip,
  ]
    .map(sanitizeLegacySelectText)
    .filter(Boolean);

  const parts: string[] = [];
  const normalizedParts: string[] = [];
  candidateParts.forEach((part) => {
    const normalized = normalizeText(part);
    if (!normalized) return;
    if (
      normalizedParts.some(
        (existing) =>
          existing === normalized ||
          existing.includes(normalized)
      )
    ) {
      return;
    }
    parts.push(part);
    normalizedParts.push(normalized);
  });

  return parts.join(", ");
};

export const getGstStateCodeFromAddress = (
  address: AddressLike
): string | undefined => {
  if (address && typeof address === "object") {
    const direct = getGstStateCodeFromState(address.state);
    if (direct) return direct;
  }

  const normalizedAddress = normalizeText(formatIndianAddress(address));
  if (!normalizedAddress) return undefined;

  return Object.entries(STATE_CODE_BY_NAME)
    .sort(([left], [right]) => right.length - left.length)
    .find(([stateName]) => normalizedAddress.includes(stateName))?.[1];
};

export const resolveGstTaxMode = ({
  sellerGstin,
  destinationGstin,
  shippingAddress,
  billingAddress,
}: {
  sellerGstin?: unknown;
  destinationGstin?: unknown;
  shippingAddress?: AddressLike;
  billingAddress?: AddressLike;
}): {
  mode: GstTaxMode;
  sellerStateCode?: string;
  destinationStateCode?: string;
} => {
  const sellerStateCode = getGstStateCodeFromGstin(sellerGstin);
  const destinationStateCode =
    getGstStateCodeFromAddress(shippingAddress) ||
    getGstStateCodeFromAddress(billingAddress) ||
    getGstStateCodeFromGstin(destinationGstin) ||
    DEFAULT_DESTINATION_STATE_CODE;

  if (!sellerStateCode || !destinationStateCode) {
    return { mode: "UNKNOWN", sellerStateCode, destinationStateCode };
  }

  return {
    mode:
      sellerStateCode === destinationStateCode ? "INTRASTATE" : "INTERSTATE",
    sellerStateCode,
    destinationStateCode,
  };
};

export const allocateGstByTaxMode = (
  gstAmount: number,
  mode: GstTaxMode
): { cgst: number; sgst: number; igst: number } => {
  const amount = Number.isFinite(gstAmount) ? gstAmount : 0;
  if (mode === "INTERSTATE") {
    return { cgst: 0, sgst: 0, igst: amount };
  }
  return { cgst: amount / 2, sgst: amount / 2, igst: 0 };
};
