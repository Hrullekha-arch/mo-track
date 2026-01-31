import { Invoice, PrintableInvoicePayload } from "@/lib/types";

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
  const rate = num(item.rate);
  const taxableAmount = num(item.taxableAmount ?? rate * qty);
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
    discountPercent: num(item.discountPercent),
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
      acc.subTotal += num(item.rate) * num(item.quantity);
      acc.taxableValue += num(item.taxableAmount);
      acc.cgst += num(item.cgst);
      acc.sgst += num(item.sgst);
      acc.igst += num(item.igst);
      return acc;
    },
    { subTotal: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
  );
  const discount = Math.max(0, totals.subTotal - totals.taxableValue);
  const totalGst = totals.cgst + totals.sgst + totals.igst;
  const netAmount = totals.taxableValue + totalGst;
  const roundedTotal = Math.round(netAmount);

  return {
    subTotal: totals.subTotal,
    discount,
    taxableValue: totals.taxableValue,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    roundOff: roundedTotal - netAmount,
    grandTotal: roundedTotal,
    totalGst,
  };
};

export const buildPrintablePayloadFromInvoice = (invoice: Invoice): PrintableInvoicePayload => {
  const hasPrintableItems = Array.isArray(invoice.items) && invoice.items.length > 0;
  const resolveItemType = (item: any) => {
    if (String(item.type || "").toUpperCase() === "VAS") return "VAS";
    if (typeof item.bcn === "string" && item.bcn.toUpperCase().startsWith("VAS-")) return "VAS";
    return "NORMAL";
  };
  const printableItems = hasPrintableItems
    ? invoice.items.map((item) => mapLineItem(item, resolveItemType(item)))
    : buildItemsFromSections(invoice);

  const computedTotals = buildTotalsFromItems(printableItems);
  const storedTotals = invoice.totals || computedTotals;

  const totals = {
    ...computedTotals,
    ...storedTotals,
    discount: storedTotals.discount ?? storedTotals.totalDiscount ?? computedTotals.discount,
    totalGst: storedTotals.totalGst ?? computedTotals.totalGst,
  };

  const isVasInvoice = invoice.invoiceType === "VAS" || invoice.isVas === true;
  const fallbackSeller = {
    companyName: isVasInvoice ? "MO SPACES PVT.LTD." : "MO Designs Private Limited - (2024-2025)",
    address: "A-6, Sushant Lok-1, Gurgaon",
    gstin: "06AAMCM5012B1ZY",
  };

  const customerSnapshot = invoice.customerSnapshot || invoice.customer;
  const customerAddress = formatAddress((invoice.customerSnapshot as any)?.address) || formatAddress(invoice.customer?.address);

  return {
    meta: {
      invoiceNo: invoice.invoiceNo,
      orderNo: invoice.orderNo || invoice.orderId,
      quotationNo: (invoice as any).quotationNo,
      invoiceDate: invoice.invoiceDate || invoice.createdAt || new Date().toISOString(),
      isVas: isVasInvoice,
      salesPerson: invoice.salesPerson,
    },
    customer: {
      name: customerSnapshot?.name || "",
      phone: customerSnapshot?.phone || "",
      address: customerAddress,
      gstin: (invoice.customerSnapshot as any)?.gstin,
    },
    seller: {
      ...fallbackSeller,
      ...(invoice.sellerSnapshot || {}),
    },
    items: printableItems,
    totals,
    gstBreakdown: [],
  };
};
