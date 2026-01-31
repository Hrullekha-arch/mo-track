
"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { FileSignature, ShoppingCart, Truck, Archive, Scissors, CalendarCheck, FileText, CheckCircle, PhoneCall, Bell, ListOrdered, UserCheck, Dot, GitCommitHorizontal, CheckCheckIcon, UserPlus, X, Briefcase } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, query, where, collectionGroup, getDocs, orderBy, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Order, Quotation, PurchaseRequest, User, PurchaseStatus, Walkin_Customer } from "@/lib/types";
import Image from 'next/image';
import { getFollowUpItems } from "./po-tracking/actions";
import { useAuth } from "@/context/AuthContext";
import { format, formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PO_PROCESS_CONFIG } from "@/lib/constants";
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

     useEffect(() => {
        const queries: { [key: string]: any } = {
            orders: query(collection(db, "orders")),
            quotations: query(collectionGroup(db, 'quotations')),
            purchaseRequests: query(collection(db, "purchaseRequests")),
            inbounds: query(collection(db, "inbounds"), where("status", "==", "Active")),
            visits: query(collectionGroup(db, 'visits')),
            cuttingTasks: query(collection(db, "Cutting"), where("status", "!=", "Completed")),
        };

        const unsubscribes = Object.entries(queries).map(([key, q]) => 
            onSnapshot(q, (snapshot) => {
                const docsData = snapshot.docs.map(doc => doc.data());
                
                if (key === 'orders') {
                    const orders = docsData as Order[];
                    setCounts(prev => ({
                        ...prev,
                        readyForDelivery: orders.filter(o => o.milestones.find(m => m.id === 5)?.completed && !o.milestones.find(m => m.id === 8)?.completed).length,
                        pendingOrderApproval: orders.filter(o => o.status === 'Pending Approval').length,
                        pendingInvoice: orders.filter(o => o.invoicing?.status && o.invoicing.status !== 'INVOICED').length,
                        paymentConfirmation: orders.filter(o => o.balanceFollowUp === true && !o.paymentConfirmed).length,
                    }));
                }
                 if (key === 'quotations') {
                    setCounts(prev => ({ ...prev, pendingQuotationApproval: docsData.filter(q => (q as Quotation).status === 'Pending Approval').length }));
                }
                if (key === 'purchaseRequests') {
                     setCounts(prev => ({
                        ...prev,
                        pendingPurchase: docsData.filter(pr => (pr as PurchaseRequest).status === 'Approved').length,
                    }));
                }
                if (key === 'inbounds') {
                    setCounts(prev => ({ ...prev, pendingInbound: snapshot.size }));
                }
                if (key === 'visits') {
                    setCounts(prev => ({ ...prev, pendingVisits: snapshot.size }));
                }
                if (key === 'cuttingTasks') {
                    setCounts(prev => ({ ...prev, pendingCutting: snapshot.size }));
                }
            })
        );
        
        const fetchFollowUpCount = async () => {
            try {
                const followUpItems = await getFollowUpItems();
                setCounts(prev => ({...prev, deliveryFollowUp: followUpItems.length}));
            } catch (e) {
                console.error("Failed to fetch follow-up count:", e);
                setCounts(prev => ({...prev, deliveryFollowUp: 0}));
            }
        };

        fetchFollowUpCount();
        
        Promise.all(Object.values(queries).map(q => getDocs(q))).finally(() => setLoading(false));

        return () => unsubscribes.forEach(unsub => unsub());
    }, []);

     const dashboardItems = [
        { title: "Pending Quotation Approvals", count: counts.pendingQuotationApproval, href: "/dashboard/approvals", icon: FileSignature },
        { title: "Pending Order Approvals", count: counts.pendingOrderApproval, href: "/dashboard/approvals?tab=orders", icon: FileSignature },
        { title: "Payment Confirmation", count: counts.paymentConfirmation, href: "/dashboard/approvals?tab=payment-confirmation", icon: CheckCircle },
        { title: "Ready for Delivery", count: counts.readyForDelivery, href: "/dashboard/orders", icon: Truck },
        { title: "Pending Purchase", count: counts.pendingPurchase, href: "/dashboard/purchase/pending-po", icon: ShoppingCart },
        { title: "Delivery Follow Up", count: counts.deliveryFollowUp, href: "/dashboard/po-tracking", icon: PhoneCall },
        { title: "Pending Inbound", count: counts.pendingInbound, href: "/dashboard/inbound", icon: Archive },
        { title: "All Visits", count: counts.pendingVisits, href: "/dashboard/visits", icon: CalendarCheck },
        { title: "Pending Invoice", count: counts.pendingInvoice, href: "/dashboard/invoice", icon: FileText },
        { title: "Pending Cutting", count: counts.pendingCutting, href: "/dashboard/cutting", icon: Scissors },
      ];

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 relative">
            <div className="absolute inset-0 flex items-center justify-center -z-10">
                <Image src="/logo.png" alt="MoTrack Watermark" width={500} height={250} className="opacity-5" data-ai-hint="logo watermark" />
            </div>
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Home Dashboard</h1>
                <p className="text-muted-foreground">Welcome! Here's a summary of your operations.</p>
            </header>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {dashboardItems.map(item => (
                    <SummaryCard 
                        key={item.title}
                        title={item.title}
                        count={item.count}
                        href={item.href}
                        icon={item.icon}
                        loading={loading}
                    />
                ))}
            </div>
        </div>
    );
};

interface SummaryCardProps {
    title: string;
    count: number | null;
    href: string;
    icon: React.ElementType;
    loading: boolean;
}

function SummaryCard({ title, count, href, icon: Icon, loading }: SummaryCardProps) {
    return (
        <Link href={href} className="block group">
            <Card className="hover:bg-muted/50 hover:shadow-lg transition-all h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">{title}</CardTitle>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    {loading ? (
                         <Skeleton className="h-7 w-12" />
                    ) : (
                        <div className="text-2xl font-bold">{count}</div>
                    )}
                </CardContent>
            </Card>
        </Link>
    )
}


export default function DashboardPage() {
    const { user, loading } = useAuth();
    
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

    if (user?.role === 'salesman') {
        return <SalesmanDashboard />;
    }

    if (user?.role === 'Accounts') {
        return <AccountsDashboard />;
    }

    return <AdminDashboard />;
}
