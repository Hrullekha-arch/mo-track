import { Invoice, PrintableInvoicePayload } from "@/lib/types";
import { getMoDesignsCompanyName, normalizeCompanyFinancialYear } from "@/lib/financial-year";
import {
  allocateGstByTaxMode,
  DEFAULT_DESTINATION_STATE,
  formatInvoiceState,
  formatIndianAddress,
  resolveGstTaxMode,
  sanitizeLegacySelectText,
} from "@/lib/gst-jurisdiction";

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const numOrUndefined = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatAddress = (address: any) => {
  if (!address) return "";
  if (typeof address === "string") return address;
  const parts = [address.line1, address.line2, address.city, address.state, address.pincode]
    .map((part) => (typeof part === "string" ? part.trim() : part))
    .filter(Boolean);
  return parts.join(", ");
};

const mapLineItem = (item: any, type: "NORMAL" | "VAS") => {
  const qty = num(item.qty ?? item.quantity ?? item.quantityAllocated);
  const rate = num(item.exclusiveRate ?? item.rate);
  const discountPercent = num(item.discountPercent);
  const baseAmount = rate * qty;
  const discountAmount =
    numOrUndefined(item.discountAmount) ?? (baseAmount * (discountPercent / 100));
  const taxableAmount = num(item.taxableAmount ?? Math.max(0, baseAmount - discountAmount));
  const gstAmount = num(item.gstAmount ?? taxableAmount * (num(item.gst) / 100));
  const cgst = num(item.cgst ?? gstAmount / 2);
  const sgst = num(item.sgst ?? gstAmount / 2);
  const igst = num(item.igst ?? 0);
  const total = num(item.totalAmount ?? item.total ?? taxableAmount + cgst + sgst + igst);

  return {
    name: item.name ?? item.itemName ?? item.description ?? "",
    bcn: item.bcn ?? (type === "VAS" ? `VAS-${item.description || item.name || ""}` : ""),
    hsn: item.hsn ?? "",
    quantity: qty,
    uom: item.uom ?? item.unit ?? (type === "VAS" ? "PCS" : "MTR"),
    rate,
    exclusiveRate: numOrUndefined(item.exclusiveRate),
    discountPercent,
    discountAmount,
    taxableAmount,
    cgst,
    sgst,
    igst,
    total,
  };
};

const buildItemsFromSections = (invoice: Invoice) => {
  const normalItems = invoice.sections?.NORMAL?.items || [];
  const vasItems = invoice.sections?.VAS?.items || [];
  return [
    ...normalItems.map((item) => mapLineItem(item, "NORMAL")),
    ...vasItems.map((item) => mapLineItem(item, "VAS")),
  ];
};

