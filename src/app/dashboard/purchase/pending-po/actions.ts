

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { PurchaseRequest, Stock, Quotation, Deal, Cpd } from '@/lib/types';

export interface PendingPoItem {
  id: string;
  purchaseRequestId?: string;
  fabricIndex?: number;
  quotationNo: string;
  dealId: string;
  customerName: string;
  salesman: string;
  collectionBrand: string;
  itemName: string;
  serialNo: string;
  hsnCode: string;
  mrp: number;
  vendorName: string;
  neededQty: number;
  stock: number;
  category: string;

  // ✅ NEW
  detailedStockItem?: any;       // full lengths doc + merged parent
  stockDocId?: string;           // stocks/{docId}
  productId?: string;            // lengths/{productId}
  originalRequest: PurchaseRequest;
}


export async function getPendingPoItems(): Promise<PendingPoItem[]> {
  try {
    const approvedRequestsSnapshot = await adminDb
      .collection("purchaseRequests")
      .where("status", "==", "Approved")
      .get();

    const pendingItems: PendingPoItem[] = [];

    for (const requestDoc of approvedRequestsSnapshot.docs) {
      const request = { id: requestDoc.id, ...requestDoc.data() } as PurchaseRequest;
      const items = request.fabricDetails || [];

      for (const [index, item] of items.entries()) {
        if (item.poNumber) continue;

        const bcn = item.fabricName; // BCN
        if (!bcn) continue;

        // ✅ 1) Find parent stock doc by BCN
        const stockParentSnap = await adminDb
          .collection("stocks")
          .where("bcn", "==", bcn)
          .limit(1)
          .get();

        const stockParentDoc = stockParentSnap.docs[0];
        const stockParent = stockParentDoc?.data() || null;

        // defaults
        let bestLengthDocData: any = null;
        let bestProductId: string | undefined = undefined;

        // ✅ 2) Fetch lengths subcollection (real stock details)
        if (stockParentDoc) {
          const lengthsSnap = await stockParentDoc.ref.collection("lengths").get();

          if (!lengthsSnap.empty) {
            // pick the "best" doc (you can change logic)
            // Here: choose doc with highest availableQty, else highest quantity
            const docs = lengthsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            docs.sort((a: any, b: any) => {
              const aAvail = Number(a.availableQty ?? a.quantity ?? 0);
              const bAvail = Number(b.availableQty ?? b.quantity ?? 0);
              return bAvail - aAvail;
            });

            bestLengthDocData = docs[0];
            bestProductId = String(bestLengthDocData.productId || bestLengthDocData.id || "");
          }
        }

        // ✅ 3) Merge parent + best length doc into one "detailedStockItem"
        const detailedStockItem = {
          ...(stockParent || {}),
          ...(bestLengthDocData || {}),
          stockDocId: stockParentDoc?.id || null,
          productId: bestProductId || null,
        };

        // ✅ Use these for UI/PO fields (prefer lengths doc)
        const finalItemName = detailedStockItem.itemName || "N/A";
        const finalHsn = detailedStockItem.hsnCode || "N/A";
        const finalMrp = Number(detailedStockItem.mrp || 0);

        // Category: prefer categoryGroup if category is blank
        const finalCategory =
          detailedStockItem.category ||
          detailedStockItem.categoryGroup ||
          "N/A";

        // Stock qty: prefer availableQty (more accurate), else quantity
        const finalStock = Number(
          detailedStockItem.availableQty ?? detailedStockItem.quantity ?? 0
        );

        pendingItems.push({
          id: `${requestDoc.id}-${bcn}-${index}`,
          purchaseRequestId: requestDoc.id,
          fabricIndex: index,
          quotationNo: request.quotationNo || request.dealId,
          dealId: request.dealId,
          customerName: request.customerName,
          salesman: request.salesman,
          collectionBrand: bcn,

          itemName: finalItemName,
          serialNo: detailedStockItem.supplierCollectionCode || "N/A",
          hsnCode: finalHsn,
          mrp: finalMrp,
          vendorName: item.vendorName || detailedStockItem.vendorName || detailedStockItem.supplierCompanyName || "N/A",

          neededQty: parseFloat(item.quantity),
          stock: finalStock,
          category: finalCategory,

          // ✅ NEW
          detailedStockItem,
          stockDocId: stockParentDoc?.id,
          productId: bestProductId,
          originalRequest: request,
        });
      }
    }

    return JSON.parse(JSON.stringify(pendingItems));
  } catch (error) {
    console.error("Error fetching pending PO items:", error);
    return [];
  }
}



