"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useState, useEffect } from "react";
import {
  collection,
  collectionGroup,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Quotation,
  Deal,
  Customer,
  User,
  Order,
} from "@/lib/types";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  CreditCard,
  FileText,
  ShoppingCart,
  ChevronRight,
  Package,
  User as UserIcon,
  Phone,
  Calendar,
  IndianRupee,
  AlertCircle,
  Inbox,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PrintableQuotationProfessional } from "@/components/features/order-management/PrintableQuotationProfessional";
import { useAuth } from "@/context/AuthContext";
import {
  approveOrderAndCreatePurchaseRequest,
  confirmPaymentReceived,
  approveQuotationAction,
} from "./actions";
import {
  reviewInboundExcessApprovalAction,
  type InboundExcessApproval,
} from "../inbound/actions";
import { useSearchParams } from "next/navigation";

/* ─── Types ─────────────────────────────────────────── */

interface EnrichedQuotation extends Quotation {
  dealId: string;
  customerId: string;
  dealName: string;
  customerName: string;
  customerPhone?: string;
}

interface EnrichedOrder extends Order {
  totalAmount?: number;
}

interface PaymentApprovalOrder extends Order {
  paymentConfirmedAt?: string;
  paymentConfirmedBy?: { id?: string; name?: string };
}

type ComplaintApprovalHistory = {
  id: string;
  customerName?: string;
  complaintType?: string;
  createdAt?: string;
  approvalStatus?: string;
  pendingApproval?: boolean;
  chargeType?: string;
  chargeAmount?: number;
  approvedAt?: string;
  approvedBy?: {
    name?: string;
    designation?: string;
  };
};

const normalizeApprovalKey = (value: unknown) =>
  String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");

const approvalDateToIso = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null) {
    const timestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof timestamp.toDate === "function") return timestamp.toDate().toISOString();
    const seconds = Number(timestamp.seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return undefined;
};

/* ─── Shared skeleton ────────────────────────────────── */

