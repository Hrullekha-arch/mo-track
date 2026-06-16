"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, ClipboardList, Eye, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { EmployeePerformanceRow } from "../types";
import { roleLabel, updatedTimeLabel } from "../utils";
import type { HrWorkspaceTabsProps } from "./types";

const performanceBandClassName = (band: EmployeePerformanceRow["band"]) =>
  cn(
    band === "excellent" && "border-emerald-200 bg-emerald-50 text-emerald-700",
    band === "good" && "border-cyan-200 bg-cyan-50 text-cyan-700",
    band === "watch" && "border-amber-200 bg-amber-50 text-amber-700",
    band === "critical" && "border-red-200 bg-red-50 text-red-700"
  );

const payrollStatusClassName = (status: EmployeePerformanceRow["payrollStatus"]) =>
  cn(
    status === "generated" && "border-emerald-200 bg-emerald-50 text-emerald-700",
    status === "draft" && "border-amber-200 bg-amber-50 text-amber-700",
    status === "salary_missing" && "border-red-200 bg-red-50 text-red-700"
  );

const timesheetStatusClassName = (status: EmployeePerformanceRow["timesheetStatus"]) =>
  cn(
    status === "submitted" && "border-emerald-200 bg-emerald-50 text-emerald-700",
    status === "pending" && "border-amber-200 bg-amber-50 text-amber-700",
    status === "not_tracked" && "border-slate-200 bg-slate-50 text-slate-700"
  );

type TimesheetsTabProps = Pick<
  HrWorkspaceTabsProps,
  | "timesheetsLoading"
  | "filteredEmployees"
  | "filteredTodayRows"
  | "onOpenEmployeeDialog"
>;

