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

let salarySlipLogoDataUrlPromise: Promise<string | null> | null = null;

const loadImageDataUrl = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => reject(reader.error);
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

const formatPdfCurrency = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `INR ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(safeValue)}`;
};

const pickValueFontSize = (value: string, large = false) => {
  if (value.length > 28) return large ? 10.5 : 10;
  if (value.length > 18) return large ? 12 : 11;
  return large ? 14.5 : 12.5;
};

const drawBadge = (
  pdf: any,
  x: number,
  y: number,
  text: string,
  colors?: { border: [number, number, number]; fill: [number, number, number]; text: [number, number, number] }
) => {
  const safeText = text || "-";
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  const textWidth = pdf.getTextWidth(safeText);
  const badgeWidth = textWidth + 9;

  pdf.setDrawColor(...(colors?.border || [214, 223, 233]));
  pdf.setFillColor(...(colors?.fill || [255, 255, 255]));
  pdf.roundedRect(x, y, badgeWidth, 7, 3.5, 3.5, "FD");
  pdf.setTextColor(...(colors?.text || [30, 41, 59]));
  pdf.text(safeText, x + 4.5, y + 4.8);

  return badgeWidth;
};

const drawMetricCard = (
  pdf: any,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  description: string,
  accent?: { border: [number, number, number]; fill: [number, number, number]; text: [number, number, number] }
) => {
  const height = 30;
  pdf.setDrawColor(...(accent?.border || [214, 223, 233]));
  pdf.setFillColor(...(accent?.fill || [255, 255, 255]));
  pdf.roundedRect(x, y, width, height, 5.5, 5.5, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text(label.toUpperCase(), x + 4.5, y + 7.5);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(pickValueFontSize(value, true));
  pdf.setTextColor(...(accent?.text || [15, 23, 42]));
  pdf.text(value, x + 4.5, y + 17.5);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.8);
  pdf.setTextColor(71, 85, 105);
  const descriptionLines = pdf.splitTextToSize(description, width - 9);
  pdf.text(descriptionLines, x + 4.5, y + 24.5);

  return height;
};

const drawTableCard = (
  pdf: any,
  x: number,
  y: number,
  width: number,
  title: string,
  rows: Array<{ label: string; value: number }>
) => {
  const titleHeight = 14;
  const tableHeaderHeight = 8;
  const rowHeight = 8;
  const cardHeight = titleHeight + tableHeaderHeight + rows.length * rowHeight + 6;

  pdf.setDrawColor(214, 223, 233);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, width, cardHeight, 6, 6, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(15, 23, 42);
  pdf.text(title, x + 6, y + 9);

  pdf.setDrawColor(241, 245, 249);
  pdf.line(x, y + titleHeight, x + width, y + titleHeight);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text("COMPONENT", x + 6, y + titleHeight + 5.5);
  pdf.text("AMOUNT", x + width - 6, y + titleHeight + 5.5, { align: "right" });

  pdf.setDrawColor(232, 238, 245);
  pdf.line(x, y + titleHeight + tableHeaderHeight, x + width, y + titleHeight + tableHeaderHeight);

  let rowY = y + titleHeight + tableHeaderHeight + 6;
  rows.forEach((row, index) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(51, 65, 85);
    pdf.text(row.label, x + 6, rowY);

    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42);
    pdf.text(formatPdfCurrency(row.value), x + width - 6, rowY, { align: "right" });

    if (index < rows.length - 1) {
      pdf.setDrawColor(241, 245, 249);
      pdf.line(x, rowY + 4, x + width, rowY + 4);
    }

    rowY += rowHeight;
  });

  return cardHeight;
};

const drawAttendanceCard = (
  pdf: any,
  x: number,
  y: number,
  width: number,
  attendanceDays: number,
  items: Array<{ label: string; value: string }>
) => {
  const rowHeight = 7.5;
  const topPanelHeight = 22;
  const cardHeight = 14 + topPanelHeight + items.length * rowHeight + 7;

  pdf.setDrawColor(214, 223, 233);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, width, cardHeight, 6, 6, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text("ATTENDANCE SUMMARY", x + 6, y + 8.5);

  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(x + 6, y + 12, width - 12, topPanelHeight, 4.5, 4.5, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text("ATTENDANCE DAYS", x + 10, y + 18.5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(15, 23, 42);
  pdf.text(String(attendanceDays), x + 10, y + 29);

  let rowY = y + 40;
  items.forEach((item, index) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(item.label, x + 6, rowY);

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(71, 85, 105);
    const valueLines = pdf.splitTextToSize(item.value, width / 2);
    pdf.text(valueLines, x + width - 6, rowY, { align: "right" });

    if (index < items.length - 1) {
      pdf.setDrawColor(241, 245, 249);
      pdf.line(x + 6, rowY + 3.3, x + width - 6, rowY + 3.3);
    }

    rowY += rowHeight;
  });

  return cardHeight;
};

const drawDetailCard = (pdf: any, x: number, y: number, width: number, label: string, value: string) => {
  const safeValue = value || "-";
  const lines = pdf.splitTextToSize(safeValue, width - 10);
  const valueFontSize = pickValueFontSize(safeValue);
  const bodyHeight = Math.max(10, lines.length * 5.2);
  const cardHeight = 15 + bodyHeight;

  pdf.setDrawColor(214, 223, 233);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, width, cardHeight, 5, 5, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.2);
  pdf.setTextColor(100, 116, 139);
  pdf.text(label.toUpperCase(), x + 4.5, y + 7.2);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(valueFontSize);
  pdf.setTextColor(15, 23, 42);
  pdf.text(lines, x + 4.5, y + 14.2);

  return cardHeight;
};

