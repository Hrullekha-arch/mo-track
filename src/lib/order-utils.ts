import { Order } from "@/lib/types";
import { OrderItem } from "@/types/order-items";

export const parseQtyValue = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeItemKey = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export const formatLabelQty = (qty: number): string => {
  if (!Number.isFinite(qty)) return "0";
  return qty.toFixed(2).replace(/\.?0+$/, "");
};

export const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const getBcnFromItem = (item: OrderItem): string => {
  const name =
    (item as any).fabricName || (item as any).furnitureName || "";
  return name.split(" - ")[0]?.trim() || "";
};

export const getItemName = (item: OrderItem): string =>
  (item as any).fabricName || (item as any).furnitureName || "";

export const getItemQty = (item: OrderItem): number =>
  parseFloat((item as any).quantity || "0");

/** Aggregate items deduplicating by BCN */
export const aggregateItems = (order: Order): OrderItem[] => {
  const allItems: OrderItem[] = [
    ...(order.fabricDetails || []).map((d) => ({
      ...d,
      type: "Fabric" as const,
    })),
    ...(order.furnitureDetails || []).map((d) => ({
      ...d,
      type: "Furniture" as const,
    })),
  ];

  const map = new Map<string, OrderItem & { quantity: string }>();
  for (const item of allItems) {
    const bcn = getItemName(item);
    if (!bcn) continue;
    if (map.has(bcn)) {
      const existing = map.get(bcn)!;
      (existing as any).quantity = (
        parseFloat((existing as any).quantity) +
        parseFloat((item as any).quantity)
      ).toString();
    } else {
      map.set(bcn, { ...item });
    }
  }
  return Array.from(map.values());
};

export const getAllocatedItemsForLabels = (order: Order) => {
  const itemsByKey = new Map<
    string,
    { bcn: string; itemName: string; qty: number; unit: string }
  >();

  const normalItems = order.sections?.NORMAL?.items || [];
  normalItems.forEach((item: any) => {
    const bcn = String(item?.bcn || "").trim();
    const itemName = String(
      item?.description || item?.itemName || bcn || ""
    ).trim();
    const lengths = Array.isArray(item?.allocation?.lengths)
      ? item.allocation.lengths
      : [];
    const lots = Array.isArray(item?.allocation?.lots)
      ? item.allocation.lots
      : [];
    const allocatedQty = [...lengths, ...lots].reduce(
      (sum: number, entry: any) => sum + parseQtyValue(entry?.allocatedQty),
      0
    );
    if (allocatedQty <= 0) return;
    const key = normalizeItemKey(bcn || itemName);
    if (!key) return;
    const existing = itemsByKey.get(key);
    if (existing) {
      existing.qty += allocatedQty;
      return;
    }
    itemsByKey.set(key, {
      bcn: bcn || itemName.split(" - ")[0] || "N/A",
      itemName: itemName || bcn || "N/A",
      qty: allocatedQty,
      unit: String(item?.unit || "Mtr"),
    });
  });

  if (itemsByKey.size > 0) return Array.from(itemsByKey.values());

  (order.fabricDetails || []).forEach((fabricItem: any) => {
    if (String(fabricItem?.status || "").toLowerCase() !== "allocated") return;
    const rawName = String(fabricItem?.fabricName || "").trim();
    if (!rawName) return;
    const bcn = rawName.split(" - ")[0]?.trim() || rawName;
    const key = normalizeItemKey(bcn);
    const qty = parseQtyValue(fabricItem?.quantity);
    if (!key || qty <= 0) return;
    const existing = itemsByKey.get(key);
    if (existing) {
      existing.qty += qty;
      return;
    }
    itemsByKey.set(key, { bcn, itemName: rawName, qty, unit: "Mtr" });
  });

  return Array.from(itemsByKey.values());
};