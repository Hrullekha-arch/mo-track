import { DealProduct, DealProductsDoc } from "@/lib/types";

const toText = (value: unknown) => String(value ?? "").trim();
const normalizeType = (value?: string) => {
  const text = toText(value);
  return text ? text.toUpperCase() : "";
};

const inferProductSource = (typeHint?: string) => {
  const text = toText(typeHint).toLowerCase();
  if (text.includes("wall")) return "wallpaper";
  if (text.includes("floor")) return "flooring";
  if (text.includes("hardware") || text.includes("accessory") || text.includes("channel"))
    return "Hardware";
  return "fabric";
};

const inferProductType = (typeHint?: string, isVas?: boolean) => {
  if (isVas) return "VAS";
  const normalized = normalizeType(typeHint);
  if (
    normalized.includes("HARDWARE") ||
    normalized.includes("ACCESSORY") ||
    normalized.includes("CHANNEL")
  ) {
    return "Hardware";
  }
  if (!normalized) return "fabric";
  return normalized.toLowerCase();
};

export const mapDealProductsDocToUi = (
  doc?: DealProductsDoc | null
): DealProduct[] => {
  if (!doc?.sections) return [];
  const normalItems = doc.sections.NORMAL?.items || [];
  const vasItems = doc.sections.VAS?.items || [];

  const mapItem = (item: any, index: number, isVas: boolean) => {
    const meta = item?.meta && typeof item.meta === "object" ? item.meta : {};
    const id = item?.meta?.id;
    const type = normalizeType(item?.type);
    const productType = inferProductType(type, isVas);
    const productSource =
      productType === "Hardware"
        ? "Hardware"
        : inferProductSource(type || item?.category || item?.group);
    const bcn = toText(item?.bcn);
    const description = toText(item?.description);
    const category = toText(item?.category);
    const group = toText(item?.group);
    const itemName = toText(item?.itemName);
    const rate =
      typeof item?.rate === "number" ? item.rate : Number(item?.rate);
    const qty = item?.qty ?? "";
    const unit = toText(item?.unit);
    const labelBase = bcn || description || itemName || `item-${index}`;

    return {
      ...(meta as any),
      id: id,
      collectionBrand: isVas
        ? description || category || "VAS"
        : bcn || description || itemName || "N/A",
      salesDescription: description || category || group,
      quantity: qty === "" || qty === null || qty === undefined ? "" : String(qty),
      rate: Number.isFinite(rate) ? rate : undefined,
      mrp: Number.isFinite(rate) ? String(rate) : undefined,
      room: toText(item?.roomName),
      productType,
      productSource,
      productCategory: category || group || productType,
      subCategory: description || category || group,
      VasType: isVas ? group || category || "" : undefined,
      itemName: itemName || undefined,
      bcn: bcn || undefined,
      unit: unit || undefined,
      gstPercent: item?.gst ?? undefined,
      hsnOrSac: item?.hsn || undefined,
      category: category || undefined,
      group: group || undefined,
    } as DealProduct;
  };

  return [
    ...normalItems.map((item, index) => mapItem(item, index, false)),
    ...vasItems.map((item, index) => mapItem(item, index, true)),
  ];
};

export const getProductKey = (p: any, index?: number) =>
  p.id || p.collectionBrand || p.label || p.bcn || p.rrpWithGstRs || p.type || `${index}`;