export interface PoCreationData {
    vendor: string;
    courier: string;
    mode: string;
    tallyPoNumber?: string;
    isNewVendor: boolean;
    items: PendingPoItem[];
    promiseDeliveryDate?: string;
}

export async function createPurchaseOrderAction(
    poData: PoCreationData,
    creator: { id: string; name: string }
): Promise<{ success: boolean, message: string }> {
    if (!poData || !poData.items || poData.items.length === 0) {
        return { success: false, message: "No items provided to create purchase order." };
    }

    try {
        const batch = adminDb.batch();
        const poNumber = Math.floor(1000 + Math.random() * 9000).toString();
        const { items, vendor, courier, mode, tallyPoNumber, isNewVendor, promiseDeliveryDate } = poData;
        const cleanTallyPoNumber = String(tallyPoNumber || "").trim();

        // Group items by their original purchaseRequestId
        const requestsToUpdate = new Map<string, PendingPoItem[]>();
        for (const item of items) {
            const requestId = item.purchaseRequestId!;
            if (!requestsToUpdate.has(requestId)) {
                requestsToUpdate.set(requestId, []);
            }
            requestsToUpdate.get(requestId)!.push(item);
        }

        for (const [requestId, requestItems] of requestsToUpdate.entries()) {
            const requestRef = adminDb.collection('purchaseRequests').doc(requestId);
            const originalRequestDoc = await requestRef.get();

            if (!originalRequestDoc.exists) {
                console.warn(`Purchase request ${requestId} not found while creating PO. Skipping.`);
                continue;
            }
            
        const originalRequestData = originalRequestDoc.data() as PurchaseRequest;
        const itemsByIndex = new Map<number, PendingPoItem>();
        requestItems.forEach((item) => {
          if (typeof item.fabricIndex === "number") {
            itemsByIndex.set(item.fabricIndex, item);
          }
        });
        const itemsByBcn = new Map<string, PendingPoItem[]>();
        requestItems.forEach((item) => {
          const key = item.collectionBrand;
          if (!key) return;
          if (!itemsByBcn.has(key)) itemsByBcn.set(key, []);
          itemsByBcn.get(key)!.push(item);
        });

        const newFabricDetails = (originalRequestData.fabricDetails || []).map((originalItem, index) => {
            if (originalItem.poNumber) return originalItem;
            const indexedMatch = itemsByIndex.get(index);
            if (indexedMatch) {
                const updatedItemData = indexedMatch;
                return {
                    ...originalItem,
                    poNumber: poNumber,
                    vendorName: vendor,
                    expectedDeliveryDate: promiseDeliveryDate,
                    quantity: updatedItemData.neededQty.toString(),
                    ...(cleanTallyPoNumber ? { tallyPoNumber: cleanTallyPoNumber } : {}),
                };
            }
            const bcnMatches = itemsByBcn.get(originalItem.fabricName) || [];
            if (bcnMatches.length > 0) {
                const updatedItemData = bcnMatches.shift()!;
                return {
                    ...originalItem,
                    poNumber: poNumber,
                    vendorName: vendor,
                    expectedDeliveryDate: promiseDeliveryDate,
                    quantity: updatedItemData.neededQty.toString(),
                    ...(cleanTallyPoNumber ? { tallyPoNumber: cleanTallyPoNumber } : {}),
                };
            }
            return originalItem;
        });

            const allItemsInRequestHavePo = newFabricDetails.every(i => !!i.poNumber);

            const vendorTypeMilestone = {
                stepId: 3,
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: creator.name,
                remarks: isNewVendor ? "New Vendor" : "Existing Vendor"
            };
            const placeOrderMilestone = {
                stepId: 4,
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: creator.name,
                remarks: `PO ${poNumber} generated.`
            };
            const poConfirmationMilestone = {
                stepId: 1,
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: creator.name,
                remarks: `Automatically confirmed upon PO generation.`
            };

            const requestUpdatePayload: Record<string, any> = {
                status: allItemsInRequestHavePo ? 'PO Generated' : 'Approved',
                vendor: vendor, 
                courier: courier,
                mode: mode,
                fabricDetails: newFabricDetails,
                milestones: FieldValue.arrayUnion(vendorTypeMilestone, placeOrderMilestone),
                poMilestones: FieldValue.arrayUnion(poConfirmationMilestone),
                promiseDeliveryDate: promiseDeliveryDate,
            };
            if (cleanTallyPoNumber) {
              requestUpdatePayload.tallyPoNumber = cleanTallyPoNumber;
            }
            batch.update(requestRef, requestUpdatePayload);
        }
        
        const firstItem = items[0];
        const primaryRequest = firstItem.originalRequest;

        const inboundRef = adminDb.collection('inbounds').doc(poNumber);
        const inboundItems = items.map(item => ({
            itemName: item.collectionBrand,
            quantity: String(item.neededQty),
            unit: 'Mtr',
            poNumber: poNumber,
            inboundMilestones: [],
        }));

        const newInboundRequest = {
            id: poNumber,
            purchaseRequestId: firstItem.purchaseRequestId || primaryRequest.id || poNumber,
            dealId: primaryRequest.dealId,
            customerName: primaryRequest.customerName,
            vendor: vendor,
            ...(cleanTallyPoNumber ? { tallyPoNumber: cleanTallyPoNumber } : {}),
            createdAt: new Date().toISOString(),
            status: 'Active',
            items: inboundItems,
        };

        batch.set(inboundRef, newInboundRequest);
        
        await batch.commit();

        return { success: true, message: `Successfully created Purchase Order ${poNumber} for ${items.length} item(s).` };
    } catch (error: any) {
        console.error("Error creating purchase order:", error);
        return { success: false, message: `Server error: ${error.message}` };
    }
}

