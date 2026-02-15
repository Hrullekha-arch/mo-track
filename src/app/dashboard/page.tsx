
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
} from "lucide-react";
import { useEffect, useState, useMemo, useRef } from "react";
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
import { db } from "@/lib/firebase";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { InboundRequest, Order, Quotation, PurchaseRequest, Walkin_Customer } from "@/lib/types";
import { getFollowUpItems } from "./po-tracking/actions";
import { useAuth } from "@/context/AuthContext";
import { format, formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import CrmDashboard from "@/components/features/dashboard/CrmDashboard";
import { AccountsDashboard } from "@/components/features/dashboard/AccountsDashboard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { addCustomerAction, addDealAction } from "./customers/actions";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

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
  const milestones = order.milestones || [];
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


const SalesmanDashboard = () => {
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const [orders, setOrders] = useState<Order[]>([]);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [walkinLeads, setWalkinLeads] = useState<Walkin_Customer[]>([]);
    const [loading, setLoading] = useState(true);

    const [closingLead, setClosingLead] = useState<Walkin_Customer | null>(null);
    const [closeRemark, setCloseRemark] = useState("");
    const [isClosing, setIsClosing] = useState(false);

    const [dealCreationLead, setDealCreationLead] = useState<Walkin_Customer | null>(null);
    const [isCreatingDeal, setIsCreatingDeal] = useState(false);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        const salesmanName = user.name;

        const ordersQuery = query(collection(db, 'orders'), where('salesPerson', '==', salesmanName));
        const quotesQuery = query(collectionGroup(db, 'quotations'), where('representativeId', '==', user.id));
        const purchaseRequestsQuery = query(collection(db, 'purchaseRequests'), where('salesman', '==', salesmanName));
        const walkinQuery = query(collection(db, 'Walkin_Customer'), where('salesmanId', '==', user.id), where('status', '==', 'Handed Over'));

        const unsubs: (() => void)[] = [];

        unsubs.push(onSnapshot(ordersQuery, (snapshot) => setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)))));
        unsubs.push(onSnapshot(quotesQuery, (snapshot) => { /* Handle quote updates if needed */ }));
        unsubs.push(onSnapshot(purchaseRequestsQuery, (snapshot) => { /* Handle PR updates if needed */ }));
        unsubs.push(onSnapshot(walkinQuery, (snapshot) => {
            setWalkinLeads(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Walkin_Customer)));
            setLoading(false);
        }));

        return () => unsubs.forEach(unsub => unsub());
    }, [user]);

    const handleCreateDeal = async (lead: Walkin_Customer) => {
        if (!user) return;
        
        setIsCreatingDeal(true);
        setDealCreationLead(lead);

        try {
            // Step 1: Check if customer exists by mobile number
            const customersRef = collection(db, "customers");
            const q = query(customersRef, where("phone", "==", lead.mobile));
            const querySnapshot = await getDocs(q);

            let customerId: string;

            if (querySnapshot.empty) {
                // Step 2a: Customer doesn't exist, so create them
                const customerData = {
                    name: `${lead.firstName} ${lead.familyName}`,
                    phone: lead.mobile,
                    email: lead.email || '',
                    createdBy: user.name,
                };
                const customerResult = await addCustomerAction(customerData);
                if (!customerResult.success || !customerResult.customer) {
                    throw new Error(customerResult.message || "Failed to create a new customer record.");
                }
                customerId = customerResult.customer.id;
            } else {
                // Step 2b: Customer exists, use their ID
                customerId = querySnapshot.docs[0].id;
            }
            
            // Step 3: Create the deal
            const dealData = {
                customerId: customerId,
                dealName: "WalkIn",
                dealAmount: 1, // Default amount
                representativeId: user.id,
                description: `Deal created from walk-in lead for ${lead.firstName} ${lead.familyName}.`,
                advanceForMeasurement: 'No' as const,
            };
            
            const dealResult = await addDealAction(dealData);

            if (dealResult.success && dealResult.deal) {
                // Step 4: Update the lead status
                await updateDoc(doc(db, "Walkin_Customer", lead.id), { status: "Deal Created" });
                toast({ title: "Deal Created!", description: `Redirecting to deal #${dealResult.deal.dealId}...`});
                // Step 5: Redirect to the product tab of the new deal
                router.push(`/dashboard/customers/${customerId}/${dealResult.deal.id}?tab=products`);
            } else {
                 throw new Error(dealResult.message || "Failed to create deal.");
            }

        } catch (error: any) {
            toast({ variant: "destructive", title: "Deal Creation Failed", description: error.message });
        } finally {
            setIsCreatingDeal(false);
            setDealCreationLead(null);
        }
    };

    const handleCloseLead = async () => {
        if (!closingLead) return;
        setIsClosing(true);
        try {
            const leadRef = doc(db, "Walkin_Customer", closingLead.id);
            await updateDoc(leadRef, {
                status: 'Closed',
                action: 'Close',
                remarks: closeRemark,
            });
            toast({ title: "Lead Closed", description: "The lead has been marked as closed."});
            setClosingLead(null);
            setCloseRemark("");
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "Failed to close the lead."});
        } finally {
            setIsClosing(false);
        }
    };


    return (
        <>
            <div className="p-4 md:p-6 lg:p-8 space-y-6">
                <header className="mb-2">
                    <h1 className="text-3xl font-bold tracking-tight">Welcome, {user?.name.split(' ')[0]}</h1>
                    <p className="text-muted-foreground">Here are your active leads and orders.</p>
                </header>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-2">
                         <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Briefcase /> Active Leads</CardTitle>
                            <CardDescription>New walk-in customers assigned to you.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             {loading ? (
                                <Skeleton className="h-24 w-full" />
                            ) : walkinLeads.length > 0 ? (
                                <div className="space-y-3">
                                    {walkinLeads.map(lead => (
                                        <div key={lead.id} className="p-4 border rounded-lg flex justify-between items-center">
                                            <div>
                                                <p className="font-semibold">{lead.firstName} {lead.familyName}</p>
                                                <p className="text-sm text-muted-foreground">{lead.mobile}</p>
                                                {lead.lookingFor && <p className="text-xs text-muted-foreground pt-1">Looking for: {lead.lookingFor}</p>}
                                            </div>
                                            <div className="flex gap-2">
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button size="sm">Create Deal</Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Create a New Deal?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will create a new deal named "WalkIn" for {lead.firstName} {lead.familyName}. Are you sure you want to proceed?
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleCreateDeal(lead)} disabled={isCreatingDeal && dealCreationLead?.id === lead.id}>
                                                                {isCreatingDeal && dealCreationLead?.id === lead.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                                Yes, Create Deal
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                                <Button size="sm" variant="outline" onClick={() => setClosingLead(lead)}>Close</Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-sm text-muted-foreground py-10">No new leads assigned.</p>
                            )}
                        </CardContent>
                    </Card>
                    <Card className="lg:col-span-1">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Bell /> Recent Notifications</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 max-h-[75vh] overflow-y-auto">
                            {/* Notification rendering logic can be placed here if needed */}
                             <p className="text-center text-sm text-muted-foreground py-4">No new notifications.</p>
                        </CardContent>
                    </Card>
                    <Card className="lg:col-span-3">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><ListOrdered /> All Orders And Updates</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 max-h-[75vh] overflow-y-auto">
                            {loading ? (
                                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
                            ) : orders.length > 0 ? (
                                orders.map(order => (
                                    <Link key={order.id} href={`/dashboard/orders/${order.id}`}>
                                    <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                                        <div>
                                            <p className="font-semibold text-primary">{order.customerName}</p>
                                            <p className="text-sm text-muted-foreground">{order.id}</p>
                                        </div>
                                        <div className="text-right">
                                            <Badge variant={order.milestones.every(m => m.completed) ? 'default' : 'secondary'} className={cn('capitalize', order.milestones.every(m => m.completed) ? 'bg-green-600' : '')}>
                                                {order.milestones.slice().reverse().find(m => m.completed)?.name.toLowerCase() || 'Order Received'}
                                            </Badge>
                                            <p className="text-sm text-muted-foreground mt-1">{format(new Date(order.createdAt), 'dd MMM yyyy')}</p>
                                        </div>
                                    </div>
                                    </Link>
                                ))
                            ) : (
                                <p className="text-center text-muted-foreground py-10">No orders found.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={!!closingLead} onOpenChange={() => setClosingLead(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Close Lead: {closingLead?.firstName} {closingLead?.familyName}</DialogTitle>
                        <DialogDescription>Please provide a reason for closing this lead.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="close-remark">Remark</Label>
                        <Textarea id="close-remark" value={closeRemark} onChange={(e) => setCloseRemark(e.target.value)} placeholder="e.g., Customer not interested, will visit later..." />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setClosingLead(null)}>Cancel</Button>
                        <Button onClick={handleCloseLead} disabled={isClosing || !closeRemark}>
                            {isClosing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm & Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

const SalesmanDashboardV2 = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [walkinLeads, setWalkinLeads] = useState<Walkin_Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderSearch, setOrderSearch] = useState("");
  const [leadSearch, setLeadSearch] = useState("");

  const [closingLead, setClosingLead] = useState<Walkin_Customer | null>(null);
  const [closeRemark, setCloseRemark] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [dealCreationLead, setDealCreationLead] = useState<Walkin_Customer | null>(null);
  const [isCreatingDeal, setIsCreatingDeal] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const salesmanName = user.name;

    let loadedOrders = false;
    let loadedLeads = false;
    const markLoaded = () => {
      if (loadedOrders && loadedLeads) setLoading(false);
    };

    const ordersQuery = query(collection(db, "orders"), where("salesPerson", "==", salesmanName));
    const quotationsQuery = query(collectionGroup(db, "quotations"), where("representativeId", "==", user.id));
    const purchaseRequestsQuery = query(collection(db, "purchaseRequests"), where("salesman", "==", salesmanName));
    const leadsQuery = query(
      collection(db, "Walkin_Customer"),
      where("salesmanId", "==", user.id),
      where("status", "==", "Handed Over")
    );
    const notificationsQuery = query(
      collection(db, "users", user.id, "notifications"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubOrders = onSnapshot(
      ordersQuery,
      (snapshot) => {
        setOrders(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() } as Order)));
        loadedOrders = true;
        markLoaded();
      },
      () => {
        loadedOrders = true;
        markLoaded();
      }
    );
    const unsubQuotations = onSnapshot(
      quotationsQuery,
      (snapshot) => setQuotations(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() } as Quotation))),
      () => setQuotations([])
    );
    const unsubPurchase = onSnapshot(
      purchaseRequestsQuery,
      (snapshot) =>
        setPurchaseRequests(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() } as PurchaseRequest))),
      () => setPurchaseRequests([])
    );
    const unsubLeads = onSnapshot(
      leadsQuery,
      (snapshot) => {
        setWalkinLeads(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() } as Walkin_Customer)));
        loadedLeads = true;
        markLoaded();
      },
      () => {
        loadedLeads = true;
        markLoaded();
      }
    );
    const unsubNotifications = onSnapshot(
      notificationsQuery,
      (snapshot) => setNotifications(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }))),
      () => setNotifications([])
    );

    return () => {
      unsubOrders();
      unsubQuotations();
      unsubPurchase();
      unsubLeads();
      unsubNotifications();
    };
  }, [user]);

  const handleCreateDeal = async (lead: Walkin_Customer) => {
    if (!user) return;
    setIsCreatingDeal(true);
    setDealCreationLead(lead);
    try {
      const customersRef = collection(db, "customers");
      const customerQuery = query(customersRef, where("phone", "==", lead.mobile));
      const customerSnapshot = await getDocs(customerQuery);
      let customerId: string;
      if (customerSnapshot.empty) {
        const customerResult = await addCustomerAction({
          name: `${lead.firstName} ${lead.familyName}`,
          phone: lead.mobile,
          email: lead.email || "",
          createdBy: user.name,
        });
        if (!customerResult.success || !customerResult.customer) {
          throw new Error(customerResult.message || "Failed to create customer.");
        }
        customerId = customerResult.customer.id;
      } else {
        customerId = customerSnapshot.docs[0].id;
      }

      const dealResult = await addDealAction({
        customerId,
        dealName: "WalkIn",
        dealAmount: 1,
        representativeId: user.id,
        description: `Deal created from walk-in lead for ${lead.firstName} ${lead.familyName}.`,
        advanceForMeasurement: "No" as const,
      });

      if (!dealResult.success || !dealResult.deal) {
        throw new Error(dealResult.message || "Failed to create deal.");
      }

      await updateDoc(doc(db, "Walkin_Customer", lead.id), { status: "Deal Created" });
      toast({ title: "Deal Created", description: `Redirecting to deal #${dealResult.deal.dealId}` });
      router.push(`/dashboard/customers/${customerId}/${dealResult.deal.id}?tab=products`);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Deal Creation Failed", description: error?.message || "Try again." });
    } finally {
      setIsCreatingDeal(false);
      setDealCreationLead(null);
    }
  };

  const handleCloseLead = async () => {
    if (!closingLead) return;
    setIsClosing(true);
    try {
      await updateDoc(doc(db, "Walkin_Customer", closingLead.id), {
        status: "Closed",
        action: "Close",
        remarks: closeRemark,
      });
      toast({ title: "Lead Closed", description: "Lead has been marked as closed." });
      setClosingLead(null);
      setCloseRemark("");
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to close lead." });
    } finally {
      setIsClosing(false);
    }
  };

  const orderRows = useMemo(() => orders.map(deriveDashboardOrderRow), [orders]);
  const activeOrderRows = useMemo(() => orderRows.filter((row) => row.progress < 100), [orderRows]);
  const filteredOrderRows = useMemo(() => {
    const normalized = orderSearch.trim().toLowerCase();
    if (!normalized) return activeOrderRows;
    return activeOrderRows.filter((row) => {
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
        row.nextStep.toLowerCase().includes(normalized)
      );
    });
  }, [activeOrderRows, orderSearch]);

  const filteredLeads = useMemo(() => {
    const normalized = leadSearch.trim().toLowerCase();
    if (!normalized) return walkinLeads;
    return walkinLeads.filter((lead) => {
      return (
        `${lead.firstName || ""} ${lead.familyName || ""}`.toLowerCase().includes(normalized) ||
        String(lead.mobile || "")
          .toLowerCase()
          .includes(normalized) ||
        String(lead.lookingFor || "")
          .toLowerCase()
          .includes(normalized)
      );
    });
  }, [walkinLeads, leadSearch]);

  const criticalCount = activeOrderRows.filter((row) => row.risk === "critical").length;
  const completedCount = Math.max(0, orderRows.length - activeOrderRows.length);
  const avgProgress = activeOrderRows.length
    ? Math.round(activeOrderRows.reduce((sum, row) => sum + row.progress, 0) / activeOrderRows.length)
    : 0;
  const poGeneratedCount = purchaseRequests.filter((item) => normalizeText(item.status) === "po generated").length;

  const quickActions = [
    { title: "My Customers", href: "/dashboard/customers", icon: Briefcase },
    { title: "Walk-in Desk", href: "/dashboard/walk-in", icon: UserPlus },
    { title: "My Orders", href: "/dashboard/orders", icon: ListOrdered },
    { title: "Visits", href: "/dashboard/visits", icon: CalendarCheck },
  ] as const;

  return (
    <>
      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        <Card className="overflow-hidden border-orange-200 bg-gradient-to-r from-orange-50 via-white to-amber-50">
          <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Salesman Command Desk</p>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Salesman Dashboard
              </h1>
              <p className="max-w-3xl text-sm text-slate-600 md:text-base">
                Convert walk-ins fast, track risky orders, and keep your deal movement consistent every day.
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-3 lg:w-auto lg:min-w-[22rem]">
              <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
                <p className="text-xs text-muted-foreground">Assigned Leads</p>
                <p className="mt-1 text-2xl font-bold">{loading ? "..." : walkinLeads.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
                <p className="text-xs text-muted-foreground">Active Orders</p>
                <p className="mt-1 text-2xl font-bold">{loading ? "..." : activeOrderRows.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href} className="group block">
              <Card className="h-full border-slate-200 transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md">
                <CardContent className="flex h-full items-center justify-between p-4">
                  <div className="flex items-center gap-2">
                    <action.icon className="h-4 w-4 text-orange-700" />
                    <p className="text-sm font-semibold">{action.title}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Critical</p><p className="text-2xl font-bold text-red-700">{loading ? "..." : criticalCount}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Avg Progress</p><p className="text-2xl font-bold">{loading ? "..." : `${avgProgress}%`}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Completed</p><p className="text-2xl font-bold text-emerald-700">{loading ? "..." : completedCount}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">PO Generated</p><p className="text-2xl font-bold">{loading ? "..." : poGeneratedCount}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Quotations</p><p className="text-2xl font-bold">{loading ? "..." : quotations.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Unread Alerts</p><p className="text-2xl font-bold">{loading ? "..." : notifications.filter((item) => !item.read).length}</p></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader className="space-y-3">
              <CardTitle>Order Queue</CardTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Search order, customer, deal..." className="pl-8" />
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[32rem]">
                <div className="space-y-3">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />)
                  ) : filteredOrderRows.length ? (
                    filteredOrderRows.map((row) => (
                      <div key={row.order.id} className={`rounded-xl border p-4 ${riskContainerClassMap[row.risk]}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">{row.order.customerName || "-"}</p>
                              <Badge variant="secondary">{row.order.orderType || "-"}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Order #{row.order.crmOrderNo || row.order.id} | Deal #{row.order.dealId || "-"}
                            </p>
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
                    <p className="py-8 text-center text-sm text-muted-foreground">No active orders in queue.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-3">
              <CardTitle>Recent Alerts</CardTitle>
              <CardDescription>Latest notifications assigned to you.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[32rem]">
                <div className="space-y-2">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)
                  ) : notifications.length ? (
                    notifications.map((notification) => {
                      const createdAt = toDateSafe(notification.createdAt || notification.date);
                      return (
                        <div key={notification.id} className="rounded-lg border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold">{notification.type || "Update"}</p>
                            {!notification.read ? <Badge variant="outline">New</Badge> : null}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{notification.message || "No message"}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {createdAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : "Unknown time"}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Active Leads</CardTitle>
                <CardDescription>Create deal or close with remarks for your lead handovers.</CardDescription>
              </div>
              <div className="relative w-full lg:w-80">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Search name, phone, looking for..." className="pl-8" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : filteredLeads.length ? (
              <div className="space-y-3">
                {filteredLeads.map((lead) => (
                  <div key={lead.id} className="rounded-xl border p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold">{lead.firstName} {lead.familyName}</p>
                      <p className="text-sm text-muted-foreground">{lead.mobile}</p>
                      {lead.lookingFor ? <p className="text-xs text-muted-foreground mt-1">Looking for: {lead.lookingFor}</p> : null}
                    </div>
                    <div className="flex gap-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm">Create Deal</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Create a New Deal?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This creates a new deal named &quot;WalkIn&quot; for {lead.firstName} {lead.familyName}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void handleCreateDeal(lead)} disabled={isCreatingDeal && dealCreationLead?.id === lead.id}>
                              {isCreatingDeal && dealCreationLead?.id === lead.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              Yes, Create Deal
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button size="sm" variant="outline" onClick={() => setClosingLead(lead)}>Close</Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No leads assigned.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!closingLead} onOpenChange={() => setClosingLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Lead: {closingLead?.firstName} {closingLead?.familyName}</DialogTitle>
            <DialogDescription>Please provide a reason for closing this lead.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="close-remark">Remark</Label>
            <Textarea id="close-remark" value={closeRemark} onChange={(event) => setCloseRemark(event.target.value)} placeholder="e.g., customer postponed, not interested, duplicate..." />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClosingLead(null)}>Cancel</Button>
            <Button onClick={() => void handleCloseLead()} disabled={isClosing || !closeRemark}>
              {isClosing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm And Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

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
                o.milestones.find((m) => m.id === 5)?.completed &&
                !o.milestones.find((m) => m.id === 8)?.completed
            ).length,
            pendingOrderApproval: orders.filter((o) => o.status === "Pending Approval").length,
            pendingInvoice: orders.filter(
              (o) => o.invoicing?.status && o.invoicing.status !== "INVOICED"
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
