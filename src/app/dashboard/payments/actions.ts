"use server";

import { adminDb } from "@/lib/firebase-admin";
import type { PaymentReceived } from "@/lib/types";

async function nextPaymentNo(): Promise<string> {
  const snap = await adminDb.collection("paymentsReceived").orderBy("createdAt", "desc").limit(1).get();
  if (snap.empty) return "PAY-0001";
  const last = snap.docs[0].data().paymentNo as string | undefined;
  const num = parseInt((last || "PAY-0000").split("-")[1] || "0", 10);
  return `PAY-${String(num + 1).padStart(4, "0")}`;
}

export async function getPaymentsReceived(): Promise<PaymentReceived[]> {
  const snap = await adminDb.collection("paymentsReceived").orderBy("createdAt", "desc").limit(200).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentReceived));
}

export async function addPaymentReceived(
  data: Omit<PaymentReceived, "id" | "paymentNo" | "createdAt">
): Promise<{ success: boolean; id?: string; message?: string }> {
  try {
    const paymentNo = await nextPaymentNo();
    const ref = adminDb.collection("paymentsReceived").doc();
    await ref.set({ ...data, paymentNo, createdAt: new Date().toISOString() });
    return { success: true, id: ref.id };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function deletePaymentReceived(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    await adminDb.collection("paymentsReceived").doc(id).delete();
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}
