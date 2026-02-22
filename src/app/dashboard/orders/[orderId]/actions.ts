

'use server'

import { adminDb } from '@/lib/firebase-admin';
import { Order, OrderWorkflowStatus, Stock, StockTransaction, O2DStatus, FabricDetail } from '@/lib/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  buildWorkflowFromLegacyMilestones,
  getNormalizedOrderMilestones,
} from '@/lib/order-workflow';

const parseFirestoreTimestamp = (value: unknown): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value instanceof Timestamp) return value.toDate();
    if (typeof (value as any)?.toDate === 'function') {
        return (value as { toDate: () => Date }).toDate();
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) return parsed;
    }
    return null;
};


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
        const EPSILON = 0.0001;
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

        const toNumber = (value: unknown, fallback: number) => {
          const num = typeof value === 'number' ? value : Number(value);
          return Number.isFinite(num) ? num : fallback;
        };
        const normalizeOrderBcn = (value?: string) => (value || '').split(' - ')[0].trim().toLowerCase();
        const getAllocatedQty = (allocation: any) => {
          const lengths = Array.isArray(allocation?.lengths) ? allocation.lengths : [];
          const lots = Array.isArray(allocation?.lots) ? allocation.lots : [];
          return [...lengths, ...lots].reduce(
            (sum: number, entry: any) => sum + toNumber(entry?.allocatedQty, 0),
            0
          );
        };

        // Normalize inbound allocations and merge duplicate length entries in one request.
        const mergedAllocationsMap = new Map<string, number>();
        (Array.isArray(allocations) ? allocations : []).forEach((allocation) => {
          const lengthId = String(allocation?.lengthId || "").trim();
          const quantity = toNumber(allocation?.quantity, 0);
          if (!lengthId || quantity <= EPSILON) return;
          mergedAllocationsMap.set(lengthId, toNumber(mergedAllocationsMap.get(lengthId), 0) + quantity);
        });
        const normalizedAllocations = Array.from(mergedAllocationsMap.entries()).map(
          ([lengthId, quantity]) => ({ lengthId, quantity })
        );
        if (!normalizedAllocations.length) {
          throw new Error("No valid allocation quantities provided.");
        }

        // 2. Get all length documents that will be written to.
        const lengthRefs = normalizedAllocations.map((alloc) =>
          stockRef.collection('lengths').doc(alloc.lengthId)
        );
        const lengthDocs = await transaction.getAll(...lengthRefs);
        const lengthDocsMap = new Map(lengthDocs.map(doc => [doc.id, doc]));

        // --- VALIDATION PHASE (NO WRITES) ---
        const orderData = orderDoc.data() as Order;
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
        const sections = orderData.sections || {};
        const normalSection = sections.NORMAL || { items: [] };
        const normalItems = Array.isArray(normalSection.items) ? normalSection.items : [];
        const normalizedTargetBcn = normalizeOrderBcn(bcn);
        const matchingItemIndexes = normalItems
          .map((orderItem: any, index: number) => ({ orderItem, index }))
          .filter(({ orderItem }) => {
            const orderItemBcn = normalizeOrderBcn(
              orderItem?.bcn || orderItem?.description || orderItem?.itemName || ""
            );
            return Boolean(orderItemBcn && orderItemBcn === normalizedTargetBcn);
          })
          .map(({ index }) => index);

        if (!matchingItemIndexes.length) {
          throw new Error(`No matching order line found for ${bcn}.`);
        }

        let requiredQtyTotal = 0;
        let alreadyAllocatedTotal = 0;
        matchingItemIndexes.forEach((itemIndex) => {
          const orderItem = normalItems[itemIndex];
          requiredQtyTotal += toNumber(orderItem?.qty, 0);
          alreadyAllocatedTotal += getAllocatedQty(orderItem?.allocation);
        });

        const remainingQtyTotal = Math.max(0, requiredQtyTotal - alreadyAllocatedTotal);
        const requestedQtyTotal = normalizedAllocations.reduce(
          (sum, allocation) => sum + toNumber(allocation.quantity, 0),
          0
        );

        if (remainingQtyTotal <= EPSILON) {
          throw new Error("This item is already fully allocated for this order.");
        }
        if (requestedQtyTotal <= EPSILON) {
          throw new Error("No allocatable quantity provided.");
        }
        if (requestedQtyTotal - remainingQtyTotal > EPSILON) {
          throw new Error(
            `Allocation exceeds remaining quantity. Remaining: ${remainingQtyTotal.toFixed(2)}, Requested: ${requestedQtyTotal.toFixed(2)}.`
          );
        }

        let totalAllocatedQty = 0;
        const lengthMeta = new Map<string, { available: number; original: number; reserved: number; status?: string }>();

        for (const allocation of normalizedAllocations) {
            const { lengthId, quantity } = allocation;
            if (quantity <= EPSILON) continue;

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

        const updateTimestamp = new Date().toISOString();

        // Build updated order sections before writes so one allocation request can never be duplicated
        // across every row having the same BCN.
        const allocationPool = normalizedAllocations.map((entry) => ({
          lengthId: entry.lengthId,
          remainingQty: toNumber(entry.quantity, 0),
        }));
        const consumeFromPool = (qtyNeeded: number) => {
          const consumed: Array<{ lengthId: string; qty: number }> = [];
          let remainingNeed = qtyNeeded;
          for (const poolItem of allocationPool) {
            if (remainingNeed <= EPSILON) break;
            if (poolItem.remainingQty <= EPSILON) continue;
            const take = Math.min(remainingNeed, poolItem.remainingQty);
            if (take <= EPSILON) continue;
            poolItem.remainingQty = Math.max(0, poolItem.remainingQty - take);
            remainingNeed = Math.max(0, remainingNeed - take);
            consumed.push({ lengthId: poolItem.lengthId, qty: take });
          }
          return consumed;
        };

        const matchingIndexSet = new Set<number>(matchingItemIndexes);
        const updatedNormalItems = normalItems.map((orderItem: any, index: number) => {
            if (!matchingIndexSet.has(index)) return orderItem;

            const existingAllocation = orderItem.allocation || { status: "PENDING", lengths: [], lots: [] };
            const updatedLengths = Array.isArray(existingAllocation.lengths) ? [...existingAllocation.lengths] : [];
            const updatedLots = Array.isArray(existingAllocation.lots) ? [...existingAllocation.lots] : [];

            const requiredQty = toNumber(orderItem.qty, 0);
            const existingAllocated = getAllocatedQty(existingAllocation);
            const itemRemaining = Math.max(0, requiredQty - existingAllocated);
            const consumed = itemRemaining > EPSILON ? consumeFromPool(itemRemaining) : [];

            consumed.forEach(({ lengthId, qty }) => {
                const lengthIndex = updatedLengths.findIndex((entry: any) => entry.lengthId === lengthId);
                if (lengthIndex >= 0) {
                    const existing = updatedLengths[lengthIndex];
                    updatedLengths[lengthIndex] = {
                        ...existing,
                        allocatedQty: toNumber(existing.allocatedQty, 0) + qty,
                        reservedAt: updateTimestamp,
                        reservedBy: { id: userId, name: userName },
                    };
                } else {
                    updatedLengths.push({
                        stockItemId: bcn,
                        lengthId,
                        allocatedQty: qty,
                        unit: orderItem.unit,
                        reservedAt: updateTimestamp,
                        reservedBy: { id: userId, name: userName },
                    });
                }
            });

            const totalAllocated = [...updatedLengths, ...updatedLots].reduce(
                (sum: number, entry: any) => sum + toNumber(entry.allocatedQty, 0),
                0
            );
            const allocationStatus =
                totalAllocated <= EPSILON
                  ? "PENDING"
                  : totalAllocated + EPSILON >= requiredQty
                  ? "ALLOCATED"
                  : "PARTIAL";

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

        const unassignedQty = allocationPool.reduce(
          (sum, entry) => sum + toNumber(entry.remainingQty, 0),
          0
        );
        if (unassignedQty > EPSILON) {
          throw new Error(
            `Could not assign ${unassignedQty.toFixed(2)} to remaining order quantity. Please refresh and retry.`
          );
        }

        const updatedSections = {
            ...sections,
            NORMAL: {
                ...normalSection,
                items: updatedNormalItems,
            },
        };

        // 5. Update order milestone/workflow payload
        const baseMilestones = getNormalizedOrderMilestones(orderData);
        const updatedMilestones = baseMilestones.map((milestone) =>
          milestone.id === 2
            ? {
                ...milestone,
                completed: true,
                completedAt: updateTimestamp,
                completedBy: userName,
              }
            : milestone
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
            : orderData.workflow?.status || "CREATED";

        const updatedWorkflow = buildWorkflowFromLegacyMilestones(
          orderData.orderType || "delivery",
          updatedMilestones,
          orderData.workflow,
          nextWorkflowStatus as OrderWorkflowStatus
        );

        // --- WRITE PHASE ---
        // 3. Update each length document
        for (const allocation of normalizedAllocations) {
            const { lengthId, quantity } = allocation;
            if (quantity <= EPSILON) continue;

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
        
        // 4. Update the main stock document once with the total (safe for missing fields)
        const stockData = stockDoc.data() as Stock;
        const sumLengthsAvailable = lengthDocs.reduce((sum, docSnap) => {
            const data = docSnap.data() as Stock;
            return sum + getAvailable(data);
        }, 0);
        const sumLengthsReserved = lengthDocs.reduce((sum, docSnap) => {
            const data = docSnap.data() as Stock;
            const original = getOriginal(data, 0);
            return sum + getReserved(data, original);
        }, 0);

        const stockAvailable = Number(stockData.availableQty);
        const stockReserved = Number(stockData.reservedQty);
        const currentAvailable = Number.isFinite(stockAvailable) && stockAvailable >= 0
            ? stockAvailable
            : sumLengthsAvailable;
        const currentReserved = Number.isFinite(stockReserved) && stockReserved >= 0
            ? stockReserved
            : sumLengthsReserved;

        transaction.update(stockRef, {
            reservedQty: currentReserved + totalAllocatedQty,
            availableQty: Math.max(0, currentAvailable - totalAllocatedQty),
            lastUpdatedAt: updateTimestamp
        });

        transaction.update(orderRef, {
            milestones: updatedMilestones,
            sections: updatedSections,
            workflow: updatedWorkflow,
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
