
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Users, Clock, Banknote, ClipboardCheck, Box, ArrowRightCircle, Phone, MapPin, ChevronDown } from 'lucide-react';
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order } from "@/lib/types";
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from '@/components/ui/button';

const o2dProcess = [
    { step: "Receive Advance ₹1000", details: "For measurement/Fabric order", time: "30 min", role: "Salesman", icon: User, color: "text-blue-500", bg: "bg-blue-50" },
    { step: "Material Selection", details: "For Delivery/Production", time: "7 Days", role: "Salesman", icon: User, color: "text-blue-500", bg: "bg-blue-50" },
    { step: "Measurement", details: "Coordinate to CRM", time: "1 Day", role: "CRM", icon: Users, color: "text-purple-500", bg: "bg-purple-50" },
    { step: "Final Material Selection", details: "For Delivery/Production", time: "7 Days", role: "CRM / Salesman", icon: Users, color: "text-purple-500", bg: "bg-purple-50" },
    { step: "Quotation Making", details: "Final quotation for the customer", time: "1 Day", role: "Salesman", icon: User, color: "text-blue-500", bg: "bg-blue-50" },
    { step: "Quotation Re-Check", details: "Verification of the quotation", time: "1 Hour", role: "Accounts", icon: Banknote, color: "text-green-500", bg: "bg-green-50" },
    { step: "Advance Receiving Confirmation", details: "Before Material Ordering", time: "2 Hours", role: "Accounts", icon: Banknote, color: "text-green-500", bg: "bg-green-50" },
    { step: "PO Item List Tally", details: "Tally with Customer Quotation/Estimate", time: "1 Hour", role: "Salesman", icon: ClipboardCheck, color: "text-blue-500", bg: "bg-blue-50" },
    { step: "Purchase Material Receiving", details: "Time linked to another page", time: "Variable", role: "Purchase Dept.", icon: Box, color: "text-orange-500", bg: "bg-orange-50" },
    { step: "Move to Order Dashboard", details: "Order moves to the main tracking workflow", time: "Instant", role: "System", icon: ArrowRightCircle, color: "text-gray-500", bg: "bg-gray-50" }
];

function O2DProcessTimeline() {
    return (
        <div className="relative pl-6 pr-4 py-4">
            <div className="absolute left-9 top-0 h-full w-0.5 bg-border -translate-x-1/2" aria-hidden="true"></div>
            <div className="space-y-8">
                {o2dProcess.map((item, index) => {
                    const Icon = item.icon;
                    return (
                        <div key={index} className="relative flex items-start gap-6">
                            <div className="flex h-18 w-18 items-center justify-center shrink-0">
                                <div className={`flex h-12 w-12 items-center justify-center rounded-full border-2 border-border shadow-sm ${item.bg}`}>
                                     <Icon className={`h-6 w-6 ${item.color}`} />
                                </div>
                            </div>
                            <Card className="w-full group hover:shadow-md transition-shadow duration-300">
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-base">{item.step}</CardTitle>
                                            <CardDescription>{item.details}</CardDescription>
                                        </div>
                                        <div className="text-right flex-shrink-0 ml-4">
                                            <p className="font-semibold text-sm">{item.role}</p>
                                            <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                                                <Clock className="h-3 w-3" />
                                                <span>{item.time}</span>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                            </Card>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}


export default function O2DPage() {
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, "orders"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            const pending = allOrders.filter(order => {
                const firstMilestone = order.milestones.find(m => m.id === 1);
                return firstMilestone && !firstMilestone.completed;
            });
            setPendingOrders(pending);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">O2D (Order to Delivery) Process</h1>
                <p className="text-muted-foreground">Manage and track all orders in the pre-production phase before they are acknowledged.</p>
            </header>
            
            <div className="space-y-4">
                {loading ? (
                    Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
                ) : pendingOrders.length > 0 ? (
                    pendingOrders.map(order => (
                        <Collapsible key={order.id} className="border rounded-lg bg-card overflow-hidden">
                            <CardHeader className="flex flex-row items-center justify-between p-4">
                               <div className='flex-grow'>
                                    <h3 className="font-semibold text-lg">{order.customerName}</h3>
                                    <p className="text-sm text-muted-foreground">ID: {order.id}</p>
                                    <div className='mt-2 space-y-1 text-sm'>
                                        <p className='flex items-center gap-2'><Phone className='h-4 w-4 text-muted-foreground' /> {order.customerPhone}</p>
                                        <p className='flex items-center gap-2'><MapPin className='h-4 w-4 text-muted-foreground' /> {order.customerAddress}</p>
                                    </div>
                               </div>
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                        <ChevronDown className="h-4 w-4" />
                                        <span className='ml-2'>View Process</span>
                                    </Button>
                                </CollapsibleTrigger>
                            </CardHeader>
                            <CollapsibleContent>
                               <O2DProcessTimeline />
                            </CollapsibleContent>
                        </Collapsible>
                    ))
                ) : (
                    <Card className="text-center p-12">
                        <CardTitle>All Caught Up!</CardTitle>
                        <CardDescription>There are no new orders in the O2D phase.</CardDescription>
                    </Card>
                )}
            </div>
        </div>
    );
}
