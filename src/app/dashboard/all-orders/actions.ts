
'use server';

import { adminDb } from "@/lib/firebase-admin";
import { Order } from "@/lib/types";


export async function setBalanceFollowUp(orderId: string): Promise<{success: boolean; message: string}> {
    try {
        const orderRef = adminDb.collection("orders").doc(orderId);
        
        // This action now ONLY flags the order for follow-up.
        // It does not complete any O2D steps.
        await orderRef.update({
            balanceFollowUp: true,
            paymentConfirmed: false // Ensure this is reset when follow-up is initiated
        });

        return { success: true, message: `Order ${orderId} sent for payment confirmation.` };
    } catch (error) {
        console.error("Error setting balance follow up:", error);
        return { success: false, message: "Failed to update order for follow-up." };
    }
}
