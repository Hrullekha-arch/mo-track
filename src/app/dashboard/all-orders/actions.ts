
'use server';

import { adminDb } from "@/lib/firebase-admin";
import { O2DStatus } from "@/lib/types";
import { dedupeO2DMilestones, upsertO2DMilestone } from "@/lib/o2d-milestones";


export async function setBalanceFollowUp(
    orderId: string, 
    o2dDocIdOrDealId: string, 
    userName: string
): Promise<{success: boolean; message: string}> {
    try {
        const orderRef = adminDb.collection("orders").doc(orderId);

        await adminDb.runTransaction(async (transaction: any) => {
            const orderDoc: any = await transaction.get(orderRef);
            if (!orderDoc.exists) {
                throw new Error(`Order ${orderId} not found.`);
            }

            const directO2DRef = adminDb.collection("o2d").doc(o2dDocIdOrDealId);
            const directO2DDoc: any = await transaction.get(directO2DRef);

            let resolvedO2DRef = directO2DRef;
            let existingMilestones: O2DStatus[] = [];

            if (directO2DDoc.exists) {
                existingMilestones = dedupeO2DMilestones(
                    (directO2DDoc.data()?.milestones || []) as O2DStatus[]
                );
            } else {
                const o2dQuery = adminDb
                    .collection("o2d")
                    .where("dealId", "==", o2dDocIdOrDealId)
                    .limit(1);
                const o2dSnap: any = await transaction.get(o2dQuery);
                if (o2dSnap.empty) {
                    throw new Error(`O2D document not found for ${o2dDocIdOrDealId}.`);
                }
                const queriedDoc: any = o2dSnap.docs[0];
                resolvedO2DRef = queriedDoc.ref;
                existingMilestones = dedupeO2DMilestones(
                    (queriedDoc.data()?.milestones || []) as O2DStatus[]
                );
            }

            // 1. Update the Order document to flag for follow-up
            transaction.update(orderRef, {
                balanceFollowUp: true,
                paymentConfirmed: false // Ensure this is reset when follow-up is initiated
            });

            // 2. Update the O2D document to complete the milestone
            const followUpMilestone: O2DStatus = {
                stepId: 10, // 'Balance Payment Follow Up'
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: userName,
                remarks: "Follow-up initiated, sent for payment confirmation.",
                selection: "Done"
            };
            const mergedMilestones = upsertO2DMilestone(existingMilestones, followUpMilestone);
            transaction.update(resolvedO2DRef, {
                milestones: mergedMilestones
            });
        });

        return { success: true, message: `Order ${orderId} sent for payment confirmation.` };
    } catch (error) {
        console.error("Error setting balance follow up:", error);
        return { success: false, message: "Failed to update order for follow-up." };
    }
}
