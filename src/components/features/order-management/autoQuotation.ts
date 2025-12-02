import { getSelectionsForDeal, createQuotationAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";


export async function generateQuotationFromSelection(
  dealId: string,
  selectionId?: string
) {
  if (!selectionId) return;

  // Fetch selection data
  const selections = await getSelectionsForDeal("", dealId);


  if (!selection || !selection.products) return;

  // Prepare items for quotation
  const items = selection.products.map((item: any) => ({
    room: item.room,
    bcn: item.collectionBrand,
    qty: Number(item.quantity || item.noOfBlind || 1),
    mrp: Number(item.mrp || 0),
    description: item.salesDescription || "",
  }));

  // Create quotation
  return await createQuotationAction(dealId, {
    items,
    generatedAt: new Date().toISOString(),
    selectionId,
  });
}
