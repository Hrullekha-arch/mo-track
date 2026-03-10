

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { DealOrder, Order, Quotation, Customer, Deal, FabricDetail, PurchaseRequest, Stock, VasDetail, OrderType, CuttingTask } from '@/lib/types';
import { getMilestonesForOrder } from '@/lib/constants';
import { buildWorkflowMilestones } from '@/lib/order-workflow';

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

const resolveOrderItemType = (item: any) => {
  const raw = String(item?.type || item?.productType || item?.bcnType || "").trim().toUpperCase();
  if (raw.includes("HARDWARE")) return "HARDWARE";
  if (raw.includes("CHANNEL")) return "CHANNEL";
  if (raw.includes("ACCESSORY")) return "ACCESSORY";
  if (raw.includes("VAS")) return "VAS";
  return "FABRIC";
};

const resolveOrderItemUnit = (itemType: string, item: any) => {
  const unit = String(item?.unit || "").trim().toUpperCase();
  if (unit) return unit;
  if (itemType === "FABRIC") return "MTR";
  return "PCS";
};

const summarizeOrderItems = (items: Array<{ taxableAmount?: number; gstAmount?: number; totalAmount?: number }>) => {
  return items.reduce(
    (acc, item) => {
      acc.subTotal += coerceNumber(item.taxableAmount);
      acc.gstTotal += coerceNumber(item.gstAmount);
      acc.grandTotal += coerceNumber(item.totalAmount);
      return acc;
    },
    { subTotal: 0, gstTotal: 0, grandTotal: 0 }
  );
};


