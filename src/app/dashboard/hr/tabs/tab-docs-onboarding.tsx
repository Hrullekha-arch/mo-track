"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Download, Eye, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { HrEmployee } from "../types";
import {
  exportEmployeeRosterCsv,
  hasSalaryConfig,
  roleLabel,
} from "../utils";
import type { HrWorkspaceTabsProps } from "./types";

type DocsTabProps = Pick<
  HrWorkspaceTabsProps,
  | "usersLoading"
  | "activeEmployees"
  | "salaryConfiguredCount"
  | "onOpenEmployeeDialog"
>;

export function DocumentsTab({
  usersLoading,
  activeEmployees,
  salaryConfiguredCount,
  onOpenEmployeeDialog,
}: DocsTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const docStatus = (val?: string) => !!val?.trim();
  const bankReady = (e: HrEmployee) => docStatus(e.bankName) && docStatus(e.bankAccountNumber) && docStatus(e.bankIfsc);
  const uanEsiReady = (e: HrEmployee) => docStatus(e.uanNumber) || docStatus(e.esiNumber);
  const searchNeedle = searchTerm.trim().toLowerCase();
  const fullyReady = activeEmployees.filter(
    (e) => docStatus(e.panNumber) && docStatus(e.aadhaarNumber) && bankReady(e) && uanEsiReady(e)
  );
  const employeesMissingBank = activeEmployees.filter(
    (entry) => !entry.bankName || !entry.bankAccountNumber || !entry.bankIfsc
  );
  const employeesMissingCompliance = activeEmployees.filter(
    (entry) => !entry.panNumber || !entry.aadhaarNumber || (!entry.uanNumber && !entry.esiNumber)
  );

  const docCell = (ok: boolean) => (
    <Badge variant="outline" className={ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}>
      {ok ? "Ready" : "Missing"}
    </Badge>
  );
  const visibleEmployees = useMemo(
    () =>
      searchNeedle
        ? activeEmployees.filter((entry) =>
            [entry.name, entry.department, entry.role, entry.employeeCode, entry.biometricId, entry.panNumber, entry.aadhaarNumber]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(searchNeedle))
          )
        : activeEmployees,
    [activeEmployees, searchNeedle]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fully Ready</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{fullyReady.length}</p>
            <p className="mt-1 text-sm text-slate-500">PAN + Aadhaar + Bank + UAN/ESI all filled.</p>
          </CardContent>
        </Card>
        <Card className="border-rose-200 bg-rose-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Bank Gaps</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{employeesMissingBank.length}</p>
            <p className="mt-1 text-sm text-slate-500">Missing bank name, account, or IFSC.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Compliance Gaps</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{employeesMissingCompliance.length}</p>
            <p className="mt-1 text-sm text-slate-500">PAN, Aadhaar, or UAN/ESI required.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Salary Slip Safe</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{salaryConfiguredCount}</p>
            <p className="mt-1 text-sm text-slate-500">Salary template configured for payroll.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Full Document Status — All Employees</CardTitle>
            <CardDescription>Complete document checklist across every active employee.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => exportEmployeeRosterCsv(activeEmployees)}>
            <Download className="h-4 w-4" />
            Export Roster CSV
          </Button>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : (
            <div className="space-y-3">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search employee, dept, role, code, PAN..."
              className="max-w-sm"
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>PAN</TableHead>
                  <TableHead>Aadhaar</TableHead>
                  <TableHead>Bank Details</TableHead>
                  <TableHead>UAN / ESI</TableHead>
                  <TableHead>Salary Config</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleEmployees.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">{entry.department || roleLabel(entry)}</p>
                      </div>
                    </TableCell>
                    <TableCell>{docCell(docStatus(entry.panNumber))}</TableCell>
                    <TableCell>{docCell(docStatus(entry.aadhaarNumber))}</TableCell>
                    <TableCell>{docCell(bankReady(entry))}</TableCell>
                    <TableCell>{docCell(uanEsiReady(entry))}</TableCell>
                    <TableCell>{docCell(hasSalaryConfig(entry))}</TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="outline" size="sm" onClick={() => onOpenEmployeeDialog(entry)}>
                        Update
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!visibleEmployees.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">
                      No document rows match the current search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type OnboardingTabProps = Pick<
  HrWorkspaceTabsProps,
  | "usersLoading"
  | "activeEmployees"
  | "onOpenEmployeeDialog"
>;

export function OnboardingTab({ usersLoading, activeEmployees, onOpenEmployeeDialog }: OnboardingTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const checks = [
    { key: "joiningDate", label: "Joining Date", get: (e: HrEmployee) => !!e.joiningDate },
    { key: "employeeCode", label: "Employee Code", get: (e: HrEmployee) => !!e.employeeCode },
    { key: "department", label: "Department", get: (e: HrEmployee) => !!e.department },
    { key: "pan", label: "PAN", get: (e: HrEmployee) => !!e.panNumber },
    { key: "bank", label: "Bank Details", get: (e: HrEmployee) => !!(e.bankName && e.bankAccountNumber && e.bankIfsc) },
    { key: "salary", label: "Salary Config", get: (e: HrEmployee) => hasSalaryConfig(e) },
    { key: "manager", label: "Reporting Manager", get: (e: HrEmployee) => !!e.reportingManager },
  ];
  const getScore = (e: HrEmployee) => checks.filter((c) => c.get(e)).length;
  const searchNeedle = searchTerm.trim().toLowerCase();
  const sorted = [...activeEmployees]
    .filter((entry) =>
      !searchNeedle
        ? true
        : [entry.name, entry.department, entry.role, entry.employeeCode, entry.biometricId, entry.reportingManager]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(searchNeedle))
    )
    .sort((a, b) => getScore(a) - getScore(b));
  const ready = activeEmployees.filter((e) => getScore(e) === checks.length);
  const incomplete = activeEmployees.filter((e) => getScore(e) < checks.length);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fully Onboarded</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{ready.length}</p>
            <p className="mt-1 text-sm text-slate-500">All 7 onboarding fields complete.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pending</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{incomplete.length}</p>
            <p className="mt-1 text-sm text-slate-500">Profiles with at least one missing field.</p>
          </CardContent>
        </Card>
        <Card className="border-sky-200 bg-sky-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">No Joining Date</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{activeEmployees.filter((e) => !e.joiningDate).length}</p>
            <p className="mt-1 text-sm text-slate-500">Critical for payroll history and leave calculation.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">No Salary Config</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{activeEmployees.filter((e) => !hasSalaryConfig(e)).length}</p>
            <p className="mt-1 text-sm text-slate-500">Can&apos;t generate payroll without a template.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Onboarding Checklist — All Employees</CardTitle>
          <CardDescription>7-point checklist showing readiness per employee. Green = complete.</CardDescription>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : (
            <div className="space-y-3">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search employee, dept, role, code, manager..."
              className="max-w-sm"
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Progress</TableHead>
                  {checks.map((c) => <TableHead key={c.key} className="text-center text-xs">{c.label}</TableHead>)}
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((entry) => {
                  const score = getScore(entry);
                  const pct = Math.round((score / checks.length) * 100);
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{entry.name}</p>
                          <p className="text-xs text-muted-foreground">{roleLabel(entry)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-red-400")}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-slate-600">{pct}%</span>
                        </div>
                      </TableCell>
                      {checks.map((c) => (
                        <TableCell key={c.key} className="text-center">
                          {c.get(entry)
                            ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                            : <XCircle className="mx-auto h-4 w-4 text-red-400" />}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={() => onOpenEmployeeDialog(entry)}
                          className="group/btn flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-slate-500 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600 ml-auto"
                        >
                          {pct === 100
                            ? <Eye className="h-3.5 w-3.5 shrink-0" />
                            : <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />}
                          <span className="max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-medium transition-[max-width] duration-200 group-hover/btn:max-w-[56px]">
                            {pct === 100 ? "View" : "Complete"}
                          </span>
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!sorted.length && (
                  <TableRow>
                    <TableCell colSpan={checks.length + 3} className="py-8 text-center text-sm text-slate-500">
                      No onboarding rows match the current search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
