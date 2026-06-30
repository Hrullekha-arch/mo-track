'use server';

import { adminDb } from '@/lib/firebase-admin';
import { InboundRequest, PurchaseRequest, PurchaseStatus } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

// ─── Key Normalization ────────────────────────────────────────────────────────

const normalizeKey = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const buildKeySet = (values: unknown[]): Set<string> => {
  const set = new Set<string>();
  for (const v of values) {
    const k = normalizeKey(v);
    if (k) set.add(k);
  }
  return set;
};

const hasCommonKey = (keys: Set<string>, candidates: unknown[]): boolean =>
  candidates.some(c => { const k = normalizeKey(c); return k !== '' && keys.has(k); });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PoFollowUpItem {
  id: string;
  requestId: string;
  orderId: string;
  poNumber?: string;
  customerName: string;
  itemName: string;
  itemCode?: string;
  supplierCollectionCode?: string;
  supplierCollectionName?: string;
  quantity: string;
  salesman: string;
  expectedDeliveryDate: string;
  vendorName?: string;
  originalRequest: PurchaseRequest;
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

/** Returns a plain IST-midnight Date (no TZ offset noise) */
function toISTMidnight(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  return new Date(get('year'), get('month') - 1, get('day'));
}

const todayIST = (): Date => toISTMidnight(new Date());

// ─── getFollowUpItems ─────────────────────────────────────────────────────────

export async function getFollowUpItems(): Promise<PoFollowUpItem[]> {
  const today = todayIST();

  const snapshot = await adminDb
    .collection('purchaseRequests')
    .where('status', 'in', ['PO Generated', 'Completed'])
    .get();

  const followUpItems: PoFollowUpItem[] = [];

  for (const doc of snapshot.docs) {
    const request = { id: doc.id, ...doc.data() } as PurchaseRequest;
    const { promiseDeliveryDate, fabricDetails = [], poMilestones = [] } = request;

    if (!promiseDeliveryDate) continue;

    const promiseDate = toISTMidnight(promiseDeliveryDate);
    const followUpDate = new Date(promiseDate);
    followUpDate.setDate(followUpDate.getDate() - 2);
    if (today < followUpDate) continue;

    // Pre-build a set of already-followed-up item names for O(1) lookup
    const followedUpNames = new Set(
      poMilestones
        .filter((m: any) => m.stepId === 2)
        .map((m: any) => normalizeKey(m.itemName))
    );

    for (const item of fabricDetails) {
      if (!item?.poNumber) continue;
      const itemName = String(item.fabricName ?? '').trim();
      if (followedUpNames.has(normalizeKey(itemName))) continue;

      followUpItems.push({
        id: `${request.id}-${itemName}`,
        requestId: request.id,
        orderId: request.dealId,
        poNumber: item.poNumber,
        customerName: request.customerName,
        itemName,
        itemCode: item.itemCode,
        supplierCollectionCode: item.supplierCollectionCode,
        supplierCollectionName: item.supplierCollectionName,
        quantity: item.quantity,
        salesman: request.salesman,
        expectedDeliveryDate: item.expectedDeliveryDate || promiseDeliveryDate,
        vendorName: item.vendorName,
        originalRequest: request,
      });
    }
  }

  return JSON.parse(JSON.stringify(followUpItems));
}

// ─── updateFollowUpStatus ─────────────────────────────────────────────────────

export async function updateFollowUpStatus(
  requestId: string,
  itemName: string,
  newDate: string | null,
  docketNoInput: string | null,
  userName: string,
): Promise<{ success: boolean; message: string }> {
  const docketNo = String(docketNoInput ?? '').trim();
  const nowIso = new Date().toISOString();
  const itemNameKey = normalizeKey(itemName);

  try {
    const requestRef = adminDb.collection('purchaseRequests').doc(requestId);

    // ── 1. Read purchaseRequest first (outside transaction to save a round-trip) ──
    const requestDoc = await requestRef.get();
    if (!requestDoc.exists) throw new Error('Purchase request not found.');

    const requestData = requestDoc.data() as PurchaseRequest;
    const fabricDetails: any[] = [...(requestData.fabricDetails ?? [])];

    const itemIndex = fabricDetails.findIndex(
      i => normalizeKey(i?.fabricName) === itemNameKey,
    );
    if (itemIndex === -1) throw new Error('Item not found in the purchase request.');

    // Mutate the copy
    if (newDate)   fabricDetails[itemIndex].expectedDeliveryDate = newDate;
    if (docketNo)  fabricDetails[itemIndex].docketNo = docketNo;

    const linkedPoNumber = String(fabricDetails[itemIndex].poNumber ?? '').trim();

    // Build key-set once for inbound matching
    const targetKeys = buildKeySet([
      itemName,
      fabricDetails[itemIndex].fabricName,
      fabricDetails[itemIndex].itemCode,
      fabricDetails[itemIndex].supplierCollectionCode,
    ]);

    const followUpMilestone: PurchaseStatus = {
      stepId: 2,
      status: 'completed',
      completedAt: nowIso,
      completedBy: userName,
      itemName,
      remarks: [
        'Follow-up confirmed.',
        newDate   ? `Delivery date updated to ${new Date(newDate).toLocaleDateString()}.` : '',
        docketNo  ? `Docket no: ${docketNo}.` : '',
      ].filter(Boolean).join(' '),
      ...(docketNo ? { docketNo } : {}),
    };

    // ── 2. Fetch inbound in parallel with nothing (we already have the request) ──
    let inboundData: (InboundRequest & { stockDetails?: any[] }) | null = null;
    let inboundRef: FirebaseFirestore.DocumentReference | null = null;

    if (linkedPoNumber) {
      inboundRef = adminDb.collection('inbounds').doc(linkedPoNumber);
      const inboundDoc = await inboundRef!.get();
      if (inboundDoc.exists) inboundData = inboundDoc.data() as (InboundRequest & { stockDetails?: any[] });
    }

    // ── 3. Build inbound update payload (pure computation, no extra reads) ──
    let inboundPayload: Record<string, unknown> | null = null;

    if (inboundRef && inboundData) {
      const rawItems: any[] = Array.isArray(inboundData.items) ? inboundData.items : [];
      let itemsTouched = false;
      const nextItems = rawItems.map(line => {
        if (!hasCommonKey(targetKeys, [
          line?.itemName, line?.itemCode, line?.supplierCollectionCode,
          line?.stockDetail?.bcn, line?.stockDetail?.itemCode,
          line?.stockDetail?.supplierCollectionCode,
        ])) return line;

        itemsTouched = true;
        const next = { ...line };
        if (newDate)  next.expectedDeliveryDate = newDate;
        if (docketNo) next.docketNo = docketNo;
        if (next.stockDetail && typeof next.stockDetail === 'object') {
          next.stockDetail = {
            ...next.stockDetail,
            ...(newDate  ? { expectedDeliveryDate: newDate } : {}),
            ...(docketNo ? { docketNo }                      : {}),
          };
        }
        return next;
      });

      const rawStock: any[] = Array.isArray(inboundData.stockDetails) ? inboundData.stockDetails : [];
      let stockTouched = false;
      const nextStock = rawStock.map(line => {
        if (!hasCommonKey(targetKeys, [line?.bcn, line?.itemCode, line?.supplierCollectionCode]))
          return line;
        stockTouched = true;
        return {
          ...line,
          ...(newDate  ? { expectedDeliveryDate: newDate } : {}),
          ...(docketNo ? { docketNo }                      : {}),
        };
      });

      if (itemsTouched || stockTouched) {
        inboundPayload = { items: nextItems, updatedAt: nowIso };
        if (stockTouched) inboundPayload.stockDetails = nextStock;
      }
    }

    // ── 4. Fire both writes in parallel (no cross-dependency, skip transaction) ──
    const writes: Promise<unknown>[] = [
      requestRef.update({
        fabricDetails,
        poMilestones: FieldValue.arrayUnion(followUpMilestone),
      }),
    ];

    if (inboundRef && inboundPayload) {
      writes.push(inboundRef.update(inboundPayload));
    }

    await Promise.all(writes);

    return { success: true, message: `Follow-up for ${itemName} has been recorded.` };
  } catch (error: any) {
    console.error('Error updating follow-up status:', error);
    return { success: false, message: error.message };
  }
}