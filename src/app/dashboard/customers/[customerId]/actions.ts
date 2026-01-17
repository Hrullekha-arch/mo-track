

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Customer, Deal, User, Quotation, O2DProcess } from '@/lib/types';
import { query, where } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';

export async function searchCustomersAction(filters: {
  customerName?: string;
  mobileNo?: string;
  salesSupport?: string;
}): Promise<Customer[]> {
  try {
    const customersRef = adminDb.collection('customers');
    let q: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = customersRef;

    // Firestore doesn't support case-insensitive or partial text search natively on the backend efficiently.
    // A more scalable solution would involve a third-party search service like Algolia or Typesense.
    // For now, we fetch all and filter in memory, which works for small-to-medium datasets.
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

export async function getCustomerById(id: string): Promise<Customer | null> {
    try {
        const docRef = adminDb.collection("customers").doc(id);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            const customerData = { id: docSnap.id, ...docSnap.data() };
            // Ensure data is serializable for the client
            return JSON.parse(JSON.stringify(customerData)) as Customer;
        } else {
            console.warn(`Customer document with ID ${id} not found in Firestore.`);
            return null;
        }
    } catch (error) {
        console.error(`Error fetching customer by ID ${id}:`, error);
        return null;
    }
}


export async function getDealsForCustomer(customerId: string): Promise<Deal[]> {
    try {
        const dealsRef = adminDb.collection('customers').doc(customerId).collection('deals');
        const snapshot = await dealsRef.orderBy('createdAt', 'desc').get();
        if (snapshot.empty) {
            return [];
        }
        const deals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Deal);
        return JSON.parse(JSON.stringify(deals));
    } catch (error) {
        console.error(`Error fetching deals for customer ${customerId}:`, error);
        return [];
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
        console.error("Error fetching quotations for deal:", error);
        return [];
    }
}


export async function getSalesmen(): Promise<User[]> {
    try {
        const usersRef = adminDb.collection('users');
        const q = usersRef.where('role', '==', 'salesman');
        const snapshot = await q.get();
        if (snapshot.empty) {
            return [];
        }
        const salesmen = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        return JSON.parse(JSON.stringify(salesmen));
    } catch (error) {
        console.error('Error fetching salesmen:', error);
        return [];
    }
}


interface AddCustomerInput extends Omit<Customer, 'id' | 'createdAt'> {
  savedAddresses?: Array<{ address: string; landmark?: string }>;
  addressPinCode?: string;
  landmark?: string;
}

export async function addCustomerAction(data: AddCustomerInput): Promise<{ success: boolean; message: string; customer?: Customer }> {
  try {
    const customersRef = adminDb.collection("customers");

    // Check for duplicate mobile number
    const mobileQuery = customersRef.where('mobileNo', '==', data.mobileNo);
    const mobileSnapshot = await mobileQuery.get();
    if (!mobileSnapshot.empty) {
        return { success: false, message: "A customer with this mobile number already exists." };
    }

    const newContactRef = customersRef.doc();

    const newCustomerData: Omit<Customer, 'id'> = {
      name: data.name,
      mobileNo: data.mobileNo,
      email: data.email,
      salesSupport: data.salesSupport,
      createdBy: data.createdBy,
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

type UpdateCustomerPayload = {
  name: string;
  mobileNo: string;
  email?: string;
  address?: string;
};

export async function updateCustomerAction(
  customerId: string,
  payload: UpdateCustomerPayload
): Promise<Customer> {
  if (!customerId) throw new Error("Missing customerId");

  const clean: any = {
    name: (payload.name || "").trim(),
    mobileNo: (payload.mobileNo || "").trim(),
    addressPinCode: (payload.address || "").trim(),
  };

  const email = (payload.email || "").trim();
  if (email) clean.email = email;
  else clean.email = adminDb.fieldValue?.delete?.() ?? undefined; 
  // If your wrapper doesn't expose fieldValue, use admin.firestore.FieldValue.delete() below.

  const ref = adminDb.collection("customers").doc(customerId);
  const snap = await ref.get();

  if (!snap.exists) throw new Error("Customer not found");

  // ✅ if you want to enforce unique mobile
  const dupSnap = await adminDb
    .collection("customers")
    .where("mobileNo", "==", clean.mobileNo)
    .limit(1)
    .get();

  const dup = dupSnap.docs.find((d) => d.id !== customerId);
  if (dup) throw new Error("Mobile number already exists for another customer.");

  // ✅ update
  await ref.set(
    {
      ...clean,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  const updatedSnap = await ref.get();
  const updated = { id: updatedSnap.id, ...(updatedSnap.data() as any) } as Customer;

  // ✅ optional cache revalidate
  revalidatePath(`/dashboard/customers`);
  revalidatePath(`/dashboard/customers/${customerId}`);

  return JSON.parse(JSON.stringify(updated));
}

type AddDealInput = Omit<Deal, 'id' | 'createdAt' | 'dealId'> & { customerId: string };

export async function addDealAction(data: AddDealInput): Promise<{ success: boolean; message: string; deal?: Deal }> {
  try {
    const { customerId, ...dealData } = data;
    const customerRef = adminDb.collection('customers').doc(customerId);
    const dealsRef = customerRef.collection('deals');
    const o2dRef = adminDb.collection('o2d');
    
    // Generate a unique 4-digit numeric dealId
    let dealId: string;
    let isUnique = false;
    do {
      dealId = Math.floor(1000 + Math.random() * 9000).toString();
      const existingDealQuery = dealsRef.where('dealId', '==', dealId);
      const snapshot = await existingDealQuery.get();
      if (snapshot.empty) {
        isUnique = true;
      }
    } while (!isUnique);

    const newDealRef = dealsRef.doc();

    const newDeal: Deal = {
        ...dealData,
        id: newDealRef.id,
        dealId: dealId,
        createdAt: new Date().toISOString(),
        isAcknowledged: false, // O2D process starts now
    };
    
    // Fetch customer and salesman details for the O2D doc
    const customerDoc = await customerRef.get();
    if (!customerDoc.exists) throw new Error("Customer not found");
    const customerData = customerDoc.data() as Customer;
    
    const salesmanDoc = await adminDb.collection('users').doc(dealData.representativeId).get();
    const salesmanName = salesmanDoc.exists ? salesmanDoc.data()?.name : 'N/A';

    // Create the O2D document
    const newO2dProcess: Omit<O2DProcess, 'id'> = {
        dealId: dealId,
        dealName: dealData.dealName,
        customerId: customerId,
        customerName: customerData.name,
        salesPerson: salesmanName,
        milestones: [], // Starts empty
        createdAt: newDeal.createdAt,
        isAcknowledged: false,
    };

    // Use a batch to write both documents atomically
    const batch = adminDb.batch();
    batch.set(newDealRef, newDeal);
    batch.set(o2dRef.doc(newDealRef.id), newO2dProcess);
    
    await batch.commit();

    const savedDeal = { ...newDeal };

    return { success: true, message: "Deal created successfully.", deal: JSON.parse(JSON.stringify(savedDeal)) };

  } catch (error: any) {
    console.error("Error creating deal in server action:", error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}