const buildTotalsFromItems = (items: PrintableInvoicePayload["items"]) => {
  const totals = items.reduce(
    (acc, item) => {
      const lineRate = num(item.exclusiveRate ?? item.rate);
      const lineQty = num(item.quantity);
      const lineAmount = lineRate * lineQty;
      const lineDiscount =
        item.discountAmount !== undefined
          ? num(item.discountAmount)
          : lineAmount * (num(item.discountPercent) / 100);
      acc.subTotal += lineAmount;
      acc.discount += lineDiscount;
      acc.taxableValue += num(item.taxableAmount);
      acc.cgst += num(item.cgst);
      acc.sgst += num(item.sgst);
      acc.igst += num(item.igst);
      return acc;
    },
    { subTotal: 0, discount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
  );
  const totalGst = roundMoney(totals.cgst + totals.sgst + totals.igst);
  const netAmount = roundMoney(totals.taxableValue + totalGst);
  const roundedTotal = Math.round(netAmount);

  return {
    subTotal: totals.subTotal,
    discount: totals.discount,
    taxableValue: totals.taxableValue,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    roundOff: roundMoney(roundedTotal - netAmount),
    grandTotal: roundedTotal,
    totalGst,
  };
};

export const buildPrintablePayloadFromInvoice = (invoice: Invoice): PrintableInvoicePayload => {
  const isVasInvoice = invoice.invoiceType === "VAS" || invoice.isVas === true;
  const invoiceDate = invoice.invoiceDate || invoice.createdAt || new Date().toISOString();
  const fallbackSeller = {
    companyName: isVasInvoice ? "SP SERVICES" : getMoDesignsCompanyName(invoiceDate),
    address: isVasInvoice
      ? "2nd Floor, B-50 (MO), Sushant Lok Phase 2, Block B, Sector 56, Gurugram - 122011, Haryana, India"
      : "A-6, Sushant Lok-1, Gurgaon",
    gstin: isVasInvoice ? "06CDOPP2805B1ZR" : "06AAMCM5012B1ZY",
  };
  const resolvedSeller = {
    ...fallbackSeller,
    ...(invoice.sellerSnapshot || {}),
  };
  const invoiceCustomerSnapshot = invoice.customerSnapshot as any;
  const taxJurisdiction = resolveGstTaxMode({
    sellerGstin: resolvedSeller.gstin,
    destinationGstin:
      invoiceCustomerSnapshot?.billingDetails?.gstin ||
      invoiceCustomerSnapshot?.gstin,
    shippingAddress: invoiceCustomerSnapshot?.shippingAddress,
    billingAddress:
      invoiceCustomerSnapshot?.billingAddress ||
      invoiceCustomerSnapshot?.address ||
      invoice.customer?.address,
  });
  const hasPrintableItems = Array.isArray(invoice.items) && invoice.items.length > 0;
  const resolveItemType = (item: any) => {
    if (String(item.type || "").toUpperCase() === "VAS") return "VAS";
    if (typeof item.bcn === "string" && item.bcn.toUpperCase().startsWith("VAS-")) return "VAS";
    return "NORMAL";
  };
  const basePrintableItems = hasPrintableItems
    ? invoice.items.map((item) => mapLineItem(item, resolveItemType(item)))
    : buildItemsFromSections(invoice);
  const printableItems = basePrintableItems.map((item) => {
    const gstAmount = num(item.cgst) + num(item.sgst) + num(item.igst);
    return {
      ...item,
      ...allocateGstByTaxMode(gstAmount, taxJurisdiction.mode),
    };
  });

  const computedTotals = buildTotalsFromItems(printableItems);
  const storedTotals = invoice.totals || computedTotals;

  const mergedTotals = {
    ...computedTotals,
    ...storedTotals,
    discount: storedTotals.discount ?? storedTotals.totalDiscount ?? computedTotals.discount,
    cgst: computedTotals.cgst,
    sgst: computedTotals.sgst,
    igst: computedTotals.igst,
    totalGst: computedTotals.totalGst,
  };
  const totalGst = roundMoney(
    num(mergedTotals.cgst) + num(mergedTotals.sgst) + num(mergedTotals.igst)
  );
  const netAmount = roundMoney(num(mergedTotals.taxableValue) + totalGst);
  const grandTotal = Math.round(netAmount);
  const totals = {
    ...mergedTotals,
    totalGst,
    roundOff: roundMoney(grandTotal - netAmount),
    grandTotal,
  };
  const gstBreakdown = Array.from(
    printableItems.reduce((groups, item) => {
      const lineTax = num(item.cgst) + num(item.sgst) + num(item.igst);
      const rate = num(item.taxableAmount) > 0
        ? roundMoney((lineTax / num(item.taxableAmount)) * 100)
        : 0;
      const current = groups.get(rate) || {
        rate,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
      };
      current.taxable += num(item.taxableAmount);
      current.cgst += num(item.cgst);
      current.sgst += num(item.sgst);
      current.igst += num(item.igst);
      groups.set(rate, current);
      return groups;
    }, new Map<number, PrintableInvoicePayload["gstBreakdown"][number]>()).values()
  );

  const customerSnapshot = invoice.customerSnapshot || invoice.customer;
  const snapshotBillingDetails =
    (invoice.customerSnapshot as any)?.billingDetails ||
    (invoice.customer as any)?.billingDetails;
  const resolvedCustomerName =
    snapshotBillingDetails?.billingName || customerSnapshot?.name || "";
  const resolvedCustomerPhone =
    snapshotBillingDetails?.billingPhone || customerSnapshot?.phone || "";
  const customerAddress =
    sanitizeLegacySelectText(snapshotBillingDetails?.billingAddress) ||
    formatIndianAddress((invoice.customerSnapshot as any)?.billingAddress) ||
    formatIndianAddress((invoice.customerSnapshot as any)?.address) ||
    formatAddress(invoice.customer?.address);
  const resolvedGstin =
    snapshotBillingDetails?.gstin || (invoice.customerSnapshot as any)?.gstin;
  const destinationAddress =
    (invoice.customerSnapshot as any)?.shippingAddress ||
    (invoice.customerSnapshot as any)?.billingAddress;
  const destinationState = formatInvoiceState(destinationAddress?.state);

  return {
    meta: {
      invoiceNo: invoice.invoiceNo,
      orderNo: invoice.orderNo || invoice.orderId,
      quotationNo: (invoice as any).quotationNo,
      invoiceDate,
      isVas: isVasInvoice,
      salesPerson: invoice.salesPerson,
    },
    customer: {
      name: resolvedCustomerName,
      phone: resolvedCustomerPhone,
      address: customerAddress,
      gstin: resolvedGstin,
      state: destinationState,
      pincode: destinationAddress?.pincode,
      placeOfSupply: destinationState,
      taxMode: taxJurisdiction.mode,
      billingDetails: snapshotBillingDetails,
    },
    seller: {
      ...resolvedSeller,
      companyName: isVasInvoice
        ? resolvedSeller.companyName
        : normalizeCompanyFinancialYear(
            resolvedSeller.companyName,
            invoiceDate
          ),
    },
    items: printableItems,
    totals,
    gstBreakdown,
  };
};
