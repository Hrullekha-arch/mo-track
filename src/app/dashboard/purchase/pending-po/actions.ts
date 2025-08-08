
'use server';

import { adminDb } from "@/lib/firebase-admin";
import { Order, Stock, PurchaseRequest, FabricDetail, User, InboundRequest, InboundItem } from "@/lib/types";

export interface PendingPoItem {
    id: string; // Combination of orderId and itemName
    orderId: string; // The ID of the order that needs this item
    salesman: string;
    collectionBrand: string;
    serialNo: string;
    hsnCode: string;
    mrp: number;
    vendorName: string;
    neededQty: number; // The quantity needed for this specific order
    stock: number;
}

export async function getPendingPoItems(): Promise<PendingPoItem[]> {
    try {
        const approvedRequestsSnapshot = await adminDb.collection('purchaseRequests').where('status', '==', 'Approved').get();
        
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
                    id: `${request.dealId}-${itemName}`,
                    orderId: request.dealId,
                    salesman: request.salesman,
                    collectionBrand: itemName,
                    serialNo: stockInfo?.serialNo || 'N/A',
                    hsnCode: stockInfo?.hsnCode || 'N/A',
                    mrp: stockInfo?.mrp || 0,
                    vendorName: item.vendorName || stockInfo?.vendorName || 'N/A',
                    neededQty: parseFloat(item.quantity),
                    stock: stockInfo?.quantity || 0,
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
    item: PendingPoItem;
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
        const { item, vendor, courier, mode } = poData;
        const purchaseRequestId = item.orderId;

        const requestRef = adminDb.collection('purchaseRequests').doc(purchaseRequestId);
        const originalRequestDoc = await requestRef.get();

        if (!originalRequestDoc.exists) {
            throw new Error(`Purchase request ${purchaseRequestId} not found.`);
        }
        
        const originalRequestData = originalRequestDoc.data() as PurchaseRequest;

        // Find the specific item in the fabricDetails array and update it
        const newFabricDetails = (originalRequestData.fabricDetails || []).map(originalItem => {
            if (originalItem.fabricName === item.collectionBrand) {
                return {
                    ...originalItem,
                    poNumber: poNumber,
                    vendorName: vendor,
                };
            }
            return originalItem;
        });

        const allItemsNowHavePo = newFabricDetails.every(i => !!i.poNumber);

        // Update the purchase request with the modified fabricDetails array
        batch.update(requestRef, {
            status: allItemsNowHavePo ? 'PO Generated' : 'Approved', // Mark as PO Generated only if all items have a PO
            vendor: vendor, // It might be better to store this per item if vendors differ
            courier: courier,
            mode: mode,
            fabricDetails: newFabricDetails,
        });

        // Create a new document in the `inbounds` collection for this specific PO
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
