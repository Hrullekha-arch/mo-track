"use server";

import type { BomCheckpoint } from "@/types";

const MOCK_BOM_LINES: BomCheckpoint[] = [
  {
    id: "bom-101",
    orderId: "mdf-1001",
    code: "RM-101",
    material: "Seasoned Oak Wood",
    requiredQty: "2.5 cft",
    available: true,
    location: "Rack A1",
  },
  {
    id: "bom-102",
    orderId: "mdf-1001",
    code: "RM-205",
    material: "Premium Upholstery Fabric",
    requiredQty: "5 meter",
    available: true,
    location: "Fabric Bay 3",
  },
  {
    id: "bom-103",
    orderId: "mdf-1002",
    code: "RM-318",
    material: "Foam Sheet 40D",
    requiredQty: "2 sheet",
    available: false,
    location: "Waiting Purchase",
  },
  {
    id: "bom-104",
    orderId: "mdf-1002",
    code: "RM-411",
    material: "Walnut Polish",
    requiredQty: "1 liter",
    available: true,
    location: "Finish Store",
  },
];

export async function getBomByOrderId(orderId: string) {
  return MOCK_BOM_LINES.filter((line) => line.orderId === orderId);
}

export async function releaseBom(orderId: string) {
  const lines = await getBomByOrderId(orderId);
  const allItemsAvailable = lines.length > 0 && lines.every((line) => line.available);

  return {
    success: true,
    orderId,
    allItemsAvailable,
    released: allItemsAvailable,
    message: allItemsAvailable
      ? "All items are available. BOM can move to production."
      : "Some items are still missing. BOM remains blocked.",
  };
}
