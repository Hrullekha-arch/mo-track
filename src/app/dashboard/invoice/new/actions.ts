"use server";

import { adminDb } from "@/lib/firebase-admin";
import { DealOrder } from "@/lib/types";

export async function createDealOrderAction(
  customerId: string,
  dealId: string,
  orderData: Omit<DealOrder, "id" | "orderNo">
): Promise<{ success: boolean; message: string; order?: DealOrder }> {
  try {
    const ordersRef = adminDb
      .collection("customers")
      .doc(customerId)
      .collection("deals")
      .doc(dealId)
      .collection("orders");

    const newOrderRef = ordersRef.doc();

    const newOrder: DealOrder = {
      ...orderData,
      id: newOrderRef.id,
      orderNo: Math.floor(1000 + Math.random() * 9000).toString(),
    };

    await newOrderRef.set(newOrder);

    return {
      success: true,
      message: "Order created successfully.",
      order: JSON.parse(JSON.stringify(newOrder)),
    };
  } catch (error: any) {
    console.error("Error creating deal order:", error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}
