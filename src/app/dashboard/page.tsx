

"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { FileSignature, ShoppingCart, Truck, Archive, Scissors, CalendarCheck, FileText, CheckCircle, PhoneCall, Bell, ListOrdered, UserCheck, Dot, GitCommitHorizontal, CheckCheckIcon } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, query, where, collectionGroup, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Order, Quotation, PurchaseRequest, InboundRequest, DealVisit, CuttingTask, InvoiceBatch, User, PurchaseStatus } from "@/lib/types";
import Image from "next/image";
import { getFollowUpItems } from "./po-tracking/actions";
import { useAuth } from "@/context/AuthContext";
import { format, formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PO_PROCESS_CONFIG } from "@/lib/constants";

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

const SalesmanDashboard = () => {
    const { user } = useAuth();
    const [orders, setOrders] = useState<Order[]>([]);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        setLoading(true);

        const ordersQuery = query(collection(db, 'orders'), where('salesPerson', '==', user.name));
        const quotesQuery = query(collectionGroup(db, 'quotations'), where('representativeId', '==', user.id));
        const purchaseRequestsQuery = query(collection(db, 'purchaseRequests'), where('salesman', '==', user.name));

        let localOrders: Order[] = [];
        let localQuotes: Quotation[] = [];
        let localPrs: PurchaseRequest[] = [];

        const processNotifications = () => {
            const allNotifications: any[] = [];
            
            localOrders.forEach(order => {
                if (order.status === 'Pending Approval') {
                    allNotifications.push({ type: 'Order Pending Approval', data: order, date: order.createdAt });
                }
                if (order.status === 'Approved') {
                    allNotifications.push({ type: 'Order Approved', data: order, date: order.approvedAt || order.createdAt });
                }
                
                (order.milestones || []).forEach(m => {
                    if (m.completed && m.completedAt) {
                         allNotifications.push({ type: 'Milestone Update', data: { ...order, milestone: m }, date: m.completedAt });
                    }
                });
            });

            localQuotes.forEach(quote => {
                 if (quote.status === 'Approved') {
                    allNotifications.push({ type: 'Quotation Approved', data: quote, date: quote.approvedAt || quote.createdAt });
                }
                 if (quote.status === 'Pending Approval') {
                    allNotifications.push({ type: 'Quotation Sent for Approval', data: quote, date: quote.createdAt });
                }
            });
            
             localPrs.forEach(pr => {
                if(pr.status === 'Approved') {
                    allNotifications.push({ type: 'Purchase Request Created', data: pr, date: pr.createdAt });
                }
                (pr.poMilestones || []).forEach((m: PurchaseStatus) => {
                     if (m.completedAt) {
                         allNotifications.push({ type: 'PO Milestone Update', data: { ...pr, milestone: m }, date: m.completedAt });
                    }
                })
            });

            setNotifications(allNotifications.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        };
        
        const unsubs: (() => void)[] = [];

        const ordersListener = onSnapshot(ordersQuery, (snapshot) => {
            localOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(localOrders);
            processNotifications();
            setLoading(false);
        });
        unsubs.push(ordersListener);

        const quotesListener = onSnapshot(quotesQuery, (snapshot) => {
            localQuotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quotation));
            processNotifications();
        });
        unsubs.push(quotesListener);

        const prListener = onSnapshot(purchaseRequestsQuery, (snapshot) => {
            localPrs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));
            processNotifications();
        });
        unsubs.push(prListener);


        return () => unsubs.forEach(unsub => unsub());
    }, [user]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'in stock':
                return <Badge variant="default" className="bg-green-500">In Stock</Badge>;
            case 'allocated':
                 return <Badge variant="default" className="bg-blue-500">Allocated</Badge>;
            case 'po generated':
                return <Badge variant="secondary">PO Generated</Badge>;
            case 'pending for po':
                return <Badge variant="destructive">Pending for PO</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };
    
    const renderNotification = (notification: any) => {
        let title = '';
        let description = '';
        let icon = <GitCommitHorizontal />;

        switch(notification.type) {
            case 'Quotation Sent for Approval':
                title = "Quotation Submitted";
                description = `Quotation #${notification.data.quotationNo} for ${notification.data.customerName} is pending approval.`;
                icon = <FileSignature className="text-blue-500"/>
                break;
            case 'Quotation Approved':
                title = "Quotation Approved!";
                description = `Quotation #${notification.data.quotationNo} for ${notification.data.customerName} has been approved.`;
                icon = <CheckCheckIcon className="text-green-500"/>
                break;
            case 'Order Pending Approval':
                title = "Order Submitted";
                description = `Order #${notification.data.crmOrderNo} for ${notification.data.customerName} is pending approval.`;
                icon = <FileSignature className="text-blue-500" />
                break;
            case 'Order Approved':
                title = "Order Approved";
                description = `Order #${notification.data.crmOrderNo} for ${notification.data.customerName} has been approved.`;
                 icon = <CheckCheckIcon className="text-green-500"/>
                break;
            case 'Milestone Update':
                title = notification.data.milestone.name;
                description = `Order #${notification.data.crmOrderNo} for ${notification.data.customerName} has been updated.`;
                icon = <GitCommitHorizontal className="text-purple-500" />
                break;
            case 'Purchase Request Created':
                title = `Purchase Request Created`;
                description = `Materials for order #${notification.data.dealId} have been requested.`;
                icon = <ShoppingCart className="text-orange-500" />;
                break;
            case 'PO Milestone Update':
                const milestoneConfig = PO_PROCESS_CONFIG.find(p => p.id === notification.data.milestone.stepId);
                title = milestoneConfig?.step || 'PO Updated';
                const itemName = notification.data.milestone.itemName;
                if (itemName) {
                    const itemDetail = notification.data.fabricDetails?.find((f: any) => f.fabricName === itemName);
                    const itemQty = itemDetail ? `(${itemDetail.quantity} Mtr)` : '';
                    description = `"${itemName}" ${itemQty} for order #${notification.data.dealId} has been updated.`;
                } else {
                     description = `Purchase for order #${notification.data.dealId} has been updated.`;
                }
                icon = <Truck className="text-cyan-500" />;
                break;
        }

        return (
            <div className="flex items-start gap-4">
                 <div className="mt-1">{icon}</div>
                <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(notification.date), { addSuffix: true })}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6">
             <header className="mb-2">
                <h1 className="text-3xl font-bold tracking-tight">Welcome, {user?.name.split(' ')[0]}</h1>
                <p className="text-muted-foreground">Here's a look at your active orders and recent notifications.</p>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><ListOrdered /> All Orders And Updates</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
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
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Bell /> Recent Notification</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
                            {loading ? <Skeleton className="h-24 w-full" /> : (
                                notifications.length > 0 ? notifications.slice(0, 10).map((n, i) => (
                                    <div key={i}>{renderNotification(n)}</div>
                                )) : <p className="text-center text-sm text-muted-foreground py-4">No new notifications.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
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
            invoiceBatches: query(collection(db, "invoiceBatches"), where("status", "==", "pending")),
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
                if (key === 'invoiceBatches') {
                    setCounts(prev => ({ ...prev, pendingInvoice: snapshot.size }));
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


export default function DashboardPage() {
    const { role, loading } = useAuth();
    
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

    if (role === 'salesman') {
        return <SalesmanDashboard />;
    }

    return <AdminDashboard />;
}
