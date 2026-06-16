"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { AlertTriangle, Eye, Printer, ReceiptText } from "lucide-react";
import { Invoice, PrintableInvoicePayload, Quotation } from "@/lib/types";
import {
  getInvoicesForDeal,
  getQuotationsForDeal,
} from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { buildPrintablePayloadFromInvoice } from "@/lib/invoice-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { PrintableInvoice } from "@/components/features/invoice/PrintableInvoice";

type InvoicesTabProps = {
  customerId: string;
  dealId: string;
};

type ComparisonLine = {
  key: string;
  label: string;
  quotationQty: number;
  invoiceQty: number;
  quotationValue: number;
  invoiceValue: number;
};

type InvoiceComparison = {
  quotation: Quotation | null;
  quotationAmount: number;
  selectedInvoiceAmount: number;
  otherInvoicesAmount: number;
  totalInvoicedAmount: number;
  variance: number;
  lines: ComparisonLine[];
};

type DiscrepancyLine = ComparisonLine & {
  quantityDifference: number;
  valueDifference: number;
  reason: string;
};

type OrderDiscrepancy = {
  key: string;
  quotationNo: string;
  orderNo: string;
  invoiceNumbers: string[];
  quotationAmount: number;
  invoiceAmount: number;
  difference: number;
  reason: string;
  lines: DiscrepancyLine[];
  invoices: Invoice[];
};

type ValueBreakdown = {
  goods: number;
  vas: number;
  total: number;
};

const asNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeReference = (value: unknown): string =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^MOTRACK-/, "");

const normalizeLineKey = (value: unknown): string =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^VAS-/, "")
    .replace(/[^A-Z0-9]/g, "");