const drawNotesCard = (pdf: any, x: number, y: number, width: number, note: string, maxHeight: number) => {
  const noteLines = pdf.splitTextToSize(note, width - 14);
  const lineHeight = 4.3;
  const desiredHeight = 13 + noteLines.length * lineHeight;
  const height = Math.min(Math.max(desiredHeight, 18), maxHeight);
  const visibleLines = Math.max(Math.floor((height - 13) / lineHeight), 1);
  const clippedLines =
    noteLines.length > visibleLines ? [...noteLines.slice(0, visibleLines), "..."] : noteLines;

  pdf.setDrawColor(214, 223, 233);
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(x, y, width, height, 6, 6, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text("PAYROLL NOTES", x + 7, y + 8);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(51, 65, 85);
  pdf.text(clippedLines, x + 7, y + 14);
};

export const renderSalarySlipPdfPage = (
  pdf: any,
  employee: HrEmployee,
  record: PayrollRecord,
  logoDataUrl?: string | null
) => {
  const attendanceDays = getAttendanceDays(record);
  const generatedAt = format(new Date(), "dd MMM yyyy, hh:mm a");
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
    { label: "Employee Provident Fund (EPF)", value: record.deductions.pf, conditional: true },
    { label: "Health Insurance / ESI", value: record.deductions.esi, conditional: true },
    { label: "Professional Tax (PT)", value: record.deductions.professionalTax, conditional: true },
    { label: "TDS", value: record.deductions.tds, conditional: true },
    { label: otherDeductionLabel, value: record.deductions.otherDeduction, conditional: true },
    { label: "Other Deductions", value: record.deductions.other, conditional: true },
  ].filter((row) => !row.conditional || row.value > 0);
  const attendanceSummaryItems = [
    { label: "Working Days", value: String(record.workingDays) },
    { label: "Week Off", value: String(record.weekOffDays) },
    { label: "Leave / LOP", value: String(record.leaveDays) },
    { label: "LOP", value: String(record.lopDays) },
    {
      label: "Payment Mode",
      value: record.paymentMode === "full_payment" ? "Full Payment" : "Attendance Based",
    },
    { label: "Paid Days", value: String(record.paidDays) },
  ];
  const hasUan = Boolean(employee.uanNumber?.trim());
  const hasEsi = Boolean(employee.esiNumber?.trim());
  const detailCards = [
    { label: "Bank Name", value: employee.bankName || "-" },
    { label: "Account Number", value: employee.bankAccountNumber || "-" },
    { label: "IFSC", value: employee.bankIfsc || "-" },
    ...(hasUan || hasEsi
      ? [{
          label: hasUan && hasEsi ? "UAN / ESI" : hasUan ? "UAN (PF Number)" : "ESI Number",
          value: hasUan && hasEsi
            ? `${employee.uanNumber} / ${employee.esiNumber}`
            : hasUan ? employee.uanNumber! : employee.esiNumber!,
        }]
      : []),
  ];

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const sheetX = margin;
  const sheetY = 8;
  const sheetWidth = pageWidth - margin * 2;
  const sheetHeight = pageHeight - 16;
  const innerX = sheetX + 5;
  const innerWidth = sheetWidth - 10;
  const rightX = sheetX + sheetWidth - 5;
  const metricGap = 4;
  const metricWidth = (innerWidth - metricGap * 3) / 4;
  const sectionGap = 4.5;
  const leftColumnWidth = (innerWidth - sectionGap) * 0.56;
  const rightColumnWidth = innerWidth - sectionGap - leftColumnWidth;

  pdf.setFillColor(248, 250, 252);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");

  pdf.setDrawColor(214, 223, 233);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(sheetX, sheetY, sheetWidth, sheetHeight, 8, 8, "FD");
  pdf.setFillColor(247, 251, 255);
  pdf.roundedRect(sheetX, sheetY, sheetWidth, 48, 8, 8, "F");
  pdf.rect(sheetX, sheetY + 30, sheetWidth, 18, "F");

  if (logoDataUrl) {
    pdf.setDrawColor(214, 223, 233);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(innerX + 2, 15, 17, 17, 4, 4, "FD");
    pdf.addImage(logoDataUrl, "PNG", innerX + 5, 18, 11, 11);
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.8);
  pdf.setTextColor(100, 116, 139);
  pdf.text("PAYROLL STATEMENT", innerX + 24, 18.5);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.setTextColor(2, 6, 23);
  pdf.text("Salary Slip", innerX + 24, 29);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(71, 85, 105);
  pdf.text(formatMonthLabel(record.month), innerX + 24, 37.5);

  let badgeX = innerX + 24;
  const badgeY = 43;
  badgeX += drawBadge(pdf, badgeX, badgeY, employee.employeeCode || "No employee code") + 3;
  badgeX += drawBadge(pdf, badgeX, badgeY, employee.department || "No department") + 3;
  drawBadge(pdf, badgeX, badgeY, roleLabel(employee), {
    border: [167, 243, 208],
    fill: [236, 253, 245],
    text: [5, 150, 105],
  });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(2, 6, 23);
  pdf.text(COMPANY_NAME, rightX - 1, 18.5, { align: "right" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.2);
  pdf.setTextColor(71, 85, 105);
  pdf.text("Printable payroll summary for employee records.", rightX - 1, 24.8, { align: "right" });

  pdf.setFontSize(8);
  pdf.text(`Employee: ${employee.name || "-"}`, rightX - 1, 31.5, { align: "right" });
  pdf.text(`Joining Date: ${formatDateLabel(employee.joiningDate)}`, rightX - 1, 36.7, { align: "right" });
  pdf.text(`Store: ${employee.store || "-"}`, rightX - 1, 41.9, { align: "right" });
  pdf.text(`Generated: ${generatedAt}`, rightX - 1, 47.1, { align: "right" });

  const metricsTop = 57;
  const metricBottom = metricsTop + drawMetricCard(
    pdf,
    innerX,
    metricsTop,
    metricWidth,
    "Net Pay",
    formatPdfCurrency(record.netPay),
    "Amount payable",
    {
      border: [167, 243, 208],
      fill: [240, 253, 244],
      text: [5, 150, 105],
    }
  );
  drawMetricCard(
    pdf,
    innerX + metricWidth + metricGap,
    metricsTop,
    metricWidth,
    "Gross Earnings",
    formatPdfCurrency(record.grossEarnings),
    "Before deductions"
  );
  drawMetricCard(
    pdf,
    innerX + (metricWidth + metricGap) * 2,
    metricsTop,
    metricWidth,
    "Total Deductions",
    formatPdfCurrency(record.totalDeductions),
    "PF, ESI, tax, and others"
  );
  drawMetricCard(
    pdf,
    innerX + (metricWidth + metricGap) * 3,
    metricsTop,
    metricWidth,
    "Attendance",
    String(attendanceDays),
    "Actual attendance days this month"
  );

  const tableTop = metricBottom + 8;
  const earningsHeight = drawTableCard(pdf, innerX, tableTop, leftColumnWidth, "Earnings Breakdown", earningsRows);
  const deductionsHeight = drawTableCard(
    pdf,
    innerX + leftColumnWidth + sectionGap,
    tableTop,
    rightColumnWidth,
    "Deductions",
    deductionRows
  );

  const attendanceTop = tableTop + deductionsHeight + 4.5;
  const attendanceHeight = drawAttendanceCard(
    pdf,
    innerX + leftColumnWidth + sectionGap,
    attendanceTop,
    rightColumnWidth,
    attendanceDays,
    attendanceSummaryItems
  );

  const bankTop = Math.max(tableTop + earningsHeight, attendanceTop + attendanceHeight) + 7;
  const detailGap = 4;
  const detailWidth = (innerWidth - detailGap * 3) / 4;
  let detailMaxHeight = 0;
  detailCards.forEach((card, index) => {
    const cardHeight = drawDetailCard(
      pdf,
      innerX + index * (detailWidth + detailGap),
      bankTop,
      detailWidth,
      card.label,
      card.value
    );
    detailMaxHeight = Math.max(detailMaxHeight, cardHeight);
  });

  if (!record.notes) return;

  const notesTop = bankTop + detailMaxHeight + 6;
  const notesMaxHeight = pageHeight - margin - notesTop;
  if (notesMaxHeight < 18) return;
  drawNotesCard(pdf, innerX, notesTop, innerWidth, record.notes, notesMaxHeight);
};

export const saveSalarySlipPdfBundle = async (
  slips: Array<{ employee: HrEmployee; record: PayrollRecord }>,
  fileName: string
) => {
  if (!slips.length) return;

  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF("p", "mm", "a4");
  const logoDataUrl = await getSalarySlipLogoDataUrl();

  slips.forEach((slip, index) => {
    if (index > 0) pdf.addPage();
    renderSalarySlipPdfPage(pdf, slip.employee, slip.record, logoDataUrl);
  });

  pdf.save(fileName);
};
