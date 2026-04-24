import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import {
  FabricDetail,
  Order,
  SalesmanIncentiveItem,
  SalesmanIncentiveOrderDoc,
  SalesmanIncentiveOrderSummary,
  SalesmanIncentiveRootDoc,
  SalesmanIncentiveRuleCode,
  SalesmanIncentiveSummary,
} from "@/lib/types";

export const SALESMAN_INCENTIVE_COLLECTION = "SalesmanIncentiveDetails";
export const SALESMAN_INCENTIVE_ORDERS_SUBCOLLECTION = "Orders";
export const SALESMAN_INCENTIVE_EFFECTIVE_FROM = "2026-04-04T00:00:00+05:30";
export const SALESMAN_INCENTIVE_SCHEMA_VERSION = "2026-04-04-v1";

const SALESMAN_INCENTIVE_EFFECTIVE_FROM_MS = Date.parse(SALESMAN_INCENTIVE_EFFECTIVE_FROM);

export type SalesmanSnapshot = {
  id?: string;
  name?: string;
  salesmanCode?: string;
};

type IncentiveRuleMatch = {
  ruleCode: SalesmanIncentiveRuleCode;
  matchedToken?: string;
  incentivePercent: number;
  requiresInStock: boolean;
  isRuleMatched: boolean;
};

type NumericSummary = {
  itemsCount: number;
  incentivableItemsCount: number;
  eligibleItemsCount: number;
  verifiedItemsCount: number;
  inStockItemsCount: number;
  totalItemRate: number;
  potentialIncentiveAmount: number;
  earnedIncentiveAmount: number;
};

const EMPTY_ORDER_SUMMARY: SalesmanIncentiveOrderSummary = {
  itemsCount: 0,
  incentivableItemsCount: 0,
  eligibleItemsCount: 0,
  verifiedItemsCount: 0,
  inStockItemsCount: 0,
  totalItemRate: 0,
  potentialIncentiveAmount: 0,
  earnedIncentiveAmount: 0,
};

const EMPTY_ROOT_SUMMARY: SalesmanIncentiveSummary = {
  totalOrders: 0,
  ordersWithEarnedIncentive: 0,
  totalItems: 0,
  incentivableItemsCount: 0,
  eligibleItemsCount: 0,
  verifiedItemsCount: 0,
  inStockItemsCount: 0,
  totalItemRate: 0,
  potentialIncentiveAmount: 0,
  earnedIncentiveAmount: 0,
};

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toPositiveFiniteNumber = (value: unknown) => {
  const parsed = toFiniteNumber(value);
  return parsed > 0 ? parsed : 0;
};

const toClampedPercent = (value: unknown) => {
  const parsed = toFiniteNumber(value);
  if (parsed <= 0) return 0;
  if (parsed >= 100) return 100;
  return roundCurrency(parsed);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const stripUndefinedDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => stripUndefinedDeep(entry))
      .filter((entry) => entry !== undefined);
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, stripUndefinedDeep(entry)] as const)
      .filter(([, entry]) => entry !== undefined);
    return Object.fromEntries(entries);
  }

  return value;
};

const toNonNegativeFiniteNumberOrUndefined = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return roundCurrency(parsed);
};

const toNormalizedToken = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "");

const toSafeDocToken = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const inferInStockFromStatus = (status: unknown): boolean | null => {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "in stock" || normalized === "in_stock" || normalized === "allocated") {
    return true;
  }
  if (normalized === "out of stock" || normalized === "pr created") {
    return false;
  }
  return null;
};

const isOrderEligibleByDate = (orderDate?: string) => {
  if (!orderDate) return false;
  const parsedMs = Date.parse(orderDate);
  if (!Number.isFinite(parsedMs)) return false;
  return parsedMs >= SALESMAN_INCENTIVE_EFFECTIVE_FROM_MS;
};

const normalizeOrderSummary = (value: unknown): SalesmanIncentiveOrderSummary => {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_ORDER_SUMMARY };
  }
  const source = value as Record<string, unknown>;
  return {
    itemsCount: Math.max(0, Math.trunc(toFiniteNumber(source.itemsCount))),
    incentivableItemsCount: Math.max(0, Math.trunc(toFiniteNumber(source.incentivableItemsCount))),
    eligibleItemsCount: Math.max(0, Math.trunc(toFiniteNumber(source.eligibleItemsCount))),
    verifiedItemsCount: Math.max(0, Math.trunc(toFiniteNumber(source.verifiedItemsCount))),
    inStockItemsCount: Math.max(0, Math.trunc(toFiniteNumber(source.inStockItemsCount))),
    totalItemRate: roundCurrency(toFiniteNumber(source.totalItemRate)),
    potentialIncentiveAmount: roundCurrency(toFiniteNumber(source.potentialIncentiveAmount)),
    earnedIncentiveAmount: roundCurrency(toFiniteNumber(source.earnedIncentiveAmount)),
  };
};

