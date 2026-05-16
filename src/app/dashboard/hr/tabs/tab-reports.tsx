"use client";

import { ArrowRight, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { HrEmployee } from "../types";
import {
  exportEmployeeRosterCsv,
  exportLeaveCsv,
  exportPayrollCsv,
  formatCurrency,
  formatMonthLabel,
} from "../utils";
import type { HrWorkspaceTabsProps } from "./types";

type Props = Pick<
  HrWorkspaceTabsProps,
  | "activeEmployees"
  | "payrollEmployees"
  | "payrollGeneratedCount"
  | "totalNetPayout"
  | "selectedMonth"
  | "leaveRequests"
  | "filteredPayrollRows"
  | "setActiveTab"
>;

export function ReportsTab({
  activeEmployees,
  payrollEmployees,
  payrollGeneratedCount,
  totalNetPayout,
  selectedMonth,
  leaveRequests,
  filteredPayrollRows,
  setActiveTab,
}: Props) {
  const deptMap: Record<string, number> = {};
  activeEmployees.forEach((e) => {
    const d = e.department || "Unassigned";
    deptMap[d] = (deptMap[d] || 0) + 1;
  });
  const deptEntries = Object.entries(deptMap).sort((a, b) => b[1] - a[1]);
  const maxDept = Math.max(...deptEntries.map((d) => d[1]), 1);

  const roleMap: Record<string, number> = {};
  activeEmployees.forEach((e) => { roleMap[e.role] = (roleMap[e.role] || 0) + 1; });

  const docStatus = (val?: string) => !!val?.trim();
  const bankReady = (e: HrEmployee) => docStatus(e.bankName) && docStatus(e.bankAccountNumber) && docStatus(e.bankIfsc);

  const compliancePct = activeEmployees.length
    ? Math.round((activeEmployees.filter((e) => docStatus(e.panNumber) && docStatus(e.aadhaarNumber)).length / activeEmployees.length) * 100)
    : 0;
  const bankPct = activeEmployees.length
    ? Math.round((activeEmployees.filter((e) => bankReady(e)).length / activeEmployees.length) * 100)
    : 0;
  const payrollCoverage = payrollEmployees.length
    ? Math.round((payrollGeneratedCount / payrollEmployees.length) * 100) : 0;

  const employeesMissingCompliance = activeEmployees.filter(
    (entry) => !entry.panNumber || !entry.aadhaarNumber || (!entry.uanNumber && !entry.esiNumber)
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-indigo-200 bg-indigo-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Net Payout</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{formatCurrency(totalNetPayout)}</p>
            <p className="mt-1 text-sm text-slate-500">{formatMonthLabel(selectedMonth)} payroll total.</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Payroll Coverage</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{payrollCoverage}%</p>
            <p className="mt-1 text-sm text-slate-500">{payrollGeneratedCount} of {payrollEmployees.length} salary-configured.</p>
          </CardContent>
        </Card>
        <Card className="border-cyan-200 bg-cyan-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Compliance Coverage</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{compliancePct}%</p>
            <p className="mt-1 text-sm text-slate-500">Employees with PAN + Aadhaar on record.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Bank Detail Coverage</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{bankPct}%</p>
            <p className="mt-1 text-sm text-slate-500">Employees with complete bank information.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Headcount by Department</CardTitle>
            <CardDescription>Active employee distribution across departments.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {deptEntries.map(([dept, count]) => (
              <div key={dept} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-700">{dept}</span>
                  <span className="text-slate-500">{count}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-400" style={{ width: `${(count / maxDept) * 100}%` }} />
                </div>
              </div>
            ))}
            {!deptEntries.length && <p className="text-sm text-muted-foreground">No department data yet.</p>}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Headcount by Role</CardTitle>
            <CardDescription>Active employee distribution across roles.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(roleMap).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                <span className="text-sm font-medium text-slate-700 capitalize">{role}</span>
                <Badge variant="outline" className="border-slate-200">{count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Download Reports</CardTitle>
          <CardDescription>Export HR data as CSV for payroll, compliance, leave, or employee roster.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Payroll Report",
              description: `${formatMonthLabel(selectedMonth)} — all employees, earnings, and deductions.`,
              action: () => exportPayrollCsv(filteredPayrollRows, selectedMonth),
              color: "border-indigo-200 bg-indigo-50/40",
            },
            {
              label: "Employee Roster",
              description: "All active employees with full HR master fields.",
              action: () => exportEmployeeRosterCsv(activeEmployees),
              color: "border-emerald-200 bg-emerald-50/40",
            },
            {
              label: "Leave Report",
              description: "All leave requests with status and review details.",
              action: () => exportLeaveCsv(leaveRequests),
              color: "border-amber-200 bg-amber-50/40",
            },
            {
              label: "Compliance Gaps",
              description: "Employees missing PAN, Aadhaar, bank, or UAN/ESI.",
              action: () => exportEmployeeRosterCsv(employeesMissingCompliance),
              color: "border-rose-200 bg-rose-50/40",
            },
          ].map((report) => (
            <button
              key={report.label}
              type="button"
              onClick={report.action}
              className={cn("rounded-2xl border p-5 text-left transition hover:shadow-sm", report.color)}
            >
              <Download className="h-5 w-5 text-slate-600" />
              <p className="mt-3 font-semibold text-slate-900">{report.label}</p>
              <p className="mt-1 text-sm text-slate-500">{report.description}</p>
              <p className="mt-3 text-xs font-medium text-slate-700">Download CSV →</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Quick Navigation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Payroll Snapshot", tab: "payroll" },
            { label: "Documentation Queue", tab: "documents" },
            { label: "Onboarding Queue", tab: "onboarding" },
            { label: "Performance Tracker", tab: "performance" },
          ].map((item) => (
            <Button key={item.tab} type="button" variant="outline" className="h-auto justify-between rounded-2xl p-4" onClick={() => setActiveTab(item.tab)}>
              {item.label}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
