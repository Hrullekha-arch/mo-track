

'use server'

import { adminDb } from '@/lib/firebase-admin';
import { Order, Stock, StockTransaction, InvoiceBatch, InvoiceBatchItem } from '@/lib/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';


export async function getAvailableStockLengths(stockId: string): Promise<{ success: boolean; message: string; lengths?: { length: number; transactionId: string }[] }> {
    try {
        const stockAddedSnapshot = await adminDb.collection('stocks').doc(stockId).collection('stockAdded').get();
        const stockSoldSnapshot = await adminDb.collection('stocks').doc(stockId).collection('stockSold').get();

        // Create a frequency map of sold lengths for efficient lookup
        const soldLengthCounts: { [key: number]: number } = {};
        stockSoldSnapshot.docs.forEach(doc => {
            const data = doc.data() as StockTransaction;
            (data.lengths || []).forEach(length => {
                soldLengthCounts[length] = (soldLengthCounts[length] || 0) + 1;
            });
        });
        
        const availableLengths: { length: number; transactionId: string }[] = [];
        stockAddedSnapshot.docs.forEach(doc => {
            const data = doc.data() as StockTransaction;
            (data.lengths || []).forEach(length => {
                // Check if a specific length has been sold
                if (soldLengthCounts[length] && soldLengthCounts[length] > 0) {
                    // This specific length value has been sold, so decrement the count and don't add it as available
                    soldLengthCounts[length]--;
                } else {
                    // This length has not been sold, so it's available
                    availableLengths.push({ length, transactionId: doc.id });
                }
            });
        });

        return { success: true, message: 'Lengths fetched.', lengths: availableLengths.sort((a,b) => a.length - b.length) };

    } catch (error: any) {
        console.error("Error fetching available stock lengths:", error);
        return { success: false, message: 'Failed to fetch available stock.' };
    }
}

async function recalculateStockQuantity(stockId: string, transaction: FirebaseFirestore.Transaction) {
    const stockRef = adminDb.collection('stocks').doc(stockId);
    
    // Important: These reads must be part of the transaction
    const addedTransactionsPromise = transaction.get(stockRef.collection('stockAdded'));
    const soldTransactionsPromise = transaction.get(stockRef.collection('stockSold'));
    
    const [addedSnapshot, soldSnapshot] = await Promise.all([addedTransactionsPromise, soldTransactionsPromise]);

    let totalQuantity = 0;
    
    addedSnapshot.forEach(doc => {
        totalQuantity += (doc.data() as StockTransaction).quantityChange;
    });
    
    soldSnapshot.forEach(doc => {
        totalQuantity += (doc.data() as StockTransaction).quantityChange; // quantityChange is already negative
    });

    transaction.update(stockRef, { 
      quantity: totalQuantity,
      lastUpdatedAt: new Date().toISOString()
    });
}


