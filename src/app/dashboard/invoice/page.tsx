"use client";

import * as React from "react";
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  doc,
  writeBatch,
  limit,
  increment,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Invoice, Order, Quotation } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PrintableInvoice } from "@/components/features/invoice/PrintableInvoice";
import { InvoiceLogTable } from "@/components/features/invoice/InvoiceLogTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText,
  Loader2,
  Printer,
  Search,
  X,
  AlertTriangle,
  CheckCircle2,
  Package,
  Wrench,
  History,
  IndianRupee,
  Zap,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Pure helpers (unchanged logic) ───────────────────────────────────────────
const normalizeKey = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s/-]/g, "")
    .trim();

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
  if (Array.isArray(value))
    return value.map(stripUndefinedDeep).filter((e) => e !== undefined);
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .map(([k, v]) => [k, stripUndefinedDeep(v)])
      .filter(([, v]) => v !== undefined);
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
  const match = fabricDetails.find(
    (entry: any) => normalizeKey(entry?.fabricName) === key
  );
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

const toFixedKey = (value: unknown, decimals = 4) => num(value).toFixed(decimals);

const buildNormalInvoiceGroupingKey = (item: any, discountPercent: number) => {
  const bcnKey = normalizeKey(item?.bcn || item?.description || item?.itemName);
  const descriptionKey = normalizeKey(item?.description || item?.itemName || "");
  const hsnKey = normalizeKey(item?.hsn);
  const unitKey = normalizeKey(item?.unit || "MTR");
  const rateKey = toFixedKey(item?.exclusiveRate ?? resolveExclusiveRateForInvoice(item));
  const gstKey = toFixedKey(item?.gst ?? item?.gstPercent);
  const discountKey = toFixedKey(discountPercent);
  return [bcnKey, descriptionKey, hsnKey, unitKey, rateKey, gstKey, discountKey].join("|");
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
  allocationRef?: { lengthId?: string; stockItemId?: string };
};

type InvoiceVerificationResult = { ok: boolean; issues: string[] };

const resolveItemLabel = (item: any) => {
  const bcn = String(item?.bcn || "").trim();
  const name = String(
    item?.description ||
      item?.salesDescription ||
      item?.itemName ||
      item?.name ||
      item?.vasName ||
      ""
  ).trim();
  if (bcn && name && normalizeKey(bcn) !== normalizeKey(name))
    return `${bcn} / ${name}`;
  return bcn || name;
};

const extractItemAliases = (item: any) => {
  const aliases = new Set<string>();
  [
    item?.bcn,
    item?.description,
    item?.salesDescription,
    item?.itemName,
    item?.name,
    item?.vasName,
    item?.serialNo,
  ].forEach((raw) => {
    const value = String(raw || "").trim();
    if (!value) return;
    const fragments = [value];
    if (value.includes("\n")) fragments.push(...value.split(/\n+/));
    fragments.forEach((fragment) =>
      fragment
        .split(/\s+-\s+/)
        .map((part) => normalizeKey(part))
        .filter(Boolean)
        .forEach((part) => aliases.add(part))
    );
  });
  const labelKey = normalizeKey(resolveItemLabel(item));
  if (labelKey) aliases.add(labelKey);
  return aliases;
};

const getItemMismatches = (orderItems: any[], quotationItems: any[]) => {
  const orderMeta = orderItems
    .map((item) => ({ label: resolveItemLabel(item), aliases: extractItemAliases(item) }))
    .filter((item) => item.aliases.size > 0);
  const quotationMeta = quotationItems
    .map((item) => ({ label: resolveItemLabel(item), aliases: extractItemAliases(item) }))
    .filter((item) => item.aliases.size > 0);
  const hasOverlap = (left: Set<string>, right: Set<string>) => {
    for (const alias of left) if (right.has(alias)) return true;
    return false;
  };
  const unique = (labels: string[]) => Array.from(new Set(labels.filter(Boolean)));
  return {
    missingInOrder: unique(
      quotationMeta
        .filter((q) => !orderMeta.some((o) => hasOverlap(q.aliases, o.aliases)))
        .map((item) => item.label)
    ),
    extraInOrder: unique(
      orderMeta
        .filter((o) => !quotationMeta.some((q) => hasOverlap(o.aliases, q.aliases)))
        .map((item) => item.label)
    ),
  };
};

