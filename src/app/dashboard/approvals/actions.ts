

'use server';

import { adminDb } from "@/lib/firebase-admin";
import { Order, PurchaseRequest, Stock, FabricDetail, O2DStatus, Quotation, PurchaseStatus } from "@/lib/types";
import { FieldValue } from "firebase-admin/firestore";


export async function approveOrderAndCreatePurchaseRequest(
    orderId: string,
    approver: { id: string; name: string }
): Promise<{ success: boolean; message: string }> {
    try {
        const orderRef = adminDb.collection('orders').doc(orderId);
        
        const batch = adminDb.batch();

        // 1. Update the root Order status with approver details
        batch.update(orderRef, { 
            status: 'Approved', 
            approvedBy: approver, 
            approvedAt: new Date().toISOString() 
        });
        
        // We need the order data to proceed with other actions
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            return { success: false, message: "Order not found." };
        }
        const orderData = orderSnap.data() as Order;

        // 2. Update the DealOrder status in the customer's subcollection
        if (orderData.customerId && orderData.dealId && orderData.dealOrderDocId) {
            // To get the deal's firestore ID, we can query for it using the numeric dealId
            const dealsQuery = adminDb.collection('customers').doc(orderData.customerId).collection('deals').where('dealId', '==', orderData.dealId);
            const dealsSnapshot = await dealsQuery.get();
            if(!dealsSnapshot.empty) {
                const dealDoc = dealsSnapshot.docs[0];
                 const dealOrderRef = adminDb.collection('customers').doc(orderData.customerId)
                                        .collection('deals').doc(dealDoc.id)
                                        .collection('orders').doc(orderData.dealOrderDocId);
                batch.update(dealOrderRef, { status: 'Approved' });
            }
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
        const o2dQuery = adminDb.collection('o2d').where('dealId', '==', orderData.dealId);

        // 4. Create a new Purchase Request document if there are items to purchase
        if (itemsToPurchase.length > 0) {
            const prRef = adminDb.collection('purchaseRequests').doc(orderData.crmOrderNo);
            
            const initialMilestones: PurchaseStatus[] = [
                { stepId: 1, status: 'completed', completedAt: new Date().toISOString(), completedBy: 'System (Order Approved)', remarks: 'Automatically completed on order approval.' },
                { stepId: 2, status: 'completed', completedAt: new Date().toISOString(), completedBy: 'System (Order Approved)', remarks: 'Automatically completed on order approval.' },
            ];

            const newPurchaseRequest: Omit<PurchaseRequest, 'id'> = {
                dealId: orderData.crmOrderNo,
                customerName: orderData.customerName,
                promiseDeliveryDate: new Date().toISOString(), // Placeholder
                salesman: orderData.salesPerson,
                type: 'fabric',
                fabricDetails: itemsToPurchase,
                createdAt: new Date().toISOString(),
                createdBy: approver,
                milestones: initialMilestones,
                vendorType: 'undecided',
                status: 'Approved', // This request should be approved and ready for SO to PO
            };
            batch.set(prRef, newPurchaseRequest);
            purchaseMessage = ` A purchase request has been generated for ${itemsToPurchase.length} out-of-stock item(s).`;
        } else {
            // AUTOMATION: If no items to purchase, all stock is available. Mark material receiving as complete.
            const o2dSnapshot = await o2dQuery.get();
            if (!o2dSnapshot.empty) {
                const o2dDoc = o2dSnapshot.docs[0];
                const o2dRef = o2dDoc.ref;
                const materialReceivingMilestone: O2DStatus = {
                    stepId: 7, // 'Purchase Material Receiving'
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    completedBy: "System (Stock available)",
                    remarks: "All required materials were already in stock.",
                    selection: "Done"
                };
                batch.update(o2dRef, { milestones: FieldValue.arrayUnion(materialReceivingMilestone) });
                purchaseMessage = " All items are in stock. Purchase Material Receiving step has been automatically completed."
            }
        }
        
        // AUTOMATION: Mark "Balance Payment Follow Up" as complete (since order is approved)
        if (orderData.dealId) {
            const o2dSnapshot = await o2dQuery.get();
            
            if (!o2dSnapshot.empty) {
                const o2dDoc = o2dSnapshot.docs[0];
                const o2dRef = o2dDoc.ref;
                const balancePaymentMilestone: O2DStatus = {
                    stepId: 6, // 'Balance Payment Follow Up'
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    completedBy: approver.name,
                    remarks: "Payment confirmed during order approval.",
                    selection: "Done"
                };
                batch.update(o2dRef, { milestones: FieldValue.arrayUnion(balancePaymentMilestone) });
            }
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
        
        const batch = adminDb.batch();

        // 1. Mark payment as confirmed in the Order
        batch.update(orderRef, {
            paymentConfirmed: true,
            balanceFollowUp: false,
        });

        // We need order data to find the O2D document
        const orderDoc = await orderRef.get();
        if (!orderDoc.exists) {
             throw new Error("Order not found after update.");
        }
        const orderData = orderDoc.data() as Order;

        // 2. Now, find the associated O2D process and mark step 11 as complete.
        if (orderData.dealId) {
            const o2dQuery = adminDb.collection('o2d').where('dealId', '==', orderData.dealId);
            const o2dSnapshot = await o2dQuery.get();

            if (!o2dSnapshot.empty) {
                const o2dDoc = o2dSnapshot.docs[0];
                const o2dRef = o2dDoc.ref;
                const paymentConfirmationStep: O2DStatus = {
                    stepId: 11, // 'Payment Received Conf'
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    completedBy: approver.name,
                    remarks: `Payment confirmed by ${approver.name}.`,
                    selection: 'Done'
                };
                batch.update(o2dRef, {
                    milestones: FieldValue.arrayUnion(paymentConfirmationStep)
                });
            }
        }
        
        await batch.commit();

        return { success: true, message: `Payment confirmed for order ${orderId} and O2D updated.` };
    } catch (error: any) {
        console.error("Error confirming payment:", error);
        return { success: false, message: `Failed to confirm payment: ${error.message}` };
    }
}

export async function approveQuotationAction(
  quotation: Quotation & { dealId: string },
  approver: { id: string; name: string }
): Promise<{ success: boolean; message: string }> {
  try {
    const batch = adminDb.batch();

    // 1. Update quotation status
    const quotationRef = adminDb
      .collection('customers')
      .doc(quotation.customerId)
      .collection('deals')
      .doc(quotation.dealId)
      .collection('quotations')
      .doc(quotation.id);
    batch.update(quotationRef, {
      status: 'Approved',
    });

    // 2. Add to approvedQuotations collection for logging/history
    const approvedQuotationRef = adminDb.collection('approvedQuotations').doc(quotation.id);
    batch.set(approvedQuotationRef, {
      ...quotation,
      status: 'Approved',
      approvedAt: new Date().toISOString(),
      approvedBy: approver,
    });
    
    // 3. Update O2D Process
    const dealsSnapshot = await adminDb.collection('customers').doc(quotation.customerId).collection('deals').doc(quotation.dealId).get();
    const dealData = dealsSnapshot.data();
    if (dealData?.dealId) {
        const o2dQuery = adminDb.collection('o2d').where('dealId', '==', dealData.dealId);
        const o2dSnapshot = await o2dQuery.get();
        
        if (!o2dSnapshot.empty) {
            const o2dDoc = o2dSnapshot.docs[0];
            const o2dProcessRef = o2dDoc.ref;
            const quotationRecheckStepId = 5; // Corresponds to "Quotation Re-Check"
            const existingMilestones = (o2dDoc.data()?.milestones || []) as O2DStatus[];

            if (!existingMilestones.some((m) => m.stepId === quotationRecheckStepId)) {
                const newMilestone: O2DStatus = {
                stepId: quotationRecheckStepId,
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: approver.name,
                remarks: `Quotation #${quotation.quotationNo} approved.`,
                selection: 'Done',
                };
                batch.update(o2dProcessRef, {
                milestones: FieldValue.arrayUnion(newMilestone),
                });
            }
        }
    }


    await batch.commit();

    return {
      success: true,
      message: `Quotation #${quotation.quotationNo} has been approved.`,
    };
  } catch (error: any) {
    console.error('Error approving quotation:', error);
    return { success: false, message: `Failed to approve quotation: ${error.message}` };
  }
}
    