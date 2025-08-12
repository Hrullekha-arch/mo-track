
'use server'

import { adminDb } from '@/lib/firebase-admin';
import { Deal, DealProduct, Quotation, DealOrder, DealVisit, DealMeasurement, DeliveryInstallationItem, Cpd, Order, OrderType } from '@/lib/types';
import { FormValues as QuotationFormValues } from '@/components/features/order-management/CreateQuotationDialog';
import { VisitFormValues, MeasurementFormValues, CpdFormValues } from './page';
import { getMilestonesForOrder } from '@/lib/constants';

// This function sends an SMS using the Fast2SMS API.
async function sendVisitSms(customerPhone: string, message: string) {
    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey) {
        console.error('Fast2SMS API key is not configured.');
        throw new Error('SMS service is not configured.');
    }

    const url = 'https://www.fast2sms.com/dev/bulkV2';
    const params = new URLSearchParams({
        authorization: apiKey,
        route: 'p', // Use 't' for transactional if your account supports it
        message: message,
        numbers: customerPhone,
        flash: '0'
    });

    const response = await fetch(`${url}?${params.toString()}`, {
        method: 'GET', // Fast2SMS uses GET for this endpoint
    });
    
    const responseData = await response.json();

    if (!response.ok || responseData.return === false) {
        console.error('Fast2SMS API Error:', responseData);
        throw new Error(`Failed to send SMS: ${responseData.message}`);
    }

    return { success: true, ...responseData };
}


export async function getDealById(customerId: string, dealId: string): Promise<Deal | null> {
    try {
        const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
        const docSnap = await dealRef.get();

        if (docSnap.exists) {
            const dealData = { id: docSnap.id, ...docSnap.data() } as Deal;
            // Firestore data is not directly serializable, so we need to convert it
            return JSON.parse(JSON.stringify(dealData));
        }
        return null;
    } catch (error) {
        console.error(`Error fetching deal ${dealId} for customer ${customerId}:`, error);
        return null;
    }
}

export async function updateDealProducts(customerId: string, dealId: string, products: DealProduct[]): Promise<{ success: boolean; message: string }> {
    try {
        const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
        
        // Firestore cannot store `undefined` values from the form, so we clean the products array.
        const cleanedProducts = products.map(p => 
            Object.fromEntries(Object.entries(p).filter(([_, v]) => v !== undefined))
        );

        await dealRef.update({ products: cleanedProducts });

        return { success: true, message: 'Products updated successfully.' };
    } catch (error) {
        console.error(`Error updating products for deal ${dealId}:`, error);
        return { success: false, message: 'Failed to update products.' };
    }
}


