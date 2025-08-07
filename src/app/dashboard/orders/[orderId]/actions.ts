
'use server'

import { adminDb } from '@/lib/firebase-admin';
import { Stock, StockTransaction } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';


export async function getAvailableStockLengths(stockId: string): Promise<{ success: boolean; message: string; lengths?: { length: number; transactionId: string }[] }> {
    try {
        const stockAddedSnapshot = await adminDb.collection('stocks').doc(stockId).collection('stockAdded').get();
        const stockSoldSnapshot = await adminDb.collection('stocks').doc(stockId).collection('stockSold').get();

        const addedLengths = stockAddedSnapshot.docs.flatMap(doc => {
            const data = doc.data() as StockTransaction;
            return (data.lengths || []).map(length => ({ length, transactionId: doc.id }));
        });
        
        const soldLengths = stockSoldSnapshot.docs.flatMap(doc => {
            const data = doc.data() as StockTransaction;
            return (data.lengths || []);
        });

        // This is a simple subtraction, assumes lengths are unique enough for this logic.
        // A more robust system might mark specific lengths as used.
        const availableLengths = addedLengths.filter(added => {
            const indexInSold = soldLengths.findIndex(sold => sold === added.length);
            if (indexInSold > -1) {
                soldLengths.splice(indexInSold, 1);
                return false;
            }
            return true;
        });

        return { success: true, message: 'Lengths fetched.', lengths: availableLengths };

    } catch (error: any) {
        console.error("Error fetching available stock lengths:", error);
        return { success: false, message: 'Failed to fetch available stock.' };
    }
}

export async function allocateStockToAction(
    { orderId, stockId, itemName, allocatedLengths, userId, userName }: 
    { orderId: string, stockId: string, itemName: string, allocatedLengths: { length: number, transactionId: string }[], userId: string, userName: string }
): Promise<{ success: boolean; message: string }> {
    try {
        const stockRef = adminDb.collection('stocks').doc(stockId);
        const orderRef = adminDb.collection('orders').doc(orderId);
        const allocationRef = orderRef.collection('allocations').doc(); // New allocation document
        const stockSoldRef = stockRef.collection('stockSold').doc(); // New transaction document
        
        const totalAllocatedQty = allocatedLengths.reduce((sum, l) => sum + l.length, 0);

        await adminDb.runTransaction(async (transaction) => {
            const stockDoc = await transaction.get(stockRef);
            if (!stockDoc.exists) {
                throw new Error("Stock item not found.");
            }

            const currentQuantity = stockDoc.data()?.quantity || 0;
            if (currentQuantity < totalAllocatedQty) {
                throw new Error("Insufficient stock quantity.");
            }

            // 1. Update stock quantity
            transaction.update(stockRef, {
                quantity: FieldValue.increment(-totalAllocatedQty)
            });

            // 2. Create allocation record under the order
            const allocationData = {
                stockId,
                itemName,
                quantityAllocated: totalAllocatedQty,
                lengths: allocatedLengths.map(l => l.length),
                allocatedAt: new Date().toISOString(),
                allocatedBy: userName,
            };
            transaction.set(allocationRef, allocationData);

            // 3. Create a stockSold transaction
            const stockSoldData: Omit<StockTransaction, 'id'> = {
                stockId: stockId,
                bcn: stockDoc.data()?.bcn || '',
                type: 'deduction',
                quantityChange: -totalAllocatedQty,
                orderId: orderId,
                lengths: allocatedLengths.map(l => l.length),
                createdAt: new Date().toISOString(),
                createdBy: userName,
            };
            transaction.set(stockSoldRef, stockSoldData);
        });

        return { success: true, message: 'Stock allocated successfully.' };
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
