import { zohoBooksRequest } from "./request";

export type ZohoInventoryAdjustmentLine = {
  itemId: string;
  quantityAdjusted: number;
  rate?: number;
  description?: string;
};

const asText = (value: unknown) => String(value ?? "").trim();

export async function createZohoInventoryAdjustment(input: {
  date: string;
  reason?: string;
  description?: string;
  referenceNumber?: string;
  lineItems: ZohoInventoryAdjustmentLine[];
}) {
  const lineItems = input.lineItems
    .map((line) => {
      const quantity = Number(line.quantityAdjusted);
      if (!asText(line.itemId) || !Number.isFinite(quantity) || quantity === 0) return null;
      const payload: Record<string, unknown> = {
        item_id: asText(line.itemId),
        quantity_adjusted: quantity,
      };
      if (Number.isFinite(Number(line.rate))) payload.rate = Number(line.rate);
      if (asText(line.description)) payload.description = asText(line.description);
      return payload;
    })
    .filter((line): line is Record<string, unknown> => !!line);

  if (!lineItems.length) throw new Error("No valid stock adjustment lines found.");

  const payload = {
    date: input.date,
    reason: asText(input.reason) || "Stock Update",
    description: asText(input.description) || undefined,
    reference_number: asText(input.referenceNumber) || undefined,
    line_items: lineItems,
  };

  const data = await zohoBooksRequest<{ inventory_adjustment?: any; inventoryadjustment?: any }>(
    "/inventoryadjustments",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  const adjustment = data.inventory_adjustment || data.inventoryadjustment || {};
  const id = asText(adjustment.inventory_adjustment_id || adjustment.inventoryadjustment_id);
  const number = asText(adjustment.inventory_adjustment_number || adjustment.inventoryadjustment_number);
  if (!id) throw new Error("Zoho did not return a valid stock adjustment response.");
  return { id, number };
}

