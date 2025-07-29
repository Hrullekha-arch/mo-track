
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Customer } from '@/lib/types';

interface AddCustomerInput extends Omit<Customer, 'id' | 'createdAt'> {
    // Add any additional fields that are not part of the core Customer type but are in the form
}

export async function addCustomer(data: AddCustomerInput): Promise<{ success: boolean; message: string; id?: string }> {
  try {
    const newContactRef = adminDb.collection("customers").doc();
    const newCustomer: Customer = {
      ...data,
      id: newContactRef.id,
      createdAt: new Date().toISOString(),
    };

    await newContactRef.set(newCustomer);
    
    return { success: true, message: "Contact created successfully.", id: newContactRef.id };
  } catch (error: any) {
    console.error("Error creating contact in server action:", error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}
