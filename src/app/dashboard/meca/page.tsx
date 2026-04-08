"use client";

import React, { useEffect, useMemo, useState } from "react";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  IndianRupee,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";

import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import {
  getMecaData,
  type MecaOrderProgressRow,
  type MecaResponse,
  type MecaSalesmanMetric,
  type MecaSummary,
  type MecaVisitRow,
} from "./actions";

// --- Constants & Formatters ---

const INR = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

const SHORT = (v: number): string => {
  if (v >= 10_000_000) return `Rs ${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `Rs ${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000) return `Rs ${(v / 1_000).toFixed(0)}K`;
  return INR(v);
};

const PCT = (v: number) => `${v.toFixed(1)}%`;

const RATE_CLS = (r: number) =>
  r >= 40
    ? "bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200"
    : r >= 20
    ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-200"
    : r >= 8
    ? "bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-900/40 dark:text-orange-200"
    : "bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/40 dark:text-red-200";

const EMPTY_SUMMARY: MecaSummary = {
  meetings: 0,
  attendedMeetings: 0,
  convertedOrders: 0,
  convertedFromMeetings: 0,
  convertedOutsideMeetings: 0,
  conversionRatio: 0,
  totalRevenue: 0,
  averageRupeeSale: 0,
  inProcessOrders: 0,
};

const EMPTY_DATA: MecaResponse = {
  generatedAt: new Date().toISOString(),
  salesmanOptions: [],
  salesmen: [],
  summary: EMPTY_SUMMARY,
  inProcessByStep: [],
  inProcessOrders: [],
  convertedOrders: [],
};

const INITIAL_RANGE: DateRange = {
  from: startOfDay(subDays(new Date(), 29)),
  to: endOfDay(new Date()),
};

const CHART_COLORS = {
  meetings: "#6366f1",
  attended: "#8b5cf6",
  converted: "#10b981",
  revenue: "#f59e0b",
  pipeline: "#3b82f6",
};

