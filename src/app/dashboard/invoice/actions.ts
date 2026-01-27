
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Invoice, Order, Quotation, PrintableInvoicePayload } from '@/lib/types';
import { format } from 'date-fns';
import { buildSalesVoucherXML } from '@/services/tally';

export async function buildAndFetchInvoicePayload(orderId: string): Promise<{ success: boolean; payload?: PrintableInvoicePayload; message?: string }> {
  console.log(`[buildAndFetchInvoicePayload] Initiated. orderId=${orderId}`);
  
  try {
    const fullOrderId = orderId.startsWith("MOTRACK-") ? orderId : `MOTRACK-${orderId}`;
    
    // 1. Fetch Order
    console.log(`[buildAndFetchInvoicePayload] Fetching order: ${fullOrderId}`);
    const orderRef = adminDb.collection("orders").doc(fullOrderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return { success: false, message: `Order with ID ${fullOrderId} not found.` };
    }
    const order = orderSnap.data() as Order;
    console.log(`[buildAndFetchInvoicePayload] Order found. crmOrderNo: ${order.crmOrderNo}`);

    // 2. Fetch Quotation using crmOrderNo
    const quotationNo = order.crmOrderNo;
    console.log(`[buildAndFetchInvoicePayload] Fetching quotation where quotationNo == ${quotationNo}`);
    const quotationQuery = adminDb.collectionGroup('quotations').where('quotationNo', '==', quotationNo).limit(1);
    const quotationSnapshot = await quotationQuery.get();
    
    if (quotationSnapshot.empty) {
      return { success: false, message: `Quotation #${quotationNo} linked to this order could not be found.` };
    }
    const quotation = quotationSnapshot.docs[0].data() as Quotation;
    console.log(`[buildAndFetchInvoicePayload] Quotation found: ${quotation.id}`);

    // 3. Construct Payload
    console.log(`[buildAndFetchInvoicePayload] Constructing payload...`);
    const calculatedItems = (quotation.items || []).map(item => {
        const taxableAmount = Number(item.taxableAmt) || 0;
        const cgst = Number(item.cgst) || 0;
        const sgst = Number(item.sgst) || 0;
        const igst = Number(item.igst) || 0;
        const total = taxableAmount + cgst + sgst + igst;

        return {
            name: item.salesDescription || item.collectionBrand,
            bcn: item.collectionBrand,
            hsn: item.hsnCode || 'N/A',
            quantity: Number(item.quantity) || 0,
            uom: 'Mtr',
            rate: Number(item.rate) || 0,
            discountPercent: Number(item.discountPercent) || 0,
            taxableAmount,
            cgst,
            sgst,
            igst,
            total,
        };
    });

    const calculatedVasItems = (quotation.vasDetails || []).map(vas => {
        const taxableAmount = (Number(vas.rate) || 0) * (Number(vas.quantity) || 0);
        const gstPercent = Number(vas.gstPercent ?? 18); // Default to 18% for VAS if not present
        const totalGst = taxableAmount * (gstPercent / 100);
        const cgst = totalGst / 2;
        const sgst = totalGst / 2;
        const total = taxableAmount + totalGst;

        return {
            name: vas.vasName,
            bcn: `VAS-${vas.vasName}`,
            hsn: vas.hsnCode || '9988',
            quantity: Number(vas.quantity) || 0,
            uom: 'Pcs',
            rate: Number(vas.rate) || 0,
            discountPercent: 0,
            taxableAmount: taxableAmount,
            cgst,
            sgst,
            igst: 0,
            total,
        };
    });
    
    const allItems = [...calculatedItems, ...calculatedVasItems];

    const totals = allItems.reduce((acc, item) => {
        const amount = item.rate * item.quantity;
        const discount = amount * (item.discountPercent / 100);
        acc.subTotal += amount;
        acc.discount += discount;
        acc.taxableValue += item.taxableAmount;
        acc.cgst += item.cgst;
        acc.sgst += item.sgst;
        acc.igst += item.igst;
        return acc;
    }, { subTotal: 0, discount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 });

    const netAmount = totals.taxableValue + totals.cgst + totals.sgst + totals.igst;
    const roundedTotal = Math.round(netAmount);
    const roundOff = roundedTotal - netAmount;

    const payload: PrintableInvoicePayload = {
      meta: {
        orderNo: order.id,
        quotationNo: quotation.quotationNo,
        invoiceDate: new Date().toISOString(),
        isVas: (quotation.vasDetails || []).length > 0 && (quotation.items || []).length === 0,
        salesPerson: order.salesPerson,
      },
      customer: {
        name: order.customerName,
        phone: order.customerPhone,
        address: order.customerAddress,
      },
      seller: {
        companyName: 'MO Designs Private Limited - (2024-2025)',
        address: 'A-6, Sushant Lok-1, M G Road, Gurgaon- 122022,B-50, Sushant Lok-2, Sec- 56, Gurgaon - 122011 GURGAON. (HARYANA) INDIA',
        gstin: '06AAMCM5012B1ZY',
      },
      items: allItems,
      totals: {
        subTotal: totals.subTotal,
        discount: totals.discount,
        taxableValue: totals.taxableValue,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        roundOff: roundOff,
        grandTotal: roundedTotal,
        totalGst: totals.cgst + totals.sgst + totals.igst,
      },
      gstBreakdown: [] // This can be calculated if needed, but for now we have totals.
    };

    console.log(`[buildAndFetchInvoicePayload] Payload constructed successfully.`);
    return { success: true, payload: JSON.parse(JSON.stringify(payload)) };

  } catch (error: any) {
    console.error("[buildAndFetchInvoicePayload] Error building invoice payload:", error);
    return { success: false, message: error.message };
  }
}