export async function createDealOrderAction(
  customerId: string,
  dealId: string,
  quotation: Quotation,
  creator: { id: string; name: string },
  orderType: OrderType
): Promise<{ success: boolean; message: string; order?: Order }> {
  console.log ('Creating deal order for quotation:', quotation.id);
  try {
    const customerRef = adminDb.collection('customers').doc(customerId);
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const quotationRef = dealRef.collection('quotations').doc(quotation.id);

    // Get all necessary data in one go
    const [customerSnap, dealSnap, currentQuotationSnap] = await Promise.all([
      customerRef.get(),
      dealRef.get(),
      quotationRef.get()
    ]);

    // Server-side check to prevent multiple conversions
    if (currentQuotationSnap.exists && currentQuotationSnap.data()?.status === 'Converted to Order') {
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
    const representativeId = dealData.assignedSalesPerson?.id || dealData.representativeId;
    if (representativeId) {
        const salesmanRef = adminDb.collection('users').doc(representativeId);
        const salesmanSnap = await salesmanRef.get();
        if (salesmanSnap.exists) {
            salesmanName = salesmanSnap.data()?.name || 'N/A';
        }
    }

    const batch = adminDb.batch();

    const dealOrdersRef = dealRef.collection('orders');
    const newDealOrderRef = dealOrdersRef.doc();

    const orderId = `MOTRACK-${quotation.quotationNo}`;
    const newOrderRef = adminDb.collection('orders').doc(orderId);

    const now = new Date().toISOString();

    const rawNormalItems = Array.isArray((quotation as any).sections?.NORMAL?.items)
      ? (quotation as any).sections.NORMAL.items
      : (quotation.items || []);
    const rawVasItems = Array.isArray((quotation as any).sections?.VAS?.items)
      ? (quotation as any).sections.VAS.items
      : (quotation.vasDetails || []);

    const normalItems = rawNormalItems.map((item: any) => {
      const itemType = resolveOrderItemType(item);
      const qty = coerceNumber(item.qty ?? item.quantity);
      const gst = coerceNumber(item.gst ?? item.gstPercent);
      const discountPercent = coerceNumber(item.discountPercent ?? item.discount, 0);
      const gstMode = String(item.gstMode ?? item.gstType ?? "").toUpperCase() === "EXCL" ? "EXCL" : "INCL";

      const inputRate = coerceNumber(item.rate ?? item.originalMrp ?? item.mrp ?? item.unitPrice);
      let exclusiveRate = coerceNumber(item.exclusiveRate, Number.NaN);
      if (!Number.isFinite(exclusiveRate)) {
        if (gstMode === "INCL" && gst > 0 && Number.isFinite(inputRate)) {
          exclusiveRate = inputRate / (1 + gst / 100);
        } else if (Number.isFinite(inputRate)) {
          exclusiveRate = inputRate;
        } else {
          exclusiveRate = 0;
        }
      }

      let grossRate = inputRate;
      if (!Number.isFinite(grossRate) || grossRate === 0) {
        if (gstMode === "INCL" && gst > 0) {
          grossRate = exclusiveRate * (1 + gst / 100);
        } else {
          grossRate = exclusiveRate;
        }
      }

      const grossAmount = grossRate * qty;
      const discountAmount = grossAmount * (discountPercent / 100);
      const amountAfterDiscount = grossAmount - discountAmount;

      let taxableAmount = 0;
      let gstAmount = 0;
      let totalAmount = 0;
      if (gstMode === "EXCL") {
        taxableAmount = amountAfterDiscount;
        gstAmount = taxableAmount * (gst / 100);
        totalAmount = taxableAmount + gstAmount;
      } else {
        taxableAmount = gst > 0 ? amountAfterDiscount / (1 + gst / 100) : amountAfterDiscount;
        gstAmount = amountAfterDiscount - taxableAmount;
        totalAmount = amountAfterDiscount;
      }

      return {
        roomName: item.roomName ?? item.room ?? undefined,
        type: itemType,
        category: item.category || item.subCategory || undefined,
        itemId: item.itemId || undefined,
        bcn: item.bcn ?? item.collectionBrand ?? undefined,
        description: item.description || item.salesDescription || item.collectionBrand || undefined,
        unit: resolveOrderItemUnit(itemType, item),
        rate: exclusiveRate,
        exclusiveRate,
        qty,
        gst,
        gstMode,
        discountPercent,
        hsn: (item.hsn ?? item.hsnCode) || undefined,
        group: item.group || undefined,
        taxableAmount,
        gstAmount,
        totalAmount,
        allocation: {
          status: "PENDING",
          lengths: [],
          lots: [],
        },
      };
    });
    
    const vasItems = rawVasItems.map((vas: any) => {
      const qty = coerceNumber(vas.qty ?? vas.quantity);
      const gst = coerceNumber(vas.gst ?? vas.gstPercent);
      const discountPercent = coerceNumber(vas.discountPercent ?? vas.discount, 0);
      const gstMode = String(vas.gstMode ?? vas.gstType ?? "").toUpperCase() === "EXCL" ? "EXCL" : "INCL";
      const inputRate = coerceNumber(vas.rate ?? vas.originalMrp ?? vas.mrp ?? vas.unitPrice);
      const exclusiveRate = vas.rate;
        // gstMode === "INCL" && gst > 0 ? inputRate / (1 + gst / 100) : inputRate;
      const grossRate = gstMode === "INCL" && gst > 0 ? inputRate : exclusiveRate;
      const grossAmount = grossRate * qty;
      const discountAmount = grossAmount * (discountPercent / 100);
      const amountAfterDiscount = grossAmount - discountAmount;

      let taxableAmount = 0;
      let gstAmount = 0;
      let totalAmount = 0;
      if (gstMode === "EXCL") {
        taxableAmount = amountAfterDiscount;
        gstAmount = taxableAmount * (gst / 100);
        totalAmount = taxableAmount + gstAmount;
      } else {
        taxableAmount = gst > 0 ? amountAfterDiscount / (1 + gst / 100) : amountAfterDiscount;
        gstAmount = amountAfterDiscount - taxableAmount;
        totalAmount = amountAfterDiscount;
      }

      return {
        roomName: vas.roomName ?? vas.room ?? undefined,
        type: "VAS",
        description: vas.description ?? vas.vasName ?? undefined,
        unit: resolveOrderItemUnit("VAS", vas),
        rate: exclusiveRate,
        exclusiveRate,
        qty,
        gst,
        gstMode,
        discountPercent,
        hsn: (vas.hsn ?? vas.hsnCode) || undefined,
        group: vas.group || undefined,
        taxableAmount,
        gstAmount,
        totalAmount,
      };
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

    const billingAddress = customerData.billingAddress || {
      line1: customerData.addressPinCode || undefined,
      city: customerData.city || undefined,
      state: customerData.state || undefined,
      pincode: customerData.pinCode || customerData.addressPinCode || undefined,
    };

    const newOrder: Order = stripUndefinedDeep({
      id: orderId,
      orderId,
      orderNo: orderId,
      quotationId: quotation.id,
      quotationNo: quotation.quotationNo,
      customerId: customerId,
      dealId: dealData.dealId || dealId,
      customerSnapshot: {
        name: customerData.name || quotation.customerName,
        phone: customerData.phone || customerData.mobileNo || '',
        gstin: customerData.gstin,
        billingAddress,
        shippingAddress: customerData.shippingAddress,
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
      customerPhone: customerData.phone || customerData.mobileNo || '',
      customerAddress: customerData.billingAddress?.line1 || customerData.addressPinCode || `${customerData.city || ""}${customerData.state ? `, ${customerData.state}` : ""}`,
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
      status: isVasOnly ? 'Approved' : 'Pending Approval',
      dealOrderDocId: newDealOrderRef.id,
      storeName: quotation.store,
      fabricDetails: rawNormalItems.map((item: any) => ({
        fabricName: item.bcn ?? item.collectionBrand ?? item.description ?? "N/A",
        quantity: String(item.qty ?? item.quantity ?? 0),
        status: 'pending for po',
        rate: coerceNumber(item.exclusiveRate ?? item.rate),
        discountPercent: coerceNumber(item.discountPercent),
      })),
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

    return {
      success: true,
      message: isVasOnly ? 'VAS Order created. Generate invoice from the invoice screen when ready.' : 'Order created and sent for approval.',
      order: JSON.parse(JSON.stringify(newOrder)),
    };
  } catch (error: any) {
    console.error('Error creating deal order:', error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}
