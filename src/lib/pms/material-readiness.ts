const READY_MATERIAL_STATUSES = new Set([
  "in stock",
  "allocated",
  "received",
  "completed",
]);

type PendingMaterialItem = {
  name: string;
  status: string;
};

const normalizeMaterialStatus = (value: unknown) => String(value || "").trim().toLowerCase();

const collectOrderMaterialItems = (order?: any): PendingMaterialItem[] => {
  if (!order) return [];

  const items: PendingMaterialItem[] = [];

  (Array.isArray(order.fabricDetails) ? order.fabricDetails : []).forEach((item: any) => {
    items.push({
      name: String(item?.fabricName || item?.itemName || item?.bcn || "Fabric Item").trim(),
      status: normalizeMaterialStatus(item?.status) || "pending receipt",
    });
  });

  (Array.isArray(order.furnitureDetails) ? order.furnitureDetails : []).forEach((item: any) => {
    const rawStatus = normalizeMaterialStatus(item?.status);
    if (!rawStatus && !item?.poNumber && !item?.expectedDeliveryDate) return;
    items.push({
      name: String(item?.furnitureName || item?.itemName || item?.bcn || "Furniture Item").trim(),
      status: rawStatus || "pending receipt",
    });
  });

  return items;
};

export const getPendingMaterialItemsForPms = (order?: any): PendingMaterialItem[] =>
  collectOrderMaterialItems(order).filter((item) => !READY_MATERIAL_STATUSES.has(item.status));

export const isOrderMaterialReadyForPms = (order?: any): boolean =>
  getPendingMaterialItemsForPms(order).length === 0;

export const getMaterialReadinessMessageForPms = (order?: any): string => {
  const pendingItems = getPendingMaterialItemsForPms(order);
  if (pendingItems.length === 0) return "";

  const preview = pendingItems
    .slice(0, 3)
    .map((item) => `${item.name} (${item.status})`)
    .join(", ");
  const suffix = pendingItems.length > 3 ? ` +${pendingItems.length - 3} more` : "";
  return `Material not received yet: ${preview}${suffix}`;
};
