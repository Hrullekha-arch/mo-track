"use client";

import * as React from "react";
import { collection, onSnapshot, query, orderBy, getDocs, doc, writeBatch, limit, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Invoice, Order } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintableInvoice } from "@/components/features/invoice/PrintableInvoice";
import { InvoiceLogTable } from "@/components/features/invoice/InvoiceLogTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, Printer } from "lucide-react";

const normalizeKey = (value?: string) =>
  String(value || "")
    .split(" - ")[0]
    .trim()
    .toLowerCase();

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const numOrUndefined = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const stripUndefinedDeep = (value: any): any => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    const cleaned = value
      .map((entry) => stripUndefinedDeep(entry))
      .filter((entry) => entry !== undefined);
    return cleaned;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
      .filter(([, entry]) => entry !== undefined);
    return Object.fromEntries(entries);
  }
  return value;
};

const resolveDiscountPercent = (order: Order, item: any) => {
  const direct = numOrUndefined(item?.discountPercent ?? item?.discount);
  if (direct !== undefined) return direct;

  const key = normalizeKey(item?.bcn || item?.description || item?.itemName);
  if (!key) return 0;

  const fabricDetails = (order as any)?.fabricDetails || [];
  const match = fabricDetails.find((entry: any) => normalizeKey(entry?.fabricName) === key);
  return numOrUndefined(match?.discountPercent) ?? 0;
};

const resolveExclusiveRateForInvoice = (item: any) => {
  const gst = num(item?.gst ?? item?.gstPercent);
  const gstMode = String(item?.gstMode ?? item?.gstType ?? "").toUpperCase();
  const rawRate = num(item?.rate);
  const rawExclusive = numOrUndefined(item?.exclusiveRate);

  if (gstMode === "INCL" && gst > 0) {
    const base = rawRate || rawExclusive || 0;
    return base ? base / (1 + gst / 100) : 0;
  }

  return rawExclusive ?? rawRate;
};

type InvoiceLineItem = {
  roomName?: string;
  type?: string;
  bcn?: string;
  description?: string;
  unit?: string;
  exclusiveRate?: number;
  rate?: number;
  qty?: number;
  discountPercent?: number;
  discountAmount?: number;
  gst?: number;
  hsn?: string;
  group?: string;
  taxableAmount?: number;
  gstAmount?: number;
  totalAmount?: number;
  allocationRef?: {
    lengthId?: string;
    stockItemId?: string;
  };
};

type InvoiceCandidate = {
  order: Order;
  normalItems: InvoiceLineItem[];
  vasItems: InvoiceLineItem[];
  normalSummary: { subTotal: number; gstTotal: number; grandTotal: number };
  vasSummary: { subTotal: number; gstTotal: number; grandTotal: number };
  overallSummary: { goodsTotal: number; vasTotal: number; grandTotal: number };
  taxSummary: {
    NORMAL: { cgst: number; sgst: number; igst: number };
    VAS: { cgst: number; sgst: number; igst: number };
  };
};

const summarizeItems = (items: InvoiceLineItem[]) =>
  items.reduce(
    (acc, item) => {
      acc.subTotal += num(item.taxableAmount);
      acc.gstTotal += num(item.gstAmount);
      acc.grandTotal += num(item.totalAmount);
      return acc;
    },
    { subTotal: 0, gstTotal: 0, grandTotal: 0 }
  );

const buildTaxSummary = (items: InvoiceLineItem[]) => {
  const totals = items.reduce(
    (acc, item) => {
      const gst = num(item.gstAmount);
      acc.cgst += gst / 2;
      acc.sgst += gst / 2;
      acc.igst += 0;
      return acc;
    },
    { cgst: 0, sgst: 0, igst: 0 }
  );
  return totals;
};

const sumQtyByKey = (
  items: Array<any>,
  getKey: (item: any) => string,
  getQty: (item: any) => number
) => {
  return items.reduce((map, item) => {
    const key = getKey(item);
    if (!key) return map;
    map.set(key, num(map.get(key)) + num(getQty(item)));
    return map;
  }, new Map<string, number>());
};

