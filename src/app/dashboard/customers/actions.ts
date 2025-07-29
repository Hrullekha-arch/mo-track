
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Customer } from '@/lib/types';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';

interface AddCustomerInput extends Omit<Customer, 'id' | 'createdAt'> {
    // Add any additional fields that are not part of the core Customer type but are in the form
}

export async function addCustomer(data: AddCustomerInput): Promise<{ success: boolean; message: string; id?: string }> {
  try {
    const newContactRef = adminDb.collection("customers").doc();
    const newCustomer: Omit<Customer, 'id'> & { createdAt: string } = {
      ...data,
      createdAt: new Date().toISOString(),
      createdBy: data.createdBy,
    };

    await newContactRef.set(newCustomer);
    
    return { success: true, message: "Contact created successfully.", id: newContactRef.id };
  } catch (error: any) {
    console.error("Error creating contact in server action:", error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}


export async function searchCustomers(filters: {
  customerName?: string;
  mobileNo?: string;
  salesSupport?: string;
}): Promise<Customer[]> {
  try {
    const customersRef = adminDb.collection('customers');
    let q = customersRef.orderBy('createdAt', 'desc'); // Start with a base query

    // Firestore does not support partial string matching (like 'includes') natively on the backend.
    // For a production CRM, a dedicated search service like Algolia or Elasticsearch is recommended.
    // For now, we will fetch all and filter, which works for smaller datasets.
    
    const querySnapshot = await q.get();
    const allCustomers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Customer);

    // Apply filters in memory
    const filteredCustomers = allCustomers.filter(customer => {
        const nameMatch = !filters.customerName || customer.name.toLowerCase().includes(filters.customerName.toLowerCase());
        const mobileMatch = !filters.mobileNo || customer.mobileNo.includes(filters.mobileNo);
        const salesSupportMatch = !filters.salesSupport || filters.salesSupport === 'all' || customer.salesSupport === filters.salesSupport;
        return nameMatch && mobileMatch && salesSupportMatch;
    });

    // We must serialize the date objects to strings to pass them from server to client component.
    return JSON.parse(JSON.stringify(filteredCustomers));
  } catch (error) {
    console.error("Error searching customers in server action:", error);
    return [];
  }
}

export async function getCustomerById(customerId: string): Promise<Customer | null> {
    try {
        const docRef = adminDb.collection('customers').doc(customerId);
        const docSnap = await docRef.get();

        if (docSnap.exists()) {
            const customerData = { id: docSnap.id, ...docSnap.data() } as Customer;
            // Serialize date objects to strings
            return JSON.parse(JSON.stringify(customerData));
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error fetching customer by ID:", error);
        return null;
    }
}
