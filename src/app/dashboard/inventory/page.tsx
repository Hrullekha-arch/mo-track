import { Suspense } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  ClipboardCheck,
  Database,
  History,
  Layers3,
  PackageSearch,
  ScanLine,
  ShieldCheck,
  Sparkles,
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
  accent: string;
  href: string;
  cta: string;
  items: string[];
};

type InventoryStatCard = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: string;
  href: string;
  cta: string;
};

type InventoryTab = {
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  content: ReactNode;
};

const inventoryStructure: InventoryStructureBlock[] = [
  {
    title: "Catalog & Masters",
    icon: Boxes,
    tone: "border-sky-200 bg-[linear-gradient(180deg,_#fbfeff_0%,_#eef8ff_100%)]",
    accent: "from-sky-500/20 via-cyan-400/10 to-transparent",
    href: "/dashboard/inventory?tab=stock#workspace-tabs",
    cta: "Show stock list",
    items: ["Item master", "Category and barcode setup", "Tax details", "Supplier-linked stock catalog"],
  },
  {
    title: "Stock Operations",
    icon: Warehouse,
    tone: "border-emerald-200 bg-[linear-gradient(180deg,_#fbfffd_0%,_#edfdf5_100%)]",
    accent: "from-emerald-500/20 via-teal-400/10 to-transparent",
    href: "/dashboard/inventory?tab=stock-management#workspace-tabs",
    cta: "Open operations",
    items: ["Opening and inbound stock", "Quantity updates", "Rack placement", "Purchase-linked receipts"],
  },
  {
    title: "Verification & Control",
    icon: ShieldCheck,
    tone: "border-amber-200 bg-[linear-gradient(180deg,_#fffef9_0%,_#fff6df_100%)]",
    accent: "from-amber-500/20 via-yellow-400/10 to-transparent",
    href: "/dashboard/inventory?tab=stock-details#workspace-tabs",
    cta: "View controls",
    items: ["Barcode scan", "Stock verification", "Reserved vs available tracking", "Audit-ready actions"],
  },
  {
    title: "Reports & History",
    icon: BarChart3,
    tone: "border-violet-200 bg-[linear-gradient(180deg,_#fcfbff_0%,_#f3efff_100%)]",
    accent: "from-violet-500/20 via-fuchsia-400/10 to-transparent",
    href: "/dashboard/inventory?tab=history#workspace-tabs",
    cta: "Show history",
    items: ["Stock history", "Movement review", "Dead stock analysis", "Business reporting support"],
  },
];

const quickActions = [
  { href: "/dashboard/inventory/scan", label: "Scan Stock", icon: ScanLine },
  { href: "/dashboard/stock-verification", label: "Stock Verification", icon: ClipboardCheck },
  { href: "/dashboard/inbound", label: "Inbound", icon: Warehouse },
  { href: "/dashboard/reports", label: "Reports", icon: History },
];

