"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, onSnapshot, query, where } from "firebase/firestore";
import { format } from "date-fns";
import { CalendarDays, ChevronDown, ChevronUp, Loader2, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";

const LEAVE_MONTHLY_ACCRUAL = 2.5;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LEAVE_TYPE_LABELS: Record<string, string> = {
  casual: "Casual Leave",
  sick: "Sick Leave",
  earned: "Earned Leave",
  unpaid: "Unpaid Leave",
};

type LeaveReq = {
  id: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: string;
  appliedAt: string;
  handoverId?: string;
  handoverName?: string;
  handoverStatus?: string;
};

type LeaveFormState = {
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason: string;
};

type LeaveWidgetProps = {
  compact?: boolean;
};

const calcDays = (from: string, to: string) => {
  const a = new Date(from);
  const b = new Date(to);
  if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
};

export function LeaveWidget({ compact = false }: LeaveWidgetProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [requests, setRequests] = useState<LeaveReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<LeaveFormState>({
    leaveType: "casual",
    fromDate: format(new Date(), "yyyy-MM-dd"),
    toDate: format(new Date(), "yyyy-MM-dd"),
    reason: "",
  });

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, "hrLeaveRequests"), where("employeeId", "==", user.id)),
      (snap) => {
        setRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LeaveReq, "id">) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user?.id]);

  if (!user) return null;

  const now = new Date();
  const year = now.getFullYear();
  const monthIdx = now.getMonth();
  const monthsAccrued = monthIdx + 1;
  const accrued = parseFloat((monthsAccrued * LEAVE_MONTHLY_ACCRUAL).toFixed(1));
  const used = requests
    .filter((r) => r.status === "approved" && r.leaveType !== "unpaid" && r.fromDate?.startsWith(String(year)))
    .reduce((s, r) => s + (r.days || 0), 0);
  const balance = parseFloat(Math.max(accrued - used, 0).toFixed(1));
  const pending = requests.filter((r) => r.status === "pending" || r.status === "handover_pending");
  const accrualLabel = `Jan - ${MONTH_NAMES[monthIdx]}`;
  const usedPct = accrued > 0 ? Math.min((used / accrued) * 100, 100) : 0;
  const days = calcDays(form.fromDate, form.toDate);

  const submit = async () => {
    if (!days || !form.reason.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "hrLeaveRequests"), {
        employeeId: user.id,
        employeeName: user.name,
        leaveType: form.leaveType,
        fromDate: form.fromDate,
        toDate: form.toDate,
        days,
        reason: form.reason.trim(),
        status: "pending",
        appliedAt: new Date().toISOString(),
        handoverId: null,
        handoverName: null,
        handoverStatus: null,
      });
      toast({ title: "Leave request submitted", description: `${days} day(s) submitted for approval.` });
      setOpen(true);
      setShowApplyForm(false);
      setForm({
        leaveType: "casual",
        fromDate: format(now, "yyyy-MM-dd"),
        toDate: format(now, "yyyy-MM-dd"),
        reason: "",
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-lg border border-amber-200 bg-amber-50/80 shadow-sm ${compact ? "h-full w-full" : ""}`}>
      <div className={compact ? "px-3" : "px-4"}>
        <div className={`flex flex-wrap items-center justify-between py-3 ${compact ? "gap-2" : "gap-3"}`}>
          <button
            type="button"
            className={`flex items-center text-sm font-medium text-amber-800 hover:text-amber-900 ${compact ? "w-full gap-1.5" : "gap-2"}`}
            onClick={() => setOpen((prev) => !prev)}
          >
            <CalendarDays className="h-4 w-4 text-amber-600" />
            <span>Leave Balance</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
              {balance} / {accrued} left
            </span>
            {pending.length > 0 && (
              <Badge variant="outline" className="border-amber-300 bg-white text-amber-700 text-xs">
                {pending.length} pending
              </Badge>
            )}
            {open ? <ChevronUp className="h-3.5 w-3.5 text-amber-500" /> : <ChevronDown className="h-3.5 w-3.5 text-amber-500" />}
          </button>

          <div className={`flex items-center ${compact ? "w-full justify-between gap-2" : "gap-3"}`}>
            <div className="flex min-w-0 items-center gap-2 text-xs text-amber-700">
              <div className={`h-1.5 overflow-hidden rounded-full bg-amber-200 ${compact ? "w-14" : "w-24"}`}>
                <div
                  className={`h-full rounded-full ${usedPct > 80 ? "bg-red-400" : usedPct > 60 ? "bg-amber-400" : "bg-emerald-400"}`}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
              <span className={compact ? "truncate" : ""}>{Math.round(usedPct)}% used - {accrualLabel} {year}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 border-amber-300 bg-white text-amber-800 hover:bg-amber-50 text-xs"
              onClick={() => {
                setOpen(true);
                setShowApplyForm((prev) => !prev);
              }}
            >
              <UserCheck className="h-3.5 w-3.5" />
              {compact ? "Apply" : "Apply Leave"}
            </Button>
          </div>
        </div>

        {open && (
          <div className="border-t border-amber-100 py-3">
            {loading ? (
              <p className="py-1 text-xs text-amber-600">Loading...</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
                  {[
                    { label: "Accrued", value: accrued, sub: accrualLabel },
                    { label: "Used", value: used, sub: "approved" },
                    { label: "Balance", value: balance, sub: "remaining", highlight: true },
                    { label: "Pending", value: pending.length, sub: "awaiting HR" },
                    { label: "Month Rate", value: `+${LEAVE_MONTHLY_ACCRUAL}`, sub: "per month" },
                    { label: "Year Total", value: 30, sub: "at Dec 31" },
                  ].map((item) => (
                    <div key={item.label} className={`rounded-xl border p-2 ${item.highlight ? "border-emerald-200 bg-emerald-50" : "border-amber-100 bg-white"}`}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{item.label}</p>
                      <p className={`mt-0.5 text-xl font-bold ${item.highlight ? "text-emerald-700" : "text-slate-800"}`}>{item.value}</p>
                      <p className="text-[10px] text-slate-400">{item.sub}</p>
                    </div>
                  ))}
                </div>

                {(showApplyForm || requests.length > 0) && (
                  <div className="mt-2 grid gap-3">
                    {showApplyForm ? (
                      <Card className="border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fff8ed_100%)] shadow-sm">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-base text-slate-900">Apply Leave</CardTitle>
                              <CardDescription className="mt-1 text-xs">
                                Request leave across all dashboard pages as <strong>{user.name}</strong>. Balance: <strong>{balance}</strong> day(s) remaining.
                              </CardDescription>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900"
                              onClick={() => setShowApplyForm(false)}
                            >
                              Close
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid gap-4">
                            <div className="space-y-1.5">
                              <Label>Leave Type</Label>
                              <Select value={form.leaveType} onValueChange={(value) => setForm((prev) => ({ ...prev, leaveType: value }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {Object.entries(LEAVE_TYPE_LABELS).map(([key, value]) => (
                                    <SelectItem key={key} value={key}>{value}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label>From Date</Label>
                                <Input type="date" value={form.fromDate} onChange={(e) => setForm((prev) => ({ ...prev, fromDate: e.target.value }))} />
                              </div>
                              <div className="space-y-1.5">
                                <Label>To Date</Label>
                                <Input type="date" value={form.toDate} onChange={(e) => setForm((prev) => ({ ...prev, toDate: e.target.value }))} />
                              </div>
                            </div>
                          </div>

                          {days > 0 && (
                            <div className={`rounded-lg border px-3 py-2 text-sm ${days > balance ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                              <span className="font-semibold">{days} day{days !== 1 ? "s" : ""}</span> requested.
                              {days > balance && form.leaveType !== "unpaid" && (
                                <span className="ml-1">Exceeds available balance and may be adjusted by HR.</span>
                              )}
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <Label>Reason</Label>
                            <Textarea
                              value={form.reason}
                              onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
                              placeholder="Briefly describe the reason for leave..."
                              rows={4}
                            />
                          </div>
                        </CardContent>
                        <CardFooter className="justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setShowApplyForm(false)}>
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={saving || days === 0 || !form.reason.trim()}
                            onClick={() => void submit()}
                          >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Submit Request
                          </Button>
                        </CardFooter>
                      </Card>
                    ) : null}

                    {requests.length > 0 ? (
                      <Card className="border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f9fbff_100%)] shadow-sm">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base text-slate-900">My Recent Requests</CardTitle>
                          <CardDescription className="text-xs">Latest leave activity from the shared dashboard bar.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {[...requests]
                            .sort((a, b) => b.appliedAt?.localeCompare(a.appliedAt ?? "") ?? 0)
                            .slice(0, 6)
                            .map((request) => (
                              <div key={request.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-medium text-slate-800">
                                    {LEAVE_TYPE_LABELS[request.leaveType] ?? request.leaveType} - {request.days}d
                                  </p>
                                  <p className="text-[10px] text-slate-400">{request.fromDate} {"->"} {request.toDate}</p>
                                  {request.handoverName && request.handoverStatus === "pending" && (
                                    <p className="text-[10px] text-amber-600">Awaiting handover: {request.handoverName}</p>
                                  )}
                                </div>
                                <Badge
                                  variant="outline"
                                  className={
                                    request.status === "approved"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px]"
                                      : request.status === "rejected"
                                        ? "border-red-200 bg-red-50 text-red-700 text-[10px]"
                                        : "border-amber-200 bg-amber-50 text-amber-700 text-[10px]"
                                  }
                                >
                                  {request.status === "handover_pending" ? "handover" : request.status}
                                </Badge>
                              </div>
                            ))}
                        </CardContent>
                      </Card>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
