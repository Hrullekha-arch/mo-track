

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { PurchaseRequest, Stock, Quotation, Deal, Cpd } from '@/lib/types';

export interface PendingPoItem {
  id: string;
  purchaseRequestId?: string;
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
      const request = requestDoc.data() as PurchaseRequest;
      const items = request.fabricDetails || [];

      for (const item of items) {
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
          id: `${requestDoc.id}-${bcn}`,
          purchaseRequestId: requestDoc.id,
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
    isNewVendor: boolean;
    item: PendingPoItem;
    promiseDeliveryDate?: string;
}

export async function createPurchaseRequestAction(
    poData: PoCreationData,
    creator: { id: string; name: string }
): Promise<{ success: boolean, message: string }> {
    if (!poData || !poData.item) {
        return { success: false, message: "No data provided to create purchase request." };
    }

    try {
        const batch = adminDb.batch();
        const poNumber = Math.floor(1000 + Math.random() * 9000).toString();
        const { item, vendor, courier, mode, isNewVendor, promiseDeliveryDate } = poData;
        const purchaseRequestId = item.purchaseRequestId || item.id.split('-')[0]; // Extract the original request ID

        const requestRef = adminDb.collection('purchaseRequests').doc(purchaseRequestId);
        const originalRequestDoc = await requestRef.get();

        if (!originalRequestDoc.exists) {
            throw new Error(`Purchase request ${purchaseRequestId} not found.`);
        }
        
        const originalRequestData = originalRequestDoc.data() as PurchaseRequest;

        // Find the specific item in the fabricDetails array and update it
        let itemFoundAndUpdated = false;
        const newFabricDetails = (originalRequestData.fabricDetails || []).map(originalItem => {
            if (originalItem.fabricName === item.collectionBrand && !originalItem.poNumber) {
                itemFoundAndUpdated = true;
                return {
                    ...originalItem,
                    poNumber: poNumber,
                    vendorName: vendor,
                    expectedDeliveryDate: promiseDeliveryDate || new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
                };
            }
            return originalItem;
        });
        
        if (!itemFoundAndUpdated) {
            throw new Error(`Item ${item.collectionBrand} not found or already has a PO in request ${purchaseRequestId}.`);
        }

        const allItemsNowHavePo = newFabricDetails.every(i => !!i.poNumber);

        const vendorTypeMilestone = {
            stepId: 3,
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: creator.name,
            remarks: isNewVendor ? "New Vendor" : "Existing Vendor"
        };
        const placeOrderMilestone = {
            stepId: 4, // Corrected Step ID for "Place Order"
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: creator.name,
            remarks: `PO ${poNumber} generated.`
        };

        // --- AUTOMATION: Automatically complete PO Confirmation ---
        const poConfirmationMilestone = {
            stepId: 1, // Step ID for "PO Confirmation" from PO_PROCESS_CONFIG
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: creator.name,
            remarks: `Automatically confirmed upon PO generation for item ${item.collectionBrand}.`
        };

        batch.update(requestRef, {
            status: allItemsNowHavePo ? 'PO Generated' : 'Approved',
            vendor: vendor, 
            courier: courier,
            mode: mode,
            fabricDetails: newFabricDetails,
            milestones: adminDb.firestore.FieldValue.arrayUnion(vendorTypeMilestone, placeOrderMilestone),
            poMilestones: adminDb.firestore.FieldValue.arrayUnion(poConfirmationMilestone),
            promiseDeliveryDate: promiseDeliveryDate || new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
        });

        const inboundRef = adminDb.collection('inbounds').doc(poNumber);
        const inboundItems = [{
            itemName: item.collectionBrand,
            quantity: String(item.neededQty),
            unit: 'Mtr', // Assuming fabric
            poNumber: poNumber,
            inboundMilestones: [],
        }];

        const newInboundRequest = {
            id: poNumber,
            purchaseRequestId: purchaseRequestId,
            dealId: originalRequestData.dealId,
            customerName: originalRequestData.customerName,
            vendor: vendor,
            createdAt: new Date().toISOString(),
            status: 'Active',
            items: inboundItems,
        };

        batch.set(inboundRef, newInboundRequest);
        
        await batch.commit();

        return { success: true, message: `Successfully created Purchase Order ${poNumber} for item ${item.collectionBrand}. It has been moved to Inbound.` };
    } catch (error: any) {
        console.error("Error creating purchase request:", error);
        return { success: false, message: `Server error: ${error.message}` };
    }
}

export async function getQuotationDialogData(dealId: string, quotationNo: string): Promise<{ quotation: Quotation; deal: Deal; cpds: Cpd[] } | null> {
    console.log(`[getQuotationDialogData] Initiated. Searching for quotationNo: "${quotationNo}"`);
    if (!quotationNo) {
        console.error("[getQuotationDialogData] Error: Missing quotationNo.");
        return null;
    }

    try {
        // 1. Find the quotation document directly using the quotation number
        console.log(`[getQuotationDialogData] Querying 'quotations' collection group for quotationNo: "${quotationNo}"`);
        const quotationQuery = adminDb.collectionGroup('quotations').where('quotationNo', '==', quotationNo).limit(1);
        const quotationSnapshot = await quotationQuery.get();

        if (quotationSnapshot.empty) {
            console.warn(`[getQuotationDialogData] ⚠️ Quotation with number "${quotationNo}" not found.`);
            return null;
        }
        
        const quotationDoc = quotationSnapshot.docs[0];
        const quotationData = { id: quotationDoc.id, ...quotationDoc.data() } as Quotation;
        console.log(`[getQuotationDialogData] ✅ Found quotation document at path: ${quotationDoc.ref.path}`);

        // 2. From the quotation, get the parent deal document reference
        const dealRef = quotationDoc.ref.parent.parent;
        if (!dealRef) {
             console.error("[getQuotationDialogData] ❌ Could not resolve parent 'deal' from quotation.");
             return null;
        }

        const dealSnap = await dealRef.get();
        if (!dealSnap.exists) {
            console.warn(`[getQuotationDialogData] ⚠️ Deal document at path ${dealRef.path} does not exist.`);
            return null;
        }
        const dealData = { id: dealSnap.id, ...dealSnap.data() } as Deal;
        console.log(`[getQuotationDialogData] ✅ Found deal document: ${dealSnap.id}`);

        
        // 3. Fetch CPDs from the deal's subcollection
        console.log(`[getQuotationDialogData] Fetching CPDs for deal ${dealSnap.id}...`);
        const cpdsSnap = await dealRef.collection('cpds').get();
        const cpdsData = cpdsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Cpd);
        console.log(`[getQuotationDialogData] ✅ Found ${cpdsData.length} CPDs.`);

        // 4. Serialize and return the complete payload
        const result = {
            quotation: quotationData,
            deal: dealData,
            cpds: cpdsData
        };
        console.log("[getQuotationDialogData] 🎉 Successfully compiled all data. Returning to client.");
        return JSON.parse(JSON.stringify(result));
        
    } catch (error) {
        console.error("[getQuotationDialogData] ❌ CRITICAL ERROR:", error);
        return null;
    }
}
