"use client";

import { AlertTriangle, CheckCircle2, Plus, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EXPENSE_CATEGORY_LABELS,
  LETTER_TYPE_LABELS,
  WARNING_CATEGORY_LABELS,
  WARNING_SEVERITY_LABELS,
  formatCurrency,
  formatDateLabel,
  updatedTimeLabel,
} from "../utils";
import type { HrWorkspaceTabsProps } from "./types";

// ---- Letters Tab ----

type LettersTabProps = Pick<
  HrWorkspaceTabsProps,
  | "letters"
  | "lettersLoading"
  | "activeEmployees"
  | "onOpenLetterDialog"
>;

export function LettersTab({ letters, lettersLoading, activeEmployees, onOpenLetterDialog }: LettersTabProps) {
  return (
    <Card className="border-slate-200">
      <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <CardTitle className="text-base">HR Letters</CardTitle>
          <CardDescription>Offer letters, appointment letters, experience letters, increments, NOC, warnings, and termination.</CardDescription>
        </div>
        <Button type="button" variant="outline" onClick={() => onOpenLetterDialog(null)}>
          <Plus className="h-4 w-4" />
          Generate Letter
        </Button>
      </CardHeader>
      <CardContent>
        {lettersLoading ? (
          <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : letters.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Effective Date</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...letters].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).map((letter) => {
                const emp = activeEmployees.find((e) => e.id === letter.employeeId);
                return (
                  <TableRow key={letter.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{letter.employeeName}</p>
                        <p className="text-xs text-muted-foreground">{letter.department || letter.employeeCode || "-"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                        {LETTER_TYPE_LABELS[letter.letterType] || letter.letterType}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{letter.subject}</TableCell>
                    <TableCell className="text-sm">{formatDateLabel(letter.effectiveDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{updatedTimeLabel(letter.generatedAt)}</TableCell>
                    <TableCell className="text-right">
                      {emp && (
                        <Button type="button" variant="outline" size="sm" onClick={() => onOpenLetterDialog(emp)}>
                          New Letter
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No letters generated yet. Click &quot;Generate Letter&quot; to start.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Loans Tab ----

type LoansTabProps = Pick<
  HrWorkspaceTabsProps,
  | "loans"
  | "loansLoading"
  | "activeEmployees"
  | "onOpenLoanDialog"
>;

export function LoansTab({ loans, loansLoading, activeEmployees, onOpenLoanDialog }: LoansTabProps) {
  const activeLoans = loans.filter((l) => l.status === "active");
  const closedLoans = loans.filter((l) => l.status === "closed");
  const totalOutstanding = activeLoans.reduce((s, l) => s + l.remainingAmount, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-orange-200 bg-orange-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Active Loans</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{activeLoans.length}</p>
            <p className="mt-1 text-sm text-slate-500">Currently active salary advances or loans.</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Outstanding</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{formatCurrency(totalOutstanding)}</p>
            <p className="mt-1 text-sm text-slate-500">Total remaining balance across active loans.</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Closed</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{closedLoans.length}</p>
            <p className="mt-1 text-sm text-slate-500">Fully repaid loans and advances.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Employees with Loans</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{new Set(activeLoans.map((l) => l.employeeId)).size}</p>
            <p className="mt-1 text-sm text-slate-500">Unique employees with active loans.</p>
          </CardContent>
        </Card>
      </div>
      <Card className="border-slate-200">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Loan &amp; Advance Records</CardTitle>
            <CardDescription>Track disbursement, EMI, paid, and outstanding amounts.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeEmployees.slice(0, 3).map((emp) => (
              <Button key={emp.id} type="button" variant="outline" size="sm" onClick={() => onOpenLoanDialog(emp)}>
                {emp.name.split(" ")[0]}
              </Button>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenLoanDialog(activeEmployees[0])}>
              <Plus className="h-4 w-4" />
              Add Loan
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loansLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : loans.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>EMI/Month</TableHead>
                  <TableHead>Disbursed</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...loans].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((loan) => {
                  const emp = activeEmployees.find((e) => e.id === loan.employeeId);
                  return (
                    <TableRow key={loan.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{loan.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{loan.department || "-"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700 capitalize">
                          {loan.loanType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(loan.amount)}</TableCell>
                      <TableCell>{formatCurrency(loan.monthlyEmi)}</TableCell>
                      <TableCell className="text-sm">{formatDateLabel(loan.disbursedDate)}</TableCell>
                      <TableCell className="text-emerald-700">{formatCurrency(loan.paidAmount)}</TableCell>
                      <TableCell className={loan.status === "active" ? "font-semibold text-red-600" : "text-slate-400"}>{formatCurrency(loan.remainingAmount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={loan.status === "active" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                          {loan.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {emp && (
                          <Button type="button" variant="outline" size="sm" onClick={() => onOpenLoanDialog(emp)}>
                            Manage
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No loan records yet. Open an employee&apos;s loan dialog to add one.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Warnings Tab ----

type WarningsTabProps = Pick<
  HrWorkspaceTabsProps,
  | "warnings"
  | "warningsLoading"
  | "activeEmployees"
  | "onOpenWarningDialog"
>;

export function WarningsTab({ warnings, warningsLoading, activeEmployees, onOpenWarningDialog }: WarningsTabProps) {
  const verbalCount = warnings.filter((w) => w.severity === "verbal").length;
  const writtenCount = warnings.filter((w) => w.severity === "written").length;
  const finalCount = warnings.filter((w) => w.severity === "final").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total Warnings</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{warnings.length}</p>
            <p className="mt-1 text-sm text-slate-500">All issued disciplinary warnings.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Verbal</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{verbalCount}</p>
            <p className="mt-1 text-sm text-slate-500">Informal verbal warnings issued.</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Written</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{writtenCount}</p>
            <p className="mt-1 text-sm text-slate-500">Formal written warnings on record.</p>
          </CardContent>
        </Card>
        <Card className="border-rose-200 bg-rose-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Final Warnings</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{finalCount}</p>
            <p className="mt-1 text-sm text-slate-500">Last-chance warnings before termination.</p>
          </CardContent>
        </Card>
      </div>
      <Card className="border-slate-200">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Warning Records</CardTitle>
            <CardDescription>Disciplinary actions across attendance, conduct, performance, and policy violations.</CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => onOpenWarningDialog(activeEmployees[0])}>
            <AlertTriangle className="h-4 w-4" />
            Issue Warning
          </Button>
        </CardHeader>
        <CardContent>
          {warningsLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : warnings.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...warnings].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).map((warning) => {
                  const emp = activeEmployees.find((e) => e.id === warning.employeeId);
                  const severityClass = warning.severity === "final"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : warning.severity === "written"
                      ? "border-orange-200 bg-orange-50 text-orange-700"
                      : "border-amber-200 bg-amber-50 text-amber-700";
                  return (
                    <TableRow key={warning.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{warning.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{warning.department || "-"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={severityClass}>{WARNING_SEVERITY_LABELS[warning.severity]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-slate-200">{WARNING_CATEGORY_LABELS[warning.category]}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm">{warning.subject}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{updatedTimeLabel(warning.issuedAt)}</TableCell>
                      <TableCell className="text-right">
                        {emp && (
                          <Button type="button" variant="outline" size="sm" onClick={() => onOpenWarningDialog(emp)}>
                            New Warning
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No warnings on record. Click &quot;Issue Warning&quot; to add one.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Expenses Tab ----

type ExpensesTabProps = Pick<
  HrWorkspaceTabsProps,
  | "expenseClaims"
  | "expenseClaimsLoading"
  | "onOpenExpenseClaimDialog"
  | "onReviewExpenseClaim"
>;

export function ExpensesTab({ expenseClaims, expenseClaimsLoading, onOpenExpenseClaimDialog, onReviewExpenseClaim }: ExpensesTabProps) {
  const pendingClaims = expenseClaims.filter((c) => c.status === "pending");
  const approvedClaims = expenseClaims.filter((c) => c.status === "approved");
  const totalApproved = approvedClaims.reduce((s, c) => s + c.amount, 0);
  const totalPending = pendingClaims.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-purple-200 bg-purple-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pending Claims</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{pendingClaims.length}</p>
            <p className="mt-1 text-sm text-slate-500">Awaiting review or approval.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pending Amount</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{formatCurrency(totalPending)}</p>
            <p className="mt-1 text-sm text-slate-500">Total value of pending claims.</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Approved Total</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{formatCurrency(totalApproved)}</p>
            <p className="mt-1 text-sm text-slate-500">Total value approved for reimbursement.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total Claims</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{expenseClaims.length}</p>
            <p className="mt-1 text-sm text-slate-500">All submitted expense claims.</p>
          </CardContent>
        </Card>
      </div>
      <Card className="border-slate-200">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Expense Claims</CardTitle>
            <CardDescription>Travel, food, accommodation, equipment, and other reimbursement requests.</CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={onOpenExpenseClaimDialog}>
            <Plus className="h-4 w-4" />
            Submit Claim
          </Button>
        </CardHeader>
        <CardContent>
          {expenseClaimsLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : expenseClaims.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...expenseClaims].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{claim.employeeName}</p>
                        <p className="text-xs text-muted-foreground">{claim.department || "-"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700">
                        {EXPENSE_CATEGORY_LABELS[claim.category]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">{formatCurrency(claim.amount)}</TableCell>
                    <TableCell className="text-sm">{formatDateLabel(claim.date)}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm">{claim.description}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        claim.status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : claim.status === "rejected" ? "border-red-200 bg-red-50 text-red-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                      }>
                        {claim.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {claim.status === "pending" && (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                            title="Approve"
                            onClick={() => void onReviewExpenseClaim(claim.id, "approved")}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                            title="Reject"
                            onClick={() => void onReviewExpenseClaim(claim.id, "rejected")}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No expense claims yet. Click &quot;Submit Claim&quot; to add one.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
