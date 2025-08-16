

"use client";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { FileSignature, ShoppingCart, Truck, Archive, Scissors, CalendarCheck, FileText, CheckCircle, PhoneCall } from "lucide-react";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, collectionGroup, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Order, Quotation, PurchaseRequest, InboundRequest, DealVisit, CuttingTask, InvoiceBatch } from "@/lib/types";
import Image from "next/image";
import { getFollowUpItems } from "./po-tracking/actions";

interface SummaryCardProps {
    title: string;
    count: number | null;
    href: string;
    icon: React.ElementType;
    loading: boolean;
}

function SummaryCard({ title, count, href, icon: Icon, loading }: SummaryCardProps) {
    return (
        <Link href={href} className="block">
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
        
        // Fetch follow-up items separately using the correct server action
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
        
        // Wait for all initial fetches to complete
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
}
