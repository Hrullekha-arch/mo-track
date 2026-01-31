

'use server'

import { adminDb } from '@/lib/firebase-admin';
import { Order, Stock, StockTransaction, O2DStatus, FabricDetail } from '@/lib/types';
import { FieldValue, Timestamp, doc } from 'firebase-admin/firestore';


export async function getAvailableStockLengths(stockId: string): Promise<{ success: boolean; message: string; lengths?: { length: number; transactionId: string }[] }> {
    try {
        const stockAddedSnapshot = await adminDb.collection('stocks').doc(stockId).collection('lengths').get();
        
        const availableLengths: { length: number; transactionId: string; }[] = [];
        stockAddedSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const available = Number(data.availableLength ?? data.availableQty ?? 0);
            if (available > 0) {
                 availableLengths.push({ length: available, transactionId: doc.id });
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
        // --- READ PHASE ---
        // 1. Get all base documents.
        const [orderDoc, stockDoc] = await Promise.all([
            transaction.get(orderRef),
            transaction.get(stockRef)
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
        const getAvailable = (data: Stock) =>
          toNumber((data as any)?.availableLength ?? (data as any)?.availableQty, 0);
        const getOriginal = (data: Stock, fallback: number) =>
          toNumber((data as any)?.originalLength ?? (data as any)?.quantity, fallback);
        const getReserved = (data: Stock, fallback: number) => {
          const reserved = toNumber((data as any)?.reservedQty, Number.NaN);
          if (Number.isFinite(reserved)) return reserved;
          const original = getOriginal(data, fallback);
          const available = getAvailable(data);
          const derived = original - available;
          return derived > 0 ? derived : 0;
        };
        const normalizedBcn = normalizeBcn(bcn);
        const matchedFabricDetail = (orderData.fabricDetails || []).find(item => normalizeBcn(item.fabricName) === normalizedBcn);
        const orderItems = (orderData as { items?: Array<{ collectionBrand?: string; rate?: number; discountPercent?: number }> }).items || [];
        const matchedOrderItem = orderItems.find(item => normalizeBcn(item.collectionBrand) === normalizedBcn);
        const resolvedRate = toNumber(matchedFabricDetail?.rate ?? matchedOrderItem?.rate, rate);
        const resolvedDiscount = toNumber(matchedFabricDetail?.discountPercent ?? matchedOrderItem?.discountPercent, 0);
        let totalAllocatedQty = 0;
        const lengthMeta = new Map<string, { available: number; original: number; reserved: number; status?: string }>();
        
        for (const allocation of allocations) {
            const { lengthId, quantity } = allocation;
            if (quantity <= 0) continue;

            const lengthDoc = lengthDocsMap.get(lengthId);
            if (!lengthDoc || !lengthDoc.exists) {
                throw new Error(`Stock length/roll ${lengthId} not found.`);
            }
            
            const lengthData = lengthDoc.data() as Stock;
            const available = getAvailable(lengthData);
            const original = getOriginal(lengthData, available);
            const reserved = getReserved(lengthData, original);
            if (available < quantity) {
                throw new Error(`Insufficient stock for roll ${lengthId}. Available: ${available}, Required: ${quantity}`);
            }
            lengthMeta.set(lengthId, { available, original, reserved, status: lengthData.status });
            totalAllocatedQty += quantity;
        }

        // --- WRITE PHASE ---
        const updateTimestamp = new Date().toISOString();
        // 3. Update each length document
        for (const allocation of allocations) {
            const { lengthId, quantity } = allocation;
            if (quantity <= 0) continue;

            const lengthDoc = lengthDocsMap.get(lengthId)!;
            const lengthRef = lengthDoc.ref;
            const lengthData = lengthDoc.data() as Stock;
            const meta = lengthMeta.get(lengthId);
            const availableBefore = meta?.available ?? getAvailable(lengthData);
            const remaining = availableBefore - quantity;
            const nextStatus = remaining <= 0 ? "RESERVED" : (meta?.status || lengthData.status || "AVAILABLE");

            transaction.update(lengthRef, {
                availableLength: FieldValue.increment(-quantity),
                availableQty: FieldValue.increment(-quantity),
                reservedQty: FieldValue.increment(quantity),
                lastUpdatedAt: updateTimestamp,
                status: nextStatus,
                reservation: {
                    orderId: orderId,
                    orderNo: orderData.crmOrderNo || orderId,
                    reservedQty: quantity,
                    reservedAt: updateTimestamp,
                    reservedBy: userName
                }
            });

            const reservationRef = lengthRef.collection('reservedQty').doc();
            transaction.set(reservationRef, {
                orderId: orderId,
                reservedQty: quantity,
                reservedBy: userName,
                timestamp: updateTimestamp
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
        const normalizeOrderBcn = (value?: string) => (value || '').split(' - ')[0].trim().toLowerCase();
        const normalizedTargetBcn = normalizeOrderBcn(bcn);
        const sections = orderData.sections || {};
        const normalSection = sections.NORMAL || { items: [] };
        const updatedNormalItems = (normalSection.items || []).map((orderItem: any) => {
            const orderItemBcn = normalizeOrderBcn(orderItem.bcn || orderItem.description || orderItem.itemName || "");
            if (!orderItemBcn || orderItemBcn !== normalizedTargetBcn) return orderItem;

            const existingAllocation = orderItem.allocation || { status: "PENDING", lengths: [], lots: [] };
            const updatedLengths = Array.isArray(existingAllocation.lengths) ? [...existingAllocation.lengths] : [];
            const updatedLots = Array.isArray(existingAllocation.lots) ? [...existingAllocation.lots] : [];

            for (const allocation of allocations) {
                if (allocation.quantity <= 0) continue;
                const lengthIndex = updatedLengths.findIndex((entry: any) => entry.lengthId === allocation.lengthId);
                if (lengthIndex >= 0) {
                    const existing = updatedLengths[lengthIndex];
                    updatedLengths[lengthIndex] = {
                        ...existing,
                        allocatedQty: toNumber(existing.allocatedQty, 0) + allocation.quantity,
                        reservedAt: updateTimestamp,
                        reservedBy: { id: userId, name: userName },
                    };
                } else {
                    updatedLengths.push({
                        stockItemId: bcn,
                        lengthId: allocation.lengthId,
                        allocatedQty: allocation.quantity,
                        unit: orderItem.unit,
                        reservedAt: updateTimestamp,
                        reservedBy: { id: userId, name: userName },
                    });
                }
            }

            const totalAllocated = [...updatedLengths, ...updatedLots].reduce(
                (sum: number, entry: any) => sum + toNumber(entry.allocatedQty, 0),
                0
            );
            const requiredQty = toNumber(orderItem.qty, 0);
            const allocationStatus =
                totalAllocated <= 0 ? "PENDING" : totalAllocated >= requiredQty ? "ALLOCATED" : "PARTIAL";

            return {
                ...orderItem,
                allocation: {
                    ...existingAllocation,
                    status: allocationStatus,
                    lengths: updatedLengths,
                    lots: updatedLots,
                },
            };
        });

        const updatedSections = {
            ...sections,
            NORMAL: {
                ...normalSection,
                items: updatedNormalItems,
            },
        };

        const workflow = orderData.workflow || { status: "CREATED", milestones: [] };
        const updatedWorkflowMilestones = (workflow.milestones || []).map((m: any) =>
            m.key === "FABRIC_ALLOCATED"
                ? { ...m, status: "DONE", at: updateTimestamp, by: { id: userId, name: userName } }
                : m
        );

        const allocationStatuses = updatedNormalItems.map((item: any) => item.allocation?.status);
        const anyAllocated = allocationStatuses.some((status: string) => status === "ALLOCATED" || status === "PARTIAL");
        const allAllocated =
            allocationStatuses.length > 0 &&
            allocationStatuses.every((status: string) => status === "ALLOCATED");

        const nextWorkflowStatus = allAllocated
            ? "ALLOCATED"
            : anyAllocated
            ? "ALLOCATING"
            : workflow.status || "CREATED";

        transaction.update(orderRef, {
            milestones: updatedMilestones,
            sections: updatedSections,
            workflow: {
                ...workflow,
                status: nextWorkflowStatus,
                milestones: updatedWorkflowMilestones,
            },
        });
      });
  
      return { success: true, message: 'Stock reserved successfully.' };
  
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
      console.log(`Order ${orderId} not found`);
      return null;
    }

    const orderData = orderSnap.data();

    // Try match against items[] first
    const orderItem = orderData?.items?.find((i: any) => i.collectionBrand === bcn);

    if (orderItem) {
      console.log(`Discount percent for BCN ${bcn} (order ${orderId}):`, orderItem.discountPercent);
      return orderItem.discountPercent;
    }

    console.log(`No matching item found for BCN ${bcn} in order ${orderId}`);
    return null;

  } catch (err) {
    console.error("Error in debugGetDiscountPercent:", err);
    return null;
  }
}
