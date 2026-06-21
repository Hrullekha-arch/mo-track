

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Customer, Deal, User, Quotation, O2DProcess, CustomerAddress, CustomerStats, CustomerRecent, CustomerBillingDetail } from '@/lib/types';
import { query, where } from 'firebase/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { getNextSequenceValue } from '@/lib/id-sequence';

const normalizeNameForId = (value: string) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");

const normalizePhoneForId = (value: string) => String(value || "").replace(/\D/g, "");

const buildCustomerDocId = (name: string, phone: string) => {
  const normalizedName = normalizeNameForId(name);
  const normalizedPhone = normalizePhoneForId(phone);
  if (!normalizedName || !normalizedPhone) return "";
  return `${normalizedName}_${normalizedPhone}`;
};

const stripUndefined = <T extends Record<string, any>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  ) as T;

const stripUndefinedDeep = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, fieldValue]) => fieldValue !== undefined)
      .map(([key, fieldValue]) => [key, stripUndefinedDeep(fieldValue)]);
    return Object.fromEntries(entries);
  }
  return value;
};

const buildAddress = (
  source?: Partial<CustomerAddress> & { addressLine1?: string; addressLine2?: string; address?: string; landmark?: string; pinCode?: string; pincode?: string },
  fallback?: Partial<CustomerAddress> & { addressLine1?: string; addressLine2?: string; address?: string; landmark?: string; pinCode?: string; pincode?: string }
): CustomerAddress | undefined => {
  const data = (source && typeof source === "object" ? source : fallback) || {};
  const address = stripUndefined({
    line1: String(data.line1 || data.addressLine1 || data.address || "").trim() || undefined,
    line2: String(data.line2 || data.addressLine2 || data.landmark || "").trim() || undefined,
    city: String(data.city || "").trim() || undefined,
    state: String(data.state || "").trim() || undefined,
    pincode: String(data.pincode || data.pinCode || "").trim() || undefined,
  });
  return Object.keys(address).length > 0 ? address : undefined;
};

const defaultStats = (): CustomerStats => ({
  totalVisits: 0,
  totalQuotations: 0,
  approvedQuotations: 0,
  totalOrders: 0,
  completedOrders: 0,
  totalInvoicedAmount: 0,
  totalPaidAmount: 0,
  totalPendingAmount: 0,
  lastVisitDate: null,
  lastOrderDate: null,
  lastInvoiceDate: null,
});

const defaultRecent = (): CustomerRecent => ({
  visits: [],
  quotations: [],
  orders: [],
});

const buildDealCode = (dealId: string) => {
  const year = new Date().getFullYear();
  return `DEAL-${year}-${dealId}`;
};

const normalizeBillingDetail = (
  source?: Partial<CustomerBillingDetail> | null
): CustomerBillingDetail | undefined => {
  if (!source || typeof source !== "object") return undefined;
  const detail = stripUndefined({
    billingName: String(source.billingName || "").trim() || undefined,
    billingPhone: String(source.billingPhone || "").trim() || undefined,
    billingAddress: String(source.billingAddress || "").trim() || undefined,
    gstin: String(source.gstin || "").trim().toUpperCase() || undefined,
    isDefault: source.isDefault === true ? true : undefined,
  });
  const hasValues =
    Boolean(detail.billingName) ||
    Boolean(detail.billingPhone) ||
    Boolean(detail.billingAddress) ||
    Boolean(detail.gstin);
  if (!hasValues) return undefined;
  return Object.keys(detail).length > 0 ? detail : undefined;
};