const sumFabricQty = (items: any[]) =>
  items.reduce((sum, item) => sum + num(item?.qty ?? item?.quantity), 0);

const formatMismatchValues = (values: string[]) => {
  const trimmed = values.filter(Boolean);
  if (!trimmed.length) return "";
  if (trimmed.length <= 4) return trimmed.join(", ");
  return `${trimmed.slice(0, 4).join(", ")} +${trimmed.length - 4} more`;
};

const pickQuotationFromSnapshot = (docs: any[]) => {
  if (!docs.length) return null;
  const withPriority = docs.map((docItem: any) => {
    const data = docItem.data() || {};
    const status = String(data?.status || "").toLowerCase();
    const priority = status === "converted to order" ? 3 : status === "approved" ? 2 : 1;
    return { data, priority, createdTime: new Date(data?.createdAt || data?.updatedAt || 0).getTime() };
  });
  withPriority.sort((a, b) =>
    b.priority !== a.priority ? b.priority - a.priority : b.createdTime - a.createdTime
  );
  return withPriority[0]?.data || null;
};

const extractQuotationNormalItems = (quotation: any) => {
  const sectionItems = quotation?.sections?.NORMAL?.items;
  if (Array.isArray(sectionItems) && sectionItems.length > 0) return sectionItems;
  const items = Array.isArray(quotation?.items) ? quotation.items : [];
  return items.filter((item: any) => {
    const type = String(item?.type || item?.productType || "").toLowerCase();
    return type !== "vas";
  });
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

const buildTaxSummary = (items: InvoiceLineItem[]) =>
  items.reduce(
    (acc, item) => {
      const gst = num(item.gstAmount);
      acc.cgst += gst / 2;
      acc.sgst += gst / 2;
      return acc;
    },
    { cgst: 0, sgst: 0, igst: 0 }
  );

const sumQtyByKey = (items: Array<any>, getKey: (item: any) => string, getQty: (item: any) => number) =>
  items.reduce((map, item) => {
    const key = getKey(item);
    if (!key) return map;
    map.set(key, num(map.get(key)) + num(getQty(item)));
    return map;
  }, new Map<string, number>());

const computeInvoicingStatus = (order: Order, invoices: Invoice[]) => {
  const orderedNormal = sumQtyByKey(
    order.sections?.NORMAL?.items || [],
    (item) => normalizeKey(item.bcn || item.description || item.itemName),
    (item) => num(item.qty)
  );
  const orderedVas = sumQtyByKey(
    order.sections?.VAS?.items || [],
    (item) => normalizeKey(item.description || item.bcn || item.itemName),
    (item) => num(item.qty)
  );
  const invoicedNormal = new Map<string, number>();
  const invoicedVas = new Map<string, number>();

  invoices.forEach((invoice) => {
    const hasSections =
      (invoice.sections?.NORMAL?.items?.length || 0) > 0 ||
      (invoice.sections?.VAS?.items?.length || 0) > 0;
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
    const targetMap = invoice.invoiceType === "VAS" || invoice.isVas ? invoicedVas : invoicedNormal;
    (invoice.items || []).forEach((item: any) => {
      const key = normalizeKey(item.bcn || item.name || item.itemName || item.description);
      targetMap.set(key, num(targetMap.get(key)) + num(item.quantity ?? item.quantityAllocated));
    });
  });

  if (!invoices.length) return "NOT_INVOICED";
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
      if (order.invoicing?.invoiceRequired === false) return null;
      const orderInvoices = invoicesByOrder[order.id] || [];
      const invoicedQtyByGroup = new Map<string, number>();
      const invoicedQtyByLength = new Map<string, number>();
      let vasAlreadyInvoiced = false;

      orderInvoices.forEach((invoice) => {
        const normalItems = invoice.sections?.NORMAL?.items || invoice.items || [];
        normalItems.forEach((item: any) => {
          const discountPercent = num(item?.discountPercent ?? item?.discount);
          const groupKey = buildNormalInvoiceGroupingKey(item, discountPercent);
          const qty = num(item.qty ?? item.quantity);
          if (groupKey)
            invoicedQtyByGroup.set(groupKey, num(invoicedQtyByGroup.get(groupKey)) + qty);
          const lengthId = item.allocationRef?.lengthId;
          if (lengthId)
            invoicedQtyByLength.set(lengthId, num(invoicedQtyByLength.get(lengthId)) + qty);
        });
        if ((invoice.sections?.VAS?.items || []).length > 0) vasAlreadyInvoiced = true;
      });

      const normalItemsRaw = order.sections?.NORMAL?.items || [];
      const normalInvoiceItems: InvoiceLineItem[] = [];

      const groupedNormalItems = new Map<
        string,
        {
          representative: any;
          groupKey: string;
          requiredQty: number;
          lotsAllocatedQty: number;
          lengths: Map<string, { qty: number; stockItemId?: string }>;
        }
      >();

      normalItemsRaw.forEach((item: any) => {
        const discountPercent = resolveDiscountPercent(order, item);
        const bcnKey = normalizeKey(item?.bcn || item?.description || item?.itemName);
        const groupKey = buildNormalInvoiceGroupingKey(item, discountPercent);
        if (!bcnKey) return;

        const existingGroup = groupedNormalItems.get(groupKey);
        const group =
          existingGroup ||
          {
            representative: item,
            groupKey,
            requiredQty: 0,
            lotsAllocatedQty: 0,
            lengths: new Map<string, { qty: number; stockItemId?: string }>(),
          };

        group.requiredQty += num(item?.qty);
        group.lotsAllocatedQty += (item?.allocation?.lots || []).reduce(
          (sum: number, entry: any) => sum + num(entry?.allocatedQty),
          0
        );

        (item?.allocation?.lengths || []).forEach((length: any) => {
          const lengthId = String(length?.lengthId || "").trim();
          if (!lengthId) return;
          const qty = num(length?.allocatedQty);
          if (qty <= 0) return;
          const current = group.lengths.get(lengthId) || {
            qty: 0,
            stockItemId: length?.stockItemId || item?.bcn,
          };
          current.qty += qty;
          if (!current.stockItemId) {
            current.stockItemId = length?.stockItemId || item?.bcn;
          }
          group.lengths.set(lengthId, current);
        });

        if (!existingGroup) groupedNormalItems.set(groupKey, group);
      });

      groupedNormalItems.forEach((group) => {
        const item = group.representative || {};
        const allocatedFromLengths = Array.from(group.lengths.values()).reduce(
          (sum, entry) => sum + num(entry.qty),
          0
        );
        const allocatedTotalRaw = allocatedFromLengths + num(group.lotsAllocatedQty);
        const allocatedTotal = Math.min(allocatedTotalRaw, num(group.requiredQty));
        const alreadyInvoiced = num(invoicedQtyByGroup.get(group.groupKey));
        let remaining = Math.max(0, allocatedTotal - alreadyInvoiced);
        if (remaining <= 0) return;

        const exclusiveRate = item.exclusiveRate ?? resolveExclusiveRateForInvoice(item);
        const rate = exclusiveRate;
        const gst = num(item.gst);
        const unit = item.unit || "MTR";
        const discountPercent = resolveDiscountPercent(order, item);

        const lengthEntries = Array.from(group.lengths.entries());
        if (lengthEntries.length > 0) {
          for (const [lengthId, lengthMeta] of lengthEntries) {
            if (remaining <= 0) break;
            const lengthRemaining = Math.max(
              0,
              num(lengthMeta.qty) - num(invoicedQtyByLength.get(lengthId))
            );
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
                lengthId,
                stockItemId: lengthMeta.stockItemId || item.bcn,
              },
            });
            remaining -= qty;
          }
        }

        if (remaining > 0) {
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
            roomName: item.roomName, type: "VAS", description: item.description,
            unit: item.unit || "PCS", exclusiveRate, rate, qty, gst, discountPercent,
            discountAmount, hsn: item.hsn, group: item.group, taxableAmount, gstAmount,
            totalAmount: taxableAmount + gstAmount,
          });
        });
      }

      if (normalInvoiceItems.length === 0 && vasInvoiceItems.length === 0) return null;
      const normalSummary = summarizeItems(normalInvoiceItems);
      const vasSummary = summarizeItems(vasInvoiceItems);
      return {
        order,
        normalItems: normalInvoiceItems,
        vasItems: vasInvoiceItems,
        normalSummary,
        vasSummary,
        overallSummary: {
          goodsTotal: normalSummary.grandTotal,
          vasTotal: vasSummary.grandTotal,
          grandTotal: normalSummary.grandTotal + vasSummary.grandTotal,
        },
        taxSummary: { NORMAL: buildTaxSummary(normalInvoiceItems), VAS: buildTaxSummary(vasInvoiceItems) },
      } as InvoiceCandidate;
    })
    .filter(Boolean) as InvoiceCandidate[];
};

