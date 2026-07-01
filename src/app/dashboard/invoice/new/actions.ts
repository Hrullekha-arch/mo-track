

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { DealOrder, Order, Quotation, Customer, Deal, FabricDetail, PurchaseRequest, Stock, VasDetail, OrderType, CuttingTask } from '@/lib/types';
import { getMilestonesForOrder } from '@/lib/constants';
import { buildWorkflowMilestones } from '@/lib/order-workflow';
import { upsertSalesmanIncentiveOrderEntry } from '@/lib/server/salesman-incentive';
import { buildOrderPricingFromQuotation } from '@/lib/quotation-order-pricing';

export async function getQuotationsForDeal(customerId: string, dealId: string): Promise<Quotation[]> {
    try {
        const snapshot = await adminDb
            .collection('customers')
            .doc(customerId)
            .collection('deals')
            .doc(dealId)
            .collection('quotations')
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const quotations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quotation));
        return JSON.parse(JSON.stringify(quotations));
    } catch (error) {
        console.error("Error fetching quotations for deal:", error);
        return [];
    }
}

const coerceNumber = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const stripUndefinedDeep = (value: any): any => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    const cleaned = value
      .map((entry) => stripUndefinedDeep(entry))
      .filter((entry) => entry !== undefined);
    return cleaned;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
      .filter(([, entry]) => entry !== undefined);
    return Object.fromEntries(entries);
  }
  return value;
};

