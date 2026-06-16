"use client";

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
}

interface EnrichedOrder extends Order {
  totalAmount?: number;
}

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
              order.fabricDetails?.length > 0
                ? order.fabricDetails
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user, role } = useAuth();

  useEffect(() => {
    const q = query(
      collection(db, "orders"),
      where("balanceFollowUp", "==", true),
      where("paymentConfirmed", "!=", true)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
        setOrders(data);
        onCountChange?.(data.length);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

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

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-b border-[#E2DDD5]">
          {["Order ID", "Customer", "Sales Person", "Total Amount", "Action"].map(
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
            <TableCell colSpan={5} className="p-0">
              <EmptyState message="No orders awaiting payment confirmation." />
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
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
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
    const approvalsQuery = query(
      collection(db, "inboundExcessApprovals"),
      where("status", "==", "pending")
    );

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
              new Date(right.requestedAt || 0).getTime() -
              new Date(left.requestedAt || 0).getTime()
          );
        setApprovals(rows);
        onCountChange?.(rows.length);
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

  return (
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
          <TableHead className="text-right">Decision</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {approvals.length === 0 ? (
          <TableRow>
            <TableCell colSpan={10}>
              <EmptyState message="No excess receipt approvals are pending." />
            </TableCell>
          </TableRow>
        ) : (
          approvals.map((approval) => (
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
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

/* ─── Tab count badge ────────────────────────────────── */

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
  | "excess-receipts";

export default function ApprovalsPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as TabValue | null;

  const resolve = (t: TabValue | null): TabValue => {
    if (
      t === "quotations" ||
      t === "orders" ||
      t === "payment-confirmation" ||
      t === "excess-receipts"
    )
      return t;
    return "orders";
  };

  const [activeTab, setActiveTab] = useState<TabValue>(resolve(tabParam));
  const [quotationCount, setQuotationCount] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [paymentCount, setPaymentCount] = useState(0);
  const [excessReceiptCount, setExcessReceiptCount] = useState(0);

  useEffect(() => {
    setActiveTab(resolve(tabParam));
  }, [tabParam]);

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
          </div>
        </div>
      </header>

      {/* ── Tabs ── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
        className="w-full"
      >
        <TabsList className="bg-[#F0EDE6] border border-[#E2DDD5] rounded-xl p-1 h-auto mb-6 w-full max-w-3xl">
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
        </TabsList>

        {/* ── Quotations panel ── */}
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
      </Tabs>
    </div>
  );
}
