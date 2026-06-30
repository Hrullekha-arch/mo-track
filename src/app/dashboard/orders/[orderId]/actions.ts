

'use server'

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Order, OrderWorkflowStatus, Stock, StockTransaction, O2DStatus, FabricDetail, PurchaseRequest } from '@/lib/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  buildWorkflowFromLegacyMilestones,
  getNormalizedOrderMilestones,
} from '@/lib/order-workflow';
import { canAllocateOrders } from '@/lib/user-access';

const sanitizeBcnDocId = (value: string) =>
  String(value ?? '').trim().replace(/\//g, '-');

const resolveStockRefForAllocation = async (
  stockId: string | undefined,
  bcn: string
) => {
  const stocksRef = adminDb.collection('stocks');
  const normalizedStockId = String(stockId ?? '').trim();
  if (normalizedStockId) {
    return stocksRef.doc(normalizedStockId);
  }

  const normalizedBcn = String(bcn ?? '').trim();
  if (!normalizedBcn) {
    throw new Error('Stock BCN is required for allocation.');
  }

  const sanitizedDocId = sanitizeBcnDocId(normalizedBcn);
  if (sanitizedDocId) {
    const sanitizedDoc = await stocksRef.doc(sanitizedDocId).get();
    if (sanitizedDoc.exists) {
      return sanitizedDoc.ref;
    }
  }

  if (!normalizedBcn.includes('/')) {
    const directDoc = await stocksRef.doc(normalizedBcn).get();
    if (directDoc.exists) {
      return directDoc.ref;
    }
  }

  const querySnapshot = await stocksRef.where('bcn', '==', normalizedBcn).limit(1).get();
  if (!querySnapshot.empty) {
    return querySnapshot.docs[0].ref;
  }

  throw new Error(`Stock item ${normalizedBcn} not found.`);
};

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

const normalizeToken = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '');

const isInstantSaleOrder = (order: (Order & Record<string, unknown>) | null): boolean => {
  if (!order) return false;

  const instantMeta =
    typeof (order as any).instantQuotationMeta === 'object' && (order as any).instantQuotationMeta !== null
      ? ((order as any).instantQuotationMeta as Record<string, unknown>)
      : {};
  const instantSource = String(instantMeta.source || '').trim().toLowerCase();
  const instantDealName = String(instantMeta.dealName || '').trim().toLowerCase();
  const saleFlowType = String((order as any).saleFlowType || '').trim().toLowerCase();
  const updateActions = Array.isArray((order as any).updates)
    ? (order as any).updates.map((entry: any) => String(entry?.action || '').trim().toLowerCase())
    : [];

  return (
    instantSource === 'quotation-builder' ||
    instantDealName.includes('cashsale') ||
    instantDealName.includes('walkin') ||
    saleFlowType.includes('cashsale') ||
    saleFlowType.includes('walkin-sale') ||
    updateActions.some((action: string) => action.includes('instant_quotation_created') || action.includes('instant-sale'))
  );
};

type SelectedOrderPrItem = {
  lineId?: string;
  bcn?: string;
  itemName: string;
  quantity: string;
};

const toPositiveQtyString = (value: unknown): string => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return parsed.toFixed(2).replace(/\.?0+$/, '');
};

const getOrderLineKey = (line: {
  lineId?: string;
  bcn?: string;
  itemName?: string;
  fabricName?: string;
}) => {
  const lineId = String(line.lineId || '').trim();
  if (lineId) return `line:${lineId}`;
  const token = normalizeToken(line.bcn || line.itemName || line.fabricName);
  return token ? `name:${token}` : '';
};

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeBcnStrict = (value: unknown): string =>
  String(value || '')
    .split(' - ')[0]
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '');

const normalizeBcnLoose = (value: unknown): string =>
  normalizeBcnStrict(value).replace(/\d+/g, (digits) => String(Number(digits)));

const resolveOrderItemQty = (item: any): number =>
  toFiniteNumber(item?.qty ?? item?.quantity, 0);

