

'use server'

import { adminDb } from '@/lib/firebase-admin';
import { Order, Stock, StockTransaction, InvoiceBatch, InvoiceBatchItem, O2DStatus } from '@/lib/types';
import { FieldValue, Timestamp, doc } from 'firebase-admin/firestore';


export async function getAvailableStockLengths(stockId: string): Promise<{ success: boolean; message: string; lengths?: { length: number; transactionId: string }[] }> {
    try {
        const stockAddedSnapshot = await adminDb.collection('stocks').doc(stockId).collection('lengths').get();
        
        const availableLengths: { length: number; transactionId: string; }[] = [];
        stockAddedSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.availableQty > 0) {
                 availableLengths.push({ length: data.availableQty, transactionId: doc.id });
            }
        });

        return { success: true, message: 'Lengths fetched.', lengths: availableLengths.sort((a,b) => a.length - b.length) };

    } catch (error: any) {
        console.error("Error fetching available stock lengths:", error);
        return { success: false, message: 'Failed to fetch available stock.' };
    }
}


export async function allocateStockToAction(
    { orderId, bcn, lengthId, itemName, allocatedQty, rate, userId, userName }: 
    { orderId: string, bcn: string, lengthId: string, itemName: string, allocatedQty: number, rate: number, userId: string, userName: string }
): Promise<{ success: boolean; message: string }> {
    try {
       await adminDb.runTransaction(async (transaction) => {
            const stockRef = adminDb.collection('stocks').doc(bcn);
            const lengthRef = stockRef.collection('lengths').doc(lengthId);
            const orderRef = adminDb.collection('orders').doc(orderId);
            
            // --- ALL READS FIRST ---
            const stockDoc = await transaction.get(stockRef);
            const lengthDoc = await transaction.get(lengthRef);
            const orderDoc = await transaction.get(orderRef);
            
            if (!stockDoc.exists) throw new Error(`Stock item ${bcn} not found.`);
            if (!lengthDoc.exists) throw new Error(`Stock length/roll ${lengthId} not found.`);
            if (!orderDoc.exists) throw new Error("Order not found.");
            
            const stockData = stockDoc.data() as Stock;
            const lengthData = lengthDoc.data() as Stock;
            const orderData = orderDoc.data() as Order;

            if (lengthData.availableQty < allocatedQty) {
                throw new Error(`Insufficient available stock for ${itemName} on roll ${lengthId}. Available: ${lengthData.availableQty}, Required: ${allocatedQty}`);
            }

            // --- ALL WRITES AFTER ---
            const invoiceBatchRef = adminDb.collection("invoiceBatches").doc();
            const updateTimestamp = new Date().toISOString();

            // 1. Update quantities on both parent stock and specific length document
            transaction.update(stockRef, {
                reservedQty: FieldValue.increment(allocatedQty),
                availableQty: FieldValue.increment(-allocatedQty),
                lastUpdatedAt: updateTimestamp
            });
            transaction.update(lengthRef, {
                reservedQty: FieldValue.increment(allocatedQty),
                availableQty: FieldValue.increment(-allocatedQty),
                lastUpdatedAt: updateTimestamp
            });

            // 2. Create a reservation log in the specific length's subcollection
            const reservationRef = lengthRef.collection('reservedQty').doc();
            transaction.set(reservationRef, {
                orderId: orderId,
                reservedQty: allocatedQty,
                reservedBy: userName,
                timestamp: updateTimestamp
            });
            
            // 3. Update the main order's "Fabric Allocated" milestone
            const updatedMilestones = orderData.milestones.map(m => {
                if (m.id === 2) { // ID for "Fabric Allocated"
                    return { ...m, completed: true, completedAt: updateTimestamp, completedBy: userName };
                }
                return m;
            });
            transaction.update(orderRef, { milestones: updatedMilestones });

            // 4. Create a new "pending" invoice batch for this allocated item
            const newInvoiceBatch: InvoiceBatch = {
                id: invoiceBatchRef.id,
                orderId: orderId,
                customerName: orderData.customerName,
                customerPhone: orderData.customerPhone,
                createdAt: Timestamp.fromDate(new Date()),
                status: 'pendingInvoice',
                items: [{
                    itemName: itemName,
                    bcn: bcn,
                    quantityAllocated: allocatedQty,
                    rate: rate,
                    originalLength: lengthData.quantity, // Save the original length of the roll it came from
                    stockAddedId: lengthId, // Reference to the specific roll document
                }]
            };
            transaction.set(invoiceBatchRef, newInvoiceBatch);
       });

        return { success: true, message: 'Stock reserved successfully and sent for invoicing.' };

    } catch (error: any) {
        console.error("Error in allocateStockToAction:", error);
        return { success: false, message: `Failed to allocate stock: ${error.message}` };
    }
}


export async function getOrderAllocations(orderId: string): Promise<any[]> {
    try {
        const stockRef = adminDb.collection('stocks');
        let allocations: any[] = [];

        // This is inefficient. A better way would be to have a dedicated `allocations` subcollection on the order.
        // For now, we will query all stock documents. This should be refactored for performance later.
        const allStockSnapshot = await stockRef.get();
        for (const stockDoc of allStockSnapshot.docs) {
            const lengthsSnapshot = await stockDoc.ref.collection('lengths').get();
            for (const lengthDoc of lengthsSnapshot.docs) {
                const reservedSnapshot = await lengthDoc.ref.collection('reservedQty').where('orderId', '==', orderId).get();
                reservedSnapshot.forEach(doc => {
                    allocations.push({
                        bcn: stockDoc.id,
                        lengthId: lengthDoc.id,
                        ...doc.data()
                    });
                });
            }
        }
        
        return JSON.parse(JSON.stringify(allocations));
    } catch (error) {
        console.error("Error fetching order allocations:", error);
        return [];
    }
}