export async function allocateStockToAction(
    { orderId, stockId, itemName, allocatedLengths, userId, userName }: 
    { orderId: string, stockId: string, itemName: string, allocatedLengths: { length: number, transactionId: string }[], userId: string, userName: string }
): Promise<{ success: boolean; message: string }> {
    try {
       await adminDb.runTransaction(async (transaction) => {
            const stockRef = adminDb.collection('stocks').doc(stockId);
            const orderRef = adminDb.collection('orders').doc(orderId);
            
            const [stockDoc, orderDoc] = await Promise.all([
                transaction.get(stockRef),
                transaction.get(orderDoc)
            ]);

            if (!stockDoc.exists) throw new Error("Stock item not found.");
            if (!orderDoc.exists) throw new Error("Order not found.");
            
            const stockData = stockDoc.data() as Stock;
            const orderData = orderDoc.data() as Order;

            const totalAllocatedQty = allocatedLengths.reduce((sum, l) => sum + l.length, 0);

            // Group allocations by their original transaction ID
            const allocationsByTxId = allocatedLengths.reduce((acc, current) => {
                if (!acc[current.transactionId]) {
                    acc[current.transactionId] = [];
                }
                acc[current.transactionId].push(current.length);
                return acc;
            }, {} as Record<string, number[]>);
            
            // For each original 'stockAdded' transaction that we are allocating from...
            for (const txId in allocationsByTxId) {
                const originalTxRef = stockRef.collection('stockAdded').doc(txId);
                const originalTxDoc = await transaction.get(originalTxRef);
                if (!originalTxDoc.exists) throw new Error(`Original stock transaction ${txId} not found.`);

                const originalTxData = originalTxDoc.data() as StockTransaction;
                const lengthsToAllocateFromThisTx = allocationsByTxId[txId];
                
                // Create a mutable copy of the original lengths
                const remainingLengthsInTx = [...(originalTxData.lengths || [])];
                
                // Remove the allocated lengths from the copy
                for (const allocated of lengthsToAllocateFromThisTx) {
                    const indexToRemove = remainingLengthsInTx.indexOf(allocated);
                    if (indexToRemove === -1) {
                        throw new Error(`Cannot allocate length ${allocated} as it does not exist in transaction ${txId}.`);
                    }
                    remainingLengthsInTx.splice(indexToRemove, 1);
                }

                // Delete the original 'stockAdded' transaction
                transaction.delete(originalTxRef);
                
                // If there are any remaining lengths, create a new 'stockAdded' transaction for them
                if (remainingLengthsInTx.length > 0) {
                    const newAddedTxRef = stockRef.collection('stockAdded').doc(); // Create a new doc
                    const newQuantity = remainingLengthsInTx.reduce((sum, l) => sum + l, 0);
                    const newAddedTxData: Omit<StockTransaction, 'id'> = {
                        ...originalTxData,
                        quantityChange: newQuantity,
                        lengths: remainingLengthsInTx,
                        createdAt: new Date().toISOString(),
                        createdBy: `System (Split from ${txId})`
                    };
                    transaction.set(newAddedTxRef, newAddedTxData);
                }
            }
            
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
            transaction.set(stockSoldRef, stockSoldData);
            
            // Create allocation record under the order
            const allocationData = {
                stockId,
                itemName,
                quantityAllocated: totalAllocatedQty,
                lengths: allocatedLengths.map(l => l.length),
                allocatedAt: new Date().toISOString(),
                allocatedBy: userName,
            };
            transaction.set(allocationRef, allocationData);

            // Recalculate total quantity for the stock item
            await recalculateStockQuantity(stockId, transaction);
            
             // --- Logic for Invoice Batching ---
            const invoiceBatchRef = adminDb.collection('invoiceBatches');
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

            const recentBatchesQuery = invoiceBatchRef
                .where('orderId', '==', orderId)
                .where('status', '==', 'pending')
                .where('createdAt', '>=', tenMinutesAgo);
            
            const recentBatchesSnapshot = await transaction.get(recentBatchesQuery);
            const recentBatchDoc = recentBatchesSnapshot.docs[0];

            const newItemForBatch: InvoiceBatchItem = {
                itemName: itemName,
                quantityAllocated: totalAllocatedQty,
                rate: stockData.mrp || 0,
                bcn: stockData.bcn || '',
            };

            if (recentBatchDoc) {
                transaction.update(recentBatchDoc.ref, {
                    items: FieldValue.arrayUnion(newItemForBatch)
                });
            } else {
                const newBatchRef = invoiceBatchRef.doc();
                const newBatch: Omit<InvoiceBatch, 'id' | 'tallyBillNo'> = {
                    orderId: orderId,
                    customerName: orderData.customerName,
                    customerPhone: orderData.customerPhone,
                    createdAt: Timestamp.now(),
                    status: 'pending',
                    items: [newItemForBatch]
                };
                transaction.set(newBatchRef, newBatch);
            }
       });

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
