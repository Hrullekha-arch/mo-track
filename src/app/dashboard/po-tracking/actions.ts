

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { InboundRequest, PurchaseRequest, PurchaseStatus } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

const normalizeMatchKey = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const buildMatchKeySet = (values: unknown[]): Set<string> => {
  const keys = values
    .map((value) => normalizeMatchKey(value))
    .filter(Boolean);
  return new Set(keys);
};

const hasCommonKey = (targetKeys: Set<string>, candidates: unknown[]): boolean => {
  for (const candidate of candidates) {
    const normalized = normalizeMatchKey(candidate);
    if (normalized && targetKeys.has(normalized)) return true;
  }
  return false;
};

export interface PoFollowUpItem {
    id: string; // Unique ID for the row, e.g., `${requestId}-${itemName}`
    requestId: string;
    orderId: string;
    poNumber?: string;
    customerName: string;
    itemName: string;
    itemCode?: string;
    supplierCollectionCode?: string;
    supplierCollectionName?: string;
    quantity: string;
    salesman: string;
    expectedDeliveryDate: string;
    vendorName?: string;
    originalRequest: PurchaseRequest;
}

// Function to get items that need follow-up
function toISTMidnight(date: Date | string): Date {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  return new Date(
    Number(parts.find((p) => p.type === "year")!.value),
    Number(parts.find((p) => p.type === "month")!.value) - 1,
    Number(parts.find((p) => p.type === "day")!.value)
  );
}

export async function getFollowUpItems(): Promise<PoFollowUpItem[]> {
  try {
    console.log("========== FOLLOW UP FETCH START ==========");

    const todayIST = toISTMidnight(new Date());

    console.log("Today IST:", todayIST.toDateString());

    const poRequestsSnapshot = await adminDb
      .collection("purchaseRequests")
      .where("status", "in", ["PO Generated", "Completed"])
      .get();

    console.log("Total purchaseRequests fetched:", poRequestsSnapshot.size);

    const followUpItems: PoFollowUpItem[] = [];

    poRequestsSnapshot.forEach((doc: any) => {
      const request = { id: doc.id, ...doc.data() } as PurchaseRequest;

      console.log("------------------------------------------------");
      console.log("Processing Request:", request.id);

      if (!request.promiseDeliveryDate) {
        console.log("❌ No promiseDeliveryDate");
        return;
      }

      const promiseDate = toISTMidnight(request.promiseDeliveryDate);

      const followUpDate = new Date(promiseDate);
      followUpDate.setDate(followUpDate.getDate() - 2);

      console.log("Promise Date IST:", promiseDate.toDateString());
      console.log("FollowUp Date IST:", followUpDate.toDateString());

      if (todayIST < followUpDate) {
        console.log("⏳ Follow-up not reached yet");
        return;
      }

      console.log("✅ Follow-up condition passed");

      const fabricDetails = request.fabricDetails || [];

      console.log("Fabric items:", fabricDetails.length);

      const itemsWithPo = fabricDetails.filter((item: any) => item.poNumber);

      console.log("Items with PO:", itemsWithPo.length);

      itemsWithPo.forEach((item: any) => {
        console.log("Checking:", item.fabricName);

        const milestones = request.poMilestones || [];
        const itemName = (item.fabricName || "").trim();

        const isFollowedUp = milestones.some(
          (m: any) => m.stepId === 2 && (m.itemName || "").trim() === itemName
        );

        if (isFollowedUp) {
          console.log("⚠️ Already followed up:", itemName);
          return;
        }

        console.log("✅ Adding item:", itemName);

        followUpItems.push({
          id: `${request.id}-${itemName}`,
          requestId: request.id,
          orderId: request.dealId,
          poNumber: item.poNumber,
          customerName: request.customerName,
          itemName: itemName,
          itemCode: item.itemCode,
          supplierCollectionCode: item.supplierCollectionCode,
          supplierCollectionName: item.supplierCollectionName,
          quantity: item.quantity,
          salesman: request.salesman,
          expectedDeliveryDate:
            item.expectedDeliveryDate || request.promiseDeliveryDate,
          vendorName: item.vendorName,
          originalRequest: request,
        });
      });
    });

    console.log("========== FOLLOW UP RESULT ==========");
    console.log("Total Items:", followUpItems.length);

    return JSON.parse(JSON.stringify(followUpItems));
  } catch (error) {
    console.error("❌ Follow-up fetch error:", error);
    return [];
  }
}

