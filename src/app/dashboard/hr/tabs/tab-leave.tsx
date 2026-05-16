"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarCheck2, CalendarPlus, CheckCircle2, ChevronDown, ChevronUp, Download, Trash2, UserPlus, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  LEAVE_HALF_DAY_MONTHLY_ALLOWANCE,
  LEAVE_PROBATION_MONTHLY_ACCRUAL,
  LEAVE_PROBATION_MONTHS,
  LEAVE_MONTHLY_ACCRUAL,
  LEAVE_SHORT_LEAVE_MONTHLY_ALLOWANCE,
  LEAVE_TYPE_LABELS,
  exportLeaveCsv,
  formatDateLabel,
  getEmploymentStatus,
  getMonthlyLeaveBalance,
  roleLabel,
} from "../utils";
import type { HrWorkspaceTabsProps } from "./types";

type Props = Pick<
  HrWorkspaceTabsProps,
  | "usersLoading"
  | "activeEmployees"
  | "leaveRequests"
  | "leaveRequestsLoading"
  | "onOpenLeaveDialog"
  | "onReviewLeaveRequest"
  | "onConfirmLeaveRequest"
  | "onDeleteLeaveRequest"
  | "onAcceptHandover"
  | "onRejectHandover"
>;

export function LeaveTab({
  usersLoading,
  activeEmployees,
  leaveRequests,
  leaveRequestsLoading,
  onOpenLeaveDialog,
  onReviewLeaveRequest,
  onConfirmLeaveRequest,
  onDeleteLeaveRequest,
  onAcceptHandover,
  onRejectHandover,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvalDate, setApprovalDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [employeeSearch, setEmployeeSearch] = useState("");

  const pending = leaveRequests.filter((r) => r.status === "pending" || r.status === "handover_pending");
  const approved = leaveRequests.filter((r) => r.status === "approved");
  const rejected = leaveRequests.filter((r) => r.status === "rejected");
  const searchNeedle = employeeSearch.trim().toLowerCase();
  const nonInactiveEmployees = activeEmployees.filter((emp) => getEmploymentStatus(emp) !== "inactive");
  const visibleEmployees = searchNeedle
    ? nonInactiveEmployees.filter((emp) =>
        [emp.name, emp.department, emp.role, emp.employeeCode, emp.biometricId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(searchNeedle))
      )
    : nonInactiveEmployees;
  const visibleLeaveRequests = (searchNeedle
    ? leaveRequests.filter((req) =>
        [
          req.employeeName,
          req.department,
          req.leaveType,
          req.status,
          req.reason,
          req.fromDate,
          req.toDate,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(searchNeedle))
      )
    : leaveRequests
  ).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));

  const leaveStatusClass = (status: "pending" | "approved" | "rejected") =>
    status === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "rejected"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  const now = new Date();
  const onLeaveCount = nonInactiveEmployees.filter((e) => getEmploymentStatus(e) === "on_leave").length;
  const leaveOverviewRows = useMemo(
    () =>
      visibleEmployees.map((emp) => {
        const balance = getMonthlyLeaveBalance(leaveRequests, emp.id, emp, now);
        const employeeRequests = leaveRequests.filter((req) => req.employeeId === emp.id);
        const approvedDays = employeeRequests
          .filter((req) => req.status === "approved")
          .reduce((sum, req) => sum + req.days, 0);
        const pendingDays = employeeRequests
          .filter((req) => req.status === "pending" || req.status === "handover_pending")
          .reduce((sum, req) => sum + req.days, 0);
        const rejectedDays = employeeRequests
          .filter((req) => req.status === "rejected")
          .reduce((sum, req) => sum + req.days, 0);
        const latestRequest = [...employeeRequests].sort((left, right) => right.fromDate.localeCompare(left.fromDate))[0];

        return {
          employee: emp,
          balance,
          approvedDays,
          pendingDays,
          rejectedDays,
          latestRequest,
        };
      }),
    [leaveRequests, now, visibleEmployees]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pending Requests</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{pending.length}</p>
            <p className="mt-1 text-sm text-slate-500">Awaiting HR approval.</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Approved</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{approved.length}</p>
            <p className="mt-1 text-sm text-slate-500">Leave approved this year.</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Rejected</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{rejected.length}</p>
            <p className="mt-1 text-sm text-slate-500">Leave rejected this year.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">On Leave Now</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{onLeaveCount}</p>
            <p className="mt-1 text-sm text-slate-500">Marked as on leave in HR master.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Leave Balance Overview</CardTitle>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => exportLeaveCsv(leaveRequests)}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenLeaveDialog(null)}>
              <UserPlus className="h-4 w-4" />
              Apply Leave
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : (
            <div className="space-y-3">
              <Input
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                placeholder="Search employee, dept, role, code..."
                className="max-w-sm"
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Accrued</TableHead>
                    <TableHead>Taken</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Monthly Allowance</TableHead>
                    <TableHead>Current Leave</TableHead>
                    <TableHead>Last Leave</TableHead>
                    <TableHead>Policy Window</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaveOverviewRows.map(({ employee: emp, balance: lb, approvedDays, pendingDays, latestRequest }) => {
                  const usedPct = lb.accrued > 0 ? Math.min((lb.used / lb.accrued) * 100, 100) : 0;
                  const isOverdrawn = lb.used > lb.accrued;
                  const employmentStatus = getEmploymentStatus(emp);
                  return (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{emp.name}</p>
                          <p className="text-xs text-muted-foreground">{emp.department || roleLabel(emp)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-slate-800">{lb.accrued}</span>
                        <span className="ml-1 text-xs text-slate-400">days</span>
                      </TableCell>
                      <TableCell>
                        {approvedDays > 0 ? (
                          <Badge variant="outline" className={isOverdrawn ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 text-slate-700"}>
                            {approvedDays} day{approvedDays !== 1 ? "s" : ""}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {pendingDays > 0 ? (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                            {pendingDays} day{pendingDays !== 1 ? "s" : ""}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`text-lg font-bold ${isOverdrawn ? "text-red-600" : lb.balance === 0 ? "text-amber-600" : "text-emerald-700"}`}>
                          {lb.balance}
                        </span>
                        <span className="ml-1 text-xs text-slate-400">left</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                            {lb.monthlyPaidLeave} Paid
                          </Badge>
                          <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                            {lb.monthlyHalfDayLeave} Half Day
                          </Badge>
                          <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">
                            {lb.monthlyShortLeave} Short
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            employmentStatus === "on_leave"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-slate-200 bg-slate-50 text-slate-600"
                          }
                        >
                          {employmentStatus === "on_leave" ? "On Leave" : "Working"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {latestRequest ? (
                          <div>
                            <p className="text-sm font-medium text-slate-700">
                              {formatDateLabel(latestRequest.fromDate)} → {formatDateLabel(latestRequest.toDate)}
                            </p>
                            <p className="text-xs text-slate-500">{LEAVE_TYPE_LABELS[latestRequest.leaveType]}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">No leave yet</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-slate-700">{lb.label}</p>
                          <p className="text-xs text-slate-500">
                            {lb.monthsAccrued} month{lb.monthsAccrued !== 1 ? "s" : ""} counted ? {Math.round(usedPct)}% used
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={() => onOpenLeaveDialog(emp)}
                          className="group/btn flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                        >
                          <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
                          <span className="max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-medium transition-[max-width] duration-200 group-hover/btn:max-w-[60px]">
                            Apply Leave
                          </span>
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                  })}
                  {!visibleEmployees.length && (
                    <TableRow>
                      <TableCell colSpan={10} className="py-8 text-center text-sm text-slate-500">
                        No employees match the current search.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Leave Requests</CardTitle>
          <CardDescription>
            Review full details → HR Confirm → Approve with date. Handover must be accepted before HR can confirm.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leaveRequestsLoading ? (
            <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
          ) : visibleLeaveRequests.length ? (
            <div className="space-y-2">
              {visibleLeaveRequests.map((req) => {
                const isHandoverPending = req.status === "handover_pending";
                const isHrConfirmed = !!req.hrConfirmedAt;
                const isExpanded = expandedId === req.id;
                const isApproving = approvingId === req.id;

                const statusClass = isHandoverPending
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : leaveStatusClass(req.status as "pending" | "approved" | "rejected");
                const displayStatus = isHandoverPending
                  ? "Handover Pending"
                  : req.status === "pending"
                  ? isHrConfirmed ? "HR Confirmed — Awaiting Approval" : "Pending HR Review"
                  : req.status.charAt(0).toUpperCase() + req.status.slice(1);

                return (
                  <div key={req.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {/* ── Summary row ── */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button
                        type="button"
                        className="mr-1 text-slate-400 hover:text-slate-700"
                        onClick={() => setExpandedId(isExpanded ? null : req.id)}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{req.employeeName}</p>
                          {req.department && <span className="text-xs text-slate-500">· {req.department}</span>}
                          <Badge variant="outline" className="border-slate-200 text-xs">{LEAVE_TYPE_LABELS[req.leaveType]}</Badge>
                          <Badge variant="outline" className={`text-xs ${statusClass}`}>{displayStatus}</Badge>
                          {req.reviewNote?.includes("LWP") && (
                            <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 text-[10px]">LWP</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatDateLabel(req.fromDate)} → {formatDateLabel(req.toDate)} · <strong>{req.days}</strong> day{req.days !== 1 ? "s" : ""}
                          {req.approvalDate ? ` · Approved date: ${formatDateLabel(req.approvalDate)}` : ""}
                        </p>
                      </div>

                      {/* ── Action buttons ── */}
                      <div className="flex shrink-0 items-center gap-1">
                        {/* Handover step */}
                        {isHandoverPending && (
                          <>
                            <Button type="button" size="sm" variant="ghost" className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700" title="Accept Handover" onClick={() => void onAcceptHandover(req.id)}>
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="text-red-500 hover:bg-red-50 hover:text-red-600" title="Reject Handover" onClick={() => void onRejectHandover(req.id)}>
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}

                        {/* HR Confirm step — only after handover accepted (or no handover) */}
                        {req.status === "pending" && !isHrConfirmed && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 rounded-lg border-indigo-200 px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                            onClick={() => { setExpandedId(req.id); void onConfirmLeaveRequest(req.id); }}
                          >
                            <CalendarCheck2 className="h-3.5 w-3.5" />
                            HR Confirm
                          </Button>
                        )}

                        {/* Approve with date — only after HR confirmed */}
                        {req.status === "pending" && isHrConfirmed && !isApproving && (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500"
                            onClick={() => { setApprovalDate(format(new Date(), "yyyy-MM-dd")); setApprovingId(req.id); }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                        )}

                        {req.status === "pending" && (
                          <Button type="button" size="sm" variant="ghost" className="h-8 text-red-400 hover:bg-red-50 hover:text-red-600" title="Reject" onClick={() => void onReviewLeaveRequest(req.id, "rejected")}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}

                        <Button type="button" size="sm" variant="ghost" className="h-8 text-slate-300 hover:bg-red-50 hover:text-red-500" onClick={() => void onDeleteLeaveRequest(req.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* ── Approve with date inline form ── */}
                    {isApproving && (
                      <div className="flex items-center gap-3 border-t border-slate-100 bg-emerald-50 px-4 py-3">
                        <CalendarCheck2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        <p className="text-sm font-medium text-emerald-800">Select approval effective date:</p>
                        <Input
                          type="date"
                          value={approvalDate}
                          onChange={(e) => setApprovalDate(e.target.value || approvalDate)}
                          className="h-8 w-40 border-emerald-200 bg-white text-sm"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 bg-emerald-600 px-4 text-white hover:bg-emerald-500"
                          onClick={() => { void onReviewLeaveRequest(req.id, "approved", "", approvalDate); setApprovingId(null); }}
                        >
                          Confirm Approval
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-8 text-slate-500" onClick={() => setApprovingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    )}

                    {/* ── Expanded full details ── */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Employee</p>
                            <p className="mt-1 text-sm font-medium text-slate-900">{req.employeeName}</p>
                            {req.employeeCode && <p className="text-xs text-slate-500">{req.employeeCode}</p>}
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Department</p>
                            <p className="mt-1 text-sm text-slate-700">{req.department || "—"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Leave Type</p>
                            <p className="mt-1 text-sm text-slate-700">{LEAVE_TYPE_LABELS[req.leaveType]}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">From → To</p>
                            <p className="mt-1 text-sm text-slate-700">
                              {formatDateLabel(req.fromDate)} → {formatDateLabel(req.toDate)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Total Days</p>
                            <p className="mt-1 text-sm font-bold text-slate-900">{req.days} day{req.days !== 1 ? "s" : ""}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Applied On</p>
                            <p className="mt-1 text-sm text-slate-700">{formatDateLabel(req.appliedAt)}</p>
                          </div>
                          <div className="sm:col-span-2 lg:col-span-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Reason</p>
                            <p className="mt-1 text-sm text-slate-700">{req.reason || "—"}</p>
                          </div>
                          {req.handoverName && (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Handover</p>
                              <p className="mt-1 text-sm text-slate-700">{req.handoverName}</p>
                              <Badge variant="outline" className={
                                req.handoverStatus === "accepted" ? "mt-1 border-emerald-200 bg-emerald-50 text-emerald-700"
                                : req.handoverStatus === "rejected" ? "mt-1 border-red-200 bg-red-50 text-red-700"
                                : "mt-1 border-amber-200 bg-amber-50 text-amber-700"
                              }>
                                Handover {req.handoverStatus ?? "pending"}
                              </Badge>
                            </div>
                          )}
                          {req.hrConfirmedAt && (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">HR Confirmed</p>
                              <p className="mt-1 text-sm text-slate-700">{formatDateLabel(req.hrConfirmedAt)}</p>
                              {req.hrConfirmedBy && <p className="text-xs text-slate-500">by {req.hrConfirmedBy.name}</p>}
                            </div>
                          )}
                          {req.approvalDate && (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Approval Date</p>
                              <p className="mt-1 text-sm font-semibold text-emerald-700">{formatDateLabel(req.approvalDate)}</p>
                            </div>
                          )}
                          {req.reviewNote && (
                            <div className="sm:col-span-2 lg:col-span-3">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Review Note</p>
                              <p className="mt-1 text-sm text-slate-600">{req.reviewNote}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {searchNeedle ? "No leave requests match the current search." : "No leave requests yet. Click \"Apply Leave\" to create one."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
