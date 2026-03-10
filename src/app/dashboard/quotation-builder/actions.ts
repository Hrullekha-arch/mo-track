'use server';

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getNextSequenceValue } from '@/lib/id-sequence';
import { OrderType, User } from '@/lib/types';
import { addCustomerAction } from '@/app/dashboard/customers/actions';
import {
  createDealOrderAction,
  createQuotationAction,
} from '@/app/dashboard/customers/[customerId]/[dealId]/actions';

export type InstantCustomerOption = {
  id: string;
  name: string;
  mobile: string;
  email?: string;
  addressLine1?: string;
  pincode?: string;
};

export type InstantItemInput = {
  bcn: string;
  description: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  gstPercent?: number;
  gstMode?: 'EXCL' | 'INCL';
  room?: string;
  noOfPcs?: string;
  remark?: string;
  stockId?: string;
};

type CreateInstantQuotationInput = {
  customerId?: string;
  customerName?: string;
  mobile?: string;
  email?: string;
  addressLine1?: string;
  pincode?: string;
  salesmanId: string;
  dealName: 'Cashsale' | 'Walkin-sale';
  store: string;
  orderType?: OrderType;
  items: InstantItemInput[];
  creator: {
    id: string;
    name: string;
  };
};

const normalizePhone = (value: string) => String(value || '').replace(/\D/g, '');
const normalizeTextKey = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');

const buildInstantCustomerDocId = (name: string, mobile: string) => {
  const safeName = normalizeTextKey(name) || 'customer';
  const safeMobile = normalizePhone(mobile) || 'unknown';
  return `${safeName}_${safeMobile}`;
};

const formatInstantDealId = (seq: number) => `INQ-${String(seq).padStart(3, '0')}`;

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const computeLineTotal = (item: InstantItemInput) => {
  const qty = Math.max(0, toNumber(item.quantity));
  const rate = Math.max(0, toNumber(item.rate));
  const discountPercent = Math.max(0, Math.min(100, toNumber(item.discountPercent)));
  const gstPercent = Math.max(0, toNumber(item.gstPercent || 0));
  const gstMode = item.gstMode === 'EXCL' ? 'EXCL' : 'INCL';

  const gross = qty * rate;
  const afterDiscount = gross * (1 - discountPercent / 100);

  if (gstMode === 'EXCL') {
    return afterDiscount * (1 + gstPercent / 100);
  }

  return afterDiscount;
};

async function allocateInstantDealId(): Promise<string> {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const seqRaw = await getNextSequenceValue('instantDealId');
    const seq = Number(seqRaw);
    if (!Number.isFinite(seq) || seq <= 0) {
      continue;
    }
    const candidate = formatInstantDealId(seq);

    const [existingDealByValue, existingO2d] = await Promise.all([
      adminDb.collectionGroup('deals').where('dealId', '==', candidate).limit(1).get(),
      adminDb.collection('o2d').doc(candidate).get(),
    ]);

    if (existingDealByValue.empty && !existingO2d.exists) {
      return candidate;
    }
  }

  throw new Error('Unable to allocate a unique INQ deal ID.');
}

