

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
        const ordersSnapshot = await adminDb.collection('orders').where('isAcknowledged', '==', true).get();
        const stockSnapshot = await adminDb.collection('stocks').get();
        
        const allOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        const stockMap = new Map<string, Stock>();
        stockSnapshot.docs.forEach(doc => {
            const stock = { id: doc.id, ...doc.data() } as Stock;
            if (stock.bcn) {
                stockMap.set(stock.bcn, stock);
            }
        });
        
        const activeOrders = allOrders.filter(order => {
             const isFullyCompleted = order.milestones.every(m => m.completed) && (!!order.feedbackRating || order.bypassedOtp === true);
             return !isFullyCompleted;
        });

        const pendingItems: PendingPoItem[] = [];

        for (const order of activeOrders) {
            const itemsInOrder = [
                ...(order.fabricDetails || []).map(item => ({ name: item.fabricName, quantity: parseFloat(item.quantity) })),
                ...(order.furnitureDetails || []).map(item => ({ name: item.furnitureName, quantity: parseFloat(item.quantity) }))
            ];
            
            const allocationsSnapshot = await adminDb.collection('orders').doc(order.id).collection('allocations').get();
            const allocations = allocationsSnapshot.docs.map(d => d.data());

            for (const item of itemsInOrder) {
                if (!item.name || isNaN(item.quantity) || item.quantity <= 0) continue;
                
                const stockInfo = stockMap.get(item.name);
                const availableStock = stockInfo?.quantity || 0;

                const totalAllocatedForThisItem = allocations
                    .filter(a => a.itemName === item.name)
                    .reduce((sum, alloc) => sum + alloc.quantityAllocated, 0);

                const neededFromStock = item.quantity - totalAllocatedForThisItem;
                
                if (neededFromStock > availableStock) {
                    const purchaseQty = neededFromStock - availableStock;
                    pendingItems.push({
                        id: `${order.id}-${item.name}`,
                        orderId: order.id,
                        salesman: order.salesPerson,
                        collectionBrand: item.name,
                        serialNo: stockInfo?.serialNo || 'N/A',
                        hsnCode: stockInfo?.hsnCode || 'N/A',
                        mrp: stockInfo?.mrp || 0,
                        vendorName: stockInfo?.vendorName || 'N/A',
                        neededQty: purchaseQty,
                        stock: stockInfo?.quantity || 0,
                    });
                }
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
            
            const firstItem = group.items[0];
            const sourceOrderDoc = await adminDb.collection('orders').doc(firstItem.orderId).get();
            const sourceOrder = sourceOrderDoc.data() as Order;

            const newRequestRef = adminDb.collection('purchaseRequests').doc();
            
            const newPurchaseRequest: Omit<PurchaseRequest, 'id'> = {
                dealId: sourceOrder.crmOrderNo,
                customerName: sourceOrder.customerName,
                promiseDeliveryDate: new Date().toISOString(),
                salesman: creator.name, // The person creating the PO is the one responsible.
                type: fabricDetails.length > 0 ? 'fabric' : 'furniture',
                workType: 'production',
                fabricDetails,
                furnitureDetails,
                createdAt: new Date().toISOString(),
                createdBy: creator,
                milestones: [],
                vendorType: 'undecided',
                status: 'pending',
                vendor: group.vendor,
                courier: group.courier,
                mode: group.mode,
            };
            
            batch.set(newRequestRef, newPurchaseRequest);
        }
        
        await batch.commit();

        return { success: true, message: `Successfully created ${poNumbers.length} Purchase Requests with POs: ${poNumbers.join(', ')}` };
    } catch (error: any) {
        console.error("Error creating purchase request:", error);
        return { success: false, message: `Server error: ${error.message}` };
    }
}
