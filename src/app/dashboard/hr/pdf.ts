import { format } from "date-fns";
import {
  COMPANY_LOGO_PATH,
  COMPANY_NAME,
  formatDateLabel,
  formatMonthLabel,
  getAttendanceDays,
  roleLabel,
} from "./utils";
import type { HrEmployee, PayrollRecord } from "./types";

type JsPDF = any;
type RGB = readonly [number, number, number];

const PAGE = {
  width: 210,
  height: 297,
  sheetX: 8,
  sheetY: 8,
  sheetW: 194,
  sheetH: 281,
} as const;

const COLORS = {
  primary: [10, 50, 95] as RGB,
  primaryLight: [225, 235, 250] as RGB,
  accent: [0, 120, 135] as RGB,
  accentLight: [230, 248, 250] as RGB,
  gray900: [20, 23, 30] as RGB,
  gray800: [45, 52, 65] as RGB,
  gray700: [71, 85, 105] as RGB,
  gray600: [100, 116, 139] as RGB,
  gray300: [226, 232, 240] as RGB,
  gray200: [241, 245, 249] as RGB,
  gray100: [248, 250, 252] as RGB,
  success: [5, 150, 105] as RGB,
  successLight: [236, 253, 245] as RGB,
  white: [255, 255, 255] as RGB,
  pageBg: [245, 248, 252] as RGB,
} as const;

const FONT = "helvetica";

let salarySlipLogoDataUrlPromise: Promise<string | null> | null = null;

const loadImageDataUrl = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export const getSalarySlipLogoDataUrl = async () => {
  if (!salarySlipLogoDataUrlPromise) {
    const origin =
      typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
    salarySlipLogoDataUrlPromise = loadImageDataUrl(`${origin}${COMPANY_LOGO_PATH}`);
  }
  return salarySlipLogoDataUrlPromise;
};

const setFont = (pdf: JsPDF, bold = false, size = 10) => {
  pdf.setFont(FONT, bold ? "bold" : "normal");
  pdf.setFontSize(size);
};

const setColor = (pdf: JsPDF, color: RGB) => {
  pdf.setTextColor(...color);
};

const drawCard = (pdf: JsPDF, x: number, y: number, w: number, h: number, radius = 3) => {
  pdf.setDrawColor(...COLORS.gray300);
  pdf.setLineWidth(0.3);
  pdf.setFillColor(...COLORS.white);
  pdf.roundedRect(x, y, w, h, radius, radius, "FD");
};

const formatCurrency = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `\u20B9${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(safeValue)}`;
};

