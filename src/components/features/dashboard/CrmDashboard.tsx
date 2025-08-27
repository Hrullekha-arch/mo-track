

"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, query, where, orderBy, getDocs, Timestamp, collectionGroup, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, DealVisit, User, Customer, Deal, PurchaseRequest, PurchaseStatus, Quotation, Milestone } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { format, isToday, formatDistanceToNow } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, Calendar, CheckCircle, Clock, FileSignature, GitCommitHorizontal, ListOrdered, MessageSquare, Phone, Search, ShoppingCart, Truck } from "lucide-react";
import { PO_PROCESS_CONFIG } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MilestoneProgress } from "@/components/features/order-management/MilestoneProgress";

interface EnrichedVisit extends DealVisit {
    customerName: string;
    dealName: string;
    customerPhone: string;
}

const OrderUpdatesFeed = ({ assignedSalesmen, salesmenUsers, dashboardType }: { assignedSalesmen: string[], salesmenUsers: User[], dashboardType: 'CRM' | 'PC' }) => {
    const [updates, setUpdates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        if (dashboardType === 'CRM' && assignedSalesmen.length === 0) {
            setLoading(false);
            setUpdates([]);
            return;
        }

        const salesmenIds = salesmenUsers
            .filter(u => assignedSalesmen.includes(u.name))
            .map(u => u.id);

        if (dashboardType === 'CRM' && salesmenIds.length === 0) {
            setLoading(false);
            setUpdates([]);
            return;
        }

        const ordersQuery = dashboardType === 'PC' 
            ? query(collection(db, "orders"), orderBy("createdAt", "desc"))
            : query(collection(db, "orders"), where("salesPerson", "in", assignedSalesmen), orderBy("createdAt", "desc"));
            
        const purchaseRequestsQuery = dashboardType === 'PC'
            ? query(collection(db, "purchaseRequests"), orderBy("createdAt", "desc"))
            : query(collection(db, "purchaseRequests"), where("salesman", "in", assignedSalesmen), orderBy("createdAt", "desc"));

        const quotesQuery = dashboardType === 'PC'
            ? query(collectionGroup(db, 'quotations'))
            : query(collectionGroup(db, 'quotations'), where('representativeId', 'in', salesmenIds));

        let localOrders: Order[] = [];
        let localPrs: PurchaseRequest[] = [];
        let localQuotes: Quotation[] = [];

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

            setUpdates(allNotifications.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        };
        
        const unsubs: (() => void)[] = [];

        const ordersListener = onSnapshot(ordersQuery, (snapshot) => {
            localOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
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
    }, [assignedSalesmen, salesmenUsers, dashboardType]);

    const filteredUpdates = useMemo(() => {
        if (!searchTerm) return updates;
        const lowercasedFilter = searchTerm.toLowerCase();

        return updates.filter(update => {
            const customerName = (update.data.customerName || '').toLowerCase();
            const orderId = (update.data.crmOrderNo || update.data.dealId || '').toLowerCase();
            const itemName = (update.data.milestone?.itemName || update.data?.items?.[0]?.bcn || '').toLowerCase();
            const poNumber = (update.data.milestone?.poNumber || '').toLowerCase();
            
            return (
                customerName.includes(lowercasedFilter) ||
                orderId.includes(lowercasedFilter) ||
                itemName.includes(lowercasedFilter) ||
                poNumber.includes(lowercasedFilter)
            );
        });
    }, [updates, searchTerm]);


    const renderNotification = (notification: any) => {
        let title = '';
        let description = '';
        let icon = <FileSignature />;

        switch(notification.type) {
            case 'Quotation Sent for Approval':
                title = "Quotation Submitted";
                description = `Quotation #${notification.data.quotationNo} for ${notification.data.customerName} is pending approval.`;
                icon = <FileSignature className="text-blue-500"/>
                break;
            case 'Quotation Approved':
                title = "Quotation Approved!";
                description = `Quotation #${notification.data.quotationNo} for ${notification.data.customerName} has been approved.`;
                icon = <CheckCircle className="text-green-500"/>
                break;
            case 'new_order':
                title = `New Order: ${notification.data.crmOrderNo}`;
                description = `${notification.data.customerName}`;
                icon = <FileSignature className="text-blue-500"/>
                break;
            case 'Order Pending Approval':
                title = "Order Submitted";
                description = `Order #${notification.data.crmOrderNo} for ${notification.data.customerName} is pending approval.`;
                icon = <FileSignature className="text-blue-500" />
                break;
            case 'Order Approved':
                title = "Order Approved";
                description = `Order #${notification.data.crmOrderNo} for ${notification.data.customerName} has been approved.`;
                 icon = <CheckCircle className="text-green-500"/>
                break;
            case 'Milestone Update':
                title = `Milestone: ${notification.data.milestone.name}`;
                description = `For order ${notification.data.crmOrderNo}`;
                icon = <CheckCircle className="text-green-500" />
                break;
            case 'Purchase Request Created':
                title = `Purchase Request Created`;
                description = `Materials for deal #${notification.data.dealId} have been requested.`;
                icon = <ShoppingCart className="text-orange-500" />;
                break;
            case 'PO Milestone Update':
                const milestoneConfig = PO_PROCESS_CONFIG.find(p => p.id === notification.data.milestone.stepId);
                title = `PO: ${milestoneConfig?.step || 'Updated'}`;
                const itemName = notification.data.milestone.itemName;
                const poNumber = notification.data.milestone.poNumber;
                let poDesc = `For ${poNumber ? `PO #${poNumber}`: ''} in Deal #${notification.data.dealId}`;
                if (itemName) {
                   poDesc = `For ${itemName} in Deal #${notification.data.dealId}`;
                }
                description = poDesc;
                icon = <Truck className="text-cyan-500" />;
                break;
        }

        return (
             <Link href={notification.href || '#'} key={notification.date + notification.title} className="block hover:bg-muted/50 p-2 rounded-md">
                <div className="flex items-start gap-3">
                    <div className="mt-1">{icon}</div>
                    <div>
                        <p className="font-semibold text-sm">{title}</p>
                        <p className="text-xs text-muted-foreground">{description}</p>
                        <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(notification.date), { addSuffix: true })}</p>
                    </div>
                </div>
            </Link>
        )
    }

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>Order and Deal Updates</CardTitle>
                 <div className="relative pt-2">
                    <Search className="absolute left-2.5 top-4.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search by customer, deal or BCN..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8"
                    />
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[calc(100vh-14rem)]">
                    <div className="space-y-4">
                        {loading ? (
                            Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                        ) : filteredUpdates.length > 0 ? (
                            filteredUpdates.map((update, i) => renderNotification(update))
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-8">No recent updates.</p>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
};

const TodayVisits = () => {
    const [visits, setVisits] = useState<EnrichedVisit[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const visitsQuery = query(collectionGroup(db, 'visits'), where("status", "==", "approved"));
        const unsubscribe = onSnapshot(visitsQuery, async (snapshot) => {
            
            const allVisits = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as DealVisit));
            const todayVisits = allVisits.filter(v => v.dueDate && isToday(new Date(v.dueDate)));
            
            const customerCache = new Map<string, Customer>();

            const enrichedVisitsPromises = todayVisits.map(async (visit) => {
                 const pathParts = snapshot.docs.find(d => d.id === visit.id)!.ref.path.split('/');
                 const customerId = pathParts[1];
                 const dealId = pathParts[3];

                 let customer: Customer | null = customerCache.get(customerId) || null;
                 if (!customer) {
                     const customerSnap = await getDoc(doc(db, 'customers', customerId));
                     if(customerSnap.exists()) {
                         customer = customerSnap.data() as Customer;
                         customerCache.set(customerId, customer);
                     }
                 }
                 const dealSnap = await getDoc(doc(db, 'customers', customerId, 'deals', dealId));
                 const deal = dealSnap.exists() ? dealSnap.data() as Deal : null;

                 return {
                     ...visit,
                     customerName: customer?.name || "Unknown",
                     customerPhone: customer?.mobileNo || "N/A",
                     dealName: deal?.dealName || "N/A"
                 }
            });

            const enrichedVisits = await Promise.all(enrichedVisitsPromises);
            setVisits(enrichedVisits as EnrichedVisit[]);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>Today's Visit Details</CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[calc(50vh-8rem)]">
                    <div className="space-y-3">
                         {loading ? (
                            Array.from({length: 2}).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
                        ) : visits.length > 0 ? (
                             visits.map(visit => (
                                <div key={visit.id} className="p-3 border rounded-lg">
                                    <p className="font-semibold">{visit.customerName}</p>
                                    <p className="text-sm text-muted-foreground">{visit.dealName}</p>
                                    <div className="flex justify-between items-center mt-2 text-xs">
                                        <span className="flex items-center gap-1"><Clock className="h-3 w-3"/>{format(new Date(visit.dueDate!), 'h:mm a')}</span>
                                        <span className="flex items-center gap-1"><Phone className="h-3 w-3"/>{visit.customerPhone}</span>
                                        <Badge variant="outline" className="capitalize">{visit.typeOfVisit}</Badge>
                                    </div>
                                </div>
                             ))
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-8">No visits scheduled for today.</p>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
};

const AllOrdersAndUpdates = ({ dashboardType, assignedSalesmen }: { dashboardType: 'CRM' | 'PC', assignedSalesmen: string[] }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    useEffect(() => {
        if (dashboardType === 'CRM' && assignedSalesmen.length === 0) {
            setLoading(false);
            setOrders([]);
            return;
        }

        const ordersQuery = dashboardType === 'PC'
            ? query(collection(db, "orders"), orderBy("createdAt", "desc"))
            : query(collection(db, "orders"), where("salesPerson", "in", assignedSalesmen), orderBy("createdAt", "desc"));
            
        const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
            const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(ordersData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [assignedSalesmen, dashboardType]);

    return (
        <>
            <Card className="h-full">
                <CardHeader>
                    <CardTitle>All orders And Updates</CardTitle>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[calc(50vh-8rem)]">
                        <div className="space-y-3">
                            {loading ? (
                                Array.from({length: 4}).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                            ) : orders.length > 0 ? (
                                orders.map(order => (
                                    <div key={order.id} className="p-3 border rounded-lg flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold">{order.customerName}</p>
                                            <p className="text-sm text-muted-foreground">{order.crmOrderNo} - {order.salesPerson}</p>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(order)}>
                                            <ArrowRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-8">No orders assigned.</p>
                            )}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
            <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Milestone Progress</DialogTitle>
                        <DialogDescription>
                            Current status for order #{selectedOrder?.crmOrderNo}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {selectedOrder && (
                            <MilestoneProgress milestones={selectedOrder.milestones} />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default function CrmDashboard({ dashboardType }: { dashboardType: 'CRM' | 'PC' }) {
    const { user } = useAuth();
    const [assignedSalesmen, setAssignedSalesmen] = useState<string[]>([]);
    const [salesmenUsers, setSalesmenUsers] = useState<User[]>([]);
    const [loadingAssignments, setLoadingAssignments] = useState(true);
    
    useEffect(() => {
        if (!user) return;
        setLoadingAssignments(true);

        const assignmentsQuery = query(collection(db, "salesmanCrmAssignments"), where("crmUserId", "==", user.id));
        const salesmenQuery = query(collection(db, "users"), where("role", "==", "salesman"));

        const fetchCrmData = async () => {
            const assignmentsSnapshot = await getDocs(assignmentsQuery);
            const names = assignmentsSnapshot.docs.map(doc => doc.id);
            setAssignedSalesmen(names);
            
            const salesmenSnapshot = await getDocs(salesmenQuery);
            setSalesmenUsers(salesmenSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
            setLoadingAssignments(false);
        };
        
        const fetchPcData = async () => {
             const salesmenSnapshot = await getDocs(salesmenQuery);
             setSalesmenUsers(salesmenSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
             setAssignedSalesmen(salesmenSnapshot.docs.map(doc => doc.data().name as string));
             setLoadingAssignments(false);
        };

        if (dashboardType === 'CRM') {
            fetchCrmData();
        } else if (dashboardType === 'PC') {
            fetchPcData();
        } else {
            setLoadingAssignments(false);
        }

    }, [user, dashboardType]);

    if (!user || loadingAssignments) {
        return <div className="p-4"><p>Loading assignments...</p></div>;
    }

    return (
        <div className="p-4 md:p-6 lg:p-8 h-full">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <div className="flex-1">
                        <AllOrdersAndUpdates dashboardType={dashboardType} assignedSalesmen={assignedSalesmen} />
                    </div>
                    <div className="flex-1">
                        <TodayVisits />
                    </div>
                </div>
                <div className="lg:col-span-1 h-full">
                    <OrderUpdatesFeed dashboardType={dashboardType} assignedSalesmen={assignedSalesmen} salesmenUsers={salesmenUsers} />
                </div>
            </div>
        </div>
    );
}

