
'use server';

import { adminDb } from "@/lib/firebase-admin";
import { Order } from "@/lib/types";


export async function setBalanceFollowUp(orderId: string): Promise<{success: boolean; message: string}> {
    try {
        const orderRef = adminDb.collection("orders").doc(orderId);
        await orderRef.update({
            balanceFollowUp: true
        });
        return { success: true, message: `Order ${orderId} marked for balance payment follow-up.` };
    } catch (error) {
        console.error("Error setting balance follow up:", error);
        return { success: false, message: "Failed to update order for follow-up." };
    }
}
