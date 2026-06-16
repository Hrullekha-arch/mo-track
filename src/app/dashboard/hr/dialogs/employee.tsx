"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Camera, CheckCircle2, ChevronLeft, ChevronRight, Landmark, Loader2, Printer, Save, X } from "lucide-react";
import { openEmployeeFormPrintWindow } from "../print";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  EmployeeFormState,
  HrEmployee,
} from "../types";
import {
  HR_ROLE_OPTIONS,
  HR_STORE_OPTIONS,
} from "../utils";

type EmployeeDetailsDialogProps = {
  employeeDialogUser: HrEmployee | null;
  employeeForm: EmployeeFormState | null;
  setEmployeeForm: (value: EmployeeFormState) => void;
  savingEmployee: boolean;
  onClose: () => void;
  onSave: (options?: { keepOpen?: boolean }) => boolean | Promise<boolean>;
};

type EmployeeProfileStep = "hiring" | "compliance" | "salary" | "assets";

const EMPLOYEE_STEPS: Array<{
  id: EmployeeProfileStep;
  title: string;
  description: string;
}> = [
  { id: "hiring", title: "Hiring", description: "Basic identity, role, joining, and employment details." },
  { id: "compliance", title: "KYC / Documentation", description: "Identity documents, statutory IDs, and bank setup." },
  { id: "salary", title: "Salary & Contributions", description: "Earnings, PF, ESI, TDS, and deductions." },
  { id: "assets", title: "Assets", description: "Company assets, devices, and access issued to the employee." },
];

