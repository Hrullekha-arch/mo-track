"use server";

import { adminDb } from "@/lib/firebase-admin";
import type { Vendor } from "@/lib/types";

export async function getVendors(): Promise<Vendor[]> {
  const snap = await adminDb.collection("vendors").orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Vendor));
}

export async function saveVendor(
  data: Omit<Vendor, "id" | "createdAt" | "updatedAt">,
  id?: string
): Promise<{ success: boolean; id?: string; message?: string }> {
  try {
    const now = new Date().toISOString();
    if (id) {
      await adminDb.collection("vendors").doc(id).update({ ...data, updatedAt: now });
      return { success: true, id };
    } else {
      const ref = adminDb.collection("vendors").doc();
      await ref.set({ ...data, createdAt: now });
      return { success: true, id: ref.id };
    }
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function deleteVendor(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    await adminDb.collection("vendors").doc(id).delete();
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}
