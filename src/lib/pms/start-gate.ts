import { adminDb } from "@/lib/firebase-admin";

export const PMS_START_MIN_PERCENT = 20;
export const PMS_START_MIN_RATIO = PMS_START_MIN_PERCENT / 100;

type PmsStartGate = {
  eligible: boolean;
  requiredAmount: number;
  receivedAmount: number;
  shortfallAmount: number;
  orderAmount: number;
  receiptAmount: number;
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
};

export const getOrderAmountForPms = (order?: any): number => {
  const overallSummary = toRecord(order?.overallSummary);
  return Math.max(
    0,
    toNumber(order?.totalAmount) ??
      toNumber(overallSummary.grandTotal) ??
      toNumber(order?.grandTotal) ??
      toNumber(order?.orderValue) ??
      toNumber(order?.amount) ??
      0
  );
};

const getRecordedAdvanceAmount = (order?: any): number => {
  const payment = toRecord(order?.payment);
  return Math.max(
    0,
    toNumber(order?.receivedAmount) ??
      toNumber(order?.advanceAmount) ??
      toNumber(order?.advance) ??
      toNumber(payment.advanceAmount) ??
      toNumber(payment.advance) ??
      0
  );
};

const getReceiptKey = (order?: any): string => {
  const customerId = String(order?.customerId || "").trim();
  const dealId = String(order?.dealId || "").trim();
  if (!customerId || !dealId) return "";
  return `${customerId}::${dealId}`;
};

const getGateFromOrder = (order: any, receiptAmount: number): PmsStartGate => {
  const orderAmount = getOrderAmountForPms(order);
  const requiredAmount = Math.max(0, orderAmount * PMS_START_MIN_RATIO);
  const recordedAdvanceAmount = getRecordedAdvanceAmount(order);
  const receivedAmount = Math.max(receiptAmount, recordedAdvanceAmount);
  const shortfallAmount = Math.max(requiredAmount - receivedAmount, 0);
  const fullyApproved = order?.paymentConfirmed === true || order?.creditApproved === true;
  const eligible =
    fullyApproved ||
    (orderAmount > 0 && receivedAmount + 0.0001 >= requiredAmount);

  return {
    eligible,
    requiredAmount,
    receivedAmount,
    shortfallAmount,
    orderAmount,
    receiptAmount,
  };
};

export async function getPmsStartGateForOrder(order?: any): Promise<PmsStartGate> {
  const orderMap = new Map<string, any>([["single", order || {}]]);
  const gateMap = await getPmsStartGateMap(orderMap);
  return (
    gateMap.get("single") || {
      eligible: false,
      requiredAmount: 0,
      receivedAmount: 0,
      shortfallAmount: 0,
      orderAmount: 0,
      receiptAmount: 0,
    }
  );
}

export async function getPmsStartGateMap(
  ordersById: Map<string, any>
): Promise<Map<string, PmsStartGate>> {
  const receiptKeyMap = new Map<string, { customerId: string; dealId: string }>();

  ordersById.forEach((order) => {
    const receiptKey = getReceiptKey(order);
    if (!receiptKey || receiptKeyMap.has(receiptKey)) return;
    receiptKeyMap.set(receiptKey, {
      customerId: String(order?.customerId || "").trim(),
      dealId: String(order?.dealId || "").trim(),
    });
  });

  const receiptTotals = new Map<string, number>();

  await Promise.all(
    Array.from(receiptKeyMap.entries()).map(async ([receiptKey, value]) => {
      try {
        const receiptSnap = await adminDb
          .collection("customers")
          .doc(value.customerId)
          .collection("deals")
          .doc(value.dealId)
          .collection("receipts")
          .get();

        const total = receiptSnap.docs.reduce((sum, doc) => {
          return sum + Math.max(0, toNumber((doc.data() as any)?.amount) ?? 0);
        }, 0);

        receiptTotals.set(receiptKey, total);
      } catch {
        receiptTotals.set(receiptKey, 0);
      }
    })
  );

  const gateMap = new Map<string, PmsStartGate>();
  ordersById.forEach((order, orderId) => {
    const receiptKey = getReceiptKey(order);
    const receiptAmount = receiptKey ? receiptTotals.get(receiptKey) || 0 : 0;
    gateMap.set(orderId, getGateFromOrder(order, receiptAmount));
  });

  return gateMap;
}
