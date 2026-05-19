"use client";

import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Eye,
  Pencil,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Landmark,
  LogOut,
  ReceiptText,
  ShieldCheck,
  Star,
  TrendingUp,
  AlertTriangle,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { EmployeePerformanceRow } from "../types";
import { formatCurrency, formatMonthLabel } from "../utils";
import { getOnboardingProgress } from "../utils/onboarding-utils";
import type { HrWorkspaceTabsProps } from "./types";

type Props = Pick<
  HrWorkspaceTabsProps,
  | "usersLoading"
  | "users"
  | "activeEmployees"
  | "payrollEmployees"
  | "payrollLoading"
  | "payrollGeneratedCount"
  | "totalNetPayout"
  | "timesheetsLoading"
  | "submittedTodayCount"
  | "timesheetEligibleCount"
  | "performanceRows"
  | "leaveRequests"
  | "leaveRequestsLoading"
  | "attendanceRecords"
  | "attendanceLoading"
  | "exitRecords"
  | "exitRecordsLoading"
  | "letters"
  | "lettersLoading"
  | "loans"
  | "loansLoading"
  | "warnings"
  | "warningsLoading"
  | "expenseClaims"
  | "expenseClaimsLoading"
  | "rosterEntries"
  | "rosterLoading"
  | "appraisals"
  | "appraisalsLoading"
  | "increments"
  | "incrementsLoading"
  | "jobs"
  | "jobsLoading"
  | "applicants"
  | "setActiveTab"
  | "selectedMonth"
>;

