'use server';

import { getMilestonesForOrder } from '@/lib/constants';
import { Deal, DealOrder, Order, OrderType, Quotation } from '@/lib/types';
import {
  adminDb,
  buildWorkflowMilestones,
  coerceNumber,
  resolveOrderItemType,
  resolveOrderItemUnit,
  resolvePreferredBillingDetails,
  stripUndefined,
  stripUndefinedDeep,
  summarizeOrderItems,
  toIsoString,
  toTrimmedString,
  upsertSalesmanIncentiveOrderEntry,
} from './actions-shared';

export async function createDealOrderAction(
  customerId: string,
  dealId: string,
  quotation: Quotation,
  creator: { id: string; name: string },
  orderType: OrderType,
): Promise<{ success: boolean; message: string; order?: Order }> {
  try {
    const customerRef = adminDb.collection('customers').doc(customerId);
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const quotationRef = dealRef.collection('quotations').doc(quotation.id);

    const [customerSnap, dealSnap, currentQuotationSnap] = await Promise.all([
      customerRef.get(),
      dealRef.get(),
      quotationRef.get(),
    ]);

    if (currentQuotationSnap.exists && currentQuotationSnap.data()?.status === 'Converted to Order') {
      return { success: false, message: 'This quotation has already been converted to an order.' };
    }
    if (!customerSnap.exists) return { success: false, message: 'Customer not found.' };
    if (!dealSnap.exists) return { success: false, message: 'Deal not found.' };

    const customerData = customerSnap.data() as any;
    const dealData = dealSnap.data() as Deal;

    let salesmanName = 'N/A';
    let salesmanCode: string | undefined;
    const representativeId = dealData.assignedSalesPerson?.id || dealData.representativeId;
    if (representativeId) {
      const salesmanSnap = await adminDb.collection('users').doc(representativeId).get();
      if (salesmanSnap.exists) {
        salesmanName = salesmanSnap.data()?.name || 'N/A';
        salesmanCode = String(salesmanSnap.data()?.salesmanCode || '').trim() || undefined;
      }
    }

    const batch = adminDb.batch();
    const newDealOrderRef = dealRef.collection('orders').doc();
    const orderId = `MOTRACK-${quotation.quotationNo}`;
    const newOrderRef = adminDb.collection('orders').doc(orderId);
    const now = new Date().toISOString();

    const rawNormalItems = Array.isArray((quotation as any).sections?.NORMAL?.items)
      ? (quotation as any).sections.NORMAL.items
      : quotation.items || [];
    const rawVasItems = Array.isArray((quotation as any).sections?.VAS?.items)
      ? (quotation as any).sections.VAS.items
      : quotation.vasDetails || [];

    const normalItems = rawNormalItems.map((item: any) => {
      const itemType = resolveOrderItemType(item);
      const qty = coerceNumber(item.qty ?? item.quantity);
      const gst = coerceNumber(item.gst ?? item.gstPercent);
      const discountPercent = coerceNumber(item.discountPercent ?? item.discount, 0);
      const gstMode = String(item.gstMode ?? item.gstType ?? '').toUpperCase() === 'EXCL' ? 'EXCL' : 'INCL';
      const inputRate = coerceNumber(item.rate ?? item.originalMrp ?? item.mrp ?? item.unitPrice);
      let exclusiveRate = coerceNumber(item.exclusiveRate, Number.NaN);

      if (!Number.isFinite(exclusiveRate)) {
        exclusiveRate = gstMode === 'INCL' && gst > 0 ? inputRate / (1 + gst / 100) : inputRate || 0;
      }

      let grossRate = inputRate;
      if (!Number.isFinite(grossRate) || grossRate === 0) {
        grossRate = gstMode === 'INCL' && gst > 0 ? exclusiveRate * (1 + gst / 100) : exclusiveRate;
      }

      const grossAmount = grossRate * qty;
      const discountAmount = grossAmount * (discountPercent / 100);
      const amountAfterDiscount = grossAmount - discountAmount;

      const taxableAmount =
        gstMode === 'EXCL'
          ? amountAfterDiscount
          : gst > 0
            ? amountAfterDiscount / (1 + gst / 100)
            : amountAfterDiscount;
      const gstAmount =
        gstMode === 'EXCL' ? taxableAmount * (gst / 100) : amountAfterDiscount - taxableAmount;
      const totalAmount = gstMode === 'EXCL' ? taxableAmount + gstAmount : amountAfterDiscount;

      return stripUndefinedDeep({
        roomName: toTrimmedString(item.roomName ?? item.room),
        type: itemType,
        category: toTrimmedString(item.category || item.subCategory),
        itemId: toTrimmedString(item.itemId),
        bcn: toTrimmedString(item.bcn ?? item.collectionBrand),
        description: toTrimmedString(item.description || item.salesDescription || item.collectionBrand),
        unit: resolveOrderItemUnit(itemType, item),
        rate: exclusiveRate,
        exclusiveRate,
        qty,
        gst,
        gstMode,
        discountPercent,
        hsn: toTrimmedString(item.hsn ?? item.hsnCode),
        group: toTrimmedString(item.group),
        taxableAmount,
        gstAmount,
        totalAmount,
        allocation: { status: 'PENDING', lengths: [], lots: [] },
      });
    });

    const vasItems = rawVasItems.map((vas: any) => {
      const qty = coerceNumber(vas.qty ?? vas.quantity);
      const gst = coerceNumber(vas.gst ?? vas.gstPercent);
      const discountPercent = coerceNumber(vas.discountPercent ?? vas.discount, 0);
      const gstMode = String(vas.gstMode ?? vas.gstType ?? '').toUpperCase() === 'EXCL' ? 'EXCL' : 'INCL';
      const inputRate = coerceNumber(vas.rate ?? vas.originalMrp ?? vas.mrp ?? vas.unitPrice);
      const exclusiveRate = gstMode === 'INCL' && gst > 0 ? inputRate / (1 + gst / 100) : inputRate;
      const grossRate = gstMode === 'INCL' && gst > 0 ? inputRate : exclusiveRate;
      const grossAmount = grossRate * qty;
      const discountAmount = grossAmount * (discountPercent / 100);
      const amountAfterDiscount = grossAmount - discountAmount;
      const taxableAmount =
        gstMode === 'EXCL'
          ? amountAfterDiscount
          : gst > 0
            ? amountAfterDiscount / (1 + gst / 100)
            : amountAfterDiscount;
      const gstAmount =
        gstMode === 'EXCL' ? taxableAmount * (gst / 100) : amountAfterDiscount - taxableAmount;
      const totalAmount = gstMode === 'EXCL' ? taxableAmount + gstAmount : amountAfterDiscount;

      return stripUndefinedDeep({
        roomName: toTrimmedString(vas.roomName ?? vas.room),
        type: 'VAS',
        description: toTrimmedString(vas.description ?? vas.vasName),
        unit: resolveOrderItemUnit('VAS', vas),
        rate: exclusiveRate,
        exclusiveRate,
        qty,
        gst,
        gstMode,
        discountPercent,
        hsn: toTrimmedString(vas.hsn ?? vas.hsnCode),
        group: toTrimmedString(vas.group),
        taxableAmount,
        gstAmount,
        totalAmount,
      });
    });

    const normalSummary = summarizeOrderItems(normalItems);
    const vasSummary = summarizeOrderItems(vasItems);
    const sections = {
      NORMAL: { items: normalItems, summary: normalSummary },
      VAS: { items: vasItems, summary: vasSummary },
    };
    const overallSummary = {
      goodsTotal: normalSummary.grandTotal,
      vasTotal: vasSummary.grandTotal,
      grandTotal: normalSummary.grandTotal + vasSummary.grandTotal,
    };
    const workflowMilestones = buildWorkflowMilestones(orderType, creator);

    const preferredBillingDetails = resolvePreferredBillingDetails(customerData as Record<string, any>);
    const baseBillingAddress = stripUndefinedDeep(
      customerData.billingAddress || {
        line1: customerData.addressPinCode || undefined,
        city: customerData.city || undefined,
        state: customerData.state || undefined,
        pincode: customerData.pinCode || customerData.addressPinCode || undefined,
      },
    );
    const billingAddress = stripUndefinedDeep({
      ...(baseBillingAddress || {}),
      line1: preferredBillingDetails?.billingAddress || baseBillingAddress?.line1,
    });

    const customerSnapshot = stripUndefinedDeep({
      name: preferredBillingDetails?.billingName || customerData.name || quotation.customerName,
      phone: preferredBillingDetails?.billingPhone || customerData.phone || customerData.mobileNo || '',
      gstin: preferredBillingDetails?.gstin || customerData.gstin,
      billingAddress,
      shippingAddress: customerData.shippingAddress,
      billingDetails: preferredBillingDetails,
    });
    const dealSnapshot = stripUndefinedDeep({
      dealCode: dealData.dealCode,
      title: dealData.title || dealData.dealName,
    });
    const quotationSnapshotMeta = stripUndefinedDeep({
      createdAt: toIsoString(quotation.createdAt),
      validTill: toIsoString(quotation.validTillDate),
      statusAtConversion: quotation.status,
    });

    const legacyFabricDetails = rawNormalItems.map((item: any, index: number) => {
      const bcn = item.bcn ?? item.collectionBrand ?? item.description ?? 'N/A';
      return {
        lineId: String(item.lineId || item.itemId || `line-${index + 1}`),
        bcn,
        itemName: item.description ?? item.salesDescription ?? bcn,
        fabricName: bcn,
        quantity: String(item.qty ?? item.quantity ?? 0),
        status: 'pending for po',
        isInStock: null,
        rate: coerceNumber(item.exclusiveRate ?? item.rate),
        discountPercent: coerceNumber(item.discountPercent),
      };
    });

    const legacyVasDetails =
      quotation.vasDetails && quotation.vasDetails.length > 0
        ? quotation.vasDetails
        : rawVasItems.map((vas: any) => ({
            vasName: vas.vasName ?? vas.description ?? 'VAS',
            rate: String(vas.rate ?? 0),
            quantity: String(vas.qty ?? vas.quantity ?? 0),
            room: vas.roomName ?? vas.room ?? undefined,
            gstPercent: coerceNumber(vas.gst ?? vas.gstPercent),
            hsnCode: vas.hsn ?? vas.hsnCode,
          }));

    const initialMilestones = getMilestonesForOrder(orderType);
    const firstMilestone = initialMilestones.find((m) => m.id === 1);
    if (firstMilestone) {
      firstMilestone.completed = true;
      firstMilestone.completedAt = now;
      firstMilestone.completedBy = creator.name;
    }

    const isVasOnly = normalItems.length === 0 && vasItems.length > 0;
    const newOrder: Order = stripUndefinedDeep({
      id: orderId,
      orderId,
      orderNo: orderId,
      quotationId: quotation.id,
      quotationNo: quotation.quotationNo,
      customerId,
      dealId: dealData.dealId || dealId,
      customerSnapshot,
      dealSnapshot,
      quotationSnapshotMeta,
      sections,
      overallSummary,
      workflow: { status: 'CREATED', milestones: workflowMilestones },
      invoicing: {
        status: 'NOT_INVOICED',
        invoices: [],
        canCreateGoodsInvoice: normalItems.length > 0,
        canCreateVasInvoice: vasItems.length > 0,
        invoiceRequired: true,
      },
      updates: [
        {
          updatedAt: now,
          updatedBy: stripUndefined({ id: creator.id, name: creator.name }),
          action: 'ORDER_CREATED',
          message: `Order created from quotation ${quotation.quotationNo}.`,
        },
      ],
      createdAt: now,
      updatedAt: now,
      createdBy: { id: creator.id, name: creator.name },
      crmOrderNo: quotation.quotationNo,
      customerName: quotation.customerName,
      customerPhone: preferredBillingDetails?.billingPhone || customerData.phone || customerData.mobileNo || '',
      customerAddress:
        preferredBillingDetails?.billingAddress ||
        customerData.billingAddress?.line1 ||
        customerData.addressPinCode ||
        `${customerData.city || ''}${customerData.state ? `, ${customerData.state}` : ''}`,
      salesPerson: salesmanName,
      orderType,
      milestones: initialMilestones,
      storeName: quotation.store,
      fabricDetails: legacyFabricDetails,
      totalAmount: overallSummary.grandTotal || quotation.totalAmount,
      vasDetails: legacyVasDetails,
      status: 'Approved',
      approvedAt: now,
      approvedBy: { id: creator.id, name: creator.name },
      isAcknowledged: true,
      dealOrderDocId: newDealOrderRef.id,
      representativeId,
    }) as Order;

    batch.set(newOrderRef, newOrder);
    batch.set(
      newDealOrderRef,
      stripUndefinedDeep({
        id: newDealOrderRef.id,
        orderId: newOrder.id,
        orderNo: newOrder.orderNo ?? newOrder.id,
        orderDate: now,
        createdBy: creator.name,
        remark: quotation.billingName || undefined,
        status: newOrder.workflow?.status ?? 'CREATED',
        overallSummary: newOrder.overallSummary,
      }) as DealOrder,
    );
    batch.update(quotationRef, { status: 'Converted to Order', orderNo: newOrder.id });
    await batch.commit();

    try {
      await upsertSalesmanIncentiveOrderEntry({
        order: newOrder,
        salesman: { id: representativeId, name: salesmanName, salesmanCode },
        source: 'CUSTOMER_DEAL_ORDER_CONVERSION',
      });
    } catch (incentiveError) {
      console.error(
        `[salesman-incentive] Failed to persist incentive snapshot for order ${newOrder.id}:`,
        incentiveError,
      );
    }

    return {
      success: true,
      message: isVasOnly
        ? 'Order created and sent directly for invoicing.'
        : 'Order created and sent for approval.',
      order: JSON.parse(JSON.stringify(newOrder)),
    };
  } catch (error: any) {
    console.error('Error creating deal order:', error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}

export async function getOrdersForDeal(customerId: string, dealId: string): Promise<DealOrder[]> {
  try {
    const snapshot = await adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('orders')
      .orderBy('orderDate', 'desc')
      .get();

    if (snapshot.empty) return [];
    const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as DealOrder));
    return JSON.parse(JSON.stringify(orders));
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}
