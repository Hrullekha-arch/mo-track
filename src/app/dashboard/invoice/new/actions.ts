

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { DealOrder, Order, Quotation, Customer, Deal, FabricDetail, PurchaseRequest, Stock, VasDetail, OrderType, CuttingTask, InvoiceBatch, InvoiceBatchItem } from '@/lib/types';
import { getMilestonesForOrder } from '@/lib/constants';
import { FieldValue } from 'firebase-admin/firestore';

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


export async function createDealOrderAction(
  customerId: string,
  dealId: string,
  quotation: Quotation,
  creator: { id: string; name: string },
  orderType: OrderType
): Promise<{ success: boolean; message: string; order?: Order }> {
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
    if (dealData.representativeId) {
        const salesmanRef = adminDb.collection('users').doc(dealData.representativeId);
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

    const isVasOnly = (!quotation.items || quotation.items.length === 0) && (quotation.vasDetails && quotation.vasDetails.length > 0);

    const allFabricDetails: FabricDetail[] = (quotation.items || []).map(item => ({
      fabricName: item.collectionBrand,
      quantity: String(item.quantity),
      status: 'pending for po', 
      rate: item.rate || 0,
      discountPercent: item.discountPercent || 0,
    }));
    
    const initialMilestones = getMilestonesForOrder(orderType);
    const firstMilestone = initialMilestones.find(m => m.id === 1);
    if (firstMilestone) {
        firstMilestone.completed = true;
        firstMilestone.completedAt = new Date().toISOString();
        firstMilestone.completedBy = creator.name;
    }

    const newOrder: Order = {
      id: orderId,
      crmOrderNo: quotation.quotationNo,
      customerName: quotation.customerName,
      customerPhone: customerData.mobileNo || '',
      customerAddress: customerData.addressPinCode || `${customerData.city}, ${customerData.state}`,
      salesPerson: salesmanName,
      orderType: orderType,
      milestones: initialMilestones,
      createdAt: new Date().toISOString(),
      isAcknowledged: true,
      status: isVasOnly ? 'Approved' : 'Pending Approval',
      customerId: customerId,
      dealId: dealData.dealId,
      dealOrderDocId: newDealOrderRef.id,
      storeName: quotation.store,
      fabricDetails: allFabricDetails,
      totalAmount: quotation.totalAmount,
      vasDetails: quotation.vasDetails || [],
      createdBy: {
        id: creator.id,
        name: creator.name
      },
      representativeId: dealData.representativeId,
    };

    batch.set(newOrderRef, newOrder);
    
    // If it's a VAS-only order, create the invoice batch immediately.
    if (isVasOnly) {
        const vasInvoiceItems: InvoiceBatchItem[] = (quotation.vasDetails || []).map(vas => ({
            itemName: vas.vasName,
            bcn: `VAS-${vas.vasName}`,
            quantityAllocated: Number(vas.quantity) || 0,
            rate: Number(vas.rate) || 0,
            discountPercent: 0,
        }));
        
        const vasBatchRef = adminDb.collection("invoiceBatches").doc();
        const newVasInvoiceBatch: Omit<InvoiceBatch, 'id'> = {
            orderId: newOrder.id,
            customerName: newOrder.customerName,
            customerPhone: newOrder.customerPhone,
            customerAddress: newOrder.customerAddress,
            salesPerson: newOrder.salesPerson,
            createdAt: new Date().toISOString(),
            status: 'pendingInvoice',
            items: vasInvoiceItems,
            isVas: true,
        };
        batch.set(vasBatchRef, newVasInvoiceBatch);
    }
    
    const newDealOrder: DealOrder = {
      orderNo: newOrder.id,
      id: newDealOrderRef.id,
      orderDate: new Date().toISOString(),
      createdBy: creator.name,
      remark: quotation.billingName || '',
      items: quotation.items,
      status: isVasOnly ? 'Approved' : 'Pending Approval'
    };

    batch.set(newDealOrderRef, newDealOrder);

    batch.update(quotationRef, { 
      status: 'Converted to Order',
      orderNo: newOrder.id,
    });
    
    await batch.commit();

    return {
      success: true,
      message: isVasOnly ? 'VAS Order created and sent directly for invoicing.' : 'Order created and sent for approval.',
      order: JSON.parse(JSON.stringify(newOrder)),
    };
  } catch (error: any) {
    console.error('Error creating deal order:', error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}