const mergeCustomerBillingDetails = (
  existing: unknown,
  incoming: CustomerBillingDetail,
  nowIso: string,
  options?: {
    source?: string;
    dealId?: string;
  }
): CustomerBillingDetail[] => {
  const existingRows = Array.isArray(existing)
    ? existing
        .map((row) => normalizeBillingDetail(row as Partial<CustomerBillingDetail>))
        .filter((row): row is CustomerBillingDetail => Boolean(row))
    : [];

  const sameAs = (row: CustomerBillingDetail) =>
    String(row.billingName || "").trim().toLowerCase() ===
      String(incoming.billingName || "").trim().toLowerCase() &&
    String(row.billingPhone || "").trim() === String(incoming.billingPhone || "").trim() &&
    String(row.billingAddress || "").trim().toLowerCase() ===
      String(incoming.billingAddress || "").trim().toLowerCase() &&
    String(row.gstin || "").trim().toUpperCase() ===
      String(incoming.gstin || "").trim().toUpperCase();

  const normalizedIncoming = stripUndefined({
    billingName: incoming.billingName,
    billingPhone: incoming.billingPhone,
    billingAddress: incoming.billingAddress,
    gstin: incoming.gstin,
    isDefault: true,
    createdAt: nowIso,
    updatedAt: nowIso,
    source: String(options?.source || "deal").trim() || "deal",
    dealId: options?.dealId ? String(options.dealId).trim() : undefined,
  });

  let replaced = false;
  const merged = existingRows.map((row) => {
    if (sameAs(row)) {
      replaced = true;
      return stripUndefined({
        ...row,
        ...normalizedIncoming,
        createdAt: row.createdAt || nowIso,
      });
    }
    return stripUndefined({
      ...row,
      isDefault: false,
    });
  });

  if (!replaced) {
    merged.unshift(normalizedIncoming);
  }

  return merged.slice(0, 20);
};

