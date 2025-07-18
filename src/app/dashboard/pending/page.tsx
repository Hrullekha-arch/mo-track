
"use client";

import { PendingOrdersList } from "@/components/features/order-management/PendingOrdersList";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function PendingOrdersPage() {
    const [refreshKey, setRefreshKey] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const { toast } = useToast();

    const handleRefresh = () => {
        setIsRefreshing(true);
        // This is a simulated refresh for user experience as Firestore provides real-time data.
        setTimeout(() => {
            setRefreshKey(prevKey => prevKey + 1);
            setIsRefreshing(false);
            toast({ title: "Data is up to date." });
        }, 700);
    }

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Orders to be Received</h1>
                    <p className="text-muted-foreground">Acknowledge new orders to add them to the main workflow.</p>
                </div>
                 <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline">
                    {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Refresh
                </Button>
            </header>
            <PendingOrdersList key={refreshKey} />
        </div>
    );
}
