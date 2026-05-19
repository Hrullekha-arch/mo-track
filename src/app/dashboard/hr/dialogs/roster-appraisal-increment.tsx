"use client";

import { Loader2, Save, Star, TrendingUp } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  HrAppraisalFormState,
  HrEmployee,
  HrIncrementFormState,
  HrRosterFormState,
  HrShift,
} from "../types";
import {
  APPRAISAL_RATING_LABELS,
  DEFAULT_SHIFTS,
} from "../utils";

// ─── Roster Entry Dialog ──────────────────────────────────────────────────────

type RosterEntryDialogProps = {
  employees: HrEmployee[];
  form: HrRosterFormState;
  setForm: (v: HrRosterFormState) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export function RosterEntryDialog({ employees, form, setForm, saving, onClose, onSave }: RosterEntryDialogProps) {
  const set = <K extends keyof HrRosterFormState>(key: K, val: HrRosterFormState[K]) =>
    setForm({ ...form, [key]: val });

  const handleShiftSelect = (shift: HrShift) => {
    setForm({ ...form, shiftId: shift.id, shiftName: shift.name, shiftStart: shift.startTime, shiftEnd: shift.endTime });
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-slate-200 bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Shift</DialogTitle>
          <DialogDescription>Assign a shift to an employee for a specific date.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <Select value={form.employeeId} onValueChange={(v) => set("employeeId", v)}>
              <SelectTrigger><SelectValue placeholder="Select employee…" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}{e.store ? ` · ${e.store}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Shift</Label>
            <div className="grid grid-cols-3 gap-2">
              {DEFAULT_SHIFTS.map((shift) => (
                <button
                  key={shift.id}
                  type="button"
                  onClick={() => handleShiftSelect(shift)}
                  className={cn("rounded-xl border p-3 text-left text-sm transition", form.shiftId === shift.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-300")}
                >
                  <p className="font-semibold">{shift.name}</p>
                  {shift.startTime && <p className="text-xs opacity-70">{shift.startTime} – {shift.endTime}</p>}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Custom Start (optional)</Label>
              <Input type="time" value={form.shiftStart} onChange={(e) => set("shiftStart", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Custom End (optional)</Label>
              <Input type="time" value={form.shiftEnd} onChange={(e) => set("shiftEnd", e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || !form.employeeId || !form.date} onClick={() => void onSave()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Appraisal Dialog ─────────────────────────────────────────────────────────

type AppraisalDialogProps = {
  employee: HrEmployee | null;
  employees: HrEmployee[];
  form: HrAppraisalFormState;
  setForm: (v: HrAppraisalFormState) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export function AppraisalDialog({ employee, employees, form, setForm, saving, onClose, onSave }: AppraisalDialogProps) {
  const set = <K extends keyof HrAppraisalFormState>(key: K, val: HrAppraisalFormState[K]) =>
    setForm({ ...form, [key]: val });

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-slate-200 bg-white p-0 sm:max-w-2xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-400" />
            Performance Appraisal
          </DialogTitle>
          <DialogDescription>Conduct a formal appraisal. Employee can acknowledge after submission.</DialogDescription>
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
              <Label>Appraisal Period</Label>
              <Input value={form.period} onChange={(e) => set("period", e.target.value)} placeholder="e.g. 2026-H1, 2026-Q2" />
            </div>
            <div className="space-y-1.5">
              <Label>Overall Rating</Label>
              <div className="flex gap-2 pt-1">
                {[1, 2, 3, 4, 5].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => set("rating", String(r))}
                    className={cn("flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold transition",
                      Number(form.rating) === r ? "border-amber-400 bg-amber-400 text-white" : "border-slate-200 hover:border-amber-300"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">{APPRAISAL_RATING_LABELS[Number(form.rating)] || ""}</p>
            </div>
          </div>

          {[
            { key: "goals" as const, label: "Goals Set", placeholder: "What were the goals for this period?" },
            { key: "achievements" as const, label: "Achievements", placeholder: "Key accomplishments and milestones…" },
            { key: "areasOfImprovement" as const, label: "Areas of Improvement", placeholder: "What needs to be worked on?" },
            { key: "managerComments" as const, label: "Manager Comments", placeholder: "Overall assessment and feedback…" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Textarea value={form[key]} onChange={(e) => set(key, e.target.value)} rows={3} placeholder={placeholder} />
            </div>
          ))}
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || (!form.employeeId && !employee)} onClick={() => void onSave()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Submit Appraisal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Increment Dialog ─────────────────────────────────────────────────────────

type IncrementDialogProps = {
  employee: HrEmployee | null;
  employees: HrEmployee[];
  form: HrIncrementFormState;
  setForm: (v: HrIncrementFormState) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export function IncrementDialog({ employee, employees, form, setForm, saving, onClose, onSave }: IncrementDialogProps) {
  const set = <K extends keyof HrIncrementFormState>(key: K, val: HrIncrementFormState[K]) =>
    setForm({ ...form, [key]: val });

  const selectedEmp = employee || employees.find((e) => e.id === form.employeeId);
  const currentBasic = selectedEmp?.salaryBasic || 0;
  const newBasic = Number(form.newBasic) || 0;
  const diff = newBasic - currentBasic;
  const pct = currentBasic > 0 ? ((diff / currentBasic) * 100).toFixed(1) : "0";

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-slate-200 bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            Salary Increment
          </DialogTitle>
          <DialogDescription>Record a salary revision. This will update the employee's salary template.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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

          {currentBasic > 0 && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
              Current Basic: <span className="font-semibold">₹{currentBasic.toLocaleString("en-IN")}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>New Basic (₹)</Label>
              <Input type="number" value={form.newBasic} onChange={(e) => set("newBasic", e.target.value)} placeholder="New basic salary" />
            </div>
            <div className="space-y-1.5">
              <Label>Effective Date</Label>
              <Input type="date" value={form.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} />
            </div>
          </div>

          {newBasic > 0 && currentBasic > 0 && (
            <div className={cn("rounded-lg border px-3 py-2 text-sm", diff >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50")}>
              {diff >= 0 ? "Increment" : "Decrement"}: <span className="font-semibold">₹{Math.abs(diff).toLocaleString("en-IN")} ({pct}%)</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Annual appraisal, promotion, etc." />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || !newBasic || (!form.employeeId && !employee)} onClick={() => void onSave()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-2 h-4 w-4" />}
            Apply Increment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
