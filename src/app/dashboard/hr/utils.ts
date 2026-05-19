import { format, formatDistanceToNow } from "date-fns";
import type {
  AttendanceRecord,
  HrEmployee,
  HrLeaveRequest,
  PayrollRecord,
  PayrollRow,
} from "./types";

// ─── Company constants ────────────────────────────────────────────────────────

export const COMPANY_NAME = "MO Designs Pvt. Ltd.";
export const COMPANY_LOGO_PATH = "/logo.png";

export const HR_ROLE_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "salesman", label: "Salesman" },
  { value: "Accounts", label: "Accounts" },
  { value: "Purchase", label: "Purchase" },
  { value: "Hr", label: "HR" },
  { value: "installer", label: "Installer" },
] as const;

export const HR_STORE_OPTIONS = [
  "MO GCR BRANCH",
  "MO MG ROAD",
  "MO SULTANPUR",
] as const;

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ─── Label constants ──────────────────────────────────────────────────────────

export const LEAVE_TYPE_LABELS: Record<HrLeaveRequest["leaveType"], string> = {
  casual: "Casual Leave",
  sick: "Sick Leave",
  earned: "Earned Leave",
  unpaid: "Unpaid Leave",
};

export const EXIT_TYPE_LABELS: Record<string, string> = {
  resignation: "Resignation",
  termination: "Termination",
  retirement: "Retirement",
  contract_end: "Contract End",
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceRecord["status"], string> = {
  present: "Present",
  absent: "Absent",
  missed_punch: "Missed Punch",
  half_day: "Half Day",
  late: "Late",
  holiday: "Holiday",
  week_off: "Week Off",
  week_off_present: "Week Off Present",
  on_leave: "On Leave",
};

export const LEAVE_PROBATION_MONTHS = 6;
export const LEAVE_PROBATION_MONTHLY_ACCRUAL = 1;
export const LEAVE_MONTHLY_ACCRUAL = 2.4;
export const LEAVE_HALF_DAY_MONTHLY_ALLOWANCE = 1;
export const LEAVE_SHORT_LEAVE_MONTHLY_ALLOWANCE = 1;

// ─── Pure math helpers ────────────────────────────────────────────────────────

export const parseNumber = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim() || "0");
  return Number.isFinite(parsed) ? parsed : 0;
};

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const normalizeText = (value?: string) => String(value || "").trim().toLowerCase();
export const safeText = (value?: string) => String(value || "").trim();

// ─── Date / format helpers ────────────────────────────────────────────────────

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

export const formatDutyLabel = (start?: string, end?: string) => {
  if (!start || !end) return "Not set";
  return `${start} - ${end}`;
};

export const roleLabel = (user: HrEmployee) => {
  if (user.role === "employee" && user.designation) return `Employee / ${user.designation}`;
  return user.role;
};

export const updatedTimeLabel = (value?: string) => {
  if (!value) return "Not submitted";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not submitted";
  return `${format(parsed, "dd MMM, hh:mm a")} (${formatDistanceToNow(parsed, { addSuffix: true })})`;
};

export const formatMonthLabel = (month: string) => {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return format(parsed, "MMMM yyyy");
};

export const formatDateLabel = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "dd MMM yyyy");
};

export const getMonthKeyFromDate = (value?: string) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return format(parsed, "yyyy-MM");
};

export const listMonthKeysInRange = (startMonth: string, endMonth: string) => {
  if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) return [];

  const [startYear, startMonthValue] = startMonth.split("-").map(Number);
  const [endYear, endMonthValue] = endMonth.split("-").map(Number);
  const cursor = new Date(startYear, startMonthValue - 1, 1);
  const end = new Date(endYear, endMonthValue - 1, 1);
  const months: string[] = [];

  while (cursor <= end) {
    months.push(format(cursor, "yyyy-MM"));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
};

