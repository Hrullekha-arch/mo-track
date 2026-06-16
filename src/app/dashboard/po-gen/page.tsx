
"use client";

import { PoGenTable } from "@/components/features/purchase/PoGenTable";
import { Suspense, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { collection, onSnapshot, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

export default function PoGenPage() {
    const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const requestsQuery = query(
            collection(db, "purchaseRequests"),
            where("status", "in", ["Approved", "PO Generated"]),
            limit(1000)
        );

        const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
            const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));
            setPurchaseRequests(requestsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching purchase requests:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not load purchase request data.",
            });
             setLoading(false);
        });

        return () => {
            unsubscribeRequests();
        }
    }, [toast]);
    
    return (
         <div className="w-full p-4 md:p-6 lg:p-8">
             <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">PO Generation</h1>
                <p className="text-muted-foreground">Generate Purchase Orders from approved Purchase Requests.</p>
            </header>
            <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
                <PoGenTable tableData={purchaseRequests} />
            </Suspense>
        </div>
    )
}
