import { format } from "date-fns";
import type { EmployeeFormState, HrEmployee, PayrollRecord } from "./types";
import {
  formatCurrency,
  formatDateLabel,
  formatMonthLabel,
  getAttendanceDays,
  roleLabel,
} from "./utils";

export const openSalarySlipPrintWindow = (employee: HrEmployee, record: PayrollRecord) => {
  const slipWindow = window.open("", "_blank", "width=1100,height=900");
  if (!slipWindow) {
    return false;
  }

  const logoUrl = `${window.location.origin}/logo.png`;
  const monthLabel = formatMonthLabel(record.month);
  const joiningDate = formatDateLabel(employee.joiningDate);
  const attendanceDays = getAttendanceDays(record);
  const paymentModeLabel = record.paymentMode === "full_payment" ? "Full Payment" : "Attendance Based";
  const generatedAt = format(new Date(), "dd MMM yyyy, hh:mm a");

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Salary Slip - ${employee.name}</title>
        <style>
          :root {
            --border: #d9e3ef;
            --line: #e7eef6;
            --ink: #020617;
            --muted: #64748b;
            --panel: #ffffff;
            --surface: #f8fbff;
            --success: #059669;
            --success-soft: #ecfdf5;
            --success-border: #a7f3d0;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #f1f5f9;
            color: var(--ink);
            font-family: "Segoe UI", Arial, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          h1, h2, h3, p { margin: 0; }
          .page {
            max-width: 1000px;
            margin: 0 auto;
            padding: 24px;
          }
          .sheet {
            background: var(--panel);
            border: 1px solid var(--border);
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 24px 60px rgba(15, 23, 42, 0.06);
          }
          .hero {
            padding: 20px 20px 18px;
            background:
              radial-gradient(circle at top right, rgba(16, 185, 129, 0.12), transparent 24%),
              linear-gradient(135deg, #ffffff 0%, #f7fbff 100%);
            border-bottom: 1px solid var(--border);
          }
          .header {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            align-items: flex-start;
          }
          .brand {
            display: flex;
            align-items: flex-start;
            gap: 14px;
          }
          .brand-mark {
            width: 68px;
            height: 68px;
            border-radius: 20px;
            border: 1px solid var(--border);
            background: white;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .brand-mark img {
            width: 44px;
            height: 44px;
            object-fit: contain;
          }
          .eyebrow {
            font-size: 11px;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            color: var(--muted);
            font-weight: 700;
          }
          .title {
            margin-top: 8px;
            font-size: 36px;
            line-height: 1;
            font-weight: 800;
          }
          .subtitle {
            margin-top: 10px;
            font-size: 14px;
            color: #475569;
          }
          .chips {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
          }
          .chip {
            display: inline-flex;
            align-items: center;
            border: 1px solid var(--border);
            border-radius: 999px;
            padding: 3px 10px;
            background: white;
            font-size: 12px;
            font-weight: 700;
            color: #0f172a;
          }
          .chip.role {
            border-color: var(--success-border);
            background: var(--success-soft);
            color: #0f766e;
          }
          .company {
            text-align: right;
            min-width: 260px;
          }
          .company h3 {
            font-size: 17px;
            font-weight: 800;
          }
          .company p {
            margin-top: 8px;
            color: #475569;
            font-size: 14px;
          }
          .company-meta {
            margin-top: 10px;
            font-size: 12px;
            line-height: 1.65;
            color: #0f172a;
          }
          .company-meta strong {
            font-weight: 700;
          }
          .content {
            padding: 16px 18px 20px;
          }
          .metric-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 14px;
          }
          .metric-card,
          .table-card,
          .summary-card,
          .bank-card,
          .note-card {
            border: 1px solid var(--border);
            border-radius: 16px;
            background: var(--panel);
          }
          .metric-card {
            padding: 16px 14px;
            min-height: 112px;
          }
          .metric-card .label,
          .bank-card .label,
          .note-card .label {
            font-size: 11px;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.14em;
            font-weight: 700;
          }
          .metric-card .value {
            margin-top: 10px;
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
          }
          .metric-card .value.success {
            color: var(--success);
            font-size: 18px;
          }
          .metric-card .description {
            margin-top: 8px;
            font-size: 13px;
            color: #64748b;
            line-height: 1.45;
          }
          .section-grid {
            display: grid;
            grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr);
            gap: 16px;
            margin-top: 18px;
          }
          .table-card h3 {
            padding: 14px 14px 12px;
            font-size: 18px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          th, td {
            padding: 10px 14px;
            border-top: 1px solid var(--line);
            text-align: left;
            font-size: 14px;
          }
          th {
            color: var(--muted);
            font-size: 12px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-weight: 700;
          }
          td:last-child, th:last-child {
            text-align: right;
            font-weight: 700;
            white-space: nowrap;
          }
          .summary-card {
            margin-top: 14px;
            overflow: hidden;
          }
          .summary-card h3 {
            padding: 14px 14px 12px;
            font-size: 16px;
            border-bottom: 1px solid var(--line);
          }
          .summary-card .body {
            padding: 14px;
          }
          .summary-card .body p {
            margin-top: 10px;
            font-size: 14px;
            line-height: 1.45;
            color: #0f172a;
          }
          .summary-card .body p:first-child { margin-top: 0; }
          .summary-card .body strong { font-weight: 700; }
          .bank-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 14px;
            margin-top: 16px;
            padding-top: 20px;
            border-top: 1px solid var(--line);
          }
          .bank-card {
            padding: 16px 14px;
            min-height: 84px;
          }
          .bank-card .value {
            margin-top: 8px;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.4;
            color: #0f172a;
            word-break: break-word;
          }
          .note-card {
            margin-top: 16px;
            padding: 18px;
            background: var(--surface);
          }
          .note-card p {
            margin-top: 10px;
            font-size: 14px;
            color: #334155;
            line-height: 1.6;
          }
          .metric-card,
          .table-card,
          .summary-card,
          .bank-card,
          .note-card,
          .section-grid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          @media print {
            body { background: white; }
            .page { max-width: none; padding: 0; }
            .sheet { border: none; box-shadow: none; border-radius: 0; }
            .hero { padding: 14px 16px 14px; }
            .brand-mark { width: 54px; height: 54px; border-radius: 16px; }
            .brand-mark img { width: 36px; height: 36px; }
            .title { font-size: 28px; }
            .subtitle { font-size: 12px; }
            .company h3 { font-size: 15px; }
            .company p, .company-meta { font-size: 11px; }
            .chips { margin-top: 8px; gap: 6px; }
            .chip { font-size: 10px; padding: 2px 8px; }
            .content { padding: 12px 14px 14px; }
            .metric-grid, .section-grid, .bank-grid { gap: 8px; }
            .metric-card, .bank-card { padding: 10px 10px; min-height: 0; }
            .metric-card .label, .bank-card .label { font-size: 9px; }
            .metric-card .value { margin-top: 6px; font-size: 13px; }
            .metric-card .value.success { font-size: 14px; }
            .metric-card .description { margin-top: 5px; font-size: 10px; }
            .table-card, .summary-card, .note-card { border-radius: 12px; }
            .table-card h3, .summary-card h3 { padding: 10px 10px 8px; font-size: 13px; }
            th, td { padding: 6px 10px; font-size: 10px; }
            th { font-size: 10px; }
            .summary-card { margin-top: 8px; }
            .summary-card .body { padding: 10px; }
            .summary-card .body p { margin-top: 6px; font-size: 10px; }
            .bank-grid { margin-top: 10px; padding-top: 12px; }
            .bank-card .value { margin-top: 5px; font-size: 10px; }
            .note-card { margin-top: 10px; padding: 10px; }
            .note-card p { margin-top: 6px; font-size: 10px; line-height: 1.45; }
          }
          @page {
            size: A4;
            margin: 8mm;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="sheet">
            <div class="hero">
              <div class="header">
                <div class="brand">
                  <div class="brand-mark">
                    <img src="${logoUrl}" alt="Company Logo" />
                  </div>
                  <div>
                    <div class="eyebrow">Payroll Statement</div>
                    <h1 class="title">Salary Slip</h1>
                    <p class="subtitle">${monthLabel}</p>
                    <div class="chips">
                      <span class="chip">${employee.employeeCode || "-"}</span>
                      <span class="chip">${employee.department || "-"}</span>
                      <span class="chip role">${roleLabel(employee)}</span>
                    </div>
                  </div>
                </div>
                <div class="company">
                  <h3>MO Designs Pvt. Ltd.</h3>
                  <p>Printable payroll summary for employee records.</p>
                  <div class="company-meta">
                    <div><strong>Employee:</strong> ${employee.name}</div>
                    <div><strong>Joining Date:</strong> ${joiningDate}</div>
                    <div><strong>Store:</strong> ${employee.store || "-"}</div>
                    <div><strong>Generated:</strong> ${generatedAt}</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="content">
              <div class="metric-grid">
                <div class="metric-card">
                  <div class="label">Net Pay</div>
                  <div class="value success">${formatCurrency(record.netPay)}</div>
                  <div class="description">Amount payable</div>
                </div>
                <div class="metric-card">
                  <div class="label">Gross Earnings</div>
                  <div class="value">${formatCurrency(record.grossEarnings)}</div>
                  <div class="description">Before deductions</div>
                </div>
                <div class="metric-card">
                  <div class="label">Total Deductions</div>
                  <div class="value">${formatCurrency(record.totalDeductions)}</div>
                  <div class="description">PF, ESI, tax, and others</div>
                </div>
                <div class="metric-card">
                  <div class="label">Attendance</div>
                  <div class="value">${attendanceDays}</div>
                  <div class="description">Actual attendance days this month</div>
                </div>
              </div>

              <div class="section-grid">
                <div class="table-card">
                  <h3>Earnings Breakdown</h3>
                  <table>
                    <thead><tr><th>Component</th><th>Amount</th></tr></thead>
                    <tbody>
                      <tr><td>Basic</td><td>${formatCurrency(record.earnings.basic)}</td></tr>
                      <tr><td>HRA</td><td>${formatCurrency(record.earnings.hra)}</td></tr>
                      <tr><td>Special Allowance</td><td>${formatCurrency(record.earnings.specialAllowance)}</td></tr>
                      <tr><td>Other Allowance</td><td>${formatCurrency(record.earnings.otherAllowance)}</td></tr>
                      <tr><td>Overtime</td><td>${formatCurrency(record.overtimeAmount)}</td></tr>
                      <tr><td>Bonus</td><td>${formatCurrency(record.bonus)}</td></tr>
                      <tr><td>Incentive</td><td>${formatCurrency(record.incentive)}</td></tr>
                      <tr><td>Reimbursements</td><td>${formatCurrency(record.reimbursements)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <div class="table-card">
                    <h3>Deductions</h3>
                    <table>
                      <thead><tr><th>Component</th><th>Amount</th></tr></thead>
                      <tbody>
                        ${record.deductions.pf > 0 ? `<tr><td>Employee Provident Fund (EPF)</td><td>${formatCurrency(record.deductions.pf)}</td></tr>` : ""}
                        ${record.deductions.esi > 0 ? `<tr><td>Health Insurance / ESI</td><td>${formatCurrency(record.deductions.esi)}</td></tr>` : ""}
                        ${record.deductions.professionalTax > 0 ? `<tr><td>Professional Tax (PT)</td><td>${formatCurrency(record.deductions.professionalTax)}</td></tr>` : ""}
                        ${record.deductions.tds > 0 ? `<tr><td>TDS</td><td>${formatCurrency(record.deductions.tds)}</td></tr>` : ""}
                        ${record.deductions.otherDeduction > 0 ? `<tr><td>${employee.salaryOtherDeductionLabel?.trim() || "Other Deduction"}</td><td>${formatCurrency(record.deductions.otherDeduction)}</td></tr>` : ""}
                        ${record.deductions.other > 0 ? `<tr><td>Other Deductions</td><td>${formatCurrency(record.deductions.other)}</td></tr>` : ""}
                      </tbody>
                    </table>
                  </div>
                  <div class="summary-card">
                    <h3>Attendance Summary</h3>
                    <div class="body">
                      <p><strong>Attendance Days:</strong> ${attendanceDays}</p>
                      <p><strong>Working Days:</strong> ${record.workingDays}</p>
                      <p><strong>Week Off:</strong> ${record.weekOffDays} | <strong>Leave / LOP:</strong> ${record.leaveDays} | <strong>LOP:</strong> ${record.lopDays}</p>
                      <p><strong>Payment Mode:</strong> ${paymentModeLabel}</p>
                      <p><strong>Paid Days:</strong> ${record.paidDays}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="bank-grid">
                <div class="bank-card">
                  <div class="label">Bank Name</div>
                  <div class="value">${employee.bankName || "-"}</div>
                </div>
                <div class="bank-card">
                  <div class="label">Account Number</div>
                  <div class="value">${employee.bankAccountNumber || "-"}</div>
                </div>
                <div class="bank-card">
                  <div class="label">IFSC</div>
                  <div class="value">${employee.bankIfsc || "-"}</div>
                </div>
                ${(employee.uanNumber?.trim() || employee.esiNumber?.trim()) ? `
                <div class="bank-card">
                  <div class="label">${employee.uanNumber?.trim() && employee.esiNumber?.trim() ? "UAN / ESI" : employee.uanNumber?.trim() ? "UAN (PF Number)" : "ESI Number"}</div>
                  <div class="value">${employee.uanNumber?.trim() && employee.esiNumber?.trim() ? `${employee.uanNumber} / ${employee.esiNumber}` : employee.uanNumber?.trim() || employee.esiNumber || "-"}</div>
                </div>` : ""}
              </div>

              ${
                record.notes
                  ? `<div class="note-card"><div class="label">Payroll Notes</div><p>${record.notes}</p></div>`
                  : ""
              }
            </div>
          </div>
        </div>
        <script>
          window.onload = function () {
            window.focus();
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  slipWindow.document.open();
  slipWindow.document.write(html);
  slipWindow.document.close();
  return true;
};

export const openEmployeeFormPrintWindow = (employee: HrEmployee, form: EmployeeFormState) => {
  const win = window.open("", "_blank", "width=1100,height=900");
  if (!win) return false;

  const logoUrl = `${window.location.origin}/logo.png`;
  const printedAt = format(new Date(), "dd MMMM yyyy");
  const joiningDate = formatDateLabel(form.joiningDate);
  const statusText = form.employmentStatus === "active" ? "Active" : form.employmentStatus === "on_leave" ? "On Leave" : "Inactive";
  const expText = form.experienceType === "experienced" ? (form.experience || "Experienced") : "Fresher";

  const gross = [form.salaryBasic, form.salaryHra, form.salarySpecialAllowance, form.salaryOtherAllowance]
    .reduce((acc, v) => acc + (Number(v) || 0), 0);
  const totalDeductions = [
    form.hasPf ? Number(form.salaryPf) || 0 : 0,
    form.hasHealthInsurance ? Number(form.salaryEsi) || 0 : 0,
    Number(form.salaryProfessionalTax) || 0,
    Number(form.salaryTds) || 0,
    Number(form.salaryOtherDeduction) || 0,
  ].reduce((a, b) => a + b, 0);
  const netPay = Math.max(gross - totalDeductions, 0);

  const fmt = (n: number) =>
    n > 0
      ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n)
      : "—";

  const field = (label: string, value: string, half = false) => `
    <div class="field${half ? " half" : ""}">
      <div class="field-label">${label}</div>
      <div class="field-value">${value || "—"}</div>
    </div>`;

  const assetList = form.issuedAssets
    ? form.issuedAssets.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const photoHtml = form.photoUrl
    ? `<img src="${form.photoUrl}" alt="Photo" style="width:100%;height:100%;object-fit:cover;" />`
    : `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#9ca3af;gap:4px;">
         <svg width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
         <span style="font-size:9px;text-align:center;line-height:1.4;">Affix Passport<br/>Size Photo</span>
       </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Employee Form — ${form.name || "Employee"}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{
    font-family:"Segoe UI",Arial,sans-serif;
    font-size:10.5px;
    color:#111827;
    background:#e5e7eb;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }
  .page{max-width:820px;margin:16px auto;background:#fff;border:1px solid #d1d5db;box-shadow:0 4px 24px rgba(0,0,0,.10);}

  /* ── TOP HEADER ── */
  .top-header{
    background:#0f2a4a;
    color:#fff;
    display:flex;
    align-items:center;
    padding:14px 20px;
    gap:16px;
    border-bottom:4px solid #f59e0b;
  }
  .logo-wrap{
    width:52px;height:52px;
    background:#fff;
    border-radius:8px;
    display:flex;align-items:center;justify-content:center;
    flex-shrink:0;
    padding:4px;
  }
  .logo-wrap img{width:100%;height:100%;object-fit:contain;}
  .co-name{flex:1;}
  .co-name h1{font-size:17px;font-weight:800;letter-spacing:.02em;line-height:1.1;}
  .co-name p{font-size:9.5px;opacity:.72;margin-top:3px;letter-spacing:.04em;text-transform:uppercase;}
  .form-title{text-align:right;font-size:10px;opacity:.8;line-height:1.5;}
  .form-title strong{font-size:11px;display:block;opacity:1;}

  /* ── IDENTITY BAND ── */
  .id-band{
    background:#f8fafc;
    border-bottom:1px solid #e5e7eb;
    display:flex;
    align-items:stretch;
  }
  .id-left{flex:1;padding:14px 18px 14px;}
  .emp-name{font-size:20px;font-weight:800;color:#0f2a4a;line-height:1.15;}
  .emp-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;}
  .badge{
    display:inline-flex;align-items:center;
    padding:2px 10px;border-radius:3px;
    font-size:9.5px;font-weight:700;letter-spacing:.03em;
  }
  .badge-blue{background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe;}
  .badge-gray{background:#f3f4f6;color:#374151;border:1px solid #d1d5db;}
  .badge-green{background:#dcfce7;color:#166534;border:1px solid #bbf7d0;}
  .id-meta{display:grid;grid-template-columns:1fr 1fr;gap:5px 18px;margin-top:10px;}
  .id-meta-item{font-size:10px;color:#374151;}
  .id-meta-item span{color:#6b7280;}
  .photo-col{
    width:108px;
    border-left:1px solid #e5e7eb;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:10px 8px 6px;
    background:#fff;
    flex-shrink:0;
  }
  .photo-frame{
    width:84px;height:108px;
    border:2px solid #9ca3af;
    overflow:hidden;
    background:#f9fafb;
  }
  .photo-label{font-size:8.5px;color:#6b7280;margin-top:4px;text-align:center;}

  /* ── FORM SECTIONS ── */
  .section{border-top:1px solid #d1d5db;}
  .sec-head{
    background:#1e3a5f;
    color:#fff;
    padding:5px 18px;
    font-size:9px;
    font-weight:700;
    letter-spacing:.18em;
    text-transform:uppercase;
    display:flex;align-items:center;gap:8px;
  }
  .sec-num{
    background:rgba(255,255,255,.18);
    border-radius:50%;
    width:18px;height:18px;
    display:flex;align-items:center;justify-content:center;
    font-size:9px;font-weight:800;flex-shrink:0;
  }
  .sec-body{padding:10px 18px 12px;}

  /* Field grid */
  .fields{display:flex;flex-wrap:wrap;gap:0;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;}
  .field{
    width:50%;
    border-right:1px solid #e5e7eb;
    border-bottom:1px solid #e5e7eb;
    display:flex;
  }
  .field.full{width:100%;}
  .field.third{width:33.333%;}
  .field:last-child{border-right:none;}
  .field-label{
    background:#f8fafc;
    border-right:1px solid #e5e7eb;
    padding:5px 8px;
    font-size:9px;
    font-weight:700;
    color:#4b5563;
    white-space:nowrap;
    min-width:150px;
    max-width:160px;
    display:flex;align-items:center;
  }
  .field-value{
    padding:5px 10px;
    font-size:10px;
    color:#111827;
    display:flex;align-items:center;
    flex:1;
    word-break:break-word;
  }

  /* Salary section */
  .sal-wrap{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .sal-card{border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;}
  .sal-head{background:#374151;color:#fff;padding:5px 10px;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;}
  .sal-row{display:flex;justify-content:space-between;padding:4px 10px;border-bottom:1px solid #f3f4f6;font-size:10px;}
  .sal-row:last-child{border-bottom:none;}
  .sal-row.sub-total{background:#f8fafc;font-weight:700;}
  .sal-row.net{background:#065f46;color:#fff;font-weight:800;font-size:11px;}
  .sal-row.deduction-total{background:#fef2f2;color:#991b1b;font-weight:700;}

  /* Assets */
  .asset-grid{display:flex;flex-wrap:wrap;gap:6px;padding:8px 0 2px;}
  .asset-item{
    display:inline-flex;align-items:center;gap:5px;
    background:#eff6ff;border:1px solid #bfdbfe;
    color:#1d4ed8;
    border-radius:3px;
    padding:3px 10px;
    font-size:9.5px;font-weight:600;
  }
  .asset-num{
    background:#1d4ed8;color:#fff;
    border-radius:2px;width:14px;height:14px;
    display:flex;align-items:center;justify-content:center;
    font-size:8px;font-weight:800;flex-shrink:0;
  }
  .no-assets{color:#9ca3af;font-style:italic;font-size:10px;padding:4px 0;}

  /* Declaration */
  .declaration{
    border-top:2px dashed #d1d5db;
    margin:0 18px;
    padding:12px 0 16px;
    display:flex;gap:0;align-items:flex-end;
  }
  .decl-text{flex:1;font-size:9px;color:#4b5563;line-height:1.65;padding-right:24px;}
  .decl-text strong{color:#111827;}
  .sig-area{display:flex;gap:32px;}
  .sig{text-align:center;}
  .sig-line{border-top:1px solid #374151;width:150px;margin-bottom:4px;}
  .sig-name{font-size:8.5px;color:#374151;font-weight:600;}
  .sig-role{font-size:8px;color:#6b7280;}

  /* Footer stripe */
  .footer-bar{
    background:#0f2a4a;color:rgba(255,255,255,.55);
    font-size:8.5px;
    padding:6px 18px;
    display:flex;justify-content:space-between;
    letter-spacing:.03em;
  }

  @media print{
    body{background:#fff;}
    .page{max-width:none;margin:0;border:none;box-shadow:none;}
    .section{page-break-inside:avoid;}
  }
  @page{size:A4;margin:5mm;}
</style>
</head>
<body>
<div class="page">

  <!-- TOP HEADER -->
  <div class="top-header">
    <div class="logo-wrap"><img src="${logoUrl}" alt="Logo"/></div>
    <div class="co-name">
      <h1>MO DESIGNS PVT. LTD.</h1>
      <p>Human Resources Department</p>
    </div>
    <div class="form-title">
      <strong>EMPLOYEE REGISTRATION FORM</strong>
      Employee Master Data Record
    </div>
  </div>

  <!-- IDENTITY BAND -->
  <div class="id-band">
    <div class="id-left">
      <div class="emp-name">${form.name || "—"}</div>
      <div class="emp-badges">
        ${form.employeeCode ? `<span class="badge badge-blue">Code: ${form.employeeCode}</span>` : ""}
        ${form.designation ? `<span class="badge badge-gray">Designation: ${form.designation}</span>` : ""}
        ${form.department ? `<span class="badge badge-gray">Dept: ${form.department}</span>` : ""}
        ${form.store ? `<span class="badge badge-gray">${form.store}</span>` : ""}
        <span class="badge badge-green">${statusText}</span>
      </div>
      <div class="id-meta">
        <div class="id-meta-item"><span>Date of Joining: </span><strong>${joiningDate}</strong></div>
        <div class="id-meta-item"><span>Phone: </span><strong>${form.phone || "—"}</strong></div>
        <div class="id-meta-item"><span>Email: </span><strong>${form.email || "—"}</strong></div>
        <div class="id-meta-item"><span>Reporting Manager: </span><strong>${form.reportingManager || "—"}</strong></div>
        <div class="id-meta-item"><span>Form Date: </span><strong>${printedAt}</strong></div>
        <div class="id-meta-item"><span>Experience: </span><strong>${expText}</strong></div>
      </div>
    </div>
    <div class="photo-col">
      <div class="photo-frame">${photoHtml}</div>
      <div class="photo-label">Passport Photo</div>
    </div>
  </div>

  <!-- SECTION A: Employment -->
  <div class="section">
    <div class="sec-head"><span class="sec-num">A</span> Employment Details</div>
    <div class="sec-body">
      <div class="fields">
        ${field("Full Name", form.name)}
        ${field("Employee Code / Bio ID", form.employeeCode)}
        ${field("Designation", form.designation)}
        ${field("Department", form.department)}
        ${field("Role / Category", form.role)}
        ${field("Store / Branch", form.store)}
        ${field("Reporting Manager", form.reportingManager)}
        ${field("Date of Joining", joiningDate)}
        ${field("Employment Status", statusText)}
        ${field("Working Hours", form.workingTimeFrom && form.workingTimeTo ? `${form.workingTimeFrom} – ${form.workingTimeTo}` : "—")}
        ${field("Experience", expText, false)}
        ${field("Timesheet Tracking", form.timesheetEnabled ? "Enabled" : "Not Enabled")}
      </div>
    </div>
  </div>

  <!-- SECTION B: Education -->
  <div class="section">
    <div class="sec-head"><span class="sec-num">B</span> Educational Qualifications</div>
    <div class="sec-body">
      <div class="fields">
        ${field("10th Standard", form.tenthBoardName ? `${form.tenthBoardName}${form.tenthMarks ? " — " + form.tenthMarks : ""}` : "—")}
        ${field("12th Standard", form.twelfthBoardName ? `${form.twelfthBoardName}${form.twelfthMarks ? " — " + form.twelfthMarks : ""}` : "—")}
        ${field("Bachelor's Degree", form.bachelorBoardName ? `${form.bachelorBoardName}${form.bachelorMarks ? " — " + form.bachelorMarks : ""}` : "—")}
        ${field("Master's Degree", form.masterBoardName ? `${form.masterBoardName}${form.masterMarks ? " — " + form.masterMarks : ""}` : "—")}
        ${field("Additional Qualification", form.additionalQualification, false)}
      </div>
    </div>
  </div>

  <!-- SECTION C: KYC -->
  <div class="section">
    <div class="sec-head"><span class="sec-num">C</span> KYC / Identity Documents</div>
    <div class="sec-body">
      <div class="fields">
        ${field("PAN Number", form.panNumber)}
        ${field("Aadhaar Number", form.aadhaarNumber)}
        ${field("Driving Licence No.", form.drivingLicense)}
        ${field("Voter ID", form.voterId)}
        ${field("Passport No.", form.passportNumber)}
        ${field("Medical Insurance", form.medicalInsurance)}
      </div>
    </div>
  </div>

  <!-- SECTION D: Bank & Statutory -->
  <div class="section">
    <div class="sec-head"><span class="sec-num">D</span> Bank &amp; Statutory Details</div>
    <div class="sec-body">
      <div class="fields">
        ${field("Bank Name", form.bankName)}
        ${field("Account Number", form.bankAccountNumber)}
        ${field("IFSC Code", form.bankIfsc)}
        ${field("UAN (PF Number)", form.uanNumber)}
        ${field("ESI Number", form.esiNumber)}
        ${field("PF / Health Insurance", `PF: ${form.hasPf ? "Applicable" : "N/A"}  |  ESI: ${form.hasHealthInsurance ? "Applicable" : "N/A"}`)}
      </div>
    </div>
  </div>

  <!-- SECTION E: Salary -->
  <div class="section">
    <div class="sec-head"><span class="sec-num">E</span> Monthly Salary Structure</div>
    <div class="sec-body">
      <div class="sal-wrap">
        <div class="sal-card">
          <div class="sal-head">Earnings</div>
          <div class="sal-row"><span>Basic Salary</span><strong>${fmt(Number(form.salaryBasic)||0)}</strong></div>
          <div class="sal-row"><span>House Rent Allowance (HRA)</span><strong>${fmt(Number(form.salaryHra)||0)}</strong></div>
          <div class="sal-row"><span>Special Allowance</span><strong>${fmt(Number(form.salarySpecialAllowance)||0)}</strong></div>
          <div class="sal-row"><span>Other Allowance</span><strong>${fmt(Number(form.salaryOtherAllowance)||0)}</strong></div>
          <div class="sal-row sub-total"><span>Gross Earnings</span><strong>${fmt(gross)}</strong></div>
        </div>
        <div class="sal-card">
          <div class="sal-head">Deductions &amp; Net Pay</div>
          <div class="sal-row"><span>Employee PF (EPF)</span><strong>${form.hasPf ? fmt(Number(form.salaryPf)||0) : "N/A"}</strong></div>
          <div class="sal-row"><span>Health Insurance / ESI</span><strong>${form.hasHealthInsurance ? fmt(Number(form.salaryEsi)||0) : "N/A"}</strong></div>
          <div class="sal-row"><span>Professional Tax</span><strong>${fmt(Number(form.salaryProfessionalTax)||0)}</strong></div>
          <div class="sal-row"><span>TDS</span><strong>${fmt(Number(form.salaryTds)||0)}</strong></div>
          <div class="sal-row"><span>${form.salaryOtherDeductionLabel?.trim() || "Other Deduction"}</span><strong>${fmt(Number(form.salaryOtherDeduction)||0)}</strong></div>
          <div class="sal-row deduction-total"><span>Total Deductions</span><strong>${fmt(totalDeductions)}</strong></div>
          <div class="sal-row net"><span>Estimated Net Pay</span><strong>${fmt(netPay)}</strong></div>
        </div>
      </div>
    </div>
  </div>

  <!-- SECTION F: Assets -->
  <div class="section">
    <div class="sec-head"><span class="sec-num">F</span> Company Assets &amp; Accessories Provided</div>
    <div class="sec-body">
      ${assetList.length
        ? `<div class="asset-grid">${assetList.map((a, i) => `<span class="asset-item"><span class="asset-num">${i + 1}</span>${a}</span>`).join("")}</div>
           <p style="font-size:9px;color:#6b7280;margin-top:6px;">Total ${assetList.length} item${assetList.length > 1 ? "s" : ""} issued. All items to be returned at the time of exit / FnF settlement.</p>`
        : `<p class="no-assets">No assets / accessories recorded for this employee.</p>`
      }
    </div>
  </div>

  <!-- DECLARATION -->
  <div class="declaration">
    <div class="decl-text">
      <strong>Declaration by Employee:</strong> I hereby declare that the information furnished in this form is true, complete, and correct to the best of my knowledge and belief.
      I understand that any false or misleading information may result in my disqualification or immediate termination of employment without notice.
    </div>
    <div class="sig-area">
      <div class="sig">
        <div class="sig-line"></div>
        <div class="sig-name">Employee Signature</div>
        <div class="sig-role">Date: ___________</div>
      </div>
      <div class="sig">
        <div class="sig-line"></div>
        <div class="sig-name">HR Manager</div>
        <div class="sig-role">Authorised Signatory</div>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer-bar">
    <span>MO DESIGNS PVT. LTD. — Confidential Employee Record</span>
    <span>Generated: ${printedAt} &nbsp;|&nbsp; For HR use only</span>
  </div>

</div>
<script>window.onload=function(){window.focus();window.print();};</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
};