export function TimesheetsTab({ timesheetsLoading, filteredEmployees, filteredTodayRows, onOpenEmployeeDialog }: TimesheetsTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [trackingFilter, setTrackingFilter] = useState<"all" | "on" | "off">("all");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const timesheetRowsById = new Map(filteredTodayRows.map((row) => [row.user.id, row]));
  const visibleRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return filteredEmployees
      .map((employee) => {
        const tracked = employee.role !== "installer" && Boolean(employee.timesheetEnabled);
        const row = timesheetRowsById.get(employee.id);

        return {
          employee,
          tracked,
          row,
        };
      })
      .filter(({ employee, tracked }) => {
        if (trackingFilter === "on" && !tracked) return false;
        if (trackingFilter === "off" && tracked) return false;
        if (!needle) return true;

        const haystack = [
          employee.name,
          employee.role,
          employee.department,
          employee.employeeCode,
          employee.biometricId,
          employee.store,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");

        return haystack.includes(needle);
      });
  }, [filteredEmployees, searchTerm, timesheetRowsById, trackingFilter]);

  const trackedCount = filteredEmployees.filter((entry) => entry.role !== "installer" && Boolean(entry.timesheetEnabled)).length;

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-base">Today&apos;s Timesheets</CardTitle>
        <CardDescription>
          HR can review both timesheet-enabled and non-timesheet employees here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-sm text-slate-600">
            View who is on timesheet tracking and who is not, then manage the employee setting directly.
          </p>
          <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
            Tracked: {trackedCount}
          </Badge>
        </div>
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search employee, role, dept, code..."
            className="h-9 md:max-w-sm"
          />
          <div className="flex items-center gap-2">
            {[
              { key: "all", label: "All" },
              { key: "on", label: "On" },
              { key: "off", label: "Off" },
            ].map((option) => (
              <Button
                key={option.key}
                type="button"
                variant={trackingFilter === option.key ? "default" : "outline"}
                size="sm"
                onClick={() => setTrackingFilter(option.key as typeof trackingFilter)}
                className="h-8"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
        {timesheetsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : visibleRows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Timesheet</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duty</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Remark</TableHead>
                <TableHead className="text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map(({ employee, tracked, row }) => {
                const isExpanded = expandedUserId === employee.id;
                const hourRows = row?.perHour || [];
                return (
                  <Fragment key={employee.id}>
                    <TableRow>
                      <TableCell>
                        <div>
                          <p className="font-medium">{employee.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {roleLabel(employee)}
                            {employee.department ? ` / ${employee.department}` : ""}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            tracked
                              ? "border-violet-200 bg-violet-50 text-violet-700"
                              : "border-slate-200 bg-slate-50 text-slate-600"
                          }
                        >
                          {tracked ? "On" : "Off"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            !tracked
                              ? "border-slate-200 bg-slate-50 text-slate-600"
                              : row?.status === "submitted"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                          }
                        >
                          {!tracked ? "not tracked" : row?.status || "pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>{tracked ? row?.dutyLabel || `${employee.timesheetDutyStart || "--:--"} - ${employee.timesheetDutyEnd || "--:--"}` : "-"}</TableCell>
                      <TableCell>
                        {!tracked
                          ? "Off"
                          : row
                            ? `${row.filledSlots}/${row.totalSlots || 0} filled, ${row.lockedSlots || 0} locked`
                            : "Waiting"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{tracked ? updatedTimeLabel(row?.updatedAt) : "-"}</TableCell>
                      <TableCell className="max-w-xs text-sm text-muted-foreground">{tracked ? row?.remark || "-" : "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title={`View timesheet details for ${employee.name}`}
                            disabled={!tracked || !row}
                            onClick={() => setExpandedUserId(isExpanded ? null : employee.id)}
                          >
                            <ClipboardList className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title={`Manage ${employee.name}`}
                            onClick={() => onOpenEmployeeDialog(employee)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-slate-50">
                          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900">Hourly details</p>
                              <p className="text-xs text-slate-500">
                                {hourRows.length ? `${hourRows.length} slots` : "No hourly rows saved yet"}
                              </p>
                            </div>
                            {hourRows.length ? (
                              <div className="grid gap-2 md:grid-cols-2">
                                {hourRows.map((hour) => {
                                  const isLocked = Boolean(hour.lockedAt || hour.autoSubmittedAt);
                                  return (
                                    <div key={`${hour.slotStart}-${hour.slotEnd}`} className="rounded-lg border border-slate-200 p-2.5">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-semibold text-slate-800">{hour.slotLabel}</p>
                                        <Badge variant="outline" className={isLocked ? "border-slate-200 bg-slate-100 text-slate-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                                          {isLocked ? "Fixed" : "Open"}
                                        </Badge>
                                      </div>
                                      <p className="mt-2 min-h-10 whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                                        {hour.workDetail || "No update entered"}
                                      </p>
                                      <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                                        <p>{hour.updatedBy?.name ? `Updated by ${hour.updatedBy.name}` : "No updater recorded"}</p>
                                        <p>{hour.updatedAt ? `Updated ${updatedTimeLabel(hour.updatedAt)}` : "Update time not recorded"}</p>
                                        <p>{hour.autoSubmittedAt ? `Auto submitted ${updatedTimeLabel(hour.autoSubmittedAt)}` : hour.lockedAt ? `Locked ${updatedTimeLabel(hour.lockedAt)}` : "Not locked yet"}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No hourly update document is available for this employee today.</p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No employees match the current search.</p>
        )}
      </CardContent>
    </Card>
  );
}

type PerformanceTabProps = Pick<
  HrWorkspaceTabsProps,
  | "usersLoading"
  | "performanceRows"
  | "submittedTodayCount"
  | "timesheetEligibleCount"
  | "onCreateManualEmployee"
  | "onOpenEmployeeDialog"
>;

export function PerformanceTab({
  usersLoading,
  performanceRows,
  submittedTodayCount,
  timesheetEligibleCount,
  onCreateManualEmployee,
  onOpenEmployeeDialog,
}: PerformanceTabProps) {
  const excellentCount = performanceRows.filter((row) => row.band === "excellent").length;
  const followUpCount = performanceRows.filter((row) => row.band === "critical" || row.band === "watch").length;
  const averageScore = performanceRows.length
    ? Math.round(performanceRows.reduce((sum, row) => sum + row.score, 0) / performanceRows.length)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Average Score</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{averageScore}</p>
            <p className="mt-1 text-sm text-slate-500">Combined from profile, payroll, attendance, and timesheet discipline.</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Excellent</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{excellentCount}</p>
            <p className="mt-1 text-sm text-slate-500">Employees scoring 85 and above.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Need Follow-Up</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{followUpCount}</p>
            <p className="mt-1 text-sm text-slate-500">Watch and critical employees for HR action.</p>
          </CardContent>
        </Card>
        <Card className="border-cyan-200 bg-cyan-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Timesheets Today</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {submittedTodayCount}/{timesheetEligibleCount}
            </p>
            <p className="mt-1 text-sm text-slate-500">Tracked staff who submitted timesheets today.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Employee Performance Tracker</CardTitle>
            <CardDescription>
              Review profile completion, timesheet discipline, payroll readiness, and attendance payout behavior.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onCreateManualEmployee}>
              <UserPlus className="h-4 w-4" />
              Add Employee
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/users">
                Open User Management
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : performanceRows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>Timesheet</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Payroll</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performanceRows.map((row) => (
                  <TableRow key={row.employee.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{row.employee.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {roleLabel(row.employee)}
                          {row.employee.department ? ` / ${row.employee.department}` : ""}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={performanceBandClassName(row.band)}>
                        {row.score}/100
                      </Badge>
                    </TableCell>
                    <TableCell>{row.profileCompletion}%</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={timesheetStatusClassName(row.timesheetStatus)}>
                        {row.timesheetStatus.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.attendanceRatio === null ? (
                        <span className="text-xs text-slate-400">No data</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-sm font-semibold ${row.attendanceRatio >= 0.9 ? "text-emerald-600" : row.attendanceRatio >= 0.75 ? "text-amber-600" : "text-red-600"}`}>
                            {Math.round(row.attendanceRatio * 100)}%
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {row.attendancePaidDays ?? 0}/{row.attendanceWorkingDays ?? 0} days
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={payrollStatusClassName(row.payrollStatus)}>
                        {row.payrollStatus.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-sm text-sm text-slate-600">{row.note}</TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => onOpenEmployeeDialog(row.employee)}
                        className="group/btn ml-auto flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                      >
                        <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                        <span className="max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-medium transition-[max-width] duration-200 group-hover/btn:max-w-[44px]">
                          Review
                        </span>
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No employees available for performance tracking yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