const computeInvoicingStatus = (order: Order, invoices: Invoice[]) => {
  const orderNormalItems = order.sections?.NORMAL?.items || [];
  const orderVasItems = order.sections?.VAS?.items || [];

  const orderedNormal = sumQtyByKey(
    orderNormalItems,
    (item) => normalizeKey(item.bcn || item.description || item.itemName),
    (item) => num(item.qty)
  );
  const orderedVas = sumQtyByKey(
    orderVasItems,
    (item) => normalizeKey(item.description || item.bcn || item.itemName),
    (item) => num(item.qty)
  );

  const invoicedNormal = new Map<string, number>();
  const invoicedVas = new Map<string, number>();

  invoices.forEach((invoice) => {
    const hasSections = (invoice.sections?.NORMAL?.items?.length || 0) > 0 || (invoice.sections?.VAS?.items?.length || 0) > 0;
    if (hasSections) {
      (invoice.sections?.NORMAL?.items || []).forEach((item: any) => {
        const key = normalizeKey(item.bcn || item.description || item.itemName);
        invoicedNormal.set(key, num(invoicedNormal.get(key)) + num(item.qty ?? item.quantity));
      });
      (invoice.sections?.VAS?.items || []).forEach((item: any) => {
        const key = normalizeKey(item.description || item.bcn || item.itemName);
        invoicedVas.set(key, num(invoicedVas.get(key)) + num(item.qty ?? item.quantity));
      });
      return;
    }

    const targetMap =
      invoice.invoiceType === "VAS" || invoice.isVas ? invoicedVas : invoicedNormal;
    (invoice.items || []).forEach((item: any) => {
      const key = normalizeKey(item.bcn || item.name || item.itemName || item.description);
      targetMap.set(key, num(targetMap.get(key)) + num(item.quantity ?? item.quantityAllocated));
    });
  });

  const hasInvoices = invoices.length > 0;
  if (!hasInvoices) return "NOT_INVOICED";

  const goodsRemaining = [...orderedNormal.entries()].some(
    ([key, qty]) => num(invoicedNormal.get(key)) < qty
  );
  const vasRemaining = [...orderedVas.entries()].some(
    ([key, qty]) => num(invoicedVas.get(key)) < qty
  );

  return goodsRemaining || vasRemaining ? "PARTIALLY_INVOICED" : "INVOICED";
};

