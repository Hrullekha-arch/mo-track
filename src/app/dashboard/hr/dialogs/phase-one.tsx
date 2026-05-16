"use client";

import { useState } from "react";
import { Check, ChevronDown, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  HrBranchFormState,
  HrDepartmentFormState,
  HrDesignationFormState,
  HrEmployee,
  HrSelfServiceFormState,
} from "../types";
import {
  SELF_SERVICE_PRIORITY_LABELS,
  SELF_SERVICE_TYPE_LABELS,
} from "../utils";

type SelfServiceRequestDialogProps = {
  employees: HrEmployee[];
  form: HrSelfServiceFormState;
  setForm: (value: HrSelfServiceFormState) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export function SelfServiceRequestDialog({
  employees,
  form,
  setForm,
  saving,
  onClose,
  onSave,
}: SelfServiceRequestDialogProps) {
  const set = <K extends keyof HrSelfServiceFormState>(
    key: K,
    value: HrSelfServiceFormState[K]
  ) => setForm({ ...form, [key]: value });

  const [empOpen, setEmpOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const selectedEmp = employees.find((e) => e.id === form.employeeId);
  const filteredEmps = employees.filter((e) =>
    `${e.name} ${e.department ?? ""}`.toLowerCase().includes(empSearch.toLowerCase())
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Employee Self-Service Request</DialogTitle>
          <DialogDescription>
            Log employee requests for profile changes, attendance updates, documents, or HR help.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="relative space-y-2">
              <Label>Employee</Label>
              <button
                type="button"
                onClick={() => { setEmpOpen((o) => !o); setEmpSearch(""); }}
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <span className={selectedEmp ? "text-slate-900" : "text-muted-foreground"}>
                  {selectedEmp
                    ? `${selectedEmp.name}${selectedEmp.department ? ` — ${selectedEmp.department}` : ""}`
                    : "Select employee"}
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
                  <ul className="max-h-48 overflow-y-auto py-1">
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
            <div className="space-y-2">
              <Label>Request Type</Label>
              <Select
                value={form.requestType}
                onValueChange={(value) =>
                  set("requestType", value as HrSelfServiceFormState["requestType"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SELF_SERVICE_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder="Short request title"
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(value) =>
                  set("priority", value as HrSelfServiceFormState["priority"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SELF_SERVICE_PRIORITY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Details</Label>
            <Textarea
              value={form.details}
              onChange={(event) => set("details", event.target.value)}
              rows={6}
              placeholder="Describe the employee request and any context HR should review."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void onSave()}
              disabled={
                saving ||
                !form.employeeId ||
                !form.title.trim() ||
                !form.details.trim()
              }
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Request
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type DepartmentDialogProps = {
  employees: HrEmployee[];
  form: HrDepartmentFormState;
  setForm: (value: HrDepartmentFormState) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export function DepartmentDialog({
  employees,
  form,
  setForm,
  saving,
  onClose,
  onSave,
}: DepartmentDialogProps) {
  const set = <K extends keyof HrDepartmentFormState>(
    key: K,
    value: HrDepartmentFormState[K]
  ) => setForm({ ...form, [key]: value });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit Department" : "Add Department"}</DialogTitle>
          <DialogDescription>
            Manage department name, code, owner, and operating status.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Department Name</Label>
              <Input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Sales, MIS, Accounts" />
            </div>
            <div className="space-y-2">
              <Label>Department Code</Label>
              <Input value={form.code} onChange={(event) => set("code", event.target.value)} placeholder="MIS" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Department Head</Label>
              <Select value={form.managerId || "none"} onValueChange={(value) => set("managerId", value === "none" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No manager selected</SelectItem>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  set("status", value as HrDepartmentFormState["status"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              rows={4}
              placeholder="Optional notes about ownership, scope, or workflow."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void onSave()} disabled={saving || !form.name.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Department
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type DesignationDialogProps = {
  departments: string[];
  form: HrDesignationFormState;
  setForm: (value: HrDesignationFormState) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export function DesignationDialog({
  departments,
  form,
  setForm,
  saving,
  onClose,
  onSave,
}: DesignationDialogProps) {
  const set = <K extends keyof HrDesignationFormState>(
    key: K,
    value: HrDesignationFormState[K]
  ) => setForm({ ...form, [key]: value });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit Designation" : "Add Designation"}</DialogTitle>
          <DialogDescription>
            Create role titles aligned to department and grade level.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Designation Title</Label>
              <Input value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Senior MIS Executive" />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={form.department || "none"} onValueChange={(value) => set("department", value === "none" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No department selected</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department} value={department}>
                      {department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Level / Grade</Label>
              <Input value={form.level} onChange={(event) => set("level", event.target.value)} placeholder="L1, L2, Manager" />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  set("status", value as HrDesignationFormState["status"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              rows={4}
              placeholder="Optional notes about role scope and expectations."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void onSave()} disabled={saving || !form.title.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Designation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type BranchDialogProps = {
  employees: HrEmployee[];
  form: HrBranchFormState;
  setForm: (value: HrBranchFormState) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export function BranchDialog({
  employees,
  form,
  setForm,
  saving,
  onClose,
  onSave,
}: BranchDialogProps) {
  const set = <K extends keyof HrBranchFormState>(
    key: K,
    value: HrBranchFormState[K]
  ) => setForm({ ...form, [key]: value });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit Branch" : "Add Branch"}</DialogTitle>
          <DialogDescription>
            Configure branch code, location, and branch owner for HR operations.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Branch Name</Label>
              <Input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="MO GCR BRANCH" />
            </div>
            <div className="space-y-2">
              <Label>Branch Code</Label>
              <Input value={form.code} onChange={(event) => set("code", event.target.value)} placeholder="GCR" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={form.location} onChange={(event) => set("location", event.target.value)} placeholder="Gurugram, Delhi NCR" />
            </div>
            <div className="space-y-2">
              <Label>Branch Manager</Label>
              <Select value={form.managerId || "none"} onValueChange={(value) => set("managerId", value === "none" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No manager selected</SelectItem>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(value) =>
                set("status", value as HrBranchFormState["status"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void onSave()} disabled={saving || !form.name.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Branch
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
