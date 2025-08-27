
"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, query, where, orderBy, getDocs, Timestamp, collectionGroup, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, DealVisit, User, Customer, Deal } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { format, isToday, formatDistanceToNow } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, Calendar, CheckCircle, Clock, FileSignature, ListOrdered, MessageSquare, Phone } from "lucide-react";

interface EnrichedVisit extends DealVisit {
    customerName: string;
    dealName: string;
    customerPhone: string;
}

const OrderUpdatesFeed = ({ crmUserId }: { crmUserId: string }) => {
    const [updates, setUpdates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const ordersQuery = query(collection(db, "orders"), where("handledByCrm", "==", crmUserId), orderBy("createdAt", "desc"), where("status", "==", "Approved"));

        const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
            const notifications: any[] = [];
            snapshot.docs.forEach(doc => {
                const order = doc.data() as Order;
                notifications.push({
                    type: 'new_order',
                    title: `New Order: ${order.crmOrderNo}`,
                    description: `${order.customerName}`,
                    date: order.createdAt,
                    href: `/dashboard/orders/${order.id}`
                });

                order.milestones.forEach(m => {
                    if (m.completed && m.completedAt) {
                         notifications.push({
                            type: 'milestone',
                            title: `Milestone: ${m.name}`,
                            description: `For order ${order.crmOrderNo}`,
                            date: m.completedAt,
                             href: `/dashboard/orders/${order.id}`
                        });
                    }
                });
            });
            setUpdates(notifications.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
            setLoading(false);
        });

        return () => unsubscribe();
    }, [crmUserId]);

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>Order and Deal Updates</CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[calc(100vh-12rem)]">
                    <div className="space-y-4">
                        {loading ? (
                            Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                        ) : updates.length > 0 ? (
                            updates.map((update, i) => (
                                <Link href={update.href} key={i} className="block hover:bg-muted/50 p-2 rounded-md">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-1">
                                            {update.type === 'new_order' && <FileSignature className="h-5 w-5 text-blue-500"/>}
                                            {update.type === 'milestone' && <CheckCircle className="h-5 w-5 text-green-500"/>}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-sm">{update.title}</p>
                                            <p className="text-xs text-muted-foreground">{update.description}</p>
                                            <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(update.date), { addSuffix: true })}</p>
                                        </div>
                                    </div>
                                </Link>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-8">No recent updates.</p>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
};

const TodayVisits = ({ crmUserId }: { crmUserId: string }) => {
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
    }, [crmUserId]);

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

const AllOrdersAndUpdates = ({ crmUserId }: { crmUserId: string }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

     useEffect(() => {
        const ordersQuery = query(collection(db, "orders"), where("handledByCrm", "==", crmUserId), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
            const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(ordersData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [crmUserId]);

    return (
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
                                    <Button asChild variant="ghost" size="icon">
                                        <Link href={`/dashboard/orders/${order.id}`}>
                                            <ArrowRight className="h-4 w-4" />
                                        </Link>
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
    );
};

export default function CrmDashboard() {
    const { user } = useAuth();
    
    if (!user) {
        return <p>Loading user data...</p>;
    }

    return (
        <div className="p-4 md:p-6 lg:p-8 h-full">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <div className="flex-1">
                        <AllOrdersAndUpdates crmUserId={user.id} />
                    </div>
                    <div className="flex-1">
                        <TodayVisits crmUserId={user.id} />
                    </div>
                </div>
                <div className="lg:col-span-1 h-full">
                    <OrderUpdatesFeed crmUserId={user.id} />
                </div>
            </div>
        </div>
    );
}