function TableSkeleton() {
  return (
    <div className="space-y-3 p-6">
      {[...Array(4)].map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  );
}

/* ─── Empty state ────────────────────────────────────── */

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="rounded-full bg-[#F5EDD6] p-4">
        <Inbox className="h-6 w-6 text-[#C4963A]" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/* ─── Approve Quotations Tab ─────────────────────────── */

function ApproveQuotationTab({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const [quotations, setQuotations] = useState<EnrichedQuotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedQuotation, setSelectedQuotation] =
    useState<EnrichedQuotation | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    setLoading(true);
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        setAllUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as User)));
      } catch {
        toast({ variant: "destructive", title: "Error loading user data" });
      }
    };
    fetchUsers();

    const q = query(
      collectionGroup(db, "quotations"),
      where("status", "==", "Pending Approval")
    );

    const unsub = onSnapshot(
      q,
      async (snapshot) => {
        const list: EnrichedQuotation[] = [];
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data() as Quotation;
          const parts = docSnap.ref.path.split("/");
          const customerId = parts[1];
          const dealId = parts[3];
          try {
            const [custSnap, dealSnap] = await Promise.all([
              getDoc(doc(db, "customers", customerId)),
              getDoc(doc(db, "customers", customerId, "deals", dealId)),
            ]);
            list.push({
              ...data,
              id: docSnap.id,
              customerId,
              dealId,
              customerName: custSnap.exists()
                ? custSnap.data().name
                : "Unknown Customer",
              customerPhone: custSnap.exists()
                ? custSnap.data().phone
                : "—",
              dealName: dealSnap.exists()
                ? dealSnap.data().title || dealSnap.data().dealName
                : "Unknown Deal",
            });
          } catch {
            /* skip enrichment failure */
          }
        }
        setQuotations(list);
        onCountChange?.(list.length);
        setLoading(false);
      },
      () => {
        toast({ variant: "destructive", title: "Error loading quotations" });
        setLoading(false);
      }
    );
    return () => unsub();
  }, [toast]);

  const handleApprove = async () => {
    if (!selectedQuotation || !user) return;
    setUpdatingId(selectedQuotation.id);
    try {
      const plain = JSON.parse(JSON.stringify(selectedQuotation));
      const result = await approveQuotationAction(plain, {
        id: user.id,
        name: user.name,
      });
      toast({
        title: result.success ? "Quotation Approved" : "Error",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to approve quotation" });
    } finally {
      setUpdatingId(null);
      setSelectedQuotation(null);
    }
  };

  if (loading) return <TableSkeleton />;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-[#E2DDD5]">
            <TableHead className="text-[10.5px] uppercase tracking-widest text-muted-foreground font-medium">
              Quotation No.
            </TableHead>
            <TableHead className="text-[10.5px] uppercase tracking-widest text-muted-foreground font-medium">
              Customer
            </TableHead>
            <TableHead className="text-[10.5px] uppercase tracking-widest text-muted-foreground font-medium">
              Mobile
            </TableHead>
            <TableHead className="text-[10.5px] uppercase tracking-widest text-muted-foreground font-medium">
              Deal
            </TableHead>
            <TableHead className="text-[10.5px] uppercase tracking-widest text-muted-foreground font-medium">
              Date
            </TableHead>
            <TableHead className="text-[10.5px] uppercase tracking-widest text-muted-foreground font-medium text-right">
              Amount
            </TableHead>
            <TableHead className="text-[10.5px] uppercase tracking-widest text-muted-foreground font-medium">
              Status
            </TableHead>
            <TableHead className="text-[10.5px] uppercase tracking-widest text-muted-foreground font-medium text-right">
              Action
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="p-0">
                <EmptyState message="No quotations pending for approval." />
              </TableCell>
            </TableRow>
          ) : (
            quotations.map((q) => (
              <TableRow
                key={q.id}
                className="border-b border-[#F0EDE6] hover:bg-[#FDFBF8] transition-colors"
              >
                <TableCell>
                  <span className="font-mono text-xs text-[#4A4A46] font-medium">
                    {q.quotationNo}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-[#F5EDD6] flex items-center justify-center">
                      <UserIcon className="h-3.5 w-3.5 text-[#C4963A]" />
                    </div>
                    <span className="text-sm font-medium">{q.customerName}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {q.customerPhone}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-[#4A4A46]">
                  {q.dealName}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(q.createdAt), "dd/MM/yyyy")}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-0.5 font-semibold text-sm text-[#1C1C1A]">
                    <IndianRupee className="h-3.5 w-3.5" />
                    {q.totalAmount.toFixed(2)}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className="bg-[#F5EDD6] text-[#9A6E1A] border-0 text-xs font-medium rounded-full px-2.5">
                    <Clock className="h-3 w-3 mr-1" />
                    Pending
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    onClick={() => setSelectedQuotation(q)}
                    disabled={updatingId === q.id}
                    className="bg-[#1C1C1A] hover:bg-[#2C2C28] text-white text-xs rounded-lg h-8 px-3 gap-1.5"
                  >
                    {updatingId === q.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Approve
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {selectedQuotation && (
        <Dialog
          open={!!selectedQuotation}
          onOpenChange={() => setSelectedQuotation(null)}
        >
          <DialogContent className="max-w-[80vw] w-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#C4963A]" />
                Confirm Quotation Approval
              </DialogTitle>
              <DialogDescription>
                Review the quotation details below before approving. This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto my-4 border border-[#E2DDD5] rounded-xl">
              <PrintableQuotationProfessional
                type="quotation"
                values={selectedQuotation}
                creatorName={
                  allUsers.find((u) => u.id === selectedQuotation.createdBy)
                    ?.name
                }
                salesmanName={
                  allUsers.find(
                    (u) => u.id === selectedQuotation.representativeId
                  )?.name
                }
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSelectedQuotation(null)}
                className="rounded-lg border-[#E2DDD5]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleApprove}
                disabled={updatingId === selectedQuotation.id}
                className="bg-[#1C1C1A] hover:bg-[#2C2C28] text-white rounded-lg gap-2"
              >
                {updatingId === selectedQuotation.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Confirm & Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/* ─── Approve Orders Tab ─────────────────────────────── */

function ApproveOrdersTab({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const [orders, setOrders] = useState<EnrichedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user, role } = useAuth();

  useEffect(() => {
    const q = query(
      collection(db, "orders"),
      where("status", "==", "Pending Approval")
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
      setOrders(data);
      onCountChange?.(data.length);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleApprove = async (order: Order) => {
    if (!user || (role !== "Accounts" && role !== "admin")) {
      toast({
        variant: "destructive",
        title: "Permission Denied",
        description: "Only Accounts can approve orders.",
      });
      return;
    }
    setUpdatingId(order.id);
    try {
      const result = await approveOrderAndCreatePurchaseRequest(order.id, {
        id: user.id,
        name: user.name,
      });
      toast({
        title: result.success ? "Order Approved" : "Approval Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to approve order" });
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return <TableSkeleton />;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-b border-[#E2DDD5]">
          {["Order ID", "Customer", "Mobile", "Items (BCN & Qty)", "Sales Person", "Total Amount", "Date", "Action"].map(
            (h) => (
              <TableHead
                key={h}
                className={`text-[10.5px] uppercase tracking-widest text-muted-foreground font-medium ${
                  h === "Total Amount" || h === "Action" ? "text-right" : ""
                }`}
              >
                {h}
              </TableHead>
            )
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="p-0">
              <EmptyState message="No orders pending for approval." />
            </TableCell>
          </TableRow>
        ) : (
          orders.map((order) => {
            const items =
              (order.fabricDetails?.length ?? 0) > 0
                ? order.fabricDetails ?? []
                : (order.sections?.NORMAL?.items || []).map((item: any) => ({
                    fabricName: item.bcn || item.description || "N/A",
                    quantity: String(item.qty ?? 0),
                  }));
            return (
              <TableRow
                key={order.id}
                className="border-b border-[#F0EDE6] hover:bg-[#FDFBF8] transition-colors"
              >
                <TableCell>
                  <span className="font-mono text-xs text-[#4A4A46] font-medium">
                    {order.crmOrderNo}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-[#F5EDD6] flex items-center justify-center">
                      <UserIcon className="h-3.5 w-3.5 text-[#C4963A]" />
                    </div>
                    <span className="text-sm font-medium">
                      {order.customerName}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {order.customerPhone}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {items.map((item: any, i: number) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-[11px] bg-[#F0EDE6] border border-[#E2DDD5] text-[#4A4A46] px-2 py-0.5 rounded-md"
                      >
                        <Package className="h-2.5 w-2.5 text-[#C4963A]" />
                        <span className="font-medium">{item.fabricName}</span>
                        <span className="text-muted-foreground">
                          · {item.quantity} Mtr
                        </span>
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-[#4A4A46]">
                  {order.salesPerson}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-0.5 font-semibold text-sm text-[#1C1C1A]">
                    <IndianRupee className="h-3.5 w-3.5" />
                    {order.totalAmount?.toFixed(2)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(order.createdAt), "dd/MM/yyyy")}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(order)}
                    disabled={
                      updatingId === order.id ||
                      (role !== "Accounts" && role !== "admin")
                    }
                    className="bg-[#1C1C1A] hover:bg-[#2C2C28] text-white text-xs rounded-lg h-8 px-3 gap-1.5"
                  >
                    {updatingId === order.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Approve
                  </Button>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

/* ─── Payment Confirmation Tab ───────────────────────── */

function PaymentConfirmationTab({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const [pendingOrders, setPendingOrders] = useState<PaymentApprovalOrder[]>([]);
  const [historyOrders, setHistoryOrders] = useState<PaymentApprovalOrder[]>([]);
  const [view, setView] = useState<"pending" | "history">("pending");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user, role } = useAuth();

  useEffect(() => {
    const pendingQuery = query(
      collection(db, "orders"),
      where("balanceFollowUp", "==", true),
      where("paymentConfirmed", "!=", true)
    );
    const historyQuery = query(
      collection(db, "orders"),
      where("paymentConfirmed", "==", true)
    );
    let pendingLoaded = false;
    let historyLoaded = false;
    const finishLoading = () => {
      if (pendingLoaded && historyLoaded) setLoading(false);
    };
    const unsubPending = onSnapshot(
      pendingQuery,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentApprovalOrder));
        setPendingOrders(data);
        onCountChange?.(data.length);
        pendingLoaded = true;
        finishLoading();
      },
      () => {
        pendingLoaded = true;
        finishLoading();
      }
    );
    const unsubHistory = onSnapshot(
      historyQuery,
      (snap) => {
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PaymentApprovalOrder))
          .sort(
            (left, right) =>
              new Date(right.paymentConfirmedAt || 0).getTime() -
              new Date(left.paymentConfirmedAt || 0).getTime()
          );
        setHistoryOrders(data);
        historyLoaded = true;
        finishLoading();
      },
      () => {
        historyLoaded = true;
        finishLoading();
      }
    );
    return () => {
      unsubPending();
      unsubHistory();
    };
  }, [onCountChange]);

  const handleConfirm = async (orderId: string) => {
    if (!user || (role !== "Accounts" && role !== "admin")) {
      toast({
        variant: "destructive",
        title: "Permission Denied",
        description: "Only Accounts can confirm payments.",
      });
      return;
    }
    setUpdatingId(orderId);
    try {
      const result = await confirmPaymentReceived(orderId, {
        id: user.id,
        name: user.name,
      });
      toast({
        title: result.success ? "Payment Confirmed" : "Confirmation Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to confirm payment" });
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return <TableSkeleton />;

  const orders = view === "pending" ? pendingOrders : historyOrders;

  return (
    <div>
      <div className="flex gap-2 border-b border-[#E2DDD5] p-3">
        <Button
          size="sm"
          variant={view === "pending" ? "default" : "outline"}
          onClick={() => setView("pending")}
        >
          Pending ({pendingOrders.length})
        </Button>
        <Button
          size="sm"
          variant={view === "history" ? "default" : "outline"}
          onClick={() => setView("history")}
        >
          History ({historyOrders.length})
        </Button>
      </div>
      <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-b border-[#E2DDD5]">
          {(view === "pending"
            ? ["Order ID", "Customer", "Sales Person", "Total Amount", "Action"]
            : ["Order ID", "Customer", "Sales Person", "Total Amount", "Confirmed By", "Confirmed At"]
          ).map(
            (h) => (
              <TableHead
                key={h}
                className={`text-[10.5px] uppercase tracking-widest text-muted-foreground font-medium ${
                  h === "Total Amount" || h === "Action" ? "text-right" : ""
                }`}
              >
                {h}
              </TableHead>
            )
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.length === 0 ? (
          <TableRow>
            <TableCell colSpan={view === "pending" ? 5 : 6} className="p-0">
              <EmptyState
                message={
                  view === "pending"
                    ? "No orders awaiting payment confirmation."
                    : "No payment confirmation history found."
                }
              />
            </TableCell>
          </TableRow>
        ) : (
          orders.map((order) => (
            <TableRow
              key={order.id}
              className="border-b border-[#F0EDE6] hover:bg-[#FDFBF8] transition-colors"
            >
              <TableCell>
                <span className="font-mono text-xs text-[#4A4A46] font-medium">
                  {order.crmOrderNo}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-[#E0F5F0] flex items-center justify-center">
                    <UserIcon className="h-3.5 w-3.5 text-[#1A7A6A]" />
                  </div>
                  <span className="text-sm font-medium">
                    {order.customerName}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-sm text-[#4A4A46]">
                {order.salesPerson}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-0.5 font-semibold text-sm text-[#1C1C1A]">
                  <IndianRupee className="h-3.5 w-3.5" />
                  {order.totalAmount?.toFixed(2)}
                </div>
              </TableCell>
              {view === "pending" ? (
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    onClick={() => handleConfirm(order.id)}
                    disabled={
                      updatingId === order.id ||
                      (role !== "Accounts" && role !== "admin")
                    }
                    className="bg-[#1A7A6A] hover:bg-[#135E50] text-white text-xs rounded-lg h-8 px-3 gap-1.5"
                  >
                    {updatingId === order.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CreditCard className="h-3.5 w-3.5" />
                    )}
                    Confirm Payment
                  </Button>
                </TableCell>
              ) : (
                <>
                  <TableCell className="font-medium">
                    {order.paymentConfirmedBy?.name || "Unknown approver"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {order.paymentConfirmedAt
                      ? format(new Date(order.paymentConfirmedAt), "dd MMM yyyy, hh:mm a")
                      : "Date unavailable"}
                  </TableCell>
                </>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
      </Table>
    </div>
  );
}

function ExcessReceiptApprovalTab({
  onCountChange,
}: {
  onCountChange?: (count: number) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [approvals, setApprovals] = useState<InboundExcessApproval[]>([]);
  const [view, setView] = useState<"pending" | "history">("pending");
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const normalizedRole = String((user as any)?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  const normalizedDesignation = String((user as any)?.designation || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  const canReview =
    normalizedRole === "admin" ||
    normalizedRole === "md" ||
    normalizedRole === "management" ||
    normalizedRole === "managingdirector" ||
    normalizedDesignation === "md" ||
    normalizedDesignation === "management" ||
    normalizedDesignation === "managingdirector";

  useEffect(() => {
    const approvalsQuery = query(collection(db, "inboundExcessApprovals"));

    return onSnapshot(
      approvalsQuery,
      async (snapshot) => {
        const rows = (
          await Promise.all(
            snapshot.docs.map(async (approvalDoc) => {
              const approval = {
                id: approvalDoc.id,
                ...(approvalDoc.data() as Omit<InboundExcessApproval, "id">),
              };
              if (
                approval.orderId &&
                approval.smName &&
                approval.purchaseRate !== undefined
              ) {
                return approval;
              }

              const inboundSnap = await getDoc(doc(db, "inbounds", approval.inboundId));
              const inbound = inboundSnap.exists() ? inboundSnap.data() : null;
              const item = Array.isArray(inbound?.items)
                ? inbound.items[approval.itemIndex]
                : null;
              const rateCandidates = [
                item?.purchaseRate,
                item?.zohoRate,
                item?.rate,
                item?.stockDetail?.purchaseRate,
                item?.stockDetail?.costPriceRs,
                item?.stockDetail?.rate,
              ];
              const purchaseRate = rateCandidates
                .map((value) => Number(value))
                .find((value) => Number.isFinite(value) && value >= 0);
              const orderId = String(
                inbound?.orderSnapshot?.orderNo ||
                  inbound?.orderSnapshot?.id ||
                  inbound?.dealSnapshot?.orderId ||
                  inbound?.dealId ||
                  approval.dealId ||
                  ""
              ).trim();
              let smName = String(
                inbound?.assignedSalesman?.name ||
                  inbound?.salesman ||
                  inbound?.orderSnapshot?.salesPerson ||
                  ""
              ).trim();

              if (!smName && orderId) {
                const orderSnap = await getDoc(doc(db, "orders", orderId));
                if (orderSnap.exists()) {
                  const order = orderSnap.data();
                  smName = String(
                    order?.salesPerson ||
                      order?.assignedSalesman?.name ||
                      order?.createdBy?.name ||
                      ""
                  ).trim();
                }
              }

              return {
                ...approval,
                orderId: approval.orderId || orderId || undefined,
                smName: approval.smName || smName || undefined,
                purchaseRate: approval.purchaseRate ?? purchaseRate,
              };
            })
          )
        )
          .sort(
            (left, right) =>
              new Date(right.reviewedAt || right.requestedAt || 0).getTime() -
              new Date(left.reviewedAt || left.requestedAt || 0).getTime()
          );
        setApprovals(rows);
        onCountChange?.(rows.filter((row) => row.status === "pending").length);
        setLoading(false);
      },
      (error) => {
        console.error("Excess receipt approval listener failed:", error);
        setApprovals([]);
        onCountChange?.(0);
        setLoading(false);
      }
    );
  }, [onCountChange]);

  const review = async (
    approvalId: string,
    decision: "approved" | "rejected"
  ) => {
    if (!user?.id) return;
    setReviewingId(approvalId);
    try {
      const result = await reviewInboundExcessApprovalAction(approvalId, decision, {
        id: user.id,
        name: user.name || "Management",
      });
      toast({
        title: result.success
          ? decision === "approved"
            ? "Excess receipt accepted"
            : "Excess receipt rejected"
          : "Review failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } finally {
      setReviewingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const visibleApprovals = approvals.filter((approval) =>
    view === "pending" ? approval.status === "pending" : approval.status !== "pending"
  );

  return (
    <div>
      <div className="flex gap-2 border-b border-[#E2DDD5] p-3">
        <Button
          size="sm"
          variant={view === "pending" ? "default" : "outline"}
          onClick={() => setView("pending")}
        >
          Pending ({approvals.filter((approval) => approval.status === "pending").length})
        </Button>
        <Button
          size="sm"
          variant={view === "history" ? "default" : "outline"}
          onClick={() => setView("history")}
        >
          History ({approvals.filter((approval) => approval.status !== "pending").length})
        </Button>
      </div>
      <Table>
      <TableHeader>
        <TableRow className="bg-[#F8F6F1] hover:bg-[#F8F6F1]">
          <TableHead>PO / Item</TableHead>
          <TableHead>Order ID</TableHead>
          <TableHead>SM Name</TableHead>
          <TableHead>Vendor</TableHead>
          <TableHead>Purchase Rate / Mtr</TableHead>
          <TableHead>PO Quantity</TableHead>
          <TableHead>Receive Now</TableHead>
          <TableHead>Excess</TableHead>
          <TableHead>Requested By</TableHead>
          {view === "pending" ? (
            <TableHead className="text-right">Decision</TableHead>
          ) : (
            <>
              <TableHead>Result</TableHead>
              <TableHead>Reviewed By</TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {visibleApprovals.length === 0 ? (
          <TableRow>
            <TableCell colSpan={view === "pending" ? 10 : 11}>
              <EmptyState
                message={
                  view === "pending"
                    ? "No excess receipt approvals are pending."
                    : "No excess receipt approval history found."
                }
              />
            </TableCell>
          </TableRow>
        ) : (
          visibleApprovals.map((approval) => (
            <TableRow key={approval.id}>
              <TableCell>
                <p className="font-semibold text-[#1C1C1A]">{approval.poNumber}</p>
                <p className="text-xs text-muted-foreground">{approval.itemName}</p>
              </TableCell>
              <TableCell className="font-mono text-sm font-medium">
                {approval.orderId || approval.dealId || "Not available"}
              </TableCell>
              <TableCell>
                <p className="max-w-48 truncate font-medium text-[#1C1C1A]">
                  {approval.smName || "SM not available"}
                </p>
              </TableCell>
              <TableCell>
                <p className="max-w-56 truncate font-medium text-[#1C1C1A]">
                  {approval.vendorName || "Vendor not available"}
                </p>
              </TableCell>
              <TableCell className="font-medium">
                {approval.purchaseRate !== undefined
                  ? `₹${Number(approval.purchaseRate).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} / ${String(approval.unit).toLowerCase() === "mtr" ? "Mtr" : approval.unit}`
                  : "Not available"}
              </TableCell>
              <TableCell>
                {approval.expectedQty} {approval.unit}
              </TableCell>
              <TableCell className="font-medium">
                {approval.requestedQty} {approval.unit}
              </TableCell>
              <TableCell>
                <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
                  +{approval.excessQty} {approval.unit}
                </Badge>
              </TableCell>
              <TableCell>
                <p className="text-sm">{approval.requestedBy?.name || "User"}</p>
                <p className="text-xs text-muted-foreground">
                  {approval.requestedAt
                    ? format(new Date(approval.requestedAt), "dd MMM yyyy, hh:mm a")
                    : "Time unavailable"}
                </p>
              </TableCell>
              {view === "pending" ? (
              <TableCell>
                <TooltipProvider delayDuration={150}>
                  <div className="flex justify-end gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            disabled={!canReview || reviewingId === approval.id}
                            onClick={() => void review(approval.id, "rejected")}
                            aria-label={`Reject excess receipt for PO ${approval.poNumber}`}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-64">
                        <p className="font-semibold">Reject excess receipt</p>
                        <p className="text-xs">
                          PO {approval.poNumber}: reject {approval.requestedQty} {approval.unit}.
                          Stock receipt will remain blocked.
                        </p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            size="icon"
                            className="h-9 w-9 bg-[#1A7A6A] text-white hover:bg-[#135E50]"
                            disabled={!canReview || reviewingId === approval.id}
                            onClick={() => void review(approval.id, "approved")}
                            aria-label={`Approve excess receipt for PO ${approval.poNumber}`}
                          >
                            {reviewingId === approval.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-64">
                        <p className="font-semibold">Accept / OK</p>
                        <p className="text-xs">
                          Allow {approval.requestedQty} {approval.unit} against PO quantity{" "}
                          {approval.expectedQty} {approval.unit}, including +{approval.excessQty}{" "}
                          {approval.unit} excess.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </TableCell>
              ) : (
                <>
                  <TableCell>
                    <Badge
                      className={
                        approval.status === "rejected"
                          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-50"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                      }
                    >
                      {approval.status === "used" ? "Approved / Used" : approval.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">
                      {approval.reviewedBy?.name || "Unknown approver"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {approval.reviewedAt
                        ? format(new Date(approval.reviewedAt), "dd MMM yyyy, hh:mm a")
                        : "Date unavailable"}
                    </p>
                  </TableCell>
                </>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
      </Table>
    </div>
  );
}

/* ─── Tab count badge ────────────────────────────────── */

function ComplaintApprovalHistoryTab({
  onCountChange,
}: {
  onCountChange?: (count: number) => void;
}) {
  const [complaints, setComplaints] = useState<ComplaintApprovalHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const complaintsQuery = query(
      collection(db, "companyVisits"),
      where("category", "==", "complaint_visit")
    );

    return onSnapshot(
      complaintsQuery,
      (snapshot) => {
        const rows = snapshot.docs
          .map((complaintDoc) => {
            const data = complaintDoc.data() as any;
            const approval = data?.approval || {};
            return {
              id: complaintDoc.id,
              customerName: String(data?.customerName || "").trim() || undefined,
              complaintType:
                String(data?.complaintType || data?.complaintSubType || "").trim() || undefined,
              createdAt: approvalDateToIso(data?.createdAt),
              approvalStatus: String(data?.approvalStatus || "").trim() || undefined,
              pendingApproval:
                typeof data?.pendingApproval === "boolean" ? data.pendingApproval : undefined,
              chargeType: String(approval?.chargeType || data?.chargeType || "").trim() || undefined,
              chargeAmount: Number(approval?.chargeAmount ?? data?.chargeAmount ?? 0),
              approvedAt: approvalDateToIso(approval?.approvedAt || data?.approvedAt),
              approvedBy: approval?.approvedBy || data?.approvedBy || undefined,
            } satisfies ComplaintApprovalHistory;
          })
          .sort(
            (left, right) =>
              new Date(right.approvedAt || right.createdAt || 0).getTime() -
              new Date(left.approvedAt || left.createdAt || 0).getTime()
          );

        const pendingCount = rows.filter(
          (row) =>
            row.pendingApproval === true ||
            normalizeApprovalKey(row.approvalStatus) !== "approved"
        ).length;
        setComplaints(rows);
        onCountChange?.(pendingCount);
        setLoading(false);
      },
      (error) => {
        console.error("Complaint approval history listener failed:", error);
        setComplaints([]);
        onCountChange?.(0);
        setLoading(false);
      }
    );
  }, [onCountChange]);

  if (loading) return <TableSkeleton />;

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-[#F8F6F1] hover:bg-[#F8F6F1]">
          <TableHead>Customer / Complaint</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Service</TableHead>
          <TableHead>Approved By</TableHead>
          <TableHead>Approval Date</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {complaints.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6}>
              <EmptyState message="No complaint approval records found." />
            </TableCell>
          </TableRow>
        ) : (
          complaints.map((complaint) => {
            const approved = normalizeApprovalKey(complaint.approvalStatus) === "approved";
            const chargeable = normalizeApprovalKey(complaint.chargeType) === "chargeable";
            return (
              <TableRow key={complaint.id}>
                <TableCell>
                  <p className="font-semibold text-[#1C1C1A]">
                    {complaint.customerName || "Unknown customer"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {complaint.complaintType || "Complaint visit"}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge
                    className={
                      approved
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                        : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50"
                    }
                  >
                    {approved ? "Approved" : "Pending"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {chargeable
                    ? `₹${Number(complaint.chargeAmount || 0).toLocaleString("en-IN")}`
                    : "Free service"}
                </TableCell>
                <TableCell>
                  {approved ? (
                    <>
                      <p className="font-medium text-[#1C1C1A]">
                        {complaint.approvedBy?.name || "Unknown approver"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {complaint.approvedBy?.designation || "Designation unavailable"}
                      </p>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Awaiting approval</span>
                  )}
                </TableCell>
                <TableCell>
                  {complaint.approvedAt
                    ? format(new Date(complaint.approvedAt), "dd MMM yyyy, hh:mm a")
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/complain-approval?complaint=${complaint.id}`}>
                      {approved ? "View" : "Review"}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

function TabCount({
  count,
  variant = "gold",
}: {
  count?: number;
  variant?: "gold" | "teal";
}) {
  if (!count) return null;
  return (
    <span
      className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
        variant === "teal"
          ? "bg-[#E0F5F0] text-[#1A7A6A]"
          : "bg-[#F5EDD6] text-[#9A6E1A]"
      }`}
    >
      {count}
    </span>
  );
}

/* ─── Page ───────────────────────────────────────────── */

type TabValue =
  | "quotations"
  | "orders"
  | "payment-confirmation"
  | "excess-receipts"
  | "complaints";

export default function ApprovalsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as TabValue | null;
  const isEa =
    String((user as any)?.designation || "").trim().toLowerCase().replace(/[\s_-]/g, "") === "ea";

  const resolve = (t: TabValue | null): TabValue => {
    if (isEa && (t === "quotations" || t === "orders" || t === "complaints")) {
      return "payment-confirmation";
    }
    if (
      t === "quotations" ||
      t === "orders" ||
      t === "payment-confirmation" ||
      t === "excess-receipts" ||
      t === "complaints"
    )
      return t;
    return isEa ? "payment-confirmation" : "orders";
  };

  const [activeTab, setActiveTab] = useState<TabValue>(resolve(tabParam));
  const [quotationCount, setQuotationCount] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [paymentCount, setPaymentCount] = useState(0);
  const [excessReceiptCount, setExcessReceiptCount] = useState(0);
  const [complaintCount, setComplaintCount] = useState(0);

  useEffect(() => {
    setActiveTab(resolve(tabParam));
  }, [isEa, tabParam]);

  return (
    <div className="min-h-screen bg-[#FAFAF7] p-6 md:p-8 lg:p-10">
      {/* ── Header ── */}
      <header className="mb-8 pb-6 border-b border-[#E2DDD5]">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] font-medium text-[#C4963A] mb-1">
              Operations Center
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-[#1C1C1A]">
              Approvals
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review and authorize pending actions across the pipeline
            </p>
          </div>

          {/* summary pills */}
          <div className="flex flex-wrap gap-2">
            {!isEa && (
              <>
                <div className="flex items-center gap-2 rounded-full border border-[#E2DDD5] bg-[#F0EDE6] px-4 py-1.5">
                  <FileText className="h-3.5 w-3.5 text-[#C4963A]" />
                  <span className="text-sm font-semibold text-[#1C1C1A]">{quotationCount}</span>
                  <span className="text-xs text-muted-foreground">Quotations</span>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-[#E2DDD5] bg-[#F0EDE6] px-4 py-1.5">
                  <ShoppingCart className="h-3.5 w-3.5 text-[#C4963A]" />
                  <span className="text-sm font-semibold text-[#1C1C1A]">{orderCount}</span>
                  <span className="text-xs text-muted-foreground">Orders</span>
                </div>
              </>
            )}
            <div className="flex items-center gap-2 rounded-full border border-[#E2DDD5] bg-[#E0F5F0] px-4 py-1.5">
              <CreditCard className="h-3.5 w-3.5 text-[#1A7A6A]" />
              <span className="text-sm font-semibold text-[#1C1C1A]">{paymentCount}</span>
              <span className="text-xs text-muted-foreground">Payments</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5">
              <Package className="h-3.5 w-3.5 text-amber-700" />
              <span className="text-sm font-semibold text-[#1C1C1A]">{excessReceiptCount}</span>
              <span className="text-xs text-muted-foreground">Excess Receipts</span>
            </div>
            {!isEa && (
              <div className="flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-indigo-700" />
                <span className="text-sm font-semibold text-[#1C1C1A]">{complaintCount}</span>
                <span className="text-xs text-muted-foreground">Complaints</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Tabs ── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
        className="w-full"
      >
        <TabsList className="bg-[#F0EDE6] border border-[#E2DDD5] rounded-xl p-1 h-auto mb-6 w-full max-w-4xl">
          {!isEa && (
            <>
              <TabsTrigger
                value="quotations"
                className="flex-1 rounded-lg text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#1C1C1A] text-muted-foreground transition-all"
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Quotations
                <TabCount count={quotationCount} />
              </TabsTrigger>
              <TabsTrigger
                value="orders"
                className="flex-1 rounded-lg text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#1C1C1A] text-muted-foreground transition-all"
              >
                <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
                Orders
                <TabCount count={orderCount} />
              </TabsTrigger>
            </>
          )}
          <TabsTrigger
            value="payment-confirmation"
            className="flex-1 rounded-lg text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#1C1C1A] text-muted-foreground transition-all"
          >
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />
            Payments
            <TabCount count={paymentCount} variant="teal" />
          </TabsTrigger>
          <TabsTrigger
            value="excess-receipts"
            className="flex-1 rounded-lg text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#1C1C1A] text-muted-foreground transition-all"
          >
            <Package className="h-3.5 w-3.5 mr-1.5" />
            Excess Receipts
            <TabCount count={excessReceiptCount} />
          </TabsTrigger>
          {!isEa && (
            <TabsTrigger
              value="complaints"
              className="flex-1 rounded-lg text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#1C1C1A] text-muted-foreground transition-all"
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
              Complaints
              <TabCount count={complaintCount} />
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Quotations panel ── */}
        {!isEa && (
          <>
        <TabsContent value="quotations" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-block h-0.5 w-6 bg-[#C4963A] rounded-full" />
            <p className="text-[11px] uppercase tracking-widest font-medium text-[#8A8A84]">
              Pending Quotation Approvals
            </p>
          </div>
          <Card className="border border-[#E2DDD5] rounded-2xl shadow-none overflow-hidden bg-white">
            <CardContent className="p-0">
              <ApproveQuotationTab onCountChange={setQuotationCount} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Orders panel ── */}
        <TabsContent value="orders" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-block h-0.5 w-6 bg-[#C4963A] rounded-full" />
            <p className="text-[11px] uppercase tracking-widest font-medium text-[#8A8A84]">
              Pending Order Approvals
            </p>
          </div>
          <Card className="border border-[#E2DDD5] rounded-2xl shadow-none overflow-hidden bg-white">
            <CardContent className="p-0">
              <ApproveOrdersTab onCountChange={setOrderCount} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Payment panel ── */}
          </>
        )}

        <TabsContent value="payment-confirmation" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-block h-0.5 w-6 bg-[#1A7A6A] rounded-full" />
            <p className="text-[11px] uppercase tracking-widest font-medium text-[#8A8A84]">
              Awaiting Payment Confirmation
            </p>
          </div>
          <Card className="border border-[#E2DDD5] rounded-2xl shadow-none overflow-hidden bg-white">
            <CardContent className="p-0">
              <PaymentConfirmationTab onCountChange={setPaymentCount} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="excess-receipts" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-block h-0.5 w-6 bg-amber-500 rounded-full" />
            <p className="text-[11px] uppercase tracking-widest font-medium text-[#8A8A84]">
              MD Approval for Quantity Above PO
            </p>
          </div>
          <Card className="border border-[#E2DDD5] rounded-2xl shadow-none overflow-hidden bg-white">
            <CardContent className="p-0">
              <ExcessReceiptApprovalTab onCountChange={setExcessReceiptCount} />
            </CardContent>
          </Card>
        </TabsContent>

        {!isEa && (
        <TabsContent value="complaints" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-6 bg-indigo-500 rounded-full" />
              <p className="text-[11px] uppercase tracking-widest font-medium text-[#8A8A84]">
                Complaint Approval History
              </p>
            </div>
            <Button asChild size="sm">
              <Link href="/dashboard/complain-approval">
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                Open Complaint Desk
              </Link>
            </Button>
          </div>
          <Card className="border border-[#E2DDD5] rounded-2xl shadow-none overflow-hidden bg-white">
            <CardContent className="p-0">
              <ComplaintApprovalHistoryTab onCountChange={setComplaintCount} />
            </CardContent>
          </Card>
        </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
