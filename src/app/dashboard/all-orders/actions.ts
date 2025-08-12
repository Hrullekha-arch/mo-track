
'use server';

import { adminDb } from "@/lib/firebase-admin";
import { Order, O2DStatus } from "@/lib/types";
import { FieldValue } from 'firebase-admin/firestore';


export async function setBalanceFollowUp(
    orderId: string, 
    o2dDocId: string, 
    userName: string
): Promise<{success: boolean; message: string}> {
    try {
        const orderRef = adminDb.collection("orders").doc(orderId);
        const o2dRef = adminDb.collection('o2d').doc(o2dDocId);

        await adminDb.runTransaction(async (transaction) => {
            const orderDoc = await transaction.get(orderRef);
            if (!orderDoc.exists) {
                throw new Error(`Order ${orderId} not found.`);
            }

            // 1. Update the Order document to flag for follow-up
            transaction.update(orderRef, {
                balanceFollowUp: true,
                paymentConfirmed: false // Ensure this is reset when follow-up is initiated
            });

            // 2. Update the O2D document to complete the milestone
            const followUpMilestone: O2DStatus = {
                stepId: 6, // 'Balance Payment Follow Up'
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: userName,
                remarks: "Follow-up initiated, sent for payment confirmation.",
                selection: "Done"
            };
            transaction.update(o2dRef, {
                milestones: FieldValue.arrayUnion(followUpMilestone)
            });
        });

        return { success: true, message: `Order ${orderId} sent for payment confirmation.` };
    } catch (error) {
        console.error("Error setting balance follow up:", error);
        return { success: false, message: "Failed to update order for follow-up." };
    }
}