const formatShiftTime = (t: string) => {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr || "00";
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${suffix}`;
};

const parseAssetItems = (value?: string) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const compressPhoto = (file: File): Promise<string> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 240;
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });

export function EmployeeDetailsDialog({
  employeeDialogUser,
  employeeForm,
  setEmployeeForm,
  savingEmployee,
  onClose,
  onSave,
}: EmployeeDetailsDialogProps) {
  const [currentStep, setCurrentStep] = useState<EmployeeProfileStep>("hiring");
  const [ctcInput, setCtcInput] = useState("");
  const [ctcMode, setCtcMode] = useState<"monthly" | "annual">("monthly");
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!employeeDialogUser) return;
    setCurrentStep("hiring");
    setCtcInput("");
  }, [employeeDialogUser?.recordId]);

  const salaryTotals = useMemo(() => {
    const pf = employeeForm?.hasPf ? (Number(employeeForm.salaryPf) || 0) : 0;
    const esi = employeeForm?.hasHealthInsurance ? (Number(employeeForm.salaryEsi) || 0) : 0;
    const basic = Number(employeeForm?.salaryBasic || 0) || 0;
    const hra = Number(employeeForm?.salaryHra || 0) || 0;
    const specialAllowance = Number(employeeForm?.salarySpecialAllowance || 0) || 0;
    const otherAllowance = Number(employeeForm?.salaryOtherAllowance || 0) || 0;
    const professionalTax = Number(employeeForm?.salaryProfessionalTax || 0) || 0;
    const tds = Number(employeeForm?.salaryTds || 0) || 0;
    const otherDeduction = Number(employeeForm?.salaryOtherDeduction || 0) || 0;
    const gross = basic + hra + specialAllowance + otherAllowance;
    const deductions = pf + esi + professionalTax + tds + otherDeduction;
    return { gross, deductions, netEstimate: gross - deductions };
  }, [
    employeeForm?.hasPf, employeeForm?.hasHealthInsurance,
    employeeForm?.salaryBasic, employeeForm?.salaryEsi, employeeForm?.salaryHra,
    employeeForm?.salaryOtherAllowance, employeeForm?.salaryOtherDeduction,
    employeeForm?.salaryPf, employeeForm?.salaryProfessionalTax,
    employeeForm?.salarySpecialAllowance, employeeForm?.salaryTds,
  ]);

  const assetItems = useMemo(
    () => parseAssetItems(employeeForm?.issuedAssets),
    [employeeForm?.issuedAssets]
  );

  if (!employeeDialogUser || !employeeForm) return null;

  const calcPfFromBasic = (basic: number) => Math.min(Math.round(basic * 0.12), 1800);

  const applyCtc = () => {
    const raw = Number(ctcInput) || 0;
    if (!raw) return;
    const monthly = ctcMode === "annual" ? Math.round(raw / 12) : raw;
    const basic = Math.round(monthly * 0.5);
    const hra = Math.round(basic * 0.5);
    const special = monthly - basic - hra;
    const pfAmount = employeeForm.hasPf ? calcPfFromBasic(basic) : 0;
    setEmployeeForm({
      ...employeeForm,
      salaryBasic: String(basic),
      salaryHra: String(hra),
      salarySpecialAllowance: String(Math.max(special, 0)),
      salaryOtherAllowance: "0",
      salaryPf: String(pfAmount),
    });
  };

  const handleBasicChange = (value: string) => {
    const basic = Number(value) || 0;
    const updated: typeof employeeForm = { ...employeeForm, salaryBasic: value };
    if (employeeForm.hasPf) updated.salaryPf = String(calcPfFromBasic(basic));
    setEmployeeForm(updated);
  };

  const handlePfToggle = (checked: boolean) => {
    const basic = Number(employeeForm.salaryBasic) || 0;
    setEmployeeForm({
      ...employeeForm,
      hasPf: checked,
      salaryPf: checked ? String(calcPfFromBasic(basic)) : "0",
    });
  };

  const currentStepIndex = EMPLOYEE_STEPS.findIndex((step) => step.id === currentStep);
  const isFirstStep = currentStepIndex <= 0;
  const isLastStep = currentStepIndex === EMPLOYEE_STEPS.length - 1;

  const goToStep = (step: EmployeeProfileStep) => setCurrentStep(step);
  const goToNextStep = async () => {
    const next = EMPLOYEE_STEPS[currentStepIndex + 1];
    if (!next) return;
    const saved = await onSave({ keepOpen: true });
    if (saved) setCurrentStep(next.id);
  };
  const saveCurrentStep = async () => {
    await onSave({ keepOpen: true });
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-slate-200 bg-white p-0 sm:max-w-5xl">
        <DialogHeader>
          <div className="border-b border-slate-200 px-6 py-5">
            <DialogTitle className="text-2xl font-bold tracking-tight text-slate-950">Employee Details</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-slate-600">
              Maintain master data and salary template for {employeeDialogUser.name || "employee"}.
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="space-y-6 px-6 py-5">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      employeeDialogUser.hasLoginAccount
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-cyan-200 bg-cyan-50 text-cyan-700"
                    }
                  >
                    {employeeDialogUser.hasLoginAccount ? "Login Account Employee" : "Non-Login Employee"}
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                    {employeeForm.role || "employee"}
                  </Badge>
                  {employeeForm.employeeCode ? (
                    <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                      {employeeForm.employeeCode}
                    </Badge>
                  ) : null}
                  {employeeForm.biometricId ? (
                    <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">
                      Bio: {employeeForm.biometricId}
                    </Badge>
                  ) : null}
                  <Badge
                    variant="outline"
                    className={
                      employeeForm.timesheetEnabled
                        ? "border-violet-200 bg-violet-50 text-violet-700"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }
                  >
                    Timesheet {employeeForm.timesheetEnabled ? "On" : "Off"}
                  </Badge>
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-950">{employeeForm.name || "New Employee"}</p>
                  <p className="text-sm text-slate-600">
                    {employeeDialogUser.hasLoginAccount
                      ? "This employee already has app access. HR details here stay separate from login permissions."
                      : "This employee is managed fully by HR and does not need an app login."}
                  </p>
                </div>
              </div>
              <div className="grid min-w-[280px] gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Department</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{employeeForm.department || "Not set"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Store</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{employeeForm.store || "Not set"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 sm:col-span-2 lg:col-span-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Assets / Access</p>
                  {assetItems.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {assetItems.slice(0, 4).map((item) => (
                        <Badge key={item} variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">
                          {item}
                        </Badge>
                      ))}
                      {assetItems.length > 4 ? (
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                          +{assetItems.length - 4} more
                        </Badge>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-slate-900">Not defined</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {EMPLOYEE_STEPS.map((step, index) => {
                const isActive = step.id === currentStep;
                const isPassed = index < currentStepIndex;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => goToStep(step.id)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      isActive
                        ? "border-indigo-200 bg-indigo-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Step {index + 1}
                        </p>
                        <p className={`mt-1 text-sm font-semibold ${isActive ? "text-indigo-700" : "text-slate-900"}`}>
                          {step.title}
                        </p>
                      </div>
                      {isPassed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{step.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {currentStep === "hiring" ? (
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Basic Identity</p>
                    <p className="text-xs text-slate-500">Primary profile and branch information.</p>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const compressed = await compressPhoto(file);
                        setEmployeeForm({ ...employeeForm, photoUrl: compressed });
                        e.target.value = "";
                      }}
                    />
                    <div
                      className="relative flex h-24 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50 transition"
                      onClick={() => photoInputRef.current?.click()}
                      title="Upload employee photo"
                    >
                      {employeeForm.photoUrl ? (
                        <img src={employeeForm.photoUrl} alt="Employee" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-slate-400">
                          <Camera className="h-6 w-6" />
                          <span className="text-[10px] font-medium">Photo</span>
                        </div>
                      )}
                    </div>
                    {employeeForm.photoUrl ? (
                      <button
                        type="button"
                        onClick={() => setEmployeeForm({ ...employeeForm, photoUrl: "" })}
                        className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700"
                      >
                        <X className="h-3 w-3" /> Remove
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">Click to upload</span>
                    )}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Name</Label>
                    <Input
                      value={employeeForm.name}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, name: event.target.value })}
                      placeholder="Employee name"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      value={employeeForm.email}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })}
                      placeholder="Optional email"
                      disabled={employeeDialogUser.hasLoginAccount}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={employeeForm.phone}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, phone: event.target.value })}
                      placeholder="Mobile number"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={employeeForm.role}
                      onValueChange={(value) => setEmployeeForm({ ...employeeForm, role: value })}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {HR_ROLE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Store</Label>
                    <Select
                      value={employeeForm.store || undefined}
                      onValueChange={(value) => setEmployeeForm({ ...employeeForm, store: value })}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select store" />
                      </SelectTrigger>
                      <SelectContent>
                        {HR_STORE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-slate-900">Employment Details</p>
                  <p className="text-xs text-slate-500">Codes, department ownership, and status.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Employee Code / Biometric ID</Label>
                    <Input
                      value={employeeForm.employeeCode}
                      onChange={(event) =>
                        setEmployeeForm({ ...employeeForm, employeeCode: event.target.value, biometricId: event.target.value })
                      }
                      placeholder="1082"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Input
                      value={employeeForm.department}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, department: event.target.value })}
                      placeholder="Operations"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Designation</Label>
                    <Input
                      value={employeeForm.designation}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, designation: event.target.value })}
                      placeholder="Sr. Executive, Team Lead..."
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Reporting Manager</Label>
                    <Input
                      value={employeeForm.reportingManager}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, reportingManager: event.target.value })}
                      placeholder="Manager name"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Education Details</Label>
                    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-2">
                      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-sm font-semibold text-slate-900">10th</p>
                        <div className="space-y-2">
                          <Label>Board Name</Label>
                          <Input
                            value={employeeForm.tenthBoardName}
                            onChange={(event) => setEmployeeForm({ ...employeeForm, tenthBoardName: event.target.value })}
                            placeholder="CBSE, ICSE, BSEB..."
                            className="rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Marks / Percentage</Label>
                          <Input
                            value={employeeForm.tenthMarks}
                            onChange={(event) => setEmployeeForm({ ...employeeForm, tenthMarks: event.target.value })}
                            placeholder="78%, 8.2 CGPA..."
                            className="rounded-xl"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-sm font-semibold text-slate-900">12th</p>
                        <div className="space-y-2">
                          <Label>Board Name</Label>
                          <Input
                            value={employeeForm.twelfthBoardName}
                            onChange={(event) => setEmployeeForm({ ...employeeForm, twelfthBoardName: event.target.value })}
                            placeholder="CBSE, ISC, State Board..."
                            className="rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Marks / Percentage</Label>
                          <Input
                            value={employeeForm.twelfthMarks}
                            onChange={(event) => setEmployeeForm({ ...employeeForm, twelfthMarks: event.target.value })}
                            placeholder="82%, 7.9 CGPA..."
                            className="rounded-xl"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-sm font-semibold text-slate-900">Bachelor</p>
                        <div className="space-y-2">
                          <Label>University / Board</Label>
                          <Input
                            value={employeeForm.bachelorBoardName}
                            onChange={(event) => setEmployeeForm({ ...employeeForm, bachelorBoardName: event.target.value })}
                            placeholder="University name"
                            className="rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Marks / Percentage</Label>
                          <Input
                            value={employeeForm.bachelorMarks}
                            onChange={(event) => setEmployeeForm({ ...employeeForm, bachelorMarks: event.target.value })}
                            placeholder="68%, 7.1 CGPA..."
                            className="rounded-xl"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-sm font-semibold text-slate-900">Master</p>
                        <div className="space-y-2">
                          <Label>University / Board</Label>
                          <Input
                            value={employeeForm.masterBoardName}
                            onChange={(event) => setEmployeeForm({ ...employeeForm, masterBoardName: event.target.value })}
                            placeholder="University name"
                            className="rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Marks / Percentage</Label>
                          <Input
                            value={employeeForm.masterMarks}
                            onChange={(event) => setEmployeeForm({ ...employeeForm, masterMarks: event.target.value })}
                            placeholder="74%, 8.0 CGPA..."
                            className="rounded-xl"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Additional Qualification</Label>
                    <Input
                      value={employeeForm.additionalQualification}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, additionalQualification: event.target.value })}
                      placeholder="Diploma, ITI, Certification..."
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Previous Experience</Label>
                    <Select
                      value={employeeForm.experienceType}
                      onValueChange={(value) =>
                        setEmployeeForm({
                          ...employeeForm,
                          experienceType: value as EmployeeFormState["experienceType"],
                          experience:
                            value === "fresher" && employeeForm.experienceType !== "fresher" ? "" : employeeForm.experience,
                        })
                      }
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select experience type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fresher">Fresher</SelectItem>
                        <SelectItem value="experienced">Experienced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Experience Details</Label>
                    <Input
                      value={employeeForm.experience}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, experience: event.target.value })}
                      placeholder={
                        employeeForm.experienceType === "experienced"
                          ? "3 years at ABC Pvt Ltd as Sales Executive"
                          : "Optional note"
                      }
                      disabled={employeeForm.experienceType !== "experienced"}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="pr-4">
                        <Label className="text-sm font-medium text-slate-900">Timesheet Tracking</Label>
                        <p className="mt-1 text-xs text-slate-500">
                          Turn this on only for employees who must submit hourly timesheets to HR.
                        </p>
                      </div>
                      <Switch
                        checked={Boolean(employeeForm.timesheetEnabled)}
                        onCheckedChange={(checked) =>
                          setEmployeeForm({
                            ...employeeForm,
                            timesheetEnabled: checked,
                          })
                        }
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      {employeeForm.timesheetEnabled
                        ? `This employee will appear in the Timesheets page${employeeForm.workingTimeFrom && employeeForm.workingTimeTo ? ` with duty ${employeeForm.workingTimeFrom} - ${employeeForm.workingTimeTo}.` : "."}`
                        : "This employee will stay hidden from Timesheets tracking."}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Working Time From</Label>
                    <Select
                      value={employeeForm.workingTimeFrom || "none"}
                      onValueChange={(v) => setEmployeeForm({ ...employeeForm, workingTimeFrom: v === "none" ? "" : v })}
                    >
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select start time" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Not set —</SelectItem>
                        {["06:00","06:30","07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00"].map((t) => (
                          <SelectItem key={t} value={t}>{formatShiftTime(t)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Working Time To</Label>
                    <Select
                      value={employeeForm.workingTimeTo || "none"}
                      onValueChange={(v) => setEmployeeForm({ ...employeeForm, workingTimeTo: v === "none" ? "" : v })}
                    >
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select end time" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Not set —</SelectItem>
                        {["13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00","21:30","22:00","22:30","23:00","23:30"].map((t) => (
                          <SelectItem key={t} value={t}>{formatShiftTime(t)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Employment Status</Label>
                    <Select
                      value={employeeForm.employmentStatus}
                      onValueChange={(value) =>
                        setEmployeeForm({
                          ...employeeForm,
                          employmentStatus: value as EmployeeFormState["employmentStatus"],
                        })
                      }
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="on_leave">On Leave</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Joining Date</Label>
                    <Input
                      value={employeeForm.joiningDate}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, joiningDate: event.target.value })}
                      type="date"
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>
              </div>
            </div>
          ) : null}

          {currentStep === "compliance" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-slate-900">KYC / Identity Documents</p>
                  <p className="text-xs text-slate-500">Government-issued identity and address proof documents.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>PAN</Label>
                    <Input
                      value={employeeForm.panNumber}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, panNumber: event.target.value.toUpperCase() })}
                      placeholder="ABCDE1234F"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Aadhaar</Label>
                    <Input
                      value={employeeForm.aadhaarNumber}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, aadhaarNumber: event.target.value })}
                      placeholder="1234 5678 9012"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Driving Licence No.</Label>
                    <Input
                      value={employeeForm.drivingLicense}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, drivingLicense: event.target.value.toUpperCase() })}
                      placeholder="DL-1234567890123"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Voter ID</Label>
                    <Input
                      value={employeeForm.voterId}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, voterId: event.target.value.toUpperCase() })}
                      placeholder="ABC1234567"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Passport No.</Label>
                    <Input
                      value={employeeForm.passportNumber}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, passportNumber: event.target.value.toUpperCase() })}
                      placeholder="A1234567"
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-slate-900">Statutory & Bank</p>
                  <p className="text-xs text-slate-500">PF, ESI, medical insurance, and payout account details.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>UAN (PF Number)</Label>
                    <Input
                      value={employeeForm.uanNumber}
                      onChange={(event) => {
                        const val = event.target.value;
                        setEmployeeForm({
                          ...employeeForm,
                          uanNumber: val,
                          hasPf: val.trim().length > 0 ? true : employeeForm.hasPf,
                        });
                      }}
                      placeholder="Universal Account Number"
                      className="rounded-xl"
                    />
                    {employeeForm.uanNumber.trim() && (
                      <p className="text-[11px] text-emerald-600">PF deduction enabled in Salary step</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>ESI Number</Label>
                    <Input
                      value={employeeForm.esiNumber}
                      onChange={(event) => {
                        const val = event.target.value;
                        setEmployeeForm({
                          ...employeeForm,
                          esiNumber: val,
                          hasHealthInsurance: val.trim().length > 0 ? true : employeeForm.hasHealthInsurance,
                        });
                      }}
                      placeholder="ESI ID"
                      className="rounded-xl"
                    />
                    {employeeForm.esiNumber.trim() && (
                      <p className="text-[11px] text-emerald-600">Health Insurance deduction enabled in Salary step</p>
                    )}
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Medical Insurance</Label>
                    <Input
                      value={employeeForm.medicalInsurance}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, medicalInsurance: event.target.value })}
                      placeholder="Provider, policy number, or insured status"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Bank Name</Label>
                    <Input
                      value={employeeForm.bankName}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, bankName: event.target.value })}
                      placeholder="Bank name"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Number</Label>
                    <Input
                      value={employeeForm.bankAccountNumber}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, bankAccountNumber: event.target.value })}
                      placeholder="Bank account number"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>IFSC</Label>
                    <Input
                      value={employeeForm.bankIfsc}
                      onChange={(event) => setEmployeeForm({ ...employeeForm, bankIfsc: event.target.value.toUpperCase() })}
                      placeholder="IFSC code"
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>

              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-sm font-semibold text-slate-900">KYC Checklist</p>
                  <div className="mt-4 space-y-3 text-sm text-slate-600">
                    {[
                      { label: "PAN", value: employeeForm.panNumber },
                      { label: "Aadhaar", value: employeeForm.aadhaarNumber },
                      { label: "Driving Licence", value: employeeForm.drivingLicense },
                      { label: "Voter ID", value: employeeForm.voterId },
                      { label: "Passport", value: employeeForm.passportNumber },
                      { label: "UAN (PF)", value: employeeForm.uanNumber },
                      { label: "ESI Number", value: employeeForm.esiNumber },
                      { label: "Medical Insurance", value: employeeForm.medicalInsurance },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                        <span>{item.label}</span>
                        <span className={item.value?.trim() ? "text-emerald-600" : "text-slate-400"}>{item.value?.trim() ? "Added" : "Pending"}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                      <span>Bank Setup</span>
                      <span className={employeeForm.bankName && employeeForm.bankAccountNumber && employeeForm.bankIfsc ? "text-emerald-600" : "text-slate-400"}>
                        {employeeForm.bankName && employeeForm.bankAccountNumber && employeeForm.bankIfsc ? "Ready" : "Pending"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {currentStep === "salary" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-indigo-600" />
                    <div>
                      <p className="text-sm font-semibold text-indigo-900">CTC Auto-Calculate</p>
                      <p className="text-xs text-indigo-600">Enter CTC to fill all salary components automatically.</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex rounded-xl border border-indigo-200 bg-white overflow-hidden text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setCtcMode("monthly")}
                        className={`px-3 py-2 transition-colors ${ctcMode === "monthly" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-indigo-50"}`}
                      >
                        Monthly
                      </button>
                      <button
                        type="button"
                        onClick={() => setCtcMode("annual")}
                        className={`px-3 py-2 transition-colors ${ctcMode === "annual" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-indigo-50"}`}
                      >
                        Annual
                      </button>
                    </div>
                    <div className="flex-1 min-w-[160px] space-y-1">
                      <Label className="text-xs text-indigo-700">{ctcMode === "annual" ? "Annual CTC (₹)" : "Monthly CTC / Gross (₹)"}</Label>
                      <Input
                        value={ctcInput}
                        onChange={(event) => setCtcInput(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") applyCtc(); }}
                        type="number"
                        min="0"
                        placeholder={ctcMode === "annual" ? "e.g. 360000" : "e.g. 30000"}
                        className="rounded-xl border-indigo-200 bg-white"
                      />
                    </div>
                    <Button type="button" onClick={applyCtc} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white">
                      Apply
                    </Button>
                  </div>
                  <p className="mt-3 text-[11px] text-indigo-500">
                    Formula: Basic = 50% · HRA = 50% of Basic · Special Allowance = Remaining
                    {employeeForm.hasPf ? " · PF = 12% of Basic (max ₹1,800)" : ""}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-slate-500" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Salary Earnings</p>
                      <p className="text-xs text-slate-500">Set the monthly earning structure first.</p>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Basic Salary</Label>
                      <Input value={employeeForm.salaryBasic} onChange={(event) => handleBasicChange(event.target.value)} type="number" min="0" className="rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>HRA</Label>
                      <Input value={employeeForm.salaryHra} onChange={(event) => setEmployeeForm({ ...employeeForm, salaryHra: event.target.value })} type="number" min="0" className="rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>Special Allowance</Label>
                      <Input value={employeeForm.salarySpecialAllowance} onChange={(event) => setEmployeeForm({ ...employeeForm, salarySpecialAllowance: event.target.value })} type="number" min="0" className="rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>Other Allowance</Label>
                      <Input value={employeeForm.salaryOtherAllowance} onChange={(event) => setEmployeeForm({ ...employeeForm, salaryOtherAllowance: event.target.value })} type="number" min="0" className="rounded-xl" />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-slate-900">Contributions & Deductions</p>
                    <p className="text-xs text-slate-500">Enable each deduction that applies to this employee.</p>
                  </div>
                  <div className="mb-4 grid gap-3 md:grid-cols-2">
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">Employee PF (EPF)</p>
                        <p className="text-xs text-slate-500">Provident Fund deduction applies</p>
                      </div>
                      <Switch
                        checked={employeeForm.hasPf}
                        onCheckedChange={handlePfToggle}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">Health Insurance / ESI</p>
                        <p className="text-xs text-slate-500">ESI or group health cover applies</p>
                      </div>
                      <Switch
                        checked={employeeForm.hasHealthInsurance}
                        onCheckedChange={(checked) => setEmployeeForm({ ...employeeForm, hasHealthInsurance: checked })}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label className={!employeeForm.hasPf ? "text-slate-400" : undefined}>PF Amount</Label>
                        {employeeForm.hasPf && (
                          <span className="text-[11px] text-indigo-500 font-medium">12% of Basic (max ₹1,800)</span>
                        )}
                      </div>
                      <Input value={employeeForm.salaryPf} onChange={(event) => setEmployeeForm({ ...employeeForm, salaryPf: event.target.value })} type="number" min="0" className="rounded-xl" disabled={!employeeForm.hasPf} />
                    </div>
                    <div className="space-y-2">
                      <Label className={!employeeForm.hasHealthInsurance ? "text-slate-400" : undefined}>ESI / Health Insurance Amount</Label>
                      <Input value={employeeForm.salaryEsi} onChange={(event) => setEmployeeForm({ ...employeeForm, salaryEsi: event.target.value })} type="number" min="0" className="rounded-xl" disabled={!employeeForm.hasHealthInsurance} />
                    </div>
                    <div className="space-y-2">
                      <Label>Professional Tax</Label>
                      <Input value={employeeForm.salaryProfessionalTax} onChange={(event) => setEmployeeForm({ ...employeeForm, salaryProfessionalTax: event.target.value })} type="number" min="0" className="rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>TDS</Label>
                      <Input value={employeeForm.salaryTds} onChange={(event) => setEmployeeForm({ ...employeeForm, salaryTds: event.target.value })} type="number" min="0" className="rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>Other Deduction Label</Label>
                      <Input value={employeeForm.salaryOtherDeductionLabel} onChange={(event) => setEmployeeForm({ ...employeeForm, salaryOtherDeductionLabel: event.target.value })} placeholder="e.g. Canteen, Advance, Uniform..." className="rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>Other Deduction Amount</Label>
                      <Input value={employeeForm.salaryOtherDeduction} onChange={(event) => setEmployeeForm({ ...employeeForm, salaryOtherDeduction: event.target.value })} type="number" min="0" className="rounded-xl" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-sm font-semibold text-slate-900">Salary Preview</p>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Gross</p>
                      <p className="mt-1 text-2xl font-bold text-emerald-900">Rs. {salaryTotals.gross.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Total Deductions</p>
                      <p className="mt-1 text-2xl font-bold text-amber-900">Rs. {salaryTotals.deductions.toLocaleString("en-IN")}</p>
                      {salaryTotals.deductions > 0 && (
                        <div className="mt-2 space-y-1 border-t border-amber-200 pt-2 text-[11px] text-amber-700">
                          {employeeForm.hasPf && Number(employeeForm.salaryPf) > 0 && <p>PF: ₹{Number(employeeForm.salaryPf).toLocaleString("en-IN")}</p>}
                          {employeeForm.hasHealthInsurance && Number(employeeForm.salaryEsi) > 0 && <p>ESI: ₹{Number(employeeForm.salaryEsi).toLocaleString("en-IN")}</p>}
                          {Number(employeeForm.salaryProfessionalTax) > 0 && <p>Prof. Tax: ₹{Number(employeeForm.salaryProfessionalTax).toLocaleString("en-IN")}</p>}
                          {Number(employeeForm.salaryTds) > 0 && <p>TDS: ₹{Number(employeeForm.salaryTds).toLocaleString("en-IN")}</p>}
                          {Number(employeeForm.salaryOtherDeduction) > 0 && (
                            <p>{employeeForm.salaryOtherDeductionLabel.trim() || "Other"}: ₹{Number(employeeForm.salaryOtherDeduction).toLocaleString("en-IN")}</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Estimated Net</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">Rs. {Math.max(salaryTotals.netEstimate, 0).toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {currentStep === "assets" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-slate-900">Assets and Access Handover</p>
                    <p className="text-xs text-slate-500">
                      Add all company items issued at joining so the same list is available at exit and FnF handover time.
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label>Company Assets / Access Given</Label>
                        <span className={`text-xs font-medium ${employeeForm.issuedAssets ? "text-emerald-600" : "text-slate-400"}`}>
                          {employeeForm.issuedAssets ? "Already defined" : "Not added yet"}
                        </span>
                      </div>
                      <Textarea
                        value={employeeForm.issuedAssets}
                        onChange={(event) => setEmployeeForm({ ...employeeForm, issuedAssets: event.target.value })}
                        placeholder="Laptop, Mobile, Charger, Motorcycle, Tool Bag, Office Email, Access Card..."
                        rows={5}
                        className="rounded-xl"
                      />
                      <p className="text-xs text-slate-500">
                        Enter items separated by commas. Example for employee 1076: Laptop, Mobile, Charger. The same list will appear again in Exit & FnF.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Live Asset Preview</p>
                      {assetItems.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {assetItems.map((item) => (
                            <Badge key={item} variant="outline" className="border-cyan-200 bg-white text-cyan-700">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500">
                          No items added yet. Example: Laptop, Mobile, Charger, Motorcycle, Tool Bag.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-sm font-semibold text-slate-900">Assets Checklist</p>
                  <div className="mt-4 space-y-3 text-sm text-slate-600">
                    <div className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                      <span>Assets / Access</span>
                      <span className={assetItems.length ? "text-emerald-600" : "text-slate-400"}>
                        {assetItems.length ? `${assetItems.length} item${assetItems.length > 1 ? "s" : ""} added` : "Pending"}
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-100 px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Exit Handover Use</p>
                      <p className="mt-2 text-sm text-slate-600">
                        HR will use this same list later for collecting laptop, charger, mobile, motorcycle, tool bag, and other issued access before FnF settlement.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter className="border-t border-slate-200 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="mr-auto"
            onClick={() => openEmployeeFormPrintWindow(employeeDialogUser, employeeForm)}
            title="Print full employee registration form"
          >
            <Printer className="h-4 w-4" />
            Print Form
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {!isFirstStep ? (
            <Button type="button" variant="outline" onClick={() => goToStep(EMPLOYEE_STEPS[currentStepIndex - 1].id)}>
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => void saveCurrentStep()} disabled={savingEmployee}>
            {savingEmployee ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Step
          </Button>
          {isLastStep ? (
            <Button type="button" onClick={() => void onSave()} disabled={savingEmployee}>
              {savingEmployee ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Employee Details
            </Button>
          ) : (
            <Button type="button" onClick={() => void goToNextStep()} disabled={savingEmployee}>
              {savingEmployee ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              Save & Next
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
