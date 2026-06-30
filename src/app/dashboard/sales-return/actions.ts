"use server";

import { adminDb } from "@/lib/firebase-admin";
import type { SalesReturn } from "@/lib/types";

async function nextReturnNo(): Promise<string> {
  const snap = await adminDb.collection("salesReturns").orderBy("createdAt", "desc").limit(1).get();
  if (snap.empty) return "RET-0001";
  const last = snap.docs[0].data().returnNo as string | undefined;
  const num = parseInt((last || "RET-0000").split("-")[1] || "0", 10);
  return `RET-${String(num + 1).padStart(4, "0")}`;
}

export async function getSalesReturns(): Promise<SalesReturn[]> {
  const snap = await adminDb.collection("salesReturns").orderBy("createdAt", "desc").limit(200).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SalesReturn));
}

export async function createSalesReturn(
  data: Omit<SalesReturn, "id" | "returnNo" | "createdAt">
): Promise<{ success: boolean; id?: string; message?: string }> {
  try {
    const returnNo = await nextReturnNo();
    const ref = adminDb.collection("salesReturns").doc();
    await ref.set({ ...data, returnNo, createdAt: new Date().toISOString() });
    return { success: true, id: ref.id };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function updateReturnStatus(
  id: string,
  status: SalesReturn["status"],
  creditNoteNo?: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const update: any = { status };
    if (creditNoteNo) update.creditNoteNo = creditNoteNo;
    await adminDb.collection("salesReturns").doc(id).update(update);
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}