const normalizeRootSummary = (value: unknown): SalesmanIncentiveSummary => {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_ROOT_SUMMARY };
  }
  const source = value as Record<string, unknown>;
  return {
    totalOrders: Math.max(0, Math.trunc(toFiniteNumber(source.totalOrders))),
    ordersWithEarnedIncentive: Math.max(0, Math.trunc(toFiniteNumber(source.ordersWithEarnedIncentive))),
    totalItems: Math.max(0, Math.trunc(toFiniteNumber(source.totalItems))),
    incentivableItemsCount: Math.max(0, Math.trunc(toFiniteNumber(source.incentivableItemsCount))),
    eligibleItemsCount: Math.max(0, Math.trunc(toFiniteNumber(source.eligibleItemsCount))),
    verifiedItemsCount: Math.max(0, Math.trunc(toFiniteNumber(source.verifiedItemsCount))),
    inStockItemsCount: Math.max(0, Math.trunc(toFiniteNumber(source.inStockItemsCount))),
    totalItemRate: roundCurrency(toFiniteNumber(source.totalItemRate)),
    potentialIncentiveAmount: roundCurrency(toFiniteNumber(source.potentialIncentiveAmount)),
    earnedIncentiveAmount: roundCurrency(toFiniteNumber(source.earnedIncentiveAmount)),
    updatedAt: String(source.updatedAt || "") || undefined,
  };
};

const resolveIncentiveRuleForLine = (bcn?: string, itemName?: string): IncentiveRuleMatch => {
  const normalizedBcn = toNormalizedToken(bcn);
  const normalizedName = toNormalizedToken(itemName);

  if (normalizedBcn.includes("TASSEL") || normalizedName.includes("TASSEL")) {
    return {
      ruleCode: "TASSEL",
      matchedToken: "TASSEL",
      incentivePercent: 3,
      requiresInStock: false,
      isRuleMatched: true,
    };
  }

  const prefix2Tokens = ["ESC", "ES"] as const;
  for (const token of prefix2Tokens) {
    if (normalizedBcn.startsWith(token)) {
      return {
        ruleCode: "PREFIX_ESC_ES",
        matchedToken: token,
        incentivePercent: 2,
        requiresInStock: true,
        isRuleMatched: true,
      };
    }
  }

  const prefix1Tokens = ["RLM", "FS", "WS", "S", "F", "W"] as const;
  for (const token of prefix1Tokens) {
    if (normalizedBcn.startsWith(token)) {
      return {
        ruleCode: "PREFIX_S_F_FS_RLM_W_WS",
        matchedToken: token,
        incentivePercent: 1,
        requiresInStock: true,
        isRuleMatched: true,
      };
    }
  }

  return {
    ruleCode: "NONE",
    incentivePercent: 0,
    requiresInStock: false,
    isRuleMatched: false,
  };
};

const recomputeIncentiveItem = (
  item: SalesmanIncentiveItem,
  isIncentiveApplicableByDate: boolean
): SalesmanIncentiveItem => {
  const qty = toPositiveFiniteNumber(item.qty);
  const rate = toPositiveFiniteNumber(item.rate);
  const discountPercent = toClampedPercent(item.discountPercent);
  const grossItemRate = roundCurrency(qty * rate);
  const discountAmount = roundCurrency((grossItemRate * discountPercent) / 100);
  const totalItemRate = roundCurrency(Math.max(0, grossItemRate - discountAmount));

  const rule = resolveIncentiveRuleForLine(item.bcn, item.itemName);
  const isIncentivable = isIncentiveApplicableByDate && rule.isRuleMatched;
  const rawManualOverride = item.manualOverride;
  const manualPercent = isIncentivable
    ? toNonNegativeFiniteNumberOrUndefined(rawManualOverride?.incentivePercent)
    : undefined;
  const manualAmount = isIncentivable
    ? toNonNegativeFiniteNumberOrUndefined(rawManualOverride?.incentiveAmount)
    : undefined;
  const hasManualPercent = typeof manualPercent === "number";
  const hasManualAmount = typeof manualAmount === "number";
  const normalizedManualOverride =
    hasManualPercent || hasManualAmount
      ? {
          incentivePercent: hasManualPercent ? manualPercent : undefined,
          incentiveAmount: hasManualAmount ? manualAmount : undefined,
          updatedAt: rawManualOverride?.updatedAt,
          updatedBy: rawManualOverride?.updatedBy,
        }
      : undefined;

  const incentivePercent = isIncentivable
    ? hasManualPercent
      ? manualPercent
      : rule.incentivePercent
    : 0;

  const potentialIncentiveAmount = isIncentivable
    ? roundCurrency((totalItemRate * incentivePercent) / 100)
    : 0;

  const autoEligibleForPayout = isIncentivable && (!rule.requiresInStock || item.isInStock === true);
  const autoIncentiveAmount = autoEligibleForPayout ? potentialIncentiveAmount : 0;
  const incentiveAmount = hasManualAmount ? manualAmount : autoIncentiveAmount;
  const isEligibleForPayout = hasManualAmount
    ? Boolean(isIncentivable && incentiveAmount > 0)
    : autoEligibleForPayout;

  return {
    ...item,
    qty,
    rate,
    discountPercent,
    discountAmount,
    totalItemRate,
    incentivePercent,
    potentialIncentiveAmount,
    incentiveAmount,
    requiresInStock: rule.requiresInStock,
    isIncentivable,
    isEligibleForPayout,
    ruleCode: rule.ruleCode,
    matchedToken: rule.matchedToken,
    manualOverride: normalizedManualOverride,
  };
};

