'use server';

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { Order, OrderType, User } from '@/lib/types';
import {
  buildWorkflowFromLegacyMilestones,
  getNormalizedOrderMilestones,
} from '@/lib/order-workflow';

type SalesmanOption = {
  id: string;
  name: string;
  salesmanCode?: string;
};

export type SalesmanOrderSummary = {
  id: string;
  orderNo?: string;
  customerName?: string;
  salesPerson?: string;
  representativeId?: string;
  orderType?: string;
  status?: string;
  createdAt?: string;
  isCompleted: boolean;
};

const normalizeOrderType = (value?: string): OrderType => {
  if (value === 'delivery' || value === 'stitching' || value === 'stitching+installation') {
    return value;
  }
  return 'delivery';
};

const toTimestamp = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }
  if (typeof value === 'object' && value && '_seconds' in (value as Record<string, unknown>)) {
    const seconds = Number((value as { _seconds?: number })._seconds || 0);
    const nanos = Number((value as { _nanoseconds?: number })._nanoseconds || 0);
    return seconds * 1000 + nanos / 1e6;
  }
  return 0;
};

const toIsoDateString = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'object' && value && '_seconds' in (value as Record<string, unknown>)) {
    const seconds = Number((value as { _seconds?: number })._seconds || 0);
    const nanos = Number((value as { _nanoseconds?: number })._nanoseconds || 0);
    return new Date(seconds * 1000 + nanos / 1e6).toISOString();
  }
  return undefined;
};

export async function getSalesmenForBulkCompleteAction(): Promise<{
  success: boolean;
  message: string;
  salesmen: SalesmanOption[];
}> {
  try {
    const snap = await adminDb.collection('users').where('role', '==', 'salesman').get();
    const salesmen = snap.docs
      .map((doc) => {
        const data = doc.data() as User;
        return {
          id: doc.id,
          name: String(data?.name || '').trim(),
          salesmanCode: String(data?.salesmanCode || '').trim() || undefined,
        };
      })
      .filter((s) => s.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      success: true,
      message: 'Salesmen loaded.',
      salesmen,
    };
  } catch (error: any) {
    console.error('Error loading salesmen for bulk completion:', error);
    return {
      success: false,
      message: error?.message || 'Failed to load salesmen.',
      salesmen: [],
    };
  }
}

export async function getOrdersForSalesmanBulkCompleteAction(
  salesmanId: string
): Promise<{
  success: boolean;
  message: string;
  orders: SalesmanOrderSummary[];
}> {
  try {
    const trimmedSalesmanId = String(salesmanId || '').trim();
    if (!trimmedSalesmanId) {
      return {
        success: false,
        message: 'Salesman is required.',
        orders: [],
      };
    }

    const salesmanDoc = await adminDb.collection('users').doc(trimmedSalesmanId).get();
    const salesmanName = salesmanDoc.exists
      ? String((salesmanDoc.data() as User)?.name || '').trim()
      : '';

    const byRepresentativePromise = adminDb
      .collection('orders')
      .where('representativeId', '==', trimmedSalesmanId)
      .get();

    const bySalesPersonPromise = salesmanName
      ? adminDb.collection('orders').where('salesPerson', '==', salesmanName).get()
      : Promise.resolve(null as any);

    const [byRepresentativeSnap, bySalesPersonSnap] = await Promise.all([
      byRepresentativePromise,
      bySalesPersonPromise,
    ]);

    const byId = new Map<string, Order>();
    byRepresentativeSnap.docs.forEach((doc) => {
      byId.set(doc.id, { ...(doc.data() as Order), id: doc.id });
    });
    if (bySalesPersonSnap?.docs?.length) {
      bySalesPersonSnap.docs.forEach((doc: any) => {
        if (!byId.has(doc.id)) {
          byId.set(doc.id, { ...(doc.data() as Order), id: doc.id });
        }
      });
    }

    const orders: SalesmanOrderSummary[] = Array.from(byId.values())
      .map((order) => {
        const milestones = getNormalizedOrderMilestones(order);
        const milestoneComplete = milestones.length > 0 && milestones.every((m) => m.completed);
        const workflowComplete =
          String(order?.workflow?.status || '').trim().toUpperCase() === 'COMPLETED';

        return {
          id: order.id,
          orderNo: order.orderNo || order.crmOrderNo || order.id,
          customerName: order.customerName,
          salesPerson: order.salesPerson,
          representativeId: order.representativeId,
          orderType: order.orderType,
          status: order.status || order.workflow?.status,
          createdAt: toIsoDateString(order.createdAt),
          isCompleted: milestoneComplete || workflowComplete,
        };
      })
      .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));

    return {
      success: true,
      message: `Loaded ${orders.length} orders.`,
      orders,
    };
  } catch (error: any) {
    console.error('Error loading salesman orders for bulk completion:', error);
    return {
      success: false,
      message: error?.message || 'Failed to load orders.',
      orders: [],
    };
  }
}

