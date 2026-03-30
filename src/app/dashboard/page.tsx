
"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  FileSignature,
  ShoppingCart,
  Truck,
  Archive,
  Scissors,
  CalendarCheck,
  FileText,
  CheckCircle,
  PhoneCall,
  Bell,
  ListOrdered,
  UserPlus,
  Briefcase,
  ArrowRight,
  Search,
  ClipboardList,
  PackageCheck,
  CreditCard,
  Package,
  Layers,
  Zap,
  ChevronRight,
  X,
  AlertTriangle,
  CheckCircle2,
  ShoppingBag,
  Users,
  RotateCcw,
} from "lucide-react";
import { useEffect, useState, useMemo, useRef, use, useCallback } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  collectionGroup,
  getDocs,
  orderBy,
  doc,
  updateDoc,
  limit,
} from "firebase/firestore";
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { db } from "@/lib/firebase";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { InboundRequest, Order, Quotation, PurchaseRequest, Walkin_Customer } from "@/lib/types";
import { getFollowUpItems } from "./po-tracking/actions";
import { useAuth } from "@/context/AuthContext";
import { format, formatDistanceToNow, set } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import CrmDashboard from "@/components/features/dashboard/CrmDashboard";
import { AccountsDashboard } from "@/components/features/dashboard/AccountsDashboard";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { addCustomerAction, addDealAction } from "./customers/actions";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getNormalizedOrderMilestones, isOrderComplete as isOrderWorkflowComplete } from "@/lib/order-workflow";

type DashboardOrderRisk = "critical" | "watch" | "stable";

interface DashboardOrderRow {
  order: Order;
  progress: number;
  completedMilestones: number;
  totalMilestones: number;
  currentStep: string;
  nextStep: string;
  ageDays: number;
  risk: DashboardOrderRisk;
}

const normalizeText = (value?: string) => String(value || "").trim().toLowerCase();

const toDateSafe = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const date = (value as { toDate?: () => Date }).toDate?.();
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
};

const deriveDashboardOrderRow = (order: Order): DashboardOrderRow => {
  const milestones = getNormalizedOrderMilestones(order);
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter((step) => step.completed).length;
  const progress = totalMilestones ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  const currentStep = [...milestones].reverse().find((step) => step.completed)?.name || "Order Created";
  const nextStep =
    milestones.find((step) => !step.completed)?.name ||
    (totalMilestones ? "Completed" : "Milestone Planning Pending");

  const createdAt = toDateSafe(order.createdAt) || new Date();
  const ageDays = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));

  let risk: DashboardOrderRisk = "stable";
  if (progress < 100 && (ageDays >= 14 || (ageDays >= 10 && progress < 60))) {
    risk = "critical";
  } else if (progress < 100 && (ageDays >= 7 || progress < 75)) {
    risk = "watch";
  }

  return {
    order,
    progress,
    completedMilestones,
    totalMilestones,
    currentStep,
    nextStep,
    ageDays,
    risk,
  };
};

const riskBadgeClassMap: Record<DashboardOrderRisk, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  watch: "border-amber-200 bg-amber-50 text-amber-700",
  stable: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const riskContainerClassMap: Record<DashboardOrderRisk, string> = {
  critical: "border-red-200 bg-red-50/50",
  watch: "border-amber-200 bg-amber-50/40",
  stable: "border-slate-200 bg-white",
};

const riskLabelMap: Record<DashboardOrderRisk, string> = {
  critical: "Critical",
  watch: "Watch",
  stable: "Stable",
};


// ─── Types ────────────────────────────────────────────────────────────────────

type ReturnCustomerType =
  | ""
  | "Balance Payment"
  | "Full Payment"
  | "Advance Payment"
  | "Fabric Selection"
  | "Fabric Changing"
  | "Sample Collection"
  | "Fabric Collection";

type DialogStep = "selectDeal" | "payment" | "collection";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAYMENT_TYPES: ReturnCustomerType[] = ["Balance Payment", "Full Payment", "Advance Payment"];
const FABRIC_TYPES: ReturnCustomerType[] = ["Fabric Selection", "Fabric Changing"];
const COLLECTION_TYPES: ReturnCustomerType[] = ["Sample Collection", "Fabric Collection"];

const isPaymentType = (t: ReturnCustomerType) => PAYMENT_TYPES.includes(t);
const isCollectionType = (t: ReturnCustomerType) => COLLECTION_TYPES.includes(t);
const isFabricType = (t: ReturnCustomerType) => FABRIC_TYPES.includes(t);

const returnTypeIcon = (t: ReturnCustomerType) => {
  if (isPaymentType(t)) return CreditCard;
  if (isCollectionType(t)) return Package;
  if (isFabricType(t)) return Layers;
  return Zap;
};

