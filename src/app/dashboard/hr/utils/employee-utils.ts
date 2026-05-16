import type { User } from "@/lib/types";
import type {
  AttendanceSummary,
  EmployeeFormState,
  EmployeePerformanceRow,
  HrEmployee,
  PayrollFormState,
  PayrollRecord,
  SalaryTemplate,
  TimesheetSummary,
} from "../types";

// ─── Shared helpers (inlined to avoid circular deps) ─────────────────────────

const parseNumber = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim() || "0");
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const safeText = (value?: string) => String(value || "").trim();

const getMonthDayCount = (month: string) => {
  if (!/^\d{4}-\d{2}$/.test(month)) return 30;
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return 30;
  return new Date(year, monthIndex, 0).getDate();
};

// private helpers (also exported from parent utils.ts — not re-exported here to avoid conflicts)
const getEmploymentStatus = (user: HrEmployee) => user.employmentStatus || "active";

const hasSalaryConfig = (user: HrEmployee) =>
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

// ─── Blank / mapping ──────────────────────────────────────────────────────────

export const createBlankManualEmployee = (prefill: Partial<HrEmployee> = {}): HrEmployee => ({
  id: "manual:new",
  recordId: "",
  recordSource: "manual",
  linkedUserId: undefined,
  hasLoginAccount: false,
  name: "",
  email: "",
  phone: "",
  role: "employee",
  store: "",
  employmentStatus: "active",
  ...prefill,
  permissions: prefill.permissions || [],
});

export const mapAccountUserToHrEmployee = (entry: User): HrEmployee => ({
  ...entry,
  recordId: entry.id,
  recordSource: "account",
  linkedUserId: entry.id,
  hasLoginAccount: true,
  phone: (entry as any).phone || "",
});

export const mapManualEmployeeToHrEmployee = (id: string, data: any): HrEmployee => ({
  ...(data || {}),
  id: `manual:${id}`,
  recordId: id,
  recordSource: "manual",
  linkedUserId: typeof data?.linkedUserId === "string" ? data.linkedUserId : undefined,
  hasLoginAccount: false,
  name: String(data?.name || "Unnamed Employee"),
  email: String(data?.email || ""),
  phone: String(data?.phone || ""),
  role: (data?.role || "employee") as User["role"],
  permissions: [],
  store: String(data?.store || ""),
});

// ─── Form state ───────────────────────────────────────────────────────────────

export const createEmployeeFormState = (user: HrEmployee): EmployeeFormState => ({
  name: user.name || "",
  email: user.email || "",
  phone: user.phone || "",
  role: user.role || "employee",
  store: user.store || "",
  timesheetEnabled: Boolean(user.timesheetEnabled),
  employeeCode: user.employeeCode || "",
  biometricId: user.biometricId || "",
  department: user.department || "",
  education: user.education || "",
  tenthBoardName: user.tenthBoardName || "",
  tenthMarks: user.tenthMarks || "",
  twelfthBoardName: user.twelfthBoardName || "",
  twelfthMarks: user.twelfthMarks || "",
  bachelorBoardName: user.bachelorBoardName || "",
  bachelorMarks: user.bachelorMarks || "",
  masterBoardName: user.masterBoardName || "",
  masterMarks: user.masterMarks || "",
  additionalQualification: user.additionalQualification || "",
  experienceType: user.experienceType || "fresher",
  experience: user.experience || "",
  designation: user.designation || "",
  reportingManager: user.reportingManager || "",
  joiningDate: user.joiningDate || "",
  workingTimeFrom: user.timesheetDutyStart || "",
  workingTimeTo: user.timesheetDutyEnd || "",
  employmentStatus: getEmploymentStatus(user),
  panNumber: user.panNumber || "",
  aadhaarNumber: user.aadhaarNumber || "",
  bankName: user.bankName || "",
  bankAccountNumber: user.bankAccountNumber || "",
  bankIfsc: user.bankIfsc || "",
  uanNumber: user.uanNumber || "",
  esiNumber: user.esiNumber || "",
  medicalInsurance: user.medicalInsurance || "",
  issuedAssets: user.issuedAssets || "",
  salaryBasic: String(user.salaryBasic || ""),
  salaryHra: String(user.salaryHra || ""),
  salarySpecialAllowance: String(user.salarySpecialAllowance || ""),
  salaryOtherAllowance: String(user.salaryOtherAllowance || ""),
  salaryPf: String(user.salaryPf || ""),
  salaryEsi: String(user.salaryEsi || ""),
  salaryProfessionalTax: String(user.salaryProfessionalTax || ""),
  salaryTds: String(user.salaryTds || ""),
  hasPf: user.hasPf ?? false,
  hasHealthInsurance: user.hasHealthInsurance ?? false,
  drivingLicense: user.drivingLicense || "",
  voterId: user.voterId || "",
  passportNumber: user.passportNumber || "",
  salaryOtherDeduction: String(user.salaryOtherDeduction || ""),
  salaryOtherDeductionLabel: user.salaryOtherDeductionLabel || "",
  photoUrl: user.photoUrl || "",
});

