"use client";

import { AlertCircle, FileText, Loader2, Pencil, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatMonthLabel, hasSalaryConfig, updatedTimeLabel } from "../utils";
import type { HrWorkspaceTabsProps } from "./types";

type Props = Pick<
  HrWorkspaceTabsProps,
  | "payrollLoading"
  | "filteredPayrollRows"
  | "bulkGenerating"
  | "downloadingMonthSlips"
  | "onGeneratePendingPayroll"
  | "onDownloadMonthlySalarySlips"
  | "onOpenPayrollDialog"
  | "onOpenSalarySlip"
  | "selectedMonth"
  | "setSelectedMonth"
  | "attendanceRecords"
>;

export function PayrollTab({
  payrollLoading,
  filteredPayrollRows,
  bulkGenerating,
  downloadingMonthSlips,
  onGeneratePendingPayroll,
  onDownloadMonthlySalarySlips,
  onOpenPayrollDialog,
  onOpenSalarySlip,
  selectedMonth,
  setSelectedMonth,
  attendanceRecords,
}: Props) {
  const hasAttendance = attendanceRecords.length > 0;
  const hasGeneratedPayroll = filteredPayrollRows.some((r) => r.status === "generated");
  const selectedMonthLabel = formatMonthLabel(selectedMonth);

  return (
    <Card className="border-slate-200">
      <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <CardTitle className="text-base">Monthly Payroll</CardTitle>
          <CardDescription>
            Generate payroll, update attendance adjustments, and create printable salary slips for {selectedMonthLabel}.
          </CardDescription>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Payroll Month</span>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value || selectedMonth)}
              className="h-9 w-[170px]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void onGeneratePendingPayroll()}
              disabled={bulkGenerating || payrollLoading || !hasAttendance}
              title={!hasAttendance ? "Sync attendance first to generate payroll" : undefined}
            >
              {bulkGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Generate Payroll
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void onDownloadMonthlySalarySlips()}
              disabled={downloadingMonthSlips || payrollLoading || !hasGeneratedPayroll}
            >
              {downloadingMonthSlips ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Download Salary Slips
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {payrollLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !hasAttendance && !hasGeneratedPayroll ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
            <AlertCircle className="h-8 w-8 text-amber-500" />
            <p className="text-sm font-semibold text-amber-800">No Attendance Uploaded for This Month</p>
            <p className="max-w-sm text-xs text-amber-600">
              Payroll can only be generated for months where attendance data has been synced.
              Please sync biometric or add manual attendance for {selectedMonthLabel} first.
            </p>
          </div>
        ) : filteredPayrollRows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Paid Days</TableHead>
                <TableHead>Gross</TableHead>
                <TableHead>Net Pay</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayrollRows.map((row) => {
                const missingSalary = !hasSalaryConfig(row.employee);
                const hasEmployeeAttendance = attendanceRecords.some((r) => r.employeeId === row.employee.id);
                const canGenerate = !missingSalary && (hasEmployeeAttendance || row.status === "generated");
                return (
                  <TableRow key={row.employee.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{row.employee.name}</p>
                        <p className="text-xs text-muted-foreground">{row.employee.employeeCode || "No employee code"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.status === "generated"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : missingSalary
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                        }
                      >
                        {missingSalary ? "salary missing" : row.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.employee.department || "-"}</TableCell>
                    <TableCell>
                      {missingSalary
                        ? "-"
                        : `${row.record.paidDays}/${row.record.workingDays} (${row.record.paymentMode === "full_payment" ? "full" : "attendance"})`}
                    </TableCell>
                    <TableCell>{missingSalary ? "-" : formatCurrency(row.record.grossEarnings)}</TableCell>
                    <TableCell>{missingSalary ? "-" : formatCurrency(row.record.netPay)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.status === "generated" ? updatedTimeLabel(row.record.updatedAt) : "Draft only"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!canGenerate}
                          title={row.status === "generated" ? "Edit Payroll" : (!hasEmployeeAttendance ? "No attendance for this employee this month" : "Generate Payroll")}
                          className="w-8 h-8 p-0"
                          onClick={() => onOpenPayrollDialog(row.employee)}
                        >
                          {row.status === "generated" ? <Pencil className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!canGenerate}
                          title="Salary Slip"
                          className="w-8 h-8 p-0"
                          onClick={() => onOpenSalarySlip(row.employee, row.record)}
                        >
                          <Receipt className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No payroll records match the current search.</p>
        )}
      </CardContent>
    </Card>
  );
}
