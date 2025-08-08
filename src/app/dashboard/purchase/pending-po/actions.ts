

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
            
            const firstItem = group.items[0];
            const purchaseRequestId = firstItem.orderId; // This is the dealId / crmOrderNo
            
            const requestRef = adminDb.collection('purchaseRequests').doc(purchaseRequestId);
            
            const fabricDetailsForUpdate: FabricDetail[] = group.items.map(item => ({
                fabricName: item.collectionBrand,
                quantity: String(item.neededQty),
                vendorName: group.vendor,
                poNumber: poNumber, 
            }));

            // Update the existing request
            batch.update(requestRef, {
                status: 'PO Generated',
                vendor: group.vendor,
                courier: group.courier,
                mode: group.mode,
                fabricDetails: fabricDetailsForUpdate,
                'milestones': [], // Clear previous milestones if any
                'poMilestones': [], // Initialize poMilestones
            });

            // Create a new document in the `inbounds` collection
            const inboundRef = adminDb.collection('inbounds').doc(purchaseRequestId);
            const originalRequestDoc = await requestRef.get();
            const originalRequestData = originalRequestDoc.data() as PurchaseRequest;

            const inboundItems: InboundItem[] = fabricDetailsForUpdate.map(item => ({
                itemName: item.fabricName,
                quantity: item.quantity,
                unit: 'Mtr', // Assuming all are fabric for now
                poNumber: item.poNumber,
                inboundMilestones: [],
            }));

            const newInboundRequest: InboundRequest = {
                id: purchaseRequestId,
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
        
        await batch.commit();

        return { success: true, message: `Successfully created ${poNumbers.length} Purchase Orders. They have been moved to Inbound.` };
    } catch (error: any) {
        console.error("Error creating purchase request:", error);
        return { success: false, message: `Server error: ${error.message}` };
    }
}
