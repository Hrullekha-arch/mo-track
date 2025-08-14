
"use client";

import { useState, useEffect } from "react";
import { collectionGroup, onSnapshot, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DealVisit, Customer, Deal } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, User, Clock, MapPin, GanttChartSquare, Phone, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import Link from 'next/link';

interface EnrichedInstallerVisit extends DealVisit {
    customer: Customer | null;
    deal: Deal | null;
    dealDocId: string;
}

export function InstallerVisitsList({ installerId }: { installerId: string }) {
    const [visits, setVisits] = useState<EnrichedInstallerVisit[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        setLoading(true);
        const visitsQuery = query(
            collectionGroup(db, "visits"),
            where("assignedTo", "==", installerId)
        );

        const unsubscribe = onSnapshot(visitsQuery, async (snapshot) => {
            const customerCache = new Map<string, Customer>();
            const dealCache = new Map<string, Deal>();
            
            const visitsDataPromises = snapshot.docs.map(async (docSnap) => {
                const visit = docSnap.data() as DealVisit;
                const pathParts = docSnap.ref.path.split('/');
                const customerId = pathParts[1];
                const dealDocId = pathParts[3];

                let customerData: Customer | null = customerCache.get(customerId) || null;
                if (!customerData) {
                    const customerRef = doc(db, 'customers', customerId);
                    const customerSnap = await getDoc(customerRef);
                    if (customerSnap.exists()) {
                        customerData = { id: customerSnap.id, ...customerSnap.data() } as Customer;
                        customerCache.set(customerId, customerData);
                    }
                }
                
                const dealCacheKey = `${customerId}-${dealDocId}`;
                let dealData: Deal | null = dealCache.get(dealCacheKey) || null;
                if (!dealData) {
                     const dealRef = doc(db, 'customers', customerId, 'deals', dealDocId);
                     const dealSnap = await getDoc(dealRef);
                     if (dealSnap.exists()) {
                        dealData = { id: dealSnap.id, ...dealSnap.data() } as Deal;
                        dealCache.set(dealCacheKey, dealData);
                    }
                }

                return {
                    ...visit,
                    id: docSnap.id,
                    customer: customerData,
                    deal: dealData,
                    dealDocId: dealDocId,
                };
            });
            
            const visitsData = await Promise.all(visitsDataPromises);

            setVisits(visitsData.sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching installer visits: ", error);
            toast({ variant: "destructive", title: "Error", description: "Could not fetch assigned visits." });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [installerId, toast]);

    if (loading) {
        return (
            <div className="p-4 space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }
    
    return (
        <div className="p-4 space-y-4">
             <header className="mb-4">
                <h1 className="text-2xl font-bold">Assigned Visits</h1>
                <p className="text-muted-foreground">Your scheduled measurement and installation visits.</p>
            </header>
            {visits.length > 0 ? (
                visits.map(visit => (
                    <Card key={visit.id}>
                        <CardHeader>
                            <CardTitle className="capitalize">{visit.customer?.name || "Unknown Customer"}</CardTitle>
                            <CardDescription>
                                {visit.typeOfVisit} visit for Deal #{visit.dealId}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="text-sm space-y-3">
                            <p className="flex items-center gap-2 font-semibold"><Calendar className="h-4 w-4 text-muted-foreground" /> <span>{format(new Date(visit.dueDate), 'PPP p')}</span></p>
                             <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {visit.customer?.mobileNo || 'N/A'}</p>
                             <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {visit.customer?.addressPinCode || visit.customer?.city || 'N/A'}</p>
                        </CardContent>
                         <CardFooter>
                            <Button asChild className="w-full">
                                <Link href={`/dashboard/customers/${visit.customer?.id}/${visit.dealDocId}?tab=measurement`}>
                                    Start Measurement
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                        </CardFooter>
                    </Card>
                ))
            ) : (
                <div className="text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                    <p>No visits assigned to you yet.</p>
                </div>
            )}
        </div>
    )
}
