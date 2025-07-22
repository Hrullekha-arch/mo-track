"use client";

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { Archive, ChevronRight, Package, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

function InboundCard({ request }: { request: PurchaseRequest }) {
    const items = [
        ...(request.fabricDetails?.filter(f => f.fabricName).map(f => ({ name: f.fabricName, qty: `${f.quantity} Mtr`, po: f.poNumber || '-' })) || []),
        ...(request.furnitureDetails?.filter(f => f.furnitureName).map(f => ({ name: f.furnitureName, qty: f.quantity, po: f.poNumber || '-' })) || [])
    ];

    return (
        <Link href={`/dashboard/inbound/${request.dealId}`} className="block">
            <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="font-semibold">{request.customerName}</p>
                            <p className="text-sm text-muted-foreground">Deal ID: {request.dealId}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                             <Badge variant={request.type === 'fabric' ? 'default' : 'secondary'} className="capitalize">{request.type}</Badge>
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
                        {items.map((item, index) => (
                            <div key={index} className="grid grid-cols-12 gap-2 items-center p-2 rounded-md text-sm">
                                <div className="col-span-3 font-mono">{item.po}</div>
                                <div className="col-span-5 truncate">{item.name}</div>
                                <div className="col-span-4 text-right font-mono">{item.qty}</div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}


export default function InboundPage() {
    const [inboundRequests, setInboundRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        // A PO is considered "inbound" once it's marked as "PO Confirmation" (step 1)
        const unsubscribe = onSnapshot(query(collection(db, "purchaseRequests")), (snapshot) => {
            const allRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));
            
            const filteredRequests = allRequests.filter(req => 
                req.poMilestones?.some(m => m.stepId === 1 && m.status === 'completed')
            );
            
            setInboundRequests(filteredRequests.sort((a,b) => {
                 const aDate = a.poMilestones?.find(m => m.stepId === 1)?.completedAt || a.createdAt;
                 const bDate = b.poMilestones?.find(m => m.stepId === 1)?.completedAt || b.createdAt;
                 return new Date(bDate).getTime() - new Date(aDate).getTime();
            }));
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);
    
    const filteredInboundRequests = useMemo(() => {
        if (!searchQuery) {
            return inboundRequests;
        }
        return inboundRequests.filter(request => {
            const query = searchQuery.toLowerCase();
            const customerNameMatch = request.customerName.toLowerCase().includes(query);
            const dealIdMatch = request.dealId.toLowerCase().includes(query);

            const items = [
                ...(request.fabricDetails?.map(f => ({ name: f.fabricName || '', po: f.poNumber || '' })) || []),
                ...(request.furnitureDetails?.map(f => ({ name: f.furnitureName || '', po: f.poNumber || '' })) || [])
            ];

            const itemMatch = items.some(item => 
                item.name.toLowerCase().includes(query) || 
                item.po.toLowerCase().includes(query)
            );

            return customerNameMatch || dealIdMatch || itemMatch;
        });
    }, [inboundRequests, searchQuery]);

    if (loading) {
        return (
            <div className="container mx-auto p-4 md:p-6 lg:p-8">
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
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Inbound Materials</h1>
                <p className="text-muted-foreground">
                    A log of all materials for which a Purchase Order has been confirmed with a vendor.
                </p>
            </header>
            
            <div className="mb-6 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                    placeholder="Search by Deal ID, Customer, Item Name or PO Number..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {filteredInboundRequests.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {filteredInboundRequests.map(request => (
                        <InboundCard key={request.id} request={request} />
                    ))}
                </div>
            ) : (
                <Card className="text-center p-12">
                    <div className="mx-auto bg-primary text-primary-foreground rounded-full p-3 w-fit mb-4">
                        <Package className="h-8 w-8" />
                    </div>
                    <CardTitle>No Inbound Items Found</CardTitle>
                    <CardDescription>
                        {searchQuery 
                            ? `No items match your search for "${searchQuery}".`
                            : `When a purchase order completes the "PO Confirmation" step, it will appear here.`
                        }
                    </CardDescription>
                </Card>
            )}
        </div>
    );
}