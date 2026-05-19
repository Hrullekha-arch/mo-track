"use client";

import { useState } from "react";
import { Loader2, Printer, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import type { HrEmployee, HrLetterFormState } from "../types";
import {
  COMPANY_NAME,
  COMPANY_LOGO_PATH,
  generateLetterBody,
  getHrLetterDepartmentLabel,
  getHrLetterRoleLabel,
  LETTER_TYPE_LABELS,
} from "../utils";

type LetterDialogProps = {
  employee: HrEmployee | null;
  employees: HrEmployee[];
  form: HrLetterFormState;
  setForm: (v: HrLetterFormState) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export function LetterDialog({
  employee,
  employees,
  form,
  setForm,
  saving,
  onClose,
  onSave,
}: LetterDialogProps) {
  const todayIso = new Date().toISOString().split("T")[0];
  const [letterDate, setLetterDate] = useState(todayIso);

  const selectedEmp =
    employee || employees.find((e) => e.id === form.employeeId);

  const autoFill = (
    type: HrLetterFormState["letterType"],
    emp: typeof selectedEmp,
    currentForm: HrLetterFormState
  ) => {
    if (!emp) return currentForm;
    return {
      ...currentForm,
      letterType: type,
      body: generateLetterBody(type, emp, currentForm),
      subject: LETTER_TYPE_LABELS[type] || type,
    };
  };

  const handleTypeChange = (v: string) => {
    const type = v as HrLetterFormState["letterType"];
    setForm(autoFill(type, selectedEmp, { ...form, letterType: type }));
  };

  const handleEmployeeChange = (v: string) => {
    const emp = employees.find((e) => e.id === v);
    setForm(autoFill(form.letterType, emp, { ...form, employeeId: v }));
  };

  const set = <K extends keyof HrLetterFormState>(
    key: K,
    val: HrLetterFormState[K]
  ) => setForm({ ...form, [key]: val });

  const displayDate = (() => {
    try {
      return new Date(`${letterDate}T00:00:00`).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch {
      return letterDate;
    }
  })();

  const refNum = selectedEmp
    ? `HR/${
        selectedEmp.employeeCode || selectedEmp.id.slice(-4).toUpperCase()
      }/${new Date(`${letterDate}T00:00:00`).getFullYear()}`
    : "HR/--/--";

  const handlePrint = () => {
    if (!selectedEmp) return;
    const win = window.open("", "_blank", "width=860,height=1200");
    if (!win) return;
    const logoUrl = `${window.location.origin}${COMPANY_LOGO_PATH}`;
    const isExperienceLetter = form.letterType === "experience";
    const roleLabel = getHrLetterRoleLabel(selectedEmp);
    const departmentLabel = getHrLetterDepartmentLabel(selectedEmp);
    const designationLine = roleLabel && roleLabel !== "your position"
      ? `<div class="detail">${roleLabel}</div>`
      : "";
    const departmentLine = departmentLabel && departmentLabel !== "your department"
      ? `<div class="detail">${departmentLabel}</div>`
      : "";

    const bodyHtml = form.body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${form.subject}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Times New Roman',Georgia,serif;background:#fff;color:#1a1a1a;font-size:11.5pt;line-height:1.9}
  .page{max-width:720px;margin:0 auto;padding:0 0 40px}

  /* ── Header ── */
  .lh-top{background:#1e3a5f;color:#fff;padding:22px 32px 18px;display:flex;align-items:center;justify-content:space-between;gap:20px}
  .lh-left{display:flex;align-items:center;gap:18px}
  .lh-logo-wrap{width:60px;height:60px;background:#fff;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:6px;flex-shrink:0}
  .lh-logo-wrap img{width:100%;height:100%;object-fit:contain}
  .lh-co-name{font-size:17pt;font-weight:800;letter-spacing:.04em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;line-height:1.1}
  .lh-co-sub{font-size:8.5pt;opacity:.75;font-family:Arial,sans-serif;margin-top:3px;letter-spacing:.04em}
  .lh-right{text-align:right;font-family:Arial,sans-serif;font-size:8.5pt;opacity:.85;line-height:1.7}
  .lh-accent{height:5px;background:linear-gradient(90deg,#f59e0b,#ef4444,#8b5cf6)}

  /* ── Ref / Date bar ── */
  .ref-bar{background:#f8fafc;border:1px solid #e2e8f0;border-top:none;padding:9px 32px;display:flex;justify-content:space-between;font-family:Arial,sans-serif;font-size:9pt;color:#475569;letter-spacing:.01em;margin-bottom:28px}
  .ref-bar strong{color:#1e3a5f}

  .body-wrap{padding:0 36px}

  /* ── To block ── */
  .to-block{margin-bottom:20px;font-size:11pt}
  .to-label{font-size:9pt;color:#64748b;font-family:Arial,sans-serif;margin-bottom:3px}
  .to-name{font-weight:700;font-size:13pt;color:#1a1a1a}
  .to-detail{font-size:10pt;color:#4b5563;margin-top:1px}

  /* ── Subject ── */
  .subject-row{display:flex;align-items:flex-start;gap:10px;margin-bottom:22px;padding:10px 14px;background:#f0f4ff;border-left:4px solid #1e3a5f;border-radius:0 4px 4px 0}
  .subject-label{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#1e3a5f;font-family:Arial,sans-serif;white-space:nowrap;margin-top:2px}
  .subject-text{font-weight:700;font-size:12.5pt;color:#1a1a1a}

  /* ── Body ── */
  .body-text{font-size:11pt;line-height:1.95;text-align:justify;color:#1a1a1a}

  /* ── Signature ── */
  .sig-block{margin-top:50px}
  .sig-line{width:200px;border-bottom:1.5px solid #334155;margin-bottom:8px;height:44px}
  .sig-name{font-weight:700;font-size:11pt;font-family:Arial,sans-serif;color:#1a1a1a}
  .sig-title{font-size:9.5pt;color:#475569;font-family:Arial,sans-serif;margin-top:1px}
  .sig-co{font-size:9pt;color:#1e3a5f;font-family:Arial,sans-serif;font-weight:600;margin-top:1px}

  /* ── Footer ── */
  .footer{margin-top:40px;padding:10px 36px 14px;border-top:1.5px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;font-family:Arial,sans-serif;font-size:8pt;color:#94a3b8}
  .footer-left{line-height:1.6}
  .footer-right{text-align:right;font-size:7.5pt;color:#cbd5e1}

  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{padding:0}
  }
</style>
</head><body><div class="page">

<!-- Header -->
<div class="lh-top">
  <div class="lh-left">
    <div class="lh-logo-wrap"><img src="${logoUrl}" alt="Logo"/></div>
    <div>
      <div class="lh-co-name">${COMPANY_NAME}</div>
      <div class="lh-co-sub">Human Resources Department</div>
    </div>
  </div>
  <div class="lh-right">
    Interior Design &amp; Décor Solutions<br/>
    www.modesigns.in &nbsp;|&nbsp; hr@modesigns.in
  </div>
</div>
<div class="lh-accent"></div>

<!-- Ref / Date -->
<div class="ref-bar">
  <span>Ref No: <strong>${refNum}</strong></span>
  <span>Date: <strong>${displayDate}</strong></span>
</div>

<div class="body-wrap">

<!-- To block -->
<div class="to-block">
  <div class="to-label">To,</div>
  <div class="to-name">${selectedEmp.name}</div>
  ${designationLine ? `<div class="to-detail">${designationLine.replace(/<[^>]+>/g, "")}</div>` : ""}
  ${departmentLine ? `<div class="to-detail">${departmentLine.replace(/<[^>]+>/g, "")}</div>` : ""}
</div>

<!-- Subject -->
<div class="subject-row">
  <div class="subject-label">Subject:</div>
  <div class="subject-text">${form.subject}</div>
</div>

<!-- Body -->
<div class="body-text">${bodyHtml}</div>

<!-- Signature -->
<div class="sig-block">
  <div class="sig-line"></div>
  <div class="sig-name">Authorised Signatory</div>
  <div class="sig-title">Human Resources</div>
  <div class="sig-co">${COMPANY_NAME}</div>
</div>

</div><!-- /body-wrap -->

<!-- Footer -->
<div class="footer">
  <div class="footer-left">
    MO Designs Pvt. Ltd. &nbsp;·&nbsp; Human Resources Department<br/>
    Confidential — For addressee only
  </div>
  <div class="footer-right">Generated via HR Workspace</div>
</div>

</div><script>window.onload=()=>{window.print();}</script></body></html>`);
    win.document.close();
  };

  const typeColors: Record<HrLetterFormState["letterType"], string> = {
    offer: "bg-emerald-100 text-emerald-800 border-emerald-300",
    appointment: "bg-blue-100 text-blue-800 border-blue-300",
    increment: "bg-violet-100 text-violet-800 border-violet-300",
    experience: "bg-amber-100 text-amber-800 border-amber-300",
    warning: "bg-red-100 text-red-800 border-red-300",
    noc: "bg-cyan-100 text-cyan-800 border-cyan-300",
    termination: "bg-rose-100 text-rose-800 border-rose-300",
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[96vh] overflow-hidden border-0 bg-slate-100 p-0 sm:max-w-[420px]">
        <div className="flex items-center justify-between border-b bg-white px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <img
                src={COMPANY_LOGO_PATH}
                alt={`${COMPANY_NAME} logo`}
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Generate HR Letter
              </p>
              <p className="text-xs text-slate-400">
                Type and employee auto-fills the template
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-slate-500"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              disabled={!form.body.trim() || !selectedEmp}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving || !form.body.trim() || !selectedEmp}
              onClick={() => void onSave()}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save Letter
            </Button>
          </div>
        </div>

        <div className="h-[calc(96vh-56px)] overflow-hidden">
          <div className="h-full overflow-y-auto bg-white px-5 py-5">
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  Letter Type
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(LETTER_TYPE_LABELS).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => handleTypeChange(k)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                        form.letterType === k
                          ? typeColors[k as HrLetterFormState["letterType"]]
                          : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {!employee && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">
                    Employee
                  </Label>
                  <Select
                    value={form.employeeId}
                    onValueChange={handleEmployeeChange}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select employee..." />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem
                          key={e.id}
                          value={e.id}
                          className="text-sm"
                        >
                          {e.name}
                          {e.department ? ` - ${e.department}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  Letter Details
                </p>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">
                    Letter Date
                  </Label>
                  <Input
                    type="date"
                    value={letterDate}
                    onChange={(e) => setLetterDate(e.target.value || todayIso)}
                    className="h-9 bg-white text-sm"
                  />
                  <p className="pl-0.5 text-[10px] text-slate-400">
                    Appears on the letterhead
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">
                    Effective / Joining Date
                  </Label>
                  <Input
                    type="date"
                    value={form.effectiveDate}
                    onChange={(e) => set("effectiveDate", e.target.value)}
                    className="h-9 bg-white text-sm"
                  />
                </div>
                {form.letterType === "increment" && (
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-600">
                      New Basic Salary (Rs)
                    </Label>
                    <Input
                      type="number"
                      value={form.newSalary}
                      onChange={(e) => set("newSalary", e.target.value)}
                      placeholder="e.g. 25000"
                      className="h-9 bg-white text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">
                  Subject Line
                </Label>
                <Input
                  value={form.subject}
                  onChange={(e) => set("subject", e.target.value)}
                  placeholder="Letter subject..."
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">
                  Letter Body
                </Label>
                <Textarea
                  value={form.body}
                  onChange={(e) => set("body", e.target.value)}
                  rows={14}
                  className="resize-none font-mono text-xs leading-relaxed"
                  placeholder={
                    selectedEmp
                      ? "Auto-filled - edit freely..."
                      : "Select an employee first..."
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
