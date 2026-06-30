"use client";

import { useEffect, useState } from "react";
import {
  collection, deleteDoc, doc, getDoc, getDocs,
  onSnapshot, query, updateDoc, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Walkin_Customer, User } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { attendToWalkin, handoverToSalesman } from "./actions";
import { getSalesmen } from "../customers/actions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

import {
  AlertCircle, ArrowRightLeft, BadgeCheck, CalendarDays,
  CheckCircle2, ChevronDown, Circle, ClipboardList, CreditCard,
  Eye, GitBranch, Layers, Loader2, MessageSquarePlus,
  Package, PencilLine, Search, Trash2, UserCheck, Users,
  RefreshCw, Receipt,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type WorkflowStep   = { label: string; status: string };
type OrderSections  = Record<string, any>;
type WentBackQaItem = { question: string; answer: string; wentBackdate?: string };

// ─── Constants ────────────────────────────────────────────────────────────────
const WENT_BACK_QUESTIONS = [
  "He could not find exactly what he was looking for?",
  "The price was higher than his budget?",
  "He need to compare option with other showrooms?",
  "The Item he wanted was out of stock?",
  "The delivery or lead time was too long",
  "The product quality didn't meet His expectations",
  "He had questions that were not answered",
  "Will come back again with designer",
  "Will come back again with family/Friend",
  "He wasn't able to find assistance",
];
const FOLLOW_UP_QUESTIONS = ["Will come back again with family/Friend", "Will come back again with designer"];
const NO_ANSWER_QUESTIONS = ["He need to compare option with other showrooms?"];
const PAYMENT_TYPES    = ["Balance Payment", "Full Payment", "Advance Payment"];
const FABRIC_TYPES     = ["Fabric Selection", "Fabric Changing"];
const COLLECTION_TYPES = ["Sample Collection", "Fabric Collection"];

const BRANCHES = ["MO GCR BRANCH", "MO MG ROAD"] as const;
type Branch = typeof BRANCHES[number] | "all";

const resolveWalkinStore = (walkin: Partial<Walkin_Customer> & Record<string, any>): string => {
  const resolved = String(
    walkin.originStoreName ||
    walkin.createdByStore ||
    walkin.store ||
    walkin.storeName ||
    walkin.assignedStoreName ||
    walkin.salesmanStore ||
    (walkin.createdBy as any)?.store ||
    ""
  ).trim();
  return resolved;
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  "Pending":      { bg: "bg-stone-100",  text: "text-stone-500",   dot: "bg-stone-400",   label: "Pending" },
  "Attended":     { bg: "bg-sky-50",     text: "text-sky-700",     dot: "bg-sky-500",     label: "Attended" },
  "Handed Over":  { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500",   label: "Handed Over" },
  "Deal Created": { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Deal Created" },
  "went-back":    { bg: "bg-rose-50",    text: "text-rose-600",    dot: "bg-rose-500",    label: "Went Back" },
  "completed":    { bg: "bg-teal-50",    text: "text-teal-700",    dot: "bg-teal-500",    label: "Completed" },
};

function StatusBadge({ status }: { status?: string }) {
  const v = STATUS_CONFIG[status ?? ""] ?? STATUS_CONFIG["Pending"];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide ${v.bg} ${v.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />
      {v.label}
    </span>
  );
}

// ─── Customer Type Badge ──────────────────────────────────────────────────────
function CustomerTypeBadge({ type }: { type?: string }) {
  const isReturning = type === "Returning-Customer";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
      isReturning
        ? "bg-blue-50 text-blue-700 border border-blue-200"
        : "bg-orange-50 text-orange-700 border border-orange-200"
    }`}>
      {isReturning ? "↩ Returning" : "✦ New"}
    </span>
  );
}

// ─── Lead Type Badge ──────────────────────────────────────────────────────────
const LEAD_TYPE_CONFIG: Record<string, { bg: string; text: string; border: string; icon: React.ElementType }> = {
  "Balance Payment":   { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: CreditCard },
  "Full Payment":      { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: CreditCard },
  "Advance Payment":   { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: CreditCard },
  "Fabric Selection":  { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200",  icon: Layers },
  "Fabric Changing":   { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200",  icon: Layers },
  "Sample Collection": { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    icon: Package },
  "Fabric Collection": { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    icon: Package },
};

function LeadTypeBadge({ type }: { type?: string }) {
  if (!type) return null;
  const cfg = LEAD_TYPE_CONFIG[type];
  if (!cfg) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">{type}</span>
  );
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <Icon className="h-2.5 w-2.5" />{type}
    </span>
  );
}

const getInstantSaleMeta = (customer: Walkin_Customer | Record<string, any>) => {
  const record = customer as any;
  const cashsale = (record?.cashsale || {}) as Record<string, any>;
  const rawType = String(cashsale?.dealType || record?.saleFlowType || '').trim().toLowerCase();
  const hasInstantSale = Boolean(
    cashsale?.created ||
      cashsale?.OrderId ||
      cashsale?.orderId ||
      cashsale?.orderID ||
      rawType
  );
  if (!hasInstantSale) return null;

  if (rawType.includes('walkin')) {
    return { label: 'Walkin Sale', className: 'bg-blue-50 text-blue-700 border-blue-200' };
  }
  if (rawType.includes('cash')) {
    return { label: 'Cashsale', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  return { label: 'Instant Sale', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
};

function InstantSaleBadge({ customer }: { customer: Walkin_Customer }) {
  const saleMeta = getInstantSaleMeta(customer);
  if (!saleMeta) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${saleMeta.className}`}>
      <Receipt className="h-2.5 w-2.5" />
      {saleMeta.label}
    </span>
  );
}

// ─── Sheet helpers ────────────────────────────────────────────────────────────
function SheetSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-stone-400">{icon}</span>
        <p className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest">{title}</p>
      </div>
      <div className="rounded-2xl border border-stone-100 overflow-hidden divide-y divide-stone-50 shadow-sm">{children}</div>
    </div>
  );
}

function SheetRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center px-4 py-2.5 bg-white hover:bg-stone-50/60 transition-colors">
      <span className="text-[11px] text-stone-400 font-medium flex-shrink-0 mr-4">{label}</span>
      <span className="text-[12px] text-stone-800 font-semibold text-right">{value ?? "—"}</span>
    </div>
  );
}

