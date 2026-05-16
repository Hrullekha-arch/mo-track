"use client";

import { useMemo, useState } from "react";
import { Download, Pencil, Upload, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  buildSalaryTemplate,
  formatCurrency,
  formatDateLabel,
  getEmploymentStatus,
  getSalaryTemplateTotal,
  roleLabel,
} from "../utils";
import { downloadEmployeeTemplate } from "../utils/employee-import";
import { ImportEmployeesDialog } from "../dialogs/import-employees";
import type { HrEmployee } from "../types";
import type { HrWorkspaceTabsProps } from "./types";

type Props = Pick<
  HrWorkspaceTabsProps,
  | "usersLoading"
  | "filteredEmployees"
  | "onCreateManualEmployee"
  | "onOpenEmployeeDialog"
>;

export function EmployeesTab({ usersLoading, filteredEmployees, onCreateManualEmployee, onOpenEmployeeDialog }: Props) {
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [importOpen, setImportOpen] = useState(false);

  const employeeCounts = useMemo(() => {
    const active = filteredEmployees.filter((e) => getEmploymentStatus(e) !== "inactive").length;
    const inactive = filteredEmployees.filter((e) => getEmploymentStatus(e) === "inactive").length;
    return { all: filteredEmployees.length, active, inactive };
  }, [filteredEmployees]);

  const visibleEmployees = useMemo(() => {
    if (statusFilter === "inactive") return filteredEmployees.filter((e) => getEmploymentStatus(e) === "inactive");
    if (statusFilter === "active") return filteredEmployees.filter((e) => getEmploymentStatus(e) !== "inactive");
    return filteredEmployees;
  }, [filteredEmployees, statusFilter]);

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-base">Employee Master Details</CardTitle>
        <CardDescription>View and manage all employee profiles, KYC, bank, and salary details.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            {(["all", "active", "inactive"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === key ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                {key.charAt(0).toUpperCase() + key.slice(1)} ({employeeCounts[key]})
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={downloadEmployeeTemplate} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Download Template
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Import from Excel
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onCreateManualEmployee()} className="gap-1.5">
              <UserPlus className="h-3.5 w-3.5" />
              Add Single Employee
            </Button>
          </div>
        </div>

        {usersLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : visibleEmployees.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs font-semibold text-slate-600">Employee</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">Role / Designation</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">Department</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">Joining Date</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">Gross Salary</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleEmployees.map((entry) => {
                  const status = getEmploymentStatus(entry);
                  const gross = getSalaryTemplateTotal(buildSalaryTemplate(entry));
                  return (
                    <TableRow key={entry.id} className="hover:bg-slate-50/60">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700 border border-indigo-100">
                            {(entry.name || "?").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900 leading-tight">{entry.name}</p>
                            {entry.employeeCode && (
                              <p className="text-[11px] text-slate-400">{entry.employeeCode}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-slate-700">{roleLabel(entry)}</p>
                        {entry.designation && (
                          <p className="text-[11px] text-slate-400">{entry.designation}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-slate-700">{entry.department || "—"}</p>
                        {entry.store && (
                          <p className="text-[11px] text-slate-400">{entry.store}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {formatDateLabel(entry.joiningDate) || "—"}
                      </TableCell>
                      <TableCell>
                        {gross > 0 ? (
                          <span className="text-sm font-semibold text-indigo-700">{formatCurrency(gross)}</span>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0 capitalize",
                            status === "active" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                            status === "on_leave" && "border-amber-200 bg-amber-50 text-amber-700",
                            status === "inactive" && "border-slate-200 bg-slate-50 text-slate-500"
                          )}
                        >
                          {status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="w-8 h-8 p-0 text-slate-600 hover:text-indigo-700"
                          title="Edit Employee"
                          onClick={() => onOpenEmployeeDialog(entry)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">No employees match the current filter.</p>
        )}
      </CardContent>

      <ImportEmployeesDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => setImportOpen(false)}
      />
    </Card>
  );
}
