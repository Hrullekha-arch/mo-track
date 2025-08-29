
"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, orderBy, limit, collectionGroup, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, Quotation } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle, Clock, FileSignature, HandCoins, ListOrdered } from "lucide-react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface SummaryCardProps {
    title: string;
    count: number;
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

interface RecentApprovalItem {
    id: string;
    type: 'Quotation' | 'Order';
    identifier: string;
    customerName: string;
    amount: number;
    approvedAt: string;
    href: string;
}

export function AccountsDashboard() {
    const [counts, setCounts] = useState({
        pendingQuotations: 0,
        pendingOrders: 0,
        pendingPayments: 0,
    });
    const [recentApprovals, setRecentApprovals] = useState<RecentApprovalItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const queries = {
            quotations: query(collectionGroup(db, 'quotations')),
            orders: query(collection(db, 'orders'))
        };
        
        const unsubscribes = [
            onSnapshot(queries.quotations, (snapshot) => {
                const quotationsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Quotation & {id: string}));
                setCounts(prev => ({
                    ...prev,
                    pendingQuotations: quotationsData.filter(q => q.status === 'Pending Approval').length,
                }));
                setRecentApprovals(prev => [
                    ...prev.filter(p => p.type !== 'Quotation'),
                    ...quotationsData
                        .filter(q => q.status === 'Approved' && q.approvedAt)
                        .map(q => ({
                            id: q.id,
                            type: 'Quotation',
                            identifier: q.quotationNo,
                            customerName: q.customerName,
                            amount: q.totalAmount,
                            approvedAt: q.approvedAt!,
                            href: `/dashboard/customers/${q.customerId}/${q.dealId}`
                        }))
                ].sort((a,b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime()).slice(0,5));
            }),
            onSnapshot(queries.orders, (snapshot) => {
                const ordersData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Order));
                setCounts(prev => ({
                    ...prev,
                    pendingOrders: ordersData.filter(o => o.status === 'Pending Approval').length,
                    pendingPayments: ordersData.filter(o => o.balanceFollowUp && !o.paymentConfirmed).length,
                }));
                 setRecentApprovals(prev => [
                    ...prev.filter(p => p.type !== 'Order'),
                    ...ordersData
                        .filter(o => o.status === 'Approved' && o.approvedAt)
                        .map(o => ({
                            id: o.id,
                            type: 'Order',
                            identifier: o.crmOrderNo,
                            customerName: o.customerName,
                            amount: o.totalAmount || 0,
                            approvedAt: o.approvedAt!,
                            href: `/dashboard/orders/${o.id}`
                        }))
                ].sort((a,b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime()).slice(0,5));
            }),
        ];

        Promise.all([
            getDocs(queries.quotations),
            getDocs(queries.orders)
        ]).finally(() => setLoading(false));

        return () => unsubscribes.forEach(unsub => unsub());
    }, []);

    const dashboardItems = [
        { title: "Pending Quotation Approvals", count: counts.pendingQuotations, href: "/dashboard/approvals", icon: FileSignature },
        { title: "Pending Order Approvals", count: counts.pendingOrders, href: "/dashboard/approvals?tab=orders", icon: ListOrdered },
        { title: "Pending Payment Confirmation", count: counts.pendingPayments, href: "/dashboard/approvals?tab=payment-confirmation", icon: HandCoins },
    ];
    
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
             <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Accounts Dashboard</h1>
                <p className="text-muted-foreground">Key metrics and recent activities for the accounts department.</p>
            </header>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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

            <Card className="mt-8">
                <CardHeader>
                    <CardTitle>Recent Approvals</CardTitle>
                    <CardDescription>The latest quotations and orders that have been approved.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {loading ? (
                            Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                        ) : recentApprovals.length > 0 ? (
                            recentApprovals.map(item => (
                                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-primary/10 text-primary rounded-full">
                                            {item.type === 'Quotation' ? <FileSignature className="h-5 w-5" /> : <ListOrdered className="h-5 w-5" />}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-primary">{item.identifier}</p>
                                            <p className="text-sm text-muted-foreground">{item.customerName}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold">₹{item.amount.toLocaleString('en-IN')}</p>
                                        <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(item.approvedAt), { addSuffix: true })}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-8">No recent approvals found.</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