const fitText = (pdf: JsPDF, value: string, maxWidth: number) => {
  const text = value || "-";
  if (pdf.getTextWidth(text) <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && pdf.getTextWidth(`${result}...`) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
};

const drawChip = (
  pdf: JsPDF,
  x: number,
  y: number,
  text: string,
  variant: "default" | "primary" | "success" = "default"
) => {
  const safeText = text || "-";
  setFont(pdf, false, 7);
  const textWidth = pdf.getTextWidth(safeText);
  const chipW = textWidth + 6;
  const chipH = 5.2;

  const style =
    variant === "primary"
      ? { border: COLORS.primary, fill: COLORS.primaryLight, text: COLORS.primary }
      : variant === "success"
        ? { border: COLORS.success, fill: COLORS.successLight, text: COLORS.success }
        : { border: COLORS.gray300, fill: COLORS.white, text: COLORS.gray700 };

  pdf.setDrawColor(...style.border);
  pdf.setFillColor(...style.fill);
  pdf.roundedRect(x, y, chipW, chipH, 2.6, 2.6, "FD");
  setColor(pdf, style.text);
  pdf.text(safeText, x + 3, y + 3.55);
  return chipW;
};

const drawMetricCard = (
  pdf: JsPDF,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
  description: string,
  highlight = false
) => {
  const h = 22;
  pdf.setDrawColor(...(highlight ? COLORS.success : COLORS.gray300));
  pdf.setLineWidth(0.3);
  pdf.setFillColor(...(highlight ? COLORS.successLight : COLORS.white));
  pdf.roundedRect(x, y, w, h, 3, 3, "FD");

  setFont(pdf, true, 6.5);
  setColor(pdf, COLORS.gray600);
  pdf.text(label.toUpperCase(), x + 2.6, y + 4.6);

  setFont(pdf, true, 10.5);
  setColor(pdf, highlight ? COLORS.success : COLORS.gray900);
  pdf.text(fitText(pdf, value, w - 5.2), x + 2.6, y + 11.4);

  setFont(pdf, false, 6.2);
  setColor(pdf, COLORS.gray600);
  pdf.text(fitText(pdf, description, w - 5.2), x + 2.6, y + 16.8);

  return h;
};

const drawMoneyTableCard = (
  pdf: JsPDF,
  x: number,
  y: number,
  w: number,
  title: string,
  rows: Array<{ label: string; value: number }>
) => {
  const titleH = 8;
  const headH = 6;
  const rowH = 5.8;
  const bodyRows = rows.length ? rows : [{ label: "No data", value: 0 }];
  const h = titleH + headH + bodyRows.length * rowH + 2.4;
  drawCard(pdf, x, y, w, h, 3.4);

  setFont(pdf, true, 8.2);
  setColor(pdf, COLORS.gray900);
  pdf.text(title, x + 2.8, y + 5.2);

  const tableTop = y + titleH;
  pdf.setDrawColor(...COLORS.gray300);
  pdf.line(x + 1.2, tableTop, x + w - 1.2, tableTop);

  setFont(pdf, true, 6.2);
  setColor(pdf, COLORS.gray600);
  pdf.text("COMPONENT", x + 2.8, tableTop + 4);
  pdf.text("AMOUNT", x + w - 2.8, tableTop + 4, { align: "right" });

  let rowY = tableTop + headH;
  bodyRows.forEach((row, index) => {
    if (index > 0) {
      pdf.setDrawColor(...COLORS.gray300);
      pdf.line(x + 1.2, rowY, x + w - 1.2, rowY);
    }
    setFont(pdf, false, 6.6);
    setColor(pdf, COLORS.gray800);
    const label = fitText(pdf, row.label, w - 34);
    pdf.text(label, x + 2.8, rowY + 3.8);

    setFont(pdf, true, 6.8);
    setColor(pdf, COLORS.gray900);
    pdf.text(formatCurrency(row.value), x + w - 2.8, rowY + 3.8, { align: "right" });

    rowY += rowH;
  });

  return h;
};

const drawAttendanceSummaryCard = (
  pdf: JsPDF,
  x: number,
  y: number,
  w: number,
  attendanceDays: number,
  record: PayrollRecord
) => {
  const rows = [
    { label: "Attendance Days", value: String(attendanceDays) },
    { label: "Working Days", value: String(record.workingDays) },
    { label: "Week Off / Leave / LOP", value: `${record.weekOffDays} / ${record.leaveDays} / ${record.lopDays}` },
    { label: "Payment Mode", value: record.paymentMode === "full_payment" ? "Full Payment" : "Attendance Based" },
    { label: "Paid Days", value: String(record.paidDays) },
  ];

  const titleH = 8;
  const rowH = 6;
  const h = titleH + rows.length * rowH + 2.4;
  drawCard(pdf, x, y, w, h, 3.4);

  setFont(pdf, true, 8.2);
  setColor(pdf, COLORS.gray900);
  pdf.text("Attendance Summary", x + 2.8, y + 5.2);

  let rowY = y + titleH;
  rows.forEach((row, index) => {
    if (index > 0) {
      pdf.setDrawColor(...COLORS.gray300);
      pdf.line(x + 1.2, rowY, x + w - 1.2, rowY);
    }
    setFont(pdf, true, 6.4);
    setColor(pdf, COLORS.gray800);
    pdf.text(row.label, x + 2.8, rowY + 3.9);

    setFont(pdf, false, 6.4);
    setColor(pdf, COLORS.gray700);
    const safeValue = fitText(pdf, row.value, w * 0.48);
    pdf.text(safeValue, x + w - 2.8, rowY + 3.9, { align: "right" });
    rowY += rowH;
  });

  return h;
};

const drawBankDetailsCard = (
  pdf: JsPDF,
  x: number,
  y: number,
  w: number,
  rows: Array<{ label: string; value: string }>
) => {
  const titleH = 8;
  const valueMaxWidth = w * 0.56;
  const prepared = rows.map((row) => {
    setFont(pdf, true, 6.8);
    const lines = pdf.splitTextToSize(row.value || "-", valueMaxWidth);
    const rowH = Math.max(6.2, lines.length * 3.7 + 1.8);
    return { ...row, lines, rowH };
  });

  const bodyH = prepared.reduce((sum, row) => sum + row.rowH, 0);
  const h = titleH + bodyH + 2.4;
  drawCard(pdf, x, y, w, h, 3.4);

  setFont(pdf, true, 8.2);
  setColor(pdf, COLORS.gray900);
  pdf.text("Bank & Compliance Details", x + 2.8, y + 5.2);

  let rowY = y + titleH;
  prepared.forEach((row, index) => {
    if (index > 0) {
      pdf.setDrawColor(...COLORS.gray300);
      pdf.line(x + 1.2, rowY, x + w - 1.2, rowY);
    }
    setFont(pdf, true, 6.2);
    setColor(pdf, COLORS.gray600);
    pdf.text(row.label.toUpperCase(), x + 2.8, rowY + 3.8);

    setFont(pdf, true, 6.8);
    setColor(pdf, COLORS.gray900);
    row.lines.forEach((line: string, lineIndex: number) => {
      pdf.text(line, x + w - 2.8, rowY + 3.8 + lineIndex * 3.6, { align: "right" });
    });
    rowY += row.rowH;
  });

  return h;
};

const drawNotesCard = (
  pdf: JsPDF,
  x: number,
  y: number,
  w: number,
  text: string,
  maxHeight: number
) => {
  if (!text.trim() || maxHeight < 12) return 0;

  const titleH = 8;
  const availableBody = Math.max(4, maxHeight - titleH - 2.8);
  const rawLines = pdf.splitTextToSize(text, w - 5.6) as string[];
  const maxLines = Math.max(1, Math.floor(availableBody / 3.8));
  const lines = rawLines.slice(0, maxLines);
  if (rawLines.length > maxLines && lines.length) {
    lines[lines.length - 1] = `${fitText(pdf, lines[lines.length - 1], w - 10)}...`;
  }

  const h = titleH + lines.length * 3.8 + 2.8;
  drawCard(pdf, x, y, w, h, 3.4);

  setFont(pdf, true, 8.2);
  setColor(pdf, COLORS.gray900);
  pdf.text("Payroll Notes", x + 2.8, y + 5.2);

  setFont(pdf, false, 6.7);
  setColor(pdf, COLORS.gray700);
  lines.forEach((line, index) => {
    pdf.text(line, x + 2.8, y + titleH + 3.5 + index * 3.8);
  });

  return h;
};

export const renderSalarySlipPdfPage = (
  pdf: JsPDF,
  employee: HrEmployee,
  record: PayrollRecord,
  logoDataUrl?: string | null
) => {
  const attendanceDays = getAttendanceDays(record);
  const innerX = PAGE.sheetX + 4;
  const innerW = PAGE.sheetW - 8;
  const sheetBottom = PAGE.sheetY + PAGE.sheetH;

  pdf.setFillColor(...COLORS.pageBg);
  pdf.rect(0, 0, PAGE.width, PAGE.height, "F");

  pdf.setDrawColor(...COLORS.gray300);
  pdf.setLineWidth(0.4);
  pdf.setFillColor(...COLORS.white);
  pdf.roundedRect(PAGE.sheetX, PAGE.sheetY, PAGE.sheetW, PAGE.sheetH, 5, 5, "FD");

  pdf.setFillColor(...COLORS.primary);
  pdf.rect(PAGE.sheetX, PAGE.sheetY, PAGE.sheetW, 2.1, "F");

  pdf.setFillColor(...COLORS.gray100);
  pdf.rect(PAGE.sheetX + 0.3, PAGE.sheetY + 2.1, PAGE.sheetW - 0.6, 43, "F");

  const headerTop = PAGE.sheetY + 5;
  if (logoDataUrl) {
    pdf.addImage(logoDataUrl, "PNG", innerX, headerTop, 14, 14);
  }

  const leftTextX = innerX + (logoDataUrl ? 17 : 0);
  setFont(pdf, true, 6.5);
  setColor(pdf, COLORS.gray600);
  pdf.text("PAYROLL STATEMENT", leftTextX, headerTop + 2.2);

  setFont(pdf, true, 15);
  setColor(pdf, COLORS.gray900);
  pdf.text("Salary Slip", leftTextX, headerTop + 9.8);

  setFont(pdf, false, 8.2);
  setColor(pdf, COLORS.gray700);
  pdf.text(formatMonthLabel(record.month), leftTextX, headerTop + 15.2);

  const rightX = PAGE.sheetX + PAGE.sheetW - 5;
  setFont(pdf, true, 10);
  setColor(pdf, COLORS.gray900);
  pdf.text(COMPANY_NAME, rightX, headerTop + 2.5, { align: "right" });

  setFont(pdf, false, 6.3);
  setColor(pdf, COLORS.gray700);
  pdf.text("Printable payroll summary for employee records.", rightX, headerTop + 6.6, { align: "right" });
  pdf.text(`Employee: ${employee.name || "-"}`, rightX, headerTop + 10.6, { align: "right" });
  pdf.text(`Joining Date: ${formatDateLabel(employee.joiningDate)}`, rightX, headerTop + 14.6, { align: "right" });
  pdf.text(`Store: ${employee.store || "-"}`, rightX, headerTop + 18.6, { align: "right" });

  let chipX = leftTextX;
  const chipY = headerTop + 19;
  chipX += drawChip(pdf, chipX, chipY, employee.employeeCode || "-", "primary") + 2;
  chipX += drawChip(pdf, chipX, chipY, employee.department || "-", "default") + 2;
  drawChip(pdf, chipX, chipY, roleLabel(employee), "success");

  const metricY = PAGE.sheetY + 50;
  const metricGap = 3;
  const metricW = (innerW - metricGap * 3) / 4;
  drawMetricCard(pdf, innerX, metricY, metricW, "Net Pay", formatCurrency(record.netPay), "Amount payable", true);
  drawMetricCard(pdf, innerX + (metricW + metricGap), metricY, metricW, "Gross Earnings", formatCurrency(record.grossEarnings), "Before deductions");
  drawMetricCard(pdf, innerX + (metricW + metricGap) * 2, metricY, metricW, "Total Deductions", formatCurrency(record.totalDeductions), "PF, ESI, tax, and others");
  drawMetricCard(pdf, innerX + (metricW + metricGap) * 3, metricY, metricW, "Attendance", String(attendanceDays), "Actual attendance days");

  const sectionY = metricY + 27;
  const sectionGap = 4;
  const leftW = innerW * 0.59;
  const rightW = innerW - leftW - sectionGap;

  const earningsRows = [
    { label: "Basic", value: record.earnings.basic },
    { label: "HRA", value: record.earnings.hra },
    { label: "Special Allowance", value: record.earnings.specialAllowance },
    { label: "Other Allowance", value: record.earnings.otherAllowance },
    { label: "Overtime", value: record.overtimeAmount },
    { label: "Bonus", value: record.bonus },
    { label: "Incentive", value: record.incentive },
    { label: "Reimbursements", value: record.reimbursements },
  ];

  const otherDeductionLabel = employee.salaryOtherDeductionLabel?.trim() || "Other Deduction";
  const deductionRows = [
    { label: "Employee Provident Fund (EPF)", value: record.deductions.pf },
    { label: "Health Insurance / ESI", value: record.deductions.esi },
    { label: "Professional Tax (PT)", value: record.deductions.professionalTax },
    { label: "TDS", value: record.deductions.tds },
    { label: otherDeductionLabel, value: record.deductions.otherDeduction },
    { label: "Other Deductions", value: record.deductions.other },
  ].filter((row) => row.value > 0);

  const leftH = drawMoneyTableCard(pdf, innerX, sectionY, leftW, "Earnings Breakdown", earningsRows);
  const rightTableH = drawMoneyTableCard(pdf, innerX + leftW + sectionGap, sectionY, rightW, "Deductions", deductionRows);
  const attendanceCardY = sectionY + rightTableH + 3;
  const attendanceCardH = drawAttendanceSummaryCard(
    pdf,
    innerX + leftW + sectionGap,
    attendanceCardY,
    rightW,
    attendanceDays,
    record
  );
  const sectionH = Math.max(leftH, rightTableH + 3 + attendanceCardH);

  const bankRows = [
    { label: "Bank Name", value: employee.bankName || "-" },
    { label: "Account Number", value: employee.bankAccountNumber || "-" },
    { label: "IFSC", value: employee.bankIfsc || "-" },
    ...(employee.uanNumber?.trim() || employee.esiNumber?.trim()
      ? [{
          label: employee.uanNumber?.trim() && employee.esiNumber?.trim()
            ? "UAN / ESI"
            : employee.uanNumber?.trim()
              ? "UAN (PF Number)"
              : "ESI Number",
          value:
            employee.uanNumber?.trim() && employee.esiNumber?.trim()
              ? `${employee.uanNumber} / ${employee.esiNumber}`
              : employee.uanNumber?.trim() || employee.esiNumber || "-",
        }]
      : []),
  ];

  const bankY = sectionY + sectionH + 5;
  const bankH = drawBankDetailsCard(pdf, innerX, bankY, innerW, bankRows);

  if (record.notes?.trim()) {
    const notesY = bankY + bankH + 4;
    const maxNotesH = sheetBottom - 11 - notesY;
    drawNotesCard(pdf, innerX, notesY, innerW, record.notes, maxNotesH);
  }

  const footerY = sheetBottom - 7.5;
  pdf.setDrawColor(...COLORS.gray300);
  pdf.line(innerX, footerY - 2.8, innerX + innerW, footerY - 2.8);
  setFont(pdf, false, 6.1);
  setColor(pdf, COLORS.gray600);
  pdf.text(
    "This is a system-generated payroll statement and does not require a signature.",
    innerX,
    footerY
  );
  pdf.text(
    `Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`,
    innerX + innerW,
    footerY,
    { align: "right" }
  );
};

export const saveSalarySlipPdfBundle = async (
  slips: Array<{ employee: HrEmployee; record: PayrollRecord }>,
  fileName: string
) => {
  if (!slips.length) return;

  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF("p", "mm", "a4");
  const logo = await getSalarySlipLogoDataUrl();

  slips.forEach((slip, index) => {
    if (index > 0) pdf.addPage();
    renderSalarySlipPdfPage(pdf, slip.employee, slip.record, logo);
  });

  pdf.save(fileName);
};
