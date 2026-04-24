'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Order, PurchaseRequest, FabricDetail } from '@/lib/types';
import { updateSalesmanIncentiveStockStatus } from '@/lib/server/salesman-incentive';

type FabricStockUpdateMatch = {
  lineId?: string;
  bcn?: string;
  itemName?: string;
};

const normalizeToken = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '');

const updateOrderFabricDetailsStockState = (params: {
  fabricDetails: FabricDetail[];
  approvedStockId: string;
  lineId?: string;
  bcn?: string;
  fabricName?: string;
  itemName?: string;
  status: FabricDetail['status'];
  isInStock: boolean;
}) => {
  const {
    fabricDetails,
    approvedStockId,
    lineId,
    bcn,
    fabricName,
    itemName,
    status,
    isInStock,
  } = params;

  const normalizedLineId = String(lineId || '').trim();
  const normalizedBcn = normalizeToken(bcn || fabricName);
  const normalizedName = normalizeToken(itemName || fabricName);

  const updatedFabricDetails: FabricDetail[] = [];
  let fallbackMatched = false;
  let matchedLine: FabricStockUpdateMatch | undefined;

  for (const existing of fabricDetails) {
    const existingLineId = String(existing.lineId || '').trim();
    const existingBcn = normalizeToken(existing.bcn || existing.fabricName);
    const existingName = normalizeToken(existing.itemName || existing.fabricName);

    const isApprovedStockMatch =
      String(existing.approvedStockId || '').trim() === approvedStockId;
    const isLineIdMatch = Boolean(normalizedLineId) && existingLineId === normalizedLineId;

    const isLegacyFallbackMatch =
      !isApprovedStockMatch &&
      !isLineIdMatch &&
      !fallbackMatched &&
      !String(existing.approvedStockId || '').trim() &&
      ((normalizedBcn && existingBcn && normalizedBcn === existingBcn) ||
        (normalizedName && existingName && normalizedName === existingName));

    if (isLegacyFallbackMatch) {
      fallbackMatched = true;
    }

    if (isApprovedStockMatch || isLineIdMatch || isLegacyFallbackMatch) {
      const updated: FabricDetail = {
        ...existing,
        approvedStockId: existing.approvedStockId || approvedStockId,
        lineId: existing.lineId || normalizedLineId || undefined,
        bcn: existing.bcn || bcn || undefined,
        itemName: existing.itemName || itemName || existing.fabricName || undefined,
        status,
        isInStock,
      };

      matchedLine = {
        lineId: updated.lineId,
        bcn: updated.bcn || updated.fabricName,
        itemName: updated.itemName || updated.fabricName,
      };

      updatedFabricDetails.push(updated);
      continue;
    }

    updatedFabricDetails.push(existing);
  }

  return { updatedFabricDetails, matchedLine };
};

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
    const verifiedAt = new Date().toISOString();
    const approvedStockRef = adminDb.collection('approvedStock').doc(approvedStockId);
    const approvedStockSnap = await approvedStockRef.get();

    if (!approvedStockSnap.exists) {
      return { success: false, message: 'Approved stock item not found.' };
    }

    const approvedStockData = (approvedStockSnap.data() || {}) as any;
    const stockLineId =
      String(approvedStockData.lineId || approvedStockData.itemDetail?.lineId || '').trim() ||
      undefined;
    const stockBcn =
      String(approvedStockData.itemDetail?.bcn || approvedStockData.fabricName || '').trim() ||
      undefined;
    const stockItemName =
      String(
        approvedStockData.itemDetail?.itemName ||
          approvedStockData.fabricName ||
          approvedStockData.itemDetail?.fabricName ||
          ''
      ).trim() || undefined;

    await adminDb.runTransaction(async (tx: any) => {
      const approvedStockTxSnap = await tx.get(approvedStockRef);
      if (!approvedStockTxSnap.exists) {
        throw new Error('Approved stock item not found.');
      }

      const orderRef = orderId ? adminDb.collection('orders').doc(orderId) : null;
      const orderSnap = orderRef ? await tx.get(orderRef) : null;

      tx.update(approvedStockRef, {
        status: 'In Stock',
        updatedAt: verifiedAt,
      });

      if (orderRef && orderSnap?.exists) {
        const orderData = orderSnap.data() as Order;
        const fabricDetails = Array.isArray(orderData.fabricDetails)
          ? orderData.fabricDetails
          : [];

        const { updatedFabricDetails } = updateOrderFabricDetailsStockState({
          fabricDetails,
          approvedStockId,
          lineId: stockLineId,
          bcn: stockBcn,
          fabricName: approvedStockData.fabricName,
          itemName: stockItemName,
          status: 'in stock',
          isInStock: true,
        });

        tx.update(orderRef, {
          fabricDetails: updatedFabricDetails,
        });
      }
    });

    try {
      await updateSalesmanIncentiveStockStatus({
        orderId,
        approvedStockId,
        lineId: stockLineId,
        bcn: stockBcn,
        itemName: stockItemName,
        isInStock: true,
        source: 'IN_STOCK',
        verifiedAt,
      });
    } catch (incentiveError) {
      console.error(
        `[salesman-incentive] Failed to sync IN_STOCK for order ${orderId} and approvedStock ${approvedStockId}:`,
        incentiveError
      );
    }

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
  fabricName?: string;
  itemDetail: FabricDetail;
  createdBy: { id: string; name: string };
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
      customerName,
      salesPerson,
      quantity,
      itemDetail,
      createdBy,
    } = payload;

    console.log('payload', payload);

    const createdAt = new Date().toISOString();

    const approvedStockRef = adminDb.collection('approvedStock').doc(approvedStockId);
    const approvedStockSnap = await approvedStockRef.get();

    const approvedStockData = (approvedStockSnap.data() || {}) as any;
    const stockLineId =
      String(itemDetail?.lineId || approvedStockData?.lineId || '').trim() || undefined;
    const stockBcn =
      String(itemDetail?.bcn || approvedStockData?.itemDetail?.bcn || approvedStockData?.fabricName || '').trim() ||
      undefined;
    const stockItemName =
      String(itemDetail?.itemName || approvedStockData?.itemDetail?.itemName || itemDetail?.fabricName || '').trim() ||
      undefined;

    await adminDb.runTransaction(async (tx: any) => {
      const approvedStockTxSnap = await tx.get(approvedStockRef);
      if (!approvedStockTxSnap.exists) {
        throw new Error('Approved stock item not found.');
      }

      const prRef = adminDb.collection('purchaseRequests').doc(`PR-${approvedStockId}`);

      tx.update(approvedStockRef, {
        status: 'PR Created',
        updatedAt: createdAt,
      });

      if (orderId) {
        const orderRef = adminDb.collection('orders').doc(orderId);
        const orderSnap = await tx.get(orderRef);

        if (orderSnap.exists) {
          const orderData = orderSnap.data() as Order;
          const fabricDetails = Array.isArray(orderData.fabricDetails)
            ? orderData.fabricDetails
            : [];

          const { updatedFabricDetails } = updateOrderFabricDetailsStockState({
            fabricDetails,
            approvedStockId,
            lineId: stockLineId,
            bcn: stockBcn,
            fabricName: itemDetail.fabricName,
            itemName: stockItemName,
            status: 'pending for po',
            isInStock: false,
          });

          tx.update(orderRef, {
            fabricDetails: updatedFabricDetails,
          });
        }
      }

      const normalizedItemDetail: FabricDetail = {
        ...itemDetail,
        lineId: itemDetail.lineId || stockLineId,
        approvedStockId,
        bcn: itemDetail.bcn || stockBcn,
        itemName: itemDetail.itemName || stockItemName,
        quantity: String(quantity),
        status: 'pending for po',
        isInStock: false,
      };

      const newPurchaseRequest: Omit<PurchaseRequest, 'id'> = {
        dealId,
        quotationNo: crmOrderNo,
        customerName,
        salesman: salesPerson,
        type: 'fabric',
        fabricDetails: [normalizedItemDetail],
        createdAt,
        createdBy,
        vendorType: 'undecided',
        status: 'Approved',
        promiseDeliveryDate: '',
        milestones: [],
      };

      tx.set(prRef, newPurchaseRequest);
    });

    try {
      await updateSalesmanIncentiveStockStatus({
        orderId,
        approvedStockId,
        lineId: stockLineId,
        bcn: stockBcn,
        itemName: stockItemName,
        isInStock: false,
        source: 'OUT_OF_STOCK',
        verifiedAt: createdAt,
      });
    } catch (incentiveError) {
      console.error(
        `[salesman-incentive] Failed to sync OUT_OF_STOCK for order ${orderId} and approvedStock ${approvedStockId}:`,
        incentiveError
      );
    }

    return {
      success: true,
      message: 'Purchase request created successfully.',
    };
  } catch (error: any) {
    console.error(error);
    return { success: false, message: error.message };
  }
}
