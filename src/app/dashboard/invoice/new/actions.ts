

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { DealOrder, Order, Quotation, Customer, Deal, FabricDetail, PurchaseRequest, Stock } from '@/lib/types';
import { getMilestonesForOrder } from '@/lib/constants';

export async function createDealOrderAction(
  customerId: string,
  dealId: string,
  quotation: Quotation,
  creator: { id: string; name: string }
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

    // Fetch the salesman's name from the users collection
    let salesmanName = 'N/A';
    if (dealData.representativeId) {
        const salesmanRef = adminDb.collection('users').doc(dealData.representativeId);
        const salesmanSnap = await salesmanRef.get();
        if (salesmanSnap.exists) {
            salesmanName = salesmanSnap.data()?.name || 'N/A';
        }
    }

    const batch = adminDb.batch();
    
    // Create the DealOrder subcollection document first to get its ID
    const dealOrdersRef = dealRef.collection('orders');
    const newDealOrderRef = dealOrdersRef.doc();

    // 1. Create the new order in the main orders collection
    const orderId = `MOTRACK-${quotation.quotationNo}`;
    const newOrderRef = adminDb.collection('orders').doc(orderId);

    const allFabricDetails: FabricDetail[] = [];
    const fabricToPurchase: FabricDetail[] = [];

    // Check stock for all items (assuming all are fabric)
    for (const item of quotation.items) {
      const itemName = item.collectionBrand;
      const requiredQty = Number(item.quantity) || 0;

      const stockRef = adminDb.collection('stocks').doc(itemName.replace(/\//g, '-'));
      const stockSnap = await stockRef.get();
      const currentStock = (stockSnap.data() as Stock)?.quantity || 0;

      allFabricDetails.push({ fabricName: itemName, quantity: String(requiredQty) });
      if (requiredQty > currentStock) {
        fabricToPurchase.push({ fabricName: itemName, quantity: String(requiredQty - currentStock) });
      }
    }

    // --- AUTOMATION LOGIC ---
    // Automatically mark the first milestone ("Order Received") as complete.
    const milestones = getMilestonesForOrder('stitching');
    milestones[0] = {
        ...milestones[0],
        completed: true,
        completedAt: new Date().toISOString(),
        completedBy: creator.name,
    };
    // --- END AUTOMATION LOGIC ---

    const newOrder: Order = {
      id: orderId,
      crmOrderNo: quotation.quotationNo,
      customerName: quotation.customerName,
      customerPhone: customerData.mobileNo || '',
      customerAddress: customerData.addressPinCode || `${customerData.city}, ${customerData.state}`,
      salesPerson: salesmanName,
      orderType: 'stitching', // Default, should be determined
      milestones: milestones,
      createdAt: new Date().toISOString(),
      isAcknowledged: true,
      status: 'Approved',
      customerId: customerId,
      dealId: dealId,
      dealOrderDocId: newDealOrderRef.id,
      storeName: quotation.store,
      fabricDetails: allFabricDetails,
    };

    batch.set(newOrderRef, newOrder);

    // 2. Create a corresponding Purchase Request if there are items that need purchasing
    if (fabricToPurchase.length > 0) {
        const purchaseRequestRef = adminDb.collection('purchaseRequests').doc(quotation.quotationNo);
        const newPurchaseRequest: Omit<PurchaseRequest, 'id'> = {
            dealId: quotation.quotationNo,
            customerName: quotation.customerName,
            promiseDeliveryDate: new Date().toISOString(), // Placeholder, can be updated later
            salesman: salesmanName,
            type: 'fabric',
            fabricDetails: fabricToPurchase,
            createdAt: new Date().toISOString(),
            createdBy: { id: creator.id, name: creator.name },
            milestones: [],
            vendorType: 'undecided',
            status: 'Pending Approval',
        };
        batch.set(purchaseRequestRef, newPurchaseRequest);
    }
    
    // 3. Now define the DealOrder with the main order ID
    const newDealOrder: DealOrder = {
      orderNo: newOrder.id,
      id: newDealOrderRef.id,
      orderDate: new Date().toISOString(),
      createdBy: creator.name,
      remark: quotation.billingName || '',
      items: quotation.items,
      status: 'Approved'
    };

    batch.set(newDealOrderRef, newDealOrder);

    // 4. Update the quotation status
    batch.update(quotationRef, { 
      status: 'Converted to Order',
      orderNo: newOrder.id,
    });

    await batch.commit();

    return {
      success: true,
      message: 'Order created successfully and is now active.',
      order: JSON.parse(JSON.stringify(newOrder)),
    };
  } catch (error: any) {
    console.error('Error creating deal order:', error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}
