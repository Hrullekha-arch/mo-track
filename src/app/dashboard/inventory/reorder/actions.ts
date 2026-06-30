"use server";

import { adminDb } from "@/lib/firebase-admin";

export interface ReorderItem {
  id: string;
  name: string;
  bcn?: string;
  category?: string;
  availableQty: number;
  reorderPoint: number;
  reorderQty: number;
  unit?: string;
  supplierCompanyName?: string;
  needsReorder: boolean;
}

export async function getReorderItems(): Promise<ReorderItem[]> {
  const snap = await adminDb.collection("stocks").where("reorderPoint", ">", 0).get();
  return snap.docs.map((d) => {
    const data = d.data();
    const availableQty = Number(data.availableQty ?? data.totalQty ?? data.closingstock ?? 0);
    const reorderPoint = Number(data.reorderPoint || 0);
    return {
      id: d.id,
      name: data.name || data.supplierCollectionName || d.id,
      bcn: data.bcn,
      category: data.category,
      availableQty,
      reorderPoint,
      reorderQty: Number(data.reorderQty || 0),
      unit: data.unit,
      supplierCompanyName: data.supplierCompanyName || data.vendorName,
      needsReorder: availableQty <= reorderPoint,
    };
  });
}

export async function setReorderPoint(
  stockId: string,
  reorderPoint: number,
  reorderQty: number
): Promise<{ success: boolean; message?: string }> {
  try {
    await adminDb.collection("stocks").doc(stockId).update({ reorderPoint, reorderQty });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function getAllStocksBasic(): Promise<{ id: string; name: string; bcn?: string; availableQty: number; reorderPoint?: number; reorderQty?: number; unit?: string }[]> {
  const snap = await adminDb.collection("stocks").limit(500).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name || data.supplierCollectionName || d.id,
      bcn: data.bcn,
      availableQty: Number(data.availableQty ?? data.totalQty ?? 0),
      reorderPoint: data.reorderPoint ? Number(data.reorderPoint) : undefined,
      reorderQty: data.reorderQty ? Number(data.reorderQty) : undefined,
      unit: data.unit,
    };
  });
}
