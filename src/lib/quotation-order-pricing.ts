import type { Order, OrderItem, OrderSectionSummary, Quotation } from "@/lib/types";

type GstMode = "EXCL" | "INCL";
export type PricingSection = "NORMAL" | "VAS";
export type PricingReconciliationScope = PricingSection | "ALL";

export type QuotationOrderPricing = {
  rawNormalItems: any[];
  rawVasItems: any[];
  normalItems: OrderItem[];
  vasItems: OrderItem[];
  normalSummary: OrderSectionSummary;
  vasSummary: OrderSectionSummary;
  sections: {
    NORMAL: { items: OrderItem[]; summary: OrderSectionSummary };
    VAS: { items: OrderItem[]; summary: OrderSectionSummary };
  };
  overallSummary: {
    goodsTotal: number;
    vasTotal: number;
    grandTotal: number;
  };
};

export type PricingReconciliationResult = {
  ok: boolean;
  issues: string[];
  details: PricingReconciliationDetail[];
};

export type PricingReconciliationDetail = {
  section: PricingSection | "ORDER" | "QUOTATION";
  product: string;
  field: string;
  orderValue: number | string;
  quotationValue: number | string;
  difference?: number;
  reason: string;
  message: string;
};

export type OrderPricingUpdateResult =
  | {
      ok: true;
      patch: Partial<Order>;
    }
  | {
      ok: false;
      message: string;
    };

const moneyTolerance = 0.05;
const quantityTolerance = 0.001;
const percentTolerance = 0.001;

const numberValue = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const optionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const textValue = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text || undefined;
};

const upperText = (value: unknown): string | undefined => {
  const text = textValue(value);
  return text?.toUpperCase();
};

const compactObject = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T;

const resolveItemType = (item: any, section: PricingSection): string => {
  if (section === "VAS") return "VAS";
  const raw = String(
    item?.type || item?.itemType || item?.productType || item?.bcnType || ""
  )
    .trim()
    .toUpperCase();
  if (raw.includes("HARDWARE")) return "HARDWARE";
  if (raw.includes("CHANNEL")) return "CHANNEL";
  if (raw.includes("ACCESSORY")) return "ACCESSORY";
  if (raw.includes("VAS")) return "VAS";
  return "FABRIC";
};

const resolveItemUnit = (item: any, itemType: string): string => {
  const unit = upperText(item?.unit || item?.stockUnit);
  if (unit) return unit;
  return itemType === "FABRIC" ? "MTR" : "PCS";
};

const resolveGstMode = (
  item: any,
  qty: number,
  inputRate: number,
  gstPercent: number,
  fallback: GstMode
): GstMode => {
  const explicitMode = String(item?.gstMode ?? item?.gstType ?? "")
    .trim()
    .toUpperCase();
  if (explicitMode === "EXCL" || explicitMode === "INCL") return explicitMode;
  if (gstPercent <= 0) return fallback;

  const storedExclusiveRate = optionalNumber(item?.exclusiveRate);
  if (storedExclusiveRate !== undefined && inputRate > 0) {
    const tolerance = Math.max(0.01, inputRate * 0.001);
    return Math.abs(storedExclusiveRate - inputRate) <= tolerance ? "EXCL" : "INCL";
  }

  const storedTotal = optionalNumber(
    item?.totalAmount ?? item?.total ?? item?.amount
  );
  if (storedTotal !== undefined && qty > 0 && inputRate > 0) {
    const discountPercent = numberValue(
      item?.discountPercent ?? item?.discount
    );
    const discountedBase = qty * inputRate * (1 - discountPercent / 100);
    const inclusiveTotal = discountedBase;
    const exclusiveTotal = discountedBase * (1 + gstPercent / 100);
    return Math.abs(storedTotal - exclusiveTotal) <
      Math.abs(storedTotal - inclusiveTotal)
      ? "EXCL"
      : "INCL";
  }

  return fallback;
};

