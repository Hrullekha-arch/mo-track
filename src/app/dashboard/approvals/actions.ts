
'use server';

import { adminDb } from "@/lib/firebase-admin";
import { Order, PurchaseRequest, Stock, FabricDetail } from "@/lib/types";


export async function approveOrderAndCreatePurchaseRequest(
    orderId: string,
    approver: { id: string; name: string }
): Promise<{ success: boolean; message: string }> {
    try {
        const orderRef = adminDb.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();

        if (!orderSnap.exists) {
            return { success: false, message: "Order not found." };
        }

        const orderData = orderSnap.data() as Order;
        const batch = adminDb.batch();

        // 1. Update the root Order status
        batch.update(orderRef, { status: 'Approved', approvedBy: approver, approvedAt: new Date().toISOString() });
        
        // 2. Update the DealOrder status in the customer's subcollection
        if (orderData.customerId && orderData.dealId && orderData.dealOrderDocId) {
            const dealOrderRef = adminDb.collection('customers').doc(orderData.customerId)
                                        .collection('deals').doc(orderData.dealId)
                                        .collection('orders').doc(orderData.dealOrderDocId);
            batch.update(dealOrderRef, { status: 'Approved' });
        }

        // 3. Check stock and prepare purchase request if needed
        const itemsToPurchase: FabricDetail[] = [];
        const allItems: FabricDetail[] = orderData.fabricDetails || [];

        for (const item of allItems) {
            const stockId = item.fabricName.replace(/\//g, '-');
            const stockRef = adminDb.collection('stocks').doc(stockId);
            const stockSnap = await stockRef.get();
            const currentStockQty = (stockSnap.data() as Stock)?.quantity || 0;
            const requiredQty = parseFloat(item.quantity);

            if (requiredQty > currentStockQty) {
                itemsToPurchase.push({
                    ...item,
                    quantity: String(requiredQty - currentStockQty),
                });
            }
        }
        
        let purchaseMessage = "";
        // 4. Create a new Purchase Request document if there are items to purchase
        if (itemsToPurchase.length > 0) {
            const prRef = adminDb.collection('purchaseRequests').doc(orderData.crmOrderNo);
            const newPurchaseRequest: Omit<PurchaseRequest, 'id'> = {
                dealId: orderData.crmOrderNo,
                customerName: orderData.customerName,
                promiseDeliveryDate: new Date().toISOString(), // Placeholder
                salesman: orderData.salesPerson,
                type: 'fabric',
                fabricDetails: itemsToPurchase,
                createdAt: new Date().toISOString(),
                createdBy: approver,
                milestones: [],
                vendorType: 'undecided',
                status: 'Approved', // This request should be approved and ready for SO to PO
            };
            batch.set(prRef, newPurchaseRequest);
            purchaseMessage = ` A purchase request has been generated for ${itemsToPurchase.length} out-of-stock item(s).`;
        }
        
        await batch.commit();

        return { success: true, message: `Order ${orderId} has been approved.${purchaseMessage}` };

    } catch (error: any) {
        console.error("Error approving order and creating PR:", error);
        return { success: false, message: `Server error: ${error.message}` };
    }
}

export async function confirmPaymentReceived(orderId: string, approver: { id: string; name: string }): Promise<{ success: boolean; message: string }> {
    try {
        const orderRef = adminDb.collection('orders').doc(orderId);
        await orderRef.update({
            paymentConfirmed: true,
            balanceFollowUp: false, // Turn off the follow-up flag
            paymentConfirmedBy: approver,
            paymentConfirmedAt: new Date().toISOString()
        });
        return { success: true, message: `Payment confirmed for order ${orderId}.` };
    } catch (error: any) {
        console.error("Error confirming payment:", error);
        return { success: false, message: `Failed to confirm payment: ${error.message}` };
    }
}