const resolveOrderItemCandidates = (item: any): string[] =>
  [
    item?.bcn,
    item?.description,
    item?.itemName,
    item?.fabricName,
    item?.collectionBrand,
  ]
    .map((candidate) => String(candidate || '').trim())
    .filter(Boolean);

const mapLegacyFabricDetailToNormalItem = (detail: any) => {
  const qty = resolveOrderItemQty(detail);
  const bcn = String(
    detail?.bcn ||
      detail?.fabricName ||
      detail?.itemName ||
      detail?.collectionBrand ||
      ''
  )
    .split(' - ')[0]
    .trim();
  const description = String(
    detail?.itemName || detail?.fabricName || detail?.bcn || ''
  ).trim();
  const exclusiveRate = toFiniteNumber(
    detail?.exclusiveRate ?? detail?.rate,
    0
  );
  const rate = toFiniteNumber(detail?.rate ?? detail?.exclusiveRate, exclusiveRate);
  const discountPercent = toFiniteNumber(
    detail?.discountPercent ?? detail?.discount,
    0
  );
  const gst = toFiniteNumber(detail?.gst ?? detail?.gstPercent, 0);
  const baseAmount = qty * exclusiveRate;
  const discountAmount = baseAmount * (discountPercent / 100);
  const taxableAmount = Math.max(0, baseAmount - discountAmount);
  const gstAmount = taxableAmount * (gst / 100);

  return {
    lineId: String(detail?.lineId || '').trim() || undefined,
    type: 'Fabric',
    bcn,
    description: description || bcn,
    unit: String(detail?.unit || 'MTR').trim() || 'MTR',
    qty,
    exclusiveRate,
    rate,
    gst,
    discountPercent,
    discountAmount,
    hsn: String(detail?.hsn || detail?.hsnCode || '').trim() || undefined,
    group: String(detail?.group || '').trim() || undefined,
    taxableAmount,
    gstAmount,
    totalAmount: taxableAmount + gstAmount,
    allocation: detail?.allocation,
  };
};

