
"use client";

import { useState } from "react";
import { InboundTable } from '@/components/features/purchase/InboundTable';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function InboundPage() {
    const [mode, setMode] = useState<"pending" | "completed">("pending");

    return (
        <div className="space-y-4 p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Inbound Materials</h1>
                <p className="text-muted-foreground">
                    A log of all materials for which a Purchase Order has been generated.
                </p>
            </header>
            
            <Tabs
                value={mode}
                onValueChange={(value) => setMode(value as "pending" | "completed")}
                className="w-full"
            >
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="pending">Pending Inbound</TabsTrigger>
                    <TabsTrigger value="completed">Completed Inbound</TabsTrigger>
                </TabsList>
            </Tabs>

            <InboundTable mode={mode} />
        </div>
    );
}
