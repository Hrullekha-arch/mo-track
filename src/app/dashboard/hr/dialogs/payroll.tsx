"use client";

import { FileText, Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  HrEmployee,
  PayrollFormState,
  PayrollRecord,
} from "../types";
import {
  formatCurrency,
  formatDateLabel,
  formatMonthLabel,
  getAttendanceDays,
  roleLabel,
  COMPANY_LOGO_PATH,
  COMPANY_NAME,
} from "../utils";

type PayrollSetupDialogProps = {
  payrollDialogUser: HrEmployee | null;
  payrollForm: PayrollFormState | null;
  setPayrollForm: (value: PayrollFormState) => void;
  previewRecord: PayrollRecord | null;
  selectedMonth: string;
  savingPayroll: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

type SalarySlipDialogProps = {
  salarySlipRecord: PayrollRecord | null;
  salarySlipEmployee: HrEmployee | null;
  downloadingHistorySlips: boolean;
  onClose: () => void;
  onDownloadHistory: () => void | Promise<void>;
  onPrint: () => void;
};

export function PayrollSetupDialog({
  payrollDialogUser,
  payrollForm,
  setPayrollForm,
  previewRecord,
  selectedMonth,
  savingPayroll,
  onClose,
  onSave,
}: PayrollSetupDialogProps) {
  if (!payrollDialogUser || !payrollForm || !previewRecord) return null;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Payroll Setup</DialogTitle>
          <DialogDescription>
            Adjust attendance and variable components for {payrollDialogUser.name || "employee"} for {formatMonthLabel(selectedMonth)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Working Days</Label>
              <Input
                value={payrollForm.workingDays}
                onChange={(event) => setPayrollForm({ ...payrollForm, workingDays: event.target.value })}
                type="number"
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Week Off Days</Label>
              <Input
                value={payrollForm.weekOffDays}
                onChange={(event) => setPayrollForm({ ...payrollForm, weekOffDays: event.target.value })}
                type="number"
                min="0"
                step="0.5"
              />
            </div>
            <div className="space-y-2">
              <Label>Leave / LOP Days</Label>
              <Input
                value={payrollForm.leaveDays}
                onChange={(event) => setPayrollForm({ ...payrollForm, leaveDays: event.target.value })}
                type="number"
                min="0"
                step="0.5"
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Mode</Label>
              <Select
                value={payrollForm.paymentMode}
                onValueChange={(value) =>
                  setPayrollForm({
                    ...payrollForm,
                    paymentMode: value as PayrollFormState["paymentMode"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_payment">Full Payment</SelectItem>
                  <SelectItem value="prorated">Attendance Based</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Overtime Hours</Label>
              <Input
                value={payrollForm.overtimeHours}
                onChange={(event) => setPayrollForm({ ...payrollForm, overtimeHours: event.target.value })}
                type="number"
                min="0"
                step="0.5"
              />
            </div>
            <div className="space-y-2">
              <Label>Overtime Amount</Label>
              <Input
                value={payrollForm.overtimeAmount}
                onChange={(event) => setPayrollForm({ ...payrollForm, overtimeAmount: event.target.value })}
                type="number"
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Bonus</Label>
              <Input
                value={payrollForm.bonus}
                onChange={(event) => setPayrollForm({ ...payrollForm, bonus: event.target.value })}
                type="number"
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Incentive</Label>
              <Input
                value={payrollForm.incentive}
                onChange={(event) => setPayrollForm({ ...payrollForm, incentive: event.target.value })}
                type="number"
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Reimbursements</Label>
              <Input
                value={payrollForm.reimbursements}
                onChange={(event) => setPayrollForm({ ...payrollForm, reimbursements: event.target.value })}
                type="number"
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Other Deductions</Label>
              <Input
                value={payrollForm.otherDeductions}
                onChange={(event) => setPayrollForm({ ...payrollForm, otherDeductions: event.target.value })}
                type="number"
                min="0"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={payrollForm.notes}
              onChange={(event) => setPayrollForm({ ...payrollForm, notes: event.target.value })}
              placeholder="Add payroll note, attendance remark, or exception details"
            />
          </div>
          <Card className="border-slate-200 bg-slate-50">
            <CardContent className="grid gap-4 p-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Gross Earnings</p>
                <p className="mt-2 text-2xl font-bold">{formatCurrency(previewRecord.grossEarnings)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Deductions</p>
                <p className="mt-2 text-2xl font-bold">{formatCurrency(previewRecord.totalDeductions)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Net Pay</p>
                <p className="mt-2 text-2xl font-bold text-emerald-700">{formatCurrency(previewRecord.netPay)}</p>
              </div>
              <div className="md:col-span-3 rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Attendance Summary</p>
                <p className="mt-2 text-sm text-slate-700">
                  Working Days: <span className="font-medium">{previewRecord.workingDays}</span> | Week Off:{" "}
                  <span className="font-medium">{previewRecord.weekOffDays}</span> | Leave / LOP:{" "}
                  <span className="font-medium">{previewRecord.leaveDays}</span> | Payment Mode:{" "}
                  <span className="font-medium">
                    {previewRecord.paymentMode === "full_payment" ? "Full Payment" : "Attendance Based"}
                  </span>{" "}
                  | Paid Days: <span className="font-medium">{previewRecord.paidDays}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void onSave()} disabled={savingPayroll}>
            {savingPayroll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Payroll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SalarySlipDialog({
  salarySlipRecord,
  salarySlipEmployee,
  downloadingHistorySlips,
  onClose,
  onDownloadHistory,
  onPrint,
}: SalarySlipDialogProps) {
  if (!salarySlipRecord || !salarySlipEmployee) return null;

  const earningsRows = [
    { label: "Basic", value: salarySlipRecord.earnings.basic },
    { label: "HRA", value: salarySlipRecord.earnings.hra },
    { label: "Special Allowance", value: salarySlipRecord.earnings.specialAllowance },
    { label: "Other Allowance", value: salarySlipRecord.earnings.otherAllowance },
    { label: "Overtime", value: salarySlipRecord.overtimeAmount },
    { label: "Bonus", value: salarySlipRecord.bonus },
    { label: "Incentive", value: salarySlipRecord.incentive },
    { label: "Reimbursements", value: salarySlipRecord.reimbursements },
  ];

  const otherDeductionLabel = salarySlipEmployee.salaryOtherDeductionLabel?.trim() || "Other Deduction";
  const deductionRows = [
    { label: "Employee Provident Fund (EPF)", value: salarySlipRecord.deductions.pf, conditional: true },
    { label: "Health Insurance / ESI", value: salarySlipRecord.deductions.esi, conditional: true },
    { label: "Professional Tax (PT)", value: salarySlipRecord.deductions.professionalTax, conditional: true },
    { label: "TDS", value: salarySlipRecord.deductions.tds, conditional: true },
    { label: otherDeductionLabel, value: salarySlipRecord.deductions.otherDeduction, conditional: true },
    { label: "Other Deductions", value: salarySlipRecord.deductions.other, conditional: true },
  ].filter((row) => !row.conditional || row.value > 0);
  const attendanceDays = getAttendanceDays(salarySlipRecord);
  const hasUan = Boolean(salarySlipEmployee.uanNumber?.trim());
  const hasEsi = Boolean(salarySlipEmployee.esiNumber?.trim());
  const detailCards = [
    { label: "Bank Name", value: salarySlipEmployee.bankName || "-" },
    { label: "Account Number", value: salarySlipEmployee.bankAccountNumber || "-" },
    { label: "IFSC", value: salarySlipEmployee.bankIfsc || "-" },
    ...(hasUan || hasEsi
      ? [{
          label: hasUan && hasEsi ? "UAN / ESI" : hasUan ? "UAN (PF Number)" : "ESI Number",
          value: hasUan && hasEsi
            ? `${salarySlipEmployee.uanNumber} / ${salarySlipEmployee.esiNumber}`
            : hasUan
              ? salarySlipEmployee.uanNumber!
              : salarySlipEmployee.esiNumber!,
        }]
      : []),
  ];
  const attendanceSummaryItems = [
    { label: "Working Days", value: String(salarySlipRecord.workingDays) },
    { label: "Week Off", value: String(salarySlipRecord.weekOffDays) },
    { label: "Leave / LOP", value: String(salarySlipRecord.leaveDays) },
    { label: "LOP", value: String(salarySlipRecord.lopDays) },
    {
      label: "Payment Mode",
      value: salarySlipRecord.paymentMode === "full_payment" ? "Full Payment" : "Attendance Based",
    },
    { label: "Paid Days", value: String(salarySlipRecord.paidDays) },
  ];

  const getDetailValueClassName = (value: string) =>
    cn(
      "mt-3 font-semibold text-slate-950 leading-snug [overflow-wrap:anywhere] break-words",
      value.length > 28 ? "text-[13px] tracking-tight" : value.length > 18 ? "text-[15px]" : "text-base sm:text-[17px]"
    );

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(96vw,1400px)] max-w-none overflow-hidden border-slate-200 bg-white p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Salary Slip</DialogTitle>
          <DialogDescription>
            Printable salary slip for {salarySlipEmployee.name || "employee"} for {formatMonthLabel(salarySlipRecord.month)}.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(96vh-76px)] overflow-y-auto bg-slate-50/80 px-4 py-4 sm:px-6">
          <div className="mx-auto w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_28%),linear-gradient(135deg,_#ffffff_0%,_#f7fbff_100%)] px-5 py-6 sm:px-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
                    <img src={COMPANY_LOGO_PATH} alt="Company Logo" width={54} height={54} className="h-[54px] w-[54px] object-contain" />
                  </div>
                  <div className="space-y-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Payroll Statement</p>
                    <div>
                      <h3 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-[3rem] sm:leading-none">Salary Slip</h3>
                      <p className="mt-2.5 text-base text-slate-600">{formatMonthLabel(salarySlipRecord.month)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-[12px] font-semibold text-slate-700">
                        {salarySlipEmployee.employeeCode || "No employee code"}
                      </Badge>
                      <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-[12px] font-semibold text-slate-700">
                        {salarySlipEmployee.department || "No department"}
                      </Badge>
                      <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-700">
                        {roleLabel(salarySlipEmployee)}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="grid gap-2.5 text-sm text-slate-600 lg:min-w-[290px] lg:text-right">
                  <div>
                    <p className="text-[2rem] font-bold text-slate-950">{COMPANY_NAME}</p>
                    <p className="mt-1 text-[14px]">Printable payroll summary for employee records.</p>
                  </div>
                  <div className="grid gap-1 text-[14px]">
                    <p><span className="font-semibold text-slate-900">Employee:</span> {salarySlipEmployee.name}</p>
                    <p><span className="font-semibold text-slate-900">Joining Date:</span> {formatDateLabel(salarySlipEmployee.joiningDate)}</p>
                    <p><span className="font-semibold text-slate-900">Store:</span> {salarySlipEmployee.store || "-"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 border-b border-slate-100 px-5 py-5 sm:px-6 md:grid-cols-2 xl:grid-cols-4">
              <div className="min-h-[128px] rounded-[22px] border border-emerald-200 bg-emerald-50/50 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Net Pay</p>
                <p className="mt-4 text-[2rem] font-bold leading-none text-emerald-700 sm:text-[2.15rem]">{formatCurrency(salarySlipRecord.netPay)}</p>
                <p className="mt-3 text-sm text-slate-500">Amount payable</p>
              </div>
              <div className="min-h-[128px] rounded-[22px] border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Gross Earnings</p>
                <p className="mt-4 text-[2rem] font-bold leading-none text-slate-950 sm:text-[2.15rem]">{formatCurrency(salarySlipRecord.grossEarnings)}</p>
                <p className="mt-3 text-sm text-slate-500">Before deductions</p>
              </div>
              <div className="min-h-[128px] rounded-[22px] border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Total Deductions</p>
                <p className="mt-4 text-[2rem] font-bold leading-none text-slate-950 sm:text-[2.15rem]">{formatCurrency(salarySlipRecord.totalDeductions)}</p>
                <p className="mt-3 text-sm text-slate-500">PF, ESI, tax, and others</p>
              </div>
              <div className="min-h-[128px] rounded-[22px] border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Attendance</p>
                <p className="mt-4 text-[2rem] font-bold leading-none text-slate-950 sm:text-[2.15rem]">{attendanceDays}</p>
                <p className="mt-3 text-sm text-slate-500">Actual attendance days this month</p>
              </div>
            </div>

            <div className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[1.08fr_0.92fr]">
              <Card className="overflow-hidden rounded-[24px] border-slate-200 shadow-none">
                <CardHeader className="border-b border-slate-100 pb-3.5 pt-4.5">
                  <CardTitle className="text-[1.35rem] font-bold tracking-tight">Earnings Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Component</TableHead>
                        <TableHead className="py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {earningsRows.map((row) => (
                        <TableRow key={row.label}>
                          <TableCell className="py-3 text-[14px] text-slate-700">{row.label}</TableCell>
                          <TableCell className="py-3 text-right text-[14px] font-semibold text-slate-950">{formatCurrency(row.value)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="overflow-hidden rounded-[24px] border-slate-200 shadow-none">
                  <CardHeader className="border-b border-slate-100 pb-3.5 pt-4.5">
                    <CardTitle className="text-[1.35rem] font-bold tracking-tight">Deductions</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Component</TableHead>
                          <TableHead className="py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deductionRows.map((row) => (
                          <TableRow key={row.label}>
                            <TableCell className="py-3 text-[14px] text-slate-700">{row.label}</TableCell>
                            <TableCell className="py-3 text-right text-[14px] font-semibold text-slate-950">{formatCurrency(row.value)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card className="rounded-[24px] border-slate-200 shadow-none">
                  <CardHeader className="border-b border-slate-100 pb-3.5 pt-4.5">
                    <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Attendance Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 p-5 text-[14px] text-slate-600">
                    <div className="rounded-2xl bg-slate-50/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Attendance Days</p>
                      <p className="mt-2 text-[2rem] font-bold leading-none tracking-tight text-slate-950">{attendanceDays}</p>
                    </div>
                    <div className="space-y-2">
                      {attendanceSummaryItems.map((item) => (
                        <div key={item.label} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
                          <span className="font-semibold text-slate-900">{item.label}</span>
                          <span className="text-right text-slate-600">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="grid gap-4 border-t border-slate-100 px-5 py-5 sm:px-6 md:grid-cols-2 xl:grid-cols-4">
              {detailCards.map((card) => (
                <div key={card.label} className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-4.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{card.label}</p>
                  <p className={getDetailValueClassName(card.value)}>{card.value}</p>
                </div>
              ))}
            </div>

            {salarySlipRecord.notes ? (
              <div className="border-t border-slate-100 px-5 py-5 sm:px-6">
                <Card className="border-slate-200 bg-slate-50/70 shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Payroll Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 text-slate-600">{salarySlipRecord.notes}</p>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter className="border-t border-slate-200 bg-white px-5 py-3 sm:px-6">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="button" variant="outline" onClick={() => void onDownloadHistory()} disabled={downloadingHistorySlips}>
            {downloadingHistorySlips ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Download All Salary Slips
          </Button>
          <Button type="button" onClick={onPrint}>
            <FileText className="h-4 w-4" />
            Print Salary Slip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
