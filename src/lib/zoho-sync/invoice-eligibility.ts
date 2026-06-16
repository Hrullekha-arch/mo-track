const asUpperText = (value: unknown) => String(value ?? "").trim().toUpperCase();

export const isVasInvoice = (invoice: any): boolean => {
  const invoiceType = asUpperText(invoice?.invoiceType);
  if (invoiceType === "VAS" || invoice?.isVas === true) return true;

  const normalItems = Array.isArray(invoice?.sections?.NORMAL?.items)
    ? invoice.sections.NORMAL.items
    : [];
  const vasItems = Array.isArray(invoice?.sections?.VAS?.items)
    ? invoice.sections.VAS.items
    : [];
  if (vasItems.length > 0 && normalItems.length === 0) return true;

  const items = Array.isArray(invoice?.items) ? invoice.items : [];
  return (
    items.length > 0 &&
    items.every((item: any) => asUpperText(item?.type || item?.itemType) === "VAS")
  );
};

export const canSyncInvoiceToZoho = (invoice: any): boolean => !isVasInvoice(invoice);
