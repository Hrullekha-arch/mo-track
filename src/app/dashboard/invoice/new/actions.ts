

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { DealOrder, Order, Quotation, Customer, Deal, FabricDetail, FurnitureDetail, PurchaseRequest } from '@/lib/types';
import { getMilestonesForOrder } from '@/lib/constants';
import { getAuth } from 'firebase-admin/auth';

export async function createDealOrderAction(
  customerId: string,
  dealId: string,
  quotation: Quotation,
  creatorName: string
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

    const fabricDetails: FabricDetail[] = [];
    const furnitureDetails: FurnitureDetail[] = [];

    quotation.items.forEach(item => {
      // Simple logic to differentiate items. This can be improved if more item data is available.
      const description = item.salesDescription || "";
      const isFabric = description.toLowerCase().includes('fabric') || description.toLowerCase().includes('curtain');
      
      if(isFabric) {
        fabricDetails.push({
          fabricName: item.collectionBrand,
          quantity: item.quantity.toString(),
        });
      } else {
        furnitureDetails.push({
          furnitureName: item.collectionBrand,
          quantity: item.quantity.toString(),
        });
      }
    });

    const newOrder: Order = {
      id: orderId,
      crmOrderNo: quotation.quotationNo,
      customerName: quotation.customerName,
      customerPhone: customerData.mobileNo || '',
      customerAddress: customerData.addressPinCode || `${customerData.city}, ${customerData.state}`,
      salesPerson: salesmanName,
      orderType: 'stitching', // Default, should be determined
      milestones: getMilestonesForOrder('stitching'), // Set default milestones
      createdAt: new Date().toISOString(),
      isAcknowledged: true, // It is now in the main workflow
      status: 'Approved', // Set correct initial status
      // Add references to find this order's context later
      customerId: customerId,
      dealId: dealId,
      dealOrderDocId: newDealOrderRef.id,
      storeName: quotation.store,
      fabricDetails: fabricDetails,
      furnitureDetails: furnitureDetails,
    };

    batch.set(newOrderRef, newOrder);

    // 2. Create a corresponding Purchase Request if there are items
    if (fabricDetails.length > 0 || furnitureDetails.length > 0) {
        const purchaseRequestRef = adminDb.collection('purchaseRequests').doc(quotation.quotationNo);
        const newPurchaseRequest: Omit<PurchaseRequest, 'id'> = {
            dealId: quotation.quotationNo,
            customerName: quotation.customerName,
            promiseDeliveryDate: new Date().toISOString(), // Placeholder, can be updated later
            salesman: salesmanName,
            type: fabricDetails.length > 0 ? 'fabric' : 'furniture',
            fabricDetails: fabricDetails,
            furnitureDetails: furnitureDetails,
            createdAt: new Date().toISOString(),
            createdBy: { id: user?.id || 'system', name: creatorName },
            milestones: [],
            vendorType: 'undecided',
            status: 'Pending Approval', // This sends it to the approval queue
        };
        batch.set(purchaseRequestRef, newPurchaseRequest);
    }
    
    // 3. Now define the DealOrder with the main order ID
    const newDealOrder: DealOrder = {
      orderNo: newOrder.id,
      id: newDealOrderRef.id,
      orderDate: new Date().toISOString(),
      createdBy: creatorName,
      remark: quotation.billingName || '',
      items: quotation.items,
      status: 'Approved' // Set correct initial status
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
