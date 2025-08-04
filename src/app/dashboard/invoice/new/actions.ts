
"use server";

import { adminDb } from "@/lib/firebase-admin";
import { DealOrder, Quotation } from "@/lib/types";
import { getDoc } from "firebase-admin/firestore";

export async function createDealOrderAction(
  customerId: string,
  dealId: string,
  quotation: Quotation
): Promise<{ success: boolean; message: string; order?: DealOrder }> {
  try {
    const quotationRef = adminDb
      .collection("customers")
      .doc(customerId)
      .collection("deals")
      .doc(dealId)
      .collection("quotations")
      .doc(quotation.id);

    // Server-side check to prevent multiple conversions
    const currentQuotationSnap = await getDoc(quotationRef);
    if (currentQuotationSnap.exists() && currentQuotationSnap.data()?.status === 'Converted to Order') {
      return { success: false, message: "This quotation has already been converted to an order." };
    }

    const batch = adminDb.batch();

    // 1. Create the new order
    const ordersRef = adminDb
      .collection("customers")
      .doc(customerId)
      .collection("deals")
      .doc(dealId)
      .collection("orders");

    const newOrderRef = ordersRef.doc();

    const newOrder: DealOrder = {
      orderNo: Math.floor(1000 + Math.random() * 9000).toString(),
      id: newOrderRef.id,
      orderDate: new Date().toISOString(),
      createdBy: quotation.createdBy || 'System',
      remark: quotation.billingName || "",
      items: quotation.items,
    };

    batch.set(newOrderRef, newOrder);

    // 2. Update the quotation status
    batch.update(quotationRef, { 
      status: 'Converted to Order',
      orderNo: newOrder.orderNo,
    });

    await batch.commit();

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
