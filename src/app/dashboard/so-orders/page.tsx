
"use client";

import { SoOrderTable } from "@/components/features/order-management/SoOrderTable";
import { Suspense, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

export default function SoOrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const ordersQuery = query(collection(db, "orders"));

        const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
            const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(ordersData);
            setLoading(false);
        }, (error) => {
             console.error("Error fetching orders:", error);
             toast({
                variant: "destructive",
                title: "Error",
                description: "Could not load order data.",
            });
            setLoading(false);
        });

        return () => {
            unsubscribeOrders();
        }
    }, [toast]);

    return (
        <div className="w-full p-4 md:p-6 lg:p-8">
             <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">SO Orders</h1>
                <p className="text-muted-foreground">Detailed breakdown of items within Sales Orders.</p>
            </header>
            <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
                <SoOrderTable orders={orders} loading={loading} />
            </Suspense>
        </div>
    );
}