export const recomputeSalesmanIncentiveOrderDoc = (
  orderDoc: SalesmanIncentiveOrderDoc
): SalesmanIncentiveOrderDoc => {
  const isOrderApplicableByDate = Boolean(orderDoc.isIncentiveApplicableByDate);
  const currentLines = Array.isArray(orderDoc.fabricDetails) ? orderDoc.fabricDetails : [];

  const nextLines = currentLines.map((line, index) => {
    const normalizedLine: SalesmanIncentiveItem = {
      ...line,
      lineId: String(line.lineId || `line-${index + 1}`).trim() || `line-${index + 1}`,
      approvedStockId: String(line.approvedStockId || "").trim() || undefined,
      bcn: String(line.bcn || "").trim() || undefined,
      itemName:
        String(line.itemName || line.bcn || `Item ${index + 1}`).trim() || `Item ${index + 1}`,
      qty: toPositiveFiniteNumber(line.qty),
      rate: toPositiveFiniteNumber(line.rate),
      discountPercent: toClampedPercent(line.discountPercent),
      discountAmount: toPositiveFiniteNumber(line.discountAmount),
      isInStock: typeof line.isInStock === "boolean" ? line.isInStock : null,
    };
    return recomputeIncentiveItem(normalizedLine, isOrderApplicableByDate);
  });

  return {
    ...orderDoc,
    fabricDetails: nextLines,
    summary: summarizeIncentiveItems(nextLines),
  };
};

const summarizeIncentiveItems = (items: SalesmanIncentiveItem[]): SalesmanIncentiveOrderSummary => {
  const summary = items.reduce<NumericSummary>(
    (acc, item) => {
      acc.itemsCount += 1;
      if (item.isIncentivable) acc.incentivableItemsCount += 1;
      if (item.isEligibleForPayout) acc.eligibleItemsCount += 1;
      if (!item.requiresInStock || typeof item.isInStock === "boolean") acc.verifiedItemsCount += 1;
      if (item.isInStock === true) acc.inStockItemsCount += 1;
      acc.totalItemRate += toFiniteNumber(item.totalItemRate);
      acc.potentialIncentiveAmount += toFiniteNumber(item.potentialIncentiveAmount);
      acc.earnedIncentiveAmount += toFiniteNumber(item.incentiveAmount);
      return acc;
    },
    {
      itemsCount: 0,
      incentivableItemsCount: 0,
      eligibleItemsCount: 0,
      verifiedItemsCount: 0,
      inStockItemsCount: 0,
      totalItemRate: 0,
      potentialIncentiveAmount: 0,
      earnedIncentiveAmount: 0,
    }
  );

  return {
    itemsCount: summary.itemsCount,
    incentivableItemsCount: summary.incentivableItemsCount,
    eligibleItemsCount: summary.eligibleItemsCount,
    verifiedItemsCount: summary.verifiedItemsCount,
    inStockItemsCount: summary.inStockItemsCount,
    totalItemRate: roundCurrency(summary.totalItemRate),
    potentialIncentiveAmount: roundCurrency(summary.potentialIncentiveAmount),
    earnedIncentiveAmount: roundCurrency(summary.earnedIncentiveAmount),
  };
};

const buildIncentiveItemFromFabricDetail = (
  detail: FabricDetail,
  index: number,
  isIncentiveApplicableByDate: boolean
): SalesmanIncentiveItem => {
  const lineId = String(detail.lineId || `line-${index + 1}`).trim();
  const bcn = String(detail.bcn || detail.fabricName || "").trim() || undefined;
  const itemName =
    String(detail.itemName || detail.fabricName || detail.bcn || `Item ${index + 1}`).trim() ||
    `Item ${index + 1}`;
  const qty = toPositiveFiniteNumber(detail.quantity);
  const rate = toPositiveFiniteNumber(detail.rate);

  const item: SalesmanIncentiveItem = {
    lineId,
    approvedStockId: String(detail.approvedStockId || "").trim() || undefined,
    bcn,
    itemName,
    qty,
    rate,
    discountPercent: toClampedPercent(detail.discountPercent),
    discountAmount: 0,
    totalItemRate: roundCurrency(qty * rate),
    incentivePercent: 0,
    potentialIncentiveAmount: 0,
    incentiveAmount: 0,
    requiresInStock: false,
    isInStock:
      typeof detail.isInStock === "boolean"
        ? detail.isInStock
        : inferInStockFromStatus(detail.status),
    isIncentivable: false,
    isEligibleForPayout: false,
    ruleCode: "NONE",
  };

  return recomputeIncentiveItem(item, isIncentiveApplicableByDate);
};

