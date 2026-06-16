"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileSignature, FileText, Loader2, Save, Search, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  AttendanceRecord,
  HrEmployee,
  HrExitFormState,
  HrHoliday,
  HrLeaveFormState,
  HrLeaveRequest,
} from "../types";
import {
  buildPayrollRecord,
  calcAttendanceSummary,
  createAttendancePayrollFormState,
  calcLeaveDays,
  EXIT_TYPE_LABELS,
  formatCurrency,
  getMonthKeyFromDate,
  LEAVE_TYPE_LABELS,
} from "../utils";
import {
  openExitExperienceLetterPrintWindow,
  openExitRelievingLetterPrintWindow,
} from "../print";

// ─── Leave Request Dialog ────────────────────────────────────────────────────

type LeaveRequestDialogProps = {
  open?: boolean;
  employee: HrEmployee | null;
  employees: HrEmployee[];
  form: HrLeaveFormState;
  setForm: (v: HrLeaveFormState) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export function LeaveRequestDialog({ open = true, employee, employees, form, setForm, saving, onClose, onSave }: LeaveRequestDialogProps) {
  const router = useRouter();
  const [handoverQuery, setHandoverQuery] = useState("");
  const [handoverFocused, setHandoverFocused] = useState(false);
  const handoverRef = useRef<HTMLDivElement>(null);

  const days = calcLeaveDays(form.fromDate, form.toDate);
  const set = <K extends keyof HrLeaveFormState>(key: K, val: HrLeaveFormState[K]) =>
    setForm({ ...form, [key]: val });

  const selectedEmployee = employees.find((e) => e.id === form.employeeId) ?? employee;
  const handoverEmployee = employees.find((e) => e.id === form.handoverId);
  const eligibleHandoverEmployees = employees.filter((e) => {
    if (e.id === form.employeeId) return false;
    if (!selectedEmployee?.department) return true;
    return e.department === selectedEmployee.department;
  });

  const filteredHandover = handoverQuery.trim()
    ? eligibleHandoverEmployees.filter((e) =>
        `${e.name} ${e.department ?? ""}`.toLowerCase().includes(handoverQuery.toLowerCase())
      )
    : eligibleHandoverEmployees;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="border-slate-200 bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply Leave</DialogTitle>
          <DialogDescription>
            {selectedEmployee ? `Submitting leave request for ${selectedEmployee.name}.` : "Select an employee and fill in the leave details."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <Select
              value={form.employeeId}
              onValueChange={(v) => set("employeeId", v)}
              disabled={!!employee}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select employee…" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}{e.department ? ` — ${e.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Leave Type</Label>
            <Select value={form.leaveType} onValueChange={(v) => set("leaveType", v as HrLeaveFormState["leaveType"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(LEAVE_TYPE_LABELS) as [HrLeaveFormState["leaveType"], string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>From Date</Label>
              <Input type="date" value={form.fromDate} onChange={(e) => set("fromDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>To Date</Label>
              <Input type="date" value={form.toDate} onChange={(e) => set("toDate", e.target.value)} />
            </div>
          </div>

          {days > 0 && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-semibold">{days} day{days !== 1 ? "s" : ""}</span> of leave requested.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              placeholder="Briefly describe the reason for leave..."
              rows={3}
            />
          </div>

          {/* Handover Section */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-900">Work Handover (Optional)</p>
            </div>
            <p className="text-xs text-amber-700">
              Assign someone to handle responsibilities during this leave. They must accept before the request goes to HR.
            </p>
            <div className="relative space-y-1.5" ref={handoverRef}>
              <Label className="text-xs text-slate-600">Handover To</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  className="flex h-9 w-full rounded-md border border-input bg-white pl-8 pr-8 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Search name or department…"
                  value={handoverFocused ? handoverQuery : (handoverEmployee ? `${handoverEmployee.name}${handoverEmployee.department ? ` — ${handoverEmployee.department}` : ""}` : "")}
                  onChange={(e) => setHandoverQuery(e.target.value)}
                  onFocus={() => {
                    setHandoverFocused(true);
                    setHandoverQuery("");
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      setHandoverFocused(false);
                      setHandoverQuery("");
                    }, 150);
                  }}
                />
                {form.handoverId && !handoverFocused && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => { set("handoverId", ""); setHandoverQuery(""); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {handoverFocused && (
                <div className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                  {filteredHandover.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-slate-400">No employee found.</p>
                  ) : (
                    filteredHandover.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-amber-50",
                          form.handoverId === e.id && "bg-amber-50"
                        )}
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          set("handoverId", e.id);
                          setHandoverFocused(false);
                          setHandoverQuery("");
                        }}
                      >
                        <Check className={cn("h-3.5 w-3.5 shrink-0 text-amber-600", form.handoverId === e.id ? "opacity-100" : "opacity-0")} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">{e.name}</p>
                          {e.department && <p className="truncate text-xs text-slate-400">{e.department}</p>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {handoverEmployee && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full border-amber-300 bg-white text-amber-800 hover:bg-amber-50"
                onClick={() => {
                  onClose();
                  router.push("/dashboard");
                }}
              >
                <UserCheck className="h-4 w-4" />
                Go to {handoverEmployee.name}&apos;s Dashboard
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || days === 0 || !form.reason.trim() || !form.employeeId} onClick={() => void onSave()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {form.handoverId ? "Submit & Notify Handover" : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Exit Record Dialog ──────────────────────────────────────────────────────

type ExitRecordDialogProps = {
  employee: HrEmployee;
  form: HrExitFormState;
  setForm: (v: HrExitFormState) => void;
  attendanceRecords: AttendanceRecord[];
  holidays: HrHoliday[];
  leaveRequests: HrLeaveRequest[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export function ExitRecordDialog({
  employee,
  form,
  setForm,
  attendanceRecords,
  holidays,
  leaveRequests,
  saving,
  onClose,
  onSave,
}: ExitRecordDialogProps) {
const set = <K extends keyof HrExitFormState>(key: K, val: HrExitFormState[K]) =>
  setForm({ ...form, [key]: val });

  const letterEffectiveDate = form.lastWorkingDay || form.exitDate;
  const canGenerateExitLetters = Boolean(letterEffectiveDate);

  const assetItems = useMemo(
    () =>
      String(employee.issuedAssets || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [employee.issuedAssets]
  );

  const fnfMonth = getMonthKeyFromDate(form.exitDate || form.lastWorkingDay) || "";
  const fnfMonthRecords = useMemo(
    () => attendanceRecords.filter((record) => record.employeeId === employee.id && record.date.startsWith(fnfMonth)),
    [attendanceRecords, employee.id, fnfMonth]
  );
  const attendanceSummary = useMemo(
    () => (fnfMonth && fnfMonthRecords.length ? calcAttendanceSummary(attendanceRecords, employee.id, fnfMonth, holidays, employee) : null),
    [attendanceRecords, employee, fnfMonth, fnfMonthRecords.length, holidays]
  );
  const approvedPaidLeaveDays = useMemo(() => {
    if (!fnfMonth) return 0;
    const monthStart = new Date(`${fnfMonth}-01T00:00:00`);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    let total = 0;
    leaveRequests
      .filter(
        (request) =>
          request.employeeId === employee.id &&
          request.status === "approved" &&
          request.leaveType !== "unpaid"
      )
      .forEach((request) => {
        const rangeStart = new Date(`${request.fromDate}T00:00:00`);
        const rangeEnd = new Date(`${request.toDate}T00:00:00`);
        if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) return;
        const overlapStart = rangeStart > monthStart ? rangeStart : monthStart;
        const overlapEnd = rangeEnd < monthEnd ? rangeEnd : monthEnd;
        if (overlapEnd < overlapStart) return;
        total += Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1;
      });
    return total;
  }, [employee.id, fnfMonth, leaveRequests]);
  const paidLeaveDays = Math.max(attendanceSummary?.onLeave || 0, approvedPaidLeaveDays);
  const fnfPayrollPreview = useMemo(() => {
    if (!fnfMonth || !attendanceSummary) return null;
    return buildPayrollRecord(
      employee,
      fnfMonth,
      {
        ...createAttendancePayrollFormState(fnfMonth, attendanceSummary),
        notes: "FnF preview from attendance and paid leave",
      }
    );
  }, [attendanceSummary, employee, fnfMonth]);

  const handlePrintExperienceLetter = () => {
    openExitExperienceLetterPrintWindow(employee, {
      issueDate: form.exitDate || new Date().toISOString().slice(0, 10),
      lastWorkingDay: letterEffectiveDate,
      exitType: form.exitType,
      fnfStatus: form.fnfStatus,
    });
  };

  const handlePrintRelievingLetter = () => {
    openExitRelievingLetterPrintWindow(employee, {
      issueDate: form.exitDate || new Date().toISOString().slice(0, 10),
      lastWorkingDay: letterEffectiveDate,
      exitType: form.exitType,
      fnfStatus: form.fnfStatus,
    });
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-200 bg-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exit & Full-and-Final</DialogTitle>
          <DialogDescription>Manage exit process and FnF settlement for {employee.name}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {fnfPayrollPreview && attendanceSummary ? (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">FnF Salary Preview</p>
                <p className="text-xs text-slate-500">
                  Exit month: {fnfMonth} - payable salary uses present days, paid leave, holidays, and week off.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Present Days</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{attendanceSummary.present}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Paid Leave</p>
                  <p className="mt-1 text-xl font-bold text-cyan-700">{paidLeaveDays}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Paid Days</p>
                  <p className="mt-1 text-xl font-bold text-emerald-700">{fnfPayrollPreview.paidDays}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">LOP Days</p>
                  <p className="mt-1 text-xl font-bold text-red-600">{fnfPayrollPreview.lopDays}</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-white/70 bg-white/70 p-3">
                  <p className="text-xs text-slate-500">Gross Earnings</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(fnfPayrollPreview.grossEarnings)}</p>
                </div>
                <div className="rounded-lg border border-white/70 bg-white/70 p-3">
                  <p className="text-xs text-slate-500">Total Deductions</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(fnfPayrollPreview.totalDeductions)}</p>
                </div>
                <div className="rounded-lg border border-white/70 bg-white/70 p-3">
                  <p className="text-xs text-slate-500">Net FnF Salary</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-700">{formatCurrency(fnfPayrollPreview.netPay)}</p>
                </div>
              </div>
            </div>
          ) : fnfMonth ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-sm text-amber-800">
              FnF salary preview will appear after attendance is available for {fnfMonth}.
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">Assets to Collect</p>
              <span className={`text-xs font-medium ${employee.issuedAssets?.trim() ? "text-emerald-600" : "text-slate-400"}`}>
                {employee.issuedAssets?.trim() ? "Already defined in employee profile" : "No issue record yet"}
              </span>
            </div>
            {assetItems.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {assetItems.map((item) => (
                  <span key={item} className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-medium text-cyan-700">
                    {item}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-slate-600">No assets defined yet in employee profile.</p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Add every company item here at joining time, for example: laptop, mobile, charger, motorcycle, tool bag, office email, access card.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-700">
            Final settlement can be marked complete only after all company assets are returned, backup email handover is completed, and clearance is marked complete.
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Exit Letters</p>
                <p className="text-xs text-slate-500">
                  Generate professional MNC-style Experience and Relieving letters for this employee.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-slate-300 bg-white"
                  disabled={!canGenerateExitLetters}
                  onClick={handlePrintExperienceLetter}
                >
                  <FileSignature className="mr-2 h-4 w-4" />
                  Experience Letter
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-slate-300 bg-white"
                  disabled={!canGenerateExitLetters}
                  onClick={handlePrintRelievingLetter}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Relieving Letter
                </Button>
              </div>
            </div>
            {!canGenerateExitLetters ? (
              <p className="mt-2 text-xs text-amber-700">
                Set Exit Date or Last Working Day to enable letter generation.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Exit Type</Label>
              <Select value={form.exitType} onValueChange={(v) => set("exitType", v as HrExitFormState["exitType"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(EXIT_TYPE_LABELS) as [HrExitFormState["exitType"], string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notice Period (days)</Label>
              <Input type="number" min={0} value={form.noticePeriodDays} onChange={(e) => set("noticePeriodDays", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Exit Date</Label>
              <Input type="date" value={form.exitDate} onChange={(e) => set("exitDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Last Working Day</Label>
              <Input type="date" value={form.lastWorkingDay} onChange={(e) => set("lastWorkingDay", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Clearance Status</Label>
              <Select value={form.clearanceStatus} onValueChange={(v) => set("clearanceStatus", v as HrExitFormState["clearanceStatus"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Asset Handover</Label>
              <Select value={form.assetHandoverStatus} onValueChange={(v) => set("assetHandoverStatus", v as HrExitFormState["assetHandoverStatus"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Backup Email Handover</Label>
              <Select value={form.backupEmailStatus} onValueChange={(v) => set("backupEmailStatus", v as HrExitFormState["backupEmailStatus"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>FnF Settlement Status</Label>
              <Select value={form.fnfStatus} onValueChange={(v) => set("fnfStatus", v as HrExitFormState["fnfStatus"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="settled">Settled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Remarks</Label>
            <Textarea
              value={form.remarks}
              onChange={(e) => set("remarks", e.target.value)}
              placeholder="Any additional notes about the exit or settlement..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || !form.exitDate} onClick={() => void onSave()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Exit Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