// ─── Return Customer Detail Section ──────────────────────────────────────────
function ReturnCustomerSection({ customer, isAdmin, onEdit }: { customer: Walkin_Customer; isAdmin: boolean; onEdit: () => void }) {
  const { leadType, paymentAmount, paymentMethod, paymentNote, deal, dealRef, orderRef } = customer as any;
  if (!leadType) return null;
  const isPayment    = PAYMENT_TYPES.includes(leadType);
  const isFabric     = FABRIC_TYPES.includes(leadType);
  const isCollection = COLLECTION_TYPES.includes(leadType);
  const cfg = LEAD_TYPE_CONFIG[leadType] ?? { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", icon: RefreshCw };
  const Icon = cfg.icon;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${cfg.text}`} />
          <p className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest">Return Visit Details</p>
        </div>
        {isAdmin && (
          <button onClick={onEdit} className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-2 py-1 transition-all">
            <PencilLine className="h-2.5 w-2.5" /> Edit
          </button>
        )}
      </div>
      <div className={`rounded-2xl border ${cfg.border} overflow-hidden shadow-sm`}>
        <div className={`flex items-center gap-2 px-4 py-3 ${cfg.bg} border-b ${cfg.border}`}>
          <Icon className={`h-4 w-4 ${cfg.text}`} />
          <span className={`text-sm font-bold ${cfg.text}`}>{leadType}</span>
        </div>
        <div className="bg-white divide-y divide-stone-50">
          {isPayment && (
            <>
              {paymentMethod && <SheetRow label="Payment Method" value={<span className="flex items-center gap-1.5"><CreditCard className="h-3 w-3 text-emerald-500" />{paymentMethod}</span>} />}
              {(paymentAmount != null) && <SheetRow label="Amount Paid" value={<span className="font-bold text-emerald-700">₹{Number(paymentAmount).toLocaleString("en-IN")}</span>} />}
              {paymentNote && <SheetRow label="Note" value={paymentNote} />}
              {deal?.dealId && <SheetRow label="Deal Ref" value={<span className="font-mono text-xs">{deal.dealId}</span>} />}
              {deal?.dealSm && <SheetRow label="Salesperson" value={deal.dealSm} />}
              {deal?.dealStatus && <SheetRow label="Deal Status" value={deal.dealStatus} />}
              {deal?.dealAmount > 0 && <SheetRow label="Deal Amount" value={`₹${Number(deal.dealAmount).toLocaleString("en-IN")}`} />}
            </>
          )}
          {isFabric && (
            <>
              {dealRef?.dealId && <SheetRow label="Deal Ref" value={<span className="font-mono text-xs">{dealRef.dealId}</span>} />}
              {dealRef?.dealSm && <SheetRow label="Salesperson" value={dealRef.dealSm} />}
              {dealRef?.dealStatus && <SheetRow label="Deal Status" value={dealRef.dealStatus} />}
              {dealRef?.dealAmount > 0 && <SheetRow label="Deal Amount" value={`₹${Number(dealRef.dealAmount).toLocaleString("en-IN")}`} />}
            </>
          )}
          {isCollection && (
            <>
              {dealRef?.dealId && <SheetRow label="Deal Ref" value={<span className="font-mono text-xs">{dealRef.dealId}</span>} />}
              {dealRef?.dealSm && <SheetRow label="Deal Salesperson" value={dealRef.dealSm} />}
              {dealRef?.dealStatus && <SheetRow label="Deal Status" value={dealRef.dealStatus} />}
              {orderRef?.orderId && (
                <>
                  <div className="px-4 py-2 bg-blue-50/60 border-t border-blue-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500">Order Details</p>
                  </div>
                  <SheetRow label="Order ID" value={<span className="font-mono text-xs">{orderRef.orderId}</span>} />
                  {orderRef.dealSm && <SheetRow label="Order By" value={orderRef.dealSm} />}
                  {orderRef.dealAmount > 0 && <SheetRow label="Order Total" value={`₹${Number(orderRef.dealAmount).toLocaleString("en-IN")}`} />}
                </>
              )}
            </>
          )}
          {(customer as any).updatedBy?.username && <SheetRow label="Updated By" value={(customer as any).updatedBy.username} />}
          {(customer as any).updatedAt && (
            <SheetRow label="Updated At" value={(() => { try { return format(new Date((customer as any).updatedAt), "dd MMM yyyy, hh:mm a"); } catch { return "—"; } })()} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Full Edit Customer Dialog (Admin only) ───────────────────────────────────
function EditCustomerDialog({
  customer, open, onClose, onSave,
}: {
  customer: Walkin_Customer | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: Record<string, any>) => Promise<void>;
}) {
  const [saving,        setSaving]        = useState(false);
  const [activeSection, setActiveSection] = useState<"basic" | "return">("basic");

  // Basic fields
  const [firstName,    setFirstName]    = useState("");
  const [familyName,   setFamilyName]   = useState("");
  const [mobile,       setMobile]       = useState("");
  const [email,        setEmail]        = useState("");
  const [customerType, setCustomerType] = useState("");
  const [lookingFor,   setLookingFor]   = useState("");
  const [status,       setStatus]       = useState("");
  const [store,        setStore]        = useState<(typeof BRANCHES)[number]>(BRANCHES[0]);
  const [inquiryStatus,       setInquiryStatus]       = useState("");
  const [advanceReceived,     setAdvanceReceived]     = useState("");
  const [measurementRequired, setMeasurementRequired] = useState("");
  const [latestDealId,        setLatestDealId]        = useState("");
  const [latestDealDocId,     setLatestDealDocId]     = useState("");
  const [dealCustomerId,      setDealCustomerId]      = useState("");
  const [dealName,            setDealName]            = useState("");
  const [dealMode,            setDealMode]            = useState<"deal" | "instant_sale">("deal");
  const [instantDealNo,       setInstantDealNo]       = useState("");
  const [instantOrderId,      setInstantOrderId]      = useState("");
  const [instantOrderAmount,  setInstantOrderAmount]  = useState("");
  const [instantInvoiceNo,    setInstantInvoiceNo]    = useState("");
  const [useDifferentBillingDetails, setUseDifferentBillingDetails] = useState(false);
  const [billingName,         setBillingName]         = useState("");
  const [billingPhone,        setBillingPhone]        = useState("");
  const [billingAddress,      setBillingAddress]      = useState("");
  const [billingGstin,        setBillingGstin]        = useState("");
  const [validationError,     setValidationError]     = useState("");

  // Return visit fields
  const [leadType,      setLeadType]      = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentNote,   setPaymentNote]   = useState("");

  useEffect(() => {
    if (!customer) return;
    const c = customer as any;
    const ds = (c.dealSnapshot || {}) as Record<string, any>;
    const cashsale = (c.cashsale || {}) as Record<string, any>;
    const hasInstantSale = Boolean(
      cashsale?.created ||
      cashsale?.type === "INSTANT" ||
      cashsale?.OrderId ||
      String(c.saleFlowType || "").trim()
    );
    setFirstName(c.firstName || "");
    setFamilyName(c.familyName || "");
    setMobile(c.mobile || "");
    setEmail(c.email || "");
    setCustomerType(c.customerType || "");
    setLookingFor(Array.isArray(c.lookingFor) ? c.lookingFor.join(", ") : c.lookingFor || "");
    setStatus(c.status || "");
    const nextStore = String(
      c.originStoreName ||
      c.createdByStore ||
      c.store ||
      c.storeName ||
      c.assignedStoreName ||
      c.salesmanStore ||
      ""
    ).trim();
    setStore((BRANCHES as readonly string[]).includes(nextStore) ? (nextStore as (typeof BRANCHES)[number]) : BRANCHES[0]);
    setInquiryStatus(c.inquiryStatus || ds.status || (c.status === "Deal Created" ? "Inquery made" : ""));
    setAdvanceReceived(c.advanceReceived || ds.advanceReceived || "");
    setMeasurementRequired(c.measurementRequired || ds.measurementRequired || "");
    setLatestDealId(c.latestDealId || ds.dealId || "");
    setLatestDealDocId(c.latestDealDocId || ds.dealDocId || "");
    setDealCustomerId(ds.customerId || "");
    setDealName(ds.dealName || "");
    setDealMode(hasInstantSale ? "instant_sale" : "deal");
    setInstantDealNo(String(cashsale?.dealId || c.latestDealId || ds.dealId || ""));
    setInstantOrderId(String(cashsale?.OrderId || ""));
    setInstantOrderAmount(cashsale?.totalOrderAmount != null ? String(cashsale.totalOrderAmount) : "");
    setInstantInvoiceNo(String(cashsale?.invoiceNo || c.invoiceNo || ""));
    const dsBilling = (ds.billingDetails || {}) as Record<string, any>;
    setUseDifferentBillingDetails(false);
    setBillingName(
      String(dsBilling.billingName || `${c.firstName || ""} ${c.familyName || ""}`.trim()).trim()
    );
    setBillingPhone(String(dsBilling.billingPhone || c.mobile || "").trim());
    setBillingAddress(String(dsBilling.billingAddress || "").trim());
    setBillingGstin(String(dsBilling.gstin || "").trim().toUpperCase());
    setValidationError("");
    setLeadType(c.leadType || "");
    setPaymentAmount(c.paymentAmount != null ? String(c.paymentAmount) : "");
    setPaymentMethod(c.paymentMethod || "");
    setPaymentNote(c.paymentNote || "");
    setActiveSection("basic");
  }, [customer?.id]);

  if (!customer) return null;

  const isPayment = PAYMENT_TYPES.includes(leadType);
  const isDealCreated = status === "Deal Created";
  const isInstantSale = isDealCreated && dealMode === "instant_sale";

  const handleSave = async () => {
    setValidationError("");
    const nowIso = new Date().toISOString();
    if (isDealCreated) {
      const missing: string[] = [];
      if (!inquiryStatus.trim()) missing.push("Inquiry Status");
      if (!measurementRequired.trim()) missing.push("Measurement Required");
      if (!advanceReceived.trim()) missing.push("Advance Received");
      if (!dealCustomerId.trim()) missing.push("Customer ID");
      if (!dealName.trim()) missing.push("Deal Name");
      if (dealMode === "instant_sale") {
        if (!instantDealNo.trim()) missing.push("Deal No");
        if (!instantOrderId.trim()) missing.push("Order ID");
        if (!instantInvoiceNo.trim()) missing.push("Invoice No");
        const parsedOrderAmount = Number(instantOrderAmount);
        if (!instantOrderAmount.trim() || !Number.isFinite(parsedOrderAmount) || parsedOrderAmount <= 0) {
          missing.push("Order Amount");
        }
      } else {
        if (!latestDealId.trim()) missing.push("Latest Deal ID");
        if (!latestDealDocId.trim()) missing.push("Latest Deal Doc ID");
      }
      if (useDifferentBillingDetails) {
        if (!billingName.trim()) missing.push("Billing Name");
        if (!billingPhone.trim()) missing.push("Billing Phone");
        if (!billingAddress.trim()) missing.push("Billing Address");
        if (!billingGstin.trim()) missing.push("Billing GST");
      }

      if (missing.length > 0) {
        setValidationError(`Fill required deal fields: ${missing.join(", ")}`);
        setActiveSection("basic");
        return;
      }
    }

    setSaving(true);
    try {
      const patch: Record<string, any> = {
        firstName: firstName.trim(),
        familyName: familyName.trim(),
        mobile: mobile.trim(),
        email: email.trim(),
        customerType,
        lookingFor: lookingFor.trim(),
        status,
        store,
        storeName: store,
        originStoreName: store,
        assignedStoreName: store,
        leadType,
      };
      if (isDealCreated) {
        const inquiry = inquiryStatus.trim();
        const msr = measurementRequired.trim();
        const adv = advanceReceived.trim();
        const dealId = (dealMode === "instant_sale" ? instantDealNo : latestDealId).trim();
        const dealDocId = latestDealDocId.trim() || dealId;
        const custId = dealCustomerId.trim();
        const title = dealName.trim();
        const selectedBillingDetails = useDifferentBillingDetails
          ? {
              billingName: billingName.trim(),
              billingPhone: billingPhone.trim(),
              billingAddress: billingAddress.trim(),
              gstin: billingGstin.trim().toUpperCase(),
              isDefault: true,
            }
          : undefined;
        patch.inquiryStatus = inquiry;
        patch.measurementRequired = msr;
        patch.advanceReceived = adv;
        patch.latestDealId = dealId;
        patch.latestDealDocId = dealDocId;
        patch.dealSnapshot = {
          status: inquiry,
          dealDocId,
          dealId,
          customerId: custId,
          dealName: title,
          measurementRequired: msr,
          advanceReceived: adv,
          ...(selectedBillingDetails ? { billingDetails: selectedBillingDetails } : {}),
          createdAt: nowIso,
        };
        patch.useDifferentBillingDetails = Boolean(selectedBillingDetails);
        if (selectedBillingDetails) {
          patch.billingDetails = selectedBillingDetails;
        }
        if (dealMode === "instant_sale") {
          const orderId = instantOrderId.trim();
          const orderAmount = Number(instantOrderAmount) || 0;
          const invoiceNo = instantInvoiceNo.trim();
          const existingCashsaleCreatedAt = String((customer as any)?.cashsale?.createdAt || "").trim();
          const existingDealType = String(
            (customer as any)?.cashsale?.dealType || (customer as any)?.saleFlowType || ""
          )
            .trim()
            .toLowerCase();
          const normalizedDealType = existingDealType.includes("walkin") ? "WALKIN-SALE" : "CASHSALE";
          const saleFlowType = normalizedDealType === "WALKIN-SALE" ? "walkin-sale" : "cashsale";
          patch.cashsale = {
            created: true,
            OrderId: orderId,
            dealId,
            orderNo: orderId,
            orderNumber: orderId,
            crmOrderNo: orderId,
            invoiceNo,
            totalOrderAmount: orderAmount,
            dealType: normalizedDealType,
            status: "PURCHASED",
            type: "INSTANT",
            saleChannel: saleFlowType,
            updatedAt: nowIso,
            createdAt: existingCashsaleCreatedAt || nowIso,
          };
          patch.latestOrderId = orderId;
          patch.invoiceNo = invoiceNo;
          patch.saleFlowType = saleFlowType;
          patch.saleFlowSource = "walkin";
        }
      }
      if (isPayment) {
        patch.paymentAmount = Number(paymentAmount) || 0;
        patch.paymentMethod = paymentMethod;
        patch.paymentNote   = paymentNote.trim();
      }
      await onSave(patch);
      onClose();
    } finally { setSaving(false); }
  };

  const FL = ({ children, req }: { children: React.ReactNode; req?: boolean }) => (
    <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
      {children}{req && <span className="text-rose-400 ml-0.5">*</span>}
    </Label>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg rounded-2xl p-0 overflow-hidden border-slate-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-4 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="text-slate-900 flex items-center gap-2">
              <PencilLine className="h-4 w-4 text-indigo-500" />
              Edit Customer Record
              <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-100 rounded-full px-2 py-0.5 ml-1">Admin Only</span>
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              {(customer as any).walkinId || customer.id?.slice(0, 8)} · {(customer as any).firstName} {(customer as any).familyName}
            </p>
          </DialogHeader>
          {/* Section toggle */}
          <div className="flex gap-1 mt-3 bg-indigo-100/60 rounded-xl p-1">
            {[{ key: "basic", label: "Basic Info" }, { key: "return", label: "Return Visit" }].map(({ key, label }) => (
              <button key={key} type="button" onClick={() => setActiveSection(key as "basic" | "return")}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all ${activeSection === key ? "bg-white text-indigo-700 shadow-sm" : "text-indigo-400 hover:text-indigo-600"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Basic Info ── */}
          {activeSection === "basic" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <FL req>First Name</FL>
                  <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" className="rounded-xl border-slate-200 h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <FL>Family Name</FL>
                  <Input value={familyName} onChange={e => setFamilyName(e.target.value)} placeholder="Family name" className="rounded-xl border-slate-200 h-9 text-sm" />
                </div>
              </div>

              <div className="space-y-1.5">
                <FL req>Mobile Number</FL>
                <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="10-digit mobile" className="rounded-xl border-slate-200 h-9 text-sm font-mono" />
              </div>

              <div className="space-y-1.5">
                <FL>Email</FL>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" className="rounded-xl border-slate-200 h-9 text-sm" />
              </div>

              <div className="space-y-1.5">
                <FL>Customer Type</FL>
                <Select value={customerType} onValueChange={setCustomerType}>
                  <SelectTrigger className="rounded-xl border-slate-200 h-9 text-sm"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="New-Customer">✦ New Customer</SelectItem>
                    <SelectItem value="Returning-Customer">↩ Returning Customer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <FL>Looking For</FL>
                <Input value={lookingFor} onChange={e => setLookingFor(e.target.value)} placeholder="e.g. Curtains, Blinds, Wallpaper…" className="rounded-xl border-slate-200 h-9 text-sm" />
                <p className="text-[10px] text-slate-400">Separate multiple items with a comma</p>
              </div>

              <div className="space-y-1.5">
                <FL>Status</FL>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value);
                    setValidationError("");
                    if (value === "Deal Created" && !inquiryStatus.trim()) setInquiryStatus("Inquery made");
                  }}
                >
                  <SelectTrigger className="rounded-xl border-slate-200 h-9 text-sm"><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Attended">Attended</SelectItem>
                    <SelectItem value="Handed Over">Handed Over</SelectItem>
                    <SelectItem value="Deal Created">Deal Created</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="went-back">Went Back</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isDealCreated && (
                <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Deal Created Details</p>
                    <span className="text-[10px] font-semibold text-emerald-700">Required</span>
                  </div>
                  <div className="space-y-1.5">
                    <FL req>Inquiry Status</FL>
                    <Input value={inquiryStatus} onChange={e => setInquiryStatus(e.target.value)} placeholder="Inquery made" className="rounded-xl border-emerald-200 h-9 text-sm bg-white" />
                  </div>
                  <div className="space-y-1.5">
                    <FL req>Deal Flow</FL>
                    <Select value={dealMode} onValueChange={(value) => setDealMode(value as "deal" | "instant_sale")}>
                      <SelectTrigger className="rounded-xl border-emerald-200 h-9 text-sm bg-white"><SelectValue placeholder="Select flow" /></SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="deal">Regular Deal</SelectItem>
                        <SelectItem value="instant_sale">Instant Sale</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <FL req>Measurement Required</FL>
                      <Select value={measurementRequired} onValueChange={setMeasurementRequired}>
                        <SelectTrigger className="rounded-xl border-emerald-200 h-9 text-sm bg-white"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <FL req>Advance Received</FL>
                      <Select value={advanceReceived} onValueChange={setAdvanceReceived}>
                        <SelectTrigger className="rounded-xl border-emerald-200 h-9 text-sm bg-white"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {!isInstantSale && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <FL req>Latest Deal ID</FL>
                        <Input value={latestDealId} onChange={e => setLatestDealId(e.target.value)} placeholder="e.g. DEAL-043" className="rounded-xl border-emerald-200 h-9 text-sm bg-white font-mono" />
                      </div>
                      <div className="space-y-1.5">
                        <FL req>Latest Deal Doc ID</FL>
                        <Input value={latestDealDocId} onChange={e => setLatestDealDocId(e.target.value)} placeholder="Firestore deal doc id" className="rounded-xl border-emerald-200 h-9 text-sm bg-white font-mono" />
                      </div>
                    </div>
                  )}
                  {isInstantSale && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <FL req>Deal No</FL>
                          <Input value={instantDealNo} onChange={e => setInstantDealNo(e.target.value)} placeholder="e.g. DEAL-043" className="rounded-xl border-emerald-200 h-9 text-sm bg-white font-mono" />
                        </div>
                        <div className="space-y-1.5">
                          <FL req>Order ID</FL>
                          <Input value={instantOrderId} onChange={e => setInstantOrderId(e.target.value)} placeholder="e.g. ORD-1001" className="rounded-xl border-emerald-200 h-9 text-sm bg-white font-mono" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <FL req>Order Amount</FL>
                          <Input type="number" value={instantOrderAmount} onChange={e => setInstantOrderAmount(e.target.value)} placeholder="0.00" className="rounded-xl border-emerald-200 h-9 text-sm bg-white" />
                        </div>
                        <div className="space-y-1.5">
                          <FL req>Invoice No</FL>
                          <Input value={instantInvoiceNo} onChange={e => setInstantInvoiceNo(e.target.value)} placeholder="e.g. INV-2026-001" className="rounded-xl border-emerald-200 h-9 text-sm bg-white font-mono" />
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2 rounded-xl border border-emerald-200/70 bg-white/70 p-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="walkin-different-billing"
                        checked={useDifferentBillingDetails}
                        onCheckedChange={(checked) => setUseDifferentBillingDetails(Boolean(checked))}
                      />
                      <Label
                        htmlFor="walkin-different-billing"
                        className="text-xs font-semibold text-emerald-800"
                      >
                        Different Billing Details
                      </Label>
                    </div>
                    {useDifferentBillingDetails && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <FL req>Billing Name</FL>
                          <Input
                            value={billingName}
                            onChange={(e) => setBillingName(e.target.value)}
                            placeholder="Billing company / name"
                            className="rounded-xl border-emerald-200 h-9 text-sm bg-white"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <FL req>Billing Phone</FL>
                          <Input
                            value={billingPhone}
                            onChange={(e) => setBillingPhone(e.target.value)}
                            placeholder="Billing contact"
                            className="rounded-xl border-emerald-200 h-9 text-sm bg-white"
                          />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                          <FL req>Billing Address</FL>
                          <Input
                            value={billingAddress}
                            onChange={(e) => setBillingAddress(e.target.value)}
                            placeholder="Billing address"
                            className="rounded-xl border-emerald-200 h-9 text-sm bg-white"
                          />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                          <FL req>Billing GST</FL>
                          <Input
                            value={billingGstin}
                            onChange={(e) => setBillingGstin(e.target.value)}
                            placeholder="GSTIN"
                            className="rounded-xl border-emerald-200 h-9 text-sm bg-white uppercase"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <FL req>Customer ID</FL>
                      <Input value={dealCustomerId} onChange={e => setDealCustomerId(e.target.value)} placeholder="Customer doc id" className="rounded-xl border-emerald-200 h-9 text-sm bg-white font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <FL req>Deal Name</FL>
                      <Input value={dealName} onChange={e => setDealName(e.target.value)} placeholder="WalkIn" className="rounded-xl border-emerald-200 h-9 text-sm bg-white" />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <FL>Store</FL>
                <Select value={store} onValueChange={(value) => setStore(value as (typeof BRANCHES)[number])}>
                  <SelectTrigger className="rounded-xl border-slate-200 h-9 text-sm">
                    <SelectValue placeholder="Select store" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {BRANCHES.map((branch) => (
                      <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {validationError && (
                <p className="text-xs font-medium text-rose-600">{validationError}</p>
              )}
            </div>
          )}

          {/* ── Return Visit ── */}
          {activeSection === "return" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700 flex items-start gap-2">
                <PencilLine className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>These fields are auto-populated when a salesman logs a return customer action. Edit carefully.</span>
              </div>

              <div className="space-y-1.5">
                <FL>Lead / Visit Type</FL>
                <Select value={leadType} onValueChange={setLeadType}>
                  <SelectTrigger className="rounded-xl border-slate-200 h-9 text-sm"><SelectValue placeholder="Select lead type" /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="">— None —</SelectItem>
                    {[...PAYMENT_TYPES, ...FABRIC_TYPES, ...COLLECTION_TYPES].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isPayment && (
                <>
                  <div className="space-y-1.5">
                    <FL>Payment Method</FL>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="rounded-xl border-slate-200 h-9 text-sm"><SelectValue placeholder="Select method" /></SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="UPI">UPI / Online</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <FL>Amount Paid (₹)</FL>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">₹</span>
                      <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" className="pl-7 rounded-xl border-slate-200 h-9 text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <FL>Payment Note</FL>
                    <Input value={paymentNote} onChange={e => setPaymentNote(e.target.value)} placeholder="Optional note about this payment…" className="rounded-xl border-slate-200 h-9 text-sm" />
                  </div>
                </>
              )}

              {!leadType && (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                  <RefreshCw className="h-7 w-7 opacity-30" />
                  <p className="text-sm text-center">Select a lead type above to<br />see the relevant fields.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-4 flex gap-2 justify-end border-t border-slate-100 flex-shrink-0 bg-white">
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl border-slate-200">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-sm px-5">
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function WalkinDataPage() {
  const [walkinData,       setWalkinData]       = useState<Walkin_Customer[]>([]);
  const [salesmen,         setSalesmen]         = useState<User[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [updatingId,       setUpdatingId]       = useState<string | null>(null);
  const [selectedOrderId,  setSelectedOrderId]  = useState<string | null>(null);
  const [sections,         setSections]         = useState<OrderSections>({});
  const [workflow,         setWorkflow]         = useState<WorkflowStep[]>([]);
  const [search,           setSearch]           = useState("");
  const [activeBranch,     setActiveBranch]     = useState<Branch>("all");
  const [activeTab,        setActiveTab]        = useState("all");

  // Went-back dialog
  const [wentBackCustomer, setWentBackCustomer] = useState<Walkin_Customer | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [answer,           setAnswer]           = useState("");
  const [followUpDate,     setFollowUpDate]     = useState("");
  const [qaList,           setQaList]           = useState<WentBackQaItem[]>([]);

  // Edit customer dialog
  const [editCustomer, setEditCustomer] = useState<Walkin_Customer | null>(null);

  const { toast } = useToast();
  const { user }  = useAuth();

  const isAdmin        = user?.role === "admin";
  const isCrm          = user?.designation === "CRM";
  const isPC           = user?.designation === "PC";
  const isSalesmanager = user?.designation === "salesmanager" || (user?.designation as string) === "headsalesmanager";
  const canManage      = isCrm || isAdmin;
  const canAcknowledge = isAdmin || isSalesmanager;

  // The store this user belongs to (from their User doc)
  const userStore: string = String(
    (user as any)?.store ||
    (user as any)?.storeName ||
    (user as any)?.branch ||
    ""
  ).trim();
  // Non-admin users are locked to their own branch; admin sees all
  const canSeeAllBranches = isAdmin;

  // Set initial branch tab based on user's store
  useEffect(() => {
    if (!canSeeAllBranches && userStore) {
      setActiveBranch(userStore as Branch);
    }
  }, [userStore, canSeeAllBranches]);

  // ── Firestore ──
  useEffect(() => {
    if (!user?.id) { setWalkinData([]); setLoading(false); return; }
    setLoading(true);
    const q = isAdmin || isSalesmanager || isPC
      ? query(collection(db, "Walkin_Customer"))
      : query(collection(db, "Walkin_Customer"), where("createdById", "==", user.id));
    const unsub = onSnapshot(q,
      (snap) => {
        setWalkinData(
          snap.docs
            .map((d) => {
              const row = { id: d.id, ...d.data() } as Walkin_Customer & Record<string, any>;
              const resolvedStore = resolveWalkinStore(row);
              if (resolvedStore) {
                row.store = resolvedStore;
                row.storeName = resolvedStore;
              }
              return row as Walkin_Customer;
            })
            .sort(
              (a, b) =>
                new Date((b as any).createdAt || 0).getTime() -
                new Date((a as any).createdAt || 0).getTime()
            )
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    getSalesmen().then(setSalesmen);
    return () => unsub();
  }, [user?.id]);

  useEffect(() => {
    if (!selectedOrderId) return;
    getDocs(query(collection(db, "orders"), where("orderId", "==", selectedOrderId))).then((snap) => {
      if (snap.empty) return;
      const data = snap.docs[0].data();
      setSections(data.sections || {});
      setWorkflow(Object.values(data.workflow?.milestones || {}));
    });
  }, [selectedOrderId]);

  // ── Actions ──
  const handleAttend = async (customerId: string) => {
    if (!user) return;
    setUpdatingId(customerId);
    try {
      const res = await attendToWalkin(customerId, { id: user.id, name: user.name });
      toast(res.success ? { title: "Now attending customer" } : { variant: "destructive", title: "Error", description: res.message });
    } finally { setUpdatingId(null); }
  };

  const handleHandover = async (customerId: string, salesman: User) => {
    if (!user) return;
    setUpdatingId(customerId);
    try {
      const res = await handoverToSalesman(
        customerId,
        { id: salesman.id, name: salesman.name },
        { id: user.id, name: user.name, role: (user as any)?.role || null }
      );
      toast(res.success ? { title: `Handed over to ${salesman.name}` } : { variant: "destructive", title: "Error", description: res.message });
    } finally { setUpdatingId(null); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "Walkin_Customer", id));
      toast({ title: "Customer deleted" });
    } catch { toast({ variant: "destructive", title: "Delete failed" }); }
  };

  const handleAcknowledge = async (id: string) => {
    try {
      await updateDoc(doc(db, "Walkin_Customer", id), {
        acknowledgedStatus: { status: true, acknowledgedBy: user?.name, updatedAt: new Date().toISOString() },
      });
      toast({ title: "Acknowledged ✓" });
    } catch (e) { console.error(e); }
  };

  const handleEditSave = async (patch: Record<string, any>) => {
    if (!editCustomer) return;
    const nowIso = new Date().toISOString();
    await updateDoc(doc(db, "Walkin_Customer", editCustomer.id), {
      ...patch,
      updatedBy: { userId: user?.id, username: user?.name },
      updatedAt: nowIso,
    });

    const incomingBilling = patch?.billingDetails as Record<string, any> | undefined;
    const customerId = String(
      patch?.dealSnapshot?.customerId || patch?.dealCustomerId || ""
    ).trim();

    if (incomingBilling && customerId) {
      const resolvedDealId = String(
        patch?.dealSnapshot?.dealId || patch?.latestDealId || ""
      ).trim();
      const normalizedIncoming = {
        billingName: String(incomingBilling.billingName || "").trim(),
        billingPhone: String(incomingBilling.billingPhone || "").trim(),
        billingAddress: String(incomingBilling.billingAddress || "").trim(),
        gstin: String(incomingBilling.gstin || "").trim().toUpperCase(),
        isDefault: true,
        updatedAt: nowIso,
        createdAt: nowIso,
        source: "walkin-deal",
        ...(resolvedDealId ? { dealId: resolvedDealId } : {}),
      };
      if (
        normalizedIncoming.billingName ||
        normalizedIncoming.billingPhone ||
        normalizedIncoming.billingAddress ||
        normalizedIncoming.gstin
      ) {
        const customerRef = doc(db, "customers", customerId);
        const customerSnap = await getDoc(customerRef);
        if (customerSnap.exists()) {
          const existingRows = Array.isArray(customerSnap.data()?.billingDetails)
            ? customerSnap.data()?.billingDetails
            : [];
          let replaced = false;
          const mergedRows = existingRows.map((row: any) => {
            const sameAs =
              String(row?.billingName || "").trim().toLowerCase() ===
                normalizedIncoming.billingName.toLowerCase() &&
              String(row?.billingPhone || "").trim() === normalizedIncoming.billingPhone &&
              String(row?.billingAddress || "").trim().toLowerCase() ===
                normalizedIncoming.billingAddress.toLowerCase() &&
              String(row?.gstin || "").trim().toUpperCase() === normalizedIncoming.gstin;

            if (sameAs) {
              replaced = true;
              return {
                ...row,
                ...normalizedIncoming,
                createdAt: row?.createdAt || nowIso,
              };
            }
            return {
              ...row,
              isDefault: false,
            };
          });
          if (!replaced) {
            mergedRows.unshift(normalizedIncoming);
          }
          await updateDoc(customerRef, {
            billingDetails: mergedRows.slice(0, 20),
            lastUpdatedAt: nowIso,
          });
        }
      }
    }
    toast({ title: "Record updated ✓" });
  };

  // ── Went-back ──
  const resetWentBack = () => {
    setWentBackCustomer(null); setSelectedQuestion(""); setAnswer(""); setFollowUpDate(""); setQaList([]);
  };

  const handleAddResponse = () => {
    const isFollowUp = FOLLOW_UP_QUESTIONS.includes(selectedQuestion);
    const isNoAnswer = NO_ANSWER_QUESTIONS.includes(selectedQuestion);
    if (!selectedQuestion) { toast({ variant: "destructive", title: "Select a question first" }); return; }
    if (!isNoAnswer && !answer) { toast({ variant: "destructive", title: "Enter an answer" }); return; }
    if (isFollowUp && !followUpDate) { toast({ variant: "destructive", title: "Select a revisit date" }); return; }
    setQaList(prev => [...prev, { question: selectedQuestion, answer: isNoAnswer ? "N/A" : answer, wentBackdate: isFollowUp ? followUpDate : "Not Required" }]);
    setSelectedQuestion(""); setAnswer(""); setFollowUpDate("");
  };

  const handleSubmitWentBack = async () => {
    if (!wentBackCustomer || !qaList.length) { toast({ variant: "destructive", title: "Add at least one response" }); return; }
    try {
      await updateDoc(doc(db, "Walkin_Customer", wentBackCustomer.id), {
        wentBackResponses: qaList,
        acknowledgedStatus: { status: true, acknowledgedBy: user?.name || "Unknown", updatedAt: new Date().toISOString() },
        lastUpdatedAt: new Date().toISOString(),
      });
      toast({ title: "Went-back responses saved ✓" });
      resetWentBack();
    } catch { toast({ variant: "destructive", title: "Save failed" }); }
  };

  // ── Derived ──
  const fmtLooking = (v?: string | string[]) => Array.isArray(v) ? v.filter(Boolean).join(", ") || "—" : v || "—";

  // Branch-filtered base set: non-admin always locked to their store
  const branchFiltered = walkinData.filter(c => {
    if (canSeeAllBranches) {
      return activeBranch === "all" ? true : (c as any).store === activeBranch;
    }
    // Non-admin: only see their own store
    return (c as any).store === userStore;
  });

  const getFiltered = (tab: string) =>
    branchFiltered
      .filter(c => tab === "went-back" ? (c.status as string) === "went-back" : tab === "completed" ? (c.status as string) === "completed" : true)
      .filter(c => { const q = search.toLowerCase(); return !q || `${(c as any).firstName} ${(c as any).familyName} ${(c as any).mobile}`.toLowerCase().includes(q); });

  const stats = {
    total:     branchFiltered.length,
    pending:   branchFiltered.filter(c => c.status === "Pending").length,
    attended:  branchFiltered.filter(c => c.status === "Attended").length,
    handed:    branchFiltered.filter(c => c.status === "Handed Over").length,
    deal:      branchFiltered.filter(c => c.status === "Deal Created").length,
    completed: branchFiltered.filter(c => (c.status as string) === "completed").length,
    wentBack:  branchFiltered.filter(c => (c.status as string) === "went-back").length,
    // per-branch counts for the branch tabs (admin only)
    gcr:       walkinData.filter(c => (c as any).store === "MO GCR BRANCH").length,
    mg:        walkinData.filter(c => (c as any).store === "MO MG ROAD").length,
  };

  // ── Action Cell ──
  const ActionCell = ({ customer: c }: { customer: Walkin_Customer }) => {
    const busy  = updatingId === c.id;
    const isAck = (c as any).acknowledgedStatus?.status === true || (c as any).acknowledgedStatus?.status === "true";
    const canCrmHandover = canManage && c.status === "Attended" && (c as any).attendedBy?.id === user?.id;
    const canAdminChangeSalesman = isAdmin && (c.status as string) !== "completed";
    const showSalesmanAssignment = canCrmHandover || canAdminChangeSalesman;
    const hasSalesman = Boolean(String((c as any).salesmanId || "").trim());
    const salesmanButtonLabel = isAdmin
      ? (hasSalesman ? "Change Salesman" : "Assign Salesman")
      : "Handover";

    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {canManage && c.status === "Pending" && (
          <Button size="sm" variant="outline"
            className="h-7 gap-1 text-xs border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
            onClick={() => handleAttend(c.id)} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
            Attend
          </Button>
        )}

        {showSalesmanAssignment && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline"
                className="h-7 gap-1 text-xs border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg"
                disabled={busy}>
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRightLeft className="h-3 w-3" />}
                {salesmanButtonLabel} <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44 rounded-xl border-slate-200">
              {salesmen.map(s => (
                <DropdownMenuItem key={s.id} onSelect={() => handleHandover(c.id, s)} className="rounded-lg text-sm gap-2">
                  <Users className="h-3 w-3 text-stone-400" />{s.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {canAcknowledge && (
          isAck ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
              <BadgeCheck className="h-3.5 w-3.5" /> Acknowledged
            </span>
          ) : (c.status as string) === "went-back" || (c as any).salesmanId === "X19M4xbMLbYNisf7ghBK2XTz36F2" ? (
            <Button size="sm" variant="outline"
              className="h-7 gap-1 text-xs border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
              onClick={() => setWentBackCustomer(c)}>
              <MessageSquarePlus className="h-3 w-3" /> Acknowledge
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline"
                  className="h-7 gap-1 text-xs border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg">
                  <BadgeCheck className="h-3 w-3" /> Acknowledge
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Acknowledgement</AlertDialogTitle>
                  <AlertDialogDescription>Mark this customer as acknowledged?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction className="rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => handleAcknowledge(c.id)}>Confirm</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        )}

        {/* Admin edit — available for ALL leads, no leadType condition */}
        {(isAdmin || isSalesmanager || isPC) && (
          <Button size="sm" variant="outline"
            className="h-7 gap-1 text-xs border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg"
            onClick={() => setEditCustomer(c)}>
            <PencilLine className="h-3 w-3" /> Edit
          </Button>
        )}

        {/* View sheet */}
        <Sheet>
          <SheetTrigger asChild>
            <Button size="sm" variant="ghost"
              className="h-7 gap-1 text-xs text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg"
              onClick={() => (c as any).cashsale?.OrderId && setSelectedOrderId((c as any).cashsale.OrderId)}>
              <Eye className="h-3 w-3" /> View
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[440px] sm:w-[480px] overflow-y-auto p-0 bg-[#f8f9fb] border-l border-stone-200">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white border-b border-stone-100 px-6 py-4 shadow-sm">
              <SheetHeader>
                <SheetTitle className="text-base font-semibold text-stone-900">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      (c as any).customerType === "Returning-Customer" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                    }`}>
                      {(c as any).firstName?.[0]}{(c as any).familyName?.[0]}
                    </div>
                    <div>
                      <div className="text-base font-bold text-stone-900">{(c as any).firstName} {(c as any).familyName}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <code className="text-[10px] text-stone-400 font-mono">{(c as any).walkinId || c.id?.slice(0, 8)}</code>
                        <StatusBadge status={c.status} />
                        {/* ── New / Returning chip ── */}
                        <CustomerTypeBadge type={(c as any).customerType} />
                        <InstantSaleBadge customer={c} />
                        {(c as any).leadType && <LeadTypeBadge type={(c as any).leadType} />}
                      </div>
                    </div>
                  </div>
                </SheetTitle>
              </SheetHeader>
            </div>

            <div className="px-5 py-5 space-y-5">
              <SheetSection icon={<ClipboardList className="h-3.5 w-3.5" />} title="Contact Info">
                <SheetRow label="Mobile" value={<span className="font-mono text-xs">{(c as any).mobile}</span>} />
                <SheetRow label="Email"  value={(c as any).email || "—"} />
                <SheetRow label="Customer Type" value={
                  <CustomerTypeBadge type={(c as any).customerType} />
                } />
                <SheetRow label="Sale Flow" value={getInstantSaleMeta(c)?.label || "â€”"} />
                <SheetRow label="Looking For" value={fmtLooking((c as any).lookingFor)} />
                <SheetRow label="Created" value={(c as any).createdAt ? format(new Date((c as any).createdAt), "dd MMM yyyy, hh:mm a") : "—"} />
              </SheetSection>

              <SheetSection icon={<Users className="h-3.5 w-3.5" />} title="Handling">
                <SheetRow label="Attended By" value={(c as any).attendedBy?.name || "—"} />
                <SheetRow label="Handed To"   value={(c as any).salesmanName || "—"} />
                <SheetRow label="Acknowledged" value={
                  (c as any).acknowledgedStatus?.status
                    ? <span className="text-emerald-600 text-xs font-semibold flex items-center gap-1"><BadgeCheck className="h-3 w-3" /> Yes — {(c as any).acknowledgedStatus.acknowledgedBy}</span>
                    : <span className="text-stone-400 text-xs">Not yet</span>
                } />
              </SheetSection>

              {/* Return Customer Data */}
              {(c as any).leadType && (
                <ReturnCustomerSection customer={c} isAdmin={isAdmin} onEdit={() => setEditCustomer(c)} />
              )}

              {/* Went-back reasons */}
              {(c as any).wentBackResponses?.length > 0 && (
                <SheetSection icon={<AlertCircle className="h-3.5 w-3.5" />} title="Went Back Reasons">
                  {(c as any).wentBackResponses.map((wb: WentBackQaItem, i: number) => (
                    <div key={i} className="px-4 py-3 bg-white border-b border-stone-50 last:border-0">
                      <p className="text-[11px] font-semibold text-rose-600">{wb.question}</p>
                      <p className="text-[11px] text-stone-500 mt-1">Answer: {wb.answer}</p>
                      {wb.wentBackdate && wb.wentBackdate !== "Not Required" && (
                        <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />{wb.wentBackdate}
                        </p>
                      )}
                    </div>
                  ))}
                </SheetSection>
              )}

              {/* Deal snapshot */}
              {(c as any).dealSnapshot && (
                <SheetSection icon={<Package className="h-3.5 w-3.5" />} title="Deal Snapshot">
                  <SheetRow label="Deal ID"          value={<span className="font-mono text-xs">{(c as any).dealSnapshot.dealId || "—"}</span>} />
                  <SheetRow label="Deal Name"         value={(c as any).dealSnapshot.dealName || "—"} />
                  <SheetRow label="Advance Received"  value={(c as any).dealSnapshot.advanceReceived || "—"} />
                  <SheetRow label="Measurement Req."  value={(c as any).dealSnapshot.measurementRequired || "—"} />
                  <SheetRow label="Status"            value={(c as any).dealSnapshot.status || "—"} />
                </SheetSection>
              )}

              {/* Cash sale / instant sale */}
              {(c as any).cashsale && (
                <SheetSection icon={<Receipt className="h-3.5 w-3.5" />} title="Order / Instant Sale">
                  <SheetRow label="Order ID"  value={<span className="font-mono text-xs">{(c as any).cashsale.OrderId}</span>} />
                  {(c as any).cashsale.dealId && (
                    <SheetRow label="Deal No" value={<span className="font-mono text-xs">{(c as any).cashsale.dealId}</span>} />
                  )}
                  {(c as any).cashsale.invoiceNo && (
                    <SheetRow label="Invoice No" value={<span className="font-mono text-xs">{(c as any).cashsale.invoiceNo}</span>} />
                  )}
                  {Number((c as any).cashsale.totalOrderAmount) > 0 && (
                    <SheetRow label="Order Amount" value={`₹${Number((c as any).cashsale.totalOrderAmount).toLocaleString("en-IN")}`} />
                  )}
                  <SheetRow label="Sale Flow" value={getInstantSaleMeta(c)?.label || "â€”"} />
                  <SheetRow label="Deal Type" value={(c as any).cashsale.dealType} />
                  <SheetRow label="Sale Type" value={(c as any).cashsale.type} />
                  <SheetRow label="Status"    value={(c as any).cashsale.status} />
                </SheetSection>
              )}

              {/* Fabric */}
              {sections?.NORMAL?.items?.length > 0 && (
                <SheetSection icon={<ClipboardList className="h-3.5 w-3.5" />} title="Fabric Details">
                  {sections.NORMAL.items.map((item: any, i: number) => (
                    <div key={i} className="px-4 py-3 bg-white border-b border-stone-50 last:border-0">
                      <div className="flex justify-between text-xs font-semibold text-stone-700 mb-1">
                        <span>{item.type}</span>
                        <span className="font-mono text-stone-400 text-[11px]">{item.bcn || "—"}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-stone-400">
                        <span>Qty: {item.qty} {item.unit || "Mtr"}</span>
                        <span>₹{item.totalAmount || "—"}</span>
                      </div>
                    </div>
                  ))}
                </SheetSection>
              )}

              {/* Workflow */}
              {workflow.length > 0 && (
                <SheetSection icon={<GitBranch className="h-3.5 w-3.5" />} title="Order Workflow">
                  {workflow.map((step, i) => {
                    const done = step.status === "DONE";
                    const active = step.status === "IN PROGRESS";
                    return (
                      <div key={i} className={`flex items-center gap-3 px-4 py-2.5 border-b border-stone-50 last:border-0 ${done ? "bg-emerald-50/60" : active ? "bg-sky-50/60" : "bg-white"}`}>
                        {done ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" /> : <Circle className={`h-4 w-4 flex-shrink-0 ${active ? "text-sky-500" : "text-stone-300"}`} />}
                        <span className={`text-xs flex-1 font-medium ${done ? "text-emerald-800" : active ? "text-sky-700" : "text-stone-400"}`}>{step.label}</span>
                        <span className={`text-[10px] font-mono font-bold ${done ? "text-emerald-600" : active ? "text-sky-600" : "text-stone-400"}`}>{step.status}</span>
                      </div>
                    );
                  })}
                </SheetSection>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Delete (admin only) */}
        {isAdmin && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-stone-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this record?</AlertDialogTitle>
                <AlertDialogDescription>This is permanent and cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                <AlertDialogAction className="rounded-xl bg-rose-600 hover:bg-rose-700" onClick={() => handleDelete(c.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    );
  };

  // ── Customer Table ──
  const CustomerTable = ({ rows }: { rows: Walkin_Customer[] }) => (
    <div className="rounded-2xl border border-stone-200 overflow-hidden shadow-sm bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-stone-50 hover:bg-stone-50 border-b border-stone-200">
            {["Date", "Customer", "Mobile", "Looking For", "Status", "Type", "Lead Type", "Store", "Attended By", "Handed To", "Actions"].map(h => (
              <TableHead key={h} className="text-[10px] font-bold text-stone-400 uppercase tracking-widest py-3">{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={11}><Skeleton className="h-8 w-full rounded-xl" /></TableCell></TableRow>
              ))
            : rows.length > 0
              ? rows.map((c, idx) => (
                  <TableRow key={c.id} className={`border-b border-stone-50 last:border-0 hover:bg-stone-50/80 transition-colors ${idx % 2 === 1 ? "bg-stone-50/30" : "bg-white"}`}>
                    <TableCell className="text-[11px] font-mono text-stone-400 whitespace-nowrap">
                      {(c as any).createdAt ? format(new Date((c as any).createdAt), "dd MMM") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                          (c as any).customerType === "Returning-Customer" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                        }`}>
                          {(c as any).firstName?.[0]}{(c as any).familyName?.[0]}
                        </div>
                        <div>
                          <div className="font-semibold text-stone-800 text-[13px] leading-tight">{(c as any).firstName} {(c as any).familyName}</div>
                          <div className="text-[10px] font-mono text-stone-400">{(c as any).walkinId || c.id?.slice(0, 8)}</div>
                          <div className="mt-1">
                            <InstantSaleBadge customer={c} />
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-stone-600">{(c as any).mobile}</TableCell>
                    <TableCell className="text-[12px] text-stone-500 max-w-[120px] truncate">{fmtLooking((c as any).lookingFor)}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    {/* ── New / Returning in table ── */}
                    <TableCell><CustomerTypeBadge type={(c as any).customerType} /></TableCell>
                    <TableCell>
                      {(c as any).leadType
                        ? <LeadTypeBadge type={(c as any).leadType} />
                        : <span className="text-stone-300 text-xs">—</span>
                      }
                    </TableCell>
                    {/* ── Store branch cell ── */}
                    <TableCell>
                      {(c as any).store ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          (c as any).store === "MO GCR BRANCH"
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                            : "bg-violet-50 text-violet-700 border-violet-200"
                        }`}>
                          {(c as any).store === "MO GCR BRANCH" ? "GCR" : "MG Rd"}
                        </span>
                      ) : (
                        <span className="text-stone-300 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[12px] text-stone-500">{(c as any).attendedBy?.name || "—"}</TableCell>
                    <TableCell className="text-[12px] text-stone-500">{(c as any).salesmanName || "—"}</TableCell>
                    <TableCell><ActionCell customer={c} /></TableCell>
                  </TableRow>
                ))
              : (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-stone-400">
                      <Users className="h-8 w-8 text-stone-200" />
                      <span className="text-sm">No walk-in customers found</span>
                    </div>
                  </TableCell>
                </TableRow>
              )
          }
        </TableBody>
      </Table>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      {/* Header */}
      <div className="bg-white border-b border-stone-100 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">Walk-in Desk</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[11px] font-mono text-stone-400 uppercase tracking-wider">CRM · Floor Operations</p>
              {!canSeeAllBranches && userStore && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">
                  {userStore}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-mono font-semibold text-emerald-600 tracking-widest">LIVE</span>
          </div>
        </div>

        {/* Branch tabs — admin only */}
        {canSeeAllBranches && (
          <div className="flex items-center gap-2 mt-4 border-t border-stone-100 pt-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mr-1">Branch</span>
            {([
              { v: "all",            label: "All Branches", count: walkinData.length,                              color: "border-stone-300 bg-stone-50 text-stone-700",   activeColor: "bg-stone-800 text-white border-stone-800" },
              { v: "MO GCR BRANCH",  label: "MO GCR Branch", count: stats.gcr,                                    color: "border-indigo-200 bg-indigo-50 text-indigo-700", activeColor: "bg-indigo-600 text-white border-indigo-600" },
              { v: "MO MG ROAD",     label: "MO MG Road",    count: stats.mg,                                     color: "border-violet-200 bg-violet-50 text-violet-700", activeColor: "bg-violet-600 text-white border-violet-600" },
            ] as const).map(({ v, label, count, color, activeColor }) => (
              <button
                key={v}
                type="button"
                onClick={() => setActiveBranch(v as Branch)}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  activeBranch === v ? activeColor : color + " hover:opacity-80"
                }`}
              >
                {label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  activeBranch === v ? "bg-white/20" : "bg-white/60"
                }`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="bg-white border-b border-stone-100 w-full">
        <div className="grid grid-cols-4 md:grid-cols-7 divide-x divide-stone-100">
          {[
            { label: "Total",        value: stats.total,     color: "text-stone-900" },
            { label: "Pending",      value: stats.pending,   color: "text-stone-400" },
            { label: "Attended",     value: stats.attended,  color: "text-sky-600" },
            { label: "Handed Over",  value: stats.handed,    color: "text-amber-600" },
            { label: "Deal Created", value: stats.deal,      color: "text-indigo-600" },
            { label: "Completed",    value: stats.completed, color: "text-teal-600" },
            { label: "Went Back",    value: stats.wentBack,  color: "text-rose-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col gap-0.5 px-5 py-4 hover:bg-stone-50 transition-colors cursor-default">
              <span className={`text-2xl font-bold tracking-tight ${color}`}>{loading ? "—" : value}</span>
              <span className="text-[10px] font-mono text-stone-400 uppercase tracking-widest">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 md:p-6 w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <TabsList className="bg-stone-100 h-9 p-1 rounded-xl gap-0.5">
              {[
                { v: "all",       label: "All Leads",  count: stats.total,     cc: "bg-stone-200 text-stone-500" },
                { v: "completed", label: "Completed",  count: stats.completed, cc: "bg-teal-100 text-teal-600" },
                { v: "went-back", label: "Went Back",  count: stats.wentBack,  cc: "bg-rose-100 text-rose-500" },
              ].map(({ v, label, count, cc }) => (
                <TabsTrigger key={v} value={v}
                  className="text-xs rounded-lg px-3 data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-sm transition-all">
                  {label}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold ${cc}`}>{count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
              <Input
                className="pl-9 h-9 text-xs w-64 bg-white border-stone-200 rounded-xl shadow-sm placeholder:text-stone-400 focus-visible:ring-emerald-400/30 focus-visible:border-emerald-400"
                placeholder="Search name or mobile…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <TabsContent value="all"><CustomerTable rows={getFiltered("all")} /></TabsContent>
          <TabsContent value="completed"><CustomerTable rows={getFiltered("completed")} /></TabsContent>
          <TabsContent value="went-back"><CustomerTable rows={getFiltered("went-back")} /></TabsContent>
        </Tabs>
      </div>

      {/* ══ Went-back Acknowledge Dialog ══ */}
      <Dialog open={!!wentBackCustomer} onOpenChange={open => !open && resetWentBack()}>
        <DialogContent className="max-w-lg rounded-2xl p-0 overflow-hidden border-slate-200">
          <div className="bg-rose-50 border-b border-rose-100 px-6 py-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base text-slate-900">
                <MessageSquarePlus className="h-4 w-4 text-rose-500" />
                Went Back Details
                {wentBackCustomer && <span className="text-stone-400 font-normal text-sm">· {(wentBackCustomer as any).firstName} {(wentBackCustomer as any).familyName}</span>}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Reason for Went Back</Label>
              <Select value={selectedQuestion} onValueChange={setSelectedQuestion}>
                <SelectTrigger className="rounded-xl border-slate-200 text-sm"><SelectValue placeholder="Select a reason…" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {WENT_BACK_QUESTIONS.map((q, i) => <SelectItem key={i} value={q} className="text-sm rounded-lg">{q}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectedQuestion && !NO_ANSWER_QUESTIONS.includes(selectedQuestion) && (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {FOLLOW_UP_QUESTIONS.includes(selectedQuestion) ? "Additional Notes" : "Answer"}
                </Label>
                <Input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Enter details…" className="rounded-xl border-slate-200 text-sm" />
              </div>
            )}
            {FOLLOW_UP_QUESTIONS.includes(selectedQuestion) && (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <CalendarDays className="h-3 w-3" /> Expected Revisit Date
                </Label>
                <Input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} className="rounded-xl border-slate-200 text-sm w-44" />
              </div>
            )}
            <Button onClick={handleAddResponse} variant="outline" className="w-full h-9 text-sm rounded-xl border-dashed border-stone-300 text-stone-500 hover:bg-stone-50">
              <MessageSquarePlus className="h-3.5 w-3.5 mr-2" /> Add Response
            </Button>
            {qaList.length > 0 && (
              <div className="rounded-2xl border border-stone-100 overflow-hidden max-h-44 overflow-y-auto shadow-sm">
                <div className="px-4 py-2 bg-stone-50 border-b border-stone-100">
                  <span className="text-[10px] font-mono font-semibold text-stone-400 uppercase tracking-wider">{qaList.length} response{qaList.length > 1 ? "s" : ""} added</span>
                </div>
                {qaList.map((item, i) => (
                  <div key={i} className="px-4 py-3 border-b border-stone-50 last:border-0 bg-white">
                    <p className="text-[11px] font-semibold text-stone-700">{item.question}</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">{item.answer}</p>
                    {item.wentBackdate && item.wentBackdate !== "Not Required" && (
                      <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1"><CalendarDays className="h-3 w-3" />{item.wentBackdate}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 h-9 text-sm rounded-xl border-slate-200" onClick={resetWentBack}>Cancel</Button>
              <Button className="flex-1 h-9 text-sm rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" onClick={() => void handleSubmitWentBack()} disabled={!qaList.length}>
                <BadgeCheck className="h-3.5 w-3.5 mr-1.5" /> Submit & Acknowledge
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Full Edit Customer Dialog (Admin only) ══ */}
      <EditCustomerDialog
        customer={editCustomer}
        open={!!editCustomer}
        onClose={() => setEditCustomer(null)}
        onSave={handleEditSave}
      />
    </div>
  );
}
