'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Order, PrintableInvoicePayload } from '@/lib/types';

interface QuotationItem {
  collectionBrand: string;
  salesDescription: string;
  quantity: number;
  rate: number;
  exclusiveRate?: number;
  discountPercent: number;
  gstPercent: number;
  cgst: number;
  sgst: number;
  igst: number;
  subtotal: number;
  taxableAmt: number;
  gstAmount?: number;
  totalAmount?: number;
  hsnCode?: string;
}

interface QuotationVasItem {
  vasName: string;
  quantity: string;
  rate: string;
  gstPercent: string;
  hsnCode?: string;
}

interface QuotationData {
  quotationNo: string;
  billingName?: string;
  billingAddress?: string;
  company?: string;
  customerName: string;
  items?: QuotationItem[];
  vasDetails?: QuotationVasItem[];
}

export async function buildAndFetchInvoicePayload(
  orderId: string
): Promise<{ success: boolean; payload?: PrintableInvoicePayload; message?: string }> {
  const LOG_PREFIX = "[INVOICE-BUILDER]";

  try {
    console.log(`${LOG_PREFIX} ▶️ START`, { orderId });

    // Normalize Order ID
    const fullOrderId = orderId.startsWith("MOTRACK-") ? orderId : `MOTRACK-${orderId}`;
    console.log(`${LOG_PREFIX} Order ID normalized`, { fullOrderId });

    // -------------------- FETCH ORDER --------------------
    const orderRef = adminDb.collection("orders").doc(fullOrderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      console.error(`${LOG_PREFIX} ❌ Order not found`, { fullOrderId });
      return { success: false, message: `Order ${fullOrderId} not found` };
    }

    const order = { id: orderSnap.id, ...orderSnap.data() } as Order & { id: string };
    console.log(`${LOG_PREFIX} ✅ Order fetched`, {
      id: order.id,
      crmOrderNo: order.crmOrderNo,
      customerName: order.customerName,
    });

    const quotationNo = order.crmOrderNo;

    // -------------------- FETCH QUOTATION --------------------
    console.log(`${LOG_PREFIX} 🔎 Fetching quotation`, { quotationNo });

    const quotationSnapshot = await adminDb
      .collectionGroup("quotations")
      .where("quotationNo", "==", quotationNo)
      .limit(1)
      .get();

    if (quotationSnapshot.empty) {
      console.error(`${LOG_PREFIX} ❌ Quotation not found`, { quotationNo });
      return { success: false, message: `Quotation ${quotationNo} not found` };
    }

    const quotation = quotationSnapshot.docs[0].data() as QuotationData;
    console.log(`${LOG_PREFIX} ✅ Quotation fetched`, {
      quotationNo: quotation.quotationNo,
      itemsCount: quotation.items?.length || 0,
      vasCount: quotation.vasDetails?.length || 0,
    });

    // -------------------- FABRIC ITEMS --------------------
    const rawNormalItems = Array.isArray(quotation.items) && quotation.items.length > 0
      ? quotation.items
      : ((quotation as any).sections?.NORMAL?.items || []);

    const fabricItems = (rawNormalItems || []).map((item: any, idx: number) => {
      const quantity = Number(item.quantity ?? item.qty) || 0;
      const rate = Number(item.exclusiveRate ?? item.rate) || 0;
      const taxableAmount = Number(item.taxableAmt ?? item.taxableAmount) || rate * quantity;
      const cgst = Number(item.cgst) || 0;
      const sgst = Number(item.sgst) || 0;
      const igst = Number(item.igst) || 0;
      const total = Number(item.totalAmount) || taxableAmount + cgst + sgst + igst;

      const mapped = {
        name: item.salesDescription || item.description || item.collectionBrand || item.bcn,
        bcn: item.collectionBrand || item.bcn || item.description,
        hsn: item.hsnCode || item.hsn || "54076190",
        quantity,
        uom: "Mtr" as const,
        rate,
        discountPercent: Number(item.discountPercent) || 0,
        taxableAmount,
        cgst,
        sgst,
        igst,
        total,
      };

      console.log(`${LOG_PREFIX} 🧵 Fabric item mapped [${idx}]`, mapped);
      return mapped;
    });

    // -------------------- VAS ITEMS --------------------
    const rawVasItems = Array.isArray(quotation.vasDetails) && quotation.vasDetails.length > 0
      ? quotation.vasDetails
      : ((quotation as any).sections?.VAS?.items || []);

    const vasItems = (rawVasItems || []).map((vas: any, idx: number) => {
      const quantity = Number(vas.quantity ?? vas.qty) || 0;
      const rate = Number(vas.rate) || 0;
      const gstPercent = Number(vas.gstPercent ?? vas.gst) || 18;

      const amount = quantity * rate;
      const taxableAmount = amount;
      const totalGst = taxableAmount * (gstPercent / 100);
      const cgst = totalGst / 2;
      const sgst = totalGst / 2;
      const total = taxableAmount + totalGst;

      const mapped = {
        name: vas.vasName || vas.description,
        bcn: `VAS-${vas.vasName || vas.description || "SERVICE"}`,
        hsn: vas.hsnCode || vas.hsn || "998819",
        quantity,
        uom: "Pcs" as const,
        rate,
        discountPercent: 0,
        taxableAmount,
        cgst,
        sgst,
        igst: 0,
        total,
      };

      console.log(`${LOG_PREFIX} 🧩 VAS item mapped [${idx}]`, mapped);
      return mapped;
    });

    const allItems = [...fabricItems, ...vasItems];
    console.log(`${LOG_PREFIX} 📦 Total items combined`, {
      fabric: fabricItems.length,
      vas: vasItems.length,
      total: allItems.length,
    });

    // -------------------- TOTALS --------------------
    const totals = allItems.reduce(
      (acc, item, idx) => {
        const amount = item.rate * item.quantity;
        const discount = amount * (item.discountPercent / 100);

        acc.subTotal += amount;
        acc.discount += discount;
        acc.taxableValue += item.taxableAmount;
        acc.cgst += item.cgst;
        acc.sgst += item.sgst;
        acc.igst += item.igst;

        console.log(`${LOG_PREFIX} ➕ Totals running [${idx}]`, {
          amount,
          discount,
          taxable: item.taxableAmount,
          cgst: item.cgst,
          sgst: item.sgst,
          igst: item.igst,
        });

        return acc;
      },
      { subTotal: 0, discount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
    );

    const netAmount = totals.taxableValue + totals.cgst + totals.sgst + totals.igst;
    const roundedTotal = Math.round(netAmount);
    const roundOff = roundedTotal - netAmount;

    console.log(`${LOG_PREFIX} 🧮 Totals computed`, {
      ...totals,
      netAmount,
      roundedTotal,
      roundOff,
    });

    // -------------------- GST BREAKDOWN --------------------
    const gstBreakdownMap = new Map<number, any>();

    allItems.forEach((item, idx) => {
      const gstRate = item.cgst > 0 ? (item.cgst / item.taxableAmount) * 100 * 2 : 0;
      const roundedRate = Math.round(gstRate);

      const existing = gstBreakdownMap.get(roundedRate);
      if (existing) {
        existing.taxable += item.taxableAmount;
        existing.cgst += item.cgst;
        existing.sgst += item.sgst;
        existing.igst += item.igst;
      } else {
        gstBreakdownMap.set(roundedRate, {
          rate: roundedRate,
          taxable: item.taxableAmount,
          cgst: item.cgst,
          sgst: item.sgst,
          igst: item.igst,
        });
      }

      console.log(`${LOG_PREFIX} 🧾 GST bucket [${idx}]`, {
        rate: roundedRate,
        taxable: item.taxableAmount,
      });
    });

    const gstBreakdown = Array.from(gstBreakdownMap.values());
    console.log(`${LOG_PREFIX} 📊 GST breakdown final`, gstBreakdown);

    // -------------------- META --------------------
    const isVas = vasItems.length > 0 && fabricItems.length === 0;
    console.log(`${LOG_PREFIX} 🏷️ Invoice type`, { isVas });

    // -------------------- PAYLOAD --------------------
    const payload: PrintableInvoicePayload = {
      meta: {
        orderNo: order.id,
        quotationNo: quotation.quotationNo,
        invoiceDate: new Date().toISOString(),
        isVas,
        salesPerson: order.salesPerson,
      },
      customer: {
        name: quotation.billingName || order.customerName,
        phone: order.customerPhone,
        address: quotation.billingAddress || order.customerAddress,
      },
      seller: {
        companyName:
          quotation.company ||
          (isVas ? "SP SERVICES" : "MO Designs Private Limited - (2024-2025)"),
        address:
          isVas
            ? "2nd Floor, B-50 (MO), Sushant Lok Phase 2, Block B, Sector 56, Gurugram - 122011, Haryana, India"
            : "A-6, Sushant Lok-1, M G Road, Gurgaon- 122022, B-50, Sushant Lok-2, Sec- 56, Gurgaon - 122011 GURGAON. (HARYANA) INDIA",
        gstin: isVas ? "06CDOPP2805B1ZR" : "06AAMCM5012B1ZY",
      },
      items: allItems,
      totals: {
        subTotal: totals.subTotal,
        discount: totals.discount,
        taxableValue: totals.taxableValue,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        roundOff,
        grandTotal: roundedTotal,
        totalGst: totals.cgst + totals.sgst + totals.igst,
      },
      gstBreakdown,
    };

    console.log(`${LOG_PREFIX} ✅ PAYLOAD READY`, payload);

    return { success: true, payload: JSON.parse(JSON.stringify(payload)) };

  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ ERROR`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to build invoice payload",
    };
  }
}

