

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


export async function allocateStockToAction(
    { orderId, stockId, itemName, allocatedLengths, userId, userName }: 
    { orderId: string, stockId: string, itemName: string, allocatedLengths: { length: number, transactionId: string }[], userId: string, userName: string }
): Promise<{ success: boolean; message: string }> {
    try {
       await adminDb.runTransaction(async (transaction) => {
            const stockRef = adminDb.collection('stocks').doc(stockId);
            const orderRef = adminDb.collection('orders').doc(orderId);
            const invoiceBatchRef = adminDb.collection('invoiceBatches');
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            
            // --- ALL READS MUST BE EXECUTED FIRST ---
            const [stockDoc, orderDoc] = await Promise.all([
                transaction.get(stockRef),
                transaction.get(orderRef),
            ]);

            const recentBatchesQuery = invoiceBatchRef
                .where('orderId', '==', orderId)
                .where('status', '==', 'pending')
                .where('createdAt', '>=', tenMinutesAgo);

            const recentBatchesSnapshot = await transaction.get(recentBatchesQuery);

            if (!stockDoc.exists) throw new Error("Stock item not found.");
            if (!orderDoc.exists) throw new Error("Order not found.");
            
            const stockData = stockDoc.data() as Stock;
            const orderData = orderDoc.data() as Order;
            const totalAllocatedQty = allocatedLengths.reduce((sum, l) => sum + l.length, 0);

            // Fetch all original transaction docs that need to be read before writing.
            const originalTxRefs = allocatedLengths.map(p => stockRef.collection('stockAdded').doc(p.transactionId));
            const originalTxDocs = await Promise.all(originalTxRefs.map(ref => transaction.get(ref)));

            // --- ALL WRITES MUST BE EXECUTED AFTER ALL READS ---
            let originalLengthForInvoice = 0;

            // For each piece of stock we are allocating...
            for (let i = 0; i < allocatedLengths.length; i++) {
                const allocatedPiece = allocatedLengths[i];
                const originalTxDoc = originalTxDocs[i];

                if (!originalTxDoc.exists) {
                    throw new Error(`Original stock roll with ID ${allocatedPiece.transactionId} not found.`);
                }
                const originalTxData = originalTxDoc.data() as StockTransaction;
                
                // Set the originalLength to be stored in the invoice batch.
                // This is the full length of the roll from which the piece is being cut.
                originalLengthForInvoice = originalTxData.quantityChange;

                // 1. Decrement the quantity from the original roll document in 'stockAdded'.
                transaction.update(originalTxDoc.ref, {
                    quantityChange: FieldValue.increment(-allocatedPiece.length)
                });

                // 2. Create a new deduction transaction for each piece cut under its parent roll
                const stockSoldRef = originalTxDoc.ref.collection('stockSold').doc();
                const stockSoldData: Omit<StockTransaction, 'id'> = {
                    stockId: stockId,
                    bcn: stockData.bcn || '',
                    type: 'deduction',
                    quantityChange: -allocatedPiece.length, // The actual amount cut
                    lengths: [allocatedPiece.length],
                    originalLength: originalTxData.quantityChange, // The roll's length *before* this cut
                    orderId: orderId,
                    createdAt: new Date().toISOString(),
                    createdBy: userName,
                };
                transaction.set(stockSoldRef, stockSoldData);
            }
            
            // 3. Create one allocation record under the order for the total
            const allocationRef = orderRef.collection('allocations').doc();
            const allocationData = {
                stockId,
                itemName,
                quantityAllocated: totalAllocatedQty,
                lengths: allocatedLengths.map(l => l.length),
                allocatedAt: new Date().toISOString(),
                allocatedBy: userName,
            };
            transaction.set(allocationRef, allocationData);
            
            // 4. Update or create an invoice batch
            const recentBatchDoc = recentBatchesSnapshot.docs[0];
            const newItemForBatch: InvoiceBatchItem = {
                itemName: itemName,
                quantityAllocated: totalAllocatedQty,
                rate: stockData.mrp || 0,
                bcn: stockData.bcn || '',
                originalLength: originalLengthForInvoice, // Correctly set here
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

            // 5. Update the main stock quantity atomically.
            transaction.update(stockRef, { 
              quantity: FieldValue.increment(-totalAllocatedQty),
              lastUpdatedAt: new Date().toISOString()
            });
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