const buildInvoiceCandidates = (orders: Order[], invoices: Invoice[]): InvoiceCandidate[] => {
  const invoicesByOrder = invoices.reduce((acc, invoice) => {
    const key = invoice.orderId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(invoice);
    return acc;
  }, {} as Record<string, Invoice[]>);

  return orders
    .map((order) => {
      const orderInvoices = invoicesByOrder[order.id] || [];
      const invoicedQtyByBcn = new Map<string, number>();
      const invoicedQtyByLength = new Map<string, number>();
      let vasAlreadyInvoiced = false;

      orderInvoices.forEach((invoice) => {
        const normalItems = invoice.sections?.NORMAL?.items || invoice.items || [];
        normalItems.forEach((item: any) => {
          const key = normalizeKey(item.bcn || item.description);
          const qty = num(item.qty ?? item.quantity);
          if (key) {
            invoicedQtyByBcn.set(key, num(invoicedQtyByBcn.get(key)) + qty);
          }
          const lengthId = item.allocationRef?.lengthId;
          if (lengthId) {
            invoicedQtyByLength.set(lengthId, num(invoicedQtyByLength.get(lengthId)) + qty);
          }
        });
        if ((invoice.sections?.VAS?.items || []).length > 0) {
          vasAlreadyInvoiced = true;
        }
      });

      const normalItemsRaw = order.sections?.NORMAL?.items || [];
      const normalInvoiceItems: InvoiceLineItem[] = [];
      console.log("normalItemsRaw:", normalItemsRaw);

      normalItemsRaw.forEach((item: any) => {
        const bcnKey = normalizeKey(item.bcn || item.description || item.itemName);
        if (!bcnKey) return;
        const allocatedLengths = item.allocation?.lengths || [];
        const allocatedLots = item.allocation?.lots || [];
        const allocatedTotal = [...allocatedLengths, ...allocatedLots].reduce(
          (sum: number, entry: any) => sum + num(entry.allocatedQty),
          0
        );
        const alreadyInvoiced = num(invoicedQtyByBcn.get(bcnKey));
        let remaining = Math.max(0, allocatedTotal - alreadyInvoiced);
        if (remaining <= 0) return;

        const exclusiveRate = item.exclusiveRate ?? resolveExclusiveRateForInvoice(item);
        const rate = exclusiveRate;
        const gst = num(item.gst);
        const unit = item.unit || "MTR";
        const discountPercent = resolveDiscountPercent(order, item);

        if (allocatedLengths.length > 0) {
          for (const length of allocatedLengths) {
            if (remaining <= 0) break;
            const lengthAllocated = num(length.allocatedQty);
            const lengthInvoiced = num(invoicedQtyByLength.get(length.lengthId));
            const lengthRemaining = Math.max(0, lengthAllocated - lengthInvoiced);
            if (lengthRemaining <= 0) continue;

            const qty = Math.min(remaining, lengthRemaining);
            const baseAmount = rate * qty;
            const discountAmount = baseAmount * (discountPercent / 100);
            const taxableAmount = Math.max(0, baseAmount - discountAmount);
            const gstAmount = taxableAmount * (gst / 100);
            normalInvoiceItems.push({
              roomName: item.roomName,
              type: item.type,
              bcn: item.bcn,
              description: item.description,
              unit,
              exclusiveRate,
              rate,
              qty,
              gst,
              discountPercent,
              discountAmount,
              hsn: item.hsn,
              group: item.group,
              taxableAmount,
              gstAmount,
              totalAmount: taxableAmount + gstAmount,
              allocationRef: {
                lengthId: length.lengthId,
                stockItemId: length.stockItemId || item.bcn,
              },
            });
            remaining -= qty;
          }
        }

        if (remaining > 0 && allocatedLengths.length === 0) {
          const qty = remaining;
          const baseAmount = rate * qty;
          const discountAmount = baseAmount * (discountPercent / 100);
          const taxableAmount = Math.max(0, baseAmount - discountAmount);
          const gstAmount = taxableAmount * (gst / 100);
          normalInvoiceItems.push({
            roomName: item.roomName,
            type: item.type,
            bcn: item.bcn,
            description: item.description,
            unit,
            exclusiveRate,
            rate,
            qty,
            gst,
            discountPercent,
            discountAmount,
            hsn: item.hsn,
            group: item.group,
            taxableAmount,
            gstAmount,
            totalAmount: taxableAmount + gstAmount,
          });
        }
      });

      const vasItemsRaw = order.sections?.VAS?.items || [];
      const vasInvoiceItems: InvoiceLineItem[] = [];
      console.log("vasItemsRaw:", vasItemsRaw);
      if (!vasAlreadyInvoiced && vasItemsRaw.length > 0) {
        vasItemsRaw.forEach((item: any) => {
          const qty = num(item.qty);
          const exclusiveRate = item.exclusiveRate ?? resolveExclusiveRateForInvoice(item);
          const rate = exclusiveRate;
          const gst = num(item.gst);
          const discountPercent = resolveDiscountPercent(order, item);
          const baseAmount = rate * qty;
          const discountAmount = baseAmount * (discountPercent / 100);
          const taxableAmount = Math.max(0, baseAmount - discountAmount);
          const gstAmount = taxableAmount * (gst / 100);
          vasInvoiceItems.push({
            roomName: item.roomName,
            type: "VAS",
            description: item.description,
            unit: item.unit || "PCS",
            exclusiveRate,
            rate,
            qty,
            gst,
            discountPercent,
            discountAmount,
            hsn: item.hsn,
            group: item.group,
            taxableAmount,
            gstAmount,
            totalAmount: taxableAmount + gstAmount,
          });
        });
      }

      if (normalInvoiceItems.length === 0 && vasInvoiceItems.length === 0) return null;

      const normalSummary = summarizeItems(normalInvoiceItems);
      const vasSummary = summarizeItems(vasInvoiceItems);
      const overallSummary = {
        goodsTotal: normalSummary.grandTotal,
        vasTotal: vasSummary.grandTotal,
        grandTotal: normalSummary.grandTotal + vasSummary.grandTotal,
      };

      return {
        order,
        normalItems: normalInvoiceItems,
        vasItems: vasInvoiceItems,
        normalSummary,
        vasSummary,
        overallSummary,
        taxSummary: {
          NORMAL: buildTaxSummary(normalInvoiceItems),
          VAS: buildTaxSummary(vasInvoiceItems),
        },
      } as InvoiceCandidate;
    })
    .filter(Boolean) as InvoiceCandidate[];
};