const mapQuotationItem = (
  item: any,
  section: PricingSection
): OrderItem => {
  const itemType = resolveItemType(item, section);
  const qty = numberValue(item?.qty ?? item?.quantity);
  const gst = numberValue(item?.gst ?? item?.gstPercent);
  const discountPercent = numberValue(
    item?.discountPercent ?? item?.discount
  );
  const inputRate = numberValue(
    item?.rate ?? item?.originalMrp ?? item?.mrp ?? item?.unitPrice
  );
  const gstMode = resolveGstMode(
    item,
    qty,
    inputRate,
    gst,
    section === "VAS" ? "EXCL" : "INCL"
  );
  const storedExclusiveRate = optionalNumber(item?.exclusiveRate);
  const exclusiveRate =
    inputRate > 0
      ? gstMode === "INCL" && gst > 0
        ? inputRate / (1 + gst / 100)
        : inputRate
      : storedExclusiveRate ?? 0;
  const grossAmount = exclusiveRate * qty;
  const discountAmount = grossAmount * (discountPercent / 100);
  const taxableAmount = Math.max(0, grossAmount - discountAmount);
  const gstAmount = taxableAmount * (gst / 100);
  const totalAmount = taxableAmount + gstAmount;

  return compactObject({
    roomName: textValue(item?.roomName ?? item?.room),
    type: itemType,
    category: textValue(
      item?.category ?? item?.categoryGroup ?? item?.subCategory
    ),
    itemId: textValue(item?.itemId ?? item?.id),
    bcn: textValue(item?.bcn ?? item?.collectionBrand),
    description: textValue(
      item?.description ??
        item?.salesDescription ??
        item?.vasName ??
        item?.itemName ??
        item?.collectionBrand
    ),
    unit: resolveItemUnit(item, itemType),
    rate: exclusiveRate,
    exclusiveRate,
    discountPercent,
    discountAmount,
    qty,
    gst,
    gstMode,
    hsn: textValue(item?.hsn ?? item?.hsnCode),
    group: textValue(
      item?.group ?? item?.categoryGroup ?? item?.productSource
    ),
    taxableAmount,
    gstAmount,
    totalAmount,
    allocation:
      section === "NORMAL"
        ? {
            status: "PENDING" as const,
            lengths: [],
            lots: [],
          }
        : undefined,
  });
};

export const summarizeOrderItems = (
  items: Array<{
    taxableAmount?: number;
    gstAmount?: number;
    totalAmount?: number;
  }>
): OrderSectionSummary =>
  items.reduce(
    (summary, item) => ({
      subTotal: numberValue(summary.subTotal) + numberValue(item.taxableAmount),
      gstTotal: numberValue(summary.gstTotal) + numberValue(item.gstAmount),
      grandTotal: numberValue(summary.grandTotal) + numberValue(item.totalAmount),
    }),
    { subTotal: 0, gstTotal: 0, grandTotal: 0 }
  );

export const extractQuotationPricingItems = (quotation: any) => {
  const sectionNormalItems = Array.isArray(quotation?.sections?.NORMAL?.items)
    ? quotation.sections.NORMAL.items
    : [];
  const sectionVasItems = Array.isArray(quotation?.sections?.VAS?.items)
    ? quotation.sections.VAS.items
    : [];
  return {
    rawNormalItems:
      sectionNormalItems.length > 0
        ? sectionNormalItems
        : Array.isArray(quotation?.items)
          ? quotation.items
          : [],
    rawVasItems:
      sectionVasItems.length > 0
        ? sectionVasItems
        : Array.isArray(quotation?.vasDetails)
          ? quotation.vasDetails
          : [],
  };
};

export const buildOrderPricingFromQuotation = (
  quotation: Quotation | Record<string, unknown>
): QuotationOrderPricing => {
  const { rawNormalItems, rawVasItems } =
    extractQuotationPricingItems(quotation);
  const normalItems = rawNormalItems.map((item: any) =>
    mapQuotationItem(item, "NORMAL")
  );
  const vasItems = rawVasItems.map((item: any) =>
    mapQuotationItem(item, "VAS")
  );
  const normalSummary = summarizeOrderItems(normalItems);
  const vasSummary = summarizeOrderItems(vasItems);
  const overallSummary = {
    goodsTotal: numberValue(normalSummary.grandTotal),
    vasTotal: numberValue(vasSummary.grandTotal),
    grandTotal:
      numberValue(normalSummary.grandTotal) +
      numberValue(vasSummary.grandTotal),
  };

  return {
    rawNormalItems,
    rawVasItems,
    normalItems,
    vasItems,
    normalSummary,
    vasSummary,
    sections: {
      NORMAL: { items: normalItems, summary: normalSummary },
      VAS: { items: vasItems, summary: vasSummary },
    },
    overallSummary,
  };
};