export const getMonthDayCount = (month: string) => {
  if (!/^\d{4}-\d{2}$/.test(month)) return 30;
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return 30;
  return new Date(year, monthIndex, 0).getDate();
};

export const getEmploymentStatus = (user: HrEmployee) => user.employmentStatus || "active";

export const getAttendanceDays = (record: Pick<PayrollRecord, "workingDays" | "weekOffDays" | "leaveDays">) =>
  Math.max(record.workingDays - record.weekOffDays - record.leaveDays, 0);

export const hasSalaryConfig = (user: HrEmployee) =>
  [
    user.salaryBasic,
    user.salaryHra,
    user.salarySpecialAllowance,
    user.salaryOtherAllowance,
    user.salaryPf,
    user.salaryEsi,
    user.salaryProfessionalTax,
    user.salaryTds,
  ].some((value) => Number(value || 0) > 0);

// ─── CSV export utility ───────────────────────────────────────────────────────

export const exportCsv = (filename: string, rows: (string | number | undefined | null)[][]) => {
  const content = rows
    .map((row) =>
      row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const exportPayrollCsv = (rows: PayrollRow[], month: string) => {
  const headers = [
    "Employee", "Code", "Department", "Store", "Status",
    "Working Days", "Paid Days", "LOP Days", "Payment Mode",
    "Basic", "HRA", "Special Allowance", "Other Allowance",
    "Overtime", "Bonus", "Incentive", "Reimbursements",
    "Gross Earnings", "PF", "ESI", "Prof Tax", "TDS", "Other Deductions",
    "Total Deductions", "Net Pay",
  ];
  const data = rows.map((r) => [
    r.employee.name, r.employee.employeeCode, r.employee.department, r.employee.store,
    r.status,
    r.record.workingDays, r.record.paidDays, r.record.lopDays, r.record.paymentMode,
    r.record.earnings.basic, r.record.earnings.hra,
    r.record.earnings.specialAllowance, r.record.earnings.otherAllowance,
    r.record.overtimeAmount, r.record.bonus, r.record.incentive, r.record.reimbursements,
    r.record.grossEarnings,
    r.record.deductions.pf, r.record.deductions.esi,
    r.record.deductions.professionalTax, r.record.deductions.tds, r.record.deductions.other,
    r.record.totalDeductions, r.record.netPay,
  ]);
  exportCsv(`Payroll-${month}.csv`, [headers, ...data]);
};

export const exportEmployeeRosterCsv = (employees: HrEmployee[]) => {
  const headers = [
    "Name", "Employee Code", "Role", "Department", "Store", "Designation",
    "Employment Status", "Joining Date", "Email", "Phone",
    "Reporting Manager", "Education", "Experience",
    "PAN", "Aadhaar", "UAN", "ESI",
    "Bank Name", "Account No", "IFSC",
    "Salary Basic", "Salary HRA", "Special Allowance", "Other Allowance",
    "PF", "ESI Deduction", "Prof Tax", "TDS",
  ];
  const data = employees.map((e) => [
    e.name, e.employeeCode, e.role, e.department, e.store, e.designation,
    e.employmentStatus || "active", e.joiningDate, e.email, e.phone,
    e.reportingManager, e.education,
    e.experienceType === "experienced" ? e.experience : "Fresher",
    e.panNumber, e.aadhaarNumber, e.uanNumber, e.esiNumber,
    e.bankName, e.bankAccountNumber, e.bankIfsc,
    e.salaryBasic, e.salaryHra, e.salarySpecialAllowance, e.salaryOtherAllowance,
    e.salaryPf, e.salaryEsi, e.salaryProfessionalTax, e.salaryTds,
  ]);
  exportCsv(`Employee-Roster-${format(new Date(), "yyyy-MM-dd")}.csv`, [headers, ...data]);
};

// ─── Re-exports from domain sub-files ────────────────────────────────────────

export * from "./utils/employee-utils";
export * from "./utils/attendance-leave-utils";
export * from "./utils/hr-tools-utils";
