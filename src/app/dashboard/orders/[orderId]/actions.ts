
'use server'

import { adminDb } from '@/lib/firebase-admin';
import { Order, Stock, StockTransaction, InvoiceBatch, InvoiceBatchItem } from '@/lib/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';


export async function getAvailableStockLengths(stockId: string): Promise<{ success: boolean; message: string; lengths?: { length: number; transactionId: string }[] }> {
    try {
        const stockAddedSnapshot = await adminDb.collection('stocks').doc(stockId).collection('stockAdded').get();
        const stockSoldSnapshot = await adminDb.collection('stocks').doc(stockId).collection('stockSold').get();

        const addedLengthCounts: { [key: number]: { count: number, transactionIds: string[] } } = {};
        stockAddedSnapshot.docs.forEach(doc => {
            const data = doc.data() as StockTransaction;
            (data.lengths || []).forEach(length => {
                if (!addedLengthCounts[length]) {
                    addedLengthCounts[length] = { count: 0, transactionIds: [] };
                }
                addedLengthCounts[length].count++;
                if (!addedLengthCounts[length].transactionIds.includes(doc.id)) {
                    addedLengthCounts[length].transactionIds.push(doc.id);
                }
            });
        });

        const soldLengthCounts: { [key: number]: number } = {};
        stockSoldSnapshot.docs.forEach(doc => {
            const data = doc.data() as StockTransaction;
            (data.lengths || []).forEach(length => {
                if (!soldLengthCounts[length]) {
                    soldLengthCounts[length] = 0;
                }
                soldLengthCounts[length]++;
            });
        });

        const availableLengths: { length: number; transactionId: string }[] = [];
        for (const lengthStr in addedLengthCounts) {
            const length = parseFloat(lengthStr);
            const addedInfo = addedLengthCounts[length];
            const soldCount = soldLengthCounts[length] || 0;
            const availableCount = addedInfo.count - soldCount;
            
            if (availableCount > 0) {
                // For simplicity, we use the first transactionId. A more complex system might track individual length instances.
                const transactionId = addedInfo.transactionIds[0];
                for (let i = 0; i < availableCount; i++) {
                    availableLengths.push({ length, transactionId });
                }
            }
        }

        return { success: true, message: 'Lengths fetched.', lengths: availableLengths };

    } catch (error: any) {
        console.error("Error fetching available stock lengths:", error);
        return { success: false, message: 'Failed to fetch available stock.' };
    }
}

async function recalculateStockQuantity(stockId: string) {
    const stockRef = adminDb.collection('stocks').doc(stockId);
    
    const addedTransactionsPromise = stockRef.collection('stockAdded').get();
    const soldTransactionsPromise = stockRef.collection('stockSold').get();
    
    const [addedSnapshot, soldSnapshot] = await Promise.all([addedTransactionsPromise, soldTransactionsPromise]);

    let totalQuantity = 0;
    
    addedSnapshot.forEach(doc => {
        totalQuantity += (doc.data() as StockTransaction).quantityChange;
    });
    
    soldSnapshot.forEach(doc => {
        totalQuantity += (doc.data() as StockTransaction).quantityChange; // quantityChange is already negative
    });

    await stockRef.update({ 
      quantity: totalQuantity,
      lastUpdatedAt: new Date().toISOString()
    });
}


export async function allocateStockToAction(
    { orderId, stockId, itemName, allocatedLengths, userId, userName }: 
    { orderId: string, stockId: string, itemName: string, allocatedLengths: { length: number, transactionId: string }[], userId: string, userName: string }
): Promise<{ success: boolean; message: string }> {
    try {
        const stockRef = adminDb.collection('stocks').doc(stockId);
        const orderRef = adminDb.collection('orders').doc(orderId);
        
        const [stockDoc, orderDoc] = await Promise.all([stockRef.get(), orderRef.get()]);

        if (!stockDoc.exists) throw new Error("Stock item not found.");
        if (!orderDoc.exists) throw new Error("Order not found.");
        
        const stockData = stockDoc.data() as Stock;
        const orderData = orderDoc.data() as Order;

        const totalAllocatedQty = allocatedLengths.reduce((sum, l) => sum + l.length, 0);

        if (stockData.quantity < totalAllocatedQty) {
            throw new Error("Insufficient stock quantity.");
        }

        const batch = adminDb.batch();
        const allocationRef = orderRef.collection('allocations').doc(); // New allocation document
        const stockSoldRef = stockRef.collection('stockSold').doc(); // New transaction document
        
        // Create a new deduction transaction
        const stockSoldData: Omit<StockTransaction, 'id'> = {
            stockId: stockId,
            bcn: stockData.bcn || '',
            type: 'deduction',
            quantityChange: -totalAllocatedQty,
            orderId: orderId,
            lengths: allocatedLengths.map(l => l.length),
            createdAt: new Date().toISOString(),
            createdBy: userName,
        };
        batch.set(stockSoldRef, stockSoldData);
        
        // Create allocation record under the order
        const allocationData = {
            stockId,
            itemName,
            quantityAllocated: totalAllocatedQty,
            lengths: allocatedLengths.map(l => l.length),
            allocatedAt: new Date().toISOString(),
            allocatedBy: userName,
        };
        batch.set(allocationRef, allocationData);

        await batch.commit(); 

        await recalculateStockQuantity(stockId);

        // --- Logic for Invoice Batching ---
        const invoiceBatchRef = adminDb.collection('invoiceBatches');
        const tenMinutesAgo = Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);

        // Simpler query to avoid composite index requirement
        const recentBatchesQuery = invoiceBatchRef
            .where('orderId', '==', orderId)
            .where('status', '==', 'pending');
        
        const allPendingBatchesSnapshot = await recentBatchesQuery.get();
        
        // Filter by time in code
        const recentBatchDoc = allPendingBatchesSnapshot.docs
            .sort((a, b) => b.data().createdAt.toMillis() - a.data().createdAt.toMillis())
            .find(doc => doc.data().createdAt.toMillis() >= tenMinutesAgo.toMillis());

        const newItemForBatch: InvoiceBatchItem = {
            itemName: itemName,
            quantityAllocated: totalAllocatedQty,
            rate: stockData.mrp || 0, // Use MRP as the rate
            bcn: stockData.bcn || '',
        };

        if (recentBatchDoc) {
            // Found a recent batch, update it
            await recentBatchDoc.ref.update({
                items: FieldValue.arrayUnion(newItemForBatch)
            });
        } else {
            // No recent batch, create a new one
            const newBatch: Omit<InvoiceBatch, 'id'> = {
                orderId: orderId,
                customerName: orderData.customerName,
                customerPhone: orderData.customerPhone,
                createdAt: Timestamp.now(),
                status: 'pending',
                items: [newItemForBatch]
            };
            await invoiceBatchRef.add(newBatch);
        }

        return { success: true, message: 'Stock allocated and prepared for invoicing.' };

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
