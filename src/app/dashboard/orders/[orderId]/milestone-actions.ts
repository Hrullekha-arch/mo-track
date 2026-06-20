"use server";

import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { Order } from "@/lib/types";
import { applyOrderMilestoneChange } from "@/lib/order-workflow";

const normalize = (value: unknown) =>
  String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");

export async function updateOrderMilestoneAction(input: {
  orderId: string;
  milestoneId: number;
  completed: boolean;
  authToken: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const orderId = String(input.orderId || "").trim();
    const milestoneId = Number(input.milestoneId);
    if (!orderId || !Number.isInteger(milestoneId)) {
      return { success: false, message: "Invalid order or milestone." };
    }

    const decoded = await adminAuth.verifyIdToken(String(input.authToken || ""));
    const userSnapshot = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnapshot.exists) return { success: false, message: "User not found." };

    const actor = userSnapshot.data() as any;
    const role = normalize(actor?.role);
    const designation = normalize(actor?.designation);
    const allowed =
      role === "admin" ||
      role === "employee" ||
      role === "pc" ||
      designation === "pc";
    if (!allowed) {
      return { success: false, message: "You are not authorized to update milestones." };
    }

    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnapshot = await orderRef.get();
    if (!orderSnapshot.exists) return { success: false, message: "Order not found." };

    const order = { id: orderSnapshot.id, ...orderSnapshot.data() } as Order;
    const result = applyOrderMilestoneChange(order, milestoneId, input.completed, {
      id: decoded.uid,
      name: String(actor?.name || decoded.name || "User"),
    });

    await orderRef.update({
      milestones: result.milestones,
      workflow: result.workflow,
      updatedAt: new Date().toISOString(),
    });

    return { success: true, message: "Milestone updated successfully." };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || "Failed to update milestone.",
    };
  }
}