// ─── Salary template ──────────────────────────────────────────────────────────

export const buildSalaryTemplate = (user: HrEmployee, existing?: PayrollRecord): SalaryTemplate => {
  const employeeTemplate = {
    basic: parseNumber(user.salaryBasic),
    hra: parseNumber(user.salaryHra),
    specialAllowance: parseNumber(user.salarySpecialAllowance),
    otherAllowance: parseNumber(user.salaryOtherAllowance),
    pf: user.hasPf ? parseNumber(user.salaryPf) : 0,
    esi: user.hasHealthInsurance ? parseNumber(user.salaryEsi) : 0,
    professionalTax: parseNumber(user.salaryProfessionalTax),
    tds: parseNumber(user.salaryTds),
    otherDeduction: parseNumber(user.salaryOtherDeduction),
  };

  const hasEmployeeTemplate = Object.values(employeeTemplate).some((value) => value > 0);
  if (hasEmployeeTemplate) {
    return employeeTemplate;
  }

  return existing?.salaryTemplate || employeeTemplate;
};

export const getSalaryTemplateTotal = (template: SalaryTemplate) =>
  template.basic + template.hra + template.specialAllowance + template.otherAllowance;

export const getProfileCompletion = (employee: HrEmployee) => {
  const checks = [
    employee.name,
    employee.role,
    employee.store,
    employee.employeeCode,
    employee.department,
    employee.education,
    employee.tenthBoardName,
    employee.tenthMarks,
    employee.additionalQualification,
    employee.experienceType,
    employee.experience,
    employee.joiningDate,
    employee.phone,
    employee.bankName,
    employee.bankAccountNumber,
    employee.bankIfsc,
    employee.panNumber,
    employee.salaryBasic,
  ];
  const filled = checks.filter((value) => safeText(String(value || ""))).length;
  return Math.round((filled / checks.length) * 100);
};

// ─── Payroll record builders ──────────────────────────────────────────────────

const stripUndefinedDeep = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedDeep(entry)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
    ) as T;
  }
  return value;
};

export const createPayrollFormState = (record?: PayrollRecord, month?: string): PayrollFormState => ({
  workingDays: String(record?.workingDays || getMonthDayCount(month || "")),
  weekOffDays: String(record?.weekOffDays || 4),
  leaveDays: String(record?.leaveDays || 0),
  paymentMode: record?.paymentMode || "full_payment",
  overtimeHours: String(record?.overtimeHours || 0),
  overtimeAmount: String(record?.overtimeAmount || 0),
  bonus: String(record?.bonus || 0),
  incentive: String(record?.incentive || 0),
  reimbursements: String(record?.reimbursements || 0),
  otherDeductions: String(record?.otherDeductions || 0),
  notes: record?.notes || "",
});

export const createAttendancePayrollFormState = (
  month: string,
  attendanceSummary: Pick<AttendanceSummary, "workingDays" | "weekOff" | "lopDays">,
  record?: PayrollRecord
): PayrollFormState => {
  const baseForm = createPayrollFormState(record, month);
  return {
    ...baseForm,
    workingDays: String(attendanceSummary.workingDays || getMonthDayCount(month)),
    weekOffDays: String(attendanceSummary.weekOff || 0),
    leaveDays: String(attendanceSummary.lopDays || 0),
    paymentMode: "prorated",
  };
};

