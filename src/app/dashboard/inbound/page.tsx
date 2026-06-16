// app/dashboard/inbound/page.tsx
"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InboundTable } from "@/components/features/purchase/InboundTable";

export default function InboundPage() {
  const [mode, setMode] = useState<"pending" | "completed">("pending");

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Inbound Materials</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track and manage incoming purchase orders and material deliveries.
        </p>
      </header>

      {/* Tab Switcher */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as "pending" | "completed")}>
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* 
        🔑 key={mode} forces a clean unmount/remount when switching tabs.
        This guarantees the simplified InboundTable resets its state 
        and fetches fresh data without stale filters or pagination.
      */}
      <InboundTable key={mode} mode={mode} />
    </div>
  );
}