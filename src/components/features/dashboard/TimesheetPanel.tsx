"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { format } from "date-fns";
import { CheckCircle2, Clock3, Loader2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type Entry = {
  slotStart: string;
  slotEnd: string;
  slotLabel: string;
  endMinutes: number;
  workDetail: string;
  updatedAt?: string;
  updatedBy?: {
    id: string;
    name: string;
  };
  lockedAt?: string;
  autoSubmittedAt?: string;
  submittedBy?: {
    id: string;
    name: string;
    mode: string;
  };
};

const toMinutes = (value?: string) => {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
};

const timeLabel = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const buildSlots = (start?: string, end?: string): Entry[] => {
  const first = toMinutes(start);
  const last = toMinutes(end);
  if (first === null || last === null || last <= first) return [];

  const slots: Entry[] = [];
  for (let cursor = first; cursor < last; cursor += 60) {
    const slotEnd = Math.min(cursor + 60, last);
    slots.push({
      slotStart: timeLabel(cursor),
      slotEnd: timeLabel(slotEnd),
      slotLabel: `${timeLabel(cursor)} - ${timeLabel(slotEnd)}`,
      endMinutes: slotEnd,
      workDetail: "",
    });
  }
  return slots;
};

export function TimesheetPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [savedEntries, setSavedEntries] = useState<Entry[]>([]);
  const [remark, setRemark] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const dutyStart = user?.timesheetDutyStart || "";
  const dutyEnd = user?.timesheetDutyEnd || "";
  const enabled = Boolean(user?.timesheetEnabled);
  const slots = useMemo(() => buildSlots(dutyStart, dutyEnd), [dutyStart, dutyEnd]);
  const dateId = format(currentTime, "yyyy-MM-dd");

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user || !enabled || !slots.length) {
      setEntries([]);
      setSavedEntries([]);
      setRemark("");
      setLoading(false);
      return;
    }

    setLoading(true);
    return onSnapshot(
      doc(db, "users", user.id, "Timesheet", dateId),
      (snapshot) => {
        const data = snapshot.data();
        const savedRows = new Map(
          (Array.isArray(data?.perHour) ? data.perHour : []).map((row: any) => [
            `${row.slotStart}-${row.slotEnd}`,
            row,
          ])
        );
        const hydratedEntries = slots.map((slot) => {
            const saved = savedRows.get(`${slot.slotStart}-${slot.slotEnd}`) as any;
            return {
              ...slot,
              workDetail: String(saved?.workDetail || ""),
              updatedAt: saved?.updatedAt ? String(saved.updatedAt) : undefined,
              updatedBy:
                saved?.updatedBy && typeof saved.updatedBy === "object"
                  ? {
                      id: String(saved.updatedBy.id || ""),
                      name: String(saved.updatedBy.name || ""),
                    }
                  : undefined,
              lockedAt: saved?.lockedAt ? String(saved.lockedAt) : undefined,
              autoSubmittedAt: saved?.autoSubmittedAt ? String(saved.autoSubmittedAt) : undefined,
              submittedBy:
                saved?.submittedBy && typeof saved.submittedBy === "object"
                  ? {
                      id: String(saved.submittedBy.id || ""),
                      name: String(saved.submittedBy.name || ""),
                      mode: String(saved.submittedBy.mode || ""),
                    }
                  : undefined,
            };
          });
        setEntries(hydratedEntries);
        setSavedEntries(hydratedEntries);
        setRemark(String(data?.remark || ""));
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [dateId, enabled, slots, user]);

  const persistTimesheet = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!user || !slots.length) return;
    if (!silent) setSaving(true);
    try {
      const savedAt = new Date();
      const savedAtIso = savedAt.toISOString();
      const savedAtMinutes = savedAt.getHours() * 60 + savedAt.getMinutes();
      const previousMap = new Map(
        savedEntries.map((entry) => [`${entry.slotStart}-${entry.slotEnd}`, entry])
      );
      const perHour = entries.map((entry) => {
        const previous = previousMap.get(`${entry.slotStart}-${entry.slotEnd}`);
        const locked = entry.endMinutes <= savedAtMinutes;
        const wasSubmitted = Boolean(previous?.lockedAt || previous?.autoSubmittedAt);
        const workDetail = locked && wasSubmitted
          ? String(previous?.workDetail || "").trim()
          : entry.workDetail.trim();
        const changed = workDetail !== String(previous?.workDetail || "").trim();

        return {
          slotStart: entry.slotStart,
          slotEnd: entry.slotEnd,
          slotLabel: entry.slotLabel,
          workDetail,
          ...((changed || previous?.updatedAt) && workDetail
            ? {
                updatedAt: changed ? savedAtIso : previous?.updatedAt,
                ...(changed
                  ? { updatedBy: { id: user.id, name: user.name } }
                  : previous?.updatedBy
                    ? { updatedBy: previous.updatedBy }
                    : {}),
              }
            : {}),
          ...(locked
            ? {
                lockedAt: previous?.lockedAt || savedAtIso,
                autoSubmittedAt: previous?.autoSubmittedAt || savedAtIso,
                submittedBy:
                  previous?.submittedBy || {
                    id: user.id,
                    name: user.name,
                    mode: silent ? "auto" : "manual",
                  },
              }
            : {}),
        };
      });
      const lockedSlots = perHour.filter((entry) => entry.lockedAt).length;
      const saveDateId = format(savedAt, "yyyy-MM-dd");

      await setDoc(
        doc(db, "users", user.id, "Timesheet", saveDateId),
        {
          date: saveDateId,
          dutyStart,
          dutyEnd,
          perHour,
          remark: remark.trim(),
          filledSlots: perHour.filter((entry) => entry.workDetail).length,
          totalSlots: perHour.length,
          lockedSlots,
          status: lockedSlots >= perHour.length ? "submitted" : "in_progress",
          submissionMode: silent ? "auto" : "manual",
          ...(silent ? { autoSubmittedAt: savedAtIso } : {}),
          updatedAt: savedAtIso,
          updatedBy: { id: user.id, name: user.name },
        },
        { merge: true }
      );
      const nextEntries = entries.map((entry, index) => ({
        ...entry,
        ...perHour[index],
        endMinutes: entry.endMinutes,
      }));
      setEntries(nextEntries);
      setSavedEntries(nextEntries);
      if (!silent) {
        toast({ title: "Timesheet saved", description: "Hourly work updates were sent to HR." });
      }
    } catch (error: any) {
      if (!silent) {
        toast({
          variant: "destructive",
          title: "Timesheet save failed",
          description: error?.message || "Unable to save hourly updates.",
        });
      }
    } finally {
      if (!silent) setSaving(false);
    }
  }, [dutyEnd, dutyStart, entries, savedEntries, slots.length, toast, user]);

  useEffect(() => {
    if (!user || !enabled || !slots.length || !entries.length || loading) return;

    const autoSubmitDueSlots = () => {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const savedMap = new Map(
        savedEntries.map((entry) => [`${entry.slotStart}-${entry.slotEnd}`, entry])
      );
      const hasUnsubmittedDueSlot = entries.some((entry) => {
        const previous = savedMap.get(`${entry.slotStart}-${entry.slotEnd}`);
        return entry.endMinutes <= currentMinutes && !previous?.autoSubmittedAt;
      });

      if (hasUnsubmittedDueSlot) void persistTimesheet({ silent: true });
    };

    autoSubmitDueSlots();
    const timer = window.setInterval(autoSubmitDueSlots, 60_000);
    return () => window.clearInterval(timer);
  }, [enabled, entries, loading, persistTimesheet, savedEntries, slots.length, user]);

  if (!enabled) return null;

  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const filledCount = entries.filter((entry) => entry.workDetail.trim()).length;
  const submittedCount = savedEntries.filter(
    (entry) => entry.lockedAt || entry.autoSubmittedAt
  ).length;

  return (
    <Card className="border-emerald-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-emerald-600" />
            Timesheet Work Queue
          </CardTitle>
          <CardDescription>
            {format(new Date(), "EEEE, dd MMM yyyy")} | Duty {dutyStart || "--:--"} - {dutyEnd || "--:--"}
          </CardDescription>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-700">{filledCount}/{entries.length} updated</p>
          <p className="mt-1 flex items-center justify-end gap-1 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {submittedCount}/{entries.length} sent to HR
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {!slots.length ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Set valid duty start and end times to create the hourly queue.
          </div>
        ) : loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28" />)}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {entries.map((entry) => {
                const locked = entry.endMinutes <= currentMinutes;
                return (
                  <div key={entry.slotStart} className="rounded-md border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold">{entry.slotLabel}</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                        {locked ? "Locked" : entry.workDetail.trim() ? "Done" : "Pending"}
                      </span>
                    </div>
                    <Textarea
                      value={entry.workDetail}
                      onChange={(event) =>
                        setEntries((current) =>
                          current.map((row) =>
                            row.slotStart === entry.slotStart && row.endMinutes > currentMinutes
                              ? { ...row, workDetail: event.target.value }
                              : row
                          )
                        )
                      }
                      disabled={locked}
                      placeholder={locked ? "This hour is fixed." : "Work completed during this hour..."}
                      className="min-h-20 resize-none text-sm"
                    />
                  </div>
                );
              })}
            </div>
            <Textarea
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              placeholder="Remark or blocker for today..."
              className="min-h-20 resize-none"
            />
            <Button onClick={() => void persistTimesheet()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Timesheet
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