const createSectionCandidate = (
  candidate: InvoiceCandidate,
  section: "NORMAL" | "VAS"
) => {
  const normalItems = section === "NORMAL" ? candidate.normalItems : [];
  const vasItems = section === "VAS" ? candidate.vasItems : [];
  if (section === "NORMAL" && normalItems.length === 0) return null;
  if (section === "VAS" && vasItems.length === 0) return null;

  const normalSummary = summarizeItems(normalItems);
  const vasSummary = summarizeItems(vasItems);
  const overallSummary = {
    goodsTotal: normalSummary.grandTotal,
    vasTotal: vasSummary.grandTotal,
    grandTotal: normalSummary.grandTotal + vasSummary.grandTotal,
  };

  return {
    ...candidate,
    normalItems,
    vasItems,
    normalSummary,
    vasSummary,
    overallSummary,
    taxSummary: {
      NORMAL: buildTaxSummary(normalItems),
      VAS: buildTaxSummary(vasItems),
    },
  } as InvoiceCandidate;
};

const buildPrintablePayload = (candidate: InvoiceCandidate, invoiceNo?: string) => {
  const { order, normalItems, vasItems, overallSummary } = candidate;
  console.log("candidate:" , candidate);
  const mergedItems = [...normalItems, ...vasItems].map((item) => {
    const gstAmount = num(item.gstAmount);
    const discountPercent = num(item.discountPercent);
    const rate = num(item.exclusiveRate ?? item.rate);
    const baseAmount = rate * num(item.qty);
    const discountAmount =
      numOrUndefined(item.discountAmount) ?? (baseAmount * (discountPercent / 100));
    return {
      name: item.description || item.bcn || "",
      bcn: item.bcn || (item.type === "VAS" ? `VAS-${item.description}` : ""),
      hsn: item.hsn || "",
      quantity: num(item.qty),
      uom: item.unit || "MTR",
      rate,
      exclusiveRate: numOrUndefined(item.exclusiveRate),
      discountPercent,
      taxableAmount: num(item.taxableAmount),
      cgst: gstAmount / 2,
      sgst: gstAmount / 2,
      igst: 0,
      total: num(item.totalAmount),
      discountAmount,
    };
  });

  const totals = mergedItems.reduce(
    (acc, item) => {
      const amount = item.rate * item.quantity;
      const discount =
        item.discountAmount !== undefined
          ? item.discountAmount
          : amount * (item.discountPercent / 100);
      acc.subTotal += amount;
      acc.discount += discount;
      acc.taxableValue += item.taxableAmount;
      acc.cgst += item.cgst;
      acc.sgst += item.sgst;
      acc.igst += item.igst;
      return acc;
    },
    { subTotal: 0, discount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
  );

  const netAmount = totals.taxableValue + totals.cgst + totals.sgst + totals.igst;
  const roundedTotal = Math.round(netAmount);

  return {
    meta: {
      invoiceNo: invoiceNo,
      orderNo: order.orderNo || order.id,
      quotationNo: order.quotationNo || order.crmOrderNo,
      invoiceDate: new Date().toISOString(),
      isVas: normalItems.length === 0 && vasItems.length > 0,
      salesPerson: order.salesPerson,
    },
    customer: {
      name: order.customerSnapshot?.name || order.customerName,
      phone: order.customerSnapshot?.phone || order.customerPhone,
      address: order.customerSnapshot?.billingAddress?.line1 || order.customerAddress,
      gstin: order.customerSnapshot?.gstin,
    },
    seller: {
      companyName: normalItems.length === 0 && vasItems.length > 0
        ? "MO SPACES PVT.LTD."
        : "MO Designs Private Limited - (2024-2025)",
      address: "A-6, Sushant Lok-1, Gurgaon",
      gstin: "06AAMCM5012B1ZY",
    },
    items: mergedItems,
    totals: {
      ...totals,
      roundOff: roundedTotal - netAmount,
      grandTotal: roundedTotal,
      totalGst: totals.cgst + totals.sgst + totals.igst,
    },
    gstBreakdown: [],
  };
};

function GenerateInvoiceDialog({
  candidate,
  invoices,
  onClose,
}: {
  candidate: InvoiceCandidate | null;
  invoices: Invoice[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = React.useState(false);

  if (!candidate) return null;

  const payload = buildPrintablePayload(candidate);

  const handleGenerate = async () => {
    if (!user) {
      toast({ variant: "destructive", title: "Error", description: "Login required." });
      return;
    }

    setIsGenerating(true);
    try {
      const batch = writeBatch(db);
      const order = candidate.order;

      const invoicesRef = collection(db, "invoices");
      const lastInvoiceSnap = await getDocs(query(invoicesRef, orderBy("invoiceNo", "desc"), limit(1)));
      let nextInvoiceNumber = 1001;
      if (!lastInvoiceSnap.empty) {
        const lastNo = parseInt(String(lastInvoiceSnap.docs[0].data().invoiceNo || ""), 10);
        if (!Number.isNaN(lastNo)) {
          nextInvoiceNumber = lastNo + 1;
        }
      }
      const invoiceNo = String(nextInvoiceNumber);
      const invoiceId = doc(collection(db, "invoices")).id;
      const now = new Date().toISOString();

      const invoiceType =
        candidate.normalItems.length > 0 && candidate.vasItems.length > 0
          ? "MIXED"
          : candidate.vasItems.length > 0
          ? "VAS"
          : "NORMAL";

      const invoiceDoc: Omit<Invoice, "id"> = {
        invoiceId,
        invoiceNo,
        invoiceType,
        invoiceDate: now,
        orderId: order.id,
        orderNo: order.orderNo || order.id,
        customerId: order.customerId,
        sellerSnapshot: payload.seller,
        customerSnapshot: payload.customer,
        sections: {
          NORMAL: {
            items: candidate.normalItems,
            summary: candidate.normalSummary,
          },
          VAS: {
            items: candidate.vasItems,
            summary: candidate.vasSummary,
          },
        },
        overallSummary: candidate.overallSummary,
        taxSummary: candidate.taxSummary,
        payment: {},
        status: "ISSUED",
        isLocked: true,
        createdAt: now,
        updatedAt: now,
        createdBy: user.displayName || "System",
        customer: {
          name: payload.customer.name,
          phone: payload.customer.phone,
          address: payload.customer.address,
        },
        salesPerson: payload.meta.salesPerson || "",
        items: payload.items,
        totals: payload.totals,
      };

      const invoiceRef = doc(db, "invoices", invoiceId);
      const cleanedInvoiceDoc = stripUndefinedDeep(invoiceDoc) as Omit<Invoice, "id">;
      batch.set(invoiceRef, cleanedInvoiceDoc);

      // Stock updates for NORMAL items
      candidate.normalItems.forEach((item) => {
        if (!item.bcn) return;
        const stockId = item.bcn.replace(/\//g, "-");
        const stockRef = doc(db, "stocks", stockId);
        const qty = num(item.qty);
        batch.update(stockRef, {
          reservedQty: increment(-qty),
          cutQty: increment(qty),
        });

        const lengthId = item.allocationRef?.lengthId;
        if (lengthId && !lengthId.startsWith("MIG-LEN-")) {
          const lengthRef = doc(db, "stocks", stockId, "lengths", lengthId);
          batch.update(lengthRef, {
            reservedQty: increment(-qty),
            cutQty: increment(qty),
          });
        }
      });

      // Update order invoicing summary
      const updatedInvoices = [
        ...(candidate.order.invoicing?.invoices || []),
        {
          invoiceId,
          invoiceNo,
          invoiceType,
          createdAt: now,
          amount: candidate.overallSummary.grandTotal,
        },
      ];

      const orderInvoices = invoices.filter((inv) => inv.orderId === candidate.order.id);
      const invoicesWithNew = [
        ...orderInvoices,
        { ...(invoiceDoc as Invoice), id: invoiceId },
      ];
      const invoicingStatus = computeInvoicingStatus(candidate.order, invoicesWithNew);

      const orderRef = doc(db, "orders", candidate.order.id);
      batch.update(orderRef, {
        invoicing: {
          ...(candidate.order.invoicing || {}),
          status: invoicingStatus,
          invoices: updatedInvoices,
          canCreateGoodsInvoice: (candidate.order.sections?.NORMAL?.items?.length || 0) > 0,
          canCreateVasInvoice: (candidate.order.sections?.VAS?.items?.length || 0) > 0,
        },
        updatedAt: now,
      });

      await batch.commit();

      toast({ title: "Invoice created", description: `Invoice ${invoiceNo} generated.` });
      onClose();
    } catch (error: any) {
      console.error("Invoice generation failed", error);
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to generate invoice." });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    const printContent = document.getElementById("printable-invoice-preview");
    if (!printContent) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write("<html><head><title>Print Invoice</title></head><body>");
    printWindow.document.write(printContent.innerHTML);
    printWindow.document.write("</body></html>");
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  return (
    <Dialog open={!!candidate} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Generate Invoice</DialogTitle>
          <DialogDescription>
            Review the items below. Only allocated items will be invoiced.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto pr-4" id="printable-invoice-preview">
          <PrintableInvoice payload={payload} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={handlePrint}><Printer className="mr-2 h-4 w-4" />Print</Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InvoicePage() {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedCandidate, setSelectedCandidate] = React.useState<InvoiceCandidate | null>(null);
  const [quickOrderNo, setQuickOrderNo] = React.useState("");
  const { toast } = useToast();

  React.useEffect(() => {
    const ordersQuery = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const invoicesQuery = query(collection(db, "invoices"), orderBy("createdAt", "desc"));

    const unsubOrders = onSnapshot(
      ordersQuery,
      (snapshot) => {
        setOrders(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Order)));
        setLoading(false);
      },
      () => {
        toast({ variant: "destructive", title: "Error", description: "Could not load orders." });
        setLoading(false);
      }
    );

    const unsubInvoices = onSnapshot(
      invoicesQuery,
      (snapshot) => {
        setInvoices(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Invoice)));
      },
      () => {
        toast({ variant: "destructive", title: "Error", description: "Could not load invoices." });
      }
    );

    return () => {
      unsubOrders();
      unsubInvoices();
    };
  }, [toast]);

  const candidates = React.useMemo(() => buildInvoiceCandidates(orders, invoices), [orders, invoices]);
  console.log("Invoice candidates:", candidates);
  const goodsCandidates = React.useMemo(
    () => candidates.map((c) => createSectionCandidate(c, "NORMAL")).filter(Boolean) as InvoiceCandidate[],
    [candidates]
  );
  const vasCandidates = React.useMemo(
    () => candidates.map((c) => createSectionCandidate(c, "VAS")).filter(Boolean) as InvoiceCandidate[],
    [candidates]
  );

  const findCandidateByOrderNo = React.useCallback(
    (value: string) => {
      const raw = value.trim();
      if (!raw) return { goods: null, vas: null };
      const normalized = raw.toUpperCase();
      const withPrefix = normalized.startsWith("MOTRACK-") ? normalized : `MOTRACK-${normalized}`;
      const compact = withPrefix.replace(/^MOTRACK-/, "");
      const matchCandidate = (candidate: InvoiceCandidate) => {
        const orderId = String(candidate.order.id || "").toUpperCase();
        const orderNo = String(candidate.order.orderNo || "").toUpperCase();
        const orderCompact = orderId.replace(/^MOTRACK-/, "");
        const orderNoCompact = orderNo.replace(/^MOTRACK-/, "");
        return (
          orderId === withPrefix ||
          orderNo === withPrefix ||
          orderCompact === compact ||
          orderNoCompact === compact
        );
      };
      const goods = goodsCandidates.find(matchCandidate) || null;
      const vas = vasCandidates.find(matchCandidate) || null;
      return { goods, vas };
    },
    [goodsCandidates, vasCandidates]
  );

  const handleQuickGenerate = React.useCallback(() => {
    const value = quickOrderNo.trim();
    if (!value) {
      toast({ variant: "destructive", title: "Order number required", description: "Enter an order number to generate an invoice." });
      return;
    }
    const { goods, vas } = findCandidateByOrderNo(value);
    if (!goods && !vas) {
      toast({ variant: "destructive", title: "Order not ready", description: "No pending invoice found for this order." });
      return;
    }
    if (goods) {
      setSelectedCandidate(goods);
      if (vas) {
        toast({ title: "Goods invoice opened", description: "VAS invoice is also pending for this order." });
      }
      return;
    }
    if (vas) {
      setSelectedCandidate(vas);
    }
  }, [findCandidateByOrderNo, quickOrderNo, toast]);

  const renderPendingTable = (pendingCandidates: InvoiceCandidate[], emptyLabel: string) => (
    <Card>
      <CardHeader>
        <CardTitle>Orders Ready for Invoice</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order No</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Mobile No</TableHead>
                <TableHead>Deal ID</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : pendingCandidates.length ? (
                pendingCandidates.map((candidate) => (
                  <TableRow key={`${candidate.order.id}-${candidate.normalItems.length ? "goods" : "vas"}`}>
                    <TableCell>{candidate.order.id.replace("MOTRACK-", "")}</TableCell>
                    <TableCell>{candidate.order.customerSnapshot?.name || candidate.order.customerName || "-"}</TableCell>
                    <TableCell>{candidate.order.customerPhone || "-"}</TableCell>
                    <TableCell>{candidate.order.dealId || "-"}</TableCell>
                    <TableCell>₹ {candidate.overallSummary.grandTotal.toFixed(2)}</TableCell>
                    <TableCell>{candidate.order.createdBy?.name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">Pending</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => setSelectedCandidate(candidate)}>
                        <FileText className="mr-2 h-4 w-4" />Generate
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    {emptyLabel}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="w-full p-4 md:p-6 lg:p-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Generate Invoice</h1>
          <p className="text-muted-foreground">Only allocated items are available for invoicing.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            className="w-full sm:w-48"
            placeholder="Order No (e.g. 4891)"
            value={quickOrderNo}
            onChange={(event) => setQuickOrderNo(event.target.value)}
          />
          <Button onClick={handleQuickGenerate}>
            Generate
          </Button>
        </div>
      </header>

      <Tabs defaultValue="goods-invoices">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="goods-invoices">Goods Invoice</TabsTrigger>
          <TabsTrigger value="vas-invoices">VAS Invoice</TabsTrigger>
          <TabsTrigger value="tally-log">Invoice History</TabsTrigger>
        </TabsList>

        <TabsContent value="goods-invoices" className="mt-4">
          {renderPendingTable(goodsCandidates, "No pending goods invoices.")}
        </TabsContent>

        <TabsContent value="vas-invoices" className="mt-4">
          {renderPendingTable(vasCandidates, "No pending VAS invoices.")}
        </TabsContent>

        <TabsContent value="tally-log" className="mt-4">
          <InvoiceLogTable />
        </TabsContent>
      </Tabs>

      <GenerateInvoiceDialog
        candidate={selectedCandidate}
        invoices={invoices}
        onClose={() => setSelectedCandidate(null)}
      />
    </div>
  );
}
