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
      <section className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-[linear-gradient(135deg,_#0f1e33_0%,_#173252_52%,_#1e4f61_100%)] text-white shadow-xl shadow-slate-900/10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-20 top-0 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-emerald-300/10 blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
        <div className="relative grid gap-3.5 p-3.5 md:p-4 xl:grid-cols-[minmax(0,1.02fr)_minmax(280px,0.98fr)] xl:items-start">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-2.5 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-200">Inventory Control</span>
            </div>
            <div className="space-y-1.5">
              <h1 className="max-w-3xl text-[2rem] font-bold tracking-tight md:text-[2.35rem] xl:text-[2.65rem]">Inventory Workspace</h1>
              <p className="max-w-2xl text-[13px] leading-relaxed text-slate-200/90 md:text-sm">
                Manage item masters, stock movement, rack-level control, and audit-ready inventory history from one professional workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-2.5 py-1.5 text-xs font-medium text-white transition hover:-translate-y-0.5 hover:bg-white/14"
                  >
                    <Icon className="h-3 w-3" />
                    <span>{action.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="grid gap-2 rounded-[20px] border border-white/10 bg-white/6 p-2.5 backdrop-blur-sm md:grid-cols-3">
              {heroFlow.map((step, index) => (
                <div
                  key={step.label}
                  className={`space-y-1 ${index < heroFlow.length - 1 ? "md:border-r md:border-white/10 md:pr-2.5" : ""}`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">{step.label}</p>
                  <p className="text-[13px] font-semibold text-white md:text-sm">{step.value}</p>
                  <p className="text-[11px] leading-relaxed text-slate-300">{step.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className={`h-full rounded-[18px] border p-3 text-slate-900 shadow-sm ${stat.tone}`}>
                  <div className="flex h-full items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{stat.label}</p>
                      <p className="mt-1 text-[1.7rem] font-bold tracking-tight leading-none md:text-[1.9rem]">{stat.value}</p>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{stat.detail}</p>
                    </div>
                    <div className="rounded-xl border border-white/70 bg-white/75 p-1.5">
                      <Icon className="h-3 w-3 text-slate-700" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-[linear-gradient(135deg,_#ffffff_0%,_#f7f9fc_100%)] p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Inventory Structure</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Professional stock workflow</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Keep the inventory team aligned with clear masters, stock operations, verification, and reporting blocks.
            </p>
          </div>
          <Button asChild className="h-10 rounded-xl bg-slate-900 px-4 text-white hover:bg-slate-800">
            <Link href="/dashboard/inventory/scan">
              <ScanLine className="mr-2 h-4 w-4" />
              Open Scanner
            </Link>
          </Button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {inventoryStructure.map((section) => (
            <InventoryStructureCard key={section.title} section={section} />
          ))}
        </div>
      </section>

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
