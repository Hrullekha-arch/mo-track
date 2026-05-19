"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  Clock,
  Loader2,
  Navigation,
  Package,
  RefreshCw,
  ScanLine,
  Truck,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  DocketTrackingResult,
  TrackingEvent,
} from "@/app/api/track-docket/route";

type StatusTier =
  | "delivered"
  | "out_for_delivery"
  | "undelivered"
  | "inscanned"
  | "outscanned"
  | "booked"
  | "inprocess"
  | "unknown";

function classifyStatus(status: string | null): StatusTier {
  if (!status) return "unknown";
  const value = status.toUpperCase();
  if (value.includes("DELIVERED") && !value.includes("UNDELIVER")) return "delivered";
  if (value.includes("UNDELIVER")) return "undelivered";
  if (value.includes("OUT FOR DELIVERY") || value.includes("OUTSCANNED FOR DELIVERY")) {
    return "out_for_delivery";
  }
  if (value.includes("INSCANNED")) return "inscanned";
  if (value.includes("OUTSCANNED")) return "outscanned";
  if (value.includes("BOOKED")) return "booked";
  if (value.includes("INPROCESS")) return "inprocess";
  return "unknown";
}

const STATUS_META: Record<
  StatusTier,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    bg: string;
    border: string;
    iconBg: string;
    dot: string;
    pulse: boolean;
  }
