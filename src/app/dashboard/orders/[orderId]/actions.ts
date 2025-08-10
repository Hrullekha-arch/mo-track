

'use server'

import { adminDb } from '@/lib/firebase-admin';
import { Order, Stock, StockTransaction, InvoiceBatch, InvoiceBatchItem } from '@/lib/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';


export async function getAvailableStockLengths(stockId: string): Promise<{ success: boolean; message: string; lengths?: { length: number; transactionId: string }[] }> {
    try {
        const stockAddedSnapshot = await adminDb.collection('stocks').doc(stockId).collection('stockAdded').get();
        
        const availableLengths: { length: number; transactionId: string }[] = [];
        stockAddedSnapshot.docs.forEach(doc => {
            const data = doc.data() as StockTransaction;
            // The quantityChange of a stockAdded document now represents the current available length of that roll.
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

async function recalculateStockQuantity(stockId: string, transaction: FirebaseFirestore.Transaction) {
    const stockRef = adminDb.collection('stocks').doc(stockId);
    
    // Important: These reads must be part of the transaction
    const addedTransactionsPromise = transaction.get(stockRef.collection('stockAdded'));
    
    const [addedSnapshot] = await Promise.all([addedTransactionsPromise]);

    let totalQuantity = 0;
    
    addedSnapshot.forEach(doc => {
        totalQuantity += (doc.data() as StockTransaction).quantityChange;
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
                    acc[current.transactionId] = 0;
                }
                acc[current.transactionId] += current.length;
                return acc;
            }, {} as Record<string, number>);
            
            // For each original 'stockAdded' transaction that we are allocating from...
            for (const txId in allocationsByTxId) {
                const originalTxRef = stockRef.collection('stockAdded').doc(txId);
                const allocatedAmount = allocationsByTxId[txId];
                
                // Decrement the quantity from the original roll.
                transaction.update(originalTxRef, {
                    quantityChange: FieldValue.increment(-allocatedAmount)
                });
            }
            
            const allocationRef = orderRef.collection('allocations').doc(); // New allocation document
            const stockSoldRef = stockRef.collection('stockSold').doc(); // New transaction document
            
            // Create a new deduction transaction
            const stockSoldData: Omit<StockTransaction, 'id'> = {
                stockId: stockId,
                bcn: stockData.bcn || '',
                type: 'deduction',
                quantityChange: -totalAllocatedQty, // Stored as a negative number
                orderId: orderId,
                lengths: allocatedLengths.map(l => l.length), // Record the lengths that were cut
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