export async function completeOrdersMilestonesBulkAction(input: {
  orderIds: string[];
  completedBy?: string;
}): Promise<{
  success: boolean;
  message: string;
  updatedCount: number;
  skippedCount: number;
  skippedOrderIds: string[];
}> {
  const orderIds = Array.from(
    new Set((Array.isArray(input?.orderIds) ? input.orderIds : []).map((id) => String(id || '').trim()))
  ).filter(Boolean);

  if (!orderIds.length) {
    return {
      success: false,
      message: 'Select at least one order.',
      updatedCount: 0,
      skippedCount: 0,
      skippedOrderIds: [],
    };
  }

  const actorName = String(input?.completedBy || '').trim() || 'Admin';
  const nowIso = new Date().toISOString();
  const skippedOrderIds: string[] = [];
  let updatedCount = 0;

  try {
    let batch = adminDb.batch();
    let pendingWrites = 0;
    const BATCH_SIZE_LIMIT = 400;

    for (const orderId of orderIds) {
      try {
        const orderRef = adminDb.collection('orders').doc(orderId);
        const snap = await orderRef.get();
        if (!snap.exists) {
          skippedOrderIds.push(orderId);
          continue;
        }

        const order = { ...(snap.data() as Order), id: snap.id } as Order;
        const normalizedMilestones = getNormalizedOrderMilestones(order);
        if (!normalizedMilestones.length) {
          skippedOrderIds.push(orderId);
          continue;
        }

        const completedMilestones = normalizedMilestones.map((milestone) => ({
          ...milestone,
          completed: true,
          completedAt: milestone.completedAt || nowIso,
          completedBy: milestone.completedBy || actorName,
          location: milestone.location ?? null,
        }));

        const normalizedType = normalizeOrderType(order.orderType);
        const workflow = buildWorkflowFromLegacyMilestones(
          normalizedType,
          completedMilestones,
          order.workflow,
          'COMPLETED'
        );

        const updatePayload: Record<string, unknown> = {
          milestones: completedMilestones,
          workflow,
          status: 'INSTALLATION DONE',
          completedAt: order.completedAt || nowIso,
          updatedAt: nowIso,
          updates: FieldValue.arrayUnion({
            updatedAt: nowIso,
            updatedBy: { name: actorName },
            action: 'BULK_COMPLETE_ORDER',
            message: 'All order milestones marked completed by admin bulk tool.',
          }),
        };

        batch.update(orderRef, updatePayload);
        pendingWrites += 1;
        updatedCount += 1;

        if (pendingWrites >= BATCH_SIZE_LIMIT) {
          await batch.commit();
          batch = adminDb.batch();
          pendingWrites = 0;
        }
      } catch (error) {
        console.error(`Failed bulk-completing order ${orderId}:`, error);
        skippedOrderIds.push(orderId);
      }
    }

    if (pendingWrites > 0) {
      await batch.commit();
    }

    const skippedCount = skippedOrderIds.length;
    const success = updatedCount > 0;
    return {
      success,
      message: success
        ? `Completed milestones for ${updatedCount} order(s).`
        : 'No orders were updated.',
      updatedCount,
      skippedCount,
      skippedOrderIds,
    };
  } catch (error: any) {
    console.error('Error completing order milestones in bulk:', error);
    return {
      success: false,
      message: error?.message || 'Failed to complete orders.',
      updatedCount,
      skippedCount: skippedOrderIds.length,
      skippedOrderIds,
    };
  }
}