const buildIncentiveItemFromOrderSection = (
  item: Record<string, unknown>,
  index: number,
  isIncentiveApplicableByDate: boolean
): SalesmanIncentiveItem => {
  const lineId = String(item.lineId || item.itemId || `line-${index + 1}`).trim();
  const bcn = String(item.bcn || item.collectionBrand || "").trim() || undefined;
  const itemName =
    String(item.description || item.salesDescription || item.collectionBrand || bcn || `Item ${index + 1}`).trim() ||
    `Item ${index + 1}`;
  const qty = toPositiveFiniteNumber(item.qty ?? item.quantity);
  const rate = toPositiveFiniteNumber(item.rate ?? item.exclusiveRate);

  const normalized: SalesmanIncentiveItem = {
    lineId,
    approvedStockId: String(item.approvedStockId || "").trim() || undefined,
    bcn,
    itemName,
    qty,
    rate,
    discountPercent: toClampedPercent(item.discountPercent),
    discountAmount: 0,
    totalItemRate: roundCurrency(qty * rate),
    incentivePercent: 0,
    potentialIncentiveAmount: 0,
    incentiveAmount: 0,
    requiresInStock: false,
    isInStock:
      typeof item.isInStock === "boolean" ? Boolean(item.isInStock) : inferInStockFromStatus(item.status),
    isIncentivable: false,
    isEligibleForPayout: false,
    ruleCode: "NONE",
  };

  return recomputeIncentiveItem(normalized, isIncentiveApplicableByDate);
};

const getSalesmanName = (order: Order, salesman?: SalesmanSnapshot) => {
  const raw = String(salesman?.name || order.salesPerson || "").trim();
  return raw || "Unknown Salesman";
};