export async function getInstantQuotationBootstrapAction(): Promise<{
  salesmen: Array<{ id: string; name: string; salesmanCode?: string }>;
  nextDealId: string;
}> {
  try {
    const [salesmenSnap, counterSnap] = await Promise.all([
      adminDb.collection('users').where('role', '==', 'salesman').get(),
      adminDb.collection('systemCounters').doc('instantDealId').get(),
    ]);

    const salesmen = salesmenSnap.docs
      .map((doc) => {
        const data = doc.data() as User;
        return {
          id: doc.id,
          name: String(data?.name || '').trim(),
          salesmanCode: String(data?.salesmanCode || '').trim() || undefined,
        };
      })
      .filter((row) => row.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    const current = Number(counterSnap.data()?.current);
    const nextSeq = Number.isFinite(current) ? current + 1 : 1;

    return {
      salesmen,
      nextDealId: formatInstantDealId(nextSeq),
    };
  } catch (error) {
    console.error('Error loading instant quotation bootstrap:', error);
    return { salesmen: [], nextDealId: 'INQ-001' };
  }
}

export async function searchInstantCustomersAction(searchTerm: string): Promise<InstantCustomerOption[]> {
  try {
    const queryText = String(searchTerm || '').trim().toLowerCase();
    const snap = await adminDb.collection('customers').orderBy('createdAt', 'desc').limit(200).get();

    const rows: InstantCustomerOption[] = snap.docs.map((doc) => {
      const data = doc.data() as any;
      const mobile = String(data?.phone || data?.mobileNo || '').trim();
      return {
        id: doc.id,
        name: String(data?.name || '').trim(),
        mobile,
        email: String(data?.email || '').trim() || undefined,
        addressLine1:
          String(data?.billingAddress?.line1 || data?.address || '').trim() || undefined,
        pincode:
          String(data?.billingAddress?.pincode || data?.pinCode || '').trim() || undefined,
      };
    });

    const filtered = queryText
      ? rows.filter((row) => {
          const haystack = `${row.name} ${row.mobile} ${row.email || ''}`.toLowerCase();
          return haystack.includes(queryText);
        })
      : rows;

    return filtered.slice(0, 10);
  } catch (error) {
    console.error('Error searching instant customers:', error);
    return [];
  }
}

export async function createInstantCustomerAction(input: {
  name: string;
  mobile: string;
  email?: string;
  addressLine1?: string;
  pincode?: string;
  createdBy?: string;
}): Promise<{ success: boolean; message: string; customer?: InstantCustomerOption }> {
  const name = String(input?.name || '').trim();
  const mobile = normalizePhone(input?.mobile || '');

  if (!name || !mobile) {
    return { success: false, message: 'Customer name and mobile are required.' };
  }

  const result = await addCustomerAction({
    name,
    phone: mobile,
    email: input?.email,
    createdBy: input?.createdBy,
    billingAddress: {
      line1: String(input?.addressLine1 || '').trim() || undefined,
      pincode: String(input?.pincode || '').trim() || undefined,
    },
  });

  if (!result.success || !result.customer) {
    return { success: false, message: result.message || 'Failed to create customer.' };
  }

  const customer = result.customer as any;
  return {
    success: true,
    message: 'Customer created successfully.',
    customer: {
      id: String(customer.customerId || customer.id),
      name: String(customer.name || name),
      mobile: String(customer.phone || customer.mobileNo || mobile),
      email: String(customer.email || '').trim() || undefined,
      addressLine1: String(customer.billingAddress?.line1 || '').trim() || undefined,
      pincode: String(customer.billingAddress?.pincode || '').trim() || undefined,
    },
  };
}

export async function createInstantQuotationOrderAction(
  payload: CreateInstantQuotationInput
): Promise<{
  success: boolean;
  message: string;
  customerId?: string;
  dealId?: string;
  quotationId?: string;
  quotationNo?: string;
  orderId?: string;
}> {
  try {
    if (!payload?.creator?.id || !payload?.creator?.name) {
      return { success: false, message: 'Invalid creator details.' };
    }
    if (!payload?.salesmanId) {
      return { success: false, message: 'Sales representative is required.' };
    }
    if (!payload?.store) {
      return { success: false, message: 'Store is required.' };
    }
    if (!Array.isArray(payload?.items) || payload.items.length === 0) {
      return { success: false, message: 'Add at least one item.' };
    }

    const isCashsale = payload.dealName === 'Cashsale';

    const cleanItems = payload.items
      .map((item) => ({
        ...item,
        bcn: String(item?.bcn || '').trim(),
        description: String(item?.description || '').trim(),
        quantity: Math.max(0, toNumber(item?.quantity)),
        rate: Math.max(0, toNumber(item?.rate)),
        discountPercent: Math.max(0, Math.min(100, toNumber(item?.discountPercent))),
        gstPercent: isCashsale ? 0 : Math.max(0, toNumber(item?.gstPercent ?? 5)),
        gstMode: isCashsale ? 'INCL' : item?.gstMode === 'EXCL' ? 'EXCL' : 'INCL',
      }))
      .filter((item) => item.bcn && item.description && item.quantity > 0);

    if (!cleanItems.length) {
      return { success: false, message: 'No valid line items were provided.' };
    }

    const salesmanSnap = await adminDb.collection('users').doc(payload.salesmanId).get();
    if (!salesmanSnap.exists) {
      return { success: false, message: 'Selected salesman not found.' };
    }
    const salesmanData = salesmanSnap.data() as User;
    const salesmanName = String(salesmanData?.name || '').trim();
    if (!salesmanName) {
      return { success: false, message: 'Selected salesman is invalid.' };
    }

    let customerId = String(payload.customerId || '').trim();
    let customerName = '';
    let customerMobile = '';
    let customerEmail = String(payload.email || '').trim() || undefined;
    let customerAddressLine1 = String(payload.addressLine1 || '').trim() || undefined;
    let customerPincode = String(payload.pincode || '').trim() || undefined;

    if (!customerId) {
      const quickCreate = await createInstantCustomerAction({
        name: String(payload.customerName || '').trim(),
        mobile: String(payload.mobile || '').trim(),
        email: customerEmail,
        addressLine1: customerAddressLine1,
        pincode: customerPincode,
        createdBy: payload.creator.name,
      });

      if (!quickCreate.success || !quickCreate.customer) {
        return { success: false, message: quickCreate.message };
      }

      customerId = quickCreate.customer.id;
      customerName = quickCreate.customer.name;
      customerMobile = quickCreate.customer.mobile;
      customerEmail = quickCreate.customer.email;
      customerAddressLine1 = quickCreate.customer.addressLine1;
      customerPincode = quickCreate.customer.pincode;
    } else {
      const customerSnap = await adminDb.collection('customers').doc(customerId).get();
      if (!customerSnap.exists) {
        return { success: false, message: 'Selected customer not found.' };
      }

      const customerData = customerSnap.data() as any;
      customerName = String(customerData?.name || payload.customerName || '').trim();
      customerMobile = String(customerData?.phone || customerData?.mobileNo || payload.mobile || '').trim();
      customerEmail = String(customerData?.email || payload.email || '').trim() || undefined;
      customerAddressLine1 =
        String(customerData?.billingAddress?.line1 || payload.addressLine1 || '').trim() || undefined;
      customerPincode =
        String(customerData?.billingAddress?.pincode || customerData?.pinCode || payload.pincode || '').trim() || undefined;
    }

    if (!customerName || !customerMobile) {
      return { success: false, message: 'Customer name and mobile are required.' };
    }

    const nowIso = new Date().toISOString();
    const dealDocId = await allocateInstantDealId();
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealDocId);
    const o2dRef = adminDb.collection('o2d').doc(dealDocId);

    const expectedValue = cleanItems.reduce((sum, item) => sum + computeLineTotal(item), 0);
    const dealTitle = payload.dealName;

    const dealPayload: any = {
      id: dealDocId,
      dealId: dealDocId,
      dealCode: dealDocId,
      customer: {
        id: customerId,
        name: customerName,
        phone: customerMobile,
      },
      title: dealTitle,
      description: 'Instant quotation created from quotation-builder.',
      dealType: 'INSTANT',
      dealSource: payload.dealName === 'Cashsale' ? 'CASH_SALE' : 'WALKIN',
      assignedSalesPerson: {
        id: payload.salesmanId,
        name: salesmanName,
      },
      handleByCmr: {
        id: payload.creator.id,
        name: payload.creator.name,
      },
      expectedValue,
      actualQuotationValue: 0,
      actualOrderValue: 0,
      status: 'OPEN',
      dates: { createdAt: nowIso },
      recent: { visits: [], quotations: [], orders: [] },
      lastUpdatedAt: nowIso,
      dealName: dealTitle,
      dealAmount: expectedValue,
      representativeId: payload.salesmanId,
      createdAt: nowIso,
      customerId,
      measurementRequired: 'No',
      advanceForMeasurement: 'No',
      isAcknowledged: true,
    };

    const o2dPayload = {
      dealId: dealDocId,
      dealName: dealTitle,
      customerId,
      customerName,
      salesPerson: salesmanName,
      milestones: [],
      createdAt: nowIso,
      isAcknowledged: true,
    };

    const setupBatch = adminDb.batch();
    setupBatch.set(dealRef, dealPayload, { merge: true });
    setupBatch.set(o2dRef, o2dPayload, { merge: true });
    await setupBatch.commit();

    const quotationItems = cleanItems.map((item, index) => ({
      id: `${Date.now()}-${index}`,
      collectionBrand: item.bcn,
      serialNo: item.stockId || '',
      salesDescription: item.description,
      quantity: item.quantity,
      rate: item.rate,
      discountPercent: item.discountPercent || 0,
      room: item.room || '',
      remark: item.remark || '',
      gstPercent: item.gstPercent ?? 0,
      gstMode: item.gstMode ?? 'INCL',
    }));

    const quotationPayload: any = {
      company: 'MO DESIGNS PRIVATE LIMITED',
      store: payload.store,
      date: new Date(),
      customerName,
      billingName: customerName,
      billingAddress: customerAddressLine1 || '',
      dealName: dealTitle,
      selectedCpdId: '',
      items: quotationItems,
      vasDetails: [],
      sendEmail: false,
      sendSms: false,
      representativeId: payload.salesmanId,
      createdBy: payload.creator.name,
    };

    const quotationResult = await createQuotationAction(
      customerId,
      dealDocId,
      quotationPayload,
      expectedValue
    );
    if (!quotationResult.success || !quotationResult.quotation) {
      return { success: false, message: quotationResult.message || 'Failed to create quotation.' };
    }

    const resolvedOrderType: OrderType =
      payload.dealName === 'Cashsale' ? 'delivery' : payload.orderType || 'delivery';

    const orderResult = await createDealOrderAction(
      customerId,
      dealDocId,
      quotationResult.quotation,
      {
        id: payload.creator.id,
        name: payload.creator.name,
      },
      resolvedOrderType
    );
    if (!orderResult.success || !orderResult.order) {
      return { success: false, message: orderResult.message || 'Failed to create order.' };
    }

    const invoiceRequired = payload.dealName !== 'Cashsale';
    const orderRef = adminDb.collection('orders').doc(orderResult.order.id);
    await orderRef.set(
      {
        status: 'Approved',
        approvedAt: nowIso,
        orderType: resolvedOrderType,
        invoicing: {
          ...(orderResult.order.invoicing || {}),
          invoiceRequired,
          canCreateGoodsInvoice: invoiceRequired
            ? Boolean(orderResult.order.invoicing?.canCreateGoodsInvoice ?? true)
            : false,
          canCreateVasInvoice: invoiceRequired
            ? Boolean(orderResult.order.invoicing?.canCreateVasInvoice ?? false)
            : false,
        },
        instantQuotationMeta: {
          source: 'quotation-builder',
          dealName: payload.dealName,
          createdAt: nowIso,
          createdBy: {
            id: payload.creator.id,
            name: payload.creator.name,
          },
        },
        updates: FieldValue.arrayUnion({
          updatedAt: nowIso,
          updatedBy: {
            id: payload.creator.id,
            name: payload.creator.name,
          },
          action: 'INSTANT_QUOTATION_CREATED',
          message: invoiceRequired
            ? 'Instant quotation order created.'
            : 'Cash sale order created (invoice bypass).',
        }),
      },
      { merge: true }
    );

    const instantDocId = buildInstantCustomerDocId(customerName, customerMobile);
    const instantRef = adminDb.collection('instantQuoation').doc(instantDocId);
    await instantRef.set(
      {
        id: instantDocId,
        customerId,
        customerName,
        mobile: customerMobile,
        email: customerEmail || null,
        addressLine1: customerAddressLine1 || null,
        pincode: customerPincode || null,
        latestDealId: dealDocId,
        latestQuotationNo: quotationResult.quotation.quotationNo,
        latestOrderId: orderResult.order.id,
        lastUpdatedAt: nowIso,
        createdAt: nowIso,
      },
      { merge: true }
    );

    await instantRef.collection('entries').doc(orderResult.order.id).set({
      createdAt: nowIso,
      createdBy: payload.creator,
      customerId,
      customerName,
      mobile: customerMobile,
      dealId: dealDocId,
      dealName: payload.dealName,
      salesman: {
        id: payload.salesmanId,
        name: salesmanName,
      },
      store: payload.store,
      orderId: orderResult.order.id,
      orderType: resolvedOrderType,
      invoiceRequired,
      quotationId: quotationResult.quotation.id,
      quotationNo: quotationResult.quotation.quotationNo,
      items: cleanItems,
      expectedValue,
    });

    return {
      success: true,
      message: invoiceRequired
        ? `Instant quotation created. Order ${orderResult.order.id} is ready for stock/purchase flow.`
        : `Cash sale order ${orderResult.order.id} created with invoice bypass.`,
      customerId,
      dealId: dealDocId,
      quotationId: quotationResult.quotation.id,
      quotationNo: quotationResult.quotation.quotationNo,
      orderId: orderResult.order.id,
    };
  } catch (error: any) {
    console.error('Error creating instant quotation order:', error);
    return {
      success: false,
      message: `Failed to create instant quotation: ${error?.message || 'Unknown error'}`,
    };
  }
}
