"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/* ─── Types (mirror what PmsPage computes) ─────────────────────────────────── */
interface WorkStatusCard {
  key: string;
  label: string;
  value: number | string;
}

interface WorkStatusRow {
  orderId: string;
  orderNo: string;
  customer: string;
  bucket: "Machine Running" | "Pending" | "Qc Pending" | "Dispatch ready" | "Completed";
  statuses: Set<string> | string[];
  lastUpdate?: string;
}

interface WorkStatusData {
  cards: WorkStatusCard[];
  rows: WorkStatusRow[];
}

interface Props {
  workStatusData: WorkStatusData;
  formatDateTime: (v?: string) => string;
}

/* ─── Card meta config ──────────────────────────────────────────────────────── */
const CARD_META: Record<string, {
  accent: string;        // tailwind text color
  activeBg: string;      // selected card bg
  activeRing: string;    // selected ring
  passiveBg: string;     // unselected bg
  passiveText: string;   // unselected value text
  bar: string;           // progress bar fill
  glow: string;          // subtle shadow glow on hover/active
  dot: string;           // status dot color
  dotAnimate: boolean;
  icon: React.ReactNode;
  subtitle: string;
  filterBucket: string | null; // null = "All"
}> = {
  totalOrders: {
    accent: "text-slate-700",
    activeBg: "bg-slate-800",
    activeRing: "ring-slate-600",
    passiveBg: "bg-white",
    passiveText: "text-slate-800",
    bar: "bg-slate-500",
    glow: "hover:shadow-slate-200",
    dot: "bg-slate-400",
    dotAnimate: false,
    filterBucket: null,
    subtitle: "all active orders",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <rect x="2" y="3" width="20" height="18" rx="2" />
        <path d="M2 9h20M9 21V9" />
      </svg>
    ),
  },
  pending: {
    accent: "text-amber-600",
    activeBg: "bg-amber-500",
    activeRing: "ring-amber-400",
    passiveBg: "bg-amber-50",
    passiveText: "text-amber-600",
    bar: "bg-amber-400",
    glow: "hover:shadow-amber-200",
    dot: "bg-amber-400",
    dotAnimate: false,
    filterBucket: "Pending",
    subtitle: "waiting to start",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
  },
  machineRunning: {
    accent: "text-emerald-600",
    activeBg: "bg-emerald-500",
    activeRing: "ring-emerald-400",
    passiveBg: "bg-emerald-50",
    passiveText: "text-emerald-600",
    bar: "bg-emerald-400",
    glow: "hover:shadow-emerald-200",
    dot: "bg-emerald-500",
    dotAnimate: true,
    filterBucket: "Machine Running",
    subtitle: "in production now",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  qcPending: {
    accent: "text-blue-600",
    activeBg: "bg-blue-600",
    activeRing: "ring-blue-400",
    passiveBg: "bg-blue-50",
    passiveText: "text-blue-700",
    bar: "bg-blue-400",
    glow: "hover:shadow-blue-200",
    dot: "bg-blue-500",
    dotAnimate: false,
    filterBucket: "Qc Pending",
    subtitle: "awaiting quality check",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  dispatchReady: {
    accent: "text-orange-600",
    activeBg: "bg-orange-500",
    activeRing: "ring-orange-400",
    passiveBg: "bg-orange-50",
    passiveText: "text-orange-700",
    bar: "bg-orange-400",
    glow: "hover:shadow-orange-200",
    dot: "bg-orange-500",
    dotAnimate: false,
    filterBucket: "Dispatch ready",
    subtitle: "ready to ship",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <rect x="1" y="3" width="15" height="13" rx="1" />
        <path d="M16 8h4l3 3v4h-7V8z" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  completed: {
    accent: "text-green-600",
    activeBg: "bg-green-600",
    activeRing: "ring-green-400",
    passiveBg: "bg-green-50",
    passiveText: "text-green-700",
    bar: "bg-green-400",
    glow: "hover:shadow-green-200",
    dot: "bg-green-500",
    dotAnimate: false,
    filterBucket: "Completed",
    subtitle: "fully completed",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
};

const STATUS_COLOR: Record<string, string> = {
  IN_PROGRESS: "bg-emerald-500",
  PLANNED:     "bg-blue-500",
  WAITING:     "bg-amber-400",
  DONE:        "bg-slate-300",
};

const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "IP",
  PLANNED:     "PL",
  WAITING:     "W",
  DONE:        "✓",
};

const BUCKET_BADGE: Record<string, { bg: string; text: string; dot: string; animate: boolean }> = {
  "Machine Running": { bg: "bg-emerald-100", text: "text-emerald-800",  dot: "bg-emerald-500", animate: true },
  "Pending":         { bg: "bg-amber-100",   text: "text-amber-800",    dot: "bg-amber-400",   animate: false },
  "Qc Pending":      { bg: "bg-blue-100",    text: "text-blue-800",     dot: "bg-blue-500",    animate: false },
  "Dispatch ready":  { bg: "bg-orange-100",  text: "text-orange-800",   dot: "bg-orange-500",  animate: false },
  "Completed":       { bg: "bg-green-100",   text: "text-green-800",    dot: "bg-green-500",   animate: false },
};

/* ─── Component ─────────────────────────────────────────────────────────────── */
export function WorkStatusPanel({ workStatusData, formatDateTime }: Props) {
  const [activeKey, setActiveKey] = useState<string>("totalOrders");

  const totalValue = Number(workStatusData.cards.find(c => c.key === "totalOrders")?.value) || 1;

  /* Filter rows based on the active card */
  const activeCard = CARD_META[activeKey];
  const filteredRows = useMemo(() => {
    if (!activeCard?.filterBucket || activeKey === "totalOrders") return workStatusData.rows;
    return workStatusData.rows.filter(r => r.bucket === activeCard.filterBucket);
  }, [activeKey, workStatusData.rows, activeCard]);

  return (
    <Card className="rounded-[1.75rem] border-2 border-slate-700/80 shadow-none">
      <CardContent className="space-y-5 p-4 md:p-6">

        {/* ── Filter Cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {workStatusData.cards.map((card) => {
            const m = CARD_META[card.key];
            if (!m) return null;

            const isActive = activeKey === card.key;
            const pct = card.key === "totalOrders"
              ? 100
              : Math.min(100, Math.round((Number(card.value) / totalValue) * 100));

            return (
              <button
                key={card.key}
                onClick={() => setActiveKey(card.key)}
                className={cn(
                  // base
                  "group relative flex flex-col items-start overflow-hidden rounded-2xl border-2 px-4 py-4 text-left",
                  "transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  // shadow glow on hover
                  "shadow-sm hover:shadow-lg",
                  m.glow,
                  // active vs passive state
                  isActive
                    ? [m.activeBg, "ring-2", m.activeRing, "border-transparent", "text-white", "-translate-y-0.5 scale-[1.02]"]
                    : [m.passiveBg, "border-slate-200", "hover:-translate-y-0.5", "hover:border-slate-300"]
                )}
              >
                {/* Top row: icon + value */}
                <div className="flex w-full items-start justify-between gap-1">
                  <span className={cn(
                    "rounded-lg p-1.5",
                    isActive ? "bg-white/20 text-white" : ["bg-white/80", m.accent]
                  )}>
                    {m.icon}
                  </span>
                  <span className={cn(
                    "text-3xl font-extrabold tabular-nums leading-none",
                    isActive ? "text-white" : m.passiveText
                  )}>
                    {card.value}
                  </span>
                </div>

                {/* Label */}
                <p className={cn(
                  "mt-3 text-[0.8rem] font-bold leading-tight",
                  isActive ? "text-white" : m.accent
                )}>
                  {card.label}
                </p>
                <p className={cn(
                  "mt-0.5 text-[0.68rem] leading-tight",
                  isActive ? "text-white/70" : "text-slate-400"
                )}>
                  {m.subtitle}
                </p>

                {/* Mini progress bar */}
                {card.key !== "totalOrders" && (
                  <div className="mt-3 w-full space-y-1">
                    <div className={cn(
                      "h-1 w-full rounded-full",
                      isActive ? "bg-white/25" : "bg-black/10"
                    )}>
                      <div
                        className={cn(
                          "h-1 rounded-full transition-all duration-700",
                          isActive ? "bg-white/80" : m.bar
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className={cn(
                      "text-right text-[0.62rem] tabular-nums font-medium",
                      isActive ? "text-white/60" : "text-slate-400"
                    )}>
                      {pct}% of total
                    </p>
                  </div>
                )}

                {/* Active indicator pill at bottom */}
                {isActive && (
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 h-1 w-8 rounded-full bg-white/40" />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Active filter label ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="font-semibold text-slate-800">
              {workStatusData.cards.find(c => c.key === activeKey)?.label ?? "All"}
            </span>
            <span className="text-slate-400">·</span>
            <span>{filteredRows.length} order{filteredRows.length !== 1 ? "s" : ""}</span>
          </div>
          {activeKey !== "totalOrders" && (
            <button
              onClick={() => setActiveKey("totalOrders")}
              className="text-xs text-slate-400 hover:text-slate-700 underline underline-offset-2 transition-colors"
            >
              Clear filter
            </button>
          )}
        </div>

        {/* ── Orders Table ────────────────────────────────────────────────────── */}
        <div className="min-h-[400px] rounded-[1.5rem] border-2 border-slate-700/80 bg-slate-100/35 p-3 md:p-4">
          {filteredRows.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <svg className="h-10 w-10 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
              <p>No orders in <strong>{workStatusData.cards.find(c => c.key === activeKey)?.label}</strong></p>
              <button
                onClick={() => setActiveKey("totalOrders")}
                className="text-xs text-blue-500 hover:underline"
              >
                Show all orders
              </button>
            </div>
          ) : (
            <div className="h-full overflow-auto rounded-xl border bg-background/80 shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/90 hover:bg-slate-50/90">
                    {["Order", "Customer", "Stage", "Job Statuses", "Progress", "Last Update"].map(h => (
                      <TableHead key={h} className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => {
                    const statusList = Array.from(row.statuses as Set<string>);
                    const total = statusList.length;
                    const doneCount = statusList.filter(s => s === "DONE").length;
                    const inProgressCount = statusList.filter(s => s === "IN_PROGRESS").length;
                    const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
                    const bb = BUCKET_BADGE[row.bucket] ?? { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400", animate: false };

                    return (
                      <TableRow key={row.orderId} className="group hover:bg-slate-50/60 transition-colors">

                        {/* Order */}
                        <TableCell>
                          <span className="font-bold text-sm text-slate-800">{row.orderNo}</span>
                        </TableCell>

                        {/* Customer */}
                        <TableCell>
                          <span className="text-sm text-slate-700">{row.customer}</span>
                        </TableCell>

                        {/* Stage badge */}
                        <TableCell>
                          <span className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap border",
                            bb.bg, bb.text,
                            row.bucket === "Machine Running" ? "border-emerald-200" :
                            row.bucket === "Pending"         ? "border-amber-200" :
                            row.bucket === "Qc Pending"      ? "border-blue-200" :
                            row.bucket === "Completed"       ? "border-green-200" :
                                                               "border-orange-200"
                          )}>
                            <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", bb.dot, bb.animate && "animate-pulse")} />
                            {row.bucket}
                          </span>
                        </TableCell>

                        {/* Status pills */}
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            {statusList.map((status, i) => (
                              <span
                                key={i}
                                title={status.replace(/_/g, " ")}
                                className={cn(
                                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white",
                                  STATUS_COLOR[status] ?? "bg-slate-400"
                                )}
                              >
                                {STATUS_LABEL[status] ?? status.charAt(0)}
                              </span>
                            ))}
                            <span className="ml-1 text-[11px] text-slate-500">
                              {statusList.map(s => s.replace(/_/g, " ")).join(", ")}
                            </span>
                          </div>
                        </TableCell>

                        {/* Progress */}
                        <TableCell className="min-w-[150px]">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-500">{doneCount}/{total} steps</span>
                              <span className={cn(
                                "text-[11px] font-bold tabular-nums",
                                progressPct === 100 ? "text-green-600" : inProgressCount > 0 ? "text-emerald-600" : "text-slate-500"
                              )}>
                                {progressPct}%
                              </span>
                            </div>
                            <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={cn(
                                  "absolute inset-y-0 left-0 rounded-full transition-all duration-700",
                                  progressPct === 100
                                    ? "bg-green-500"
                                    : inProgressCount > 0
                                    ? "bg-gradient-to-r from-emerald-400 to-emerald-600"
                                    : "bg-slate-400"
                                )}
                                style={{ width: `${Math.max(progressPct, progressPct > 0 ? 6 : 0)}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>

                        {/* Last update */}
                        <TableCell>
                          <span className="text-xs tabular-nums text-slate-500">
                            {formatDateTime(row.lastUpdate)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
}
