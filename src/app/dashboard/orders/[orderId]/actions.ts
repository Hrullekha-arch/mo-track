

'use server'

import { adminDb } from '@/lib/firebase-admin';
import { Order, Stock, StockTransaction, InvoiceBatch, InvoiceBatchItem, O2DStatus, FabricDetail } from '@/lib/types';
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
        const invoiceBatchesRef = adminDb.collection("invoiceBatches");
        
        const recentBatchesQuery = invoiceBatchesRef
                .where("orderId", "==", orderId)
                .where("status", "==", "pendingInvoice")
                .orderBy("createdAt", "desc") 
                .limit(1);

        const reads = [
            transaction.get(stockRef),
            transaction.get(lengthRef),
            transaction.get(orderRef),
            transaction.get(recentBatchesQuery)
        ];
        
        const [stockDoc, lengthDoc, orderDoc, recentBatchesSnap] = await Promise.all(reads);
  
        if (!stockDoc.exists) throw new Error(`Stock item ${bcn} not found.`);
        if (!lengthDoc.exists) throw new Error(`Stock length/roll ${lengthId} not found.`);
        if (!orderDoc.exists) throw new Error("Order not found.");
  
        const stockData = stockDoc.data() as Stock;
        const lengthData = lengthDoc.data() as Stock;
        const orderData = orderDoc.data() as Order;
  
        if (lengthData.availableQty < allocatedQty) {
          throw new Error(
            `Insufficient available stock for ${itemName} on roll ${lengthId}. ` +
            `Available: ${lengthData.availableQty}, Required: ${allocatedQty}`
          );
        }
  
        const fabricDetailItem = (orderData.fabricDetails || []).find(item => item.fabricName === bcn);
        const discountPercent = fabricDetailItem?.discountPercent || 0;
  
        const updateTimestamp = new Date().toISOString();
  
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
  
        const reservationRef = lengthRef.collection('reservedQty').doc();
        transaction.set(reservationRef, {
          orderId: orderId,
          reservedQty: allocatedQty,
          reservedBy: userName,
          timestamp: updateTimestamp
        });
  
        const updatedMilestones = orderData.milestones.map((m: any) => {
          if (m.id === 2) { // ID for "Fabric Allocated"
            return { ...m, completed: true, completedAt: updateTimestamp, completedBy: userName };
          }
          return m;
        });
        transaction.update(orderRef, { milestones: updatedMilestones });
  
        let targetBatchRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
        let isNewBatch = true;
        
        if (!recentBatchesSnap.empty) {
            const lastBatchDoc = recentBatchesSnap.docs[0];
            const lastBatchTimestamp = new Date(lastBatchDoc.data().createdAt as string);
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            
            if (lastBatchTimestamp > tenMinutesAgo) {
                targetBatchRef = lastBatchDoc.ref;
                isNewBatch = false;
            } else {
                 targetBatchRef = invoiceBatchesRef.doc();
            }
        } else {
            targetBatchRef = invoiceBatchesRef.doc();
        }

        const newItem: InvoiceBatchItem = {
            itemName: itemName,
            bcn: bcn,
            quantityAllocated: allocatedQty,
            rate: rate,
            discountPercent: discountPercent,
            originalLength: lengthData.quantity,
            stockAddedId: lengthId,
        };

        if (isNewBatch) {
            const newInvoiceBatch: Omit<InvoiceBatch, 'id'> = {
                orderId: orderId,
                customerName: orderData.customerName,
                customerPhone: orderData.customerPhone,
                createdAt: new Date().toISOString(),
                status: 'pendingInvoice',
                items: [newItem]
            };
            transaction.set(targetBatchRef, newInvoiceBatch);
        } else {
            transaction.update(targetBatchRef, {
                items: FieldValue.arrayUnion(newItem)
            });
        }
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
//////////////////////////////////////////////test///////////////////////////////////////

export async function debugGetDiscountPercent(orderId: string, bcn: string, lengthId: string) {
  try {
    const orderSnap = await adminDb.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) {
      console.log(`❌ Order ${orderId} not found`);
      return null;
    }

    const orderData = orderSnap.data();

    // Try match against items[] first
    const orderItem = orderData?.items?.find((i: any) => i.collectionBrand === bcn);

    if (orderItem) {
      console.log(`✅ Discount percent for BCN ${bcn} (order ${orderId}):`, orderItem.discountPercent);
      return orderItem.discountPercent;
    }

    console.log(`⚠️ No matching item found for BCN ${bcn} in order ${orderId}`);
    return null;

  } catch (err) {
    console.error("Error in debugGetDiscountPercent:", err);
    return null;
  }
}
