

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
    items: PendingPoItem[];
}

export async function createPurchaseRequestAction(
    poData: PoCreationData[],
    creator: { id: string; name: string }
): Promise<{ success: boolean, message: string }> {
    if (!poData || poData.length === 0) {
        return { success: false, message: "No data provided to create purchase requests." };
    }

    try {
        const batch = adminDb.batch();
        const poNumbers: string[] = [];

        for (const group of poData) {
            if (group.items.length === 0) continue;
            
            const poNumber = Math.floor(1000 + Math.random() * 9000).toString();
            poNumbers.push(poNumber);
            
            // Group items by their original purchaseRequestId (dealId)
            const itemsByRequest = group.items.reduce((acc, item) => {
                const requestId = item.orderId;
                if (!acc[requestId]) {
                    acc[requestId] = [];
                }
                acc[requestId].push(item);
                return acc;
            }, {} as Record<string, PendingPoItem[]>);


            for (const purchaseRequestId in itemsByRequest) {
                const requestRef = adminDb.collection('purchaseRequests').doc(purchaseRequestId);
                const originalRequestDoc = await requestRef.get();
                if (!originalRequestDoc.exists()) {
                    console.warn(`Purchase request ${purchaseRequestId} not found. Skipping.`);
                    continue;
                }
                const originalRequestData = originalRequestDoc.data() as PurchaseRequest;
                const itemsForThisRequest = itemsByRequest[purchaseRequestId];

                // Create a map of items being updated for easy lookup
                const updatedItemsMap = new Map(itemsForThisRequest.map(i => [i.collectionBrand, i]));

                // Create the new, merged fabricDetails array
                const newFabricDetails = (originalRequestData.fabricDetails || []).map(originalItem => {
                    if (updatedItemsMap.has(originalItem.fabricName)) {
                        // This item is in the current PO batch, so update it
                        return {
                            ...originalItem,
                            poNumber: poNumber,
                            vendorName: group.vendor,
                        };
                    }
                    // This item was part of the original request but not in this PO batch, so keep it as is
                    return originalItem;
                });
                
                // Update the existing request with the merged item list
                batch.update(requestRef, {
                    status: 'PO Generated',
                    vendor: group.vendor,
                    courier: group.courier,
                    mode: group.mode,
                    fabricDetails: newFabricDetails,
                    'milestones': [],
                    'poMilestones': [],
                });

                // Create a new document in the `inbounds` collection for this specific PO
                const inboundRef = adminDb.collection('inbounds').doc(poNumber);

                const inboundItems: InboundItem[] = itemsForThisRequest.map(item => ({
                    itemName: item.collectionBrand,
                    quantity: String(item.neededQty),
                    unit: 'Mtr', // Assuming all are fabric for now
                    poNumber: poNumber,
                    inboundMilestones: [],
                }));

                const newInboundRequest: InboundRequest = {
                    id: poNumber, // Use the PO Number as the ID for inbound requests
                    purchaseRequestId: purchaseRequestId,
                    dealId: originalRequestData.dealId,
                    customerName: originalRequestData.customerName,
                    vendor: group.vendor,
                    createdAt: new Date().toISOString(),
                    status: 'Active',
                    items: inboundItems,
                };

                batch.set(inboundRef, newInboundRequest);
            }
        }
        
        await batch.commit();

        return { success: true, message: `Successfully created ${poNumbers.length} Purchase Orders. They have been moved to Inbound.` };
    } catch (error: any) {
        console.error("Error creating purchase request:", error);
        return { success: false, message: `Server error: ${error.message}` };
    }
}