export function OverviewTab({
  usersLoading,
  users,
  activeEmployees,
  payrollEmployees,
  payrollLoading,
  payrollGeneratedCount,
  totalNetPayout,
  timesheetsLoading,
  submittedTodayCount,
  timesheetEligibleCount,
  performanceRows,
  leaveRequests,
  leaveRequestsLoading,
  attendanceRecords,
  attendanceLoading,
  exitRecords,
  exitRecordsLoading,
  letters,
  lettersLoading,
  loans,
  loansLoading,
  warnings,
  warningsLoading,
  expenseClaims,
  expenseClaimsLoading,
  rosterEntries,
  rosterLoading,
  appraisals,
  appraisalsLoading,
  increments,
  incrementsLoading,
  jobs,
  jobsLoading,
  applicants,
  setActiveTab,
  selectedMonth,
}: Props) {
  const metricLabel = (loading: boolean, value: string) => (loading ? "Loading..." : value);
  const performanceLoading = attendanceLoading || timesheetsLoading;
  const excellentCount = performanceRows.filter((row: EmployeePerformanceRow) => row.band === "excellent").length;
  const followUpCount = performanceRows.filter((row: EmployeePerformanceRow) => row.band === "critical" || row.band === "watch").length;
  const averageScore = performanceRows.length
    ? Math.round(performanceRows.reduce((sum: number, row: EmployeePerformanceRow) => sum + row.score, 0) / performanceRows.length)
    : 0;

  const documentationRows = activeEmployees
    .filter(
      (entry) =>
        !entry.panNumber ||
        !entry.aadhaarNumber ||
        !entry.bankName ||
        !entry.bankAccountNumber ||
        !entry.bankIfsc ||
        (!entry.uanNumber && !entry.esiNumber)
    )
    .slice(0, 8);

  const employeesMissingOnboarding = activeEmployees.filter(
    (entry) => getOnboardingProgress(entry, { includeAutoManaged: true }).percent < 100
  );

  const moduleCards = [
    {
      label: "Employee Master",
      description: "Profiles, salary templates, and branch mapping.",
      value: `${activeEmployees.length} active`,
      status: "Live",
      tab: "employees",
      icon: FolderKanban,
      className: "border-slate-200 bg-white text-slate-700",
    },
    {
      label: "Payroll",
      description: "Monthly payroll generation and salary slips.",
      value: metricLabel(payrollLoading, `${payrollGeneratedCount} generated`),
      status: "Live",
      tab: "payroll",
      icon: WalletCards,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    {
      label: "Timesheets",
      description: "Daily duty submission tracking for tracked staff.",
      value: metricLabel(timesheetsLoading, `${submittedTodayCount}/${timesheetEligibleCount} today`),
      status: "Live",
      tab: "timesheets",
      icon: ClipboardList,
      className: "border-cyan-200 bg-cyan-50 text-cyan-700",
    },
    {
      label: "Performance",
      description: "Profile readiness, attendance, and payroll scoring.",
      value: metricLabel(performanceLoading, `${averageScore}/100 avg`),
      status: "Live",
      tab: "performance",
      icon: Activity,
      className: "border-violet-200 bg-violet-50 text-violet-700",
    },
    {
      label: "Leave Management",
      description: "Leave requests, balance tracking, and approval workflow.",
      value: metricLabel(leaveRequestsLoading, `${leaveRequests.filter((r) => r.status === "pending" || r.status === "handover_pending").length} pending`),
      status: "Live",
      tab: "leave",
      icon: CalendarDays,
      className: "border-amber-200 bg-amber-50 text-amber-700",
    },
    {
      label: "Attendance",
      description: "Biometric attendance sync, daily summary, and holiday calendar.",
      value: metricLabel(attendanceLoading, `${attendanceRecords.length} records`),
      status: "Live",
      tab: "attendance",
      icon: CheckCircle2,
      className: "border-teal-200 bg-teal-50 text-teal-700",
    },
    {
      label: "Documents & Compliance",
      description: "Statutory IDs, bank setup, and HR document status.",
      value: `${documentationRows.length} gaps`,
      status: "Live",
      tab: "documents",
      icon: ShieldCheck,
      className: "border-rose-200 bg-rose-50 text-rose-700",
    },
    {
      label: "Onboarding",
      description: "Required profile, working details, and KYC/bank readiness.",
      value: `${employeesMissingOnboarding.length} pending`,
      status: "Live",
      tab: "onboarding",
      icon: BadgeCheck,
      className: "border-sky-200 bg-sky-50 text-sky-700",
    },
    {
      label: "Exit & FnF",
      description: "Exit records, FnF settlement status, and clearance tracking.",
      value: metricLabel(exitRecordsLoading, `${exitRecords.length} records`),
      status: "Live",
      tab: "exit",
      icon: LogOut,
      className: "border-slate-300 bg-slate-50 text-slate-700",
    },
    {
      label: "Reports",
      description: "CSV exports, headcount analytics, and compliance coverage.",
      value: "0 exports",
      status: "Live",
      tab: "reports",
      icon: FileSpreadsheet,
      className: "border-indigo-200 bg-indigo-50 text-indigo-700",
    },
    {
      label: "Letters",
      description: "Offer, appointment, increment, experience, warning, NOC, termination letters.",
      value: metricLabel(lettersLoading, `${letters.length} letters`),
      status: "Live",
      tab: "letters",
      icon: FileText,
      className: "border-blue-200 bg-blue-50 text-blue-700",
    },
    {
      label: "Loans & Advances",
      description: "Employee salary advances and loans with EMI tracking.",
      value: metricLabel(loansLoading, `${loans.filter((l) => l.status === "active").length} active`),
      status: "Live",
      tab: "loans",
      icon: Landmark,
      className: "border-orange-200 bg-orange-50 text-orange-700",
    },
    {
      label: "Warnings",
      description: "Verbal, written, and final disciplinary warnings.",
      value: metricLabel(warningsLoading, `${warnings.length} issued`),
      status: "Live",
      tab: "warnings",
      icon: AlertTriangle,
      className: "border-red-200 bg-red-50 text-red-700",
    },
    {
      label: "Expense Claims",
      description: "Employee expense reimbursement requests and approval.",
      value: metricLabel(expenseClaimsLoading, `${expenseClaims.filter((c) => c.status === "pending").length} pending`),
      status: "Live",
      tab: "expenses",
      icon: ReceiptText,
      className: "border-purple-200 bg-purple-50 text-purple-700",
    },
    {
      label: "Roster",
      description: "Monthly shift assignment and scheduling.",
      value: metricLabel(rosterLoading, `${rosterEntries.length} entries`),
      status: "Live",
      tab: "roster",
      icon: CalendarDays,
      className: "border-pink-200 bg-pink-50 text-pink-700",
    },
    {
      label: "Appraisals",
      description: "Annual/periodic performance appraisals and ratings.",
      value: metricLabel(appraisalsLoading, `${appraisals.length} records`),
      status: "Live",
      tab: "appraisals",
      icon: Star,
      className: "border-yellow-200 bg-yellow-50 text-yellow-700",
    },
    {
      label: "Increments",
      description: "Salary increment history and approval records.",
      value: metricLabel(incrementsLoading, `${increments.length} records`),
      status: "Live",
      tab: "increments",
      icon: TrendingUp,
      className: "border-lime-200 bg-lime-50 text-lime-700",
    },
    {
      label: "Recruitment",
      description: "Job openings, applicant pipeline, and hiring workflow.",
      value: metricLabel(jobsLoading, `${jobs.filter((j) => j.status === "open").length} open`),
      status: "Live",
      tab: "recruitment",
      icon: Briefcase,
      className: "border-cyan-200 bg-cyan-50 text-cyan-700",
    },
  ];

  return (
    <div className="space-y-3">
      {usersLoading ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {/* Role Distribution */}
          <Card className="border-slate-200/90 bg-[linear-gradient(180deg,_#fcfdff_0%,_#f4f7fb_100%)] shadow-sm">
            <CardHeader className="pb-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">Role Distribution</CardTitle>
                  <CardDescription className="mt-0.5 text-xs">Headcount by function</CardDescription>
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-7 rounded-md px-2 text-xs text-slate-500 hover:text-slate-900" onClick={() => setActiveTab("employees")}>
                  View all
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-0">
              {(() => {
                const roles = [
                  { label: "Employees", value: users.filter((e) => e.role === "employee").length, color: "bg-indigo-500" },
                  { label: "Salesmen", value: users.filter((e) => e.role === "salesman").length, color: "bg-blue-500" },
                  { label: "Accounts", value: users.filter((e) => e.role === "Accounts").length, color: "bg-emerald-500" },
                  { label: "Purchase", value: users.filter((e) => e.role === "Purchase").length, color: "bg-amber-500" },
                  { label: "Installers", value: users.filter((e) => e.role === "installer").length, color: "bg-rose-500" },
                  { label: "HR", value: users.filter((e) => e.role === "Hr").length, color: "bg-violet-500" },
                ];
                const max = Math.max(...roles.map((r) => r.value), 1);
                return roles.map((item) => (
                  <div key={item.label} className="group/row flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs text-slate-600">{item.label}</span>
                    <div className="flex-1 rounded-full bg-slate-100 h-1.5">
                      <div className={cn("h-1.5 rounded-full transition-all", item.color)} style={{ width: `${(item.value / max) * 100}%` }} />
                    </div>
                    <span className="w-6 shrink-0 text-right text-xs font-semibold text-slate-700">{item.value}</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab("employees")}
                      title="View"
                      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Eye className="h-3.5 w-3.5 shrink-0" />
                      <span className="max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-medium transition-[max-width] duration-200 group-hover/row:max-w-[36px]">
                        View
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("employees")}
                      title="Update"
                      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600"
                    >
                      <Pencil className="h-3.5 w-3.5 shrink-0" />
                      <span className="max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-medium transition-[max-width] duration-200 group-hover/row:max-w-[48px]">
                        Update
                      </span>
                    </button>
                  </div>
                ));
              })()}
            </CardContent>
          </Card>

          {/* Payroll Snapshot */}
          <Card className="border-emerald-100 bg-[linear-gradient(180deg,_#fcfffd_0%,_#f1fbf6_100%)] shadow-sm">
            <CardHeader className="pb-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">Payroll Snapshot</CardTitle>
                  <CardDescription className="mt-0.5 text-xs">{formatMonthLabel(selectedMonth)} payout health</CardDescription>
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-7 rounded-md px-2 text-xs text-slate-500 hover:text-slate-900" onClick={() => setActiveTab("payroll")}>
                  View all
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              <div className="flex items-end justify-between rounded-lg bg-white/80 p-3 ring-1 ring-emerald-200">
                <div>
                  <p className="text-xs font-medium text-emerald-700">Net payout generated</p>
                  <p className="mt-0.5 text-2xl font-bold text-emerald-900">{payrollLoading ? "—" : formatCurrency(totalNetPayout)}</p>
                </div>
                <Badge className="border-0 bg-emerald-100 text-emerald-700">
                  {payrollLoading ? "Loading..." : `${payrollGeneratedCount} slips`}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/70 p-3 ring-1 ring-slate-200">
                <div>
                  <p className="text-xs font-medium text-slate-600">Pending drafts</p>
                  <p className="mt-0.5 text-2xl font-bold text-slate-900">
                    {payrollLoading ? "—" : Math.max(payrollEmployees.length - payrollGeneratedCount, 0)}
                  </p>
                </div>
                <Badge variant="outline" className="text-slate-500">
                  {payrollLoading ? "Loading..." : `of ${payrollEmployees.length}`}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400">
                Only salary-configured employees appear in payroll generation.
              </p>
            </CardContent>
          </Card>

          {/* Performance Snapshot */}
          <Card className="border-cyan-100 bg-[linear-gradient(180deg,_#fbfeff_0%,_#eef9fc_100%)] shadow-sm">
            <CardHeader className="pb-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">Performance Snapshot</CardTitle>
                  <CardDescription className="mt-0.5 text-xs">Readiness and discipline overview</CardDescription>
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-7 rounded-md px-2 text-xs text-slate-500 hover:text-slate-900" onClick={() => setActiveTab("performance")}>
                  View all
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              <div className="flex items-end justify-between rounded-lg bg-white/80 p-3 ring-1 ring-cyan-200">
                <div>
                  <p className="text-xs font-medium text-cyan-700">Average score</p>
                  <p className="mt-0.5 text-2xl font-bold text-cyan-900">
                    {performanceLoading ? "—" : <>{averageScore}<span className="text-sm font-normal text-cyan-600">/100</span></>}
                  </p>
                </div>
                <Activity className="h-6 w-6 text-cyan-400" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1 rounded-lg border border-slate-100 bg-white/80 p-3">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Top Performers</p>
                  </div>
                  <p className="text-xl font-bold text-slate-900">{performanceLoading ? "—" : excellentCount}</p>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border border-slate-100 bg-white/80 p-3">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Need Follow-up</p>
                  </div>
                  <p className="text-xl font-bold text-slate-900">{performanceLoading ? "—" : followUpCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">HRMS Modules</h2>
            <p className="mt-0.5 text-xs text-slate-500">People ops, compliance, payroll &amp; lifecycle — one workspace</p>
          </div>
          <Badge variant="outline" className="text-xs text-slate-500">{moduleCards.length} modules</Badge>
        </div>
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {moduleCards.map((module) => {
            const Icon = module.icon;
            return (
              <button
                key={module.label}
                type="button"
                onClick={() => setActiveTab(module.tab)}
                className="group flex items-start gap-3 rounded-xl border border-slate-200/80 bg-[linear-gradient(180deg,_#ffffff_0%,_#f6f8fb_100%)] p-3.5 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
              >
                <div className={cn("shrink-0 rounded-lg border p-2", module.className)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{module.label}</p>
                    <span className="shrink-0 text-[11px] font-semibold text-slate-500">{module.value}</span>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{module.description}</p>
                </div>
                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-600" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
