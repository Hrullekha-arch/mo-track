

'use server';

import { adminDb } from "@/lib/firebase-admin";
import { Order, Stock, PurchaseRequest, FabricDetail, FurnitureDetail } from "@/lib/types";

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
        const activePrSnapshot = await adminDb.collection('purchaseRequests').where('status', '==', 'pending').get();

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

        const inFlightItems = new Map<string, number>();
        activePrSnapshot.docs.forEach(doc => {
            const pr = doc.data() as PurchaseRequest;
            const items = [...(pr.fabricDetails || []), ...(pr.furnitureDetails || [])];
            items.forEach(item => {
                const name = (item as FabricDetail).fabricName || (item as FurnitureDetail).furnitureName;
                const quantity = parseFloat(item.quantity) || 0;
                if (name) {
                    inFlightItems.set(name, (inFlightItems.get(name) || 0) + quantity);
                }
            });
        });

        const tempStockMap = new Map<string, number>();
        stockMap.forEach((stock, bcn) => {
            tempStockMap.set(bcn, stock.quantity);
        });

        const pendingItems: PendingPoItem[] = [];

        for (const order of activeOrders) {
            const itemsInOrder = [
                ...(order.fabricDetails || []).map(item => ({ name: item.fabricName, quantity: parseFloat(item.quantity) })),
                ...(order.furnitureDetails || []).map(item => ({ name: item.furnitureName, quantity: parseFloat(item.quantity) }))
            ];

            for (const item of itemsInOrder) {
                if (!item.name || isNaN(item.quantity) || item.quantity <= 0) continue;
                
                const availableStock = tempStockMap.get(item.name) || 0;
                const inFlightQty = inFlightItems.get(item.name) || 0;
                const effectiveStock = availableStock - inFlightQty;
                
                if (item.quantity > effectiveStock) {
                    const neededQty = item.quantity - effectiveStock;
                    const stockInfo = stockMap.get(item.name);
                    
                    pendingItems.push({
                        id: `${order.id}-${item.name}`,
                        orderId: order.id,
                        salesman: order.salesPerson,
                        collectionBrand: item.name,
                        serialNo: stockInfo?.serialNo || 'N/A',
                        hsnCode: stockInfo?.hsnCode || 'N/A',
                        mrp: stockInfo?.mrp || 0,
                        vendorName: stockInfo?.vendorName || 'N/A',
                        neededQty: neededQty,
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


export async function createPurchaseRequestAction(
    items: PendingPoItem[],
    creator: { id: string; name: string },
    poDetails: { vendor?: string; courier: string; mode: string }
): Promise<{ success: boolean, message: string, requestId?: string }> {
    if (!items || items.length === 0) {
        return { success: false, message: "No items provided to create a purchase request." };
    }

    try {
        const fabricDetails: FabricDetail[] = [];
        const furnitureDetails: FurnitureDetail[] = [];
        
        const poNumber = Math.floor(1000 + Math.random() * 9000).toString();

        for (const item of items) {
            const stockInfo = await adminDb.collection('stocks').where('bcn', '==', item.collectionBrand).limit(1).get();
            const stockType = stockInfo.docs[0]?.data()?.type || 'fabric';

            const commonDetails = {
                quantity: String(item.neededQty),
                vendorName: poDetails.vendor || item.vendorName,
                poNumber: poNumber, 
            };

            if (stockType === 'fabric') {
                 fabricDetails.push({
                    fabricName: item.collectionBrand,
                    ...commonDetails,
                });
            } else {
                 furnitureDetails.push({
                    furnitureName: item.collectionBrand,
                    ...commonDetails,
                });
            }
        }
        
        const firstItem = items[0];
        // Fetch the source order to get accurate customer and salesman details
        const sourceOrderDoc = await adminDb.collection('orders').doc(firstItem.orderId).get();
        if (!sourceOrderDoc.exists) {
            return { success: false, message: `Source order ${firstItem.orderId} not found.`};
        }
        const sourceOrder = sourceOrderDoc.data() as Order;

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
            status: 'pending',
            vendor: poDetails.vendor,
            courier: poDetails.courier,
            mode: poDetails.mode,
        };
        
        await newRequestRef.set(newPurchaseRequest);

        return { success: true, message: `Purchase Request with PO #${poNumber} created successfully!`, requestId: newRequestRef.id };
    } catch (error: any) {
        console.error("Error creating purchase request:", error);
        return { success: false, message: `Server error: ${error.message}` };
    }
}
