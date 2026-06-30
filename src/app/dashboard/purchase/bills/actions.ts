"use server";

import { adminDb } from "@/lib/firebase-admin";
import type { VendorBill, VendorBillItem, Vendor } from "@/lib/types";

async function nextBillNo(): Promise<string> {
  const snap = await adminDb.collection("vendorBills").orderBy("createdAt", "desc").limit(1).get();
  if (snap.empty) return "BILL-0001";
  const last = snap.docs[0].data().billNo as string | undefined;
  const num = parseInt((last || "BILL-0000").split("-")[1] || "0", 10);
  return `BILL-${String(num + 1).padStart(4, "0")}`;
}

export async function getVendorBills(): Promise<VendorBill[]> {
  const snap = await adminDb.collection("vendorBills").orderBy("createdAt", "desc").limit(200).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as VendorBill));
}

export async function getVendorsForSelect(): Promise<{ id: string; name: string }[]> {
  const snap = await adminDb.collection("vendors").where("isActive", "!=", false).get();
  return snap.docs.map((d) => ({ id: d.id, name: (d.data() as Vendor).name }));
}

export async function saveVendorBill(
  data: Omit<VendorBill, "id" | "billNo" | "createdAt" | "updatedAt">,
  id?: string
): Promise<{ success: boolean; id?: string; message?: string }> {
  try {
    const now = new Date().toISOString();
    if (id) {
      await adminDb.collection("vendorBills").doc(id).update({ ...data, updatedAt: now });
      return { success: true, id };
    }
    const billNo = await nextBillNo();
    const ref = adminDb.collection("vendorBills").doc();
    await ref.set({ ...data, billNo, createdAt: now });
    return { success: true, id: ref.id };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function updateBillStatus(
  id: string,
  status: VendorBill["status"]
): Promise<{ success: boolean; message?: string }> {
  try {
    await adminDb.collection("vendorBills").doc(id).update({ status, updatedAt: new Date().toISOString() });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}