const normalizeSalesmanCode = (salesmanCode?: string) => {
  const normalized = String(salesmanCode || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return normalized || undefined;
};

export const buildSalesmanIncentiveDocId = (salesmanName: string, salesmanCode?: string) => {
  const safeName = toSafeDocToken(salesmanName) || "unknown_salesman";
  const safeCode = normalizeSalesmanCode(salesmanCode) || "NA";
  return `${safeName}_${safeCode}`;
};

export const buildSalesmanIncentiveOrderDoc = (params: {
  order: Order;
  salesman?: SalesmanSnapshot;
  source?: string;
}): SalesmanIncentiveOrderDoc => {
  const { order, salesman, source } = params;
  const nowIso = new Date().toISOString();
  const orderDate = String(order.createdAt || order.approvedAt || nowIso);
  const isIncentiveApplicableByDate = isOrderEligibleByDate(orderDate);

  const orderId =
    String(order.id || order.orderId || order.orderNo || order.crmOrderNo || "").trim() ||
    String(order.crmOrderNo || "").trim();

  const fabricSource = Array.isArray(order.fabricDetails) ? order.fabricDetails : [];
  const sectionSource = Array.isArray(order.sections?.NORMAL?.items)
    ? (order.sections?.NORMAL?.items as Record<string, unknown>[])
    : [];

  const fabricDetails = (fabricSource.length
    ? fabricSource.map((item, index) =>
        buildIncentiveItemFromFabricDetail(item, index, isIncentiveApplicableByDate)
      )
    : sectionSource.map((item, index) =>
        buildIncentiveItemFromOrderSection(item, index, isIncentiveApplicableByDate)
      )) as SalesmanIncentiveItem[];

  const summary = summarizeIncentiveItems(fabricDetails);

  return {
    orderId,
    orderNo: String(order.orderNo || order.id || "").trim() || undefined,
    crmOrderNo: String(order.crmOrderNo || order.quotationNo || "").trim() || undefined,
    customerId: String(order.customerId || "").trim() || undefined,
    dealId: String(order.dealId || "").trim() || undefined,
    orderDate,
    createdAt: String(order.createdAt || nowIso),
    isIncentiveApplicableByDate,
    incentiveEffectiveFrom: SALESMAN_INCENTIVE_EFFECTIVE_FROM,
    customerSnapshot: {
      name: String(order.customerSnapshot?.name || order.customerName || "").trim() || undefined,
      phone: String(order.customerSnapshot?.phone || order.customerPhone || "").trim() || undefined,
      billingAddress: order.customerSnapshot?.billingAddress,
    },
    dealSnapshot: {
      dealCode: String(order.dealSnapshot?.dealCode || "").trim() || undefined,
      title: String(order.dealSnapshot?.title || "").trim() || undefined,
    },
    salesmanSnapshot: {
      id: String(salesman?.id || order.representativeId || "").trim() || undefined,
      name: getSalesmanName(order, salesman),
      salesmanCode: normalizeSalesmanCode(salesman?.salesmanCode),
    },
    fabricDetails,
    summary,
    sourceMeta: {
      source: source || "ORDER_CONVERSION",
      createdBy: order.createdBy,
    },
    updatedAt: nowIso,
  };
};

const getOrderSummaryDelta = (
  previousSummary: SalesmanIncentiveOrderSummary,
  nextSummary: SalesmanIncentiveOrderSummary
) => ({
  totalItems: nextSummary.itemsCount - previousSummary.itemsCount,
  incentivableItemsCount:
    nextSummary.incentivableItemsCount - previousSummary.incentivableItemsCount,
  eligibleItemsCount: nextSummary.eligibleItemsCount - previousSummary.eligibleItemsCount,
  verifiedItemsCount: nextSummary.verifiedItemsCount - previousSummary.verifiedItemsCount,
  inStockItemsCount: nextSummary.inStockItemsCount - previousSummary.inStockItemsCount,
  totalItemRate: roundCurrency(nextSummary.totalItemRate - previousSummary.totalItemRate),
  potentialIncentiveAmount: roundCurrency(
    nextSummary.potentialIncentiveAmount - previousSummary.potentialIncentiveAmount
  ),
  earnedIncentiveAmount: roundCurrency(
    nextSummary.earnedIncentiveAmount - previousSummary.earnedIncentiveAmount
  ),
});

const incrementSummaryByDelta = (
  delta: ReturnType<typeof getOrderSummaryDelta>,
  orderDelta: number,
  earnedOrderDelta: number
) => ({
  totalOrders: FieldValue.increment(orderDelta),
  ordersWithEarnedIncentive: FieldValue.increment(earnedOrderDelta),
  totalItems: FieldValue.increment(delta.totalItems),
  incentivableItemsCount: FieldValue.increment(delta.incentivableItemsCount),
  eligibleItemsCount: FieldValue.increment(delta.eligibleItemsCount),
  verifiedItemsCount: FieldValue.increment(delta.verifiedItemsCount),
  inStockItemsCount: FieldValue.increment(delta.inStockItemsCount),
  totalItemRate: FieldValue.increment(delta.totalItemRate),
  potentialIncentiveAmount: FieldValue.increment(delta.potentialIncentiveAmount),
  earnedIncentiveAmount: FieldValue.increment(delta.earnedIncentiveAmount),
});

export async function upsertSalesmanIncentiveOrderEntry(params: {
  order: Order;
  salesman?: SalesmanSnapshot;
  source?: string;
}) {
  const { order, salesman, source } = params;
  const preparedOrderDoc = buildSalesmanIncentiveOrderDoc({ order, salesman, source });

  const normalizedSalesman: SalesmanSnapshot = {
    id: String(salesman?.id || order.representativeId || "").trim() || undefined,
    name: getSalesmanName(order, salesman),
    salesmanCode: normalizeSalesmanCode(salesman?.salesmanCode),
  };

  return upsertSalesmanIncentivePreparedOrderEntry({
    orderDoc: preparedOrderDoc,
    salesman: normalizedSalesman,
  });
}

export async function upsertSalesmanIncentivePreparedOrderEntry(params: {
  orderDoc: SalesmanIncentiveOrderDoc;
  salesman?: SalesmanSnapshot;
}) {
  const { orderDoc, salesman } = params;
  const normalizedOrderDoc = recomputeSalesmanIncentiveOrderDoc(orderDoc);

  if (!normalizedOrderDoc.orderId) {
    return { success: false, message: "Missing orderId for incentive write." };
  }

  const salesmanName =
    String(salesman?.name || normalizedOrderDoc.salesmanSnapshot?.name || "").trim() ||
    "Unknown Salesman";
  const normalizedSalesmanCode = normalizeSalesmanCode(
    salesman?.salesmanCode || normalizedOrderDoc.salesmanSnapshot?.salesmanCode
  );
  const salesmanId =
    String(salesman?.id || normalizedOrderDoc.salesmanSnapshot?.id || "").trim() || undefined;
  const salesmanDocId = buildSalesmanIncentiveDocId(salesmanName, normalizedSalesmanCode);

  const rootRef = adminDb.collection(SALESMAN_INCENTIVE_COLLECTION).doc(salesmanDocId);
  const orderRef = rootRef
    .collection(SALESMAN_INCENTIVE_ORDERS_SUBCOLLECTION)
    .doc(normalizedOrderDoc.orderId);

  const nowIso = new Date().toISOString();
  const persistedOrderDoc: SalesmanIncentiveOrderDoc = {
    ...normalizedOrderDoc,
    salesmanSnapshot: {
      ...normalizedOrderDoc.salesmanSnapshot,
      id: salesmanId,
      name: salesmanName,
      salesmanCode: normalizedSalesmanCode,
    },
    updatedAt: nowIso,
  };
  const cleanedOrderDoc = stripUndefinedDeep(persistedOrderDoc) as SalesmanIncentiveOrderDoc;

  await adminDb.runTransaction(async (tx: any) => {
    const [rootSnap, previousOrderSnap] = await Promise.all([
      tx.get(rootRef),
      tx.get(orderRef),
    ]);

    const previousSummary = previousOrderSnap.exists
      ? normalizeOrderSummary(previousOrderSnap.data()?.summary)
      : { ...EMPTY_ORDER_SUMMARY };

    const nextSummary = normalizeOrderSummary(persistedOrderDoc.summary);
    const delta = getOrderSummaryDelta(previousSummary, nextSummary);

    const previousEarnedOrder = previousSummary.earnedIncentiveAmount > 0 ? 1 : 0;
    const nextEarnedOrder = nextSummary.earnedIncentiveAmount > 0 ? 1 : 0;

    tx.set(orderRef, cleanedOrderDoc, { merge: true });

    const rootPayload = stripUndefinedDeep({
      salesmanDetails: {
        salesmanId,
        salesmanName,
        salesmanCode: normalizedSalesmanCode,
        docId: salesmanDocId,
      },
      schema: {
        effectiveFrom: SALESMAN_INCENTIVE_EFFECTIVE_FROM,
        version: SALESMAN_INCENTIVE_SCHEMA_VERSION,
      },
      summary: {
        ...incrementSummaryByDelta(
          delta,
          previousOrderSnap.exists ? 0 : 1,
          nextEarnedOrder - previousEarnedOrder
        ),
        updatedAt: nowIso,
      },
      createdAt: rootSnap.exists ? rootSnap.data()?.createdAt || nowIso : nowIso,
      updatedAt: nowIso,
    });

    tx.set(rootRef, rootPayload, { merge: true });
  });

  return { success: true, salesmanDocId };
}

const findMatchingIncentiveLineIndex = (
  lines: SalesmanIncentiveItem[],
  params: {
    approvedStockId?: string;
    lineId?: string;
    bcn?: string;
    itemName?: string;
  }
) => {
  const approvedStockId = String(params.approvedStockId || "").trim();
  const lineId = String(params.lineId || "").trim();
  const normalizedBcn = toNormalizedToken(params.bcn);
  const normalizedName = toNormalizedToken(params.itemName);

  if (approvedStockId) {
    const byApprovedStock = lines.findIndex((line) => line.approvedStockId === approvedStockId);
    if (byApprovedStock !== -1) return byApprovedStock;
  }

  if (lineId) {
    const byLineId = lines.findIndex((line) => String(line.lineId || "").trim() === lineId);
    if (byLineId !== -1) return byLineId;
  }

  if (normalizedBcn) {
    const byBcnPending = lines.findIndex(
      (line) =>
        line.requiresInStock &&
        toNormalizedToken(line.bcn) === normalizedBcn &&
        typeof line.isInStock !== "boolean"
    );
    if (byBcnPending !== -1) return byBcnPending;

    const byBcn = lines.findIndex(
      (line) => line.requiresInStock && toNormalizedToken(line.bcn) === normalizedBcn
    );
    if (byBcn !== -1) return byBcn;
  }

  if (normalizedName) {
    const byNamePending = lines.findIndex(
      (line) =>
        line.requiresInStock &&
        toNormalizedToken(line.itemName) === normalizedName &&
        typeof line.isInStock !== "boolean"
    );
    if (byNamePending !== -1) return byNamePending;

    const byName = lines.findIndex(
      (line) => line.requiresInStock && toNormalizedToken(line.itemName) === normalizedName
    );
    if (byName !== -1) return byName;
  }

  return -1;
};

async function resolveIncentiveOrderRef(orderId: string, salesmanDocId?: string) {
  const safeOrderId = String(orderId || "").trim();
  if (!safeOrderId) return null;

  if (salesmanDocId) {
    const directRef = adminDb
      .collection(SALESMAN_INCENTIVE_COLLECTION)
      .doc(salesmanDocId)
      .collection(SALESMAN_INCENTIVE_ORDERS_SUBCOLLECTION)
      .doc(safeOrderId);
    const snap = await directRef.get();
    if (snap.exists) {
      return directRef;
    }
  }

  const byOrderId = await adminDb
    .collectionGroup(SALESMAN_INCENTIVE_ORDERS_SUBCOLLECTION)
    .where("orderId", "==", safeOrderId)
    .limit(1)
    .get();

  if (!byOrderId.empty) {
    return byOrderId.docs[0].ref;
  }

  return null;
}

export async function updateSalesmanIncentiveStockStatus(params: {
  orderId: string;
  approvedStockId?: string;
  lineId?: string;
  bcn?: string;
  itemName?: string;
  isInStock: boolean;
  source: "IN_STOCK" | "OUT_OF_STOCK";
  verifiedAt?: string;
  salesmanDocId?: string;
}) {
  const orderRef = await resolveIncentiveOrderRef(params.orderId, params.salesmanDocId);
  if (!orderRef) {
    return { success: false, updated: false, message: "Incentive order document not found." };
  }

  const rootRef = orderRef.parent.parent;
  if (!rootRef) {
    return { success: false, updated: false, message: "Incentive root document not found." };
  }

  const verifiedAt = params.verifiedAt || new Date().toISOString();

  let updated = false;

  await adminDb.runTransaction(async (tx: any) => {
    const [rootSnap, orderSnap] = await Promise.all([tx.get(rootRef), tx.get(orderRef)]);

    if (!orderSnap.exists) return;

    const orderData = orderSnap.data() as SalesmanIncentiveOrderDoc;
    const currentLines = Array.isArray(orderData.fabricDetails)
      ? orderData.fabricDetails
      : [];

    const targetIndex = findMatchingIncentiveLineIndex(currentLines, {
      approvedStockId: params.approvedStockId,
      lineId: params.lineId,
      bcn: params.bcn,
      itemName: params.itemName,
    });

    if (targetIndex === -1) return;

    const previousSummary = normalizeOrderSummary(orderData.summary);
    const isOrderApplicableByDate = Boolean(orderData.isIncentiveApplicableByDate);

    const nextLines = currentLines.map((line, index) => {
      if (index !== targetIndex) {
        return recomputeIncentiveItem(line, isOrderApplicableByDate);
      }

      const updatedLine: SalesmanIncentiveItem = {
        ...line,
        approvedStockId:
          String(line.approvedStockId || params.approvedStockId || "").trim() || undefined,
        lineId: String(line.lineId || params.lineId || `line-${index + 1}`).trim(),
        bcn: String(line.bcn || params.bcn || "").trim() || undefined,
        itemName:
          String(line.itemName || params.itemName || line.bcn || `Item ${index + 1}`).trim() ||
          `Item ${index + 1}`,
        isInStock: params.isInStock,
        stockVerifiedAt: verifiedAt,
        stockVerificationSource: params.source,
      };

      return recomputeIncentiveItem(updatedLine, isOrderApplicableByDate);
    });

    const nextSummary = summarizeIncentiveItems(nextLines);
    const delta = getOrderSummaryDelta(previousSummary, nextSummary);

    const previousEarnedOrder = previousSummary.earnedIncentiveAmount > 0 ? 1 : 0;
    const nextEarnedOrder = nextSummary.earnedIncentiveAmount > 0 ? 1 : 0;

    tx.set(
      orderRef,
      {
        fabricDetails: nextLines,
        summary: nextSummary,
        updatedAt: verifiedAt,
      },
      { merge: true }
    );

    const rootData = rootSnap.exists ? (rootSnap.data() as Partial<SalesmanIncentiveRootDoc>) : null;

    tx.set(
      rootRef,
      {
        salesmanDetails: {
          salesmanId: orderData.salesmanSnapshot?.id,
          salesmanName:
            String(
              rootData?.salesmanDetails?.salesmanName ||
                orderData.salesmanSnapshot?.name ||
                "Unknown Salesman"
            ).trim() || "Unknown Salesman",
          salesmanCode:
            rootData?.salesmanDetails?.salesmanCode || orderData.salesmanSnapshot?.salesmanCode,
          docId: rootRef.id,
        },
        schema: {
          effectiveFrom: SALESMAN_INCENTIVE_EFFECTIVE_FROM,
          version: SALESMAN_INCENTIVE_SCHEMA_VERSION,
        },
        summary: {
          ...incrementSummaryByDelta(delta, 0, nextEarnedOrder - previousEarnedOrder),
          updatedAt: verifiedAt,
        },
        createdAt: rootData?.createdAt || verifiedAt,
        updatedAt: verifiedAt,
      },
      { merge: true }
    );

    updated = true;
  });

  return {
    success: true,
    updated,
    message: updated ? "Salesman incentive stock status updated." : "No matching incentive line found.",
  };
}

export type SalesmanIncentiveDashboardRow = {
  docId: string;
  salesmanDetails: SalesmanIncentiveRootDoc["salesmanDetails"];
  summary: SalesmanIncentiveSummary;
  orders: SalesmanIncentiveOrderDoc[];
};

export type SalesmanIncentiveDashboardData = {
  effectiveFrom: string;
  schemaVersion: string;
  totals: SalesmanIncentiveSummary & { totalSalesmen: number };
  salesmen: SalesmanIncentiveDashboardRow[];
};

export async function getSalesmanIncentiveDashboardData(options?: {
  maxOrdersPerSalesman?: number;
}): Promise<SalesmanIncentiveDashboardData> {
  const maxOrdersPerSalesman = Math.max(1, Math.trunc(options?.maxOrdersPerSalesman ?? 200));

  const rootSnapshot = await adminDb.collection(SALESMAN_INCENTIVE_COLLECTION).get();

  const salesmen = await Promise.all(
    rootSnapshot.docs.map(async (doc: any) => {
      const data = (doc.data() || {}) as Partial<SalesmanIncentiveRootDoc>;
      const orderSnapshot = await doc.ref
        .collection(SALESMAN_INCENTIVE_ORDERS_SUBCOLLECTION)
        .limit(maxOrdersPerSalesman)
        .get();

      const orders = orderSnapshot.docs
        .map((orderDoc: any) => orderDoc.data() as SalesmanIncentiveOrderDoc)
        .filter((orderDoc: SalesmanIncentiveOrderDoc) => Boolean(orderDoc?.orderId))
        .sort((a: SalesmanIncentiveOrderDoc, b: SalesmanIncentiveOrderDoc) => {
          const aMs = Date.parse(String(a.orderDate || a.createdAt || 0));
          const bMs = Date.parse(String(b.orderDate || b.createdAt || 0));
          return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
        });

      return {
        docId: doc.id,
        salesmanDetails: {
          salesmanId: data.salesmanDetails?.salesmanId,
          salesmanName:
            String(data.salesmanDetails?.salesmanName || "").trim() || "Unknown Salesman",
          salesmanCode: normalizeSalesmanCode(data.salesmanDetails?.salesmanCode),
          docId: doc.id,
        },
        summary: normalizeRootSummary(data.summary),
        orders,
      } as SalesmanIncentiveDashboardRow;
    })
  );

  salesmen.sort((a, b) => {
    const earnedDelta =
      toFiniteNumber(b.summary.earnedIncentiveAmount) -
      toFiniteNumber(a.summary.earnedIncentiveAmount);
    if (earnedDelta !== 0) return earnedDelta;
    return a.salesmanDetails.salesmanName.localeCompare(b.salesmanDetails.salesmanName);
  });

  const totals = salesmen.reduce(
    (acc, row) => {
      acc.totalSalesmen += 1;
      acc.totalOrders += toFiniteNumber(row.summary.totalOrders);
      acc.ordersWithEarnedIncentive += toFiniteNumber(row.summary.ordersWithEarnedIncentive);
      acc.totalItems += toFiniteNumber(row.summary.totalItems);
      acc.incentivableItemsCount += toFiniteNumber(row.summary.incentivableItemsCount);
      acc.eligibleItemsCount += toFiniteNumber(row.summary.eligibleItemsCount);
      acc.verifiedItemsCount += toFiniteNumber(row.summary.verifiedItemsCount);
      acc.inStockItemsCount += toFiniteNumber(row.summary.inStockItemsCount);
      acc.totalItemRate += toFiniteNumber(row.summary.totalItemRate);
      acc.potentialIncentiveAmount += toFiniteNumber(row.summary.potentialIncentiveAmount);
      acc.earnedIncentiveAmount += toFiniteNumber(row.summary.earnedIncentiveAmount);
      return acc;
    },
    {
      ...EMPTY_ROOT_SUMMARY,
      totalSalesmen: 0,
    }
  );

  return {
    effectiveFrom: SALESMAN_INCENTIVE_EFFECTIVE_FROM,
    schemaVersion: SALESMAN_INCENTIVE_SCHEMA_VERSION,
    totals: {
      ...totals,
      totalOrders: Math.trunc(totals.totalOrders),
      ordersWithEarnedIncentive: Math.trunc(totals.ordersWithEarnedIncentive),
      totalItems: Math.trunc(totals.totalItems),
      incentivableItemsCount: Math.trunc(totals.incentivableItemsCount),
      eligibleItemsCount: Math.trunc(totals.eligibleItemsCount),
      verifiedItemsCount: Math.trunc(totals.verifiedItemsCount),
      inStockItemsCount: Math.trunc(totals.inStockItemsCount),
      totalItemRate: roundCurrency(totals.totalItemRate),
      potentialIncentiveAmount: roundCurrency(totals.potentialIncentiveAmount),
      earnedIncentiveAmount: roundCurrency(totals.earnedIncentiveAmount),
      totalSalesmen: Math.trunc(totals.totalSalesmen),
    },
    salesmen,
  };
}