const normalizeIdentity = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const itemIdentity = (item: any, section: PricingSection): string => {
  const itemId = normalizeIdentity(item?.itemId ?? item?.id);
  const bcn = normalizeIdentity(item?.bcn ?? item?.collectionBrand);
  const description = normalizeIdentity(
    item?.description ??
      item?.salesDescription ??
      item?.vasName ??
      item?.itemName
  );
  // Item IDs and room labels can change when older quotations are converted.
  // BCN is the stable commercial identity; description and ID are fallbacks.
  return [section, bcn || description || itemId].join("|");
};

const hasCommittedAllocation = (item: any): boolean => {
  const allocation = item?.allocation;
  if (!allocation || typeof allocation !== "object") return false;
  const status = String(allocation.status || "").trim().toUpperCase();
  if (status && status !== "PENDING") return true;
  return (
    (Array.isArray(allocation.lengths) && allocation.lengths.length > 0) ||
    (Array.isArray(allocation.lots) && allocation.lots.length > 0)
  );
};

const preserveNormalAllocations = (
  currentItems: any[],
  nextItems: OrderItem[]
): OrderPricingUpdateResult | OrderItem[] => {
  const currentGroups = new Map<string, any[]>();
  currentItems.forEach((item) => {
    const key = itemIdentity(item, "NORMAL");
    currentGroups.set(key, [...(currentGroups.get(key) || []), item]);
  });

  const usedCurrentItems = new Set<any>();
  const mergedItems = nextItems.map((nextItem) => {
    const key = itemIdentity(nextItem, "NORMAL");
    const currentItem = (currentGroups.get(key) || []).find(
      (item) => !usedCurrentItems.has(item)
    );
    if (!currentItem) return nextItem;
    usedCurrentItems.add(currentItem);

    if (
      hasCommittedAllocation(currentItem) &&
      Math.abs(numberValue(currentItem?.qty) - numberValue(nextItem?.qty)) >
        quantityTolerance
    ) {
      return {
        ok: false as const,
        message:
          `${nextItem.bcn || nextItem.description || "Item"} already has stock allocation. ` +
          "Release its allocation before changing quantity.",
      };
    }

    return currentItem?.allocation
      ? { ...nextItem, allocation: currentItem.allocation }
      : nextItem;
  });

  const blockedResult = mergedItems.find(
    (item): item is Extract<OrderPricingUpdateResult, { ok: false }> =>
      Boolean(item && typeof item === "object" && "ok" in item && item.ok === false)
  );
  if (blockedResult) return blockedResult;

  const removedAllocatedItem = currentItems.find(
    (item) => !usedCurrentItems.has(item) && hasCommittedAllocation(item)
  );
  if (removedAllocatedItem) {
    return {
      ok: false,
      message:
        `${removedAllocatedItem.bcn || removedAllocatedItem.description || "Item"} already has stock allocation. ` +
        "Release its allocation before removing the item.",
    };
  }

  return mergedItems as OrderItem[];
};

export const buildOrderPricingUpdateFromQuotation = (
  order: Order,
  quotation: Quotation | Record<string, unknown>
): OrderPricingUpdateResult => {
  const pricing = buildOrderPricingFromQuotation(quotation);
  const currentNormalItems = Array.isArray(order.sections?.NORMAL?.items)
    ? order.sections.NORMAL.items
    : [];
  const normalItemsResult = preserveNormalAllocations(
    currentNormalItems,
    pricing.normalItems
  );
  if (!Array.isArray(normalItemsResult)) return normalItemsResult;

  const normalSummary = summarizeOrderItems(normalItemsResult);
  const overallSummary = {
    goodsTotal: numberValue(normalSummary.grandTotal),
    vasTotal: numberValue(pricing.vasSummary.grandTotal),
    grandTotal:
      numberValue(normalSummary.grandTotal) +
      numberValue(pricing.vasSummary.grandTotal),
  };
  const legacyFabricDetails = normalItemsResult.map((item, index) => {
    const currentLegacy = (Array.isArray(order.fabricDetails)
      ? order.fabricDetails
      : []
    ).find((entry: any) => {
      const entryBcn = normalizeIdentity(
        entry?.bcn ?? entry?.fabricName ?? entry?.itemName
      );
      return entryBcn === normalizeIdentity(item.bcn ?? item.description);
    });
    return compactObject({
      ...(currentLegacy || {}),
      lineId: textValue(item.itemId) || `line-${index + 1}`,
      bcn: textValue(item.bcn ?? item.description) || "N/A",
      itemName: textValue(item.description ?? item.bcn) || "N/A",
      fabricName: textValue(item.bcn ?? item.description) || "N/A",
      quantity: String(numberValue(item.qty)),
      rate: numberValue(item.exclusiveRate ?? item.rate),
      discountPercent: numberValue(item.discountPercent),
      status: currentLegacy?.status || "pending for po",
      isInStock: currentLegacy?.isInStock ?? null,
    });
  });

  return {
    ok: true,
    patch: {
      sections: {
        NORMAL: { items: normalItemsResult, summary: normalSummary },
        VAS: pricing.sections.VAS,
      },
      overallSummary,
      totalAmount: overallSummary.grandTotal,
      fabricDetails: legacyFabricDetails,
      vasDetails: Array.isArray((quotation as any).vasDetails)
        ? (quotation as any).vasDetails
        : [],
      invoicing: {
        ...(order.invoicing || {}),
        canCreateGoodsInvoice: normalItemsResult.length > 0,
        canCreateVasInvoice: pricing.vasItems.length > 0,
      },
    },
  };
};

