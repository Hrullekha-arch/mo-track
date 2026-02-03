'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Order, PurchaseRequest, FabricDetail } from '@/lib/types';

/* =========================================================
   MARK FABRIC AS IN-STOCK
   - Uses approvedStockId (NOT fabric name)
   - Transaction safe
   - Handles duplicate fabric names
========================================================= */
export async function markAsInStockAction(
  approvedStockId: string,
  orderId: string
): Promise<{ success: boolean; message: string }> {
  try {
    await adminDb.runTransaction(async (tx) => {
      const approvedStockRef = adminDb
        .collection('approvedStock')
        .doc(approvedStockId);

      const orderRef = adminDb
        .collection('orders')
        .doc(orderId);

      // 1️⃣ Read order before any writes (Firestore transaction rule)
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) return;

      const orderData = orderSnap.data() as Order;

      const updatedFabricDetails = (orderData.fabricDetails || []).map(
        (item: FabricDetail) =>
          item.approvedStockId === approvedStockId
            ? { ...item, status: 'in_stock' }
            : item
      );

      // 2️⃣ Update approved stock
      tx.update(approvedStockRef, {
        status: 'In Stock',
        updatedAt: new Date().toISOString(),
      });

      // 3️⃣ Update exact fabric line in order
      tx.update(orderRef, {
        fabricDetails: updatedFabricDetails,
      });
    });

    return { success: true, message: 'Fabric marked as in stock.' };
  } catch (error: any) {
    console.error(error);
    return { success: false, message: error.message };
  }
}

/* =========================================================
   CREATE PURCHASE REQUEST FROM OUT-OF-STOCK
   - ONE PR per approvedStockId
   - Same fabric name allowed
   - No overwrite ever
========================================================= */

interface CreatePrPayload {
  approvedStockId: string;
  orderId: string;
  crmOrderNo: string;
  dealId: string;
  customerName: string;
  salesPerson: string;
  quantity: string;
  itemDetail: FabricDetail;
  createdBy: { id: string; name: string };
}

export async function createPurchaseRequestFromOutOfStockAction(
  payload: CreatePrPayload
): Promise<{ success: boolean; message: string }> {
  try {
    const {
      approvedStockId,
      crmOrderNo,
      dealId,
      customerName,
      salesPerson,
      quantity,
      itemDetail,
      createdBy,
    } = payload;

    await adminDb.runTransaction(async (tx) => {
      const approvedStockRef = adminDb
        .collection('approvedStock')
        .doc(approvedStockId);

      // 🔑 UNIQUE PR ID — NO COLLISION
      const prRef = adminDb
        .collection('purchaseRequests')
        .doc(`PR-${approvedStockId}`);

      // 1️⃣ Update approved stock status
      tx.update(approvedStockRef, {
        status: 'PR Created',
        updatedAt: new Date().toISOString(),
      });

      // 2️⃣ Create Purchase Request
      const newPurchaseRequest: Omit<PurchaseRequest, 'id'> = {
        dealId,
        quotationNo: crmOrderNo,
        customerName,
        salesman: salesPerson,
        type: 'fabric',
        fabricDetails: [
          {
            ...itemDetail,
            quantity: String(quantity),
            approvedStockId, // 🔥 TRACEABILITY
          },
        ],
        createdAt: new Date().toISOString(),
        createdBy,
        vendorType: 'undecided',
        status: 'Approved',
        promiseDeliveryDate: '',
        milestones: [],
      };

      tx.set(prRef, newPurchaseRequest);
    });

    return {
      success: true,
      message: 'Purchase request created successfully.',
    };
  } catch (error: any) {
    console.error(error);
    return { success: false, message: error.message };
  }
}
