
"use client";

import { useState, useEffect } from "react";
import { collectionGroup, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DealVisit } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, User, Clock, MapPin } from "lucide-react";
import { format } from "date-fns";

export function InstallerVisitsList({ installerId }: { installerId: string }) {
    const [visits, setVisits] = useState<DealVisit[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        setLoading(true);
        const visitsQuery = query(
            collectionGroup(db, "visits"),
            where("assignedTo", "==", installerId)
        );

        const unsubscribe = onSnapshot(visitsQuery, (snapshot) => {
            const visitsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DealVisit));
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
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
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
                            <CardTitle className="capitalize">{visit.typeOfVisit} Visit</CardTitle>
                            <CardDescription>For Deal #{visit.dealId}</CardDescription>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                             <p className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /> <strong>Due:</strong> {format(new Date(visit.dueDate), 'PPP p')}</p>
                             <p className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /> <strong>Created By:</strong> {visit.createdBy}</p>
                             {/* You would need to fetch customer/deal data to show more details like address */}
                        </CardContent>
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
