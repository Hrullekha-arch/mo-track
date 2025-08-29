
"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, orderBy, getDocs, doc, collectionGroup, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, Quotation, Invoice, User, InvoiceBatch } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CheckCircle, FileSignature, HandCoins, ListOrdered, Printer, FileText } from "lucide-react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintableQuotationProfessional } from "@/components/features/order-management/PrintableQuotationProfessional";
import { PrintableInvoice } from "@/components/features/invoice/PrintableInvoice";

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

type RecentActivityItem = {
    id: string;
    type: 'Quotation' | 'Order' | 'Invoice';
    identifier: string;
    customerName: string;
    dealId?: string;
    amount: number;
    activityDate: string;
    data: Quotation | Order | Invoice;
};

export function AccountsDashboard() {
    const [counts, setCounts] = useState({
        pendingQuotations: 0,
        pendingOrders: 0,
        pendingPayments: 0,
        pendingInvoice: 0,
    });
    const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    
    // State for the preview dialog
    const [selectedItem, setSelectedItem] = useState<RecentActivityItem | null>(null);

    useEffect(() => {
        const usersQuery = query(collection(db, "users"));
        const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
            setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
        });
        
        const queries = {
            quotations: query(collectionGroup(db, 'quotations')),
            orders: query(collection(db, 'orders')),
            invoices: query(collection(db, 'invoices'), orderBy('createdAt', 'desc'), limit(10)),
            invoiceBatches: query(collection(db, 'invoiceBatches'), where('status', '==', 'pendingInvoice')),
        };
        
        const processData = () => {
            Promise.all([
                getDocs(queries.quotations),
                getDocs(queries.orders),
                getDocs(queries.invoices),
                getDocs(queries.invoiceBatches),
            ]).then(([quotationsSnapshot, ordersSnapshot, invoicesSnapshot, invoiceBatchesSnapshot]) => {
                const quotationsData = quotationsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Quotation & {id: string}));
                const ordersData = ordersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Order));
                const invoicesData = invoicesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Invoice));

                setCounts({
                    pendingQuotations: quotationsData.filter(q => q.status === 'Pending Approval').length,
                    pendingOrders: ordersData.filter(o => o.status === 'Pending Approval').length,
                    pendingPayments: ordersData.filter(o => o.balanceFollowUp && !o.paymentConfirmed).length,
                    pendingInvoice: invoiceBatchesSnapshot.size,
                });
                
                const approvedQuotes: RecentActivityItem[] = quotationsData
                    .filter(q => q.status === 'Approved' && q.approvedAt)
                    .map(q => ({
                        id: q.id, type: 'Quotation', identifier: q.quotationNo, customerName: q.customerName,
                        amount: q.totalAmount, activityDate: q.approvedAt!, data: q, dealId: (q as any).dealId
                    }));
                
                const approvedOrders: RecentActivityItem[] = ordersData
                    .filter(o => o.status === 'Approved' && o.approvedAt)
                    .map(o => ({
                        id: o.id, type: 'Order', identifier: o.crmOrderNo, customerName: o.customerName,
                        amount: o.totalAmount || 0, activityDate: o.approvedAt!, data: o, dealId: o.dealId
                    }));

                const recentInvoices: RecentActivityItem[] = invoicesData.map(inv => ({
                    id: inv.id, type: 'Invoice', identifier: inv.invoiceNo, customerName: inv.customer.name,
                    amount: inv.totals.grandTotal, activityDate: inv.createdAt, data: inv, dealId: (inv as any).dealId
                }));

                setRecentActivity(
                    [...approvedQuotes, ...approvedOrders, ...recentInvoices]
                    .sort((a,b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime())
                    .slice(0, 10)
                );
                
                setLoading(false);
            });
        };

        processData(); // Initial fetch
        
        return () => {
            unsubscribeUsers();
        };
    }, []);

    const dashboardItems = [
        { title: "Pending Quotation Approvals", count: counts.pendingQuotations, href: "/dashboard/approvals", icon: FileSignature },
        { title: "Pending Order Approvals", count: counts.pendingOrders, href: "/dashboard/approvals?tab=orders", icon: ListOrdered },
        { title: "Pending Payment Confirmation", count: counts.pendingPayments, href: "/dashboard/approvals?tab=payment-confirmation", icon: HandCoins },
        { title: "Pending Invoice Generation", count: counts.pendingInvoice, href: "/dashboard/invoice", icon: FileText },
    ];
    
    const handlePrint = () => {
        const printContent = document.getElementById('printable-dialog-content');
        if (!printContent) return;
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write('<html><head><title>Print</title></head><body>');
            printWindow.document.write(printContent.innerHTML);
            printWindow.document.write('</body></html>');
            printWindow.document.close();
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
                printWindow.close();
            }, 250);
        }
    };

    const getPrintableInvoiceBatch = (invoice: Invoice): InvoiceBatch => {
        return {
            id: invoice.id,
            orderId: invoice.orderId,
            customerName: invoice.customer.name,
            customerPhone: invoice.customer.phone,
            createdAt: invoice.createdAt,
            status: 'invoiced', // Assuming it's invoiced for preview
            items: invoice.items,
            tallyVoucherNo: invoice.tallyVoucherNo,
            invoiceId: invoice.id,
            isVas: invoice.isVas
        };
    }
    
    const renderActivityTitle = (item: RecentActivityItem) => {
        let title = `${item.type} #${item.identifier}`;
        if (item.type === 'Order' && item.dealId) {
            title += ` (Deal: #${item.dealId})`;
        }
        return title;
    };

    return (
        <>
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
             <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Accounts Dashboard</h1>
                <p className="text-muted-foreground">Key metrics and recent activities for the accounts department.</p>
            </header>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>The latest quotations, orders, and invoices that have been processed.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {loading ? (
                            Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                        ) : recentActivity.length > 0 ? (
                            recentActivity.map(item => (
                                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-primary/10 text-primary rounded-full">
                                            <FileSignature className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <Button variant="link" className="p-0 h-auto font-semibold" onClick={() => setSelectedItem(item)}>
                                                {renderActivityTitle(item)}
                                            </Button>
                                            <p className="text-sm text-muted-foreground">{item.customerName}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold">₹{item.amount.toLocaleString('en-IN')}</p>
                                        <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(item.activityDate), { addSuffix: true })}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-8">No recent activity found.</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>

         <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
            <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Document Preview</DialogTitle>
                </DialogHeader>
                <div className="flex-grow overflow-y-auto" id="printable-dialog-content">
                    {selectedItem?.type === 'Quotation' && (
                        <PrintableQuotationProfessional
                            values={selectedItem.data as Quotation}
                            creatorName={allUsers.find(u => u.id === (selectedItem.data as Quotation).createdBy)?.name}
                            salesmanName={allUsers.find(s => s.id === (selectedItem.data as Quotation).representativeId)?.name}
                        />
                    )}
                    {selectedItem?.type === 'Invoice' && (
                        <PrintableInvoice
                            batches={[getPrintableInvoiceBatch(selectedItem.data as Invoice)]}
                            orders={[]}
                            preGeneratedInvoiceNo={(selectedItem.data as Invoice).invoiceNo}
                        />
                    )}
                    {/* Placeholder for PrintableOrder */}
                    {selectedItem?.type === 'Order' && (
                         <div className="p-8">Order Preview for {(selectedItem.data as Order).id} not implemented yet.</div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setSelectedItem(null)}>Close</Button>
                    <Button onClick={handlePrint}><Printer className="mr-2 h-4 w-4"/>Print</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    )
}