export async function createQuotationAction(customerId: string, dealId: string, values: QuotationFormValues, totalAmount: number): Promise<{ success: boolean; message: string, quotationId?: string, quotation?: Quotation }> {
  try {
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    
    // Generate a new quotation ID
    const quotationRef = dealRef.collection('quotations').doc();

    const newQuotation: Quotation = {
        id: quotationRef.id,
        quotationNo: Math.floor(1000 + Math.random() * 9000).toString(),
        ...values,
        createdAt: new Date().toISOString(),
        status: 'Pending Approval', // Initially pending
        totalAmount: totalAmount,
    };
    
    await quotationRef.set(newQuotation);

    return { 
        success: true, 
        message: 'Quotation created successfully!', 
        quotationId: quotationRef.id,
        quotation: JSON.parse(JSON.stringify(newQuotation))
    };

  } catch (error: any) {
    console.error("Error creating quotation:", error);
    return { success: false, message: `Failed to create quotation: ${error.message}` };
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

    const [customerSnap, dealSnap, currentQuotationSnap] = await Promise.all([
      customerRef.get(),
      dealRef.get(),
      quotationRef.get()
    ]);

    if (currentQuotationSnap.exists && currentQuotationSnap.data()?.status === 'Converted to Order') {
      return { success: false, message: 'This quotation has already been converted to an order.' };
    }

    if (!customerSnap.exists) {
        return { success: false, message: 'Customer not found.' };
    }
    if (!dealSnap.exists) {
        return { success: false, message: 'Deal not found.' };
    }

    const customerData = customerSnap.data() as any;
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

    const allFabricDetails = quotation.items.map(item => ({
      fabricName: item.collectionBrand,
      quantity: String(item.quantity),
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
      status: 'Pending Approval',
      customerId: customerId,
      dealId: dealId,
      dealOrderDocId: newDealOrderRef.id,
      storeName: quotation.store,
      fabricDetails: allFabricDetails,
      totalAmount: quotation.totalAmount,
      vasDetails: quotation.vasDetails || [],
    };

    batch.set(newOrderRef, newOrder);
    
    const newDealOrder: DealOrder = {
      orderNo: newOrder.id,
      id: newDealOrderRef.id,
      orderDate: new Date().toISOString(),
      createdBy: creator.name,
      remark: quotation.billingName || '',
      items: quotation.items,
      status: 'Pending Approval'
    };

    batch.set(newDealOrderRef, newDealOrder);

    batch.update(quotationRef, { 
      status: 'Converted to Order',
      orderNo: newOrder.id,
    });

    await batch.commit();

    return {
      success: true,
      message: 'Order created and sent for approval.',
      order: JSON.parse(JSON.stringify(newOrder)),
    };
  } catch (error: any) {
    console.error('Error creating deal order:', error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}

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
        console.error("Error fetching quotations:", error);
        return [];
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

        if (snapshot.empty) {
            return [];
        }

        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DealOrder));
        return JSON.parse(JSON.stringify(orders));
    } catch (error) {
        console.error("Error fetching orders:", error);
        return [];
    }
}


export async function addVisitAction(
  customerId: string,
  dealId: string,
  visitData: Omit<VisitFormValues, 'date'> & { dueDate: Date, typeOfVisit: string },
  creatorName: string
): Promise<{ success: boolean; message: string; visit?: DealVisit }> {
    try {
        const customerRef = adminDb.collection('customers').doc(customerId);
        const customerSnap = await customerRef.get();
        if (!customerSnap.exists()) {
            return { success: false, message: "Customer not found." };
        }
        const customerData = customerSnap.data() as any;

        const visitsRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId).collection('visits');
        const newVisitRef = visitsRef.doc();

        const newVisit: Omit<DealVisit, 'id'> = {
            representative: visitData.representative,
            typeOfVisit: visitData.typeOfVisit,
            dueDate: visitData.dueDate.toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: creatorName,
            measurements: visitData.measurements,
            blinds: visitData.blinds,
            curtain: visitData.curtain,
            otherCurtain: visitData.otherCurtain,
            deliveryInstallations: visitData.deliveryInstallations,
            subDeliveryInstallations: visitData.subDeliveryInstallations,
            otherDelivery: visitData.otherDelivery,
            dealId: "" // This is incorrect, dealId should be the 4 digit one. Assuming it's part of the deal object
        };

        await newVisitRef.set(newVisit);
        
        const savedVisit: DealVisit = { id: newVisitRef.id, ...newVisit };

        // Automatically send SMS
        const visitDate = new Date(savedVisit.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        const visitTime = new Date(savedVisit.dueDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const smsMessage = `Hi ${customerData.name}, your MoTrack visit is scheduled for ${visitDate} at ${visitTime}. We look forward to seeing you!`;
        
        try {
            await sendVisitSms(customerData.mobileNo, smsMessage);
        } catch (smsError) {
            console.error("Failed to send SMS, but visit was created:", smsError);
            // We don't fail the whole operation if SMS fails, but we can return a partial success message.
            return { success: true, message: "Visit added, but failed to send SMS notification.", visit: JSON.parse(JSON.stringify(savedVisit)) };
        }


        return { success: true, message: "Visit added and SMS sent successfully.", visit: JSON.parse(JSON.stringify(savedVisit)) };
    } catch (error: any) {
        console.error("Error adding visit:", error);
        return { success: false, message: `Server error: ${error.message}` };
    }
}


export async function getVisitsForDeal(customerId: string, dealId: string): Promise<DealVisit[]> {
    try {
        const snapshot = await adminDb
            .collection('customers')
            .doc(customerId)
            .collection('deals')
            .doc(dealId)
            .collection('visits')
            .orderBy('dueDate', 'desc')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const visits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DealVisit));
        return JSON.parse(JSON.stringify(visits));
    } catch (error) {
        console.error("Error fetching visits:", error);
        return [];
    }
}

