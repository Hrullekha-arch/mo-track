"use client";

import { Fragment, useMemo, useState } from "react";
import { Download, Eye, FileSpreadsheet, FileText, Trash2, UserPlus, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AttendanceRecord } from "../types";
import {
  ATTENDANCE_GRACE_MINUTES,
  ATTENDANCE_STATUS_LABELS,
  calcAttendanceSummary,
  exportAttendanceCsv,
  exportAttendanceExcel,
  formatDateLabel,
  formatMonthLabel,
  hasSalaryConfig,
  resolveAttendanceStatusWithPolicy,
  roleLabel,
} from "../utils";
import type { HrWorkspaceTabsProps } from "./types";

type Props = Pick<
  HrWorkspaceTabsProps,
  | "activeEmployees"
  | "attendanceRecords"
  | "attendanceLoading"
  | "holidays"
  | "holidaysLoading"
  | "selectedMonth"
  | "onOpenAttendanceUpload"
  | "onOpenHolidayDialog"
  | "onDeleteHoliday"
  | "onOpenManageAttendance"
  | "onOpenPayrollDialog"
>;

export function AttendanceTab({
  activeEmployees,
  attendanceRecords,
  attendanceLoading,
  holidays,
  holidaysLoading,
  selectedMonth,
  onOpenAttendanceUpload,
  onOpenHolidayDialog,
  onDeleteHoliday,
  onOpenManageAttendance,
  onOpenPayrollDialog,
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const searchNeedle = searchTerm.trim().toLowerCase();
  const employeeSummaries = useMemo(
    () =>
      activeEmployees.map((employee) => ({
        employee,
        summary: calcAttendanceSummary(attendanceRecords, employee.id, selectedMonth, holidays, employee),
      })),
    [activeEmployees, attendanceRecords, holidays, selectedMonth]
  );

  const presentCount = useMemo(
    () => employeeSummaries.reduce((sum, entry) => sum + entry.summary.present + entry.summary.late, 0),
    [employeeSummaries]
  );
  const absentCount = useMemo(
    () => employeeSummaries.reduce((sum, entry) => sum + entry.summary.absent, 0),
    [employeeSummaries]
  );
  const holidayCount = useMemo(
    () => holidays.filter((h) => h.date.startsWith(selectedMonth) && !h.employeeId).length,
    [holidays, selectedMonth]
  );
  const totalRecords = attendanceRecords.length;
  const visibleEmployeeSummaries = useMemo(
    () =>
      searchNeedle
        ? employeeSummaries.filter(({ employee }) =>
            [employee.name, employee.department, employee.role, employee.employeeCode, employee.biometricId]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(searchNeedle))
          )
        : employeeSummaries,
    [employeeSummaries, searchNeedle]
  );
  const visibleLogRecords = useMemo(
    () =>
      [...attendanceRecords]
        .map((record) => {
          const employee = activeEmployees.find((entry) => entry.id === record.employeeId);
          const effectiveStatus = resolveAttendanceStatusWithPolicy(record, employee);
          return { ...record, effectiveStatus };
        })
        .filter((record) =>
          !searchNeedle
            ? true
            : [record.employeeName, record.employeeCode, record.department, record.date, record.status, record.effectiveStatus, record.source]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(searchNeedle))
        )
        .sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName))
        .slice(0, 200),
    [activeEmployees, attendanceRecords, searchNeedle]
  );
  const visibleHolidays = useMemo(
    () =>
      searchNeedle
        ? holidays.filter((holiday) =>
            [holiday.name, holiday.type, holiday.employeeName, holiday.date]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(searchNeedle))
          )
        : holidays,
    [holidays, searchNeedle]
  );

  const attendanceStatusClass = (s: AttendanceRecord["status"]) => {
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
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Present / Late</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{presentCount}</p>
            <p className="mt-1 text-sm text-slate-500">Attendance entries this month.</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Absent</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{absentCount}</p>
            <p className="mt-1 text-sm text-slate-500">Absent records this month.</p>
          </CardContent>
        </Card>
        <Card className="border-teal-200 bg-teal-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total Records</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{totalRecords}</p>
            <p className="mt-1 text-sm text-slate-500">All attendance entries for month.</p>
          </CardContent>
        </Card>
        <Card className="border-violet-200 bg-violet-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Global Holidays</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{holidayCount}</p>
            <p className="mt-1 text-sm text-slate-500">Holidays declared this month.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Attendance Summary — {formatMonthLabel(selectedMonth)}</CardTitle>
            <CardDescription>
              Per-employee monthly attendance breakdown. Import from SSL biometric device or add manually.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => exportAttendanceCsv(attendanceRecords, selectedMonth)}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void exportAttendanceExcel(attendanceRecords, activeEmployees, selectedMonth)}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onOpenAttendanceUpload}>
              <FileText className="h-4 w-4" />
              Upload SSL CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {attendanceLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : (
            <div className="space-y-3">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search employee, dept, code, biometric..."
              className="max-w-sm"
            />
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-center">Present</TableHead>
                  <TableHead className="text-center">Absent</TableHead>
                  <TableHead className="text-center">Late</TableHead>
                  <TableHead className="text-center">Half Day</TableHead>
                  <TableHead className="text-center">Holiday</TableHead>
                  <TableHead className="text-center">Week Off</TableHead>
                  <TableHead className="text-center">On Leave</TableHead>
                  <TableHead className="text-center">LOP Days</TableHead>
                  <TableHead className="text-center">Paid Days</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleEmployeeSummaries.map(({ employee: emp, summary }) => {
                  const hasData = summary.totalDays > 0 || summary.holiday > 0;
                  return (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{emp.name}</p>
                          <p className="text-xs text-muted-foreground">{emp.department || roleLabel(emp)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {hasData ? <span className="font-semibold text-emerald-700">{summary.present}</span> : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasData ? <span className={summary.absent > 0 ? "font-semibold text-red-600" : "text-slate-400"}>{summary.absent}</span> : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasData ? <span className={summary.late > 0 ? "text-amber-600" : "text-slate-400"}>{summary.late}</span> : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasData ? <span className={summary.halfDay > 0 ? "text-orange-600" : "text-slate-400"}>{summary.halfDay}</span> : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasData ? <span className="text-slate-500">{summary.holiday}</span> : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasData ? <span className="text-slate-500">{summary.weekOff}</span> : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasData ? <span className="text-cyan-600">{summary.onLeave}</span> : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasData ? <span className={summary.lopDays > 0 ? "font-semibold text-red-600" : "text-slate-400"}>{summary.lopDays}</span> : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasData ? <span className="font-semibold text-slate-800">{summary.paidDays}</span> : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title={`Manage attendance for ${emp.name}`}
                            aria-label={`Manage attendance for ${emp.name}`}
                            onClick={() => onOpenManageAttendance(emp)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {hasData && hasSalaryConfig(emp) && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              title="Open payroll with attendance data pre-filled"
                              onClick={() => onOpenPayrollDialog(emp)}
                            >
                              <WalletCards className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!visibleEmployeeSummaries.length && (
                  <TableRow>
                    <TableCell colSpan={11} className="py-8 text-center text-sm text-slate-500">
                      No attendance summaries match the current search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
            </div>
          )}
        </CardContent>
      </Card>

      {totalRecords > 0 && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">
              Biometric Register — {formatMonthLabel(selectedMonth)}
            </CardTitle>
            <CardDescription>
              Excel-style monthly register. Status: <strong>P</strong>=Present, <strong>A</strong>=Absent, <strong>WO</strong>=Week Off, <strong>L</strong>=Late, <strong>H</strong>=Holiday, <strong>HD</strong>=Half Day, <strong>OL</strong>=On Leave.
              &nbsp;14-min grace applied on import (arrivals up to 10:{String(ATTENDANCE_GRACE_MINUTES).padStart(2, "0")} treated as Present).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <BiometricRegisterGrid
              attendanceRecords={attendanceRecords}
              activeEmployees={activeEmployees}
              selectedMonth={selectedMonth}
            />
          </CardContent>
        </Card>
      )}

      {totalRecords > 0 && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Daily Attendance Log</CardTitle>
            <CardDescription>Individual attendance entries for {formatMonthLabel(selectedMonth)}.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>In Time</TableHead>
                    <TableHead>Out Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleLogRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{record.employeeName}</p>
                            <p className="text-xs text-muted-foreground">{record.employeeCode || record.department || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{formatDateLabel(record.date)}</TableCell>
                        <TableCell className="text-sm text-slate-600">{record.inTime || "—"}</TableCell>
                        <TableCell className="text-sm text-slate-600">{record.outTime || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={attendanceStatusClass(record.effectiveStatus)}>
                            {ATTENDANCE_STATUS_LABELS[record.effectiveStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={record.source === "biometric" ? "border-teal-200 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600"}>
                            {record.source}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  {!visibleLogRecords.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">
                        No daily attendance rows match the current search.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {attendanceRecords.length > 200 && (
                <p className="p-3 text-xs text-slate-400">Showing first 200 of {attendanceRecords.length} records.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Holiday Calendar</CardTitle>
            <CardDescription>
              Global and per-employee holidays. Employee-specific holidays override the global calendar for salary calculation.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenHolidayDialog()}>
            <UserPlus className="h-4 w-4" />
            Add Holiday
          </Button>
        </CardHeader>
        <CardContent>
          {holidaysLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : visibleHolidays.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Holiday Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Applies To</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...visibleHolidays].sort((a, b) => a.date.localeCompare(b.date)).map((holiday) => (
                  <TableRow key={holiday.id}>
                    <TableCell className="text-sm font-medium">{formatDateLabel(holiday.date)}</TableCell>
                    <TableCell className="font-medium">{holiday.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          holiday.type === "national"
                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                            : holiday.type === "festival"
                              ? "border-violet-200 bg-violet-50 text-violet-700"
                              : "border-slate-200 text-slate-600"
                        }
                      >
                        {holiday.type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {holiday.employeeName ? (
                        <span className="text-sm text-slate-700">{holiday.employeeName}</span>
                      ) : (
                        <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">All Employees</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="ghost" size="sm" className="text-slate-400 hover:text-red-500" onClick={() => void onDeleteHoliday(holiday.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              {searchNeedle ? "No holidays match the current search." : "No holidays added yet. Click \"Add Holiday\" to create one."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Biometric Register Grid ──────────────────────────────────────────────────

const REG_STATUS_SHORT: Record<string, string> = {
  present: "P", absent: "A", week_off: "WO", holiday: "H",
  week_off_present: "WOP", half_day: "HD", late: "L", on_leave: "OL", missed_punch: "MP",
};
const REG_STATUS_CLASS: Record<string, string> = {
  present: "bg-emerald-50 text-emerald-700 font-bold",
  absent: "bg-red-50 text-red-700 font-bold",
  missed_punch: "bg-rose-50 text-rose-700 font-bold",
  week_off: "bg-slate-100 text-slate-500",
  week_off_present: "bg-teal-50 text-teal-700 font-bold",
  holiday: "bg-indigo-50 text-indigo-600 font-semibold",
  half_day: "bg-orange-50 text-orange-600",
  late: "bg-amber-50 text-amber-700 font-bold",
  on_leave: "bg-cyan-50 text-cyan-600",
};

function calcTotalTime(inTime?: string, outTime?: string): string {
  if (!inTime || !outTime) return "";
  const parse = (t: string) => { const m = t.match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const i = parse(inTime), o = parse(outTime);
  if (i === null || o === null || o <= i) return "0:00";
  const d = o - i;
  return `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}`;
}

function BiometricRegisterGrid({
  attendanceRecords,
  activeEmployees,
  selectedMonth,
}: Pick<import("./types").HrWorkspaceTabsProps, "attendanceRecords" | "activeEmployees" | "selectedMonth">) {
  const [year, monthNum] = selectedMonth.split("-").map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  const recordMap = useMemo(() => {
    const map = new Map<string, Map<string, AttendanceRecord>>();
    for (const rec of attendanceRecords) {
      if (!rec.date.startsWith(selectedMonth)) continue;
      if (!map.has(rec.employeeId)) map.set(rec.employeeId, new Map());
      map.get(rec.employeeId)!.set(rec.date, rec);
    }
    return map;
  }, [attendanceRecords, selectedMonth]);

  const departmentEntries = useMemo(() => {
    const map = new Map<string, typeof activeEmployees>();
    for (const emp of activeEmployees) {
      const dept = emp.department || "Unassigned";
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(emp);
    }
    return Array.from(map.entries()).map(([dept, employees]) => [
      dept,
      [...employees].sort((left, right) => left.name.localeCompare(right.name)),
    ] as const);
  }, [activeEmployees]);

  const DC = "w-[52px] min-w-[52px] max-w-[52px] text-center border-r border-slate-100 px-0.5 py-1 text-[10px]";

  return (
    <div className="max-h-[72vh] overflow-auto overscroll-contain">
      <table className="w-max border-collapse text-[10px]">
        <thead className="sticky top-0 z-30">
          <tr className="bg-slate-50">
            <th className="sticky left-0 z-40 min-w-[130px] border-b border-r-2 border-slate-300 bg-slate-50 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Employee
            </th>
            <th className="sticky z-40 min-w-[56px] border-b border-r-2 border-slate-300 bg-slate-50 px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500" style={{ left: 130 }}>
              Row
            </th>
            {days.map((d) => (
              <th key={d} className={`border-b border-slate-200 py-2 font-bold text-slate-500 ${DC}`}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {departmentEntries.map(([dept, emps]) => (
            <Fragment key={`dept-block-${dept}`}>
              <tr key={`dept-${dept}`}>
                <td
                  colSpan={days.length + 2}
                  className="border-b border-t-2 border-slate-300 bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-600"
                >
                  Department: {dept}
                </td>
              </tr>
              {emps.map((emp) => {
                const empMap = recordMap.get(emp.id) ?? new Map<string, AttendanceRecord>();
                return [0, 1, 2, 3].map((rowIdx) => {
                  const rowLabel = ["Status", "InTime", "OutTime", "Total"][rowIdx];
                  const isLast = rowIdx === 3;
                  return (
                    <tr key={`${emp.id}-r${rowIdx}`} className={isLast ? "border-b-2 border-slate-300" : ""}>
                      {rowIdx === 0 && (
                        <td
                          rowSpan={4}
                          className="sticky left-0 z-10 min-w-[130px] border-r-2 border-slate-300 bg-white px-2 py-1 align-middle"
                        >
                          <p className="text-[11px] font-bold text-slate-900 leading-tight">{emp.name}</p>
                          <p className="text-[9px] text-slate-400">{emp.employeeCode || "—"}</p>
                        </td>
                      )}
                      <td
                        className="sticky z-10 min-w-[56px] border-r-2 border-slate-300 bg-slate-50 px-1 py-1 text-center text-[9px] font-semibold uppercase text-slate-400"
                        style={{ left: 130 }}
                      >
                        {rowLabel}
                      </td>
                      {days.map((day) => {
                        const date = `${selectedMonth}-${String(day).padStart(2, "0")}`;
                        const rec = empMap.get(date);
                        if (rowIdx === 0) {
                          const s = rec ? resolveAttendanceStatusWithPolicy(rec, emp) : undefined;
                          return (
                            <td key={day} className={`${DC} ${s ? (REG_STATUS_CLASS[s] ?? "") : "text-slate-200"}`}>
                              {s ? (REG_STATUS_SHORT[s] ?? s) : ""}
                            </td>
                          );
                        }
                        if (rowIdx === 1) return <td key={day} className={`${DC} text-slate-600`}>{rec?.inTime ?? ""}</td>;
                        if (rowIdx === 2) return <td key={day} className={`${DC} text-slate-600`}>{rec?.outTime ?? ""}</td>;
                        const total = calcTotalTime(rec?.inTime, rec?.outTime);
                        return (
                          <td key={day} className={`${DC} ${total && total !== "0:00" ? "font-semibold text-slate-800" : "text-slate-300"}`}>
                            {total}
                          </td>
                        );
                      })}
                    </tr>
                  );
                });
                })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