export const buildPayrollRecord = (
  employee: HrEmployee,
  month: string,
  formState: PayrollFormState,
  actor?: { id: string; name: string },
  existing?: PayrollRecord
): PayrollRecord => {
  const salaryTemplate = buildSalaryTemplate(employee, existing);
  const workingDays = Math.max(parseNumber(formState.workingDays), 0) || getMonthDayCount(month);
  const weekOffDays = Math.max(parseNumber(formState.weekOffDays), 0);
  const leaveDays = Math.max(parseNumber(formState.leaveDays), 0);
  const paymentMode = formState.paymentMode || "full_payment";
  const attendanceDays = Math.max(Math.min(workingDays - weekOffDays - leaveDays, workingDays), 0);
  const paidDays =
    paymentMode === "full_payment"
      ? workingDays
      : Math.max(Math.min(workingDays - leaveDays, workingDays), 0);
  const lopDays = paymentMode === "full_payment" ? 0 : Math.max(leaveDays, 0);
  const ratio = workingDays > 0 ? paidDays / workingDays : 0;
  const overtimeHours = Math.max(parseNumber(formState.overtimeHours), 0);
  const overtimeAmount = Math.max(parseNumber(formState.overtimeAmount), 0);
  const bonus = Math.max(parseNumber(formState.bonus), 0);
  const incentive = Math.max(parseNumber(formState.incentive), 0);
  const reimbursements = Math.max(parseNumber(formState.reimbursements), 0);
  const otherDeductions = Math.max(parseNumber(formState.otherDeductions), 0);

  const earnings = {
    basic: roundMoney(salaryTemplate.basic * ratio),
    hra: roundMoney(salaryTemplate.hra * ratio),
    specialAllowance: roundMoney(salaryTemplate.specialAllowance * ratio),
    otherAllowance: roundMoney(salaryTemplate.otherAllowance * ratio),
  };

  const deductions = {
    pf: roundMoney(salaryTemplate.pf),
    esi: roundMoney(salaryTemplate.esi),
    professionalTax: roundMoney(salaryTemplate.professionalTax),
    tds: roundMoney(salaryTemplate.tds),
    otherDeduction: roundMoney(salaryTemplate.otherDeduction),
    other: roundMoney(otherDeductions),
  };

  const grossEarnings = roundMoney(
    earnings.basic +
      earnings.hra +
      earnings.specialAllowance +
      earnings.otherAllowance +
      overtimeAmount +
      bonus +
      incentive +
      reimbursements
  );

  const totalDeductions = roundMoney(
    deductions.pf + deductions.esi + deductions.professionalTax + deductions.tds + deductions.otherDeduction + deductions.other
  );

  const netPay = roundMoney(grossEarnings - totalDeductions);
  const updatedAt = new Date().toISOString();

  return stripUndefinedDeep({
    id: existing?.id || `${month}_${employee.id}`,
    month,
    userId: employee.id,
    employeeName: employee.name,
    employeeCode: employee.employeeCode || undefined,
    department: employee.department || undefined,
    role: employee.role,
    designation: employee.designation,
    store: employee.store,
    workingDays,
    weekOffDays,
    leaveDays,
    paymentMode,
    paidDays,
    lopDays,
    overtimeHours,
    overtimeAmount,
    bonus,
    incentive,
    reimbursements,
    otherDeductions,
    notes: formState.notes.trim() || undefined,
    salaryTemplate,
    earnings,
    deductions,
    grossEarnings,
    totalDeductions,
    netPay,
    updatedAt,
    generatedBy: actor,
  });
};

export const createDraftPayrollRecord = (employee: HrEmployee, month: string, existing?: PayrollRecord) =>
  buildPayrollRecord(
    employee,
    month,
    createPayrollFormState(existing, month),
    existing?.generatedBy,
    existing
  );

// ─── Performance row ──────────────────────────────────────────────────────────

export const buildEmployeePerformanceRow = (
  employee: HrEmployee,
  timesheetSummary?: TimesheetSummary,
  payrollRecord?: PayrollRecord,
  attendanceSummary?: AttendanceSummary
): EmployeePerformanceRow => {
  const profileCompletion = getProfileCompletion(employee);
  const timesheetTracked = Boolean(employee.timesheetEnabled) && employee.role !== "installer";
  const timesheetStatus = !timesheetTracked ? "not_tracked" : timesheetSummary ? "submitted" : "pending";
  const timesheetScore = !timesheetTracked ? 15 : timesheetSummary ? 30 : 0;
  const attendancePaidDays = payrollRecord?.workingDays
    ? payrollRecord.paidDays
    : (attendanceSummary?.workingDays ? attendanceSummary.paidDays : null);
  const attendanceWorkingDays = payrollRecord?.workingDays
    ? payrollRecord.workingDays
    : (attendanceSummary?.workingDays || null);
  const attendanceRatio = attendanceWorkingDays
    ? (attendancePaidDays ?? 0) / attendanceWorkingDays
    : null;
  const attendanceScore =
    attendanceRatio === null ? 10 : Math.max(0, Math.min(30, Math.round(attendanceRatio * 30)));
  const payrollStatus = payrollRecord
    ? "generated"
    : hasSalaryConfig(employee)
      ? "draft"
      : "salary_missing";
  const payrollScore =
    payrollStatus === "generated" ? 15 : payrollStatus === "draft" ? 8 : 0;
  const profileScore = Math.round(profileCompletion * 0.25);
  const score = Math.max(0, Math.min(100, profileScore + timesheetScore + attendanceScore + payrollScore));
  const band =
    score >= 85 ? "excellent" : score >= 65 ? "good" : score >= 40 ? "watch" : "critical";

  let note = "Profile needs more HR details.";
  if (band === "excellent") note = "Strong profile, attendance, and payroll readiness.";
  else if (band === "good") note = "Stable performance with minor follow-up needed.";
  else if (payrollStatus === "salary_missing") note = "Salary template missing for payroll.";
  else if (timesheetStatus === "pending") note = "Waiting for today's timesheet submission.";
  else if (attendanceRatio !== null && attendanceRatio < 0.9) note = "Attendance ratio is below target this month.";

  return {
    employee,
    score,
    band,
    profileCompletion,
    timesheetScore,
    attendanceScore,
    payrollScore,
    timesheetStatus,
    attendanceRatio,
    attendancePaidDays,
    attendanceWorkingDays,
    payrollStatus,
    note,
  };
};
