

'use server';

import { adminDb } from "@/lib/firebase-admin";
import { Order, Stock, PurchaseRequest, FabricDetail, FurnitureDetail } from "@/lib/types";

export interface PendingPoItem {
    id: string; // Combination of orderId and itemName
    collectionBrand: string;
    serialNo: string;
    hsnCode: string;
    mrp: number;
    vendorName: string;
    totalOrderQty: number;
    stock: number;
}

export async function getPendingPoItems(): Promise<PendingPoItem[]> {
    try {
        // Step 1: Fetch only active orders. 
        const ordersSnapshot = await adminDb.collection('orders').get();
        const allOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        
        const activeOrders = allOrders.filter(order => {
             const isCompleted = order.milestones.every(m => m.completed);
             return !isCompleted;
        });

        if (activeOrders.length === 0) {
            return [];
        }

        // Step 2: Aggregate all unique item names (BCNs) from active orders.
        const requiredItemsMap = new Map<string, { totalOrderQty: number, orders: string[] }>();

        for (const order of activeOrders) {
            const itemsInOrder = [
                ...(order.fabricDetails || []).map(item => ({ name: item.fabricName, quantity: parseFloat(item.quantity) })),
                ...(order.furnitureDetails || []).map(item => ({ name: item.furnitureName, quantity: parseFloat(item.quantity) }))
            ];

            for (const item of itemsInOrder) {
                if (!item.name || isNaN(item.quantity)) continue;
                
                const existing = requiredItemsMap.get(item.name);
                if (existing) {
                    existing.totalOrderQty += item.quantity;
                    if (!existing.orders.includes(order.id)) {
                        existing.orders.push(order.id);
                    }
                } else {
                    requiredItemsMap.set(item.name, { totalOrderQty: item.quantity, orders: [order.id] });
                }
            }
        }
        
        const requiredBcns = Array.from(requiredItemsMap.keys());
        if (requiredBcns.length === 0) {
            return [];
        }

        // Step 3: Fetch only the stock data for the required BCNs.
        const stockPromises = [];
        for (let i = 0; i < requiredBcns.length; i += 30) {
            const chunk = requiredBcns.slice(i, i + 30);
            stockPromises.push(
                adminDb.collection('stocks').where('bcn', 'in', chunk).get()
            );
        }
        
        const stockSnapshots = await Promise.all(stockPromises);
        const stockMap = new Map<string, Stock>();
        stockSnapshots.forEach(snapshot => {
            snapshot.docs.forEach(doc => {
                const stock = { id: doc.id, ...doc.data() } as Stock;
                if(stock.bcn) {
                   stockMap.set(stock.bcn, stock);
                }
            });
        });

        // Step 4 & 5: Compare, identify needs, and build the final list.
        const pendingItems: PendingPoItem[] = [];
        
        for (const [bcn, required] of requiredItemsMap.entries()) {
            const stockInfo = stockMap.get(bcn);
            const currentStock = stockInfo?.quantity || 0;
            const neededQty = required.totalOrderQty - currentStock;

            if (neededQty > 0) {
                 pendingItems.push({
                    id: bcn,
                    collectionBrand: bcn,
                    serialNo: stockInfo?.serialNo || 'N/A',
                    hsnCode: stockInfo?.hsnCode || 'N/A',
                    mrp: stockInfo?.mrp || 0,
                    vendorName: stockInfo?.vendorName || 'N/A',
                    totalOrderQty: neededQty, // Corrected: This now shows the shortfall
                    stock: currentStock,
                });
            }
        }
        
        return JSON.parse(JSON.stringify(pendingItems));

    } catch (error) {
        console.error("Error fetching pending PO items:", error);
        return [];
    }
}


export async function createPurchaseRequestAction(
    items: PendingPoItem[],
    creator: { id: string; name: string }
): Promise<{ success: boolean, message: string, requestId?: string }> {
    if (!items || items.length === 0) {
        return { success: false, message: "No items provided to create a purchase request." };
    }

    try {
        const fabricDetails: FabricDetail[] = [];
        const furnitureDetails: FurnitureDetail[] = [];

        for (const item of items) {
            // The 'totalOrderQty' from the report now correctly represents the shortfall.
            const neededQty = item.totalOrderQty;
            const stockInfo = await adminDb.collection('stocks').where('bcn', '==', item.collectionBrand).limit(1).get();
            const stockType = stockInfo.docs[0]?.data()?.type || 'fabric';

            if (stockType === 'fabric') {
                 fabricDetails.push({
                    fabricName: item.collectionBrand,
                    quantity: String(neededQty),
                    vendorName: item.vendorName,
                });
            } else {
                 furnitureDetails.push({
                    furnitureName: item.collectionBrand,
                    quantity: String(neededQty),
                    vendorName: item.vendorName,
                });
            }
        }
        
        const newRequestRef = adminDb.collection('purchaseRequests').doc();
        
        const newPurchaseRequest: Omit<PurchaseRequest, 'id'> = {
            dealId: `AGGREGATE-${new Date().getTime()}`,
            customerName: "Aggregated from multiple orders",
            promiseDeliveryDate: new Date().toISOString(),
            salesman: "System",
            type: fabricDetails.length > 0 ? 'fabric' : 'furniture',
            workType: 'production',
            fabricDetails,
            furnitureDetails,
            createdAt: new Date().toISOString(),
            createdBy: creator,
            milestones: [],
            vendorType: 'undecided',
            status: 'pending',
        };
        
        await newRequestRef.set(newPurchaseRequest);

        return { success: true, message: "Purchase request created successfully!", requestId: newRequestRef.id };
    } catch (error: any) {
        console.error("Error creating purchase request:", error);
        return { success: false, message: `Server error: ${error.message}` };
    }
}