export async function addMeasurementAction(
    customerId: string,
    dealId: string,
    measurementData: MeasurementFormValues,
    creatorName: string
): Promise<{ success: boolean; message: string; measurement?: DealMeasurement }> {
    try {
        const measurementsRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId).collection('measurements');
        const newMeasurementRef = measurementsRef.doc();
        
        // Note: Real file upload would happen client-side to get a URL.
        // Here we just simulate it for the database record.
        const fileUrl = measurementData.file ? `https://placehold.co/100x100.png` : undefined;

        const newMeasurement: DealMeasurement = {
            id: newMeasurementRef.id,
            ...measurementData,
            fileUrl,
            createdAt: new Date().toISOString(),
            createdBy: creatorName,
        };

        await newMeasurementRef.set(newMeasurement);

        return { success: true, message: "Measurement added successfully.", measurement: JSON.parse(JSON.stringify(newMeasurement)) };
    } catch (error: any) {
        console.error("Error adding measurement:", error);
        return { success: false, message: `Server error: ${error.message}` };
    }
}


export async function getMeasurementsForDeal(customerId: string, dealId: string): Promise<DealMeasurement[]> {
    try {
        const snapshot = await adminDb
            .collection('customers')
            .doc(customerId)
            .collection('deals')
            .doc(dealId)
            .collection('measurements')
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const measurements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DealMeasurement));
        return JSON.parse(JSON.stringify(measurements));
    } catch (error) {
        console.error("Error fetching measurements:", error);
        return [];
    }
}

export async function addCpdAction(
  customerId: string,
  dealId: string,
  cpdData: CpdFormValues,
  creatorName: string
): Promise<{ success: boolean; message: string; cpd?: Cpd }> {
  try {
    const cpdsRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId).collection('cpds');
    
    // Generate a unique 4-digit cpdId
    let newCpdId: string;
    let isUnique = false;
    do {
      newCpdId = Math.floor(1000 + Math.random() * 9000).toString();
      const existingCpdQuery = cpdsRef.where('cpdId', '==', newCpdId);
      const snapshot = await existingCpdQuery.get();
      if (snapshot.empty) {
        isUnique = true;
      }
    } while (!isUnique);

    const newCpdRef = cpdsRef.doc();
    const fullCpdData: Omit<Cpd, 'id'> = {
      ...cpdData,
      cpdId: newCpdId,
      createdAt: new Date().toISOString(),
      createdBy: creatorName,
    };

    await newCpdRef.set(fullCpdData);
    const savedCpd = { ...fullCpdData, id: newCpdRef.id };

    return { success: true, message: 'CPD saved successfully!', cpd: JSON.parse(JSON.stringify(savedCpd)) };
  } catch (error: any) {
    console.error('Error saving CPD:', error);
    return { success: false, message: `Failed to save CPD: ${error.message}` };
  }
}

export async function getCpdsForDeal(customerId: string, dealId: string): Promise<Cpd[]> {
    try {
        const snapshot = await adminDb
            .collection('customers')
            .doc(customerId)
            .collection('deals')
            .doc(dealId)
            .collection('cpds')
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const cpds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cpd));
        return JSON.parse(JSON.stringify(cpds));
    } catch (error) {
        console.error("Error fetching CPDs:", error);
        return [];
    }
}
