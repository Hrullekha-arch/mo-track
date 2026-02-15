

'use server';

import { adminDb } from "@/lib/firebase-admin";
import { Order, O2DStatus, Quotation } from "@/lib/types";
import { FieldValue } from "firebase-admin/firestore";


export async function approveOrderAndCreatePurchaseRequest(
    orderId: string,
    approver: { id: string; name: string }
): Promise<{ success: boolean; message: string }> {
    try {
        console.log("🚀 [ORDER APPROVAL START]", { orderId, approver });

        const orderRef = adminDb.collection("orders").doc(orderId);
        const orderSnap = await orderRef.get();

        if (!orderSnap.exists) {
            console.error("❌ Order not found", orderId);
            return { success: false, message: "Order not found." };
        }

        const orderData = orderSnap.data() as Order;
        console.log("📄 Order fetched", {
            crmOrderNo: orderData.crmOrderNo,
            customer: orderData.customerName,
            dealId: orderData.dealId,
        });

        const batch = adminDb.batch();

        // 1️⃣ Approve root order
        batch.update(orderRef, {
            status: "Approved",
            approvedBy: approver,
            approvedAt: new Date().toISOString(),
        });

        const derivedFabricDetails =
            (orderData.fabricDetails && orderData.fabricDetails.length > 0)
                ? orderData.fabricDetails
                : (orderData.sections?.NORMAL?.items || []).map(item => ({
                    fabricName: item.bcn || item.description || "N/A",
                    quantity: String(item.qty ?? 0),
                    rate: Number(item.exclusiveRate ?? item.rate) || 0,
                    discountPercent: 0,
                }));
            console.log(orderData.sections?.NORMAL?.items)
            console.log(derivedFabricDetails);

        // 2️⃣ Create items in 'approvedStock' collection
        const approvedStockRef = adminDb.collection('approvedStock');
        const createdAt = new Date().toISOString();

        if (derivedFabricDetails.length > 0) {
            for (const item of derivedFabricDetails) {
                const newDocRef = approvedStockRef.doc(); // Auto-generate ID
                const stockItem = {
                    orderId: orderId,
                    crmOrderNo: orderData.crmOrderNo,
                    dealId: orderData.dealId,
                    customerName: orderData.customerName,
                    salesPerson: orderData.salesPerson,
                    fabricName: item.fabricName,
                    quantity: item.quantity,
                    status: 'Pending Stock Verification',
                    createdAt: createdAt,
                    createdBy: approver,
                    itemDetail: item,
                };
                batch.set(newDocRef, stockItem);
            }
        }

        await batch.commit();

        console.log("🎉 ORDER APPROVAL COMPLETED & MOVED TO STOCK VERIFICATION");

        return {
            success: true,
            message: `Order approved and items sent for stock verification.`,
        };
    } catch (error: any) {
        console.error("🔥 ERROR IN ORDER APPROVAL", error);
        return {
            success: false,
            message: `Server error: ${error.message}`,
        };
    }
}



export async function confirmPaymentReceived(orderId: string, approver: { id: string; name: string }): Promise<{ success: boolean; message: string }> {
    try {
        const orderRef = adminDb.collection('orders').doc(orderId);
        
        const batch = adminDb.batch();

        batch.update(orderRef, {
            paymentConfirmed: true,
            balanceFollowUp: false,
        });

        const orderDoc = await orderRef.get();
        if (!orderDoc.exists) {
             throw new Error("Order not found after update.");
        }
        const orderData = orderDoc.data() as Order;

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
    const approvedAt = new Date().toISOString();

    const quotationRef = adminDb
      .collection('customers')
      .doc(quotation.customerId)
      .collection('deals')
      .doc(quotation.dealId)
      .collection('quotations')
      .doc(quotation.id);
    batch.update(quotationRef, {
      status: 'Approved',
      approvedAt,
      approvedBy: approver,
    });

    const approvedQuotationRef = adminDb.collection('approvedQuotations').doc(quotation.id);
    batch.set(approvedQuotationRef, {
      ...quotation,
      status: 'Approved',
      approvedAt,
      approvedBy: approver,
    });
    
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
    