const toIsoString = (value?: string | Date | null) => {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

type BillingDetailsSnapshot = {
  billingName?: string;
  billingPhone?: string;
  billingAddress?: string;
  gstin?: string;
  isDefault?: boolean;
};

const normalizeBillingDetailsSnapshot = (value: unknown): BillingDetailsSnapshot | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const normalized = stripUndefinedDeep({
    billingName: String(record.billingName || "").trim() || undefined,
    billingPhone: String(record.billingPhone || "").trim() || undefined,
    billingAddress: String(record.billingAddress || "").trim() || undefined,
    gstin: String(record.gstin || "").trim().toUpperCase() || undefined,
    isDefault: record.isDefault === true ? true : undefined,
  });
  const hasValues =
    Boolean((normalized as any).billingName) ||
    Boolean((normalized as any).billingPhone) ||
    Boolean((normalized as any).billingAddress) ||
    Boolean((normalized as any).gstin);
  if (!hasValues) return undefined;
  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const resolvePreferredBillingDetails = (customerData: Record<string, any>): BillingDetailsSnapshot | undefined => {
  const entries = Array.isArray(customerData?.billingDetails)
    ? customerData.billingDetails
        .map((entry: unknown) => normalizeBillingDetailsSnapshot(entry))
        .filter((entry): entry is BillingDetailsSnapshot => Boolean(entry))
    : [];
  if (entries.length === 0) return undefined;
  return entries.find((entry) => entry.isDefault) || entries[0];
};


export async function createDealOrderAction(
  customerId: string,
  dealId: string,
  quotationInput: Quotation,
  creator: { id: string; name: string },
  orderType: OrderType
): Promise<{ success: boolean; message: string; order?: Order }> {
  console.log ('Creating deal order for quotation:', quotationInput.id);
  try {
    const customerRef = adminDb.collection('customers').doc(customerId);
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const quotationRef = dealRef.collection('quotations').doc(quotationInput.id);

    // Get all necessary data in one go
    const [customerSnap, dealSnap, currentQuotationSnap] = await Promise.all([
      customerRef.get(),
      dealRef.get(),
      quotationRef.get()
    ]);

    // Server-side check to prevent multiple conversions
    if (!currentQuotationSnap.exists) {
      return { success: false, message: 'Quotation not found.' };
    }

    const quotation = {
      id: currentQuotationSnap.id,
      ...currentQuotationSnap.data(),
    } as Quotation;

    if (quotation.status === 'Converted to Order') {
      return { success: false, message: 'This quotation has already been converted to an order.' };
    }

    if (!customerSnap.exists) {
        return { success: false, message: 'Customer not found.' };
    }
    if (!dealSnap.exists) {
        return { success: false, message: 'Deal not found.' };
    }

    const customerData = customerSnap.data() as Customer;
    const dealData = dealSnap.data() as Deal;

    let salesmanName = 'N/A';
    let salesmanCode: string | undefined;
    const representativeId = dealData.assignedSalesPerson?.id || dealData.representativeId;
    if (representativeId) {
        const salesmanRef = adminDb.collection('users').doc(representativeId);
        const salesmanSnap = await salesmanRef.get();
        if (salesmanSnap.exists) {
            salesmanName = salesmanSnap.data()?.name || 'N/A';
            salesmanCode =
              String(salesmanSnap.data()?.salesmanCode || '').trim() || undefined;
        }
    }

    const batch = adminDb.batch();

    const dealOrdersRef = dealRef.collection('orders');
    const newDealOrderRef = dealOrdersRef.doc();

    const orderId = `MOTRACK-${quotation.quotationNo}`;
    const newOrderRef = adminDb.collection('orders').doc(orderId);

    const now = new Date().toISOString();

    const {
      rawNormalItems,
      rawVasItems,
      normalItems,
      vasItems,
      sections,
      overallSummary,
    } = buildOrderPricingFromQuotation(quotation);
    const workflowMilestones = buildWorkflowMilestones(orderType, creator);

    const isVasOnly = normalItems.length === 0 && vasItems.length > 0;

    const legacyVasDetails = (quotation.vasDetails && quotation.vasDetails.length > 0)
      ? quotation.vasDetails
      : rawVasItems.map((vas: any) => ({
          vasName: vas.vasName ?? vas.description ?? "VAS",
          rate: String(vas.rate ?? 0),
          quantity: String(vas.qty ?? vas.quantity ?? 0),
          room: vas.roomName ?? vas.room ?? undefined,
          gstPercent: coerceNumber(vas.gst ?? vas.gstPercent),
          hsnCode: vas.hsn ?? vas.hsnCode,
        }));

    const preferredBillingDetails = resolvePreferredBillingDetails(customerData as Record<string, any>);
    const baseBillingAddress = customerData.billingAddress || {
      line1: customerData.addressPinCode || undefined,
      city: customerData.city || undefined,
      state: customerData.state || undefined,
      pincode: customerData.pinCode || customerData.addressPinCode || undefined,
    };
    const billingAddress = stripUndefinedDeep({
      ...(baseBillingAddress || {}),
      line1: preferredBillingDetails?.billingAddress || baseBillingAddress?.line1,
    });

    const newOrder: Order = stripUndefinedDeep({
      id: orderId,
      orderId,
      orderNo: orderId,
      quotationId: quotation.id,
      quotationNo: quotation.quotationNo,
      customerId: customerId,
      dealId: dealData.dealId || dealId,
      customerSnapshot: {
        name: preferredBillingDetails?.billingName || customerData.name || quotation.customerName,
        phone: preferredBillingDetails?.billingPhone || customerData.phone || customerData.mobileNo || '',
        gstin: preferredBillingDetails?.gstin || customerData.gstin,
        billingAddress,
        shippingAddress: customerData.shippingAddress,
        billingDetails: preferredBillingDetails,
      },
      dealSnapshot: {
        dealCode: dealData.dealCode,
        title: dealData.title || dealData.dealName,
      },
      quotationSnapshotMeta: {
        createdAt: toIsoString(quotation.createdAt),
        validTill: toIsoString(quotation.validTillDate),
        statusAtConversion: quotation.status,
      },
      sections,
      overallSummary,
      workflow: {
        status: "CREATED",
        milestones: workflowMilestones,
      },
      invoicing: {
        status: "NOT_INVOICED",
        invoices: [],
        canCreateGoodsInvoice: normalItems.length > 0,
        canCreateVasInvoice: vasItems.length > 0,
        invoiceRequired: true,
      },
      updates: [
        {
          updatedAt: now,
          updatedBy: { id: creator.id, name: creator.name },
          action: "ORDER_CREATED",
          message: `Order created from quotation ${quotation.quotationNo}.`,
        },
      ],
      createdAt: now,
      updatedAt: now,
      createdBy: {
        id: creator.id,
        name: creator.name,
      },

      // Legacy fields (kept to avoid breaking existing dashboards)
      crmOrderNo: quotation.quotationNo,
      customerName: quotation.customerName,
      customerPhone:
        preferredBillingDetails?.billingPhone ||
        customerData.phone ||
        customerData.mobileNo ||
        '',
      customerAddress:
        preferredBillingDetails?.billingAddress ||
        customerData.billingAddress?.line1 ||
        customerData.addressPinCode ||
        `${customerData.city || ""}${customerData.state ? `, ${customerData.state}` : ""}`,
      salesPerson: salesmanName,
      orderType: orderType,
      milestones: (() => {
        const legacy = getMilestonesForOrder(orderType);
        const firstMilestone = legacy.find(m => m.id === 1);
        if (firstMilestone) {
          firstMilestone.completed = true;
          firstMilestone.completedAt = now;
          firstMilestone.completedBy = creator.name;
        }
        return legacy;
      })(),
      isAcknowledged: true,
      status: 'Approved',
      approvedAt: now,
      approvedBy: { id: creator.id, name: creator.name },
      dealOrderDocId: newDealOrderRef.id,
      storeName: quotation.store,
      fabricDetails: (() => {
        const approvedStockRef = adminDb.collection('approvedStock');
        return rawNormalItems.map((item: any, index: number) => {
          const bcn = String(item.bcn ?? item.collectionBrand ?? item.description ?? 'N/A').trim();
          const itemName = String(item.description ?? item.salesDescription ?? bcn ?? 'N/A').trim() || 'N/A';
          const lineId = String(item.lineId || item.itemId || `line-${index + 1}`);
          const newDocRef = approvedStockRef.doc();
          const approvedStockId = newDocRef.id;
          const fabricDetail = {
            lineId,
            bcn: bcn || undefined,
            itemName,
            fabricName: bcn || itemName,
            quantity: String(item.qty ?? item.quantity ?? 0),
            status: 'pending for po' as const,
            isInStock: false,
            rate: coerceNumber(item.exclusiveRate ?? item.rate),
            discountPercent: coerceNumber(item.discountPercent),
            approvedStockId,
          };
          batch.set(newDocRef, {
            orderId,
            crmOrderNo: quotation.quotationNo,
            dealId: dealData.dealId || dealId,
            lineId,
            customerName: quotation.customerName,
            salesPerson: salesmanName,
            fabricName: bcn || itemName,
            quantity: fabricDetail.quantity,
            status: 'Pending Stock Verification',
            createdAt: now,
            createdBy: creator,
            itemDetail: fabricDetail,
          });
          return fabricDetail;
        });
      })(),
      totalAmount: overallSummary.grandTotal || quotation.totalAmount,
      vasDetails: legacyVasDetails,
      representativeId: representativeId,
    }) as Order;

    batch.set(newOrderRef, newOrder);
    
    const newDealOrder: DealOrder = stripUndefinedDeep({
      id: newDealOrderRef.id,
      orderId: newOrder.id,
      orderNo: newOrder.orderNo ?? newOrder.id,
      orderDate: now,
      createdBy: creator.name,
      remark: quotation.billingName || undefined,
      status: newOrder.workflow?.status ?? "CREATED",
      overallSummary: newOrder.overallSummary,
    });

    batch.set(newDealOrderRef, newDealOrder);

    batch.update(quotationRef, { 
      status: 'Converted to Order',
      orderNo: newOrder.id,
    });
    
    await batch.commit();
    console.log('Batch committed successfully',batch);
    console.log('Deal order created successfully with ID:', newOrder.id);

    try {
      await upsertSalesmanIncentiveOrderEntry({
        order: newOrder,
        salesman: {
          id: representativeId,
          name: salesmanName,
          salesmanCode,
        },
        source: "INVOICE_NEW_ORDER_CONVERSION",
      });
    } catch (incentiveError) {
      console.error(
        `[salesman-incentive] Failed to persist incentive snapshot for order ${newOrder.id}:`,
        incentiveError
      );
    }

    return {
      success: true,
      message: 'Order created and approved. Items sent for stock verification.',
      order: JSON.parse(JSON.stringify(newOrder)),
    };
  } catch (error: any) {
    console.error('Error creating deal order:', error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}
