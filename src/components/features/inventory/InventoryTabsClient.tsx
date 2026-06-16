"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockTable } from "@/components/features/inventory/StockTable";
import { StockManagementV2 } from "@/components/features/inventory/StockManagementV2";
import { StockHistoryTable } from "@/components/features/inventory/StockHistoryTable";
import { StockDetails } from "@/components/features/inventory/StockDetails";
import { TaxDetails } from "@/components/features/inventory/TaxDetails";

type InventoryTab = {
  value: string;
  label: string;
  description: string;
};

const tabs: InventoryTab[] = [
  {
    value: "stock",
    label: "Stock List",
    description: "Current inventory list with pagination and live browsing.",
  },
  {
    value: "stock-management",
    label: "Stock Management",
    description: "Create, update, and manage stock entries and operational actions.",
  },
  {
    value: "stock-details",
    label: "Stock Details",
    description: "Item-level details, supporting context, and stock visibility.",
  },
  {
    value: "tax-details",
    label: "Tax Details",
    description: "GST and tax-linked inventory configuration and review.",
  },
  {
    value: "history",
    label: "History",
    description: "Movement history for stock additions, deductions, and changes.",
  },
];

export function InventoryTabsClient() {
  const [activeTab, setActiveTab] = useState(tabs[0]?.value || "stock");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 md:grid-cols-3 xl:grid-cols-5">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600 data-[state=active]:border-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="m-0">
          <Card className="rounded-3xl border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-lg text-slate-950">{tab.label}</CardTitle>
              <CardDescription>{tab.description}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-5">
              {activeTab === tab.value ? <InventoryTabContent value={tab.value} /> : <InventorySkeleton />}
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}

function InventoryTabContent({ value }: { value: string }) {
  if (value === "stock") return <StockTable />;
  if (value === "stock-management") return <StockManagementV2 />;
  if (value === "stock-details") return <StockDetails />;
  if (value === "tax-details") return <TaxDetails />;
  if (value === "history") return <StockHistoryTable />;
  return null;
}

function InventorySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-[420px] w-full rounded-2xl" />
    </div>
  );
}
