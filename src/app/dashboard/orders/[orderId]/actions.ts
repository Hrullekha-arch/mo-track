

'use server'

import { adminDb } from '@/lib/firebase-admin';
import { Order, Stock, StockTransaction, InvoiceBatch, InvoiceBatchItem, O2DStatus } from '@/lib/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';


export async function getAvailableStockLengths(stockId: string): Promise<{ success: boolean; message: string; lengths?: { length: number; transactionId: string }[] }> {
    try {
        const stockAddedSnapshot = await adminDb.collection('stocks').doc(stockId).collection('stockAdded').get();
        
        const availableLengths: { length: number; transactionId: string }[] = [];
        stockAddedSnapshot.docs.forEach(doc => {
            const data = doc.data() as StockTransaction;
            if (data.quantityChange > 0) {
                 availableLengths.push({ length: data.quantityChange, transactionId: doc.id });
            }
        });

        return { success: true, message: 'Lengths fetched.', lengths: availableLengths.sort((a,b) => a.length - b.length) };

    } catch (error: any) {
        console.error("Error fetching available stock lengths:", error);
        return { success: false, message: 'Failed to fetch available stock.' };
    }
}


export async function allocateStockToAction(
    { orderId, stockId, itemName, allocatedQty, userId, userName }: 
    { orderId: string, stockId: string, itemName: string, allocatedQty: number, userId: string, userName: string }
): Promise<{ success: boolean; message: string }> {
    try {
       await adminDb.runTransaction(async (transaction) => {
            const stockRef = adminDb.collection('stocks').doc(stockId);
            const orderRef = adminDb.collection('orders').doc(orderId);
            
            // --- ALL READS FIRST ---
            const stockDoc = await transaction.get(stockRef);
            const orderDoc = await transaction.get(orderRef);
            
            if (!stockDoc.exists) {
                throw new Error("Stock item not found.");
            }
            if (!orderDoc.exists) {
                throw new Error("Order not found.");
            }
            
            const stockData = stockDoc.data() as Stock;
            const orderData = orderDoc.data() as Order;

            if (stockData.availableQty < allocatedQty) {
                throw new Error(`Insufficient available stock for ${itemName}. Available: ${stockData.availableQty}, Required: ${allocatedQty}`);
            }

            // --- ALL WRITES AFTER ---

            // 1. Update stock quantities
            transaction.update(stockRef, {
                reservedQty: FieldValue.increment(allocatedQty),
                availableQty: FieldValue.increment(-allocatedQty),
                lastUpdatedAt: new Date().toISOString()
            });

            // 2. Create an allocation log in the order's subcollection
            const allocationData = {
                stockId,
                itemName,
                quantityAllocated: allocatedQty,
                allocatedAt: new Date().toISOString(),
                allocatedBy: userName,
                status: 'reserved'
            };
            const allocationRef = orderRef.collection('allocations').doc();
            transaction.set(allocationRef, allocationData);
            
            // 3. Update the main order's "Fabric Allocated" milestone
            const updatedMilestones = orderData.milestones.map(m => {
                if (m.id === 2) { // ID for "Fabric Allocated"
                    return { ...m, completed: true, completedAt: new Date().toISOString(), completedBy: userName };
                }
                return m;
            });
            transaction.update(orderRef, { milestones: updatedMilestones });
       });

        return { success: true, message: 'Stock reserved successfully.' };

    } catch (error: any) {
        console.error("Error in allocateStockToAction:", error);
        return { success: false, message: `Failed to allocate stock: ${error.message}` };
    }
}


export async function getOrderAllocations(orderId: string): Promise<any[]> {
    try {
        const snapshot = await adminDb.collection('orders').doc(orderId).collection('allocations').get();
        if (snapshot.empty) {
            return [];
        }
        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error("Error fetching order allocations:", error);
        return [];
    }
}
