"use client";

import { Briefcase, ChevronDown, ChevronUp, Loader2, Plus, Save } from "lucide-react";
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
  HrApplicant,
  HrApplicantFormState,
  HrJobFormState,
  HrJobOpening,
} from "../types";
import {
  APPLICANT_STAGE_LABELS,
  HR_STORE_OPTIONS as STORE_OPTIONS,
} from "../utils";

// ─── Recruitment Dialogs ──────────────────────────────────────────────────────

type JobDialogProps = {
  form: HrJobFormState;
  setForm: (v: HrJobFormState) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export function JobDialog({ form, setForm, saving, onClose, onSave }: JobDialogProps) {
  const set = <K extends keyof HrJobFormState>(key: K, val: HrJobFormState[K]) =>
    setForm({ ...form, [key]: val });

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-slate-200 bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-indigo-600" />
            Job Opening
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Job Title</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. EA, MIS, Sales EA, CRM, CRM Head, SM, Designer, PE" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Input value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="Sales, Operations…" />
            </div>
            <div className="space-y-1.5">
              <Label>Store / Branch</Label>
              <Select value={form.store || "__none__"} onValueChange={(v) => set("store", v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select store" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any / All</SelectItem>
                  {STORE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>No. of Openings</Label>
              <Input type="number" min={1} value={form.openings} onChange={(e) => set("openings", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v as HrJobFormState["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description / Requirements</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="Key responsibilities and requirements…" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || !form.title.trim()} onClick={() => void onSave()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Job Opening
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ApplicantDialogProps = {
  jobs: HrJobOpening[];
  form: HrApplicantFormState;
  setForm: (v: HrApplicantFormState) => void;
  existingApplicants: HrApplicant[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  onUpdateStage: (id: string, stage: HrApplicant["stage"]) => void | Promise<void>;
};

export function ApplicantDialog({ jobs, form, setForm, existingApplicants, saving, onClose, onSave, onUpdateStage }: ApplicantDialogProps) {
  const set = <K extends keyof HrApplicantFormState>(key: K, val: HrApplicantFormState[K]) =>
    setForm({ ...form, [key]: val });

  const STAGE_CLASS: Record<HrApplicant["stage"], string> = {
    applied: "border-slate-200 text-slate-600",
    screening: "border-blue-200 bg-blue-50 text-blue-700",
    interview: "border-violet-200 bg-violet-50 text-violet-700",
    offer: "border-amber-200 bg-amber-50 text-amber-700",
    joined: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rejected: "border-red-200 bg-red-50 text-red-700",
    on_hold: "border-orange-200 bg-orange-50 text-orange-700",
    terminated: "border-rose-200 bg-rose-50 text-rose-700",
  };

  const jobApplicants = existingApplicants.filter((a) => a.jobId === form.jobId);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-slate-200 bg-white p-0 sm:max-w-3xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-indigo-600" />
            Add Applicant
          </DialogTitle>
          <DialogDescription>Track applicants from initial screening to HR, HOD, and MD final round.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          <div className="space-y-1.5">
            <Label>Job Opening</Label>
            <Select value={form.jobId} onValueChange={(v) => { const j = jobs.find((j) => j.id === v); setForm({ ...form, jobId: v, jobTitle: j?.title || "" }); }}>
              <SelectTrigger><SelectValue placeholder="Select job…" /></SelectTrigger>
              <SelectContent>
                {jobs.filter((j) => j.status === "open").map((j) => <SelectItem key={j.id} value={j.id}>{j.title}{j.department ? ` — ${j.department}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Applicant name" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98765 43210" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="applicant@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Experience</Label>
              <Input value={form.experience} onChange={(e) => set("experience", e.target.value)} placeholder="2 years, Fresher…" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Assigned To</Label>
              <Input value={form.assignedOwner} onChange={(e) => set("assignedOwner", e.target.value)} placeholder="HR or recruiter name" />
            </div>
            <div className="space-y-1.5">
              <Label>Owner Type</Label>
              <Select value={form.assignedRole} onValueChange={(v) => set("assignedRole", v as HrApplicantFormState["assignedRole"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hr">HR</SelectItem>
                  <SelectItem value="recruiter">Recruiter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={form.stage} onValueChange={(v) => set("stage", v as HrApplicantFormState["stage"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(APPLICANT_STAGE_LABELS) as [HrApplicant["stage"], string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Deadline</Label>
              <Input type="date" value={form.deadlineAt} onChange={(e) => set("deadlineAt", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Interview notes, observations…" />
          </div>

          {jobApplicants.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <p className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pipeline ({jobApplicants.length} applicants)</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Experience</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead className="text-right">Move</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobApplicants.map((a) => {
                    const stages: HrApplicant["stage"][] = ["applied", "screening", "interview", "offer", "joined", "rejected"];
                    const currentIdx = stages.indexOf(a.stage);
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium text-sm">{a.name}</TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {a.assignedOwner || "-"}{a.assignedRole ? ` (${a.assignedRole === "recruiter" ? "Recruiter" : "HR"})` : ""}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{a.phone}</TableCell>
                        <TableCell className="text-xs text-slate-500">{a.experience || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STAGE_CLASS[a.stage]}>{APPLICANT_STAGE_LABELS[a.stage]}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{a.deadlineAt || "â€”"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {currentIdx > 0 && (
                              <button type="button" title="Move back" className="text-slate-400 hover:text-slate-600" onClick={() => void onUpdateStage(a.id, stages[currentIdx - 1])}>
                                <ChevronDown className="h-4 w-4" />
                              </button>
                            )}
                            {currentIdx < stages.length - 2 && (
                              <button type="button" title="Move forward" className="text-slate-400 hover:text-indigo-600" onClick={() => void onUpdateStage(a.id, stages[currentIdx + 1])}>
                                <ChevronUp className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || !form.name.trim() || !form.jobId} onClick={() => void onSave()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add Applicant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
