"use server";

import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { Order } from "@/lib/types";
import {
  applyOrderMilestoneChange,
  getNormalizedOrderMilestones,
} from "@/lib/order-workflow";

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
    if (
      !orderId ||
      !Number.isInteger(milestoneId) ||
      typeof input.completed !== "boolean"
    ) {
      return { success: false, message: "Invalid order or milestone." };
    }

    const decoded = await adminAuth.verifyIdToken(String(input.authToken || ""));
    const userSnapshot = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnapshot.exists) return { success: false, message: "User not found." };

    const actor = userSnapshot.data() as any;
    const role = normalize(actor?.role);
    const designation = normalize(actor?.designation);
    const isCrmActor = role === "crm" || designation === "crm";
    const allowed =
      role === "admin" ||
      role === "employee" ||
      role === "pc" ||
      role === "crm" ||
      designation === "pc" ||
      designation === "crm";
    if (!allowed) {
      return { success: false, message: "You are not authorized to update milestones." };
    }
    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnapshot = await orderRef.get();
    if (!orderSnapshot.exists) return { success: false, message: "Order not found." };

    const order = { id: orderSnapshot.id, ...orderSnapshot.data() } as Order;
    if (input.completed && isCrmActor) {
      const milestones = getNormalizedOrderMilestones(order);
      const targetIndex = milestones.findIndex((milestone) => milestone.id === milestoneId);
      if (
        targetIndex > 0 &&
        milestones.slice(0, targetIndex).some((milestone) => !milestone.completed)
      ) {
        return {
          success: false,
          message: "Complete the previous milestone first.",
        };
      }
    }
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

export async function completeOrderByCrmAction(input: {
  orderId: string;
  authToken: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const orderId = String(input.orderId || "").trim();
    if (!orderId) return { success: false, message: "Invalid order." };

    const decoded = await adminAuth.verifyIdToken(String(input.authToken || ""));
    const userSnapshot = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnapshot.exists) return { success: false, message: "User not found." };

    const actor = userSnapshot.data() as any;
    const role = normalize(actor?.role);
    const designation = normalize(actor?.designation);
    const allowed = role === "admin" || role === "crm" || designation === "crm";
    if (!allowed) {
      return { success: false, message: "Only CRM or Admin users can complete this order." };
    }

    const orderRef = adminDb.collection("orders").doc(orderId);
    const nowIso = new Date().toISOString();

    await adminDb.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
      const orderSnapshot = (await transaction.get(orderRef)) as unknown as FirebaseFirestore.DocumentSnapshot;
      if (!orderSnapshot.exists) throw new Error("Order not found.");

      const order = { id: orderSnapshot.id, ...orderSnapshot.data() } as Order;
      const milestones = getNormalizedOrderMilestones(order);
      if (!milestones.length || milestones.some((milestone) => !milestone.completed)) {
        throw new Error("Complete every order milestone before closing the order.");
      }

      transaction.update(orderRef, {
        status: "Completed",
        completedAt: (order as any).completedAt || nowIso,
        completedBy: (order as any).completedBy || String(actor?.name || decoded.name || "CRM"),
        crmCompletedAt: nowIso,
        crmCompletedBy: {
          id: decoded.uid,
          name: String(actor?.name || decoded.name || "CRM"),
        },
        updatedAt: nowIso,
      });
    });

    return {
      success: true,
      message: "Order completed and moved to CRM history.",
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || "Failed to complete order.",
    };
  }
}