type InventoryPageProps = {
  searchParams?: Promise<{ tab?: string | string[] }>;
};

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const tabValues = ["stock", "stock-management", "stock-details", "tax-details", "history"] as const;
  type InventoryTabValue = (typeof tabValues)[number];
  const defaultTab: InventoryTabValue = "stock";

  const { items, lastDocId, totalCount } = await getStockPaginated();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawTab = Array.isArray(resolvedSearchParams?.tab)
    ? resolvedSearchParams?.tab[0]
    : resolvedSearchParams?.tab;
  const activeTab = tabValues.includes((rawTab || "") as InventoryTabValue)
    ? ((rawTab || "") as InventoryTabValue)
    : defaultTab;

  const stats: InventoryStatCard[] = [
    {
      label: "Total Items",
      value: `${totalCount}`,
      detail: "All inventory records in stock master",
      icon: Database,
      tone: "border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f6f8fb_100%)]",
      href: "/dashboard/inventory?tab=stock#workspace-tabs",
      cta: "Open stock list",
    },
    {
      label: "Visible Now",
      value: `${items.length}`,
      detail: "Loaded on the current page for review",
      icon: PackageSearch,
      tone: "border-sky-200 bg-[linear-gradient(180deg,_#fbfeff_0%,_#eef8ff_100%)]",
      href: "/dashboard/inventory?tab=stock#workspace-tabs",
      cta: "View loaded records",
    },
    {
      label: "Control Areas",
      value: `${inventoryStructure.length}`,
      detail: "Masters, operations, controls, and reports",
      icon: ShieldCheck,
      tone: "border-emerald-200 bg-[linear-gradient(180deg,_#fbfffd_0%,_#edfdf5_100%)]",
      href: "/dashboard/inventory#inventory-structure",
      cta: "See zones",
    },
    {
      label: "Workflow",
      value: "Scan -> Verify",
      detail: "Store, allocate, and track with audit history",
      icon: ClipboardCheck,
      tone: "border-amber-200 bg-[linear-gradient(180deg,_#fffef9_0%,_#fff6df_100%)]",
      href: "/dashboard/inventory?tab=history#workspace-tabs",
      cta: "Open history",
    },
  ];

  const tabs: InventoryTab[] = [
    {
      value: "stock",
      label: "Stock List",
      description: "Current inventory list with pagination and live browsing.",
      icon: Layers3,
      tone: "data-[state=active]:border-sky-900 data-[state=active]:bg-sky-950",
      content: <StockTable initialData={items} lastDocId={lastDocId} totalCount={totalCount} />,
    },
    {
      value: "stock-management",
      label: "Stock Management",
      description: "Create, update, and manage stock entries and operational actions.",
      icon: Warehouse,
      tone: "data-[state=active]:border-emerald-900 data-[state=active]:bg-emerald-950",
      content: <StockManagementV2 />,
    },
    {
      value: "stock-details",
      label: "Stock Details",
      description: "Item-level details, supporting context, and stock visibility.",
      icon: PackageSearch,
      tone: "data-[state=active]:border-indigo-900 data-[state=active]:bg-indigo-950",
      content: <StockDetails />,
    },
    {
      value: "tax-details",
      label: "Tax Details",
      description: "GST and tax-linked inventory configuration and review.",
      icon: ClipboardCheck,
      tone: "data-[state=active]:border-amber-900 data-[state=active]:bg-amber-950",
      content: <TaxDetails />,
    },
    {
      value: "history",
      label: "History",
      description: "Movement history for stock additions, deductions, and changes.",
      icon: History,
      tone: "data-[state=active]:border-violet-900 data-[state=active]:bg-violet-950",
      content: <StockHistoryTable />,
    },
  ];

  return (
    <div className="w-full space-y-3 p-3 md:p-3.5 lg:p-4">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(38,211,186,0.18),_transparent_28%),linear-gradient(135deg,_#081525_0%,_#0f2742_35%,_#10384e_68%,_#14556a_100%)] text-white shadow-[0_28px_80px_-36px_rgba(15,23,42,0.75)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-20 top-0 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-emerald-300/10 blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
        <div className="relative grid gap-3.5 p-3.5 md:p-4 xl:grid-cols-[minmax(0,1.02fr)_minmax(280px,0.98fr)] xl:items-start">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-2.5 py-1">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-200">Inventory Control</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100">
                <Sparkles className="h-3 w-3" />
                Audit Ready
              </div>
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
                    className="group inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-2.5 py-1.5 text-xs font-medium text-white transition hover:-translate-y-0.5 hover:bg-white/14"
                  >
                    <Icon className="h-3 w-3" />
                    <span>{action.label}</span>
                    <ArrowUpRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Link
                  key={stat.label}
                  href={stat.href}
                  className={`group relative block h-full overflow-hidden rounded-[18px] border px-3 py-2.5 text-slate-900 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.45)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_36px_-28px_rgba(15,23,42,0.45)] ${stat.tone}`}
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-slate-900/10 to-transparent" />
                  <div className="flex h-full items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{stat.label}</p>
                      <p className="mt-1 text-[1.45rem] font-bold tracking-tight leading-none md:text-[1.65rem]">{stat.value}</p>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-slate-600">{stat.detail}</p>
                      <div className="mt-2 inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-700">
                        <span>{stat.cta}</span>
                        <ArrowUpRight className="h-3 w-3 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/70 bg-white/75 p-1.5">
                      <Icon className="h-3 w-3 text-slate-700" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section id="inventory-structure" className="rounded-[30px] border border-slate-200 bg-[linear-gradient(135deg,_#ffffff_0%,_#f7f9fc_55%,_#eef4fb_100%)] p-5 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.45)]">
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
          {inventoryStructure.map((section, index) => (
            <InventoryStructureCard key={section.title} section={section} index={index + 1} />
          ))}
        </div>
      </section>

      <Tabs defaultValue={activeTab} className="w-full space-y-4">
        <div id="workspace-tabs" className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] p-3 shadow-[0_12px_35px_-28px_rgba(15,23,42,0.35)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">Workspace Modes</p>
              <p className="mt-1 text-sm text-slate-600">Switch between stock, operations, details, tax, and audit review.</p>
            </div>
            <div className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600 md:inline-flex">
              Control Center
            </div>
          </div>
          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 md:grid-cols-3 xl:grid-cols-5">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={`
                  group flex h-auto flex-col items-start gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left text-xs font-semibold text-slate-600
                  data-[state=active]:text-white ${tab.tone}
                `}
              >
                <div className="flex w-full items-center gap-2">
                  <tab.icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </div>
                <span className="text-[11px] font-normal leading-relaxed text-slate-500 group-data-[state=active]:text-white/75">
                  {tab.description}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="m-0">
            <Card className="overflow-hidden rounded-[30px] border-slate-200 shadow-[0_16px_45px_-32px_rgba(15,23,42,0.4)]">
              <CardHeader className="border-b border-slate-100 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] pb-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
                    <tab.icon className="h-4 w-4 text-slate-700" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-slate-950">{tab.label}</CardTitle>
                    <CardDescription>{tab.description}</CardDescription>
                  </div>
                </div>
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

function InventoryStructureCard({ section, index }: { section: InventoryStructureBlock; index: number }) {
  const Icon = section.icon;

  return (
    <Link
      href={section.href}
      className={`group relative block overflow-hidden rounded-[24px] border p-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.35)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_-28px_rgba(15,23,42,0.4)] ${section.tone}`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-r ${section.accent}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Zone {String(index).padStart(2, "0")}</p>
          <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
          <p className="mt-1 text-xs text-slate-600">Core inventory block</p>
        </div>
        <div className="rounded-xl border border-white/70 bg-white/70 p-2 shadow-sm transition group-hover:scale-105">
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
      <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
        <span>{section.cta}</span>
        <ArrowUpRight className="h-3 w-3 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </Link>
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