export async function deletePurchaseOrderAction(
  poNumberInput: string,
  actor: { id: string; name: string }
): Promise<{ success: boolean; message: string }> {
  const poNumber = String(poNumberInput || "").trim();
  if (!poNumber) {
    return { success: false, message: "PO number is required." };
  }

  if (!actor?.id) {
    return { success: false, message: "Missing user context." };
  }

  try {
    const actorSnap = await adminDb.collection("users").doc(actor.id).get();
    const actorRole = String(actorSnap.data()?.role || "").toLowerCase();
    if (actorRole !== "admin") {
      return { success: false, message: "Only admin can delete a PO." };
    }

    const inboundRef = adminDb.collection("inbounds").doc(poNumber);
    const inboundSnap = await inboundRef.get();
    const inboundData = inboundSnap.exists ? (inboundSnap.data() as any) : null;
    const inboundItems = Array.isArray(inboundData?.items) ? inboundData.items : [];

    const hasInboundProgress =
      inboundData?.status === "Completed" ||
      inboundItems.some((item: any) => {
        const receivedQty = Number(item?.receivedQty ?? 0);
        const milestones = Array.isArray(item?.inboundMilestones) ? item.inboundMilestones : [];
        const hasCompletedMilestone = milestones.some((m: any) => m?.status === "completed");
        return receivedQty > 0 || hasCompletedMilestone;
      });

    if (hasInboundProgress) {
      return {
        success: false,
        message: "Cannot delete this PO because inbound receiving has already started.",
      };
    }

    const requestSnap = await adminDb
      .collection("purchaseRequests")
      .where("status", "in", ["Approved", "PO Generated", "Completed"])
      .get();

    const affectedRequests: {
      ref: any;
      fabricDetails: any[];
      status: PurchaseRequest["status"];
      clearPoMilestones: boolean;
      clearPoFields: boolean;
    }[] = [];

    requestSnap.forEach((docSnap) => {
      const request = docSnap.data() as PurchaseRequest;
      const originalFabric = Array.isArray(request.fabricDetails) ? request.fabricDetails : [];
      let touched = false;

      const nextFabric = originalFabric.map((line: any) => {
        if (String(line?.poNumber || "") !== poNumber) return line;
        touched = true;
        const {
          poNumber: _poNumber,
          expectedDeliveryDate: _expectedDeliveryDate,
          tallyPoNumber: _tallyPoNumber,
          ...rest
        } = line || {};
        return rest;
      });

      if (!touched) return;

      const hasPoLeft = nextFabric.some((line: any) => !!line?.poNumber);
      affectedRequests.push({
        ref: docSnap.ref,
        fabricDetails: nextFabric,
        status: hasPoLeft ? "PO Generated" : "Approved",
        clearPoMilestones: !hasPoLeft,
        clearPoFields: !hasPoLeft,
      });
    });

    if (affectedRequests.length === 0 && !inboundSnap.exists) {
      return { success: false, message: `PO ${poNumber} not found.` };
    }

    const batch = adminDb.batch();

    for (const req of affectedRequests) {
      const payload: Record<string, any> = {
        fabricDetails: req.fabricDetails,
        status: req.status,
      };

      if (req.clearPoMilestones) {
        payload.poMilestones = FieldValue.delete();
      }
      if (req.clearPoFields) {
        payload.vendor = FieldValue.delete();
        payload.courier = FieldValue.delete();
        payload.mode = FieldValue.delete();
        payload.promiseDeliveryDate = FieldValue.delete();
        payload.tallyPoNumber = FieldValue.delete();
      }

      batch.update(req.ref, payload);
    }

    if (inboundSnap.exists) {
      batch.delete(inboundRef);
    }

    await batch.commit();

    return {
      success: true,
      message: `PO ${poNumber} deleted successfully. Updated ${affectedRequests.length} request(s).`,
    };
  } catch (error: any) {
    console.error("Error deleting purchase order:", error);
    return { success: false, message: error?.message || "Failed to delete PO." };
  }
}


