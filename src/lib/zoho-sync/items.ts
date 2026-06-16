import { adminDb } from "@/lib/firebase-admin";
import {
  createZohoItem,
  searchZohoItems,
  type CreateZohoItemInput,
  type ZohoItem,
} from "@/lib/zoho-books";

export const ZOHO_ITEM_MAPPINGS_COLLECTION = "zohoItemMappings";

const asText = (value: unknown) => String(value ?? "").trim();
const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function buildZohoItemInputFromStock(stock: any): CreateZohoItemInput {
  const isService = stock?.isService === true || String(stock?.category || "").toUpperCase() === "SERVICE";
  const name =
    asText(stock?.itemName) ||
    asText(stock?.name) ||
    asText(stock?.bcn) ||
    asText(stock?.id);
  const rate = asNumber(stock?.rrpWithGstRs ?? stock?.mrp ?? stock?.rate ?? stock?.rlPrice, 0);
  const purchaseRate = stock?.costPriceRs === undefined ? undefined : asNumber(stock.costPriceRs, 0);

  return {
    name,
    rate,
    sku: asText(stock?.bcn || stock?.productId || stock?.itemId) || undefined,
    unit: asText(stock?.unit) || (isService ? "PCS" : "MTR"),
    description:
      [stock?.category, stock?.supplierCollectionName, stock?.supplierCollectionCode]
        .map(asText)
        .filter(Boolean)
        .join(" | ") || undefined,
    productType: isService ? "service" : "goods",
    itemType: isService ? "sales_and_purchases" : "inventory",
    hsnOrSac: asText(stock?.hsnOrSac || stock?.hsnCode) || undefined,
    isTaxable: stock?.gstPercent !== undefined || stock?.tax !== undefined ? true : undefined,
    taxPercentage:
      stock?.gstPercent === undefined && stock?.tax === undefined
        ? undefined
        : asNumber(stock?.gstPercent ?? stock?.tax, 0),
    purchaseDescription: asText(stock?.supplierCompanyName) || undefined,
    purchaseRate,
  };
}

export async function saveZohoItemMapping(input: {
  sourceCollection: string;
  sourceId: string;
  zohoItem: ZohoItem;
}) {
  const mappingId = `${input.sourceCollection}_${input.sourceId}`.replace(/\//g, "_");
  await adminDb.collection(ZOHO_ITEM_MAPPINGS_COLLECTION).doc(mappingId).set(
    {
      sourceCollection: input.sourceCollection,
      sourceId: input.sourceId,
      zohoItemId: input.zohoItem.id,
      zohoItemName: input.zohoItem.name,
      zohoSku: input.zohoItem.sku || null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function findMappedZohoItemId(sourceCollection: string, sourceId: string) {
  const mappingId = `${sourceCollection}_${sourceId}`.replace(/\//g, "_");
  const snap = await adminDb.collection(ZOHO_ITEM_MAPPINGS_COLLECTION).doc(mappingId).get();
  return asText(snap.data()?.zohoItemId) || null;
}

export async function createZohoItemFromStock(
  stockId: string,
  stock: any,
  sourceCollection = "stocks"
) {
  const item = await createZohoItem(buildZohoItemInputFromStock({ id: stockId, ...stock }));
  await saveZohoItemMapping({ sourceCollection, sourceId: stockId, zohoItem: item });
  return item;
}

export async function resolveZohoItemForStock(stockId: string, stock: any, usage: "sales" | "purchase") {
  const existing =
    asText(stock?.zohoItemId) ||
    asText(stock?.zohoId) ||
    (await findMappedZohoItemId("stocks", stockId));
  if (existing) return existing;

  const query = asText(stock?.bcn || stock?.itemName || stock?.name);
  if (query) {
    const matches = await searchZohoItems(query, { usage, limit: 10 });
    const exact = matches.find(
      (item) =>
        asText(item.sku).toLowerCase() === asText(stock?.bcn).toLowerCase() ||
        asText(item.name).toLowerCase() === asText(stock?.itemName || stock?.name).toLowerCase()
    );
    const picked = exact || matches[0];
    if (picked?.id) {
      await saveZohoItemMapping({ sourceCollection: "stocks", sourceId: stockId, zohoItem: picked });
      return picked.id;
    }
  }

  const created = await createZohoItemFromStock(stockId, stock);
  return created.id;
}
