
'use server';

import { adminDb } from "@/lib/firebase-admin";
import { Order, Stock } from "@/lib/types";

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
        // We can't perfectly filter for "not fully completed" on the backend easily.
        // A good proxy is to get orders that don't have a `completedAt` field.
        // For this implementation, we will fetch all and filter locally, which is still better than fetching all stock.
        const ordersSnapshot = await adminDb.collection('orders').get();
        const allOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        
        // This logic should be refined if a `isCompleted` flag is added to orders.
        const activeOrders = allOrders.filter(order => {
             const isCompleted = order.milestones.every(m => m.completed);
             return !isCompleted;
        });

        if (activeOrders.length === 0) {
            return [];
        }

        // Step 2: Aggregate all unique item names (BCNs) from active orders.
        const requiredItemsMap = new Map<string, { totalOrderQty: number }>();

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
                } else {
                    requiredItemsMap.set(item.name, { totalOrderQty: item.quantity });
                }
            }
        }
        
        const requiredBcns = Array.from(requiredItemsMap.keys());
        if (requiredBcns.length === 0) {
            return [];
        }

        // Step 3: Fetch only the stock data for the required BCNs.
        // Firestore 'in' query is limited to 30 items. If you have more, we need to do multiple queries.
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

            // Only add to pending list if required quantity is greater than stock
            if (required.totalOrderQty > currentStock) {
                 pendingItems.push({
                    id: bcn,
                    collectionBrand: bcn,
                    serialNo: stockInfo?.serialNo || 'N/A',
                    hsnCode: stockInfo?.hsnCode || 'N/A',
                    mrp: stockInfo?.mrp || 0,
                    vendorName: stockInfo?.vendorName || 'N/A',
                    totalOrderQty: required.totalOrderQty,
                    stock: currentStock,
                });
            }
        }
        
        return pendingItems;

    } catch (error) {
        console.error("Error fetching pending PO items:", error);
        return [];
    }
}