export async function getQuotationDialogData(
  dealId: string,
  quotationNo: string
): Promise<{ quotation: Quotation; deal: Deal; cpds: Cpd[] } | null> {

  console.log(`[getQuotationDialogData] Initiated. Searching for dealId: "${dealId}", quotationNo: "${quotationNo}"`);

  try {
    console.log(`[getQuotationDialogData] Querying 'quotations' collection group for quotationNo: "${quotationNo}"`);
    const quotationQuery = adminDb.collectionGroup('quotations').where('quotationNo', '==', quotationNo).limit(1);
    const quotationSnapshot = await quotationQuery.get();

    if (quotationSnapshot.empty) {
        console.warn(`[getQuotationDialogData] ⚠️ Quotation with number "${quotationNo}" not found.`);
      return null;
    }

    const quotationDoc = quotationSnapshot.docs[0];
    const quotationData = { id: quotationDoc.id, ...quotationDoc.data() } as Quotation;
    console.log(`[getQuotationDialogData] ✅ Found quotation:`, quotationDoc.ref.path);

    const dealRef = quotationDoc.ref.parent.parent;
    if (!dealRef) {
      console.error(`[getQuotationDialogData] ❌ Could not get parent 'deal' reference from quotation.`);
      return null;
    }
    
    const dealSnap = await dealRef.get();
    if (!dealSnap.exists) {
       console.warn(`[getQuotationDialogData] ⚠️ Deal document not found at path: ${dealRef.path}`);
       return null;
    }
    const dealData = { id: dealSnap.id, ...dealSnap.data() } as Deal;
    console.log(`[getQuotationDialogData] ✅ Found deal:`, dealSnap.id);

    const cpdsSnap = await dealRef.collection('cpds').get();
    const cpdsData = cpdsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Cpd[];
    console.log(`[getQuotationDialogData] ✅ Found ${cpdsData.length} CPDs for this deal.`);
    
    return JSON.parse(JSON.stringify({
      quotation: quotationData,
      deal: dealData,
      cpds: cpdsData
    }));

  } catch (error) {
    console.error("[getQuotationDialogData] ❌ CRITICAL ERROR:", error);
    return null;
  }
}
