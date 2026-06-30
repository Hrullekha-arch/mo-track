"use server";

import { adminDb } from "@/lib/firebase-admin";
import type { StockTransfer } from "@/lib/types";

async function nextTransferNo(): Promise<string> {
  const snap = await adminDb.collection("stockTransfers").orderBy("createdAt", "desc").limit(1).get();
  if (snap.empty) return "TRF-0001";
  const last = snap.docs[0].data().transferNo as string | undefined;
  const num = parseInt((last || "TRF-0000").split("-")[1] || "0", 10);
  return `TRF-${String(num + 1).padStart(4, "0")}`;
}

export async function getStockTransfers(): Promise<StockTransfer[]> {
  const snap = await adminDb.collection("stockTransfers").orderBy("createdAt", "desc").limit(200).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockTransfer));
}

export async function getStocksForSelect(): Promise<{ id: string; name: string; bcn?: string; unit?: string }[]> {
  const snap = await adminDb.collection("stocks").where("isActive", "!=", false).limit(300).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, name: data.name || data.supplierCollectionName || d.id, bcn: data.bcn, unit: data.unit };
  });
}

export async function createStockTransfer(
  data: Omit<StockTransfer, "id" | "transferNo" | "createdAt">
): Promise<{ success: boolean; id?: string; message?: string }> {
  try {
    const transferNo = await nextTransferNo();
    const ref = adminDb.collection("stockTransfers").doc();
    await ref.set({ ...data, transferNo, createdAt: new Date().toISOString() });
    return { success: true, id: ref.id };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function updateTransferStatus(
  id: string,
  status: StockTransfer["status"]
): Promise<{ success: boolean; message?: string }> {
  try {
    await adminDb.collection("stockTransfers").doc(id).update({ status });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}
