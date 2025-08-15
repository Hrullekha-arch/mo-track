

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { PurchaseRequest, PurchaseStatus } from '@/lib/types';
import { subDays, isSameDay } from 'date-fns';
import { FieldValue } from 'firebase-admin/firestore';

export interface PoFollowUpItem {
    id: string; // Unique ID for the row, e.g., `${requestId}-${itemName}`
    requestId: string;
    orderId: string;
    poNumber?: string;
    customerName: string;
    itemName: string;
    quantity: string;
    salesman: string;
    expectedDeliveryDate: string;
    vendorName?: string;
    originalRequest: PurchaseRequest;
}

// Function to get items that need follow-up
export async function getFollowUpItems(): Promise<PoFollowUpItem[]> {
    try {
        const twoDaysFromNow = new Date();
        twoDaysFromNow.setHours(0, 0, 0, 0); // Start of today

        // We can't query based on a calculated date (today vs expectedDate-2).
        // So we fetch all requests that have a PO generated and are not yet completed.
        const poGeneratedRequestsSnapshot = await adminDb.collection('purchaseRequests')
            .where('status', '==', 'PO Generated')
            .get();

        const followUpItems: PoFollowUpItem[] = [];

        poGeneratedRequestsSnapshot.forEach(doc => {
            const request = doc.data() as PurchaseRequest;
            const itemsWithPo = (request.fabricDetails || []).filter(item => item.poNumber && item.expectedDeliveryDate);
            
            itemsWithPo.forEach(item => {
                const expectedDate = new Date(item.expectedDeliveryDate!);
                const followUpDate = subDays(expectedDate, 2);
                
                // If today is on or after the follow-up date, and the 'Delivery Follow Up' step is not done yet
                if (
                    (isSameDay(twoDaysFromNow, followUpDate) || twoDaysFromNow > followUpDate) && 
                    !(request.poMilestones || []).some(m => m.stepId === 2 && m.itemName === item.fabricName)
                ) {
                    followUpItems.push({
                        id: `${request.id}-${item.fabricName}`,
                        requestId: request.id,
                        orderId: request.dealId,
                        poNumber: item.poNumber,
                        customerName: request.customerName,
                        itemName: item.fabricName,
                        quantity: item.quantity,
                        salesman: request.salesman,
                        expectedDeliveryDate: item.expectedDeliveryDate!,
                        vendorName: item.vendorName,
                        originalRequest: request,
                    });
                }
            });
        });

        return JSON.parse(JSON.stringify(followUpItems));
    } catch (error) {
        console.error("Error fetching follow-up items:", error);
        return [];
    }
}

// Function to update the follow-up status and optionally the date
export async function updateFollowUpStatus(
    requestId: string,
    itemName: string,
    newDate: string | null,
    userName: string
): Promise<{ success: boolean; message: string }> {
    try {
        const requestRef = adminDb.collection('purchaseRequests').doc(requestId);
        
        await adminDb.runTransaction(async (transaction) => {
            const requestDoc = await transaction.get(requestRef);
            if (!requestDoc.exists) {
                throw new Error("Purchase request not found.");
            }
            
            const requestData = requestDoc.data() as PurchaseRequest;
            let fabricDetails = requestData.fabricDetails || [];

            // Find and update the specific item
            const itemIndex = fabricDetails.findIndex(item => item.fabricName === itemName);
            if (itemIndex === -1) {
                throw new Error("Item not found in the purchase request.");
            }

            // Update date if a new one is provided
            if (newDate) {
                fabricDetails[itemIndex].expectedDeliveryDate = newDate;
            }
            
            const followUpMilestone: PurchaseStatus = {
                stepId: 2, // 'Delivery Follow Up'
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: userName,
                itemName: itemName,
                remarks: newDate ? `Delivery date updated to ${new Date(newDate).toLocaleDateString()}` : "Follow-up confirmed."
            };

            transaction.update(requestRef, { 
                fabricDetails: fabricDetails,
                poMilestones: FieldValue.arrayUnion(followUpMilestone)
            });
        });

        return { success: true, message: `Follow-up for ${itemName} has been recorded.` };
    } catch (error: any) {
        console.error("Error updating follow-up status:", error);
        return { success: false, message: error.message };
    }
}
