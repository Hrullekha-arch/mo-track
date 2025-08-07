
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
        const ordersSnapshot = await adminDb.collection('orders').get();
        const stocksSnapshot = await adminDb.collection('stocks').get();

        const allOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        const allStocks = stocksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stock));
        
        const stockMap = new Map(allStocks.map(stock => [stock.bcn, stock]));

        const pendingItemsMap = new Map<string, PendingPoItem>();

        for (const order of allOrders) {
            const itemsInOrder = [
                ...(order.fabricDetails || []).map(item => ({ name: item.fabricName, quantity: parseFloat(item.quantity) })),
                ...(order.furnitureDetails || []).map(item => ({ name: item.furnitureName, quantity: parseFloat(item.quantity) }))
            ];

            for (const item of itemsInOrder) {
                if (!item.name || isNaN(item.quantity)) continue;

                const stockInfo = stockMap.get(item.name);
                const currentStock = stockInfo?.quantity || 0;
                
                // For now, let's add all items regardless of stock to populate the list.
                // The logic can be refined to `if (item.quantity > currentStock)` later.

                const existingItem = pendingItemsMap.get(item.name);

                if (existingItem) {
                    existingItem.totalOrderQty += item.quantity;
                } else {
                    pendingItemsMap.set(item.name, {
                        id: item.name,
                        collectionBrand: item.name,
                        serialNo: stockInfo?.serialNo || 'N/A',
                        hsnCode: stockInfo?.hsnCode || 'N/A',
                        mrp: stockInfo?.mrp || 0,
                        vendorName: stockInfo?.vendorName || 'N/A',
                        totalOrderQty: item.quantity,
                        stock: currentStock,
                    });
                }
            }
        }
        
        return Array.from(pendingItemsMap.values());

    } catch (error) {
        console.error("Error fetching pending PO items:", error);
        return [];
    }
}
