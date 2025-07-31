
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Customer, Deal } from '@/lib/types';

export async function searchCustomersAction(filters: {
  customerName?: string;
  mobileNo?: string;
  salesSupport?: string;
}): Promise<Customer[]> {
  try {
    const customersRef = adminDb.collection('customers');
    let q: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = customersRef;

    const querySnapshot = await q.orderBy('createdAt', 'desc').get();
    const allCustomers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Customer);

    // Apply filters in memory
    const filteredCustomers = allCustomers.filter(customer => {
        const nameMatch = !filters.customerName || customer.name.toLowerCase().includes(filters.customerName.toLowerCase());
        const mobileMatch = !filters.mobileNo || customer.mobileNo.includes(filters.mobileNo);
        const salesSupportMatch = !filters.salesSupport || filters.salesSupport === 'all' || customer.salesSupport === filters.salesSupport;
        return nameMatch && mobileMatch && salesSupportMatch;
    });

    return JSON.parse(JSON.stringify(filteredCustomers));
  } catch (error) {
    console.error("Error searching customers in server action:", error);
    return [];
  }
}

interface AddCustomerInput extends Omit<Customer, 'id' | 'createdAt'> {}

export async function addCustomerAction(data: AddCustomerInput): Promise<{ success: boolean; message: string; customer?: Customer }> {
  try {
    const customersRef = adminDb.collection("customers");

    const mobileQuery = customersRef.where('mobileNo', '==', data.mobileNo);
    const mobileSnapshot = await mobileQuery.get();
    if (!mobileSnapshot.empty) {
        return { success: false, message: "A customer with this mobile number already exists." };
    }

    const newContactRef = customersRef.doc();
    const newCustomerData: Omit<Customer, 'id'> = {
      ...data,
      createdAt: new Date().toISOString(),
    };

    await newContactRef.set(newCustomerData);
    
    const customer = { id: newContactRef.id, ...newCustomerData };

    return { success: true, message: "Contact created successfully.", customer: JSON.parse(JSON.stringify(customer)) };
  } catch (error: any) {
    console.error("Error creating contact in server action:", error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}

type AddDealInput = Omit<Deal, 'id' | 'createdAt'> & { customerId: string };

export async function addDealAction(data: AddDealInput): Promise<{ success: boolean; message: string; deal?: Deal }> {
  try {
    const { customerId, ...dealData } = data;
    const dealsRef = adminDb.collection('customers').doc(customerId).collection('deals');
    const newDealRef = dealsRef.doc();

    const newDeal: Omit<Deal, 'id'> = {
        ...dealData,
        createdAt: new Date().toISOString(),
    };

    await newDealRef.set(newDeal);
    const savedDeal = { id: newDealRef.id, ...newDeal };

    return { success: true, message: "Deal created successfully.", deal: JSON.parse(JSON.stringify(savedDeal)) };

  } catch (error: any) {
    console.error("Error creating deal in server action:", error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}