const compareNumber = (
  issues: string[],
  details: PricingReconciliationDetail[],
  section: PricingReconciliationDetail["section"],
  label: string,
  field: string,
  orderValue: number,
  quotationValue: number,
  tolerance: number,
  reason: string
) => {
  if (Math.abs(orderValue - quotationValue) <= tolerance) return;
  const message = `${label}: ${field} is ${orderValue.toFixed(2)} in the order but ${quotationValue.toFixed(2)} in the quotation.`;
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

const reconcileSection = (
  issues: string[],
  details: PricingReconciliationDetail[],
  section: PricingSection,
  orderItems: any[],
  quotationItems: OrderItem[]
) => {
  const orderGroups = new Map<string, any[]>();
  orderItems.forEach((item) => {
    const key = itemIdentity(item, section);
    orderGroups.set(key, [...(orderGroups.get(key) || []), item]);
  });

  const quotationGroups = new Map<string, OrderItem[]>();
  quotationItems.forEach((item) => {
    const key = itemIdentity(item, section);
    quotationGroups.set(key, [...(quotationGroups.get(key) || []), item]);
  });

  const allKeys = new Set([...orderGroups.keys(), ...quotationGroups.keys()]);
  allKeys.forEach((key) => {
    const orderGroup = orderGroups.get(key) || [];
    const quotationGroup = quotationGroups.get(key) || [];
    const sample = quotationGroup[0] || orderGroup[0] || {};
    const label =
      textValue(sample.bcn) ||
      textValue(sample.description) ||
      `${section} item`;

    if (orderGroup.length !== quotationGroup.length) {
      const message = `${label}: order has ${orderGroup.length} line(s), quotation has ${quotationGroup.length}.`;
      issues.push(message);
      details.push({
        section,
        product: label,
        field: "line count",
        orderValue: orderGroup.length,
        quotationValue: quotationGroup.length,
        difference: orderGroup.length - quotationGroup.length,
        reason: "Product lines were added, removed, or grouped differently during conversion.",
        message,
      });
      return;
    }

    const sortLines = (items: any[]) =>
      [...items].sort((left, right) => {
        const leftSignature = [
          numberValue(left?.qty ?? left?.quantity),
          numberValue(left?.exclusiveRate ?? left?.rate),
          numberValue(left?.gst ?? left?.gstPercent),
          numberValue(left?.discountPercent ?? left?.discount),
        ].join("|");
        const rightSignature = [
          numberValue(right?.qty ?? right?.quantity),
          numberValue(right?.exclusiveRate ?? right?.rate),
          numberValue(right?.gst ?? right?.gstPercent),
          numberValue(right?.discountPercent ?? right?.discount),
        ].join("|");
        return leftSignature.localeCompare(rightSignature);
      });

    const sortedOrder = sortLines(orderGroup);
    const sortedQuotation = sortLines(quotationGroup);
    sortedQuotation.forEach((quotationItem, index) => {
      const orderItem = sortedOrder[index];
      compareNumber(
        issues,
        details,
        section,
        label,
        "quantity",
        numberValue(orderItem?.qty ?? orderItem?.quantity),
        numberValue(quotationItem.qty),
        quantityTolerance,
        "Quantity changed after the quotation was converted."
      );
      compareNumber(
        issues,
        details,
        section,
        label,
        "rate before GST",
        numberValue(orderItem?.exclusiveRate ?? orderItem?.rate),
        numberValue(quotationItem.exclusiveRate),
        moneyTolerance,
        "The base rate used by the order differs from the converted quotation."
      );
      compareNumber(
        issues,
        details,
        section,
        label,
        "discount %",
        numberValue(orderItem?.discountPercent ?? orderItem?.discount),
        numberValue(quotationItem.discountPercent),
        percentTolerance,
        "The discount percentage changed after conversion."
      );
      compareNumber(
        issues,
        details,
        section,
        label,
        "GST %",
        numberValue(orderItem?.gst ?? orderItem?.gstPercent),
        numberValue(quotationItem.gst),
        percentTolerance,
        "The GST percentage differs between the order and quotation."
      );
      compareNumber(
        issues,
        details,
        section,
        label,
        "taxable amount",
        numberValue(orderItem?.taxableAmount ?? orderItem?.taxableAmt),
        numberValue(quotationItem.taxableAmount),
        moneyTolerance,
        "Taxable value changed because of rate, discount, quantity, or GST-mode differences."
      );
      compareNumber(
        issues,
        details,
        section,
        label,
        "GST amount",
        numberValue(orderItem?.gstAmount),
        numberValue(quotationItem.gstAmount),
        moneyTolerance,
        "GST calculation differs from the converted quotation."
      );
      compareNumber(
        issues,
        details,
        section,
        label,
        "line total",
        numberValue(orderItem?.totalAmount),
        numberValue(quotationItem.totalAmount),
        moneyTolerance,
        "The final product value differs after quantity, rate, discount, and GST."
      );

      const orderMode = upperText(orderItem?.gstMode ?? orderItem?.gstType);
      if (orderMode && orderMode !== quotationItem.gstMode) {
        const message = `${label}: GST mode is ${orderMode} in the order but ${quotationItem.gstMode} in the quotation.`;
        issues.push(message);
        details.push({
          section,
          product: label,
          field: "GST mode",
          orderValue: orderMode,
          quotationValue: quotationItem.gstMode,
          reason:
            "Inclusive and exclusive GST modes calculate taxable value and line total differently.",
          message,
        });
      }
    });
  });
};

export const reconcileOrderPricingWithQuotation = (
  order: Order,
  quotation: Quotation,
  scope: PricingReconciliationScope = "ALL"
): PricingReconciliationResult => {
  const expected = buildOrderPricingFromQuotation(quotation);
  const orderNormalItems = Array.isArray(order.sections?.NORMAL?.items)
    ? order.sections.NORMAL.items
    : [];
  const orderVasItems = Array.isArray(order.sections?.VAS?.items)
    ? order.sections.VAS.items
    : [];
  const issues: string[] = [];
  const details: PricingReconciliationDetail[] = [];

  if (scope === "ALL" || scope === "NORMAL") {
    reconcileSection(issues, details, "NORMAL", orderNormalItems, expected.normalItems);
    compareNumber(
      issues,
      details,
      "ORDER",
      "Order",
      "goods total",
      numberValue(order.overallSummary?.goodsTotal),
      expected.overallSummary.goodsTotal,
      moneyTolerance,
      "One or more Goods product values differ from the converted quotation."
    );
  }

  if (scope === "ALL" || scope === "VAS") {
    reconcileSection(issues, details, "VAS", orderVasItems, expected.vasItems);
    compareNumber(
      issues,
      details,
      "ORDER",
      "Order",
      "VAS total",
      numberValue(order.overallSummary?.vasTotal),
      expected.overallSummary.vasTotal,
      moneyTolerance,
      "One or more VAS product values differ from the converted quotation."
    );
  }

  if (scope === "ALL") {
    compareNumber(
      issues,
      details,
      "ORDER",
      "Order",
      "grand total",
      numberValue(order.overallSummary?.grandTotal ?? order.totalAmount),
      expected.overallSummary.grandTotal,
      moneyTolerance,
      "Goods or VAS values differ from the converted quotation."
    );
  }

  const quotationTotal = optionalNumber(quotation.totalAmount);
  if (
    scope === "ALL" &&
    quotationTotal !== undefined &&
    Math.abs(expected.overallSummary.grandTotal - quotationTotal) > 1
  ) {
    const message = `Quotation total ${quotationTotal.toFixed(2)} does not match its item total ${expected.overallSummary.grandTotal.toFixed(2)}.`;
    issues.push(message);
    details.push({
      section: "QUOTATION",
      product: "Quotation",
      field: "stored total",
      orderValue: expected.overallSummary.grandTotal,
      quotationValue: quotationTotal,
      difference: expected.overallSummary.grandTotal - quotationTotal,
      reason: "The quotation's stored total does not equal the sum of its product lines.",
      message,
    });
  }

  return { ok: issues.length === 0, issues, details };
};
