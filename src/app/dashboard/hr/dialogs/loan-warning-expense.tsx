"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type {
  HrEmployee,
  HrExpenseClaimFormState,
  HrLoan,
  HrLoanFormState,
  HrWarning,
  HrWarningFormState,
} from "../types";
import {
  EXPENSE_CATEGORY_LABELS,
  WARNING_CATEGORY_LABELS,
  WARNING_SEVERITY_LABELS,
} from "../utils";

// ─── Loan & Advance Dialog ────────────────────────────────────────────────────

type LoanDialogProps = {
  employee: HrEmployee | null;
  employees: HrEmployee[];
  form: HrLoanFormState;
  setForm: (v: HrLoanFormState) => void;
  existingLoans: HrLoan[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  onMarkClosed: (id: string) => void | Promise<void>;
};

export function LoanDialog({ employee, employees, form, setForm, existingLoans, saving, onClose, onSave, onMarkClosed }: LoanDialogProps) {
  const set = <K extends keyof HrLoanFormState>(key: K, val: HrLoanFormState[K]) =>
    setForm({ ...form, [key]: val });

  const empId = employee?.id || form.employeeId;
  const empLoans = existingLoans.filter((l) => l.employeeId === empId);
  const amount = Number(form.amount) || 0;
  const emi = Number(form.monthlyEmi) || 0;
  const months = emi > 0 ? Math.ceil(amount / emi) : 0;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-slate-200 bg-white p-0 sm:max-w-2xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Loan & Salary Advance</DialogTitle>
          <DialogDescription>Record a loan or advance. EMI will auto-deduct from monthly payroll.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          {!employee && (
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <Select value={form.employeeId} onValueChange={(v) => set("employeeId", v)}>
                <SelectTrigger><SelectValue placeholder="Select employee…" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}{e.department ? ` — ${e.department}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.loanType} onValueChange={(v) => set("loanType", v as HrLoanFormState["loanType"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">Salary Advance</SelectItem>
                  <SelectItem value="loan">Employee Loan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Disbursed Date</Label>
              <Input type="date" value={form.disbursedDate} onChange={(e) => set("disbursedDate", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <Input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="e.g. 10000" />
            </div>
            <div className="space-y-1.5">
              <Label>Monthly EMI (₹)</Label>
              <Input type="number" value={form.monthlyEmi} onChange={(e) => set("monthlyEmi", e.target.value)} placeholder="e.g. 2000" />
            </div>
          </div>

          {amount > 0 && emi > 0 && (
            <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Repayment: <span className="font-semibold">{months} month{months !== 1 ? "s" : ""}</span> × ₹{emi.toLocaleString("en-IN")} = ₹{amount.toLocaleString("en-IN")}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Purpose of loan/advance…" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>

          {empLoans.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <p className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Existing Loans / Advances</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>EMI</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empLoans.map((loan) => (
                    <TableRow key={loan.id}>
                      <TableCell className="text-sm capitalize">{loan.loanType}</TableCell>
                      <TableCell className="text-sm font-medium">₹{loan.amount.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-sm">₹{loan.monthlyEmi.toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <span className={loan.remainingAmount > 0 ? "font-semibold text-amber-700" : "text-emerald-700"}>
                          ₹{loan.remainingAmount.toLocaleString("en-IN")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={loan.status === "active" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                          {loan.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {loan.status === "active" && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => void onMarkClosed(loan.id)}>
                            Mark Closed
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || !amount || !emi || (!form.employeeId && !employee)} onClick={() => void onSave()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Record {form.loanType === "advance" ? "Advance" : "Loan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Warning Dialog ───────────────────────────────────────────────────────────

type WarningDialogProps = {
  employee: HrEmployee | null;
  employees: HrEmployee[];
  form: HrWarningFormState;
  setForm: (v: HrWarningFormState) => void;
  existingWarnings: HrWarning[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
};

export function WarningDialog({ employee, employees, form, setForm, existingWarnings, saving, onClose, onSave, onDelete }: WarningDialogProps) {
  const set = <K extends keyof HrWarningFormState>(key: K, val: HrWarningFormState[K]) =>
    setForm({ ...form, [key]: val });

  const empId = employee?.id || form.employeeId;
  const empWarnings = existingWarnings.filter((w) => w.employeeId === empId);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-slate-200 bg-white p-0 sm:max-w-2xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Issue Warning / Disciplinary Action
          </DialogTitle>
          <DialogDescription>Issue a formal warning to an employee. This will be recorded in their HR file.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          {!employee && (
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <Select value={form.employeeId} onValueChange={(v) => set("employeeId", v)}>
                <SelectTrigger><SelectValue placeholder="Select employee…" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}{e.department ? ` — ${e.department}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v as HrWarningFormState["category"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(WARNING_CATEGORY_LABELS) as [HrWarningFormState["category"], string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={form.severity} onValueChange={(v) => set("severity", v as HrWarningFormState["severity"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(WARNING_SEVERITY_LABELS) as [HrWarningFormState["severity"], string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Brief subject of the warning…" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="Detailed description of the incident or behaviour…" />
          </div>

          {empWarnings.length > 0 && (
            <div className="rounded-xl border border-amber-100 overflow-hidden">
              <p className="bg-amber-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Warning History ({empWarnings.length})</p>
              <div className="divide-y">
                {empWarnings.map((w) => (
                  <div key={w.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={w.severity === "final" ? "border-red-200 bg-red-50 text-red-700" : w.severity === "written" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600"}>
                          {WARNING_SEVERITY_LABELS[w.severity]}
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 text-slate-600">{WARNING_CATEGORY_LABELS[w.category]}</Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-800">{w.subject}</p>
                      <p className="text-xs text-slate-400">{w.issuedAt ? new Date(w.issuedAt).toLocaleDateString("en-IN") : ""}</p>
                    </div>
                    <button type="button" className="text-slate-300 hover:text-red-500 shrink-0" onClick={() => void onDelete(w.id)}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || !form.subject.trim() || (!form.employeeId && !employee)} onClick={() => void onSave()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
            Issue Warning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Expense Claim Dialog ─────────────────────────────────────────────────────

type ExpenseClaimDialogProps = {
  employees: HrEmployee[];
  form: HrExpenseClaimFormState;
  setForm: (v: HrExpenseClaimFormState) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export function ExpenseClaimDialog({ employees, form, setForm, saving, onClose, onSave }: ExpenseClaimDialogProps) {
  const set = <K extends keyof HrExpenseClaimFormState>(key: K, val: HrExpenseClaimFormState[K]) =>
    setForm({ ...form, [key]: val });

  const [empOpen, setEmpOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const selectedEmp = employees.find((e) => e.id === form.employeeId);
  const filteredEmps = employees.filter((e) =>
    `${e.name} ${e.department ?? ""}`.toLowerCase().includes(empSearch.toLowerCase())
  );

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-slate-200 bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit Expense Claim</DialogTitle>
          <DialogDescription>Employee expense reimbursement request. HR will review and approve.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="relative space-y-1.5">
            <Label>Employee</Label>
            <button
              type="button"
              onClick={() => { setEmpOpen((o) => !o); setEmpSearch(""); }}
              className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <span className={selectedEmp ? "text-slate-900" : "text-muted-foreground"}>
                {selectedEmp
                  ? `${selectedEmp.name}${selectedEmp.department ? ` — ${selectedEmp.department}` : ""}`
                  : "Select employee…"}
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${empOpen ? "rotate-180" : ""}`} />
            </button>
            {empOpen && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-slate-200 bg-white shadow-lg">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                  <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input
                    autoFocus
                    type="text"
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    placeholder="Search employee…"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                  />
                </div>
                <ul className="max-h-52 overflow-y-auto py-1">
                  {filteredEmps.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-slate-400">No employee found.</li>
                  ) : filteredEmps.map((e) => (
                    <li
                      key={e.id}
                      onClick={() => { set("employeeId", e.id); setEmpOpen(false); setEmpSearch(""); }}
                      className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${form.employeeId === e.id ? "bg-indigo-50 text-indigo-700" : "text-slate-800"}`}
                    >
                      <Check className={`h-3.5 w-3.5 shrink-0 ${form.employeeId === e.id ? "opacity-100 text-indigo-600" : "opacity-0"}`} />
                      <span>{e.name}</span>
                      {e.department && <span className="ml-auto text-xs text-slate-400">{e.department}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v as HrExpenseClaimFormState["category"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(EXPENSE_CATEGORY_LABELS) as [HrExpenseClaimFormState["category"], string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Amount (₹)</Label>
            <Input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="e.g. 500" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="What was this expense for?" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || !form.employeeId || !form.amount || !form.description.trim()} onClick={() => void onSave()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Submit Claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
