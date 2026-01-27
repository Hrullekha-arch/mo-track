

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Order, FabricDetail, PurchaseRequest } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

export async function markAsInStockAction(
    approvedStockId: string,
    orderId: string,
    fabricName: string
): Promise<{ success: boolean; message: string }> {
    try {
        const batch = adminDb.batch();

        // 1. Update the approvedStock item
        const approvedStockRef = adminDb.collection('approvedStock').doc(approvedStockId);
        batch.update(approvedStockRef, { status: 'In Stock' });

        // 2. Update the status within the order's fabricDetails array
        const orderRef = adminDb.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();
        if (orderDoc.exists) {
            const orderData = orderDoc.data() as Order;
            const updatedFabricDetails = (orderData.fabricDetails || []).map(item => {
                if (item.fabricName === fabricName) {
                    return { ...item, status: 'in stock' as const };
                }
                return item;
            });
            batch.update(orderRef, { fabricDetails: updatedFabricDetails });
        } else {
             console.warn(`Order ${orderId} not found while trying to mark item as in stock.`);
        }

        await batch.commit();
        return { success: true, message: 'Item marked as in stock.' };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}

interface CreatePrPayload {
    approvedStockId: string;
    orderId: string;
    crmOrderNo: string;
    dealId: string;
    fabricName: string;
    quantity: string;
    customerName: string;
    salesPerson: string;
    itemDetail: FabricDetail;
    createdBy: { id: string; name: string; };
}

export async function createPurchaseRequestFromOutOfStockAction(
    payload: CreatePrPayload
): Promise<{ success: boolean; message: string }> {
    try {
        const {
            approvedStockId,
            orderId,
            crmOrderNo,
            dealId,
            fabricName,
            quantity,
            customerName,
            salesPerson,
            itemDetail,
            createdBy
        } = payload;
        
        const batch = adminDb.batch();

        // 1. Update the approvedStock item
        const approvedStockRef = adminDb.collection('approvedStock').doc(approvedStockId);
        batch.update(approvedStockRef, { status: 'PR Created' });

        // 2. Create a new Purchase Request
        const prDocId = `${crmOrderNo}-${fabricName.replace(/\s+/g, "-")}`;
        const prRef = adminDb.collection("purchaseRequests").doc(prDocId);
        
        const newPurchaseRequest: Omit<PurchaseRequest, 'id'> = {
            dealId: dealId,
            quotationNo: crmOrderNo,
            customerName: customerName,
            salesman: salesPerson,
            type: 'fabric',
            fabricDetails: [{ ...itemDetail, quantity: String(quantity) }],
            createdAt: new Date().toISOString(),
            createdBy: createdBy,
            vendorType: "undecided",
            status: "Approved",
            promiseDeliveryDate: '',
            milestones: [],
        };
        
        batch.set(prRef, newPurchaseRequest);

        await batch.commit();
        return { success: true, message: 'Purchase request created.' };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}
