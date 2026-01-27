
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { InvoiceBatch, Order, Quotation, PrintableInvoicePayload } from '@/lib/types';
import { format } from 'date-fns';

export async function combineInvoiceBatchesAction(
  batchesToCombine: InvoiceBatch[]
): Promise<{ success: boolean; message: string }> {

  // Basic validations
  if (!Array.isArray(batchesToCombine) || batchesToCombine.length < 2) {
    return { success: false, message: 'At least two batches are required.' };
  }

  const firstBatch = batchesToCombine[0];
  const orderId = firstBatch.orderId;
  const isVasInvoice = firstBatch.isVas === true;

  // All batches must belong to same order
  if (batchesToCombine.some(b => b.orderId !== orderId)) {
    return { success: false, message: 'All batches must belong to the same order.' };
  }

  // All batches must be pending
  if (batchesToCombine.some(b => b.status !== 'pendingInvoice')) {
    return { success: false, message: 'Only pending invoices can be combined.' };
  }

  // VAS consistency
  if (batchesToCombine.some(b => (b.isVas === true) !== isVasInvoice)) {
    return { success: false, message: 'VAS and non-VAS invoices cannot be combined.' };
  }

  try {
    const firestoreBatch = adminDb.batch();

    /* ---------- Combine Items ---------- */
    const combinedItems = batchesToCombine.flatMap(batch => batch.items || []);

    if (combinedItems.length === 0) {
      return { success: false, message: 'No invoice items found to combine.' };
    }

    /* ---------- Create New Batch ---------- */
    const newBatchRef = adminDb.collection('invoiceBatches').doc();

    const newCombinedBatch: Omit<InvoiceBatch, 'id'> = {
      orderId,
      customerName: firstBatch.customerName,
      customerPhone: firstBatch.customerPhone,
      customerAddress: firstBatch.customerAddress,
      salesPerson: firstBatch.salesPerson || '',
      createdAt: new Date().toISOString(),
      status: 'pendingInvoice',
      items: combinedItems,
      isCombined: true,
      isVas: isVasInvoice,
      combinedFromBatches: batchesToCombine.map(b => b.id),
    };

    firestoreBatch.set(newBatchRef, newCombinedBatch);

    /* ---------- Delete Old Batches ---------- */
    batchesToCombine.forEach(batch => {
      firestoreBatch.delete(
        adminDb.collection('invoiceBatches').doc(batch.id)
      );
    });

    await firestoreBatch.commit();

    return {
      success: true,
      message: `Successfully combined ${batchesToCombine.length} invoice batches.`,
    };

  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Failed to combine invoices.',
    };
  }
}

export async function buildAndFetchInvoicePayload(orderId: string): Promise<{ success: boolean; payload?: PrintableInvoicePayload; message?: string }> {
  try {
    // 1. Fetch Order
    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return { success: false, message: `Order with ID ${orderId} not found.` };
    }
    const order = orderSnap.data() as Order;

    // 2. Fetch Quotation using crmOrderNo
    const quotationNo = order.crmOrderNo;
    const quotationQuery = adminDb.collectionGroup('quotations').where('quotationNo', '==', quotationNo).limit(1);
    const quotationSnapshot = await quotationQuery.get();
    if (quotationSnapshot.empty) {
      return { success: false, message: `Quotation #${quotationNo} linked to this order could not be found.` };
    }
    const quotation = quotationSnapshot.docs[0].data() as Quotation;

    // 3. Construct Payload
    const calculatedItems = (quotation.items || []).map(item => {
        const quantity = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const discountPercent = Number(item.discountPercent) || 0;
        const amount = quantity * rate;
        const discountAmount = amount * (discountPercent / 100);
        
        // Use pre-calculated values from quotation if available
        const taxableAmount = Number(item.taxableAmt) || (amount - discountAmount);
        const cgst = Number(item.cgst) || 0;
        const sgst = Number(item.sgst) || 0;
        const igst = Number(item.igst) || 0;
        const total = taxableAmount + cgst + sgst + igst;

        return {
            name: item.salesDescription || item.collectionBrand,
            bcn: item.collectionBrand,
            hsn: item.hsnCode || 'N/A',
            quantity: quantity,
            uom: 'Mtr',
            rate: rate,
            discountPercent: discountPercent,
            taxableAmount: taxableAmount,
            cgst: cgst,
            sgst: sgst,
            igst: igst,
            total: total
        };
    });

    const calculatedVasItems = (quotation.vasDetails || []).map(vas => {
        const quantity = Number(vas.quantity) || 0;
        const rate = Number(vas.rate) || 0;
        const taxableAmount = Number(vas.taxableAmt) || (quantity * rate);

        const cgst = Number(vas.cgst) || 0;
        const sgst = Number(vas.sgst) || 0;
        const igst = Number(vas.igst) || 0;
        const total = taxableAmount + cgst + sgst + igst;

        return {
            name: vas.vasName,
            bcn: `VAS-${vas.vasName}`,
            hsn: vas.hsnCode || 'N/A',
            quantity: quantity,
            uom: 'Pcs',
            rate: rate,
            discountPercent: 0,
            taxableAmount: taxableAmount,
            cgst: cgst,
            sgst: sgst,
            igst: igst,
            total: total
        };
    });
    
    const allItems = [...calculatedItems, ...calculatedVasItems];

    const totals = allItems.reduce((acc, item) => {
        const amount = item.rate * item.quantity;
        const discount = (item.discountPercent / 100) * amount;
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
      gstBreakdown: [] 
    };

    return { success: true, payload: JSON.parse(JSON.stringify(payload)) };

  } catch (error: any) {
    console.error("Error building invoice payload:", error);
    return { success: false, message: error.message };
  }
}
