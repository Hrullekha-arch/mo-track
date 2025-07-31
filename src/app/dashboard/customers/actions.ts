
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Customer } from '@/lib/types';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';

interface AddCustomerInput extends Omit<Customer, 'id' | 'createdAt'> {
    // Add any additional fields that are not part of the core Customer type but are in the form
}

export async function addCustomer(data: AddCustomerInput): Promise<{ success: boolean; message: string; customer?: Customer }> {
  try {
    const customersRef = adminDb.collection("customers");

    // Check for existing customer with the same mobile number
    const mobileQuery = customersRef.where('mobileNo', '==', data.mobileNo);
    const mobileSnapshot = await mobileQuery.get();
    if (!mobileSnapshot.empty) {
        return { success: false, message: "A customer with this mobile number already exists." };
    }

    const newContactRef = customersRef.doc();
    const newCustomerData: Omit<Customer, 'id'> = {
      ...data,
      createdAt: new Date().toISOString(),
      createdBy: data.createdBy,
    };

    await newContactRef.set(newCustomerData);
    
    const customer = { id: newContactRef.id, ...newCustomerData };

    // Important: Serialize the object to ensure it's a plain object before returning
    return { success: true, message: "Contact created successfully.", customer: JSON.parse(JSON.stringify(customer)) };
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
    let q = customersRef.orderBy('createdAt', 'desc');

    const querySnapshot = await q.get();
    // Correctly map documents to include the Firestore document ID.
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
        if (!customerId) return null;
        
        const docRef = adminDb.collection('customers').doc(customerId);
        const docSnap = await docRef.get();

        if (docSnap.exists()) {
            // Correctly return the document ID along with the rest of the data.
            const customerData = { id: docSnap.id, ...docSnap.data() } as Customer;
            // Serialize date objects to strings to pass them from server to client component.
            return JSON.parse(JSON.stringify(customerData));
        } else {
            console.log(`Customer document with ID ${customerId} not found.`);
            return null;
        }
    } catch (error) {
        console.error(`Error fetching customer by ID ${customerId}:`, error);
        return null;
    }
}
