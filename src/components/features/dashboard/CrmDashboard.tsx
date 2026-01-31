

"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, query, where, orderBy, getDocs, Timestamp, collectionGroup, doc, getDoc, updateDoc } from "firebase/firestore";
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
import { ArrowRight, Calendar, CheckCircle, Clock, FileSignature, GitCommitHorizontal, ListOrdered, MessageSquare, Phone, Search, ShoppingCart, Truck, UserPlus } from "lucide-react";
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
    const { user } = useAuth();


    useEffect(() => {
        if (!user) return;
        
        const notificationQuery = query(collection(db, "users", user.id, "notifications"), orderBy("createdAt", "desc"));
        
        const unsubscribe = onSnapshot(notificationQuery, (snapshot) => {
            const newNotifications = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
            
            setUpdates(prevUpdates => {
                const existingIds = new Set(prevUpdates.map(u => u.id));
                const filteredNew = newNotifications.filter(n => !existingIds.has(n.id));
                return [...filteredNew, ...prevUpdates].sort((a,b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime())
            });
            setLoading(false);
        });
        
        return () => unsubscribe();
        
    }, [user]);

    const handleMarkAsRead = async (notificationId: string) => {
        if (!user) return;
        const notifRef = doc(db, "users", user.id, "notifications", notificationId);
        await updateDoc(notifRef, { read: true });
    };

    const filteredUpdates = useMemo(() => {
        if (!searchTerm) return updates;
        const lowercasedFilter = searchTerm.toLowerCase();

        return updates.filter(update => {
            const message = (update.message || '').toLowerCase();
            const type = (update.type || '').toLowerCase();
            
            return (
                message.includes(lowercasedFilter) ||
                type.includes(lowercasedFilter)
            );
        });
    }, [updates, searchTerm]);


    const renderNotification = (notification: any) => {
        let title = '';
        let description = '';
        let icon = <FileSignature />;
        let link = notification.link || '#';
        let cardClass = "border-transparent";

        switch(notification.type) {
            case 'new_walkin':
                title = 'New Walk-in Customer';
                description = notification.message;
                icon = <UserPlus className="text-blue-500" />;
                cardClass = "border-blue-500 bg-blue-500/5";
                break;
            default:
                title = "Update";
                description = notification.message || "A new update has occurred.";
        }

        return (
             <Link href={link} key={notification.id} className="block" onClick={() => handleMarkAsRead(notification.id)}>
                <div className={`p-3 rounded-lg border hover:bg-muted/50 transition-colors ${cardClass} ${notification.read ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                        <div className="mt-1">{icon}</div>
                        <div>
                            <p className="font-semibold text-sm">{title}</p>
                            <p className="text-xs text-muted-foreground">{description}</p>
                            <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}</p>
                        </div>
                    </div>
                </div>
            </Link>
        )
    }

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>Recent Updates</CardTitle>
                 <div className="relative pt-2">
                    <Search className="absolute left-2.5 top-4.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search updates..."
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
                     customerPhone: customer?.phone || customer?.mobileNo || "N/A",
                     dealName: deal?.title || deal?.dealName || "N/A"
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
