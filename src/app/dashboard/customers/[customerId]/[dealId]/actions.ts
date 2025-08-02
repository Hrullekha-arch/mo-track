
'use server'

import { adminDb } from '@/lib/firebase-admin';
import { Deal, DealProduct, Quotation, DealOrder, DealVisit, DealMeasurement } from '@/lib/types';
import { FormValues as QuotationFormValues } from '@/components/features/order-management/CreateQuotationDialog';
import { VisitFormValues, MeasurementFormValues } from './page';

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


export async function createQuotationAction(customerId: string, dealId: string, values: QuotationFormValues, totalAmount: number): Promise<{ success: boolean; message: string, quotationId?: string }> {
  try {
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    
    // Generate a new quotation ID
    const quotationRef = dealRef.collection('quotations').doc();

    const newQuotation: Omit<Quotation, 'id'> = {
        quotationNo: Math.floor(1000 + Math.random() * 9000).toString(),
        ...values,
        createdAt: new Date().toISOString(),
        status: 'Generated',
        totalAmount: totalAmount,
    };
    
    await quotationRef.set(newQuotation);

    return { success: true, message: 'Quotation created successfully!', quotationId: quotationRef.id };
  } catch (error: any) {
    console.error("Error creating quotation:", error);
    return { success: false, message: `Failed to create quotation: ${error.message}` };
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
  visitData: VisitFormValues,
  creatorName: string
): Promise<{ success: boolean; message: string; visit?: DealVisit }> {
    try {
        const visitsRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId).collection('visits');
        const newVisitRef = visitsRef.doc();

        const newVisit: DealVisit = {
            id: newVisitRef.id,
            ...visitData,
            dueDate: visitData.dueDate.toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: creatorName,
        };

        await newVisitRef.set(newVisit);

        return { success: true, message: "Visit added successfully.", visit: JSON.parse(JSON.stringify(newVisit)) };
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