const returnTypeColor = (t: ReturnCustomerType) => {
  if (isPaymentType(t)) return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
  if (isCollectionType(t)) return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" };
  if (isFabricType(t)) return { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" };
  return { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };
};

// ─── Sub: Stat Card ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  loading,
  accent,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  loading?: boolean;
  accent?: string;
  icon: React.ElementType;
}) {
  return (
    <div className={`rounded-2xl border bg-white px-4 py-3 shadow-sm flex items-center gap-3 ${accent || "border-slate-200"}`}>
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${accent ? accent.replace("border-", "bg-").replace("-200", "-50") : "bg-slate-50"}`}>
        <Icon className={`h-4 w-4 ${accent ? accent.replace("border-", "text-").replace("-200", "-600") : "text-slate-500"}`} />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        {loading ? (
          <Skeleton className="h-6 w-10 mt-0.5" />
        ) : (
          <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
        )}
      </div>
    </div>
  );
}

// ─── Sub: Quick Action Card ───────────────────────────────────────────────────

function QuickAction({ title, href, icon: Icon, accent }: { title: string; href: string; icon: React.ElementType; accent: string }) {
  return (
    <Link href={href} className="group block">
      <div className={`flex items-center justify-between rounded-2xl border bg-white px-4 py-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${accent}`}>
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-orange-600" />
          <span className="text-sm font-semibold text-slate-800">{title}</span>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

// ─── Sub: Lead Card ───────────────────────────────────────────────────────────

function LeadCard({
  lead,
  onCreateDeal,
  onClose,
  onReturnAction,
  onInstantSale,
  isCreatingDeal,
}: {
  lead: any;
  onCreateDeal: () => void;
  onClose: () => void;
  onReturnAction: (type: ReturnCustomerType) => void;
  onInstantSale: () => void;
  isCreatingDeal: boolean;
}) {
  const isReturning = lead.customerType === "Returning-Customer";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-orange-200 hover:shadow transition-all">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${isReturning ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>
            {(lead.firstName || "?")[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-900 truncate">{lead.firstName} {lead.familyName}</p>
              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${isReturning ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                {isReturning ? "Returning" : "New"}
              </span>
            </div>
            <p className="text-xs text-slate-500">{lead.mobile}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 shadow-sm">
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl border-slate-200 shadow-xl w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400">Main</DropdownMenuLabel>
                <DropdownMenuItem onClick={onInstantSale} className="rounded-lg text-sm gap-2">
                  <Zap className="h-3.5 w-3.5 text-orange-500" /> Instant Sale
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onCreateDeal} disabled={isCreatingDeal} className="rounded-lg text-sm gap-2">
                  <Briefcase className="h-3.5 w-3.5 text-indigo-500" /> Create Deal
                </DropdownMenuItem>

                {isReturning && (
                  <>
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">Payment</DropdownMenuLabel>
                    {PAYMENT_TYPES.map((t) => (
                      <DropdownMenuItem key={t} onClick={() => onReturnAction(t)} className="rounded-lg text-sm gap-2">
                        <CreditCard className="h-3.5 w-3.5 text-emerald-500" /> {t}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">Fabric</DropdownMenuLabel>
                    {FABRIC_TYPES.map((t) => (
                      <DropdownMenuItem key={t} onClick={() => onReturnAction(t)} className="rounded-lg text-sm gap-2">
                        <Layers className="h-3.5 w-3.5 text-violet-500" /> {t}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">Collection</DropdownMenuLabel>
                    {COLLECTION_TYPES.map((t) => (
                      <DropdownMenuItem key={t} onClick={() => onReturnAction(t)} className="rounded-lg text-sm gap-2">
                        <Package className="h-3.5 w-3.5 text-blue-500" /> {t}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="outline" onClick={onClose} className="h-8 rounded-xl border-slate-200 text-slate-600 text-xs px-3">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Info row */}
      {lead.lookingFor && (
        <div className="flex items-center gap-1.5 mt-1">
          <Search className="h-3 w-3 text-slate-400" />
          <p className="text-xs text-slate-500 truncate">Looking for: <span className="font-medium text-slate-700">{lead.lookingFor}</span></p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const  SalesmanDashboardV2 =() => {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // ── Data state ──
  const [orders, setOrders] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [walkinLeads, setWalkinLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Search ──
  const [orderSearch, setOrderSearch] = useState("");
  const [leadSearch, setLeadSearch] = useState("");

  // ── Close Lead dialog ──
  const [closingLead, setClosingLead] = useState<any | null>(null);
  const [wentBackRemark, setWentBackRemark] = useState("");
  const [isClosing, setIsClosing] = useState(false);

  // ── Deal Creation dialog ──
  const [dealCreationLead, setDealCreationLead] = useState<any | null>(null);
  const [measurementRequiredAnswer, setMeasurementRequiredAnswer] = useState<"Yes" | "No">("No");
  const [advanceReceivedAnswer, setAdvanceReceivedAnswer] = useState<"Yes" | "No" | "Old">("No");
  const [isCreatingDeal, setIsCreatingDeal] = useState(false);

  // ── Return Customer dialog ──
  const [returnCustomerDialog, setReturnCustomerDialog] = useState(false);
  const [returnCustomerDialogStep, setReturnCustomerDialogStep] = useState<DialogStep>("selectDeal");
  const [returnCustomerLead, setReturnCustomerLead] = useState<any | null>(null);
  const [returnCustomerType, setReturnCustomerType] = useState<ReturnCustomerType>("");
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDeals, setSelectedDeals] = useState<any[]>([]);
  const [dealLoading, setDealLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"" | "Cash" | "Card" | "UPI">("");
  const [leadOrders, setLeadOrders] = useState<any[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Full reset for return customer dialog ──
  const resetReturnDialog = useCallback(() => {
    setReturnCustomerDialog(false);
    setReturnCustomerDialogStep("selectDeal");
    setReturnCustomerLead(null);
    setReturnCustomerType("");
    setDeals([]);
    setSelectedDeals([]);
    setDealLoading(false);
    setPaymentAmount("");
    setPaymentNote("");
    setPaymentMethod("");
    setLeadOrders([]);
    setSelectedOrders([]);
    setLoadingOrders(false);
    setIsSubmitting(false);
  }, []);

  const openReturnAction = (lead: any, type: ReturnCustomerType) => {
    resetReturnDialog();
    setReturnCustomerType(type);
    setReturnCustomerLead(lead);
    setReturnCustomerDialogStep("selectDeal");
    setReturnCustomerDialog(true);
  };

  // ── Firestore ──
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const salesmanName = user.name;
    let loadedOrders = false;
    let loadedLeads = false;
    const markLoaded = () => { if (loadedOrders && loadedLeads) setLoading(false); };

    const unsubOrders = onSnapshot(
      query(collection(db, "orders"), where("salesPerson", "==", salesmanName)),
      (snap) => { setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); loadedOrders = true; markLoaded(); },
      () => { loadedOrders = true; markLoaded(); }
    );
    const unsubQuotations = onSnapshot(
      query(collectionGroup(db, "quotations"), where("representativeId", "==", user.id)),
      (snap) => setQuotations(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setQuotations([])
    );
    const unsubPurchase = onSnapshot(
      query(collection(db, "purchaseRequests"), where("salesman", "==", salesmanName)),
      (snap) => setPurchaseRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setPurchaseRequests([])
    );
    const unsubLeads = onSnapshot(
      query(collection(db, "Walkin_Customer"), where("salesmanId", "==", user.id), where("status", "==", "Handed Over")),
      (snap) => { setWalkinLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); loadedLeads = true; markLoaded(); },
      () => { loadedLeads = true; markLoaded(); }
    );
    const unsubNotifications = onSnapshot(
      query(collection(db, "users", user.id, "notifications"), orderBy("createdAt", "desc"), limit(50)),
      (snap) => setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setNotifications([])
    );

    return () => { unsubOrders(); unsubQuotations(); unsubPurchase(); unsubLeads(); unsubNotifications(); };
  }, [user]);

  // ── Fetch return customer deals ──
  useEffect(() => {
    const fetchData = async () => {
      const mobile = returnCustomerLead?.mobile;
      if (!mobile || mobile.length !== 10) { setDeals([]); return; }
      setDealLoading(true);
      try {
        const custSnap = await getDocs(query(collection(db, "customers"), where("phone", "==", mobile)));
        if (custSnap.empty) { setDeals([]); return; }
        const customerId = custSnap.docs[0].id;
        const dealSnap = await getDocs(collection(db, "customers", customerId, "deals"));
        setDeals(dealSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch { setDeals([]); }
      finally { setDealLoading(false); }
    };
    if (returnCustomerLead?.mobile) fetchData();
  }, [returnCustomerLead?.mobile]);

  // ── Fetch deal orders ──
  useEffect(() => {
    const dealId = selectedDeals[0]?.dealId;
    if (!dealId) { setLeadOrders([]); return; }
    setLoadingOrders(true);
    getDocs(query(collection(db, "orders"), where("dealId", "==", dealId)))
      .then((snap) => setLeadOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.orderDate || 0).getTime() - new Date(a.orderDate || 0).getTime())))
      .catch(() => setLeadOrders([]))
      .finally(() => setLoadingOrders(false));
  }, [selectedDeals]);

  // ── Deal creation ──
  const openDealCreationDialog = (lead: any) => {
    if (isCreatingDeal) return;
    setDealCreationLead(lead);
    setMeasurementRequiredAnswer("No");
    setAdvanceReceivedAnswer("No");
  };

  const resetDealCreationDialog = () => {
    if (isCreatingDeal) return;
    setDealCreationLead(null);
    setMeasurementRequiredAnswer("No");
    setAdvanceReceivedAnswer("No");
  };

  const handleCreateDeal = async () => {
    const lead = dealCreationLead;
    if (!lead || !user) return;
    setIsCreatingDeal(true);
    try {
      const custSnap = await getDocs(query(collection(db, "customers"), where("phone", "==", lead.mobile)));
      let customerId: string;
      if (custSnap.empty) {
        const res = await addCustomerAction({ name: `${lead.firstName} ${lead.familyName}`, phone: lead.mobile, email: lead.email || "", createdBy: user.name });
        if (!res.success || !res.customer) throw new Error(res.message || "Failed to create customer.");
        customerId = res.customer.id;
      } else {
        customerId = custSnap.docs[0].id;
      }
      const dealRes = await addDealAction({ customerId, dealName: "WalkIn", dealAmount: 1, representativeId: user.id, description: `Walk-in lead for ${lead.firstName} ${lead.familyName}.`, measurementRequired: measurementRequiredAnswer, advanceForMeasurement: advanceReceivedAnswer });
      if (!dealRes.success || !dealRes.deal) throw new Error(dealRes.message || "Failed to create deal.");
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, "Walkin_Customer", lead.id), {
        status: "Deal Created", inquiryStatus: "Inquery made",
        advanceReceived: advanceReceivedAnswer, measurementRequired: measurementRequiredAnswer,
        latestDealId: dealRes.deal.dealId, latestDealDocId: dealRes.deal.id,
        dealSnapshot: { status: "Inquery made", dealDocId: dealRes.deal.id, dealId: dealRes.deal.dealId, customerId, dealName: dealRes.deal.title || "WalkIn", measurementRequired: measurementRequiredAnswer, advanceReceived: advanceReceivedAnswer, createdAt: nowIso },
      });
      toast({ title: "Deal Created ✓", description: `Redirecting to deal #${dealRes.deal.dealId}` });
      router.push(`/dashboard/customers/${customerId}/${dealRes.deal.id}?tab=products`);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Deal Creation Failed", description: error?.message || "Try again." });
    } finally {
      setIsCreatingDeal(false);
      setDealCreationLead(null);
      setMeasurementRequiredAnswer("No");
      setAdvanceReceivedAnswer("No");
    }
  };

  // ── Close lead ──
  const handleCloseLead = async () => {
    if (!closingLead || !wentBackRemark.trim()) return;
    setIsClosing(true);
    try {
      await updateDoc(doc(db, "Walkin_Customer", closingLead.id), { status: "went-back", action: "went-back", remarks: wentBackRemark });
      toast({ title: "Lead closed", description: "Lead marked as went-back." });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to close lead." });
    } finally {
      setIsClosing(false);
      setClosingLead(null);
      setWentBackRemark("");
    }
  };

  // ── Return customer update ──
  const handleLeadUpdate = async () => {
    if (!returnCustomerLead || !walkinLeads.length) return;
    setIsSubmitting(true);
    try {
      const leadDoc = walkinLeads.find((l) => l.id === returnCustomerLead.id) || walkinLeads[0];
      const basePayload = {
        leadType: returnCustomerType,
        updatedBy: { userId: user?.id || "", username: user?.name || "" },
        status: "completed",
        updatedAt: new Date().toISOString(),
      };

      if (isPaymentType(returnCustomerType)) {
        await updateDoc(doc(db, "Walkin_Customer", leadDoc.id), {
          ...basePayload,
          deal: { dealId: selectedDeals[0]?.id || "", dealSm: selectedDeals[0]?.assignedSalesPerson?.name || "", dealStatus: selectedDeals[0]?.status || "", dealAmount: Number(selectedDeals[0]?.dealAmount) || 0 },
          paymentMethod: paymentMethod || "",
          paymentAmount: Number(paymentAmount) || 0,
          paymentNote: paymentNote.trim(),
        });
      } else if (isFabricType(returnCustomerType)) {
        await updateDoc(doc(db, "Walkin_Customer", leadDoc.id), {
          ...basePayload,
          dealRef: { dealId: selectedDeals[0]?.id || "", dealSm: selectedDeals[0]?.assignedSalesPerson?.name || "", dealStatus: selectedDeals[0]?.status || "", dealAmount: Number(selectedDeals[0]?.dealAmount) || 0 },
        });
      } else if (isCollectionType(returnCustomerType)) {
        await updateDoc(doc(db, "Walkin_Customer", leadDoc.id), {
          ...basePayload,
          dealRef: { dealId: selectedDeals[0]?.id || "", dealSm: selectedDeals[0]?.assignedSalesPerson?.name || "", dealStatus: selectedDeals[0]?.status || "", dealAmount: Number(selectedDeals[0]?.dealAmount) || 0 },
          orderRef: { orderId: selectedOrders[0]?.id || "", dealSm: selectedDeals[0]?.assignedSalesPerson?.name || "", dealStatus: selectedDeals[0]?.status || "", dealAmount: Number(selectedOrders[0]?.overallSummary?.grandTotal) || 0 },
        });
      }

      toast({ title: "Lead completed ✓", description: `${returnCustomerType} recorded successfully.` });
      resetReturnDialog();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update failed", description: error?.message || "Something went wrong." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Derived ──
  const orderRows = useMemo(() => orders.map(deriveDashboardOrderRow), [orders]);
  const activeOrderRows = useMemo(() => orderRows.filter((r) => r.progress < 100), [orderRows]);
  const filteredOrderRows = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return activeOrderRows;
    return activeOrderRows.filter((r) =>
      [r.order.customerName, r.order.crmOrderNo, r.order.dealId, r.nextStep].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [activeOrderRows, orderSearch]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return walkinLeads;
    return walkinLeads.filter((l) =>
      [`${l.firstName || ""} ${l.familyName || ""}`, l.mobile, l.lookingFor].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [walkinLeads, leadSearch]);

  const criticalCount = activeOrderRows.filter((r) => r.risk === "critical").length;
  const completedCount = Math.max(0, orderRows.length - activeOrderRows.length);
  const avgProgress = activeOrderRows.length ? Math.round(activeOrderRows.reduce((s, r) => s + r.progress, 0) / activeOrderRows.length) : 0;
  const poGeneratedCount = purchaseRequests.filter((i) => normalizeText(i.status) === "po generated").length;
  const unreadCount = notifications.filter((n) => !n.read).length;

  // ── Return dialog type colors ──
  const rtColor = returnTypeColor(returnCustomerType);
  const RtIcon = returnTypeIcon(returnCustomerType);

  return (
    <>
      <div className="min-h-screen bg-[#f8f9fb]">
        <div className="max-w-screen-2xl mx-auto p-4 md:p-6 space-y-6">

          {/* ── Hero Header ── */}
          <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-1">Salesman Command Desk</p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                  Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
                  <span className="text-orange-600">{user?.name?.split(" ")[0] || "Salesman"}</span>
                </h1>
                <p className="mt-1 text-sm text-slate-500">Convert leads fast, track risky orders, stay on top every day.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="rounded-2xl border border-orange-200 bg-white px-4 py-3 shadow-sm text-center min-w-[80px]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Leads</p>
                  {loading ? <Skeleton className="h-7 w-8 mx-auto mt-1" /> : <p className="text-2xl font-bold text-orange-600">{walkinLeads.length}</p>}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm text-center min-w-[80px]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Orders</p>
                  {loading ? <Skeleton className="h-7 w-8 mx-auto mt-1" /> : <p className="text-2xl font-bold text-slate-900">{activeOrderRows.length}</p>}
                </div>
                {unreadCount > 0 && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-sm text-center min-w-[80px]">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Alerts</p>
                    <p className="text-2xl font-bold text-rose-600">{unreadCount}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Quick Actions ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { title: "My Customers", href: "/dashboard/customers", icon: Users, accent: "border-slate-200 hover:border-orange-200" },
              { title: "Walk-in Desk", href: "/dashboard/walk-in", icon: UserPlus, accent: "border-slate-200 hover:border-orange-200" },
              { title: "My Orders", href: "/dashboard/orders", icon: ListOrdered, accent: "border-slate-200 hover:border-orange-200" },
              { title: "Visits", href: "/dashboard/visits", icon: CalendarCheck, accent: "border-slate-200 hover:border-orange-200" },
            ].map((a) => (
              <QuickAction key={a.href} {...a} />
            ))}
          </div>

          {/* ── Stats row ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard label="Critical" value={criticalCount} loading={loading} icon={AlertTriangle} accent="border-red-200" />
            <StatCard label="Avg Progress" value={`${avgProgress}%`} loading={loading} icon={ClipboardList} />
            <StatCard label="Completed" value={completedCount} loading={loading} icon={CheckCircle2} accent="border-emerald-200" />
            <StatCard label="PO Generated" value={poGeneratedCount} loading={loading} icon={ShoppingBag} />
            <StatCard label="Quotations" value={quotations.length} loading={loading} icon={Briefcase} />
            <StatCard label="Unread Alerts" value={unreadCount} loading={loading} icon={Bell} accent={unreadCount > 0 ? "border-rose-200" : "border-slate-200"} />
          </div>

          {/* ── PRIORITY: Active Leads (full width, top) ── */}
          <div className="rounded-2xl border border-orange-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-orange-500 flex items-center justify-center">
                    <UserPlus className="h-4 w-4 text-white" />
                  </div>
                  <h2 className="text-base font-bold text-slate-900">Active Leads</h2>
                  {!loading && walkinLeads.length > 0 && (
                    <span className="rounded-full bg-orange-500 text-white text-[11px] font-bold px-2 py-0.5">{walkinLeads.length}</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 ml-9">Your priority — convert, close, or log action for each lead.</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Search name, phone…"
                  className="pl-8 h-8 rounded-xl border-orange-200 focus-visible:ring-orange-300 text-sm"
                />
              </div>
            </div>

            <div className="p-4">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                  <div className="h-14 w-14 rounded-2xl bg-orange-50 flex items-center justify-center">
                    <UserPlus className="h-6 w-6 text-orange-300" />
                  </div>
                  <p className="text-sm font-medium">No active leads assigned</p>
                  <p className="text-xs text-slate-400">Check back after the next walk-in handover.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onCreateDeal={() => openDealCreationDialog(lead)}
                      onClose={() => setClosingLead(lead)}
                      onReturnAction={(type) => openReturnAction(lead, type)}
                      onInstantSale={() => router.push(`/dashboard/quotation-builder?payload=${encodeURIComponent(JSON.stringify(lead))}`)}
                      isCreatingDeal={isCreatingDeal}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Lower: Orders + Notifications ── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Order Queue */}
            <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-slate-800 flex items-center justify-center">
                    <ListOrdered className="h-4 w-4 text-white" />
                  </div>
                  <h2 className="text-base font-bold text-slate-900">Order Queue</h2>
                  {criticalCount > 0 && (
                    <span className="rounded-full bg-red-100 text-red-700 text-[11px] font-bold px-2 py-0.5">
                      {criticalCount} critical
                    </span>
                  )}
                </div>
                <div className="relative w-full sm:w-60">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Search order, customer…"
                    className="pl-8 h-8 rounded-xl border-slate-200 text-sm"
                  />
                </div>
              </div>

              <ScrollArea className="h-[28rem]">
                <div className="p-4 space-y-3">
                  {loading ? (
                    [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)
                  ) : filteredOrderRows.length ? (
                    filteredOrderRows.map((row) => (
                      <div key={row.order.id} className={`rounded-2xl border p-4 ${riskContainerClassMap[row.risk]}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900">{row.order.customerName || "—"}</p>
                              <Badge variant="secondary" className="text-[10px]">{row.order.orderType || "—"}</Badge>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Order #{row.order.crmOrderNo || row.order.id} · Deal #{row.order.dealId || "—"}
                            </p>
                          </div>
                          <Badge variant="outline" className={riskBadgeClassMap[row.risk]}>{riskLabelMap[row.risk]}</Badge>
                        </div>
                        <Progress value={row.progress} className="h-1.5 mb-2" />
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500 mb-3">
                          <span>Now: <span className="font-semibold text-slate-800">{row.currentStep}</span></span>
                          <span>Next: <span className="font-semibold text-slate-800">{row.nextStep}</span></span>
                          <span>Age: <span className="font-semibold text-slate-800">{row.ageDays}d</span></span>
                        </div>
                        <div className="flex justify-end">
                          <Button asChild size="sm" variant="outline" className="rounded-xl h-7 text-xs border-slate-200">
                            <Link href={`/dashboard/orders/${row.order.id}`}>Open Order</Link>
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                      <CheckCircle2 className="h-8 w-8 opacity-30" />
                      <p className="text-sm">No active orders in queue.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Notifications */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Bell className="h-4 w-4 text-slate-600" />
                </div>
                <h2 className="text-base font-bold text-slate-900">Recent Alerts</h2>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 ml-auto">{unreadCount}</span>
                )}
              </div>
              <ScrollArea className="h-[28rem]">
                <div className="p-4 space-y-2">
                  {loading ? (
                    [...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
                  ) : notifications.length ? (
                    notifications.map((n) => {
                      const createdAt = toDateSafe(n.createdAt || n.date);
                      return (
                        <div key={n.id} className={`rounded-xl border p-3 ${!n.read ? "border-rose-100 bg-rose-50/50" : "border-slate-100 bg-white"}`}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-800">{n.type || "Update"}</p>
                            {!n.read && <span className="flex-shrink-0 rounded-full bg-rose-500 h-1.5 w-1.5 mt-1" />}
                          </div>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{n.message || "No message"}</p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {createdAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : "—"}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                      <Bell className="h-7 w-7 opacity-30" />
                      <p className="text-sm">No notifications yet.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>

      {/* ══ Deal Creation Dialog ══ */}
      <Dialog open={!!dealCreationLead} onOpenChange={(o) => { if (!o) resetDealCreationDialog(); }}>
        <DialogContent className="sm:max-w-sm rounded-2xl p-0 overflow-hidden border-slate-200">
          <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-4">
            <DialogHeader>
              <DialogTitle className="text-slate-900">Create Deal</DialogTitle>
              <DialogDescription className="text-slate-500 text-xs">
                {dealCreationLead?.firstName} {dealCreationLead?.familyName} · {dealCreationLead?.mobile}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Measurement Required</Label>
              <Select value={measurementRequiredAnswer} onValueChange={(v) => setMeasurementRequiredAnswer(v as "Yes" | "No")}>
                <SelectTrigger className="rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Advance Received</Label>
              <Select value={advanceReceivedAnswer} onValueChange={(v) => setAdvanceReceivedAnswer(v as "Yes" | "No" | "Old")}>
                <SelectTrigger className="rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                  <SelectItem value="Old">Old</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="px-6 pb-5 flex gap-2 justify-end">
            <Button variant="outline" onClick={resetDealCreationDialog} disabled={isCreatingDeal} className="rounded-xl border-slate-200">Cancel</Button>
            <Button onClick={() => void handleCreateDeal()} disabled={isCreatingDeal} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-sm">
              {isCreatingDeal ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : "Create Deal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Close Lead Dialog ══ */}
      <Dialog open={!!closingLead} onOpenChange={(o) => { if (!o && !isClosing) { setClosingLead(null); setWentBackRemark(""); } }}>
        <DialogContent className="sm:max-w-sm rounded-2xl p-0 overflow-hidden border-slate-200">
          <div className="bg-rose-50 border-b border-rose-100 px-6 py-4">
            <DialogHeader>
              <DialogTitle className="text-slate-900">Close Lead</DialogTitle>
              <DialogDescription className="text-slate-500 text-xs">
                {closingLead?.firstName} {closingLead?.familyName} · {closingLead?.mobile}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 py-5 space-y-2">
            <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Reason / Remark <span className="text-rose-400">*</span></Label>
            <Textarea
              value={wentBackRemark}
              onChange={(e) => setWentBackRemark(e.target.value)}
              placeholder="e.g., customer postponed, not interested, duplicate…"
              className="rounded-xl border-slate-200 resize-none min-h-[90px] text-sm focus-visible:ring-rose-300"
            />
          </div>
          <div className="px-6 pb-5 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setClosingLead(null); setWentBackRemark(""); }} disabled={isClosing} className="rounded-xl border-slate-200">Cancel</Button>
            <Button onClick={() => void handleCloseLead()} disabled={isClosing || !wentBackRemark.trim()} className="rounded-xl bg-rose-600 hover:bg-rose-700 shadow-sm">
              {isClosing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Closing…</> : "Confirm Close"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Return Customer Dialog ══ */}
      <Dialog open={returnCustomerDialog} onOpenChange={(o) => { if (!o && !isSubmitting) resetReturnDialog(); }}>
        <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden border-slate-200">
          {/* Header */}
          <div className={`border-b px-6 py-4 ${rtColor.bg} ${rtColor.border}`}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${rtColor.bg}`}>
                  <RtIcon className={`h-4 w-4 ${rtColor.text}`} />
                </div>
                <div>
                  <DialogTitle className="text-slate-900 text-base">{returnCustomerType || "Return Customer"}</DialogTitle>
                  <p className="text-xs text-slate-500">{returnCustomerLead?.firstName} {returnCustomerLead?.familyName} · {returnCustomerLead?.mobile}</p>
                </div>
              </div>
            </DialogHeader>

            {/* Breadcrumb steps */}
            <div className="flex items-center gap-1.5 mt-3 text-[11px]">
              <span className={`font-semibold ${returnCustomerDialogStep === "selectDeal" ? rtColor.text : "text-slate-400"}`}>Select Deal</span>
              {(isPaymentType(returnCustomerType) || isCollectionType(returnCustomerType)) && (
                <>
                  <ChevronRight className="h-3 w-3 text-slate-300" />
                  <span className={`font-semibold ${returnCustomerDialogStep === "payment" || returnCustomerDialogStep === "collection" ? rtColor.text : "text-slate-400"}`}>
                    {isPaymentType(returnCustomerType) ? "Payment" : "Collection"}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 max-h-[60vh] overflow-y-auto space-y-3">

            {/* STEP: Select Deal */}
            {returnCustomerDialogStep === "selectDeal" && (
              <>
                {dealLoading ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-400">
                    <Loader2 className="h-7 w-7 animate-spin" />
                    <p className="text-sm">Loading deals…</p>
                  </div>
                ) : deals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
                    <Briefcase className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No deals found for this customer.</p>
                  </div>
                ) : (
                  deals.map((deal) => (
                    <button
                      key={deal.id}
                      type="button"
                      onClick={() => {
                        setSelectedDeals([deal]);
                        if (isPaymentType(returnCustomerType)) setReturnCustomerDialogStep("payment");
                        else if (isCollectionType(returnCustomerType)) setReturnCustomerDialogStep("collection");
                        else { void handleLeadUpdate(); }
                      }}
                      className="w-full text-left rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 p-3.5 transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">{deal.dealName || deal.title || "Unnamed Deal"}</p>
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                      </div>
                      <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-slate-500">
                        <span>Status: <span className="font-medium text-slate-700">{deal.status || "—"}</span></span>
                        <span>Amount: <span className="font-medium text-slate-700">₹{deal.dealAmount || "N/A"}</span></span>
                        {deal.createdAt && <span>{toDateSafe(deal.createdAt)?.toLocaleDateString()}</span>}
                      </div>
                    </button>
                  ))
                )}
              </>
            )}

            {/* STEP: Payment */}
            {returnCustomerDialogStep === "payment" && selectedDeals[0] && (
              <div className="space-y-4">
                {/* Selected deal summary */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Selected Deal</p>
                  <p className="text-sm font-semibold text-slate-900">{selectedDeals[0].dealName || selectedDeals[0].title || "Unnamed"}</p>
                  <p className="text-xs text-slate-500">₹{selectedDeals[0].dealAmount || "N/A"} · {selectedDeals[0].status}</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Payment Method <span className="text-rose-400">*</span></Label>
                  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "Cash" | "Card" | "UPI")}>
                    <SelectTrigger className="rounded-xl border-slate-200"><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="UPI">UPI / Online</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Amount (₹) <span className="text-rose-400">*</span></Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">₹</span>
                    <Input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                      className="pl-7 rounded-xl border-slate-200 focus-visible:ring-emerald-300"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Note (optional)</Label>
                  <Textarea
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    placeholder="Any remarks about this payment…"
                    className="rounded-xl border-slate-200 resize-none min-h-[70px] text-sm"
                  />
                </div>
              </div>
            )}

            {/* STEP: Collection */}
            {returnCustomerDialogStep === "collection" && (
              <>
                {loadingOrders ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-400">
                    <Loader2 className="h-7 w-7 animate-spin" />
                    <p className="text-sm">Loading orders…</p>
                  </div>
                ) : leadOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
                    <Package className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No orders found for this deal.</p>
                  </div>
                ) : (
                  leadOrders.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => { setSelectedOrders([order]); void handleLeadUpdate(); }}
                      disabled={isSubmitting}
                      className="w-full text-left rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 p-3.5 transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">Order #{order.orderId || order.id}</p>
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin text-blue-400" /> : <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400 transition-colors" />}
                      </div>
                      <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-slate-500">
                        <span>Status: <span className="font-medium text-slate-700">{order.status || "—"}</span></span>
                        <span>Total: <span className="font-medium text-slate-700">₹{order.overallSummary?.grandTotal || "N/A"}</span></span>
                        {order.createdBy?.name && <span>By: {order.createdBy.name}</span>}
                      </div>
                    </button>
                  ))
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
            {returnCustomerDialogStep !== "selectDeal" && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-slate-200 gap-1.5 text-slate-600"
                onClick={() => setReturnCustomerDialogStep("selectDeal")}
                disabled={isSubmitting}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Back
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={resetReturnDialog} disabled={isSubmitting} className="rounded-xl border-slate-200">
                Cancel
              </Button>
              {returnCustomerDialogStep === "payment" && (
                <Button
                  onClick={() => void handleLeadUpdate()}
                  disabled={isSubmitting || !paymentMethod || !paymentAmount}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                >
                  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Submit Payment"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const AllocatorDashboard = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [inbounds, setInbounds] = useState<InboundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueSearch, setQueueSearch] = useState("");
  const [inboundSearch, setInboundSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    let loadedOrders = false;
    let loadedInbounds = false;
    const markLoaded = () => {
      if (loadedOrders && loadedInbounds) setLoading(false);
    };

    const ordersQuery = query(
      collection(db, "orders"),
      where("isAcknowledged", "==", true),
      where("status", "==", "Approved")
    );
    const inboundQuery = query(collection(db, "inbounds"), orderBy("createdAt", "desc"), limit(300));

    const unsubOrders = onSnapshot(
      ordersQuery,
      (snapshot) => {
        setOrders(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() } as Order)));
        loadedOrders = true;
        markLoaded();
      },
      () => {
        setOrders([]);
        loadedOrders = true;
        markLoaded();
      }
    );
    const unsubInbounds = onSnapshot(
      inboundQuery,
      (snapshot) => {
        setInbounds(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() } as InboundRequest)));
        loadedInbounds = true;
        markLoaded();
      },
      () => {
        setInbounds([]);
        loadedInbounds = true;
        markLoaded();
      }
    );

    return () => {
      unsubOrders();
      unsubInbounds();
    };
  }, []);

  const orderRows = useMemo(
    () => orders.map(deriveDashboardOrderRow).filter((row) => row.progress < 100),
    [orders]
  );

  const allocationRows = useMemo(() => {
    return orderRows.map((row) => {
      const statuses = (row.order.fabricDetails || []).map((item) => normalizeText(item.status));
      const hasLines = statuses.length > 0;
      const allInStock = hasLines && statuses.every((status) => status === "in stock" || status === "allocated");
      const someInStock = hasLines && statuses.some((status) => status === "in stock" || status === "allocated");
      const waitingMaterial = hasLines && !someInStock;
      return { ...row, hasLines, allInStock, someInStock, waitingMaterial };
    });
  }, [orderRows]);

  const readyForAllocation = allocationRows.filter((row) => row.allInStock);
  const partialStock = allocationRows.filter((row) => !row.allInStock && row.someInStock);
  const waitingMaterial = allocationRows.filter((row) => row.waitingMaterial);

  const queueRows = useMemo(() => {
    const baseRows = [...readyForAllocation, ...partialStock];
    const normalized = queueSearch.trim().toLowerCase();
    const filteredRows = normalized
      ? baseRows.filter((row) => {
          return (
            String(row.order.customerName || "")
              .toLowerCase()
              .includes(normalized) ||
            String(row.order.crmOrderNo || "")
              .toLowerCase()
              .includes(normalized) ||
            String(row.order.dealId || "")
              .toLowerCase()
              .includes(normalized) ||
            String(row.order.salesPerson || "")
              .toLowerCase()
              .includes(normalized)
          );
        })
      : baseRows;
    const riskWeight: Record<DashboardOrderRisk, number> = { critical: 3, watch: 2, stable: 1 };
    return filteredRows.sort((a, b) => {
      if (riskWeight[b.risk] !== riskWeight[a.risk]) return riskWeight[b.risk] - riskWeight[a.risk];
      if (a.progress !== b.progress) return a.progress - b.progress;
      return b.ageDays - a.ageDays;
    });
  }, [partialStock, queueSearch, readyForAllocation]);

  const inboundFeed = useMemo(() => {
    const rows = inbounds
      .map((inbound) => {
        const items = inbound.items || [];
        const receivedLines = items.filter((item: any) => {
          if (Number(item?.receivedQty || 0) > 0) return true;
          const milestones = Array.isArray(item?.inboundMilestones) ? item.inboundMilestones : [];
          return milestones.some((milestone: any) => normalizeText(milestone?.status) === "completed");
        }).length;
        const isReceived = normalizeText(inbound.status) === "completed" || receivedLines > 0;
        const timestamp = toDateSafe(inbound.completedAt || inbound.createdAt);
        return { inbound, receivedLines, totalLines: items.length, isReceived, timestamp };
      })
      .filter((row) => row.isReceived)
      .sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));

    const normalized = inboundSearch.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => {
      return (
        String(row.inbound.customerName || "")
          .toLowerCase()
          .includes(normalized) ||
        String(row.inbound.vendor || "")
          .toLowerCase()
          .includes(normalized) ||
        String(row.inbound.id || "")
          .toLowerCase()
          .includes(normalized) ||
        String(row.inbound.dealId || "")
          .toLowerCase()
          .includes(normalized)
      );
    });
  }, [inboundSearch, inbounds]);

  const quickActions = [
    { title: "Open Allocation", href: "/dashboard/orders", icon: ClipboardList },
    { title: "Receive Material", href: "/dashboard/inbound", icon: PackageCheck },
    { title: "Inventory", href: "/dashboard/inventory", icon: Archive },
    { title: "Stock Verification", href: "/dashboard/stock-verification", icon: CheckCircle },
  ] as const;

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <Card className="overflow-hidden border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-teal-50">
        <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Allocator Control Tower</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Allocator Home Dashboard</h1>
            <p className="max-w-3xl text-sm text-slate-600 md:text-base">
              Track stock-ready orders and inbound receipts. Allocator can also receive material from inbound desk.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 lg:w-auto lg:min-w-[22rem]">
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
              <p className="text-xs text-muted-foreground">Ready For Allocation</p>
              <p className="mt-1 text-2xl font-bold">{loading ? "..." : readyForAllocation.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
              <p className="text-xs text-muted-foreground">Received Batches</p>
              <p className="mt-1 text-2xl font-bold">{loading ? "..." : inboundFeed.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {quickActions.map((action) => (
          <Link key={action.href} href={action.href} className="group block">
            <Card className="h-full border-slate-200 transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md">
              <CardContent className="flex h-full items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <action.icon className="h-4 w-4 text-cyan-700" />
                  <p className="text-sm font-semibold">{action.title}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ready Orders</p><p className="text-2xl font-bold text-emerald-700">{loading ? "..." : readyForAllocation.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Partial Stock</p><p className="text-2xl font-bold text-amber-700">{loading ? "..." : partialStock.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Waiting Material</p><p className="text-2xl font-bold text-red-700">{loading ? "..." : waitingMaterial.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active Inbound</p><p className="text-2xl font-bold">{loading ? "..." : inbounds.filter((i) => normalizeText(i.status) === "active").length}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="space-y-3">
            <CardTitle>Allocation Queue</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Search order, customer, deal..." className="pl-8" />
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[34rem]">
              <div className="space-y-3">
                {loading ? (
                  Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />)
                ) : queueRows.length ? (
                  queueRows.map((row) => (
                    <div key={row.order.id} className={`rounded-xl border p-4 ${riskContainerClassMap[row.risk]}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{row.order.customerName || "-"}</p>
                            <Badge variant={row.allInStock ? "default" : "secondary"}>{row.allInStock ? "Stock Ready" : "Partial Stock"}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">Order #{row.order.crmOrderNo || row.order.id} | Deal #{row.order.dealId || "-"}</p>
                        </div>
                        <Badge variant="outline" className={riskBadgeClassMap[row.risk]}>{riskLabelMap[row.risk]}</Badge>
                      </div>
                      <Progress value={row.progress} className="mt-3 h-2" />
                      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground md:grid-cols-3">
                        <p>Current: <span className="font-semibold text-slate-900">{row.currentStep}</span></p>
                        <p>Next: <span className="font-semibold text-slate-900">{row.nextStep}</span></p>
                        <p>Age: <span className="font-semibold text-slate-900">{row.ageDays} day(s)</span></p>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/orders/${row.order.id}`}>Open Order</Link>
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No allocation items found.</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>Material Receiving Feed</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={inboundSearch} onChange={(event) => setInboundSearch(event.target.value)} placeholder="Search PO, vendor, customer..." className="pl-8" />
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[34rem]">
              <div className="space-y-2">
                {loading ? (
                  Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 w-full" />)
                ) : inboundFeed.length ? (
                  inboundFeed.map((row) => (
                    <div key={row.inbound.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">PO #{row.inbound.id}</p>
                        <Badge variant={normalizeText(row.inbound.status) === "completed" ? "default" : "secondary"}>
                          {row.inbound.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{row.inbound.customerName || "-"} | Deal #{row.inbound.dealId || "-"}</p>
                      <p className="text-xs text-muted-foreground">{row.inbound.vendor || "-"}</p>
                      <p className="text-xs mt-1">Received lines: <span className="font-semibold">{row.receivedLines}</span> / {row.totalLines}</p>
                      <p className="text-xs text-muted-foreground mt-1">{row.timestamp ? formatDistanceToNow(row.timestamp, { addSuffix: true }) : "Unknown time"}</p>
                    </div>
                  ))
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No received material updates yet.</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const AdminDashboard = () => {
  const [counts, setCounts] = useState<Record<string, number | null>>({
    readyForDelivery: null,
    pendingPurchase: null,
    pendingInbound: null,
    pendingVisits: null,
    pendingQuotationApproval: null,
    pendingOrderApproval: null,
    pendingInvoice: null,
    pendingCutting: null,
    paymentConfirmation: null,
    deliveryFollowUp: null,
  });
  const [loading, setLoading] = useState(true);
  const [isSheetSyncing, setIsSheetSyncing] = useState(false);
  const [lastSheetSyncAt, setLastSheetSyncAt] = useState<Date | null>(null);
  const syncOrderSheetRef = useRef(false);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const syncOrderSheet = async () => {
      if (syncOrderSheetRef.current) return;
      syncOrderSheetRef.current = true;
      setIsSheetSyncing(true);
      try {
        await fetch("/api/orders/syncOrderSheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        setLastSheetSyncAt(new Date());
      } catch (error) {
        console.error("Order sheet sync failed:", error);
      } finally {
        syncOrderSheetRef.current = false;
        setIsSheetSyncing(false);
      }
    };

    void syncOrderSheet();
    intervalId = setInterval(syncOrderSheet, 60_000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const queries: { [key: string]: any } = {
      orders: query(collection(db, "orders")),
      quotations: query(collectionGroup(db, "quotations")),
      purchaseRequests: query(collection(db, "purchaseRequests")),
      inbounds: query(collection(db, "inbounds"), where("status", "==", "Active")),
      visits: query(collectionGroup(db, "visits")),
      cuttingTasks: query(collection(db, "Cutting"), where("status", "!=", "Completed")),
    };

    const unsubscribes = Object.entries(queries).map(([key, q]) =>
      onSnapshot(q, (snapshot: any) => {
        const docsData = snapshot.docs.map((doc: any) => doc.data());

        if (key === "orders") {
          const orders = docsData as Order[];
          setCounts((prev) => ({
            ...prev,
            readyForDelivery: orders.filter(
              (o) =>
                getNormalizedOrderMilestones(o).find((m) => m.id === 5)?.completed &&
                !getNormalizedOrderMilestones(o).find((m) => m.id === 8)?.completed
            ).length,
            pendingOrderApproval: orders.filter((o) => o.status === "Pending Approval").length,
            pendingInvoice: orders.filter(
              (o) =>
                o.invoicing?.invoiceRequired !== false &&
                o.invoicing?.status &&
                o.invoicing.status !== "INVOICED"
            ).length,
            paymentConfirmation: orders.filter(
              (o) => o.balanceFollowUp === true && !o.paymentConfirmed
            ).length,
          }));
        }
        if (key === "quotations") {
          setCounts((prev) => ({
            ...prev,
            pendingQuotationApproval: docsData.filter(
              (q: any) => (q as Quotation).status === "Pending Approval"
            ).length,
          }));
        }
        if (key === "purchaseRequests") {
          setCounts((prev) => ({
            ...prev,
            pendingPurchase: docsData.filter(
              (pr: any) => (pr as PurchaseRequest).status === "Approved"
            ).length,
          }));
        }
        if (key === "inbounds") {
          setCounts((prev) => ({ ...prev, pendingInbound: snapshot.size }));
        }
        if (key === "visits") {
          setCounts((prev) => ({ ...prev, pendingVisits: snapshot.size }));
        }
        if (key === "cuttingTasks") {
          setCounts((prev) => ({ ...prev, pendingCutting: snapshot.size }));
        }
      })
    );

    const fetchFollowUpCount = async () => {
      try {
        const followUpItems = await getFollowUpItems();
        setCounts((prev) => ({ ...prev, deliveryFollowUp: followUpItems.length }));
      } catch (e) {
        console.error("Failed to fetch follow-up count:", e);
        setCounts((prev) => ({ ...prev, deliveryFollowUp: 0 }));
      }
    };

    void fetchFollowUpCount();
    void Promise.all(Object.values(queries).map((q) => getDocs(q))).finally(() => setLoading(false));

    return () => unsubscribes.forEach((unsub) => unsub());
  }, []);

  type AdminPriority = "critical" | "high" | "normal";
  type DashboardItem = {
    key: string;
    title: string;
    count: number | null;
    href: string;
    icon: React.ElementType;
    description: string;
    priority: AdminPriority;
    section: "approvals" | "operations";
  };

  const dashboardItems: DashboardItem[] = [
    {
      key: "quotation",
      title: "Quotation Approvals",
      count: counts.pendingQuotationApproval,
      href: "/dashboard/approvals",
      icon: FileSignature,
      description: "Quotations waiting for approval action.",
      priority: "critical",
      section: "approvals",
    },
    {
      key: "orders",
      title: "Order Approvals",
      count: counts.pendingOrderApproval,
      href: "/dashboard/approvals?tab=orders",
      icon: FileSignature,
      description: "Orders still blocked in approval stage.",
      priority: "critical",
      section: "approvals",
    },
    {
      key: "payments",
      title: "Payment Confirmation",
      count: counts.paymentConfirmation,
      href: "/dashboard/approvals?tab=payment-confirmation",
      icon: CheckCircle,
      description: "Pending payment checks from Accounts.",
      priority: "high",
      section: "approvals",
    },
    {
      key: "purchase",
      title: "Purchase Pending",
      count: counts.pendingPurchase,
      href: "/dashboard/purchase/pending-po",
      icon: ShoppingCart,
      description: "Approved requests not converted to PO.",
      priority: "high",
      section: "operations",
    },
    {
      key: "inbound",
      title: "Inbound Active",
      count: counts.pendingInbound,
      href: "/dashboard/inbound",
      icon: Archive,
      description: "Material inbound batches still active.",
      priority: "high",
      section: "operations",
    },
    {
      key: "invoice",
      title: "Invoice Pending",
      count: counts.pendingInvoice,
      href: "/dashboard/invoice",
      icon: FileText,
      description: "Orders not fully invoiced yet.",
      priority: "high",
      section: "operations",
    },
    {
      key: "cutting",
      title: "Cutting Pending",
      count: counts.pendingCutting,
      href: "/dashboard/cutting",
      icon: Scissors,
      description: "Cutting tasks open in production queue.",
      priority: "normal",
      section: "operations",
    },
    {
      key: "delivery",
      title: "Delivery Follow Up",
      count: counts.deliveryFollowUp,
      href: "/dashboard/po-tracking",
      icon: PhoneCall,
      description: "Orders requiring delivery follow-up.",
      priority: "normal",
      section: "operations",
    },
    {
      key: "ready",
      title: "Ready for Delivery",
      count: counts.readyForDelivery,
      href: "/dashboard/orders",
      icon: Truck,
      description: "Orders ready to move to delivery execution.",
      priority: "normal",
      section: "operations",
    },
    {
      key: "visits",
      title: "Visits Pipeline",
      count: counts.pendingVisits,
      href: "/dashboard/visits",
      icon: CalendarCheck,
      description: "All active and scheduled visits.",
      priority: "normal",
      section: "operations",
    },
  ];

  const approvals = dashboardItems.filter((item) => item.section === "approvals");
  const operations = dashboardItems.filter((item) => item.section === "operations");
  const actionableTotal = dashboardItems.reduce((sum, item) => sum + (item.count ?? 0), 0);
  const criticalTotal = dashboardItems
    .filter((item) => item.priority === "critical")
    .reduce((sum, item) => sum + (item.count ?? 0), 0);
  const highTotal = dashboardItems
    .filter((item) => item.priority === "high")
    .reduce((sum, item) => sum + (item.count ?? 0), 0);
  const urgentQueues = [...dashboardItems]
    .filter((item) => (item.count ?? 0) > 0)
    .sort((a, b) => {
      const pA = a.priority === "critical" ? 3 : a.priority === "high" ? 2 : 1;
      const pB = b.priority === "critical" ? 3 : b.priority === "high" ? 2 : 1;
      if (pB !== pA) return pB - pA;
      return (b.count ?? 0) - (a.count ?? 0);
    })
    .slice(0, 5);

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6 lg:p-8">
      <Card className="overflow-hidden border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 text-white">
        <CardContent className="relative p-6 md:p-8">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="absolute -bottom-12 left-24 h-32 w-32 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-2">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-300">Admin Control Room</p>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Operations Command Dashboard</h1>
              <p className="text-sm text-slate-200 md:text-base">
                Track approvals, production movement, inbound flow, and delivery readiness from one place.
              </p>
            </div>
            <div className="grid w-full max-w-md grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                <p className="text-slate-300">Sheet Sync</p>
                <p className="mt-1 flex items-center gap-2 font-semibold">
                  {isSheetSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                  {isSheetSyncing ? "Syncing..." : "Healthy"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                <p className="text-slate-300">Last Sync</p>
                <p className="mt-1 font-semibold">
                  {lastSheetSyncAt ? formatDistanceToNow(lastSheetSyncAt, { addSuffix: true }) : "Waiting..."}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Actionable</p>
            <p className="mt-1 text-3xl font-bold">{loading ? "..." : actionableTotal}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Critical</p>
            <p className="mt-1 text-3xl font-bold text-red-700">{loading ? "..." : criticalTotal}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">High Priority</p>
            <p className="mt-1 text-3xl font-bold text-amber-700">{loading ? "..." : highTotal}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ready to Dispatch</p>
            <p className="mt-1 text-3xl font-bold text-emerald-700">{loading ? "..." : counts.readyForDelivery ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Approvals and Finance</CardTitle>
              <CardDescription>Queues that block commercial movement.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {approvals.map((item) => (
                <AdminSummaryCard
                  key={item.key}
                  title={item.title}
                  count={item.count}
                  href={item.href}
                  icon={item.icon}
                  description={item.description}
                  priority={item.priority}
                  loading={loading}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operations Pipeline</CardTitle>
              <CardDescription>Execution queues from purchase to delivery.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {operations.map((item) => (
                <AdminSummaryCard
                  key={item.key}
                  title={item.title}
                  count={item.count}
                  href={item.href}
                  icon={item.icon}
                  description={item.description}
                  priority={item.priority}
                  loading={loading}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Urgency Board</CardTitle>
              <CardDescription>Highest impact queues to clear first.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : urgentQueues.length > 0 ? (
                <div className="space-y-3">
                  {urgentQueues.map((item) => (
                    <Link key={`urgent-${item.key}`} href={item.href} className="block rounded-lg border p-3 transition hover:bg-muted/50">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "capitalize",
                            item.priority === "critical"
                              ? "border-red-200 bg-red-50 text-red-700"
                              : item.priority === "high"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-slate-200 bg-slate-50 text-slate-700"
                          )}
                        >
                          {item.priority}
                        </Badge>
                      </div>
                      <p className="mt-1 text-2xl font-bold">{item.count ?? 0}</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active queues right now.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Controls</CardTitle>
              <CardDescription>Frequently used admin routes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild className="w-full justify-between" variant="outline">
                <Link href="/dashboard/approvals">
                  Open Approval Center
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild className="w-full justify-between" variant="outline">
                <Link href="/dashboard/orders">
                  View Order Command
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild className="w-full justify-between" variant="outline">
                <Link href="/dashboard/visits">
                  Monitor Visits
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

interface AdminSummaryCardProps {
  title: string;
  count: number | null;
  href: string;
  icon: React.ElementType;
  loading: boolean;
  description: string;
  priority: "critical" | "high" | "normal";
}

function AdminSummaryCard({
  title,
  count,
  href,
  icon: Icon,
  loading,
  description,
  priority,
}: AdminSummaryCardProps) {
  return (
    <Link href={href} className="block group">
      <Card
        className={cn(
          "h-full border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
          priority === "critical" && "border-red-200 bg-red-50/40 hover:border-red-300",
          priority === "high" && "border-amber-200 bg-amber-50/40 hover:border-amber-300",
          priority === "normal" && "border-slate-200 bg-white hover:border-slate-300"
        )}
      >
        <CardHeader className="space-y-3 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{title}</CardTitle>
            <div className="rounded-md border border-slate-200 bg-white p-2 text-slate-700">
              <Icon className="h-4 w-4" />
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "w-fit capitalize",
              priority === "critical" && "border-red-200 bg-red-100 text-red-700",
              priority === "high" && "border-amber-200 bg-amber-100 text-amber-700",
              priority === "normal" && "border-slate-200 bg-slate-100 text-slate-700"
            )}
          >
            {priority}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            {loading ? <Skeleton className="h-9 w-16" /> : <p className="text-3xl font-bold">{count ?? 0}</p>}
            <span className="text-xs text-muted-foreground group-hover:text-foreground">Open Queue</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}


export default function DashboardPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && user?.role === 'Purchase') {
            router.replace('/dashboard/purchase');
        }
    }, [loading, router, user]);
    
    if (loading) {
        return (
             <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-4">
                <Skeleton className="h-9 w-1/2 mb-2" />
                <Skeleton className="h-5 w-3/4" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                     <Skeleton className="h-24 w-full" />
                     <Skeleton className="h-24 w-full" />
                     <Skeleton className="h-24 w-full" />
                </div>
            </div>
        )
    }

    if (user?.designation === 'CRM') {
        return <CrmDashboard dashboardType="CRM" />;
    }
    
    if (user?.designation === 'PC') {
        return <CrmDashboard dashboardType="PC" />;
    }

    const normalizedDesignation = String(user?.designation || "").trim().toLowerCase();
    if (normalizedDesignation === "allocators" || normalizedDesignation === "allocator") {
        return <AllocatorDashboard />;
    }

    if (user?.role === 'salesman') {
        return <SalesmanDashboardV2 />;
    }

    if (user?.role === 'Accounts') {
        return <AccountsDashboard />;
    }

    if (user?.role === 'Purchase') {
        return (
             <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-4">
                <Skeleton className="h-9 w-1/2 mb-2" />
                <Skeleton className="h-5 w-3/4" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                     <Skeleton className="h-24 w-full" />
                     <Skeleton className="h-24 w-full" />
                     <Skeleton className="h-24 w-full" />
                </div>
            </div>
        );
    }

    return <AdminDashboard />;
}
