
'use server';

import { adminDb } from "@/lib/firebase-admin";
import { Order, Stock, PurchaseRequest, FabricDetail, FurnitureDetail, User } from "@/lib/types";

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
            const items = [...(request.fabricDetails || []), ...(request.furnitureDetails || [])];

            for (const item of items) {
                const itemName = (item as FabricDetail).fabricName || (item as FurnitureDetail).furnitureName;
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

            const fabricDetails: FabricDetail[] = [];
            const furnitureDetails: FurnitureDetail[] = [];
            
            const poNumber = Math.floor(1000 + Math.random() * 9000).toString();
            poNumbers.push(poNumber);

            const firstItem = group.items[0];
            const sourceOrderDoc = await adminDb.collection('orders').doc(firstItem.orderId).get();
            if (!sourceOrderDoc.exists()) {
                throw new Error(`Source order ${firstItem.orderId} not found.`);
            }
            const sourceOrder = sourceOrderDoc.data() as Order;

            for (const item of group.items) {
                const stockDocs = await adminDb.collection('stocks').where('bcn', '==', item.collectionBrand).limit(1).get();
                const stockType = stockDocs.docs[0]?.data()?.type || 'fabric';

                const commonDetails = {
                    quantity: String(item.neededQty),
                    vendorName: group.vendor,
                    poNumber: poNumber, 
                };

                if (stockType === 'fabric') {
                     fabricDetails.push({ fabricName: item.collectionBrand, ...commonDetails });
                } else {
                     furnitureDetails.push({ furnitureName: item.collectionBrand, ...commonDetails });
                }
            }
            
            const newRequestRef = adminDb.collection('purchaseRequests').doc();
            
            const newPurchaseRequest: Omit<PurchaseRequest, 'id'> = {
                dealId: sourceOrder.crmOrderNo,
                customerName: sourceOrder.customerName,
                promiseDeliveryDate: new Date().toISOString(),
                salesman: sourceOrder.salesPerson,
                type: fabricDetails.length > 0 ? 'fabric' : 'furniture',
                workType: 'production',
                fabricDetails,
                furnitureDetails,
                createdAt: new Date().toISOString(),
                createdBy: creator,
                milestones: [],
                vendorType: 'undecided',
                status: 'Pending Approval',
                vendor: group.vendor,
                courier: group.courier,
                mode: group.mode,
            };
            
            batch.set(newRequestRef, newPurchaseRequest);
        }
        
        await batch.commit();

        return { success: true, message: `Successfully created ${poNumbers.length} Purchase Requests. They are now pending approval.` };
    } catch (error: any) {
        console.error("Error creating purchase request:", error);
        return { success: false, message: `Server error: ${error.message}` };
    }
}
