

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
    { orderId, bcn, allocations, itemName, rate, userId, userName }: 
    { 
        orderId: string, 
        bcn: string, 
        allocations: { lengthId: string, quantity: number }[],
        itemName: string, 
        rate: number, 
        userId: string, 
        userName: string 
    }
  ): Promise<{ success: boolean; message: string }> {
    try {
      await adminDb.runTransaction(async (transaction) => {
        const orderRef = adminDb.collection('orders').doc(orderId);
        const stockRef = adminDb.collection('stocks').doc(bcn);
        const invoiceBatchesRef = adminDb.collection("invoiceBatches");
        
        const recentBatchesQuery = invoiceBatchesRef
                .where("orderId", "==", orderId)
                .where("status", "==", "pendingInvoice")
                .where("isVas", "==", false) // Ensure we only get non-VAS batches
                .orderBy("createdAt", "desc") 
                .limit(1);

        // --- READ PHASE ---
        // 1. Get all base documents.
        const [orderDoc, stockDoc, recentBatchesSnap] = await Promise.all([
            transaction.get(orderRef),
            transaction.get(stockRef),
            transaction.get(recentBatchesQuery)
        ]);
        
        if (!orderDoc.exists) throw new Error("Order not found.");
        if (!stockDoc.exists) throw new Error(`Stock item ${bcn} not found.`);

        // 2. Get all length documents that will be written to.
        const lengthRefs = allocations.map(alloc => stockRef.collection('lengths').doc(alloc.lengthId));
        const lengthDocs = await transaction.getAll(...lengthRefs);
        const lengthDocsMap = new Map(lengthDocs.map(doc => [doc.id, doc]));

        // --- VALIDATION PHASE (NO WRITES) ---
        const orderData = orderDoc.data() as Order;
        const normalizeBcn = (value?: string) => (value || '').split(' - ')[0].trim();
        const toNumber = (value: unknown, fallback: number) => {
          const num = typeof value === 'number' ? value : Number(value);
          return Number.isFinite(num) ? num : fallback;
        };
        const normalizedBcn = normalizeBcn(bcn);
        const matchedFabricDetail = (orderData.fabricDetails || []).find(item => normalizeBcn(item.fabricName) === normalizedBcn);
        const orderItems = (orderData as { items?: Array<{ collectionBrand?: string; rate?: number; discountPercent?: number }> }).items || [];
        const matchedOrderItem = orderItems.find(item => normalizeBcn(item.collectionBrand) === normalizedBcn);
        const resolvedRate = toNumber(matchedFabricDetail?.rate ?? matchedOrderItem?.rate, rate);
        const resolvedDiscount = toNumber(matchedFabricDetail?.discountPercent ?? matchedOrderItem?.discountPercent, 0);
        let totalAllocatedQty = 0;
        
        for (const allocation of allocations) {
            const { lengthId, quantity } = allocation;
            if (quantity <= 0) continue;

            const lengthDoc = lengthDocsMap.get(lengthId);
            if (!lengthDoc || !lengthDoc.exists) {
                throw new Error(`Stock length/roll ${lengthId} not found.`);
            }
            
            const lengthData = lengthDoc.data() as Stock;
            if (lengthData.availableQty < quantity) {
                throw new Error(`Insufficient stock for roll ${lengthId}. Available: ${lengthData.availableQty}, Required: ${quantity}`);
            }
            totalAllocatedQty += quantity;
        }

        // --- WRITE PHASE ---
        const updateTimestamp = new Date().toISOString();
        const newInvoiceItems: InvoiceBatchItem[] = [];

        // 3. Update each length document and prepare invoice items
        for (const allocation of allocations) {
            const { lengthId, quantity } = allocation;
            if (quantity <= 0) continue;

            const lengthDoc = lengthDocsMap.get(lengthId)!;
            const lengthRef = lengthDoc.ref;
            const lengthData = lengthDoc.data() as Stock;

            transaction.update(lengthRef, {
                reservedQty: FieldValue.increment(quantity),
                availableQty: FieldValue.increment(-quantity),
                lastUpdatedAt: updateTimestamp
            });

            const reservationRef = lengthRef.collection('reservedQty').doc();
            transaction.set(reservationRef, {
                orderId: orderId,
                reservedQty: quantity,
                reservedBy: userName,
                timestamp: updateTimestamp
            });

            newInvoiceItems.push({
                itemName: itemName,
                bcn: bcn,
                quantityAllocated: quantity,
                rate: resolvedRate,
                discountPercent: resolvedDiscount,
                originalLength: lengthData.quantity,
                stockAddedId: lengthId,
            });
        }
        
        // 4. Update the main stock document once with the total
        transaction.update(stockRef, {
            reservedQty: FieldValue.increment(totalAllocatedQty),
            availableQty: FieldValue.increment(-totalAllocatedQty),
            lastUpdatedAt: updateTimestamp
        });

        // 5. Update order milestone
        const updatedMilestones = orderData.milestones.map((m: any) => {
          if (m.id === 2) { // ID for "Fabric Allocated"
            return { ...m, completed: true, completedAt: updateTimestamp, completedBy: userName };
          }
          return m;
        });
        transaction.update(orderRef, { milestones: updatedMilestones });

        // 6. Add to invoice batch for FABRIC
        let targetBatchRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
        let isNewBatch = true;
        
        if (!recentBatchesSnap.empty) {
            const lastBatchDoc = recentBatchesSnap.docs[0];
            const lastBatchTimestamp = new Date((lastBatchDoc.data().createdAt as Timestamp).toDate());
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
        
        if (isNewBatch) {
            const newInvoiceBatch: Omit<InvoiceBatch, 'id'> = {
                orderId: orderId,
                customerName: orderData.customerName,
                customerPhone: orderData.customerPhone,
                customerAddress: orderData.customerAddress,
                salesPerson: orderData.salesPerson,
                createdAt: new Date().toISOString(),
                status: 'pendingInvoice',
                items: newInvoiceItems,
                isVas: false,
            };
            transaction.set(targetBatchRef, newInvoiceBatch);
        } else {
            transaction.update(targetBatchRef, {
                items: FieldValue.arrayUnion(...newInvoiceItems)
            });
        }
        
        // 7. Handle VAS Invoice Batch Creation
        const vasItems = orderData.vasDetails;
        if (vasItems && vasItems.length > 0) {
            const vasInvoiceBatchQuery = invoiceBatchesRef
                .where("orderId", "==", orderId)
                .where("isVas", "==", true)
                .limit(1);
            
            const vasBatchesSnap = await transaction.get(vasInvoiceBatchQuery);

            if (vasBatchesSnap.empty) {
                // No VAS batch exists for this order, so create one.
                const vasInvoiceItems: InvoiceBatchItem[] = vasItems.map(vas => ({
                    itemName: vas.vasName,
                    bcn: `VAS-${vas.vasName}`,
                    quantityAllocated: Number(vas.quantity) || 0,
                    rate: Number(vas.rate) || 0,
                    discountPercent: 0,
                }));
                
                const vasBatchRef = invoiceBatchesRef.doc(); // New document for VAS
                const newVasInvoiceBatch: Omit<InvoiceBatch, 'id'> = {
                    orderId: orderId,
                    customerName: orderData.customerName,
                    customerPhone: orderData.customerPhone,
                    customerAddress: orderData.customerAddress,
                    salesPerson: orderData.salesPerson,
                    createdAt: new Date().toISOString(),
                    status: 'pendingInvoice',
                    items: vasInvoiceItems,
                    isVas: true,
                };
                transaction.set(vasBatchRef, newVasInvoiceBatch);
            }
        }
      });
  
      return { success: true, message: 'Stock reserved and items queued for invoicing.' };
  
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