export async function searchCustomersAction(filters: {
  customerName?: string;
  phone?: string;
  salesSupport?: string;
  quotationNo?: string;
  orderNo?: string;
  dealId?: string;
}): Promise<Customer[]> {
  try {
    const customersRef = adminDb.collection('customers');

    // Priority search: by order or quotation number
    if (filters.orderNo) {
        const rawOrderNo = filters.orderNo.trim();
        const compactOrderNo = rawOrderNo.replace(/\s+/g, '');
        const orderSuffix = compactOrderNo.replace(/^MOTRACK[-_]?/i, '');
        const orderCandidates: Array<string | number> = Array.from(
          new Set<string | number>([
            rawOrderNo,
            compactOrderNo,
            compactOrderNo.toUpperCase(),
            orderSuffix,
            `MOTRACK-${orderSuffix}`,
            ...(orderSuffix && /^\d+$/.test(orderSuffix) ? [Number(orderSuffix)] : []),
          ].filter((value) => value !== ''))
        );

        const quotationSnapshots = await Promise.all(
          orderCandidates.map((candidate) =>
            adminDb
              .collectionGroup('quotations')
              .where('orderNo', '==', candidate)
              .limit(1)
              .get()
          )
        );
        const quotationDoc = quotationSnapshots.find((snapshot) => !snapshot.empty)?.docs[0];
        if (quotationDoc) {
            const pathParts = quotationDoc.ref.path.split('/');
            const customerId = pathParts[1]; // Path: customers/{customerId}/...
            if (customerId) {
                 const customerDoc = await customersRef.doc(customerId).get();
                 if (customerDoc.exists) {
                    return JSON.parse(JSON.stringify([{ id: customerDoc.id, ...customerDoc.data() }]));
                }
            }
        }

        const orderSnapshots = await Promise.all(
          orderCandidates.map(async (candidate) => {
            const candidateText = String(candidate);
            const directDoc = await adminDb.collection('orders').doc(candidateText).get();
            if (directDoc.exists) return directDoc;

            for (const field of ['orderNo', 'crmOrderNo']) {
              const snapshot = await adminDb
                .collection('orders')
                .where(field, '==', candidate)
                .limit(1)
                .get();
              if (!snapshot.empty) return snapshot.docs[0];
            }
            return null;
          })
        );
        const orderDoc = orderSnapshots.find(Boolean);
        if (orderDoc) {
          const orderData = orderDoc.data() as any;
          const customerId = String(orderData?.customerId || '').trim();
          if (customerId) {
            const customerDoc = await customersRef.doc(customerId).get();
            if (customerDoc.exists) {
              return JSON.parse(JSON.stringify([{ id: customerDoc.id, ...customerDoc.data() }]));
            }
          }

          const dealId = String(orderData?.dealId || '').trim();
          if (dealId) {
            const dealSnapshot = await adminDb
              .collectionGroup('deals')
              .where('dealId', '==', dealId)
              .limit(1)
              .get();
            if (!dealSnapshot.empty) {
              const customerIdFromDeal = dealSnapshot.docs[0].ref.path.split('/')[1];
              if (customerIdFromDeal) {
                const customerDoc = await customersRef.doc(customerIdFromDeal).get();
                if (customerDoc.exists) {
                  return JSON.parse(JSON.stringify([{ id: customerDoc.id, ...customerDoc.data() }]));
                }
              }
            }
          }
        }
        return []; // Not found
    }

    if (filters.quotationNo) {
        const quotationQuery = adminDb.collectionGroup('quotations').where('quotationNo', '==', filters.quotationNo.trim()).limit(1);
        const quotationSnapshot = await quotationQuery.get();
        if (!quotationSnapshot.empty) {
            const quotationDoc = quotationSnapshot.docs[0];
            const pathParts = quotationDoc.ref.path.split('/');
            const customerId = pathParts[1]; // Path: customers/{customerId}/...
            if (customerId) {
                 const customerDoc = await customersRef.doc(customerId).get();
                 if (customerDoc.exists) {
                    return JSON.parse(JSON.stringify([{ id: customerDoc.id, ...customerDoc.data() }]));
                }
            }
        }
        return []; // Not found
    }
    if (filters.dealId) {
        const dealQuery = adminDb.collectionGroup('deals').where('dealId', '==', filters.dealId.trim()).limit(1);
        const dealSnapshot = await dealQuery.get();
        if (!dealSnapshot.empty) {
            const dealDoc = dealSnapshot.docs[0];
            const pathParts = dealDoc.ref.path.split('/');

            const customerId = pathParts[1]; // Path: customers/{customerId}/...
            if (customerId) {
                 const customerDoc = await customersRef.doc(customerId).get();
                 if (customerDoc.exists) {
                    return JSON.parse(JSON.stringify([{ id: customerDoc.id, ...customerDoc.data() }]));
                }
            }
        }
        return []; // Not found
    }


    // Original search logic for other filters
    let q: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = customersRef;

    const querySnapshot = await q.orderBy('createdAt', 'desc').get();
    const allCustomers = querySnapshot.docs.map(doc => ({ id: doc.id, customerId: doc.id, ...doc.data() }) as Customer);

    // Apply filters in memory
    const filteredCustomers = allCustomers.filter(customer => {
        const nameMatch = !filters.customerName || customer.name.toLowerCase().includes(filters.customerName.toLowerCase());
        const phoneValue = customer.phone || customer.mobileNo || "";
        const phoneMatch = !filters.phone || phoneValue.includes(filters.phone);
        const assignedName = customer.assignedSalesPerson?.name || customer.salesSupport || "";
        const salesSupportMatch = !filters.salesSupport || filters.salesSupport === 'all' || assignedName === filters.salesSupport;
        return nameMatch && phoneMatch && salesSupportMatch;
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
            const customerData = { id: docSnap.id, customerId: docSnap.id, ...docSnap.data() };
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
        const salesmen = snapshot.docs
          .map((doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
            id: doc.id,
            ...doc.data(),
          } as User))
          .filter(
            (user: User) =>
              user.isActive !== false &&
              String(user.employmentStatus || "").trim().toLowerCase() !== "inactive"
          )
          .sort((left: User, right: User) =>
            String(left.name || "").localeCompare(String(right.name || ""))
          );
        return JSON.parse(JSON.stringify(salesmen));
    } catch (error) {
        console.error('Error fetching salesmen:', error);
        return [];
    }
}


interface AddCustomerInput {
  name: string;
  phone: string;
  email?: string;
  gstin?: string;
  isGstRegistered?: boolean;
  billingAddress?: CustomerAddress;
  shippingAddress?: CustomerAddress;
  customerType?: string;
  tags?: string[];
  assignedSalesPerson?: { id?: string; name?: string };
  status?: string;
  customerCode?: string;
  createdBy?: string;
  billingDetails?: CustomerBillingDetail;
}

export async function addCustomerAction(data: AddCustomerInput): Promise<{ success: boolean; message: string; customer?: Customer }> {
  try {
    const customersRef = adminDb.collection("customers");

    // Check for duplicate mobile number
    const phoneValue = String(data.phone || "").trim();
    if (!phoneValue) {
      return { success: false, message: "Phone number is required." };
    }
    const phoneQuery = customersRef.where('phone', '==', phoneValue);
    const phoneSnapshot = await phoneQuery.get();
    if (!phoneSnapshot.empty) {
        return { success: false, message: "A customer with this phone number already exists." };
    }

    const docIdBase = buildCustomerDocId(data.name, phoneValue);
    if (!docIdBase) {
      return { success: false, message: "Invalid name or phone number for customer ID." };
    }

    let docId = docIdBase;
    let suffix = 1;
    while ((await customersRef.doc(docId).get()).exists) {
      docId = `${docIdBase}__${suffix}`;
      suffix += 1;
    }

    const now = new Date().toISOString();
    const billingAddress = buildAddress(data.billingAddress);
    const shippingAddress = buildAddress(data.shippingAddress, data.billingAddress);
    const normalizedBillingDetail = normalizeBillingDetail(data.billingDetails);
    const mergedBillingDetails = normalizedBillingDetail
      ? mergeCustomerBillingDetails([], normalizedBillingDetail, now, { source: "customer" })
      : undefined;

    const newCustomerData: Omit<Customer, 'id'> = stripUndefined({
      customerId: docId,
      customerCode: data.customerCode || docId,
      name: data.name,
      phone: phoneValue,
      email: data.email,
      gstin: data.gstin,
      isGstRegistered: typeof data.isGstRegistered === 'boolean' ? data.isGstRegistered : Boolean(data.gstin),
      billingAddress,
      shippingAddress,
      customerType: data.customerType || "INDIVIDUAL",
      tags: Array.isArray(data.tags) ? data.tags : [],
      assignedSalesPerson: data.assignedSalesPerson,
      billingDetails: mergedBillingDetails,
      stats: defaultStats(),
      recent: defaultRecent(),
      status: data.status || "ACTIVE",
      createdAt: now,
      lastUpdatedAt: now,
      createdBy: data.createdBy,
    });

    const newContactRef = customersRef.doc(docId);
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
  phone: string;
  email?: string;
  billingAddress?: CustomerAddress;
  shippingAddress?: CustomerAddress;
  gstin?: string;
  isGstRegistered?: boolean;
  customerType?: string;
  tags?: string[];
  assignedSalesPerson?: { id?: string; name?: string };
  status?: string;
  panNo?: string;
  referenceName?: string;
  sourceOfCustomer?: string;
  pinCode?: string;
  city?: string;
  state?: string;
  salesSupport?: string;
  billingDetails?: CustomerBillingDetail;
};

export async function updateCustomerAction(
  customerId: string,
  payload: UpdateCustomerPayload
): Promise<Customer> {
  if (!customerId) throw new Error("Missing customerId");

  const clean: any = {
    name: (payload.name || "").trim(),
    phone: (payload.phone || "").trim(),
    billingAddress: buildAddress(payload.billingAddress),
    shippingAddress: buildAddress(payload.shippingAddress, payload.billingAddress),
    gstin: payload.gstin ? payload.gstin.trim() : undefined,
    isGstRegistered: typeof payload.isGstRegistered === "boolean" ? payload.isGstRegistered : undefined,
    customerType: payload.customerType,
    tags: payload.tags,
    assignedSalesPerson: payload.assignedSalesPerson,
    status: payload.status,
    panNo: payload.panNo ? payload.panNo.trim() : undefined,
    referenceName: payload.referenceName ? payload.referenceName.trim() : undefined,
    sourceOfCustomer: payload.sourceOfCustomer ? payload.sourceOfCustomer.trim() : undefined,
    pinCode: payload.pinCode ? payload.pinCode.trim() : undefined,
    city: payload.city ? payload.city.trim() : undefined,
    state: payload.state ? payload.state.trim() : undefined,
    salesSupport: payload.salesSupport ? payload.salesSupport.trim() : undefined,
  };

  const email = (payload.email || "").trim();
  if (email) clean.email = email;
  else clean.email = FieldValue.delete();

  const ref = adminDb.collection("customers").doc(customerId);
  const snap = await ref.get();

  if (!snap.exists) throw new Error("Customer not found");

  const nowIso = new Date().toISOString();
  const normalizedBillingDetail = normalizeBillingDetail(payload.billingDetails);
  const mergedBillingDetails = normalizedBillingDetail
    ? mergeCustomerBillingDetails((snap.data() as any)?.billingDetails, normalizedBillingDetail, nowIso, {
        source: "customer-edit",
      })
    : undefined;

  // ✅ if you want to enforce unique mobile
  const dupSnap = await adminDb
    .collection("customers")
    .where("phone", "==", clean.phone)
    .limit(1)
    .get();

  const dup = dupSnap.docs.find((d) => d.id !== customerId);
  if (dup) throw new Error("Mobile number already exists for another customer.");

  // ✅ update
  await ref.set(
    {
      ...stripUndefined(clean),
      ...(mergedBillingDetails ? { billingDetails: mergedBillingDetails } : {}),
      lastUpdatedAt: nowIso,
    },
    { merge: true }
  );

  const updatedSnap = await ref.get();
  const updated = { id: updatedSnap.id, customerId: updatedSnap.id, ...(updatedSnap.data() as any) } as Customer;

  // ✅ optional cache revalidate
  revalidatePath(`/dashboard/customers`);
  revalidatePath(`/dashboard/customers/${customerId}`);

  return JSON.parse(JSON.stringify(updated));
}

type AddDealInput = {
  customerId: string;
  title?: string;
  description?: string;
  dealType?: string;
  dealSource?: string;
  expectedValue?: number;
  assignedSalesPerson?: { id?: string; name?: string };
  handleByCmr?: { id?: string; name?: string };
  status?: string;
  lostReason?: string;
  createdBy?: string;

  // legacy support
  dealName?: string;
  dealAmount?: number;
  representativeId?: string;
  measurementRequired?: 'Yes' | 'No';
  advanceForMeasurement?: 'Yes' | 'No' | 'Old';
  billingDetails?: CustomerBillingDetail;
};

export async function addDealAction(data: AddDealInput): Promise<{ success: boolean; message: string; deal?: Deal }> {
  try {
    const { customerId, ...dealData } = data;
    const customerRef = adminDb.collection('customers').doc(customerId);
    const dealsRef = customerRef.collection('deals');
    const o2dRef = adminDb.collection('o2d');

    let dealId = "";
    let newDealRef = dealsRef.doc("_pending");
    for (let attempt = 0; attempt < 1000; attempt++) {
      const candidate = await getNextSequenceValue("dealId");
      const candidateRef = dealsRef.doc(candidate);
      const [existingDoc, existingO2dDoc] = await Promise.all([
        candidateRef.get(),
        o2dRef.doc(candidate).get(),
      ]);
      if (!existingDoc.exists && !existingO2dDoc.exists) {
        dealId = candidate;
        newDealRef = candidateRef;
        break;
      }
    }

    if (!dealId) {
      throw new Error("Unable to allocate a unique deal ID.");
    }

    // Fetch customer and salesman details for the O2D doc
    const customerDoc = await customerRef.get();
    if (!customerDoc.exists) throw new Error("Customer not found");
    const customerData = customerDoc.data() as Customer;

    const title = dealData.title || dealData.dealName || "Untitled Deal";
    const description = dealData.description || "";
    const expectedValue = typeof dealData.expectedValue === "number"
      ? dealData.expectedValue
      : Number(dealData.dealAmount) || 0;

    let assignedSalesPerson = dealData.assignedSalesPerson;
    let salesmanName = assignedSalesPerson?.name || "N/A";
    let salesmanId = assignedSalesPerson?.id;

    if (!assignedSalesPerson && dealData.representativeId) {
      const salesmanDoc = await adminDb.collection('users').doc(dealData.representativeId).get();
      salesmanName = salesmanDoc.exists ? salesmanDoc.data()?.name : 'N/A';
      salesmanId = dealData.representativeId;
      assignedSalesPerson = stripUndefined({ id: salesmanId, name: salesmanName });
    }

    const now = new Date().toISOString();
    const normalizedBillingDetail = normalizeBillingDetail(dealData.billingDetails);
    const mergedBillingDetails = normalizedBillingDetail
      ? mergeCustomerBillingDetails((customerData as any)?.billingDetails, normalizedBillingDetail, now, {
          source: "deal",
          dealId,
        })
      : undefined;

    const newDeal: Deal = {
        id: newDealRef.id,
        dealId: dealId,
        dealCode: buildDealCode(dealId),
        customer: {
          id: customerId,
          name: customerData.name,
          phone: customerData.phone || customerData.mobileNo || "",
          customerType: customerData.customerType,
        },
        title,
        description,
        dealType: dealData.dealType || "NEW",
        dealSource: dealData.dealSource || "REFERENCE",
        assignedSalesPerson,
        handleByCmr: dealData.handleByCmr,
        expectedValue,
        actualQuotationValue: 0,
        actualOrderValue: 0,
        status: dealData.status || "OPEN",
        lostReason: dealData.lostReason,
        dates: {
          createdAt: now,
        },
        recent: {
          visits: [],
          quotations: [],
          orders: [],
        },
        lastUpdatedAt: now,

        // legacy compatibility
        dealName: title,
        dealAmount: expectedValue,
        representativeId: salesmanId,
        createdAt: now,
        customerId: customerId,
        measurementRequired: dealData.measurementRequired || 'No',
        advanceForMeasurement: dealData.advanceForMeasurement,
        isAcknowledged: false,
    };

    // Create the O2D document
    const newO2dProcess: Omit<O2DProcess, 'id'> = {
        dealId: dealId,
        dealName: title,
        customerId: customerId,
        customerName: customerData.name,
        salesPerson: salesmanName,
        milestones: [], // Starts empty
        createdAt: now,
        isAcknowledged: false,
    };

    // Use a batch to write both documents atomically
    const batch = adminDb.batch();
    batch.set(newDealRef, stripUndefinedDeep(newDeal));
    batch.set(o2dRef.doc(dealId), newO2dProcess);
    if (mergedBillingDetails) {
      batch.set(
        customerRef,
        stripUndefinedDeep({
          billingDetails: mergedBillingDetails,
          lastUpdatedAt: now,
        }),
        { merge: true }
      );
    }
    
    await batch.commit();

    const savedDeal = { ...newDeal };

    return { success: true, message: "Deal created successfully.", deal: JSON.parse(JSON.stringify(savedDeal)) };

  } catch (error: any) {
    console.error("Error creating deal in server action:", error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}

export async function updateDealSalesmanAction(
  customerId: string,
  dealDocId: string,
  salesmanId: string
): Promise<{ success: boolean; message: string; deal?: Deal }> {
  try {
    const normalizedCustomerId = String(customerId || "").trim();
    const normalizedDealDocId = String(dealDocId || "").trim();
    const normalizedSalesmanId = String(salesmanId || "").trim();

    if (!normalizedCustomerId || !normalizedDealDocId || !normalizedSalesmanId) {
      return { success: false, message: "Missing customer, deal, or salesman." };
    }

    const salesmanRef = adminDb.collection("users").doc(normalizedSalesmanId);
    const salesmanSnap = await salesmanRef.get();
    if (!salesmanSnap.exists) {
      return { success: false, message: "Selected salesman not found." };
    }

    const salesmanData = salesmanSnap.data() as User;
    const salesmanName = String(salesmanData?.name || "").trim();
    if (!salesmanName) {
      return { success: false, message: "Selected salesman has no valid name." };
    }

    const dealRef = adminDb
      .collection("customers")
      .doc(normalizedCustomerId)
      .collection("deals")
      .doc(normalizedDealDocId);

    const dealSnap = await dealRef.get();
    if (!dealSnap.exists) {
      return { success: false, message: "Deal not found." };
    }

    const dealData = dealSnap.data() as Deal;
    const now = new Date().toISOString();

    let handleByCmrPayload: { id?: string; name?: string } | undefined = undefined;
    const assignmentSnap = await adminDb
      .collection("salesmanCrmAssignments")
      .doc(salesmanName)
      .get();
    const crmUserId = String(assignmentSnap.data()?.crmUserId || "").trim();
    if (crmUserId) {
      const crmUserSnap = await adminDb.collection("users").doc(crmUserId).get();
      const crmUserName = crmUserSnap.exists
        ? String((crmUserSnap.data() as User)?.name || "").trim()
        : "";
      handleByCmrPayload = stripUndefined({
        id: crmUserId,
        name: crmUserName || undefined,
      });
    }

    const assignedSalesPersonPayload = stripUndefined({
      id: normalizedSalesmanId,
      name: salesmanName,
    });

    const dealUpdatePayload: Record<string, any> = {
      assignedSalesPerson: assignedSalesPersonPayload,
      representativeId: normalizedSalesmanId,
      lastUpdatedAt: now,
    };
    if (handleByCmrPayload && Object.keys(handleByCmrPayload).length > 0) {
      dealUpdatePayload.handleByCmr = handleByCmrPayload;
    }

    await dealRef.set(dealUpdatePayload, { merge: true });

    const dealPublicId = String(dealData?.dealId || normalizedDealDocId).trim();
    if (dealPublicId) {
      const o2dRef = adminDb.collection("o2d").doc(dealPublicId);
      const o2dSnap = await o2dRef.get();
      if (o2dSnap.exists) {
        await o2dRef.set(
          {
            salesPerson: salesmanName,
            updatedAt: now,
          },
          { merge: true }
        );
      }

      const ordersSnap = await adminDb.collection("orders").where("dealId", "==", dealPublicId).get();
      if (!ordersSnap.empty) {
        const batch = adminDb.batch();
        ordersSnap.docs.forEach((orderDoc) => {
          batch.set(
            orderDoc.ref,
            {
              salesPerson: salesmanName,
              updatedAt: now,
            },
            { merge: true }
          );
        });
        await batch.commit();
      }
    }

    const updatedSnap = await dealRef.get();
    const updatedDeal = { id: updatedSnap.id, ...updatedSnap.data() } as Deal;

    revalidatePath(`/dashboard/customers/${normalizedCustomerId}`);
    revalidatePath(`/dashboard/customers/${normalizedCustomerId}/${normalizedDealDocId}`);

    return {
      success: true,
      message: "Salesman updated successfully.",
      deal: JSON.parse(JSON.stringify(updatedDeal)),
    };
  } catch (error: any) {
    console.error("Error updating deal salesman:", error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}