const createSectionCandidate = (candidate: InvoiceCandidate, section: "NORMAL" | "VAS") => {
  const normalItems = section === "NORMAL" ? candidate.normalItems : [];
  const vasItems = section === "VAS" ? candidate.vasItems : [];
  if (section === "NORMAL" && normalItems.length === 0) return null;
  if (section === "VAS" && vasItems.length === 0) return null;
  const normalSummary = summarizeItems(normalItems);
  const vasSummary = summarizeItems(vasItems);
  return {
    ...candidate, normalItems, vasItems, normalSummary, vasSummary,
    overallSummary: {
      goodsTotal: normalSummary.grandTotal,
      vasTotal: vasSummary.grandTotal,
      grandTotal: normalSummary.grandTotal + vasSummary.grandTotal,
    },
    taxSummary: { NORMAL: buildTaxSummary(normalItems), VAS: buildTaxSummary(vasItems) },
  } as InvoiceCandidate;
};

const buildPrintablePayload = (candidate: InvoiceCandidate, invoiceNo?: string) => {
  const { order, normalItems, vasItems } = candidate;
  const mergedItems = [...normalItems, ...vasItems].map((item) => {
    const gstAmount = num(item.gstAmount);
    const discountPercent = num(item.discountPercent);
    const rate = num(item.exclusiveRate ?? item.rate);
    const baseAmount = rate * num(item.qty);
    const discountAmount =
      numOrUndefined(item.discountAmount) ?? baseAmount * (discountPercent / 100);
    return {
      name: item.description || item.bcn || "",
      bcn: item.bcn || (item.type === "VAS" ? `VAS-${item.description}` : ""),
      hsn: item.hsn || "", quantity: num(item.qty), uom: item.unit || "MTR",
      rate, exclusiveRate: numOrUndefined(item.exclusiveRate), discountPercent,
      taxableAmount: num(item.taxableAmount), cgst: gstAmount / 2, sgst: gstAmount / 2,
      igst: 0, total: num(item.totalAmount), discountAmount,
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
      invoiceNo,
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
      companyName:
        normalItems.length === 0 && vasItems.length > 0
          ? "SP SERVICES"
          : "MO Designs Private Limited - (2024-2025)",
      address:
        normalItems.length === 0 && vasItems.length > 0
          ? "2nd Floor, B-50 (MO), Sushant Lok Phase 2, Block B, Sector 56, Gurugram - 122011, Haryana, India"
          : "A-6, Sushant Lok-1, Gurgaon",
      gstin:
        normalItems.length === 0 && vasItems.length > 0
          ? "06CDOPP2805B1ZR"
          : "06AAMCM5012B1ZY",
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

// ─── Generate Invoice Dialog ───────────────────────────────────────────────────
function GenerateInvoiceDialog({
  candidate,
  invoices,
  onValidateBeforeGenerate,
  allowVerificationBypass,
  onClose,
}: {
  candidate: InvoiceCandidate | null;
  invoices: Invoice[];
  onValidateBeforeGenerate: (candidate: InvoiceCandidate) => Promise<InvoiceVerificationResult>;
  allowVerificationBypass: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = React.useState(false);

  if (!candidate) return null;
  const payload = buildPrintablePayload(candidate);

  const handleGenerate = async () => {
    if (!user) {
      toast({ variant: "destructive", title: "Login required" });
      return;
    }
    setIsGenerating(true);
    try {
      const verification = await onValidateBeforeGenerate(candidate);
      if (!verification.ok && !allowVerificationBypass) {
        toast({ variant: "destructive", title: "Verification failed", description: "Reopen and choose Generate anyway to continue." });
        return;
      }

      const batch = writeBatch(db);
      const order = candidate.order;
      const invoicesRef = collection(db, "invoices");
      const lastSnap = await getDocs(query(invoicesRef, orderBy("invoiceNo", "desc"), limit(1)));
      let nextNo = 1001;
      if (!lastSnap.empty) {
        const lastNo = parseInt(String(lastSnap.docs[0].data().invoiceNo || ""), 10);
        if (!Number.isNaN(lastNo)) nextNo = lastNo + 1;
      }
      const invoiceNo = String(nextNo);
      const invoiceId = doc(collection(db, "invoices")).id;
      const now = new Date().toISOString();
      const invoiceType =
        candidate.normalItems.length > 0 && candidate.vasItems.length > 0
          ? "MIXED"
          : candidate.vasItems.length > 0
          ? "VAS"
          : "NORMAL";

      const invoiceDoc: Omit<Invoice, "id"> = {
        invoiceId, invoiceNo, invoiceType, invoiceDate: now, orderId: order.id,
        orderNo: order.orderNo || order.id, customerId: order.customerId,
        sellerSnapshot: payload.seller, customerSnapshot: payload.customer,
        sections: {
          NORMAL: { items: candidate.normalItems, summary: candidate.normalSummary },
          VAS: { items: candidate.vasItems, summary: candidate.vasSummary },
        },
        overallSummary: candidate.overallSummary, taxSummary: candidate.taxSummary,
        payment: {}, status: "ISSUED", isLocked: true,
        createdAt: now, updatedAt: now, createdBy: user.displayName || "System",
        customer: { name: payload.customer.name, phone: payload.customer.phone, address: payload.customer.address },
        salesPerson: payload.meta.salesPerson || "", items: payload.items, totals: payload.totals,
      };

      const invoiceRef = doc(db, "invoices", invoiceId);
      batch.set(invoiceRef, stripUndefinedDeep(invoiceDoc) as Omit<Invoice, "id">);

      candidate.normalItems.forEach((item) => {
        if (!item.bcn) return;
        const stockId = item.bcn.replace(/\//g, "-");
        const stockRef = doc(db, "stocks", stockId);
        const qty = num(item.qty);
        batch.update(stockRef, { reservedQty: increment(-qty), cutQty: increment(qty) });
        const lengthId = item.allocationRef?.lengthId;
        if (lengthId && !lengthId.startsWith("MIG-LEN-")) {
          batch.update(doc(db, "stocks", stockId, "lengths", lengthId), {
            reservedQty: increment(-qty), cutQty: increment(qty),
          });
        }
      });

      const updatedInvoices = [
        ...(candidate.order.invoicing?.invoices || []),
        { invoiceId, invoiceNo, invoiceType, createdAt: now, amount: candidate.overallSummary.grandTotal },
      ];
      const orderInvoices = invoices.filter((inv) => inv.orderId === candidate.order.id);
      const invoicesWithNew = [...orderInvoices, { ...(invoiceDoc as Invoice), id: invoiceId }];
      const invoicingStatus = computeInvoicingStatus(candidate.order, invoicesWithNew);

      batch.update(doc(db, "orders", candidate.order.id), {
        invoicing: {
          ...(candidate.order.invoicing || {}), status: invoicingStatus, invoices: updatedInvoices,
          canCreateGoodsInvoice: (candidate.order.sections?.NORMAL?.items?.length || 0) > 0,
          canCreateVasInvoice: (candidate.order.sections?.VAS?.items?.length || 0) > 0,
        },
        updatedAt: now,
      });

      await batch.commit();
      toast({ title: `Invoice #${invoiceNo} created`, description: "Invoice has been generated successfully." });
      onClose();
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Generation failed", description: error.message || "Failed to generate invoice." });
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
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 250);
  };

  const isVas = candidate.normalItems.length === 0 && candidate.vasItems.length > 0;
  const grandTotal = candidate.overallSummary.grandTotal;
  const customer = candidate.order.customerSnapshot?.name || candidate.order.customerName;

  return (
    <Dialog open={!!candidate} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-bold">Generate Invoice</DialogTitle>
              <DialogDescription className="mt-0.5">
                Review before generating — only allocated items are included.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-3 text-right shrink-0">
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p className="text-sm font-semibold">{customer || "—"}</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-sm font-bold text-emerald-700">₹ {grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <Badge variant="outline" className={cn("text-xs", isVas ? "border-violet-300 bg-violet-50 text-violet-700" : "border-blue-300 bg-blue-50 text-blue-700")}>
                {isVas ? "VAS Invoice" : "Goods Invoice"}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {/* Invoice Preview */}
        <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
          <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-sm border" id="printable-invoice-preview">
            <PrintableInvoice payload={payload} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-background flex items-center justify-between shrink-0">
          <Button variant="ghost" onClick={onClose} disabled={isGenerating}>Cancel</Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print Preview
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px]">
              {isGenerating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
              ) : (
                <><FileText className="mr-2 h-4 w-4" /> Generate Invoice</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Candidate Table ───────────────────────────────────────────────────────────
function CandidateTable({
  candidates,
  loading,
  emptyLabel,
  verifyingOrderId,
  onGenerate,
  badgeType,
}: {
  candidates: InvoiceCandidate[];
  loading: boolean;
  emptyLabel: string;
  verifyingOrderId: string | null;
  onGenerate: (candidate: InvoiceCandidate) => void;
  badgeType: "goods" | "vas";
}) {
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.toLowerCase();
    return candidates.filter(
      (c) =>
        c.order.id?.toLowerCase().includes(q) ||
        (c.order.customerSnapshot?.name || c.order.customerName || "").toLowerCase().includes(q) ||
        (c.order.customerPhone || "").includes(q) ||
        (c.order.dealId || "").toLowerCase().includes(q) ||
        (c.order.createdBy?.name || "").toLowerCase().includes(q)
    );
  }, [candidates, search]);

  const totalValue = candidates.reduce((sum, c) => sum + c.overallSummary.grandTotal, 0);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-3 flex items-center gap-3 shadow-sm">
          <div className={cn("rounded-lg p-2.5", badgeType === "goods" ? "bg-blue-500" : "bg-violet-500")}>
            {badgeType === "goods" ? <Package className="h-4 w-4 text-white" /> : <Wrench className="h-4 w-4 text-white" />}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending Invoices</p>
            <p className="text-xl font-bold">{candidates.length}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-3 flex items-center gap-3 shadow-sm">
          <div className="rounded-lg p-2.5 bg-emerald-500">
            <IndianRupee className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Value</p>
            <p className="text-xl font-bold">₹ {totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-3 flex items-center gap-3 shadow-sm">
          <div className="rounded-lg p-2.5 bg-amber-500">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Showing</p>
            <p className="text-xl font-bold">{filtered.length} <span className="text-sm font-normal text-muted-foreground">results</span></p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search order, customer, deal..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
        {search && (
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch("")}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {["Order No", "Customer", "Mobile", "Deal ID", "Amount", "Created By", "Type", ""].map((h) => (
                <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-10 whitespace-nowrap">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length ? (
              filtered.map((candidate, idx) => (
                <TableRow
                  key={`${candidate.order.id}-${badgeType}`}
                  className={cn("transition-colors", idx % 2 === 0 ? "bg-background" : "bg-muted/20", "hover:bg-primary/5")}
                >
                  <TableCell>
                    <span className="font-mono text-sm font-semibold text-primary">
                      {candidate.order.id.replace("MOTRACK-", "")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{candidate.order.customerSnapshot?.name || candidate.order.customerName || "—"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono text-muted-foreground">{candidate.order.customerPhone || "—"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{candidate.order.dealId || "—"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-semibold text-emerald-700">
                      ₹ {candidate.overallSummary.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{candidate.order.createdBy?.name || "—"}</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-xs", badgeType === "goods"
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-violet-300 bg-violet-50 text-violet-700"
                      )}
                    >
                      {badgeType === "goods" ? "Goods" : "VAS"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      disabled={verifyingOrderId === candidate.order.id}
                      onClick={() => onGenerate(candidate)}
                      className="gap-1.5"
                    >
                      {verifyingOrderId === candidate.order.id ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking</>
                      ) : (
                        <><FileText className="h-3.5 w-3.5" /> Generate <ChevronRight className="h-3.5 w-3.5" /></>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileText className="h-8 w-8 opacity-30" />
                    <p className="text-sm">{search ? "No matches found" : emptyLabel}</p>
                    {search && <p className="text-xs">Try a different search term</p>}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function InvoicePage() {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedCandidate, setSelectedCandidate] = React.useState<InvoiceCandidate | null>(null);
  const [quickOrderNo, setQuickOrderNo] = React.useState("");
  const [verifyingOrderId, setVerifyingOrderId] = React.useState<string | null>(null);
  const [verificationBypassOrderId, setVerificationBypassOrderId] = React.useState<string | null>(null);
  const [verificationPrompt, setVerificationPrompt] = React.useState<{
    candidate: InvoiceCandidate;
    issues: string[];
  } | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    const unsubOrders = onSnapshot(
      query(collection(db, "orders"), orderBy("createdAt", "desc")),
      (snap) => { setOrders(snap.docs.map((d) => ({ ...d.data(), id: d.id } as Order))); setLoading(false); },
      () => { toast({ variant: "destructive", title: "Error", description: "Could not load orders." }); setLoading(false); }
    );
    const unsubInvoices = onSnapshot(
      query(collection(db, "invoices"), orderBy("createdAt", "desc")),
      (snap) => setInvoices(snap.docs.map((d) => ({ ...d.data(), id: d.id } as Invoice))),
      () => toast({ variant: "destructive", title: "Error", description: "Could not load invoices." })
    );
    return () => { unsubOrders(); unsubInvoices(); };
  }, [toast]);

  const candidates = React.useMemo(() => buildInvoiceCandidates(orders, invoices), [orders, invoices]);
  const goodsCandidates = React.useMemo(
    () => candidates.map((c) => createSectionCandidate(c, "NORMAL")).filter(Boolean) as InvoiceCandidate[],
    [candidates]
  );
  const vasCandidates = React.useMemo(
    () => candidates.map((c) => createSectionCandidate(c, "VAS")).filter(Boolean) as InvoiceCandidate[],
    [candidates]
  );

  const fetchQuotationForOrder = React.useCallback(async (order: Order): Promise<Quotation | null> => {
    const snapshots: any[] = [];
    const byOrderNo = await getDocs(query(collectionGroup(db, "quotations"), where("orderNo", "==", order.id), limit(5)));
    snapshots.push(...byOrderNo.docs);
    if (order.quotationNo) {
      const byQNo = await getDocs(query(collectionGroup(db, "quotations"), where("quotationNo", "==", order.quotationNo), limit(5)));
      snapshots.push(...byQNo.docs);
    }
    return (pickQuotationFromSnapshot(snapshots) as Quotation) || null;
  }, []);

  const verifyCandidateBeforeGenerate = React.useCallback(
    async (candidate: InvoiceCandidate): Promise<InvoiceVerificationResult> => {
      const quotation = await fetchQuotationForOrder(candidate.order);
      if (!quotation) return { ok: false, issues: ["Quotation not found for this order."] };

      const issues: string[] = [];
      const orderAmount = num(candidate.order.totalAmount ?? (candidate.order as any)?.overallSummary?.grandTotal);
      const quotationAmount = num((quotation as any)?.totalAmount ?? (quotation as any)?.overallSummary?.grandTotal);
      if (orderAmount > 0 && quotationAmount > 0 && Math.abs(orderAmount - quotationAmount) > 1)
        issues.push(`Amount mismatch: Order ₹${orderAmount.toFixed(2)} vs Quotation ₹${quotationAmount.toFixed(2)}.`);

      const orderNormalItems = candidate.order.sections?.NORMAL?.items || [];
      const quotationNormalItems = extractQuotationNormalItems(quotation);
      const orderFabricQty = sumFabricQty(orderNormalItems);
      const quotationFabricQty = sumFabricQty(quotationNormalItems);
      if (Math.abs(orderFabricQty - quotationFabricQty) > 0.01)
        issues.push(`Fabric qty mismatch: Order ${orderFabricQty.toFixed(2)} vs Quotation ${quotationFabricQty.toFixed(2)}.`);

      const { missingInOrder, extraInOrder } = getItemMismatches(orderNormalItems, quotationNormalItems);
      if (missingInOrder.length > 0 || extraInOrder.length > 0)
        issues.push(`Item mismatch — Missing: [${formatMismatchValues(missingInOrder)}] | Extra: [${formatMismatchValues(extraInOrder)}].`);

      return { ok: issues.length === 0, issues };
    },
    [fetchQuotationForOrder]
  );

  const openCandidateWithVerification = React.useCallback(
    async (candidate: InvoiceCandidate) => {
      setVerifyingOrderId(candidate.order.id);
      try {
        const verification = await verifyCandidateBeforeGenerate(candidate);
        if (!verification.ok) { setVerificationPrompt({ candidate, issues: verification.issues }); return false; }
        setVerificationBypassOrderId(null);
        setSelectedCandidate(candidate);
        return true;
      } catch (error: any) {
        toast({ variant: "destructive", title: "Verification error", description: error?.message || "Unable to verify." });
        return false;
      } finally {
        setVerifyingOrderId(null);
      }
    },
    [toast, verifyCandidateBeforeGenerate]
  );

  const handleQuickGenerate = React.useCallback(async () => {
    const value = quickOrderNo.trim();
    if (!value) { toast({ variant: "destructive", title: "Enter an order number" }); return; }
    const normalized = value.toUpperCase();
    const withPrefix = normalized.startsWith("MOTRACK-") ? normalized : `MOTRACK-${normalized}`;
    const compact = withPrefix.replace(/^MOTRACK-/, "");
    const matchCandidate = (c: InvoiceCandidate) => {
      const id = String(c.order.id || "").toUpperCase();
      const no = String(c.order.orderNo || "").toUpperCase();
      return id === withPrefix || no === withPrefix || id.replace(/^MOTRACK-/, "") === compact || no.replace(/^MOTRACK-/, "") === compact;
    };
    const goods = goodsCandidates.find(matchCandidate) || null;
    const vas = vasCandidates.find(matchCandidate) || null;
    if (!goods && !vas) { toast({ variant: "destructive", title: "Order not ready", description: "No pending invoice found." }); return; }
    if (goods) { await openCandidateWithVerification(goods); return; }
    if (vas) await openCandidateWithVerification(vas);
  }, [goodsCandidates, vasCandidates, openCandidateWithVerification, quickOrderNo, toast]);

  return (
    <div className="w-full space-y-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoice Generation</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Only allocated items are available for invoicing.
          </p>
        </div>

        {/* Quick generate */}
        <div className="flex items-center gap-2 bg-muted/40 border rounded-xl px-4 py-2.5">
          <Zap className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-sm font-medium whitespace-nowrap">Quick Generate:</span>
          <Input
            className="w-40 h-8 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
            placeholder="Order No..."
            value={quickOrderNo}
            onChange={(e) => setQuickOrderNo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleQuickGenerate()}
          />
          <Button size="sm" onClick={() => void handleQuickGenerate()} disabled={!!verifyingOrderId} className="h-8 shrink-0">
            {verifyingOrderId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="goods-invoices">
        <TabsList className="h-10">
          <TabsTrigger value="goods-invoices" className="text-sm gap-2">
            <Package className="h-4 w-4" />
            Goods Invoice
            {goodsCandidates.length > 0 && (
              <Badge variant="secondary" className="h-5 text-xs ml-1">{goodsCandidates.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="vas-invoices" className="text-sm gap-2">
            <Wrench className="h-4 w-4" />
            VAS Invoice
            {vasCandidates.length > 0 && (
              <Badge variant="secondary" className="h-5 text-xs ml-1">{vasCandidates.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="tally-log" className="text-sm gap-2">
            <History className="h-4 w-4" />
            Invoice History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="goods-invoices" className="mt-4">
          <CandidateTable
            candidates={goodsCandidates}
            loading={loading}
            emptyLabel="No pending goods invoices."
            verifyingOrderId={verifyingOrderId}
            onGenerate={(c) => void openCandidateWithVerification(c)}
            badgeType="goods"
          />
        </TabsContent>

        <TabsContent value="vas-invoices" className="mt-4">
          <CandidateTable
            candidates={vasCandidates}
            loading={loading}
            emptyLabel="No pending VAS invoices."
            verifyingOrderId={verifyingOrderId}
            onGenerate={(c) => void openCandidateWithVerification(c)}
            badgeType="vas"
          />
        </TabsContent>

        <TabsContent value="tally-log" className="mt-4">
          <InvoiceLogTable />
        </TabsContent>
      </Tabs>

      {/* Generate Dialog */}
      <GenerateInvoiceDialog
        candidate={selectedCandidate}
        invoices={invoices}
        onValidateBeforeGenerate={verifyCandidateBeforeGenerate}
        allowVerificationBypass={verificationBypassOrderId === selectedCandidate?.order.id}
        onClose={() => { setSelectedCandidate(null); setVerificationBypassOrderId(null); }}
      />

      {/* Verification Mismatch Dialog */}
      <AlertDialog open={!!verificationPrompt} onOpenChange={(open) => { if (!open) setVerificationPrompt(null); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="rounded-full bg-amber-100 p-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <AlertDialogTitle>Verification Issues Found</AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-3 mt-2">
                <p className="text-sm text-muted-foreground">
                  Differences found between quotation and order for this invoice:
                </p>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
                  {(verificationPrompt?.issues || []).map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">You can still generate the invoice by choosing "Generate Anyway".</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!verificationPrompt) return;
                setVerificationBypassOrderId(verificationPrompt.candidate.order.id);
                setSelectedCandidate(verificationPrompt.candidate);
                setVerificationPrompt(null);
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Generate Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
