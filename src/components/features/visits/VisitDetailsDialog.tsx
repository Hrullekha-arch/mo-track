"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { EnrichedDealVisit } from "@/types/visits";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  completed: {
    label: "Completed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 border",
  },
  Working: {
    label: "Working",
    className: "bg-blue-50 text-blue-700 border-blue-200 border animate-pulse",
  },
  approved: {
    label: "Approved",
    className: "bg-violet-50 text-violet-700 border-violet-200 border",
  },
  CWC: {
    label: "Will Call",
    className: "bg-amber-50 text-amber-700 border-amber-200 border",
  },
} as const;

const renderVisitStatus = (visit: EnrichedDealVisit) => {
  if (visit.status === "completed")
    return <StatusPill config={STATUS_CONFIG.completed} />;
  if (visit.visitStatus === "Working")
    return <StatusPill config={STATUS_CONFIG.Working} />;
  if (visit.status === "approved")
    return <StatusPill config={STATUS_CONFIG.approved} />;
  if (visit.status === "CWC") return <StatusPill config={STATUS_CONFIG.CWC} />;
  return (
    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-slate-50 text-slate-600 border-slate-200">
      {visit.status || "Pending"}
    </span>
  );
};

const StatusPill = ({
  config,
}: {
  config: { label: string; className: string };
}) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
      config.className
    )}
  >
    {config.label}
  </span>
);

interface VisitDetailsDialogProps {
  visit: EnrichedDealVisit | null;
  assigneeNameById: Record<string, string>;
  onClose: () => void;
}

export default function VisitDetailsDialog({
  visit,
  assigneeNameById,
  onClose,
}: VisitDetailsDialogProps) {
  return (
    <Dialog open={!!visit} onOpenChange={onClose}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>Visit Details</DialogTitle>
        </DialogHeader>
        {visit && (
          <div className="space-y-4">
            {/* Status row */}
            <div className="flex items-center justify-between">
              <span className="inline-flex rounded-lg bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 capitalize">
                {visit.typeOfVisit}
              </span>
              {renderVisitStatus(visit)}
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Customer", value: visit.customer?.name },
                {
                  label: "Assigned To",
                  value: visit.assignedTo
                    ? assigneeNameById[visit.assignedTo] || "Unknown"
                    : "Unassigned",
                },
                { label: "Phone", value: visit.customer?.phone },
                { label: "Created By", value: visit.createdBy },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5"
                >
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">
                    {label}
                  </p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">
                    {value || "—"}
                  </p>
                </div>
              ))}
            </div>

            {/* Address */}
            {visit.location?.address && (
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">
                  Address
                </p>
                <p className="text-sm text-slate-700 mt-0.5">
                  {visit.location.address}
                </p>
              </div>
            )}

            <Separator className="bg-slate-100" />

            {/* Visit-type-specific details */}
            {visit.typeOfVisit === "measurement" ? (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Measurement Details
                </p>
                <p className="text-sm text-slate-700">
                  {visit.measurements
                    ?.map((m: any) => `‣ ${m?.name || m}`)
                    .join(", ") || "N/A"}
                </p>
                {visit.blinds && visit.blinds.length > 0 && (
                  <p className="text-sm text-slate-700 mt-1">
                    Blinds: {visit.blinds.join(", ")}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Items
                </p>
                <p className="text-sm text-slate-700">
                  {visit.deliveryInstallations
                    ?.map((d: any) => `${d?.id} (×${d?.noOfPcs || 1})`)
                    .join(", ") || "N/A"}
                </p>
              </div>
            )}

            {visit.remark && (
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
                <p className="text-[11px] text-amber-600 font-medium uppercase tracking-wide">
                  Remark
                </p>
                <p className="text-sm text-slate-700 mt-0.5">{visit.remark}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}