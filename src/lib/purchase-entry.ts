export type PurchaseEntryStatus = "Pending" | "Done";

// IST cutoff requested by business for legacy compatibility.
export const PURCHASE_ENTRY_ENFORCEMENT_FROM_ISO = "2026-02-26T00:00:00+05:30";
export const PURCHASE_ENTRY_ENFORCEMENT_FROM_MS = new Date(
  PURCHASE_ENTRY_ENFORCEMENT_FROM_ISO
).getTime();

export const normalizePurchaseEntryStatus = (value?: unknown): PurchaseEntryStatus => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "done" || normalized === "completed") return "Done";
  return "Pending";
};

const toMillisSafe = (value?: unknown) => {
  if (!value) return Number.NaN;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : Number.NaN;
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    try {
      const date = (value as { toDate?: () => Date }).toDate?.();
      if (date instanceof Date) {
        const ms = date.getTime();
        return Number.isFinite(ms) ? ms : Number.NaN;
      }
    } catch {
      return Number.NaN;
    }
  }
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export const resolveLengthCreatedAt = (lengthDoc: any): string | undefined => {
  const candidate =
    lengthDoc?.createdAt ||
    lengthDoc?.receivedAt ||
    lengthDoc?.lastUpdatedAt ||
    lengthDoc?.updatedAt;
  const millis = toMillisSafe(candidate);
  if (!Number.isFinite(millis)) return undefined;
  return new Date(millis).toISOString();
};

export const shouldEnforcePurchaseEntryForLength = (lengthDoc: any): boolean => {
  const hasPurchaseLink = Boolean(
    String(lengthDoc?.poNumber || "").trim() ||
      String(lengthDoc?.purchaseEntryId || "").trim() ||
      String(lengthDoc?.purchaseRequestId || "").trim() ||
      String(lengthDoc?.inboundId || "").trim()
  );
  if (!hasPurchaseLink) return false;

  const createdAt = resolveLengthCreatedAt(lengthDoc);
  if (!createdAt) return false;
  const createdMs = toMillisSafe(createdAt);
  if (!Number.isFinite(createdMs)) return false;
  return createdMs >= PURCHASE_ENTRY_ENFORCEMENT_FROM_MS;
};

export const isLengthPurchaseEntryDone = (lengthDoc: any): boolean => {
  return normalizePurchaseEntryStatus(lengthDoc?.purchaseEntryStatus) === "Done";
};
