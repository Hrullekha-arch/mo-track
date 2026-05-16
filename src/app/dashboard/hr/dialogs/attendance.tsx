"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Save, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  AttendanceRecord,
  HrEmployee,
  HrHolidayFormState,
  HrLeaveRequest,
} from "../types";
import {
  ATTENDANCE_STATUS_LABELS,
  calcAttendanceSummary,
  formatMonthLabel,
  getMonthlyLeaveBalance,
  parseSSLAttendanceFile,
  resolveAttendanceStatusWithPolicy,
  type SSLParseResult,
} from "../utils";

// ─── Attendance Upload Dialog ─────────────────────────────────────────────────

type AttendanceUploadDialogProps = {
  employees: HrEmployee[];
  month: string;
  saving: boolean;
  onClose: () => void;
  onUpload: (records: Omit<AttendanceRecord, "id">[], batchId: string) => void | Promise<void>;
};

export function AttendanceUploadDialog({ employees, month, saving, onClose, onUpload }: AttendanceUploadDialogProps) {
  const [parseResult, setParseResult] = useState<SSLParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const normalizeCode = (value?: string | null) =>
    String(value || "")
      .trim()
      .replace(/^'+/, "")
      .replace(/\s+/g, "")
      .replace(/\.0+$/, "")
      .toLowerCase();
  const normalizeName = (value?: string | null) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

  const findMatchedEmployee = (row: SSLParseResult["rows"][number]) => {
    const rowCode = normalizeCode(row.employeeCode);
    const rowName = normalizeName(row.importedEmployeeName);
    return employees.find(
      (entry) =>
        (rowCode && normalizeCode(entry.biometricId) === rowCode)
        || (rowCode && normalizeCode(entry.employeeCode) === rowCode)
        || (rowName && normalizeName(entry.name) === rowName)
    );
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    setParseResult(null);
    void parseSSLAttendanceFile(file)
      .then(setParseResult)
      .catch((error: any) => {
        setParseResult({
          rows: [],
          warnings: [error?.message || "Unable to parse the selected file."],
          rawCount: 0,
        });
      });
  };

  const matchedRecords = (): Omit<AttendanceRecord, "id">[] => {
    if (!parseResult) return [];
    const uploadedAt = new Date().toISOString();
    const batchId = `ssl_${Date.now()}`;
    return parseResult.rows.flatMap((row) => {
      const emp = findMatchedEmployee(row);
      if (!emp) return [];
      const { importedEmployeeName, ...attendanceRow } = row;
      const resolvedCode = emp.employeeCode || emp.biometricId || row.employeeCode || undefined;
      const resolvedBiometricId = emp.biometricId || emp.employeeCode || row.employeeCode || undefined;
      const resolvedStatus = resolveAttendanceStatusWithPolicy(
        {
          status: attendanceRow.status,
          inTime: attendanceRow.inTime,
          outTime: attendanceRow.outTime,
        },
        emp
      );
      return [{
        ...attendanceRow,
        status: resolvedStatus,
        employeeId: emp.id,
        employeeName: emp.name,
        biometricId: resolvedBiometricId,
        employeeCode: resolvedCode,
        department: emp.department || undefined,
        uploadBatch: batchId,
        uploadedAt,
      }];
    });
  };

  const matched = parseResult ? matchedRecords() : [];
  const unmatched = parseResult
    ? parseResult.rows.filter((row) => !findMatchedEmployee(row))
    : [];

  const statusClass = (s: AttendanceRecord["status"]) => {
    if (s === "present") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (s === "absent") return "border-red-200 bg-red-50 text-red-700";
    if (s === "missed_punch") return "border-rose-200 bg-rose-50 text-rose-700";
    if (s === "late") return "border-amber-200 bg-amber-50 text-amber-700";
    if (s === "half_day") return "border-orange-200 bg-orange-50 text-orange-700";
    if (s === "week_off_present") return "border-teal-200 bg-teal-50 text-teal-700";
    if (s === "holiday" || s === "week_off") return "border-slate-200 bg-slate-50 text-slate-600";
    return "border-cyan-200 bg-cyan-50 text-cyan-700";
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-slate-200 bg-white p-0 sm:max-w-4xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Upload eSSL eTimeTrack Lite Attendance</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel export from your eSSL eTimeTrack Lite biometric device. Employee codes must match those in HR master.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-medium text-slate-700">Template & guide:</p>
            <Button asChild type="button" variant="outline" size="sm">
              <a href="/templates/hr/attendance-import-template.csv" download>
                Download CSV Template
              </a>
            </Button>
            <Button asChild type="button" variant="outline" size="sm">
              <a href="/templates/hr/attendance-import-guide.txt" download>
                Download Guide
              </a>
            </Button>
            <p className="w-full text-xs text-slate-500">
              Supports `eSSL eTimeTrack Lite` row export and `Monthly Status Report (Basic Work Duration)`.
            </p>
          </div>
          <div
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-10 transition hover:border-slate-300 hover:bg-slate-100"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <FileText className="h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-600">{fileName || "Click or drag a CSV / Excel file here"}</p>
            <p className="text-xs text-slate-400">SSL Savvy export — columns: EmpCode, Date, InTime, OutTime, Status</p>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>

          {parseResult && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                  <p className="text-xs text-slate-500">Rows Parsed</p>
                  <p className="text-2xl font-bold text-slate-900">{parseResult.rawCount}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <p className="text-xs text-slate-500">Matched Employees</p>
                  <p className="text-2xl font-bold text-emerald-700">{matched.length}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                  <p className="text-xs text-slate-500">Unmatched / Skipped</p>
                  <p className="text-2xl font-bold text-amber-700">{unmatched.length + parseResult.warnings.length}</p>
                </div>
              </div>

              {parseResult.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-800">Parse Warnings</p>
                  {parseResult.warnings.map((w, i) => <p key={i} className="text-xs text-amber-700">{w}</p>)}
                </div>
              )}

              {parseResult.rows.length > 0 && matched.length === 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                  <p className="text-xs font-semibold text-red-800">Employee Code Check</p>
                  <p className="text-xs text-red-700">
                    Attendance rows were read, but they did not match HR employee codes. Make sure eSSL `Emp. Code`
                    matches HR `Employee Code` or `Biometric ID`.
                  </p>
                </div>
              )}

              {matched.length > 0 && (
                <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>In</TableHead>
                        <TableHead>Out</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matched.slice(0, 100).map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm font-medium">{r.employeeName}</TableCell>
                          <TableCell className="text-xs text-slate-500">{r.employeeCode || r.biometricId || "-"}</TableCell>
                          <TableCell className="text-sm">{r.date}</TableCell>
                          <TableCell className="text-xs text-slate-600">{r.inTime || "-"}</TableCell>
                          <TableCell className="text-xs text-slate-600">{r.outTime || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusClass(r.status)}>
                              {ATTENDANCE_STATUS_LABELS[r.status]}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {matched.length > 100 && <p className="p-3 text-xs text-slate-400">...and {matched.length - 100} more rows</p>}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            disabled={saving || !matched.length}
            onClick={() => {
              const batchId = `ssl_${Date.now()}`;
              void onUpload(matched, batchId);
            }}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Import {matched.length} Record{matched.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Holiday Dialog ───────────────────────────────────────────────────────────

type HolidayDialogProps = {
  employees: HrEmployee[];
  form: HrHolidayFormState;
  setForm: (v: HrHolidayFormState) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export function HolidayDialog({ employees, form, setForm, saving, onClose, onSave }: HolidayDialogProps) {
  const set = <K extends keyof HrHolidayFormState>(key: K, val: HrHolidayFormState[K]) =>
    setForm({ ...form, [key]: val });

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-slate-200 bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Holiday</DialogTitle>
          <DialogDescription>
            Add a global holiday (for all employees) or a specific holiday for one employee.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Holiday Date</Label>
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Holiday Name</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Diwali, Independence Day, Branch Holiday"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Holiday Type</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v as HrHolidayFormState["type"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="national">National Holiday</SelectItem>
                <SelectItem value="festival">Festival Holiday</SelectItem>
                <SelectItem value="optional">Optional Holiday</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Apply To</Label>
            <Select value={form.employeeId || "__global__"} onValueChange={(v) => set("employeeId", v === "__global__" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__global__">All Employees (Global)</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}{e.department ? ` — ${e.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              {form.employeeId
                ? "This holiday will only apply to the selected employee."
                : "This holiday will apply to all employees."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || !form.date || !form.name.trim()} onClick={() => void onSave()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Holiday
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Manage Attendance Dialog ─────────────────────────────────────────────────

type ManageAttendanceDialogProps = {
  employee: HrEmployee;
  month: string;
  existingRecords: AttendanceRecord[];
  leaveRequests: HrLeaveRequest[];
  saving: boolean;
  onClose: () => void;
  onSave: (record: Omit<AttendanceRecord, "id">) => void | Promise<void>;
  onDelete: (record: AttendanceRecord) => void | Promise<void>;
};

export function ManageAttendanceDialog({
  employee,
  month,
  existingRecords,
  leaveRequests,
  saving,
  onClose,
  onSave,
  onDelete,
}: ManageAttendanceDialogProps) {
  const [date, setDate] = useState(`${month}-01`);
  const [status, setStatus] = useState<AttendanceRecord["status"]>("present");
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [managedAbsentDate, setManagedAbsentDate] = useState("");

  const monthRecords = existingRecords
    .filter((r) => r.employeeId === employee.id && r.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date));
  const effectiveMonthRecords = monthRecords.map((record) => ({
    ...record,
    effectiveStatus: resolveAttendanceStatusWithPolicy(record, employee),
  }));
  const selectedRecord = useMemo(
    () => monthRecords.find((record) => record.date === date),
    [date, monthRecords]
  );
  const managedLeaveId = `attendance_${employee.id}_${date}`;
  const existingManagedLeave = leaveRequests.find((request) => request.id === managedLeaveId);
  const leaveReferenceDate = useMemo(() => new Date(`${date}T00:00:00`), [date]);
  const leaveBalance = getMonthlyLeaveBalance(
    leaveRequests.filter((request) => request.id !== managedLeaveId),
    employee.id,
    employee,
    leaveReferenceDate
  );
  const remainingLeaveAfterSave = Math.max(leaveBalance.balance - (status === "on_leave" ? 1 : 0), 0);

  const summary = calcAttendanceSummary(existingRecords, employee.id, month, [], employee);

  useEffect(() => {
    if (selectedRecord) {
      setStatus(managedAbsentDate === selectedRecord.date ? "on_leave" : selectedRecord.status);
      setInTime(selectedRecord.inTime || "");
      setOutTime(selectedRecord.outTime || "");
      return;
    }
    setStatus("present");
    setInTime("");
    setOutTime("");
  }, [managedAbsentDate, selectedRecord]);

  const handleManageAbsent = (record: AttendanceRecord) => {
    setManagedAbsentDate(record.date);
    setDate(record.date);
    setStatus("on_leave");
    setInTime(record.inTime || "");
    setOutTime(record.outTime || "");
  };

  const handleManageMissedPunch = (record: AttendanceRecord) => {
    setManagedAbsentDate("");
    setDate(record.date);
    setStatus("present");
    setInTime(record.inTime || "");
    setOutTime(record.outTime || "");
  };

  const handleManageRecord = (record: AttendanceRecord) => {
    setManagedAbsentDate("");
    setDate(record.date);
    setStatus(record.status);
    setInTime(record.inTime || "");
    setOutTime(record.outTime || "");
  };

  const handleAdd = () => {
    const resolvedStatus = resolveAttendanceStatusWithPolicy(
      {
        status,
        inTime: inTime || undefined,
        outTime: outTime || undefined,
      },
      employee
    );
    void onSave({
      employeeId: employee.id,
      employeeName: employee.name,
      biometricId: employee.biometricId,
      employeeCode: employee.employeeCode,
      department: employee.department,
      date,
      inTime: inTime || undefined,
      outTime: outTime || undefined,
      status: resolvedStatus,
      source: "manual",
      uploadedAt: new Date().toISOString(),
    });
  };

  const statusClass = (s: AttendanceRecord["status"]) => {
    if (s === "present") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (s === "absent") return "border-red-200 bg-red-50 text-red-700";
    if (s === "late") return "border-amber-200 bg-amber-50 text-amber-700";
    if (s === "half_day") return "border-orange-200 bg-orange-50 text-orange-700";
    if (s === "week_off_present") return "border-teal-200 bg-teal-50 text-teal-700";
    if (s === "holiday" || s === "week_off") return "border-slate-200 bg-slate-50 text-slate-600";
    return "border-cyan-200 bg-cyan-50 text-cyan-700";
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-slate-200 bg-white p-0 sm:max-w-2xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Manage Attendance — {employee.name}</DialogTitle>
          <DialogDescription>{formatMonthLabel(month)} · {employee.department || employee.role}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-4">
          <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-center">
            <div>
              <p className="text-xs text-slate-500">Present</p>
              <p className="text-xl font-bold text-emerald-700">{summary.present + summary.late}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Absent / LOP</p>
              <p className="text-xl font-bold text-red-600">{summary.absent}</p>
              {summary.missedPunch > 0 ? (
                <p className="mt-1 text-xs text-rose-600">{summary.missedPunch} missed punch</p>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-slate-500">Paid Days</p>
              <p className="text-xl font-bold text-slate-900">{summary.paidDays}</p>
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border border-cyan-100 bg-cyan-50/40 p-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Paid Leave Available</p>
              <p className="mt-2 text-xl font-bold text-slate-900">{leaveBalance.balance}</p>
              <p className="mt-1 text-xs text-slate-500">
                Used {leaveBalance.used} of {leaveBalance.accrued} in {leaveBalance.label}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                This month policy: {leaveBalance.monthlyPaidLeave} paid + {leaveBalance.monthlyHalfDayLeave} half day + {leaveBalance.monthlyShortLeave} short leave
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">This Save</p>
              <p className="mt-2 text-xl font-bold text-cyan-700">
                {status === "on_leave" ? (existingManagedLeave ? "Keep 1 day" : "Use 1 day") : existingManagedLeave ? "Restore 1 day" : "No change"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {status === "on_leave"
                  ? existingManagedLeave
                    ? "This date is already consuming paid leave."
                    : "Absent can be managed as paid leave by HR."
                  : existingManagedLeave
                    ? "Changing this date from paid leave will return one day."
                    : "Attendance update will not change leave balance."}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Remaining After Save</p>
              <p className="mt-2 text-xl font-bold text-emerald-700">
                {status === "on_leave" ? remainingLeaveAfterSave : leaveBalance.balance + (existingManagedLeave ? 1 : 0)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Balance updates immediately after save.</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Add / Update Entry</p>
            {managedAbsentDate === date && status === "on_leave" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                Managing absent date: <span className="font-semibold">{date}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={`${month}-01`} max={`${month}-31`} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as AttendanceRecord["status"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ATTENDANCE_STATUS_LABELS) as [AttendanceRecord["status"], string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">In Time (optional)</Label>
                <Input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Out Time (optional)</Label>
                <Input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
              </div>
            </div>
            {status === "on_leave" && (
              <div className={`rounded-lg border p-3 text-xs ${leaveBalance.balance < 1 && !existingManagedLeave ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                {leaveBalance.balance < 1 && !existingManagedLeave
                  ? "No paid leave balance is available. Save will be blocked until HR adds leave balance or changes status."
                  : existingManagedLeave
                    ? "This date is already linked to paid leave. Saving will keep the same leave usage."
                    : "This absent date will be converted to paid leave and one leave day will be deducted."}
              </div>
            )}
            {status === "missed_punch" && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                Only one punch is available for this entry. HR can complete the missing in/out time and save again.
              </div>
            )}
            <Button type="button" size="sm" disabled={saving || !date} onClick={handleAdd}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Entry
            </Button>
          </div>

          {monthRecords.length > 0 && (
            <div className="max-h-60 overflow-auto rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>In</TableHead>
                    <TableHead>Out</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Manage</TableHead>
                    <TableHead className="text-right">Del</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {effectiveMonthRecords.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.date}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusClass(r.effectiveStatus)}>
                          {ATTENDANCE_STATUS_LABELS[r.effectiveStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{r.inTime || "—"}</TableCell>
                      <TableCell className="text-xs text-slate-500">{r.outTime || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={r.source === "biometric" ? "border-teal-200 bg-teal-50 text-teal-700 text-[10px]" : "border-slate-200 text-[10px]"}>
                          {r.source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.effectiveStatus === "missed_punch" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 border-rose-200 p-0 text-rose-700 hover:bg-rose-50"
                            title={`Fix missed punch for ${r.date}`}
                            onClick={() => handleManageMissedPunch(r)}
                          >
                            <ShieldCheck className="h-4 w-4" />
                          </Button>
                        ) : r.effectiveStatus === "absent" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 border-amber-200 p-0 text-amber-700 hover:bg-amber-50"
                            title={`Manage absent for ${r.date}`}
                            onClick={() => handleManageAbsent(r)}
                          >
                            <ShieldCheck className="h-4 w-4" />
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            {leaveRequests.some((request) => request.id === `attendance_${employee.id}_${r.date}`) ? (
                              <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">
                                Paid Leave Used
                              </Badge>
                            ) : null}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 border-slate-200 p-0 text-slate-700 hover:bg-slate-50"
                              title={`Manage attendance for ${r.date}`}
                              onClick={() => handleManageRecord(r)}
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <button type="button" className="text-slate-300 hover:text-red-500" onClick={() => void onDelete(r)}>
                          ×
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