const buildNormalSectionItems = (
  orderData: (Order & Record<string, unknown>) | null
): any[] => {
  if (!orderData) return [];
  const sectionItems = orderData.sections?.NORMAL?.items;
  if (Array.isArray(sectionItems) && sectionItems.length > 0) {
    return sectionItems.map((item: any) => ({ ...item }));
  }

  const legacyItems = Array.isArray((orderData as any)?.items)
    ? (orderData as any).items
    : [];
  const normalLegacyItems = legacyItems.filter((item: any) => {
    const type = String(item?.type || item?.productType || '').trim().toLowerCase();
    return type !== 'vas';
  });
  if (normalLegacyItems.length > 0) {
    return normalLegacyItems.map((item: any) => ({ ...item }));
  }

  const fabricDetails = Array.isArray((orderData as any)?.fabricDetails)
    ? (orderData as any).fabricDetails
    : [];
  return fabricDetails.map((detail: any) => mapLegacyFabricDetailToNormalItem(detail));
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
    { orderId, stockId, bcn, allocations, itemName, rate, userId, userName, authToken }:
    { 
        orderId: string, 
        stockId?: string,
        bcn: string, 
        allocations: { lengthId: string, quantity: number }[],
        itemName: string, 
        rate: number, 
        userId: string, 
        userName: string,
        authToken: string
    }
  ): Promise<{ success: boolean; message: string; bcn?: string }> {
    try {
      const actorId = String(userId || "").trim();
      const token = String(authToken || "").trim();
      if (!actorId || !token) {
        return { success: false, message: "User access could not be verified." };
      }
      const decodedToken = await adminAuth.verifyIdToken(token);
      if (decodedToken.uid !== actorId) {
        return { success: false, message: "Authenticated user does not match the allocation request." };
      }
      const actorSnapshot = await adminDb.collection("users").doc(actorId).get();
      const actor = actorSnapshot.data() || {};
      const canAllocate = canAllocateOrders(actor);
      if (!canAllocate) {
        return {
          success: false,
          message: "Allocate Order access is not assigned to this user.",
        };
      }

      const stockRef = await resolveStockRefForAllocation(stockId, bcn);
      await adminDb.runTransaction(async (transaction) => {
        const EPSILON = 0.0001;
        const orderRef = adminDb.collection('orders').doc(orderId);
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
        const normalizeOrderBcn = (value?: string) =>
          String(value || '')
            .split(' - ')[0]
            .trim()
            .toLowerCase();
        const normalizeBcnStrict = (value?: string) =>
          normalizeOrderBcn(value).replace(/[^a-z0-9]/g, '');
        const normalizeBcnLoose = (value?: string) =>
          normalizeBcnStrict(value).replace(/\d+/g, (digits) => String(Number(digits)));
        const getOrderItemCandidates = (orderItem: any) =>
          [
            orderItem?.bcn,
            orderItem?.collectionBrand,
            orderItem?.description,
            orderItem?.itemName,
            orderItem?.fabricName,
            orderItem?.furnitureName,
          ]
            .map((candidate) => String(candidate || '').trim())
            .filter(Boolean);
        const getRequiredQty = (orderItem: any) =>
          toNumber(orderItem?.qty ?? orderItem?.quantity, 0);
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
        const sectionItems = Array.isArray(normalSection.items) ? normalSection.items : [];
        const legacyItems = Array.isArray((orderData as any)?.items) ? (orderData as any).items : [];
        const normalItems = sectionItems.length ? sectionItems : legacyItems;
        const stockDocData = stockDoc.data() as Stock;
        const targetKeysStrict = new Set(
          [bcn, stockDocData?.bcn, itemName]
            .map((candidate) => normalizeBcnStrict(candidate))
            .filter(Boolean)
        );
        const targetKeysLoose = new Set(
          [bcn, stockDocData?.bcn, itemName]
            .map((candidate) => normalizeBcnLoose(candidate))
            .filter(Boolean)
        );
        const indexedItems = normalItems.map((orderItem: any, index: number) => ({ orderItem, index }));
        const matchingItemIndexesStrict = indexedItems
          .filter(({ orderItem }) =>
            getOrderItemCandidates(orderItem).some((candidate) => {
              const candidateStrict = normalizeBcnStrict(candidate);
              if (!candidateStrict) return false;
              if (targetKeysStrict.has(candidateStrict)) return true;
              for (const targetKey of targetKeysStrict) {
                if (!targetKey) continue;
                if (candidateStrict.includes(targetKey) || targetKey.includes(candidateStrict)) {
                  return true;
                }
              }
              return false;
            })
          )
          .map(({ index }) => index);
        const matchingItemIndexesLoose = indexedItems
          .filter(({ orderItem }) =>
            getOrderItemCandidates(orderItem).some((candidate) => {
              const candidateLoose = normalizeBcnLoose(candidate);
              if (!candidateLoose) return false;
              if (targetKeysLoose.has(candidateLoose)) return true;
              for (const targetKey of targetKeysLoose) {
                if (!targetKey) continue;
                if (candidateLoose.includes(targetKey) || targetKey.includes(candidateLoose)) {
                  return true;
                }
              }
              return false;
            })
          )
          .map(({ index }) => index);
        const matchingItemIndexes = matchingItemIndexesStrict.length
          ? matchingItemIndexesStrict
          : matchingItemIndexesLoose;

        if (!matchingItemIndexes.length) {
          throw new Error(`No matching order line found for ${bcn}.`);
        }

        let requiredQtyTotal = 0;
        let alreadyAllocatedTotal = 0;
        matchingItemIndexes.forEach((itemIndex) => {
          const orderItem = normalItems[itemIndex];
          requiredQtyTotal += getRequiredQty(orderItem);
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

            const lengthDoc = lengthDocsMap.get(lengthId) as any;
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

            const requiredQty = getRequiredQty(orderItem);
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

            const lengthDoc = lengthDocsMap.get(lengthId) as any;
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

        // Ensure invoicing fields are initialised so the invoice page can pick
        // this order up even when it was created without an invoicing object.
        const existingInvoicing = (orderData as any).invoicing || {};
        const invoicingPatch = {
          "invoicing.status": existingInvoicing.status || "NOT_INVOICED",
          "invoicing.invoiceRequired": existingInvoicing.invoiceRequired !== false,
          "invoicing.canCreateGoodsInvoice": updatedNormalItems.length > 0,
        };

        transaction.update(orderRef, {
            milestones: updatedMilestones,
            sections: updatedSections,
            workflow: updatedWorkflow,
            ...invoicingPatch,
        });
      });
  
      return { success: true, message: 'Stock reserved successfully.', bcn };
  
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

export async function createPurchaseRequestForOrderItemsAction(payload: {
  orderId: string;
  items: SelectedOrderPrItem[];
  actor: { id: string; name: string };
}): Promise<{ success: boolean; message: string; createdRequestId?: string; createdItems: number; skippedItems: number }> {
  try {
    const orderId = String(payload?.orderId || '').trim();
    const actorId = String(payload?.actor?.id || '').trim();

    if (!orderId) {
      return { success: false, message: 'Order ID is required.', createdItems: 0, skippedItems: 0 };
    }
    if (!actorId) {
      return { success: false, message: 'Missing user context.', createdItems: 0, skippedItems: 0 };
    }

    const rawItems = Array.isArray(payload?.items) ? payload.items : [];
    if (!rawItems.length) {
      return { success: false, message: 'Select at least one item.', createdItems: 0, skippedItems: 0 };
    }

    const actorSnap = await adminDb.collection('users').doc(actorId).get();
    const actorRole = String(actorSnap.data()?.role || '').trim().toLowerCase();
    if (actorRole !== 'admin') {
      return { success: false, message: 'Only admin can create PR from order items.', createdItems: 0, skippedItems: rawItems.length };
    }

    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return { success: false, message: 'Order not found.', createdItems: 0, skippedItems: rawItems.length };
    }

    const orderData = { id: orderSnap.id, ...(orderSnap.data() as Omit<Order, 'id'>) } as Order & Record<string, unknown>;
    if (isInstantSaleOrder(orderData)) {
      return {
        success: false,
        message: 'PR creation is disabled for instant sale orders.',
        createdItems: 0,
        skippedItems: rawItems.length,
      };
    }

    const dealId = String(orderData.crmOrderNo || orderData.dealId || orderData.id || orderId).trim();
    if (!dealId) {
      return { success: false, message: 'Deal/quotation reference not found for this order.', createdItems: 0, skippedItems: rawItems.length };
    }

    const existingRequestsSnap = await adminDb
      .collection('purchaseRequests')
      .where('dealId', '==', dealId)
      .get();

    const existingLineKeys = new Set<string>();
    existingRequestsSnap.docs.forEach((requestDoc) => {
      const requestData = requestDoc.data() as PurchaseRequest;
      if (String(requestData.status || '').trim().toLowerCase() === 'cancelled') return;

      (requestData.fabricDetails || []).forEach((line) => {
        const lineKey = getOrderLineKey({
          lineId: line.lineId,
          bcn: line.bcn,
          itemName: line.itemName,
          fabricName: line.fabricName,
        });
        if (lineKey) existingLineKeys.add(lineKey);

        const nameKey = getOrderLineKey({ fabricName: line.fabricName });
        if (nameKey) existingLineKeys.add(nameKey);
      });
    });

    const uniqueIncoming = new Map<string, SelectedOrderPrItem>();
    let skippedItems = 0;

    rawItems.forEach((rawItem) => {
      const itemName = String(rawItem?.itemName || '').trim();
      const lineId = String(rawItem?.lineId || '').trim() || undefined;
      const bcn =
        String(rawItem?.bcn || '').trim() || itemName.split(' - ')[0]?.trim() || undefined;
      const quantity = toPositiveQtyString(rawItem?.quantity);

      if (!itemName || !quantity) {
        skippedItems += 1;
        return;
      }

      const itemKey = getOrderLineKey({ lineId, bcn, itemName, fabricName: itemName });
      if (!itemKey) {
        skippedItems += 1;
        return;
      }
      if (uniqueIncoming.has(itemKey)) {
        skippedItems += 1;
        return;
      }

      const itemNameKey = getOrderLineKey({ fabricName: itemName });
      if (existingLineKeys.has(itemKey) || (itemNameKey && existingLineKeys.has(itemNameKey))) {
        skippedItems += 1;
        return;
      }

      uniqueIncoming.set(itemKey, { lineId, bcn, itemName, quantity });
    });

    const linesToCreate: FabricDetail[] = Array.from(uniqueIncoming.values()).map((item) => ({
      lineId: item.lineId,
      bcn: item.bcn,
      itemName: item.itemName,
      fabricName: item.itemName,
      quantity: item.quantity,
      status: 'pending for po',
      isInStock: false,
      unit: 'Mtr',
    }));

    if (!linesToCreate.length) {
      return {
        success: false,
        message: 'Selected item(s) already have PR or are invalid.',
        createdItems: 0,
        skippedItems,
      };
    }

    const createdAt = new Date().toISOString();
    const createdByName = String(payload?.actor?.name || actorSnap.data()?.name || 'Admin').trim() || 'Admin';
    const prRef = adminDb.collection('purchaseRequests').doc();

    const requestPayload: PurchaseRequest = {
      id: prRef.id,
      dealId,
      quotationNo: String(orderData.crmOrderNo || orderData.quotationNo || dealId).trim() || dealId,
      customerName: String(orderData.customerName || (orderData as any)?.customerSnapshot?.name || 'Unknown').trim() || 'Unknown',
      promiseDeliveryDate: '',
      salesman: String(orderData.salesPerson || '').trim() || '-',
      type: 'fabric',
      fabricDetails: linesToCreate,
      createdAt,
      createdBy: {
        id: actorId,
        name: createdByName,
      },
      milestones: [],
      vendorType: 'undecided',
      status: 'Approved',
      customerSnapshot: {
        name: String((orderData as any)?.customerSnapshot?.name || orderData.customerName || '').trim() || undefined,
        phone: String((orderData as any)?.customerSnapshot?.phone || orderData.customerPhone || '').trim() || undefined,
        address: String(orderData.customerAddress || '').trim() || undefined,
        customerId: String(orderData.customerId || '').trim() || undefined,
      },
      dealSnapshot: {
        dealId: String(orderData.dealId || dealId).trim() || undefined,
        quotationNo: String(orderData.quotationNo || orderData.crmOrderNo || '').trim() || undefined,
        orderId: String(orderData.id || '').trim() || undefined,
        crmOrderNo: String(orderData.crmOrderNo || '').trim() || undefined,
      },
      orderSnapshot: {
        id: String(orderData.id || '').trim() || undefined,
        crmOrderNo: String(orderData.crmOrderNo || '').trim() || undefined,
        orderNo: String(orderData.orderNo || orderData.orderId || '').trim() || undefined,
        orderType: String(orderData.orderType || '').trim() || undefined,
        status: String(orderData.status || '').trim() || undefined,
        createdAt: String(orderData.createdAt || '').trim() || undefined,
        totalAmount: typeof orderData.totalAmount === 'number' ? orderData.totalAmount : undefined,
      },
      assignedSalesman: {
        id: String(orderData.representativeId || '').trim() || undefined,
        name: String(orderData.salesPerson || '').trim() || undefined,
      },
    };

    await prRef.set(requestPayload);

    return {
      success: true,
      message: `PR created for ${linesToCreate.length} item(s).`,
      createdRequestId: prRef.id,
      createdItems: linesToCreate.length,
      skippedItems,
    };
  } catch (error: any) {
    console.error('Error creating purchase request from selected order items:', error);
    return {
      success: false,
      message: error?.message || 'Failed to create PR from selected items.',
      createdItems: 0,
      skippedItems: 0,
    };
  }
}

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


//======================Bulk Bcn get for order items - for debugging only========================
export async function getStockByBcns(bcns:string[]) {
  if (!bcns.length) {
    return [];
  }

  const normalized = Array.from(
    new Set(
      bcns.map((value) => String(value || "").trim()).filter(Boolean)
    )
  );

  if (!normalized.length) {
    return [];
  }

  const result: Array<Record<string, any>> = [];
  const chunkSize = 10; // Firestore "in" limit

  for (let i = 0; i < normalized.length; i += chunkSize) {
    const chunk = normalized.slice(i, i + chunkSize);
    const snap = await adminDb.collection("stocks").where("bcn", "in", chunk).get();
    snap.docs.forEach((doc) => {
      result.push({
        id: doc.id,
        ...doc.data(),
      });
    });
  }

  return result;
}

type RegenerateInvoiceAllocationPayload = {
  orderId: string;
  lineId?: string;
  bcn?: string;
  itemName?: string;
  requiredQty?: number;
  allocatedQty?: number;
  actor: {
    id: string;
    name?: string;
  };
};

export async function regenerateInvoiceAllocationAction(
  payload: RegenerateInvoiceAllocationPayload
): Promise<{ success: boolean; message: string; updatedLines?: number }> {
  try {
    const orderId = String(payload?.orderId || '').trim();
    const actorId = String(payload?.actor?.id || '').trim();
    const actorName = String(payload?.actor?.name || '').trim();
    const lineId = String(payload?.lineId || '').trim();
    const targetBcn = String(payload?.bcn || '').trim();
    const targetItemName = String(payload?.itemName || '').trim();

    if (!orderId) {
      return { success: false, message: 'Order ID is required.' };
    }
    if (!actorId) {
      return { success: false, message: 'Missing user context.' };
    }
    if (!lineId && !targetBcn && !targetItemName) {
      return {
        success: false,
        message: 'Line ID or BCN is required to regenerate allocation.',
      };
    }

    const actorSnap = await adminDb.collection('users').doc(actorId).get();
    const actorRole = String(actorSnap.data()?.role || '')
      .trim()
      .toLowerCase();
    if (actorRole !== 'admin') {
      return {
        success: false,
        message: 'Only admin can regenerate invoice allocation.',
      };
    }

    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return { success: false, message: 'Order not found.' };
    }

    const orderData = {
      id: orderSnap.id,
      ...(orderSnap.data() as Omit<Order, 'id'>),
    } as Order & Record<string, unknown>;

    const normalItems = buildNormalSectionItems(orderData);
    if (!normalItems.length) {
      return { success: false, message: 'No order items found for allocation.' };
    }

    const strictTargets = new Set(
      [targetBcn, targetItemName].map((value) => normalizeBcnStrict(value)).filter(Boolean)
    );
    const looseTargets = new Set(
      [targetBcn, targetItemName].map((value) => normalizeBcnLoose(value)).filter(Boolean)
    );

    const matchedByLine = lineId
      ? normalItems
          .map((item: any, index: number) => ({
            index,
            lineId: String(item?.lineId || '').trim(),
          }))
          .filter((entry) => entry.lineId && entry.lineId === lineId)
          .map((entry) => entry.index)
      : [];

    const findMatchesBy = (
      normalizer: (value: unknown) => string,
      targets: Set<string>
    ) =>
      normalItems
        .map((item: any, index: number) => ({ item, index }))
        .filter(({ item }) =>
          resolveOrderItemCandidates(item).some((candidate) => {
            const normalizedCandidate = normalizer(candidate);
            if (!normalizedCandidate) return false;
            if (targets.has(normalizedCandidate)) return true;
            for (const target of targets) {
              if (!target) continue;
              if (
                normalizedCandidate.includes(target) ||
                target.includes(normalizedCandidate)
              ) {
                return true;
              }
            }
            return false;
          })
        )
        .map(({ index }) => index);

    const matchedByStrict =
      matchedByLine.length > 0 ? matchedByLine : findMatchesBy(normalizeBcnStrict, strictTargets);
    const matchedIndexes =
      matchedByStrict.length > 0
        ? matchedByStrict
        : findMatchesBy(normalizeBcnLoose, looseTargets);

    if (!matchedIndexes.length) {
      return {
        success: false,
        message: 'Unable to match order line for regeneration.',
      };
    }

    const requiredFromOrder = matchedIndexes.reduce(
      (sum, index) => sum + resolveOrderItemQty(normalItems[index]),
      0
    );
    const requiredFromPayload = toFiniteNumber(payload?.requiredQty, 0);
    const allocatedFromPayload = toFiniteNumber(payload?.allocatedQty, 0);
    const requiredQty = requiredFromOrder > 0 ? requiredFromOrder : requiredFromPayload;
    if (requiredQty <= 0) {
      return {
        success: false,
        message: 'Could not resolve line quantity for regeneration.',
      };
    }

    const allocationQtyRaw =
      allocatedFromPayload > 0 ? allocatedFromPayload : requiredQty;
    const allocationQty = Math.max(0, Math.min(allocationQtyRaw, requiredQty));
    if (allocationQty <= 0) {
      return {
        success: false,
        message: 'No allocated quantity found to regenerate.',
      };
    }

    const updateTimestamp = new Date().toISOString();
    const updatedByName =
      actorName || String(actorSnap.data()?.name || '').trim() || 'Admin';
    let poolRemaining = allocationQty;
    const matchSet = new Set(matchedIndexes);
    const EPSILON = 0.0001;

    const updatedNormalItems = normalItems.map((item: any, index: number) => {
      if (!matchSet.has(index)) return item;

      const requiredQtyForLine = resolveOrderItemQty(item);
      if (requiredQtyForLine <= 0) return item;

      const existingAllocation = item?.allocation || {};
      const existingLengths = Array.isArray(existingAllocation.lengths)
        ? [...existingAllocation.lengths]
        : [];
      const existingLots = Array.isArray(existingAllocation.lots)
        ? [...existingAllocation.lots]
        : [];
      const existingAllocated = [...existingLengths, ...existingLots].reduce(
        (sum: number, entry: any) =>
          sum + toFiniteNumber(entry?.allocatedQty, 0),
        0
      );

      const targetForLine = Math.min(requiredQtyForLine, poolRemaining);
      if (targetForLine > EPSILON) {
        poolRemaining = Math.max(0, poolRemaining - targetForLine);
      }

      let nextLengths = existingLengths;
      let nextLots = existingLots;
      let allocatedForLine = existingAllocated;

      if (existingAllocated <= EPSILON && targetForLine > EPSILON) {
        nextLengths = [];
        nextLots = [
          {
            allocatedQty: targetForLine,
            unit: String(item?.unit || 'MTR').trim() || 'MTR',
            reservedAt: updateTimestamp,
            reservedBy: { id: actorId, name: updatedByName },
          },
        ];
        allocatedForLine = targetForLine;
      } else if (
        existingAllocated + EPSILON < targetForLine &&
        targetForLine > EPSILON
      ) {
        const topUp = targetForLine - existingAllocated;
        nextLots = [
          ...existingLots,
          {
            allocatedQty: topUp,
            unit: String(item?.unit || 'MTR').trim() || 'MTR',
            reservedAt: updateTimestamp,
            reservedBy: { id: actorId, name: updatedByName },
          },
        ];
        allocatedForLine = targetForLine;
      }

      const allocationStatus =
        allocatedForLine <= EPSILON
          ? 'PENDING'
          : allocatedForLine + EPSILON >= requiredQtyForLine
          ? 'ALLOCATED'
          : 'PARTIAL';

      return {
        ...item,
        allocation: {
          ...existingAllocation,
          status: allocationStatus,
          lengths: nextLengths,
          lots: nextLots,
          forceReinvoice: true,
          forceReinvoiceAt: updateTimestamp,
          forceReinvoiceBy: { id: actorId, name: updatedByName },
        },
      };
    });

    const existingSections = orderData.sections || {};
    const existingNormalSection = existingSections.NORMAL || {};
    const updatedSections = {
      ...existingSections,
      NORMAL: {
        ...existingNormalSection,
        items: updatedNormalItems,
      },
    };

    const baseMilestones = getNormalizedOrderMilestones(orderData);
    const updatedMilestones = baseMilestones.map((milestone) =>
      milestone.id === 2
        ? {
            ...milestone,
            completed: true,
            completedAt: updateTimestamp,
            completedBy: updatedByName,
          }
        : milestone
    );

    const allocationStatuses = updatedNormalItems.map((item: any) =>
      String(item?.allocation?.status || '')
        .trim()
        .toUpperCase()
    );
    const anyAllocated = allocationStatuses.some(
      (status) => status === 'ALLOCATED' || status === 'PARTIAL'
    );
    const allAllocated =
      allocationStatuses.length > 0 &&
      allocationStatuses.every((status) => status === 'ALLOCATED');

    const nextWorkflowStatus = allAllocated
      ? 'ALLOCATED'
      : anyAllocated
      ? 'ALLOCATING'
      : orderData.workflow?.status || 'CREATED';

    const updatedWorkflow = buildWorkflowFromLegacyMilestones(
      orderData.orderType || 'delivery',
      updatedMilestones,
      orderData.workflow,
      nextWorkflowStatus as OrderWorkflowStatus
    );

    const updatedFabricDetails = Array.isArray(orderData.fabricDetails)
      ? orderData.fabricDetails.map((detail: any) => {
          const detailLineId = String(detail?.lineId || '').trim();
          const detailTokenStrict = normalizeBcnStrict(
            detail?.bcn || detail?.fabricName || detail?.itemName
          );
          const detailTokenLoose = normalizeBcnLoose(
            detail?.bcn || detail?.fabricName || detail?.itemName
          );
          const isTargetByLine = lineId && detailLineId === lineId;
          const isTargetByStrict = strictTargets.has(detailTokenStrict);
          const isTargetByLoose = looseTargets.has(detailTokenLoose);
          if (!isTargetByLine && !isTargetByStrict && !isTargetByLoose) {
            return detail;
          }
          return {
            ...detail,
            status: 'allocated',
            isInStock: true,
          };
        })
      : undefined;

    const hasAnyInvoiceDocs = !(
      await adminDb
        .collection('invoices')
        .where('orderId', '==', orderId)
        .limit(1)
        .get()
    ).empty;

    const existingInvoicing =
      typeof (orderData as any).invoicing === 'object' &&
      (orderData as any).invoicing !== null
        ? ((orderData as any).invoicing as Record<string, any>)
        : {};

    const vasSectionItems = Array.isArray(orderData.sections?.VAS?.items)
      ? orderData.sections?.VAS?.items
      : [];
    const vasLegacyItems = Array.isArray((orderData as any)?.vasDetails)
      ? (orderData as any).vasDetails
      : [];

    const updatePayload: Record<string, any> = {
      sections: updatedSections,
      milestones: updatedMilestones,
      workflow: updatedWorkflow,
      updatedAt: updateTimestamp,
      invoicing: {
        ...existingInvoicing,
        status: hasAnyInvoiceDocs ? 'PARTIALLY_INVOICED' : 'NOT_INVOICED',
        invoiceRequired: existingInvoicing.invoiceRequired !== false,
        canCreateGoodsInvoice: updatedNormalItems.length > 0,
        canCreateVasInvoice:
          vasSectionItems.length > 0 || vasLegacyItems.length > 0,
      },
      updates: FieldValue.arrayUnion({
        updatedAt: updateTimestamp,
        updatedBy: { id: actorId, name: updatedByName },
        action: 'allocation_regenerated_for_invoice',
        message: `Regenerated allocation for ${matchedIndexes.length} line(s).`,
      }),
    };

    if (updatedFabricDetails) {
      updatePayload.fabricDetails = updatedFabricDetails;
    }

    await orderRef.update(updatePayload);

    return {
      success: true,
      message: 'Allocation regenerated. Item is re-queued for invoice generation.',
      updatedLines: matchedIndexes.length,
    };
  } catch (error: any) {
    console.error('Error regenerating invoice allocation:', error);
    return {
      success: false,
      message: error?.message || 'Failed to regenerate allocation.',
    };
  }
}