const formatCurrency = (value: number): string =>
  `INR ${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const quotationAmount = (quotation: Quotation | null): number => {
  return quotationValueBreakdown(quotation).total;
};

const invoiceLineRows = (invoice: Invoice): any[] => {
  if (Array.isArray(invoice.items) && invoice.items.length > 0) {
    return invoice.items;
  }
  return [
    ...(invoice.sections?.NORMAL?.items || []),
    ...(invoice.sections?.VAS?.items || []),
  ];
};

const invoiceLineValue = (item: any): number => {
  const stored = Number(item.totalAmount ?? item.total);
  if (Number.isFinite(stored)) return stored;
  const quantity = asNumber(item.qty ?? item.quantity ?? item.quantityAllocated);
  const rate = asNumber(item.exclusiveRate ?? item.rate);
  const gross = quantity * rate;
  const taxable = Math.max(
    0,
    asNumber(item.taxableAmount) ||
      gross - gross * (asNumber(item.discountPercent ?? item.discount) / 100)
  );
  const storedTax = Number(item.gstAmount);
  const tax = Number.isFinite(storedTax)
    ? storedTax
    : taxable * (asNumber(item.gst ?? item.gstPercent) / 100);
  return taxable + tax;
};

const quotationLineValue = (item: any): number => {
  const stored = Number(item.totalAmount);
  if (Number.isFinite(stored)) return stored;
  const quantity = asNumber(item.quantity ?? item.qty);
  const gstPercent = asNumber(item.gstPercent ?? item.gst);
  const rawRate = asNumber(item.rate);
  const exclusiveRate =
    Number.isFinite(Number(item.exclusiveRate)) && Number(item.exclusiveRate) > 0
      ? Number(item.exclusiveRate)
      : item.gstMode === "INCL" && gstPercent > 0
      ? rawRate / (1 + gstPercent / 100)
      : rawRate;
  const gross = quantity * exclusiveRate;
  const taxable = Math.max(
    0,
    gross - gross * (asNumber(item.discountPercent ?? item.discount) / 100)
  );
  return taxable * (1 + gstPercent / 100);
};

const quotationValueBreakdown = (
  quotation: Quotation | null
): ValueBreakdown => {
  if (!quotation) return { goods: 0, vas: 0, total: 0 };
  let goods = roundMoney(
    (quotation.items || []).reduce(
      (total, item) => total + quotationLineValue(item),
      0
    )
  );
  let vas = roundMoney(
    (quotation.vasDetails || []).reduce(
      (total, item) => total + quotationLineValue(item),
      0
    )
  );
  const total = roundMoney(goods + vas);
  return { goods, vas, total };
};

const invoiceBelongsToOrder = (invoice: Invoice, selectedInvoice: Invoice): boolean => {
  const selectedReferences = new Set(
    [selectedInvoice.orderId, selectedInvoice.orderNo]
      .map(normalizeReference)
      .filter(Boolean)
  );
  return [invoice.orderId, invoice.orderNo]
    .map(normalizeReference)
    .some((reference) => reference && selectedReferences.has(reference));
};

const findQuotationForInvoice = (
  invoice: Invoice,
  quotations: Quotation[]
): Quotation | null => {
  const invoiceReferences = new Set(
    [
      invoice.orderId,
      invoice.orderNo,
      (invoice as any).quotationNo,
      (invoice as any).quotationId,
    ]
      .map(normalizeReference)
      .filter(Boolean)
  );

  return (
    quotations.find((quotation) => {
      const quotationReferences = [
        quotation.id,
        quotation.quotationNo,
        quotation.orderNo,
      ]
        .map(normalizeReference)
        .filter(Boolean);
      return quotationReferences.some((reference) =>
        invoiceReferences.has(reference)
      );
    }) || null
  );
};

const quotationMatchesInvoice = (
  quotation: Quotation,
  invoice: Invoice
): boolean => findQuotationForInvoice(invoice, [quotation])?.id === quotation.id;

const buildComparisonLines = (
  quotation: Quotation | null,
  orderInvoices: Invoice[]
): ComparisonLine[] => {
  const rows = new Map<string, ComparisonLine>();

  const addQuotationLine = (item: any, fallbackKey: string) => {
    const label = String(
      item.salesDescription ||
        item.vasName ||
        item.collectionBrand ||
        item.serialNo ||
        fallbackKey
    ).trim();
    const key =
      normalizeLineKey(
        item.bcn ||
          item.collectionBrand ||
          item.vasName ||
          item.serialNo ||
          label
      ) ||
      fallbackKey;
    const existing = rows.get(key) || {
      key,
      label,
      quotationQty: 0,
      invoiceQty: 0,
      quotationValue: 0,
      invoiceValue: 0,
    };
    existing.quotationQty += asNumber(item.quantity ?? item.qty);
    existing.quotationValue += quotationLineValue(item);
    rows.set(key, existing);
  };

  (quotation?.items || []).forEach((item, index) =>
    addQuotationLine(item, `QUOTE-GOODS-${index + 1}`)
  );
  (quotation?.vasDetails || []).forEach((item, index) =>
    addQuotationLine(item, `QUOTE-VAS-${index + 1}`)
  );

  orderInvoices.forEach((invoice) => {
    invoiceLineRows(invoice).forEach((item, index) => {
      const label = String(
        item.description || item.itemName || item.name || item.bcn || `Invoice line ${index + 1}`
      ).trim();
      const key =
        normalizeLineKey(item.bcn || item.serialNo || label) ||
        `INVOICE-${invoice.id}-${index + 1}`;
      const existing = rows.get(key) || {
        key,
        label,
        quotationQty: 0,
        invoiceQty: 0,
        quotationValue: 0,
        invoiceValue: 0,
      };
      existing.invoiceQty += asNumber(
        item.qty ?? item.quantity ?? item.quantityAllocated
      );
      existing.invoiceValue += invoiceLineValue(item);
      rows.set(key, existing);
    });
  });

  return Array.from(rows.values()).sort((left, right) =>
    left.label.localeCompare(right.label)
  );
};

const explainLineDifference = (line: ComparisonLine): string => {
  const quantityDifference = roundMoney(line.invoiceQty - line.quotationQty);
  const valueDifference = roundMoney(line.invoiceValue - line.quotationValue);
  if (line.quotationQty <= 0 && line.invoiceQty > 0) {
    return "Extra product in invoice";
  }
  if (line.quotationQty > 0 && line.invoiceQty <= 0) {
    return "Product missing from invoice";
  }
  if (Math.abs(quantityDifference) > 0.001) {
    return quantityDifference > 0
      ? "Invoice quantity is higher"
      : "Invoice quantity is lower";
  }
  if (Math.abs(valueDifference) > 1) {
    return valueDifference > 0
      ? "Rate, discount, or GST is higher in invoice"
      : "Rate, discount, or GST is lower in invoice";
  }
  return "Rounding difference";
};

const toDiscrepancyLines = (lines: ComparisonLine[]): DiscrepancyLine[] =>
  lines
    .map((line) => ({
      ...line,
      quantityDifference: roundMoney(line.invoiceQty - line.quotationQty),
      valueDifference: roundMoney(line.invoiceValue - line.quotationValue),
      reason: explainLineDifference(line),
    }))
    .filter(
      (line) =>
        Math.abs(line.quantityDifference) > 0.001 ||
        Math.abs(line.valueDifference) > 1
    )
    .sort(
      (left, right) =>
        Math.abs(right.valueDifference) - Math.abs(left.valueDifference)
    );

const invoiceAmount = (invoice: Invoice): number =>
  Number(
    invoice.totals?.grandTotal ??
      invoice.overallSummary?.grandTotal ??
      0
  ) || 0;

const invoiceValueBreakdown = (invoice: Invoice): ValueBreakdown => {
  const total = roundMoney(invoiceAmount(invoice));
  const type = String(
    invoice.invoiceType || (invoice.isVas ? "VAS" : "NORMAL")
  ).toUpperCase();
  if (type === "VAS") return { goods: 0, vas: total, total };
  if (type !== "MIXED") return { goods: total, vas: 0, total };

  const normalRows = invoice.sections?.NORMAL?.items || [];
  const vasRows = invoice.sections?.VAS?.items || [];
  let goods = roundMoney(
    asNumber(invoice.sections?.NORMAL?.summary?.grandTotal) ||
      normalRows.reduce((sum, item) => sum + invoiceLineValue(item), 0)
  );
  const vas = roundMoney(
    asNumber(invoice.sections?.VAS?.summary?.grandTotal) ||
      vasRows.reduce((sum, item) => sum + invoiceLineValue(item), 0)
  );

  goods = roundMoney(goods + (total - goods - vas));
  return { goods, vas, total };
};

const invoiceDate = (invoice: Invoice): Date | null => {
  const value = invoice.invoiceDate || invoice.createdAt;
  if (!value) return null;
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const invoiceType = (invoice: Invoice): string => {
  const type = invoice.invoiceType || (invoice.isVas ? "VAS" : "NORMAL");
  if (type === "VAS") return "VAS";
  if (type === "MIXED") return "Mixed";
  return "Goods";
};

export default function InvoicesTab({
  customerId,
  dealId,
}: InvoicesTabProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [viewPayload, setViewPayload] =
    useState<PrintableInvoicePayload | null>(null);
  const [comparison, setComparison] = useState<InvoiceComparison | null>(null);
  const { toast } = useToast();
  const activeInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          invoice.status !== "CANCELLED" && invoice.status !== "VOID"
      ),
    [invoices]
  );
  const invoiceTotals = activeInvoices.reduce<ValueBreakdown>(
    (totals, invoice) => {
      const value = invoiceValueBreakdown(invoice);
      return {
        goods: totals.goods + value.goods,
        vas: totals.vas + value.vas,
        total: totals.total + value.total,
      };
    },
    { goods: 0, vas: 0, total: 0 }
  );
  invoiceTotals.goods = roundMoney(invoiceTotals.goods);
  invoiceTotals.vas = roundMoney(invoiceTotals.vas);
  invoiceTotals.total = roundMoney(invoiceTotals.total);
  const totalInvoiceValue = invoiceTotals.total;
  const convertedQuotations = useMemo(
    () =>
      quotations.filter(
        (quotation) => quotation.status === "Converted to Order"
      ),
    [quotations]
  );
  const convertedTotals = convertedQuotations.reduce<ValueBreakdown>(
    (totals, quotation) => {
      const value = quotationValueBreakdown(quotation);
      return {
        goods: totals.goods + value.goods,
        vas: totals.vas + value.vas,
        total: totals.total + value.total,
      };
    },
    { goods: 0, vas: 0, total: 0 }
  );
  convertedTotals.goods = roundMoney(convertedTotals.goods);
  convertedTotals.vas = roundMoney(convertedTotals.vas);
  convertedTotals.total = roundMoney(convertedTotals.total);
  const totalConvertedOrderValue = convertedTotals.total;
  const overallDifference = roundMoney(
    totalInvoiceValue - totalConvertedOrderValue
  );

  const discrepancies = useMemo<OrderDiscrepancy[]>(() => {
    const results: OrderDiscrepancy[] = [];
    const matchedInvoiceIds = new Set<string>();

    convertedQuotations.forEach((quotation) => {
      const linkedInvoices = activeInvoices.filter((invoice) =>
        quotationMatchesInvoice(quotation, invoice)
      );
      linkedInvoices.forEach((invoice) => matchedInvoiceIds.add(invoice.id));

      const quotedTotal = quotationAmount(quotation);
      const invoicedTotal = linkedInvoices.reduce(
        (total, invoice) => total + invoiceAmount(invoice),
        0
      );
      const difference = roundMoney(invoicedTotal - quotedTotal);
      const lines = toDiscrepancyLines(
        buildComparisonLines(quotation, linkedInvoices)
      );

      if (Math.abs(difference) <= 1 && lines.length === 0) return;

      results.push({
        key: `quotation-${quotation.id}`,
        quotationNo: quotation.quotationNo || quotation.id,
        orderNo:
          quotation.orderNo ||
          linkedInvoices[0]?.orderId ||
          linkedInvoices[0]?.orderNo ||
          `MOTRACK-${quotation.quotationNo}`,
        invoiceNumbers: linkedInvoices.map(
          (invoice) => invoice.invoiceNo || invoice.id
        ),
        quotationAmount: quotedTotal,
        invoiceAmount: invoicedTotal,
        difference,
        reason:
          linkedInvoices.length === 0
            ? "Converted quotation has no generated invoice"
            : lines.length > 0
            ? "Product quantity or value differs"
            : "Invoice total differs due to rounding or stored total",
        lines,
        invoices: linkedInvoices,
      });
    });

    activeInvoices
      .filter((invoice) => !matchedInvoiceIds.has(invoice.id))
      .forEach((invoice) => {
        const lines = invoiceLineRows(invoice).map((item, index) => {
          const label = String(
            item.description ||
              item.itemName ||
              item.name ||
              item.bcn ||
              `Invoice line ${index + 1}`
          ).trim();
          const invoiceQty = asNumber(
            item.qty ?? item.quantity ?? item.quantityAllocated
          );
          const invoiceValue = invoiceLineValue(item);
          return {
            key: `unmatched-${invoice.id}-${index}`,
            label,
            quotationQty: 0,
            invoiceQty,
            quotationValue: 0,
            invoiceValue,
            quantityDifference: invoiceQty,
            valueDifference: invoiceValue,
            reason: "Invoice product has no converted quotation match",
          };
        });

        results.push({
          key: `invoice-${invoice.id}`,
          quotationNo: String((invoice as any).quotationNo || "Not linked"),
          orderNo: invoice.orderId || invoice.orderNo || "-",
          invoiceNumbers: [invoice.invoiceNo || invoice.id],
          quotationAmount: 0,
          invoiceAmount: invoiceAmount(invoice),
          difference: roundMoney(invoiceAmount(invoice)),
          reason: "Invoice order is not linked to a converted quotation",
          lines,
          invoices: [invoice],
        });
      });

    return results.sort(
      (left, right) =>
        Math.abs(right.difference) - Math.abs(left.difference)
    );
  }, [activeInvoices, convertedQuotations]);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const [invoiceData, quotationData] = await Promise.all([
        getInvoicesForDeal(customerId, dealId),
        getQuotationsForDeal(customerId, dealId),
      ]);
      setInvoices(invoiceData);
      setQuotations(quotationData);
    } catch (error) {
      console.error("Could not load deal invoices:", error);
      toast({
        variant: "destructive",
        title: "Invoice loading failed",
        description: "Could not load generated invoices for this deal.",
      });
    } finally {
      setLoading(false);
    }
  }, [customerId, dealId, toast]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const handleViewInvoice = (invoice: Invoice) => {
    try {
      const matchingQuotation = findQuotationForInvoice(invoice, quotations);
      const orderInvoices = invoices.filter(
        (entry) =>
          invoiceBelongsToOrder(entry, invoice) &&
          entry.status !== "CANCELLED" &&
          entry.status !== "VOID"
      );
      const selectedAmount = invoiceAmount(invoice);
      const totalInvoicedAmount = orderInvoices.reduce(
        (total, entry) => total + invoiceAmount(entry),
        0
      );
      const otherInvoicesAmount = orderInvoices
        .filter((entry) => entry.id !== invoice.id)
        .reduce((total, entry) => total + invoiceAmount(entry), 0);
      const convertedAmount = quotationAmount(matchingQuotation);
      setSelectedInvoice(invoice);
      setViewPayload(buildPrintablePayloadFromInvoice(invoice));
      setComparison({
        quotation: matchingQuotation,
        quotationAmount: convertedAmount,
        selectedInvoiceAmount: selectedAmount,
        otherInvoicesAmount,
        totalInvoicedAmount,
        variance: matchingQuotation
          ? roundMoney(totalInvoicedAmount - convertedAmount)
          : 0,
        lines: buildComparisonLines(matchingQuotation, orderInvoices),
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Invoice preview failed",
        description: error?.message || "Could not build invoice details.",
      });
    }
  };

  const handlePrint = () => {
    const printContent = document.getElementById("crm-printable-invoice-view");
    if (!printContent) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const styles = Array.from(
      document.head.querySelectorAll('style, link[rel="stylesheet"]')
    )
      .map((element) => element.outerHTML)
      .join("");
    printWindow.document.write(
      `<html><head><title>Invoice Comparison ${selectedInvoice?.invoiceNo || ""}</title>${styles}<style>body{background:#fff;padding:20px}.print-comparison{break-inside:avoid;margin-bottom:24px}@media print{body{padding:0}.no-print{display:none!important}}</style></head><body>`
    );
    printWindow.document.write(printContent.innerHTML);
    printWindow.document.write("</body></html>");
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Generated Invoices</CardTitle>
      </CardHeader>
      <CardContent>
        {invoices.length > 0 ? (
          <>
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-700" />
                    <h3 className="font-semibold">Invoice Difference Analysis</h3>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Product and order-level comparison against converted quotations.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-right md:grid-cols-4 xl:grid-cols-7">
                  <div>
                    <p className="text-xs text-muted-foreground">Converted Goods</p>
                    <p className="font-semibold">
                      {formatCurrency(convertedTotals.goods)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Converted VAS</p>
                    <p className="font-semibold">{formatCurrency(convertedTotals.vas)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Invoice Goods</p>
                    <p className="font-semibold">{formatCurrency(invoiceTotals.goods)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Invoice VAS</p>
                    <p className="font-semibold">{formatCurrency(invoiceTotals.vas)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Converted</p>
                    <p className="font-semibold">{formatCurrency(totalConvertedOrderValue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Invoice</p>
                    <p className="font-semibold">{formatCurrency(totalInvoiceValue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Difference</p>
                    <p
                      className={
                        Math.abs(overallDifference) <= 1
                          ? "font-bold text-emerald-700"
                          : "font-bold text-red-700"
                      }
                    >
                      {formatCurrency(overallDifference)}
                    </p>
                  </div>
                </div>
              </div>

              {discrepancies.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {discrepancies.map((entry) => (
                    <div key={entry.key} className="rounded-md border bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            Quotation: {entry.quotationNo} | Order: {entry.orderNo}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Invoice:{" "}
                            {entry.invoiceNumbers.length > 0
                              ? entry.invoiceNumbers.join(", ")
                              : "Not generated"}
                          </p>
                          <p className="mt-1 text-sm text-amber-800">{entry.reason}</p>
                        </div>
                        <div className="text-right text-sm">
                          <p>
                            Quote {formatCurrency(entry.quotationAmount)} | Invoice{" "}
                            {formatCurrency(entry.invoiceAmount)}
                          </p>
                          <p
                            className={
                              Math.abs(entry.difference) <= 1
                                ? "font-semibold text-emerald-700"
                                : "font-semibold text-red-700"
                            }
                          >
                            Difference {formatCurrency(entry.difference)}
                          </p>
                          {entry.invoices[0] ? (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto px-0"
                              onClick={() => handleViewInvoice(entry.invoices[0])}
                            >
                              View / Print full comparison
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {entry.lines.length > 0 ? (
                        <div className="mt-3 overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Product Causing Difference</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead className="text-right">Quote Qty</TableHead>
                                <TableHead className="text-right">Invoice Qty</TableHead>
                                <TableHead className="text-right">Value Difference</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {entry.lines.map((line) => (
                                <TableRow key={line.key}>
                                  <TableCell className="font-medium">
                                    {line.label}
                                  </TableCell>
                                  <TableCell>{line.reason}</TableCell>
                                  <TableCell className="text-right">
                                    {line.quotationQty.toLocaleString("en-IN")}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {line.invoiceQty.toLocaleString("en-IN")}
                                  </TableCell>
                                  <TableCell
                                    className={
                                      Math.abs(line.valueDifference) <= 1
                                        ? "text-right"
                                        : "text-right font-semibold text-red-700"
                                    }
                                  >
                                    {formatCurrency(line.valueDifference)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  All converted quotations match their invoice totals and product lines.
                </p>
              )}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-28 text-right">View / Print</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice, index) => {
                    const date = invoiceDate(invoice);
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {invoice.invoiceNo || invoice.id}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/dashboard/orders/${invoice.orderId}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {invoice.orderId}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{invoiceType(invoice)}</Badge>
                        </TableCell>
                        <TableCell>
                          {date ? format(date, "dd/MM/yyyy") : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              invoice.status === "CANCELLED" ||
                              invoice.status === "VOID"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {invoice.status || "ISSUED"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ₹{invoiceAmount(invoice).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewInvoice(invoice)}
                            aria-label={`View invoice ${invoice.invoiceNo || invoice.id}`}
                            title="View invoice details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewInvoice(invoice)}
                            aria-label={`Compare and print invoice ${invoice.invoiceNo || invoice.id}`}
                            title="Compare quotation and print"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 md:hidden">
              {invoices.map((invoice) => {
                const date = invoiceDate(invoice);
                return (
                  <Card key={invoice.id}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            Invoice {invoice.invoiceNo || invoice.id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {date ? format(date, "dd/MM/yyyy") : "-"}
                          </p>
                        </div>
                        <Badge variant="outline">{invoiceType(invoice)}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-muted-foreground">Order ID</span>
                        <Link
                          href={`/dashboard/orders/${invoice.orderId}`}
                          className="text-right font-semibold text-primary hover:underline"
                        >
                          {invoice.orderId}
                        </Link>
                        <span className="text-muted-foreground">Status</span>
                        <span className="text-right">
                          {invoice.status || "ISSUED"}
                        </span>
                        <span className="text-muted-foreground">Amount</span>
                        <span className="text-right font-semibold">
                          ₹{invoiceAmount(invoice).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleViewInvoice(invoice)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Invoice Details
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleViewInvoice(invoice)}
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        Compare / Print
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end border-t pt-4">
              <div className="min-w-[340px] rounded-lg bg-muted/40 px-5 py-4">
                <div className="flex items-center justify-between gap-6 text-sm">
                  <span className="text-muted-foreground">Total Goods Value</span>
                  <span className="font-semibold">
                    {formatCurrency(invoiceTotals.goods)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-6 text-sm">
                  <span className="text-muted-foreground">Total VAS Value</span>
                  <span className="font-semibold">
                    {formatCurrency(invoiceTotals.vas)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-6 border-t pt-3">
                  <span className="font-medium">Total Invoice Value</span>
                  <span className="text-2xl font-bold">
                    {formatCurrency(totalInvoiceValue)}
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="py-10 text-center text-muted-foreground">
            <ReceiptText className="mx-auto mb-3 h-12 w-12 opacity-50" />
            <p>No invoice has been generated for this deal yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
    <Dialog
      open={Boolean(selectedInvoice)}
      onOpenChange={(open) => {
        if (!open) {
          setSelectedInvoice(null);
          setViewPayload(null);
          setComparison(null);
        }
      }}
    >
      <DialogContent className="flex h-[90vh] max-w-7xl flex-col">
        <DialogHeader>
          <DialogTitle>Invoice Details</DialogTitle>
          <DialogDescription>
            Invoice #{selectedInvoice?.invoiceNo || selectedInvoice?.id} for Order ID{" "}
            {selectedInvoice?.orderId}
          </DialogDescription>
        </DialogHeader>
        <div
          id="crm-printable-invoice-view"
          className="flex-grow overflow-y-auto pr-4"
        >
          {comparison ? (
            <div className="print-comparison mb-6 rounded-lg border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
                <div>
                  <h2 className="text-xl font-bold">
                    Quotation vs Invoice Comparison
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Order {selectedInvoice?.orderId || selectedInvoice?.orderNo}
                    {comparison.quotation
                      ? ` | Quotation ${comparison.quotation.quotationNo}`
                      : " | Linked quotation not found"}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    !comparison.quotation
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : Math.abs(comparison.variance) <= 1
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : comparison.variance > 0
                      ? "border-red-300 bg-red-50 text-red-700"
                      : "border-amber-300 bg-amber-50 text-amber-700"
                  }
                >
                  {!comparison.quotation
                    ? "Quotation Not Found"
                    : Math.abs(comparison.variance) <= 1
                    ? "Matched / Rounding"
                    : comparison.variance > 0
                    ? "Over Invoiced"
                    : "Balance Remaining"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 py-4 md:grid-cols-5">
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Converted Quotation</p>
                  <p className="font-bold">{formatCurrency(comparison.quotationAmount)}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">This Invoice</p>
                  <p className="font-bold">{formatCurrency(comparison.selectedInvoiceAmount)}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Other Invoices</p>
                  <p className="font-bold">{formatCurrency(comparison.otherInvoicesAmount)}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Total Invoiced</p>
                  <p className="font-bold">{formatCurrency(comparison.totalInvoicedAmount)}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Difference</p>
                  <p
                    className={
                      !comparison.quotation
                        ? "font-bold text-muted-foreground"
                        : Math.abs(comparison.variance) <= 1
                        ? "font-bold text-emerald-700"
                        : "font-bold text-red-700"
                    }
                  >
                    {comparison.quotation
                      ? formatCurrency(comparison.variance)
                      : "Not available"}
                  </p>
                </div>
              </div>

              {comparison.quotation ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Quote Qty</TableHead>
                        <TableHead className="text-right">Invoice Qty</TableHead>
                        <TableHead className="text-right">Quote Value</TableHead>
                        <TableHead className="text-right">Invoice Value</TableHead>
                        <TableHead className="text-right">Difference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparison.lines.map((line) => {
                        const difference =
                          line.invoiceValue - line.quotationValue;
                        return (
                          <TableRow key={line.key}>
                            <TableCell className="font-medium">{line.label}</TableCell>
                            <TableCell className="text-right">
                              {line.quotationQty.toLocaleString("en-IN")}
                            </TableCell>
                            <TableCell className="text-right">
                              {line.invoiceQty.toLocaleString("en-IN")}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(line.quotationValue)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(line.invoiceValue)}
                            </TableCell>
                            <TableCell
                              className={
                                Math.abs(difference) <= 1
                                  ? "text-right"
                                  : "text-right font-semibold text-red-700"
                              }
                            >
                              {formatCurrency(difference)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  The converted quotation could not be linked to this invoice. The invoice
                  can still be viewed and printed below.
                </p>
              )}
            </div>
          ) : null}
          <PrintableInvoice payload={viewPayload} />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSelectedInvoice(null);
              setViewPayload(null);
              setComparison(null);
            }}
          >
            Close
          </Button>
          <Button type="button" variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print Comparison
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