> = {
  delivered: { label: "Delivered", icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", iconBg: "bg-emerald-100", dot: "bg-emerald-500", pulse: false },
  out_for_delivery: { label: "Out for Delivery", icon: Truck, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", iconBg: "bg-blue-100", dot: "bg-blue-500", pulse: true },
  undelivered: { label: "Undelivered", icon: Ban, color: "text-red-700", bg: "bg-red-50", border: "border-red-200", iconBg: "bg-red-100", dot: "bg-red-500", pulse: false },
  inscanned: { label: "Inscanned at Hub", icon: ScanLine, color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200", iconBg: "bg-violet-100", dot: "bg-violet-500", pulse: false },
  outscanned: { label: "Outscanned", icon: Navigation, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", iconBg: "bg-amber-100", dot: "bg-amber-500", pulse: true },
  booked: { label: "Booked", icon: Package, color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200", iconBg: "bg-slate-100", dot: "bg-slate-400", pulse: false },
  inprocess: { label: "In Process", icon: Clock, color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", iconBg: "bg-orange-100", dot: "bg-orange-500", pulse: true },
  unknown: { label: "Unknown", icon: AlertCircle, color: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200", iconBg: "bg-slate-100", dot: "bg-slate-400", pulse: false },
};

function parseMessage(raw: string): { action: string; detail: string } {
  const sanitized = raw.replace(/^AWB\s*:\s*\S+\s*/i, "").trim();
  const splitIndex = sanitized.indexOf(".");
  if (splitIndex === -1) return { action: sanitized, detail: "" };
  return {
    action: sanitized.slice(0, splitIndex).trim(),
    detail: sanitized.slice(splitIndex + 1).trim(),
  };
}

function eventTier(message: string): StatusTier {
  const value = message.toUpperCase();
  if (value.includes("UNDELIVER")) return "undelivered";
  if (value.includes("OUT FOR DELIVERY") || (value.includes("OUTSCANNED") && value.includes("DELIVERY"))) {
    return "out_for_delivery";
  }
  if (value.includes("INSCANNED")) return "inscanned";
  if (value.includes("OUTSCANNED")) return "outscanned";
  if (value.includes("BOOKED")) return "booked";
  if (value.includes("DELIVERED")) return "delivered";
  return "inprocess";
}

function TimelineRow({
  event,
  isFirst,
  isLast,
}: {
  event: TrackingEvent;
  isFirst: boolean;
  isLast: boolean;
}) {
  const meta = STATUS_META[eventTier(event.message)];
  const Icon = meta.icon;
  const { action, detail } = parseMessage(event.message);

  return (
    <div className="flex gap-3">
      <div className="flex w-8 shrink-0 flex-col items-center">
        <div
          className={cn(
            "z-10 flex h-8 w-8 items-center justify-center rounded-full transition-all",
            isFirst ? cn("border-2", meta.border, meta.iconBg, "shadow-sm") : "border border-border bg-muted/30"
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", isFirst ? meta.color : "text-muted-foreground/40")} />
        </div>
        {!isLast ? <div className="my-1 flex-1 w-px bg-gradient-to-b from-border to-border/20" /> : null}
      </div>
      <div className={cn("min-w-0 flex-1 pb-5", isLast && "pb-1")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cn("text-[13px] font-semibold leading-snug", isFirst ? "text-foreground" : "text-muted-foreground/70")}>
                {action}
              </p>
              {isFirst ? (
                <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold", meta.bg, meta.border, meta.color)}>
                  {meta.pulse ? (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", meta.dot)} />
                      <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", meta.dot)} />
                    </span>
                  ) : null}
                  Latest
                </span>
              ) : null}
            </div>
            {detail ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground/60">{detail}</p> : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">{event.time}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground/50">{event.date}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DocketTrackingDialog({
  open,
  onClose,
  docketNo,
}: {
  open: boolean;
  onClose: () => void;
  docketNo: string;
}) {
  const [data, setData] = React.useState<DocketTrackingResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchTracking = React.useCallback(async () => {
    if (!docketNo) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const response = await fetch(`/api/track-docket?docketNo=${encodeURIComponent(docketNo)}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to fetch tracking");
      setData(json);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [docketNo]);

  React.useEffect(() => {
    if (open && docketNo) fetchTracking();
  }, [open, docketNo, fetchTracking]);

  const meta = STATUS_META[classifyStatus(data?.currentStatus ?? null)];
  const StatusIcon = meta.icon;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className="max-h-[88vh] max-w-[480px] overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
        <DialogTitle className="sr-only">Shipment Tracking for {docketNo || "selected docket"}</DialogTitle>
        <div className="relative shrink-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 50%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 80% 20%, #8b5cf6 0%, transparent 40%)",
            }}
          />
          <div className="relative px-5 pb-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10">
                  <Truck className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-tight text-white">Shipment Tracking</h2>
                  <p className="mt-0.5 font-mono text-xs tracking-wider text-white/50">
                    {docketNo || "-"}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0 text-white/60 hover:bg-white/10 hover:text-white"
                onClick={fetchTracking}
                disabled={loading}
                title="Refresh"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </Button>
            </div>
            {data?.currentStatus ? (
              <div className={cn("mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold", meta.bg, meta.border, meta.color)}>
                <StatusIcon className="h-3.5 w-3.5" />
                {data.currentStatus}
                {meta.pulse ? (
                  <span className="relative ml-0.5 flex h-1.5 w-1.5">
                    <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-70", meta.dot)} />
                    <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", meta.dot)} />
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-background">
          {loading ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="relative">
                <div className="h-10 w-10 animate-pulse rounded-full border-2 border-muted" />
                <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin text-primary" />
              </div>
              <p className="text-sm">Fetching tracking info...</p>
            </div>
          ) : null}

          {!loading && error ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-red-200 bg-red-50">
                <AlertCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Tracking unavailable</p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchTracking}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Try again
              </Button>
            </div>
          ) : null}

          {!loading && !error && data ? (
            <div className="space-y-4 px-5 py-4">
              {data.receivedBy || data.receivedOn ? (
                <div className="grid grid-cols-2 gap-2">
                  {data.receivedBy ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Received By</p>
                      <p className="mt-0.5 text-sm font-semibold text-emerald-800">{data.receivedBy}</p>
                    </div>
                  ) : null}
                  {data.receivedOn ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Received On</p>
                      <p className="mt-0.5 text-sm font-semibold text-emerald-800">{data.receivedOn}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {data.events.length > 0 ? (
                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Tracking History</p>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {data.events.length}
                    </span>
                  </div>
                  <div>
                    {[...data.events]
                      .sort((a, b) => a.index - b.index)
                      .map((event, index, items) => (
                        <TimelineRow
                          key={event.index}
                          event={event}
                          isFirst={index === 0}
                          isLast={index === items.length - 1}
                        />
                      ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <ArrowDownToLine className="h-6 w-6 opacity-25" />
                  <p className="text-sm">No scan events yet</p>
                </div>
              )}
            </div>
          ) : null}

          {!loading && !error && !data ? (
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Package className="h-7 w-7 opacity-25" />
              <p className="text-sm">No tracking data available</p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t bg-muted/10 px-5 py-3">
          <p className="text-[11px] font-medium text-muted-foreground/60">SM Express Logistics</p>
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
