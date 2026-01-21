

'use server';

import { adminDb } from "@/lib/firebase-admin";
import { Order, PurchaseRequest, Stock, FabricDetail, O2DStatus, Quotation, PurchaseStatus } from "@/lib/types";
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

        // 2️⃣ Aggregate BCN quantities from THIS order
        const aggregatedItems = new Map<
            string,
            { totalQuantity: number; itemDetail: FabricDetail }
        >();

        (orderData.fabricDetails || []).forEach(item => {
            if (!item.fabricName) return;

            const qty = Number(item.quantity || 0);
            const existing = aggregatedItems.get(item.fabricName);

            if (existing) {
                existing.totalQuantity += qty;
            } else {
                aggregatedItems.set(item.fabricName, {
                    totalQuantity: qty,
                    itemDetail: item,
                });
            }
        });

        console.log(
            "📦 Aggregated BCN list",
            JSON.stringify(Array.from(aggregatedItems.entries()), null, 2)
        );

        let purchaseMessage = "";

        // 3️⃣ BCN-WISE CHECK
        for (const [bcn, { totalQuantity, itemDetail }] of aggregatedItems.entries()) {
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("🧵 BCN CHECK START", bcn);
            console.log("📦 Order Qty:", totalQuantity);

            // 3A️⃣ Calculate TOTAL pending demand across ALL orders
            const allOrdersSnap = await adminDb.collection("orders").get();
            let totalUnallocatedDemand = 0;

            allOrdersSnap.forEach(doc => {
                const o = doc.data() as Order;
                (o.fabricDetails || []).forEach(fd => {
                    if (
                        fd.fabricName === bcn &&
                        fd.status === "pending for po"
                    ) {
                        const q = Number(fd.quantity || 0);
                        totalUnallocatedDemand += q;

                        console.log("➕ Pending demand", {
                            fromOrder: doc.id,
                            qty: q,
                        });
                    }
                });
            });

            if (totalUnallocatedDemand === 0) {
                totalUnallocatedDemand = totalQuantity;
                console.log("ℹ️ No other pending demand, using order qty");
            }

            // 3B️⃣ FETCH STOCK CORRECTLY (🔥 YOUR STRUCTURE 🔥)
            const lengthsSnap = await adminDb
                .collection("stocks")
                .doc(bcn)
                .collection("lengths")
                .get();

            let availableQty = 0;

            lengthsSnap.forEach(doc => {
                const data = doc.data();
                availableQty += Number(data.availableQty || 0);
            });

            console.log("🏬 STOCK SUMMARY", {
                bcn,
                totalAvailableQty: availableQty,
                lengthsCount: lengthsSnap.size,
            });

            console.log("📊 FINAL CHECK", {
                bcn,
                totalUnallocatedDemand,
                availableQty,
                willCreatePR: totalUnallocatedDemand > availableQty,
            });

            // 🛑 HARD SAFETY STOP
            if (availableQty >= totalUnallocatedDemand) {
                console.log("🛑 STOCK SUFFICIENT → PR SKIPPED", bcn);
                continue;
            }

            // 4️⃣ CREATE PURCHASE REQUEST
            const requiredQty = totalUnallocatedDemand - availableQty;

            console.warn("❌ STOCK SHORT → CREATING PR", {
                bcn,
                requiredQty,
            });

            const prDocId = `${orderData.crmOrderNo}-${bcn.replace(/\s+/g, "-")}`;
            const prRef = adminDb.collection("purchaseRequests").doc(prDocId);

            batch.set(prRef, {
                dealId: orderData.crmOrderNo,
                customerName: orderData.customerName,
                salesman: orderData.salesPerson,
                type: "fabric",
                fabricDetails: [
                    { ...itemDetail, quantity: String(requiredQty) },
                ],
                createdAt: new Date().toISOString(),
                createdBy: approver,
                vendorType: "undecided",
                status: "Approved",
            });

            purchaseMessage += ` PR created for ${requiredQty} of ${bcn}.`;
        }

        await batch.commit();

        console.log("🎉 ORDER APPROVAL COMPLETED");

        return {
            success: true,
            message: `Order approved.${purchaseMessage}`,
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

    const approvedQuotationRef = adminDb.collection('approvedQuotations').doc(quotation.id);
    batch.set(approvedQuotationRef, {
      ...quotation,
      status: 'Approved',
      approvedAt: new Date().toISOString(),
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
    