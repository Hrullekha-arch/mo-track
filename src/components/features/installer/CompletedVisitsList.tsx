
"use client";

import { useState, useEffect } from "react";
import { collectionGroup, onSnapshot, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DealVisit, Customer, Deal } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, User, Clock, MapPin, GanttChartSquare, Phone, ArrowRight, MoreVertical, CheckCheck, Eye, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import Link from 'next/link';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useRouter } from "next/navigation";


interface EnrichedInstallerVisit extends DealVisit {
    customer: Customer | null;
    deal: Deal | null;
    dealDocId: string;
    customerId: string;
}

export function CompletedVisitsList({ installerId }: { installerId: string }) {
    const [visits, setVisits] = useState<EnrichedInstallerVisit[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        setLoading(true);
        const visitsQuery = query(
            collectionGroup(db, "visits"),
            where("assignedTo", "==", installerId),
            where("status", "==", "completed")
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
                    customerId: customerId,
                };
            });
            
            const visitsData = await Promise.all(visitsDataPromises);

            setVisits(visitsData.sort((a,b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching completed visits: ", error);
            toast({ variant: "destructive", title: "Error", description: "Could not fetch completed visits." });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [installerId, toast]);
    
    const handleReMeasure = (visit: EnrichedInstallerVisit) => {
      router.push(`/mobile/measurement/${visit.id}?dealId=${visit.dealDocId}&customerId=${visit.customerId}&measurementId=${visit.measurementId}`);
    };

    if (loading) {
        return (
            <div className="p-4 space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            {visits.length > 0 ? (
                visits.map(visit => (
                    <Card key={visit.id}>
                        <CardHeader>
                            <CardTitle className="capitalize">{visit.customer?.name || "Unknown Customer"}</CardTitle>
                            <CardDescription>
                                {visit.typeOfVisit} visit for Deal #{visit.deal?.dealId || 'N/A'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="text-sm space-y-3">
                            <p className="flex items-center gap-2 font-semibold"><Calendar className="h-4 w-4 text-muted-foreground" /> <span>{format(new Date(visit.dueDate), 'PPP p')}</span></p>
                            <p className="text-sm text-green-600 font-medium">Completed on: {format(new Date(visit.createdAt), 'PPP p')}</p>
                        </CardContent>
                        {visit.typeOfVisit === 'measurement' && visit.measurementPdfUrl && (
                            <CardFooter className="flex-col items-stretch gap-2">
                                <Button asChild variant="secondary" className="w-full">
                                    <Link href={visit.measurementPdfUrl} target="_blank" rel="noopener noreferrer">
                                        <Eye className="mr-2 h-4 w-4" />
                                        View Measurement
                                    </Link>
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" className="w-full">
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                            Re-measure
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action will open the measurement form again. Submitting a new measurement will overwrite the previous data for this visit.
                                        </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleReMeasure(visit)}>Continue</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </CardFooter>
                        )}
                    </Card>
                ))
            ) : (
                <div className="text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                    <p>No completed visits found.</p>
                </div>
            )}
        </div>
    )
}