// --- KPI Card ---

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent: string;
  loading: boolean;
}) {
  return (
    <Card className="relative overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <p className="text-3xl font-bold mt-1 tabular-nums leading-none">{value}</p>
              {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
            </div>
            <div className={cn("p-2.5 rounded-xl", accent)}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Gauge (Radial) for conversion rate ---

function ConversionGauge({ value, loading }: { value: number; loading: boolean }) {
  const capped = Math.min(value, 100);
  const color =
    capped >= 40 ? "#10b981" : capped >= 20 ? "#f59e0b" : capped >= 8 ? "#f97316" : "#ef4444";

  const data = [{ name: "rate", value: capped, fill: color }];

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="flex flex-col items-center gap-1">
      <RadialBarChart
        width={160}
        height={110}
        cx={80}
        cy={90}
        innerRadius={55}
        outerRadius={80}
        startAngle={180}
        endAngle={0}
        data={data}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
        <RadialBar background dataKey="value" cornerRadius={6} angleAxisId={0} />
      </RadialBarChart>
      <p className="text-3xl font-bold tabular-nums -mt-6" style={{ color }}>
        {PCT(value)}
      </p>
      <p className="text-xs text-muted-foreground">Conversion Rate</p>
    </div>
  );
}

// --- Team Charts Section ---

function TeamChartsSection({
  salesmen,
  inProcessByStep,
  loading,
}: {
  salesmen: MecaSalesmanMetric[];
  inProcessByStep: { step: string; count: number }[];
  loading: boolean;
}) {
  const comparisonData = salesmen.map((s) => ({
    name: s.salesmanName.split(" ")[0], // first name only for chart
    Meetings: s.meetings,
    Attended: s.attendedMeetings,
    Converted: s.convertedOrders,
  }));

  const revenueData = salesmen.map((s) => ({
    name: s.salesmanName.split(" ")[0],
    Revenue: Math.round(s.totalRevenue / 1000),
    "Avg Sale": Math.round(s.averageRupeeSale / 1000),
  }));

  const pipelineTotal = inProcessByStep.reduce((a, b) => a + b.count, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Activity Comparison */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Salesman Activity Comparison</CardTitle>
          <CardDescription className="text-xs">Meetings scheduled vs attended vs converted</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-52 w-full" />
          ) : salesmen.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={comparisonData} barGap={2} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))",
                    fontSize: 12,
                  }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Meetings" fill={CHART_COLORS.meetings} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Attended" fill={CHART_COLORS.attended} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Converted" fill={CHART_COLORS.converted} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Pipeline by Step */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Active Pipeline Steps</CardTitle>
          <CardDescription className="text-xs">
            {pipelineTotal > 0 ? `${pipelineTotal} orders in progress` : "All clear"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[230px] overflow-y-auto pr-1">
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : inProcessByStep.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No active orders</p>
          ) : (
            inProcessByStep.map((row) => {
              const pct = pipelineTotal > 0 ? (row.count / pipelineTotal) * 100 : 0;
              return (
                <div key={row.step}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="font-medium truncate max-w-[140px]">{row.step}</span>
                    <span className="text-muted-foreground font-semibold ml-2">{row.count}</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Leaderboard Table ---

type SortKey = "convertedOrders" | "meetings" | "conversionRatio" | "totalRevenue" | "averageRupeeSale" | "inProcessOrders";

function LeaderboardTable({
  salesmen,
  loading,
  onSelect,
}: {
  salesmen: MecaSalesmanMetric[];
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("convertedOrders");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(
    () =>
      [...salesmen].sort((a, b) =>
        sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey],
      ),
    [salesmen, sortKey, sortDir],
  );

  function Th({
    k,
    children,
    className,
  }: {
    k: SortKey;
    children: React.ReactNode;
    className?: string;
  }) {
    const active = sortKey === k;
    return (
      <TableHead className={className}>
        <button
          onClick={() => {
            if (active) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
            else { setSortKey(k); setSortDir("desc"); }
          }}
          className={cn(
            "flex items-center gap-1 hover:text-foreground transition-colors",
            active ? "text-foreground font-bold" : "text-muted-foreground",
          )}
        >
          {children}
          {active ? (
            sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
          ) : null}
        </button>
      </TableHead>
    );
  }

  if (loading)
    return <Skeleton className="h-64 w-full" />;

  if (sorted.length === 0)
    return <p className="text-sm text-muted-foreground py-8 text-center">No salesman data found.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-10 text-center">#</TableHead>
            <TableHead>Salesman</TableHead>
            <Th k="meetings" className="text-right">Meetings</Th>
            <Th k="meetings" className="text-right">Attended</Th>
            <Th k="convertedOrders" className="text-right">Orders</Th>
            <Th k="conversionRatio" className="text-center">Conv %</Th>
            <Th k="averageRupeeSale" className="text-right">Avg Sale</Th>
            <Th k="totalRevenue" className="text-right">Revenue</Th>
            <Th k="inProcessOrders" className="text-right">Active</Th>
            <TableHead className="text-center">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((sm, idx) => (
            <TableRow
              key={sm.salesmanId}
              className="hover:bg-muted/30 cursor-pointer"
              onClick={() => onSelect(sm.salesmanId)}
            >
              <TableCell className="text-center font-medium">
                {idx + 1}
              </TableCell>
              <TableCell>
                <div className="font-semibold">{sm.salesmanName}</div>
                <div className="text-xs text-muted-foreground">
                  {sm.completedOrders} completed
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{sm.meetings}</TableCell>
              <TableCell className="text-right tabular-nums">
                {sm.attendedMeetings}
                {sm.meetings > 0 && (
                  <span className="text-[10px] text-muted-foreground ml-1">
                    ({Math.round((sm.attendedMeetings / sm.meetings) * 100)}%)
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold">{sm.convertedOrders}</TableCell>
              <TableCell className="text-center">
                <Badge className={cn("text-xs font-bold", RATE_CLS(sm.conversionRatio))}>
                  {PCT(sm.conversionRatio)}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{SHORT(sm.averageRupeeSale)}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">{SHORT(sm.totalRevenue)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {sm.inProcessOrders > 0 ? (
                  <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                    <Clock className="h-3 w-3" /> {sm.inProcessOrders}
                  </span>
                ) : "-"}
              </TableCell>
              <TableCell className="text-center">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={(e) => { e.stopPropagation(); onSelect(sm.salesmanId); }}
                >
                  View Detail
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// --- Meetings List View ---

type MeetingFilter = "all" | "attended" | "not_attended";

function MeetingsListView({ sm, loading }: { sm: MecaSalesmanMetric; loading: boolean }) {
  const [filter, setFilter] = useState<MeetingFilter>("all");

  const visits = sm.visits ?? [];
  const attended = visits.filter((v) => v.attended);
  const notAttended = visits.filter((v) => !v.attended);
  const displayed =
    filter === "attended" ? attended : filter === "not_attended" ? notAttended : visits;

  const STEP_COLORS: Record<MeetingFilter, string> = {
    all: "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-200",
    attended: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200",
    not_attended: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold">Meeting List</CardTitle>
            <CardDescription className="text-xs">All meetings assigned to {sm.salesmanName}</CardDescription>
          </div>
          {/* Summary pills */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: "all", label: "All", count: visits.length },
                { key: "attended", label: "Attended", count: attended.length },
                { key: "not_attended", label: "Not Attended", count: notAttended.length },
              ] as { key: MeetingFilter; label: string; count: number }[]
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition-all",
                  filter === f.key
                    ? STEP_COLORS[f.key]
                    : "bg-muted/40 text-muted-foreground border-border hover:bg-muted",
                )}
              >
                {f.label}
                <span className="bg-white/60 dark:bg-black/30 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>
        {/* Progress bars */}
        <div className="space-y-2 pt-2">
          <div>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="font-medium text-muted-foreground">Show-up Rate</span>
              <span className="font-semibold">
                {attended.length} / {visits.length} attended
              </span>
            </div>
            <Progress
              value={visits.length > 0 ? (attended.length / visits.length) * 100 : 0}
              className="h-2"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <Users className="h-8 w-8" />
            <p className="text-sm">No meetings found for this filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 sticky top-0">
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Attended</TableHead>
                  <TableHead className="text-center">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayed.map((v: MecaVisitRow, idx: number) => (
                  <TableRow key={v.visitId} className={cn(v.attended ? "" : "opacity-70")}>
                    <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{v.customerName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{v.visitType}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs capitalize text-muted-foreground">{v.status}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {v.attended ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-500 text-xs font-semibold">
                          <XCircle className="h-3.5 w-3.5" /> No
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {v.scheduledDate && v.scheduledDate !== new Date(0).toISOString()
                        ? format(new Date(v.scheduledDate), "dd MMM yy")
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Pipeline List View ---

function PipelineListView({
  sm,
  orders,
  loading,
}: {
  sm: MecaSalesmanMetric;
  orders: MecaOrderProgressRow[];
  loading: boolean;
}) {
  const STEP_PALETTE = [
    "#6366f1","#8b5cf6","#7c3aed","#3b82f6","#06b6d4",
    "#14b8a6","#10b981","#f59e0b","#f97316","#ef4444",
  ];

  return (
    <div className="space-y-4">
      {/* Stage breakdown + Order list side by side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Stage breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Pipeline by O2D Step</CardTitle>
            <CardDescription className="text-xs">
              {sm.inProcessOrders} orders in progress
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sm.stageBreakdown.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm font-medium">Pipeline is clear!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sm.stageBreakdown.map((stage, idx) => {
                  const pct = sm.inProcessOrders > 0 ? (stage.count / sm.inProcessOrders) * 100 : 0;
                  return (
                    <div key={stage.step} className="flex items-center gap-3">
                      <div
                        className="w-2 h-8 rounded-full flex-shrink-0"
                        style={{ backgroundColor: STEP_PALETTE[idx % STEP_PALETTE.length] }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium truncate max-w-[140px]">{stage.step}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                            <Badge variant="secondary" className="h-5 px-2 text-xs font-bold">{stage.count}</Badge>
                          </div>
                        </div>
                        <Progress value={Math.max(pct, 3)} className="h-1.5" />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t">
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Total Active</span>
                    <span>{sm.inProcessOrders}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active orders list */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Active Order List</CardTitle>
            <CardDescription className="text-xs">
              {orders.length} orders currently in the O2D pipeline
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm">No active orders in the pipeline.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border max-h-[380px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 sticky top-0">
                      <TableHead>Order No</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Current Step</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-center">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow key={o.orderId}>
                        <TableCell className="font-mono text-xs font-medium">{o.orderNo}</TableCell>
                        <TableCell className="font-medium">{o.customerName}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-xs"
                            style={{ borderColor: STEP_PALETTE[0], color: STEP_PALETTE[0] }}
                          >
                            {o.currentStep}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{SHORT(o.totalAmount)}</TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {format(new Date(o.createdAt), "dd MMM yy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// --- Salesman Detail View ---

function SalesmanDetailView({
  sm,
  inProcessOrders,
  convertedOrders,
  loading,
}: {
  sm: MecaSalesmanMetric;
  inProcessOrders: MecaOrderProgressRow[];
  convertedOrders: MecaOrderProgressRow[];
  loading: boolean;
}) {
  const myInProcessOrders = inProcessOrders.filter((o) => o.salesmanId === sm.salesmanId);
  const myConvertedOrders = convertedOrders.filter((o) => o.salesmanId === sm.salesmanId);
  const totalOrders = sm.convertedOrders;
  const activeOrders = sm.inProcessOrders;
  const [orderSourceFilter, setOrderSourceFilter] = useState<"all" | "meeting" | "outside">("all");
  const displayedConvertedOrders =
    orderSourceFilter === "all"
      ? myConvertedOrders
      : myConvertedOrders.filter((order) => order.conversionSource === orderSourceFilter);
  const displayedConvertedRevenue = displayedConvertedOrders.reduce(
    (sum, order) => sum + order.totalAmount,
    0
  );

  // Funnel data
  const funnelData = [
    { stage: "Scheduled", value: sm.meetings, fill: CHART_COLORS.meetings },
    { stage: "Attended", value: sm.attendedMeetings, fill: CHART_COLORS.attended },
    { stage: "Converted", value: sm.convertedOrders, fill: CHART_COLORS.converted },
    { stage: "Completed", value: sm.completedOrders, fill: "#10b981" },
  ];

  return (
    <div className="space-y-5">
      {/* Top row: gauge + 4 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Gauge */}
        <Card className="flex items-center justify-center p-4">
          {loading ? <Skeleton className="h-36 w-full" /> : <ConversionGauge value={sm.conversionRatio} loading={false} />}
        </Card>

        <KpiCard icon={Users} label="Meetings" value={loading ? "-" : String(sm.meetings)}
          sub={`${sm.attendedMeetings} attended`} accent="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400" loading={loading} />

        <KpiCard icon={TrendingUp} label="Converted" value={loading ? "-" : String(totalOrders)}
          sub={`${sm.convertedFromMeetings} from meetings | ${sm.convertedOutsideMeetings} outside`} accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400" loading={loading} />

        <KpiCard icon={IndianRupee} label="Avg Sale" value={loading ? "-" : SHORT(sm.averageRupeeSale)}
          sub={INR(sm.averageRupeeSale)} accent="bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400" loading={loading} />

        <KpiCard icon={Activity} label="Revenue" value={loading ? "-" : SHORT(sm.totalRevenue)}
          sub={INR(sm.totalRevenue)} accent="bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400" loading={loading} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="meetings" className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Meetings
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{sm.meetings}</Badge>
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Orders
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{totalOrders}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Active Pipeline
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{activeOrders}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Funnel chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Conversion Funnel</CardTitle>
                <CardDescription className="text-xs">How meetings flow to closed orders</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={funnelData} layout="vertical" barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="stage" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={70} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {funnelData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Stage breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Active Orders by O2D Step</CardTitle>
                <CardDescription className="text-xs">Where each in-progress deal is stuck</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {sm.stageBreakdown.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    <p className="text-sm">All orders completed!</p>
                  </div>
                ) : (
                  sm.stageBreakdown.map((stage) => (
                    <div key={stage.step}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="font-medium truncate max-w-[200px]">{stage.step}</span>
                        <span className="font-bold ml-2">{stage.count}</span>
                      </div>
                      <Progress
                        value={Math.max((stage.count / Math.max(sm.inProcessOrders, 1)) * 100, 5)}
                        className="h-2"
                      />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Score summary */}
          <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border-indigo-200 dark:border-indigo-800">
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4 text-center divide-x divide-indigo-200 dark:divide-indigo-800">
                <div>
                  <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
                    {sm.meetings > 0 ? Math.round((sm.attendedMeetings / sm.meetings) * 100) : 0}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Show-up Rate</p>
                  <p className="text-[10px] text-muted-foreground">Attended / Scheduled</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                    {PCT(sm.conversionRatio)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Conversion Rate</p>
                  <p className="text-[10px] text-muted-foreground">From Meetings / Total Orders</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {sm.convertedOrders > 0 ? Math.round((sm.completedOrders / sm.convertedOrders) * 100) : 0}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Completion Rate</p>
                  <p className="text-[10px] text-muted-foreground">Completed / Converted</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Meetings Tab */}
        <TabsContent value="meetings" className="mt-4">
          <MeetingsListView sm={sm} loading={loading} />
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">Converted Orders</CardTitle>
                  <CardDescription className="text-xs">Meeting-attributed vs outside conversions for {sm.salesmanName}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 text-xs text-indigo-600">
                    <Users className="h-3.5 w-3.5" />
                    {sm.convertedFromMeetings} from meetings
                  </div>
                  <div className="flex items-center gap-1 text-xs text-amber-600">
                    <Target className="h-3.5 w-3.5" />
                    {sm.convertedOutsideMeetings} outside
                  </div>
                  <div className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {sm.completedOrders} done
                  </div>
                  <div className="flex items-center gap-1 text-xs text-blue-600">
                    <Clock className="h-3.5 w-3.5" />
                    {sm.inProcessOrders} active
                  </div>
                  <div className="flex items-center gap-1 text-xs text-red-500">
                    <XCircle className="h-3.5 w-3.5" />
                    {totalOrders - sm.completedOrders - sm.inProcessOrders} other
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {(
                  [
                    { key: "all", label: "All", count: myConvertedOrders.length },
                    { key: "meeting", label: "From Meeting", count: sm.convertedFromMeetings },
                    { key: "outside", label: "Outside Meeting", count: sm.convertedOutsideMeetings },
                  ] as const
                ).map((source) => (
                  <button
                    key={source.key}
                    onClick={() => setOrderSourceFilter(source.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition-all",
                      orderSourceFilter === source.key
                        ? "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200"
                        : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                    )}
                  >
                    {source.label}
                    <span className="bg-white/60 dark:bg-black/30 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                      {source.count}
                    </span>
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {displayedConvertedOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">
                  No converted orders in this filter.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border max-h-[380px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 sticky top-0">
                        <TableHead>Order No</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Current Step</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-center">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedConvertedOrders.map((o) => (
                        <TableRow key={o.orderId}>
                          <TableCell className="font-mono text-xs font-medium">{o.orderNo}</TableCell>
                          <TableCell className="font-medium">{o.customerName}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                o.conversionSource === "meeting"
                                  ? "border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300"
                                  : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
                              )}
                            >
                              {o.conversionSource === "meeting" ? "From Meeting" : "Outside Meeting"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{o.currentStep}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{SHORT(o.totalAmount)}</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {format(new Date(o.createdAt), "dd MMM yy")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {/* Revenue summary */}
              <div className="mt-3 flex items-center justify-between px-1 py-2 bg-muted/40 rounded-lg">
                <span className="text-xs font-medium">
                  Total revenue from {displayedConvertedOrders.length} converted orders
                </span>
                <span className="text-sm font-bold">{SHORT(displayedConvertedRevenue)}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pipeline Tab */}
        <TabsContent value="pipeline" className="mt-4">
          <PipelineListView sm={sm} orders={myInProcessOrders} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- Main Page ---

export default function MecaPage() {
  const { toast } = useToast();

  const [dateRange, setDateRange] = useState<DateRange | undefined>(INITIAL_RANGE);
  const [selectedSalesmanId, setSelectedSalesmanId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MecaResponse>(EMPTY_DATA);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await getMecaData({
          from: dateRange?.from ? startOfDay(dateRange.from).toISOString() : undefined,
          to: dateRange?.to ? endOfDay(dateRange.to).toISOString() : undefined,
        });
        if (!cancelled) setData(response);
      } catch {
        if (!cancelled)
          toast({ variant: "destructive", title: "MeCA load failed", description: "Could not fetch analytics." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [dateRange?.from, dateRange?.to, refreshKey, toast]);

  // Clear selected salesman if they no longer exist in data
  useEffect(() => {
    if (!selectedSalesmanId) return;
    if (!data.salesmanOptions.some((o) => o.id === selectedSalesmanId))
      setSelectedSalesmanId(null);
  }, [data.salesmanOptions, selectedSalesmanId]);

  const selectedSalesman = useMemo(
    () => data.salesmen.find((s) => s.salesmanId === selectedSalesmanId) ?? null,
    [data.salesmen, selectedSalesmanId],
  );

  const s = data.summary;

  const rangeLabel = useMemo(() => {
    if (!dateRange?.from) return "All time";
    if (dateRange.to)
      return `${format(dateRange.from, "dd MMM")} - ${format(dateRange.to, "dd MMM yyyy")}`;
    return format(dateRange.from, "dd MMM yyyy");
  }, [dateRange?.from, dateRange?.to]);

  return (
    <div className="p-4 md:p-6 max-w-screen-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {selectedSalesman && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => setSelectedSalesmanId(null)}
            >
              <ArrowLeft className="h-4 w-4" /> All Salesmen
            </Button>
          )}
          <div>
            {selectedSalesman ? (
              <>
                <h1 className="text-xl font-bold tracking-tight">{selectedSalesman.salesmanName}</h1>
                <p className="text-xs text-muted-foreground">
                  MeCA Detail - {rangeLabel}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                  MeCA Dashboard
                  <span className="text-xs font-normal text-muted-foreground hidden sm:inline">
                    <span className="text-indigo-500 font-semibold">Me</span>eting -{" "}
                    <span className="text-amber-500 font-semibold">C</span>onversion -{" "}
                    <span className="text-emerald-500 font-semibold">A</span>vg Rupee Sale
                  </span>
                </h1>
                <p className="text-xs text-muted-foreground">{rangeLabel} - {data.salesmen.length} salesmen</p>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!selectedSalesman && (
            <Select
              value={selectedSalesmanId ?? "all"}
              onValueChange={(v) => setSelectedSalesmanId(v === "all" ? null : v)}
            >
              <SelectTrigger className="w-44 h-9 text-sm">
                <SelectValue placeholder="Select salesman..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Salesmen</SelectItem>
                {data.salesmanOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DateRangePicker date={dateRange} onDateChange={setDateRange} />
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Salesman Detail View */}
      {selectedSalesman ? (
        <SalesmanDetailView
          sm={selectedSalesman}
          inProcessOrders={data.inProcessOrders}
          convertedOrders={data.convertedOrders}
          loading={loading}
        />
      ) : (
        <>
          {/* Team KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon={Users} label="Total Meetings" value={loading ? "-" : s.meetings.toString()}
              sub={`${s.attendedMeetings} attended`}
              accent="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400" loading={loading} />
            <KpiCard icon={Target} label="Attended" value={loading ? "-" : s.attendedMeetings.toString()}
              sub={s.meetings > 0 ? `${Math.round((s.attendedMeetings / s.meetings) * 100)}% show-up` : "-"}
              accent="bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-400" loading={loading} />
            <KpiCard icon={TrendingUp} label="Orders Converted" value={loading ? "-" : s.convertedOrders.toString()}
              sub={`${s.convertedFromMeetings} from meetings | ${s.convertedOutsideMeetings} outside`}
              accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400" loading={loading} />
            <KpiCard icon={BarChart3} label="Conv. Rate" value={loading ? "-" : PCT(s.conversionRatio)}
              sub="From Meetings / Total Orders"
              accent="bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400" loading={loading} />
            <KpiCard icon={IndianRupee} label="Total Revenue" value={loading ? "-" : SHORT(s.totalRevenue)}
              sub={INR(s.totalRevenue)}
              accent="bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400" loading={loading} />
            <KpiCard icon={Activity} label="Avg. Rupee Sale" value={loading ? "-" : SHORT(s.averageRupeeSale)}
              sub="Per converted order"
              accent="bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400" loading={loading} />
          </div>

          {/* Charts */}
          <TeamChartsSection
            salesmen={data.salesmen}
            inProcessByStep={data.inProcessByStep}
            loading={loading}
          />

          {/* Leaderboard */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Salesman Leaderboard
              </CardTitle>
              <CardDescription className="text-xs">
                Click any row or &quot;View Detail&quot; to see full MeCA breakdown for that salesman
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LeaderboardTable
                salesmen={data.salesmen}
                loading={loading}
                onSelect={(id) => setSelectedSalesmanId(id)}
              />
            </CardContent>
          </Card>

          {/* Pipeline Snapshot */}
          {data.inProcessOrders.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Full Pipeline Snapshot
                  <Badge variant="secondary">{data.inProcessOrders.length}</Badge>
                </CardTitle>
                <CardDescription className="text-xs">All in-progress orders with current O2D step</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border max-h-[320px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 sticky top-0">
                        <TableHead>Order</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Salesman</TableHead>
                        <TableHead>Current Step</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-center">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.inProcessOrders.map((row) => (
                        <TableRow
                          key={row.orderId}
                          className="hover:bg-muted/30 cursor-pointer"
                          onClick={() => {
                            const sm = data.salesmen.find((s) => s.salesmanId === row.salesmanId);
                            if (sm) setSelectedSalesmanId(sm.salesmanId);
                          }}
                        >
                          <TableCell className="font-mono text-xs font-medium">{row.orderNo}</TableCell>
                          <TableCell className="font-medium">{row.customerName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.salesmanName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{row.currentStep}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{SHORT(row.totalAmount)}</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {format(new Date(row.createdAt), "dd MMM yy")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
