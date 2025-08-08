

"use client";

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { Archive, ChevronRight, Package, Search, CheckCircle2, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TOTAL_INBOUND_STEPS = 5;

const isRequestComplete = (request: PurchaseRequest) => {
    const items = request.fabricDetails || [];
    if (items.length === 0) return false;
    return items.every(item => (item.inboundMilestones?.filter(m => m.status === 'completed').length || 0) === TOTAL_INBOUND_STEPS);
}

function InboundCard({ request }: { request: PurchaseRequest }) {
    const items = [
        ...(request.fabricDetails?.filter(f => f.fabricName).map(f => ({ ...f, type: 'fabric' as const })) || []),
    ];

    return (
        <Link href={`/dashboard/inbound/${request.id}`} className="block">
            <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="font-semibold">{request.customerName}</p>
                            <p className="text-sm text-muted-foreground">Deal ID: {request.dealId}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                             <Badge variant={'default'} className="capitalize">Fabric</Badge>
                             <div className="flex items-center gap-2 text-muted-foreground">
                                <ChevronRight className="h-5 w-5" />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <h4 className="font-medium text-sm text-muted-foreground">Items</h4>
                    <Separator className="my-2" />
                    <div className="space-y-2">
                        {/* Header */}
                        <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground px-2">
                            <div className="col-span-3">PO</div>
                            <div className="col-span-5">Item Name</div>
                            <div className="col-span-4 text-right">Qty</div>
                        </div>
                        <Separator className="my-2" />
                        {items.map((item, index) => {
                            const isComplete = (item.inboundMilestones?.filter(m => m.status === 'completed').length || 0) === TOTAL_INBOUND_STEPS;
                            const name = item.fabricName;
                            const qty = `${item.quantity} Mtr`;

                            return (
                                <div 
                                    key={index} 
                                    className={cn(
                                        "grid grid-cols-12 gap-2 items-center p-2 rounded-md text-sm",
                                        isComplete && "bg-green-100 text-green-900"
                                    )}
                                >
                                    <div className="col-span-3 font-mono">{item.poNumber || '-'}</div>
                                    <div className="col-span-5 truncate font-medium">{name}</div>
                                    <div className="col-span-4 text-right font-mono flex items-center justify-end gap-2">
                                        <span>{qty}</span>
                                        {isComplete && <CheckCircle2 className="h-5 w-5 text-green-700" />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}


function InboundList({ requests, searchQuery }: { requests: PurchaseRequest[], searchQuery: string }) {
     const filteredRequests = useMemo(() => {
        if (!searchQuery) {
            return requests;
        }
        return requests.filter(request => {
            const query = searchQuery.toLowerCase();
            const customerNameMatch = request.customerName.toLowerCase().includes(query);
            const dealIdMatch = request.dealId.toLowerCase().includes(query);

            const items = [ ...(request.fabricDetails?.map(f => ({ name: f.fabricName || '', po: f.poNumber || '', qty: f.quantity || '' })) || []) ];

            const itemMatch = items.some(item => 
                item.name.toLowerCase().includes(query) || 
                item.po.toLowerCase().includes(query) ||
                String(item.qty).toLowerCase().includes(query)
            );

            return customerNameMatch || dealIdMatch || itemMatch;
        });
    }, [requests, searchQuery]);

    if (filteredRequests.length > 0) {
        return (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filteredRequests.map(request => (
                    <InboundCard key={request.id} request={request} />
                ))}
            </div>
        );
    }
    
    return (
        <Card className="text-center p-12">
            <div className="mx-auto bg-primary text-primary-foreground rounded-full p-3 w-fit mb-4">
                <Package className="h-8 w-8" />
            </div>
            <CardTitle>No Inbound Items Found</CardTitle>
            <CardDescription>
                {searchQuery 
                    ? `No items match your search for "${searchQuery}".`
                    : `When a purchase order is generated, it will appear here.`
                }
            </CardDescription>
        </Card>
    );
}


export default function InboundPage() {
    const [inboundRequests, setInboundRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const q = query(collection(db, "purchaseRequests"), where("status", "==", "PO Generated"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));
            setInboundRequests(requests.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);
    
    const { activeRequests, completedRequests } = useMemo(() => {
        const active: PurchaseRequest[] = [];
        const completed: PurchaseRequest[] = [];
        inboundRequests.forEach(req => {
            if (isRequestComplete(req)) {
                completed.push(req);
            } else {
                active.push(req);
            }
        });
        return { activeRequests: active, completedRequests: completed };
    }, [inboundRequests]);

    if (loading) {
        return (
            <div className="space-y-4">
                <header className="mb-8">
                    <Skeleton className="h-9 w-1/2 mb-2" />
                    <Skeleton className="h-5 w-3/4" />
                </header>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Inbound Materials</h1>
                <p className="text-muted-foreground">
                    A log of all materials for which a Purchase Order has been generated.
                </p>
            </header>
            
            <div className="mb-6 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                    placeholder="Search by Deal ID, Customer, Item, PO or Qty..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            
            <Tabs defaultValue="active" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="active">
                         <Archive className="mr-2 h-4 w-4" />
                        Active Inbound ({activeRequests.length})
                    </TabsTrigger>
                    <TabsTrigger value="history">
                        <History className="mr-2 h-4 w-4" />
                        Inbound History ({completedRequests.length})
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="active" className="pt-6">
                    <InboundList requests={activeRequests} searchQuery={searchQuery} />
                </TabsContent>
                <TabsContent value="history" className="pt-6">
                     <InboundList requests={completedRequests} searchQuery={searchQuery} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
