

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { DealOrder, Order, Quotation } from '@/lib/types';

export async function createDealOrderAction(
  customerId: string,
  dealId: string,
  quotation: Quotation
): Promise<{ success: boolean; message: string; order?: Order }> {
  try {
    const quotationRef = adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('quotations')
      .doc(quotation.id);

    // Server-side check to prevent multiple conversions
    const currentQuotationSnap = await quotationRef.get();
    if (currentQuotationSnap.exists && currentQuotationSnap.data()?.status === 'Converted to Order') {
      return { success: false, message: 'This quotation has already been converted to an order.' };
    }

    const batch = adminDb.batch();

    // 1. Create the new order in the main orders collection
    const orderId = `MOTRACK-${Math.floor(1000 + Math.random() * 9000)}`;
    const newOrderRef = adminDb.collection('orders').doc(orderId);

    const newOrder: Order = {
      id: orderId,
      crmOrderNo: quotation.quotationNo, // Using quotationNo as the reference
      customerName: quotation.customerName,
      customerPhone: '', // This should be fetched from customer record if needed
      customerAddress: '', // This should be fetched from customer record if needed
      salesPerson: '', // This should be fetched from deal/salesman record
      orderType: 'stitching', // Default, should be determined
      milestones: [], // This will be set based on order type
      createdAt: new Date().toISOString(),
      isAcknowledged: true, // It is now in the main workflow
      status: 'Pending Approval',
    };

    batch.set(newOrderRef, newOrder);
    
    // 2. Create the DealOrder subcollection document
    const dealOrdersRef = adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('orders');
      
    const newDealOrderRef = dealOrdersRef.doc();

    const newDealOrder: DealOrder = {
      orderNo: newOrder.id,
      id: newDealOrderRef.id,
      orderDate: new Date().toISOString(),
      createdBy: quotation.createdBy || 'System',
      remark: quotation.billingName || '',
      items: quotation.items,
      status: 'Pending Approval'
    };

    batch.set(newDealOrderRef, newDealOrder);

    // 3. Update the quotation status
    batch.update(quotationRef, { 
      status: 'Converted to Order',
      orderNo: newOrder.id,
    });

    await batch.commit();

    return {
      success: true,
      message: 'Order created successfully. It is now pending approval.',
      order: JSON.parse(JSON.stringify(newOrder)),
    };
  } catch (error: any) {
    console.error('Error creating deal order:', error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}

    