// Function to update the follow-up status and optionally the date
export async function updateFollowUpStatus(
    requestId: string,
    itemName: string,
    newDate: string | null,
    docketNoInput: string | null,
    userName: string
): Promise<{ success: boolean; message: string }> {
    try {
        const requestRef = adminDb.collection('purchaseRequests').doc(requestId);
        const nowIso = new Date().toISOString();
        const docketNo = String(docketNoInput || "").trim();
        
        await adminDb.runTransaction(async (transaction: any) => {
            const requestDoc = await transaction.get(requestRef);
            if (!requestDoc.exists) {
                throw new Error("Purchase request not found.");
            }
            
            const requestData = requestDoc.data() as PurchaseRequest;
            let fabricDetails = requestData.fabricDetails || [];

            // Find and update the specific item
            const itemNameKey = normalizeMatchKey(itemName);
            const itemIndex = fabricDetails.findIndex(
              (item) => normalizeMatchKey(item?.fabricName) === itemNameKey
            );
            if (itemIndex === -1) {
                throw new Error("Item not found in the purchase request.");
            }
            const purchaseLine = fabricDetails[itemIndex] || {};
            const targetKeys = buildMatchKeySet([
              itemName,
              purchaseLine.fabricName,
              purchaseLine.itemCode,
              purchaseLine.supplierCollectionCode,
            ]);

            // Update date if a new one is provided
            if (newDate) {
                fabricDetails[itemIndex].expectedDeliveryDate = newDate;
            }
            if (docketNo) {
                fabricDetails[itemIndex].docketNo = docketNo;
            }

            const linkedPoNumber = String(fabricDetails[itemIndex].poNumber || "").trim();
            let inboundRef: any = null;
            let inboundData: InboundRequest | null = null;
            if (linkedPoNumber) {
                inboundRef = adminDb.collection("inbounds").doc(linkedPoNumber);
                const inboundDoc = await transaction.get(inboundRef);
                if (inboundDoc.exists) {
                    inboundData = inboundDoc.data() as InboundRequest;
                }
            }
            
            const followUpMilestone: PurchaseStatus = {
                stepId: 2, // 'Delivery Follow Up'
                status: 'completed',
                completedAt: nowIso,
                completedBy: userName,
                itemName: itemName,
                remarks: [
                  "Follow-up confirmed.",
                  newDate ? `Delivery date updated to ${new Date(newDate).toLocaleDateString()}.` : "",
                  docketNo ? `Docket no: ${docketNo}.` : "",
                ]
                  .filter(Boolean)
                  .join(" "),
                ...(docketNo ? { docketNo } : {}),
            };

            transaction.update(requestRef, { 
                fabricDetails: fabricDetails,
                poMilestones: FieldValue.arrayUnion(followUpMilestone)
            });

            if (inboundRef && inboundData) {
                    const inboundItems = Array.isArray(inboundData?.items) ? [...inboundData.items] : [];
                    let touchedItems = false;

                    const nextItems = inboundItems.map((lineItem: any) => {
                        const isMatch = hasCommonKey(targetKeys, [
                          lineItem?.itemName,
                          lineItem?.itemCode,
                          lineItem?.supplierCollectionCode,
                          lineItem?.stockDetail?.bcn,
                          lineItem?.stockDetail?.itemCode,
                          lineItem?.stockDetail?.supplierCollectionCode,
                        ]);
                        if (!isMatch) return lineItem;
                        touchedItems = true;
                        const nextLine = { ...lineItem };
                        if (newDate) nextLine.expectedDeliveryDate = newDate;
                        if (docketNo) nextLine.docketNo = docketNo;
                        if (nextLine.stockDetail && typeof nextLine.stockDetail === "object") {
                            nextLine.stockDetail = {
                                ...nextLine.stockDetail,
                                ...(newDate ? { expectedDeliveryDate: newDate } : {}),
                                ...(docketNo ? { docketNo } : {}),
                            };
                        }
                        return nextLine;
                    });

                    let touchedStockDetails = false;
                    let nextStockDetails: any[] | undefined;
                    if (Array.isArray((inboundData as any).stockDetails)) {
                        nextStockDetails = (inboundData as any).stockDetails.map((line: any) => {
                            const isMatch = hasCommonKey(targetKeys, [
                              line?.bcn,
                              line?.itemCode,
                              line?.supplierCollectionCode,
                            ]);
                            if (!isMatch) return line;
                            touchedStockDetails = true;
                            return {
                                ...line,
                                ...(newDate ? { expectedDeliveryDate: newDate } : {}),
                                ...(docketNo ? { docketNo } : {}),
                            };
                        });
                    }

                    if (touchedItems || touchedStockDetails) {
                        const updatePayload: Record<string, unknown> = { items: nextItems, updatedAt: nowIso };
                        if (Array.isArray(nextStockDetails)) {
                            updatePayload.stockDetails = nextStockDetails;
                        }
                        transaction.update(inboundRef, updatePayload);
                    }
            }
        });

        return { success: true, message: `Follow-up for ${itemName} has been recorded.` };
    } catch (error: any) {
        console.error("Error updating follow-up status:", error);
        return { success: false, message: error.message };
    }
}
