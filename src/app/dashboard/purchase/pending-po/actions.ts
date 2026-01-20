

'use server';

import { adminDb } from "@/lib/firebase-admin";
import { PurchaseRequest, Stock, InboundRequest, InboundItem, PurchaseStatus } from "@/lib/types";
import { FieldValue } from 'firebase-admin/firestore';
import { addDays } from 'date-fns';

export interface PendingPoItem {
    id: string; // Combination of orderId and itemName
    purchaseRequestId?: string;
    orderId: string;
    salesman: string;
    collectionBrand: string;
    itemName: string; // Descriptive name
    serialNo: string;
    hsnCode: string;
    mrp: number;
    vendorName: string;
    neededQty: number;
    stock: number;
    category: string;
}

export async function getPendingPoItems(): Promise<PendingPoItem[]> {
    try {
        const approvedRequestsSnapshot = await adminDb.collection('purchaseRequests')
            .where('status', '==', 'Approved')
            .get();
        
        const pendingItems: PendingPoItem[] = [];

        for (const requestDoc of approvedRequestsSnapshot.docs) {
            const request = requestDoc.data() as PurchaseRequest;
            const items = request.fabricDetails || [];

            for (const item of items) {
                // If an item already has a PO number, it's not "pending" for a new PO.
                if (item.poNumber) continue;

                const itemName = item.fabricName;
                if (!itemName) continue;

                const stockDocs = await adminDb.collection('stocks').where('bcn', '==', itemName).limit(1).get();
                const stockInfo = stockDocs.docs[0]?.data() as Stock | undefined;
                
                pendingItems.push({
                    id: `${requestDoc.id}-${itemName}`, // Use requestDoc.id which is the Firestore document ID
                    purchaseRequestId: requestDoc.id,
                    orderId: request.dealId,
                    salesman: request.salesman,
                    collectionBrand: itemName, // This is the BCN
                    itemName: stockInfo?.itemName || 'N/A', // This is the descriptive name
                    serialNo: stockInfo?.serialNo || 'N/A',
                    hsnCode: stockInfo?.hsnCode || 'N/A',
                    mrp: stockInfo?.mrp || 0,
                    vendorName: item.vendorName || stockInfo?.vendorName || 'N/A',
                    neededQty: parseFloat(item.quantity),
                    stock: stockInfo?.quantity || 0,
                    category: stockInfo?.category || 'N/A',
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
                    expectedDeliveryDate: promiseDeliveryDate || addDays(new Date(), 6).toISOString(),
                };
            }
            return originalItem;
        });
        
        if (!itemFoundAndUpdated) {
            throw new Error(`Item ${item.collectionBrand} not found or already has a PO in request ${purchaseRequestId}.`);
        }

        const allItemsNowHavePo = newFabricDetails.every(i => !!i.poNumber);

        const vendorTypeMilestone: PurchaseStatus = {
            stepId: 3,
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: creator.name,
            remarks: isNewVendor ? "New Vendor" : "Existing Vendor"
        };
        const placeOrderMilestone: PurchaseStatus = {
            stepId: 4, // Corrected Step ID for "Place Order"
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: creator.name,
            remarks: `PO ${poNumber} generated.`
        };

        // --- AUTOMATION: Automatically complete PO Confirmation ---
        const poConfirmationMilestone: PurchaseStatus = {
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
            milestones: FieldValue.arrayUnion(vendorTypeMilestone, placeOrderMilestone),
            poMilestones: FieldValue.arrayUnion(poConfirmationMilestone),
            promiseDeliveryDate: promiseDeliveryDate || addDays(new Date(), 6).toISOString(),
        });

        const inboundRef = adminDb.collection('inbounds').doc(poNumber);
        const inboundItems: InboundItem[] = [{
            itemName: item.collectionBrand,
            quantity: String(item.neededQty),
            unit: 'Mtr', // Assuming fabric
            poNumber: poNumber,
            inboundMilestones: [],
        }];

        const newInboundRequest: InboundRequest = {
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
