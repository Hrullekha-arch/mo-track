import { Suspense } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  Database,
  History,
  PackageSearch,
  ScanLine,
  ShieldCheck,
  Warehouse,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockTable } from "@/components/features/inventory/StockTable";
import { StockManagementV2 } from "@/components/features/inventory/StockManagementV2";
import { StockHistoryTable } from "@/components/features/inventory/StockHistoryTable";
import { StockDetails } from "@/components/features/inventory/StockDetails";
import { TaxDetails } from "@/components/features/inventory/TaxDetails";
import { getStockPaginated } from "@/lib/server/stock";

type InventoryStructureBlock = {
  title: string;
  icon: LucideIcon;
  tone: string;
  items: string[];
};

type InventoryStatCard = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: string;
};

type InventoryTab = {
  value: string;
  label: string;
  description: string;
  content: ReactNode;
};

type HeroFlowStep = {
  label: string;
  value: string;
  detail: string;
};

const inventoryStructure: InventoryStructureBlock[] = [
  {
    title: "Catalog & Masters",
    icon: Boxes,
    tone: "border-sky-200 bg-[linear-gradient(180deg,_#fbfeff_0%,_#eef8ff_100%)]",
    items: ["Item master", "Category and barcode setup", "Tax details", "Supplier-linked stock catalog"],
  },
  {
    title: "Stock Operations",
    icon: Warehouse,
    tone: "border-emerald-200 bg-[linear-gradient(180deg,_#fbfffd_0%,_#edfdf5_100%)]",
    items: ["Opening and inbound stock", "Quantity updates", "Rack placement", "Purchase-linked receipts"],
  },
  {
    title: "Verification & Control",
    icon: ShieldCheck,
    tone: "border-amber-200 bg-[linear-gradient(180deg,_#fffef9_0%,_#fff6df_100%)]",
    items: ["Barcode scan", "Stock verification", "Reserved vs available tracking", "Audit-ready actions"],
  },
  {
    title: "Reports & History",
    icon: BarChart3,
    tone: "border-violet-200 bg-[linear-gradient(180deg,_#fcfbff_0%,_#f3efff_100%)]",
    items: ["Stock history", "Movement review", "Dead stock analysis", "Business reporting support"],
  },
];

const quickActions = [
  { href: "/dashboard/inventory/scan", label: "Scan Stock", icon: ScanLine },
  { href: "/dashboard/stock-verification", label: "Stock Verification", icon: ClipboardCheck },
  { href: "/dashboard/inbound", label: "Inbound", icon: Warehouse },
  { href: "/dashboard/reports", label: "Reports", icon: History },
];

export default async function InventoryPage() {
  const { items, lastDocId, totalCount } = await getStockPaginated();

  const stats: InventoryStatCard[] = [
    {
      label: "Total Items",
      value: `${totalCount}`,
      detail: "All inventory records in stock master",
      icon: Database,
      tone: "border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f6f8fb_100%)]",
    },
    {
      label: "Visible Now",
      value: `${items.length}`,
      detail: "Loaded on the current page for review",
      icon: PackageSearch,
      tone: "border-sky-200 bg-[linear-gradient(180deg,_#fbfeff_0%,_#eef8ff_100%)]",
    },
    {
      label: "Control Areas",
      value: `${inventoryStructure.length}`,
      detail: "Masters, operations, controls, and reports",
      icon: ShieldCheck,
      tone: "border-emerald-200 bg-[linear-gradient(180deg,_#fbfffd_0%,_#edfdf5_100%)]",
    },
    {
      label: "Workflow",
      value: "Scan -> Verify",
      detail: "Store, allocate, and track with audit history",
      icon: ClipboardCheck,
      tone: "border-amber-200 bg-[linear-gradient(180deg,_#fffef9_0%,_#fff6df_100%)]",
    },
  ];

  const tabs: InventoryTab[] = [
    {
      value: "stock",
      label: "Stock List",
      description: "Current inventory list with pagination and live browsing.",
      content: <StockTable initialData={items} lastDocId={lastDocId} totalCount={totalCount} />,
    },
    {
      value: "stock-management",
      label: "Stock Management",
      description: "Create, update, and manage stock entries and operational actions.",
      content: <StockManagementV2 />,
    },
    {
      value: "stock-details",
      label: "Stock Details",
      description: "Item-level details, supporting context, and stock visibility.",
      content: <StockDetails />,
    },
    {
      value: "tax-details",
      label: "Tax Details",
      description: "GST and tax-linked inventory configuration and review.",
      content: <TaxDetails />,
    },
    {
      value: "history",
      label: "History",
      description: "Movement history for stock additions, deductions, and changes.",
      content: <StockHistoryTable />,
    },
  ];

  const heroFlow: HeroFlowStep[] = [
    {
      label: "Step 1",
      value: "Receive and verify",
      detail: "Scan inbound stock, confirm quantity, and validate the item source.",
    },
    {
      label: "Step 2",
      value: "Store with control",
      detail: "Place stock by warehouse and rack so teams can find it quickly.",
    },
    {
      label: "Step 3",
      value: "Track every move",
      detail: "Reserve, issue, and review history with a clean audit trail.",
    },
  ];

  return (
    <div className="w-full space-y-3 p-3 md:p-3.5 lg:p-4">

      <Tabs defaultValue="stock" className="w-full space-y-4">
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
                <Suspense fallback={<InventorySkeleton />}>{tab.content}</Suspense>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function InventoryStructureCard({ section }: { section: InventoryStructureBlock }) {
  const Icon = section.icon;

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${section.tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
          <p className="mt-1 text-xs text-slate-600">Core inventory block</p>
        </div>
        <div className="rounded-xl border border-white/70 bg-white/70 p-2">
          <Icon className="h-4 w-4 text-slate-700" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {section.items.map((item) => (
          <div key={item} className="flex items-center gap-2 text-sm text-slate-700">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InventorySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-[420px] w-full rounded-2xl" />
    </div>
  );
}
