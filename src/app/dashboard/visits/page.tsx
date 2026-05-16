"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Activity, Zap, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVisitsData } from "@/hooks/visits/useVisitsData";
import { useInstallersTracking } from "@/hooks/visits/useInstallersTracking";

// Hooks


// Components - Lazy loaded for better performance
const LiveMapTab = dynamic(() => import("@/components/features/visits/tabs/LiveMapTab"), {
  loading: () => <TabLoadingSkeleton />,
  ssr: false,
});

const InstallersTab = dynamic(() => import("@/components/features/visits/tabs/InstallersTab"), {
  loading: () => <TabLoadingSkeleton />,
});

const AllVisitsTab = dynamic(() => import("@/components/features/visits/tabs/AllVisitsTab"), {
  loading: () => <TabLoadingSkeleton />,
});

// Loading skeleton
function TabLoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <Skeleton key={i} className="h-48 rounded-2xl" />
      ))}
    </div>
  );
}

// Summary card component
function SummaryCard({ label, value, icon: Icon, color }: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 flex items-center gap-3">
      <div className={cn("rounded-xl p-2.5 bg-gradient-to-br text-white shadow-sm", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

export default function VisitsPage() {
  const [activeTab, setActiveTab] = React.useState("live");
  
  // Custom hooks for data fetching
  const { visits, users, loading: visitsLoading } = useVisitsData();
  const { tracking, loading: trackingLoading } = useInstallersTracking();

  // Memoized computed values
  const installers = React.useMemo(
    () => users.filter((u) => u.role === "installer"),
    [users]
  );

  const stats = React.useMemo(() => {
    const totalActive = visits.filter((v) => v.status !== "completed").length;
    const totalCompleted = visits.filter((v) => v.status === "completed").length;
    const totalWorking = visits.filter((v) => v.visitStatus === "Working").length;

    return {
      totalInstallers: installers.length,
      totalActive,
      totalWorking,
      totalCompleted,
    };
  }, [visits, installers.length]);

  // Show loading state
  if (visitsLoading) {
    return (
      <div className="min-h-screen bg-slate-50/50 p-4 md:p-6 lg:p-8">
        <div className="mb-8">
          <Skeleton className="h-10 w-64 rounded-xl mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        </div>
        <TabLoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-6 lg:p-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Visit Management
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Monitor and manage all customer visits in real-time
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            label="Total Installers"
            value={stats.totalInstallers}
            icon={Users}
            color="from-indigo-500 to-indigo-600"
          />
          <SummaryCard
            label="Active Visits"
            value={stats.totalActive}
            icon={Activity}
            color="from-blue-500 to-blue-600"
          />
          <SummaryCard
            label="Working Now"
            value={stats.totalWorking}
            icon={Zap}
            color="from-amber-500 to-amber-600"
          />
          <SummaryCard
            label="Completed Today"
            value={stats.totalCompleted}
            icon={CheckCircle2}
            color="from-emerald-500 to-emerald-600"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white border border-slate-200 shadow-sm rounded-xl p-1 h-auto mb-6">
          {[
            { value: "live", label: "Live Map" },
            { value: "installers", label: "Installers" },
            { value: "all", label: "All Visits" },
          ].map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-lg text-sm px-5 py-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="live">
          <LiveMapTab
            tracking={tracking}
            trackingLoading={trackingLoading}
            installers={installers}
            visits={visits}
          />
        </TabsContent>

        <TabsContent value="installers">
          <InstallersTab
            installers={installers}
            visits={visits}
            tracking={tracking}
            users={users}
          />
        </TabsContent>

        <TabsContent value="all">
          <AllVisitsTab
            visits={visits}
            installers={installers}
            users={users}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}