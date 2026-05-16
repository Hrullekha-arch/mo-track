import type { User } from "@/lib/types";

export type HrEmployee = Omit<User, "designation"> & {
  recordId: string;
  recordSource: "account" | "manual";
  linkedUserId?: string;
  hasLoginAccount: boolean;
  phone?: string;
  employeeCode?: string;
  department?: string;
  designation?: string;
  education?: string;
  tenthBoardName?: string;
  tenthMarks?: string;
  twelfthBoardName?: string;
  twelfthMarks?: string;
  bachelorBoardName?: string;
  bachelorMarks?: string;
  masterBoardName?: string;
  masterMarks?: string;
  additionalQualification?: string;
  experienceType?: "fresher" | "experienced";
  experience?: string;
  reportingManager?: string;
  joiningDate?: string;
  employmentStatus?: "active" | "on_leave" | "inactive";
  panNumber?: string;
  aadhaarNumber?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  uanNumber?: string;
  esiNumber?: string;
  medicalInsurance?: string;
  issuedAssets?: string;
  biometricId?: string;
  salaryBasic?: number;
  salaryHra?: number;
  salarySpecialAllowance?: number;
  salaryOtherAllowance?: number;
  salaryOtherDeduction?: number;
  salaryOtherDeductionLabel?: string;
  salaryPf?: number;
  salaryEsi?: number;
  salaryProfessionalTax?: number;
  salaryTds?: number;
  hasPf?: boolean;
  hasHealthInsurance?: boolean;
  drivingLicense?: string;
  voterId?: string;
  passportNumber?: string;
  photoUrl?: string;
};

export type TimesheetSummary = {
  userId: string;
  dutyStart?: string;
  dutyEnd?: string;
  remark?: string;
  updatedAt?: string;
  filledSlots: number;
  totalSlots: number;
};

export type SalaryTemplate = {
  basic: number;
  hra: number;
  specialAllowance: number;
  otherAllowance: number;
  pf: number;
  esi: number;
  professionalTax: number;
  tds: number;
  otherDeduction: number;
};

export type PayrollRecord = {
  id: string;
  month: string;
  userId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  role?: string;
  designation?: string;
  store?: string;
  workingDays: number;
  weekOffDays: number;
  leaveDays: number;
  paymentMode: "full_payment" | "prorated";
  paidDays: number;
  lopDays: number;
  overtimeHours: number;
  overtimeAmount: number;
  bonus: number;
  incentive: number;
  reimbursements: number;
  otherDeductions: number;
  notes?: string;
  salaryTemplate: SalaryTemplate;
  earnings: {
    basic: number;
    hra: number;
    specialAllowance: number;
    otherAllowance: number;
  };
  deductions: {
    pf: number;
    esi: number;
    professionalTax: number;
    tds: number;
    otherDeduction: number;
    other: number;
  };
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  updatedAt?: string;
  generatedBy?: {
    id: string;
    name: string;
  };
};

export type HrTimesheetRow = {
  user: HrEmployee;
  status: "submitted" | "pending";
  dutyLabel: string;
  filledSlots: number;
  totalSlots: number;
  remark: string;
  updatedAt?: string;
};

export type EmployeeFormState = {
  name: string;
  email: string;
  phone: string;
  role: string;
  store: string;
  timesheetEnabled: boolean;
  employeeCode: string;
  biometricId: string;
  department: string;
  education: string;
  tenthBoardName: string;
  tenthMarks: string;
  twelfthBoardName: string;
  twelfthMarks: string;
  bachelorBoardName: string;
  bachelorMarks: string;
  masterBoardName: string;
  masterMarks: string;
  additionalQualification: string;
  experienceType: "fresher" | "experienced";
  experience: string;
  designation: string;
  reportingManager: string;
  joiningDate: string;
  workingTimeFrom: string;
  workingTimeTo: string;
  employmentStatus: "active" | "on_leave" | "inactive";
  panNumber: string;
  aadhaarNumber: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  uanNumber: string;
  esiNumber: string;
  medicalInsurance: string;
  issuedAssets: string;
  salaryBasic: string;
  salaryHra: string;
  salarySpecialAllowance: string;
  salaryOtherAllowance: string;
  salaryPf: string;
  salaryEsi: string;
  salaryProfessionalTax: string;
  salaryTds: string;
  hasPf: boolean;
  hasHealthInsurance: boolean;
  drivingLicense: string;
  voterId: string;
  passportNumber: string;
  salaryOtherDeduction: string;
  salaryOtherDeductionLabel: string;
  photoUrl: string;
};

export type PayrollFormState = {
  workingDays: string;
  weekOffDays: string;
  leaveDays: string;
  paymentMode: "full_payment" | "prorated";
  overtimeHours: string;
  overtimeAmount: string;
  bonus: string;
  incentive: string;
  reimbursements: string;
  otherDeductions: string;
  notes: string;
};

export type PayrollRow = {
  employee: HrEmployee;
  record: PayrollRecord;
  status: "generated" | "draft";
};

export type EmployeePerformanceRow = {
  employee: HrEmployee;
  score: number;
  band: "excellent" | "good" | "watch" | "critical";
  profileCompletion: number;
  timesheetScore: number;
  attendanceScore: number;
  payrollScore: number;
  timesheetStatus: "submitted" | "pending" | "not_tracked";
  attendanceRatio: number | null;
  attendancePaidDays: number | null;
  attendanceWorkingDays: number | null;
  payrollStatus: "generated" | "draft" | "salary_missing";
  note: string;
};

export type HrLeaveRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  leaveType: "casual" | "sick" | "earned" | "unpaid";
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: "handover_pending" | "pending" | "approved" | "rejected";
  appliedAt: string;
  reviewedBy?: { id: string; name: string };
  reviewedAt?: string;
  reviewNote?: string;
  handoverId?: string;
  handoverName?: string;
  handoverStatus?: "pending" | "accepted" | "rejected";
  handoverAcceptedAt?: string;
  hrConfirmedAt?: string;
  hrConfirmedBy?: { id: string; name: string };
  approvalDate?: string;
};

export type HrLeaveFormState = {
  employeeId: string;
  leaveType: HrLeaveRequest["leaveType"];
  fromDate: string;
  toDate: string;
  reason: string;
  handoverId: string;
};

export type HrExitRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  store?: string;
  issuedAssets?: string;
  exitType: "resignation" | "termination" | "retirement" | "contract_end";
  noticePeriodDays: number;
  lastWorkingDay: string;
  exitDate: string;
  clearanceStatus: "pending" | "in_progress" | "complete";
  assetHandoverStatus: "pending" | "returned";
  backupEmailStatus: "pending" | "completed";
  fnfStatus: "pending" | "processing" | "settled";
  remarks?: string;
  initiatedAt: string;
  initiatedBy?: { id: string; name: string };
};

export type HrExitFormState = {
  employeeId: string;
  exitType: HrExitRecord["exitType"];
  noticePeriodDays: string;
  lastWorkingDay: string;
  exitDate: string;
  clearanceStatus: HrExitRecord["clearanceStatus"];
  assetHandoverStatus: HrExitRecord["assetHandoverStatus"];
  backupEmailStatus: HrExitRecord["backupEmailStatus"];
  fnfStatus: HrExitRecord["fnfStatus"];
  remarks: string;
};

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  biometricId?: string;
  employeeCode?: string;
  department?: string;
  date: string;
  inTime?: string;
  outTime?: string;
  status: "present" | "absent" | "half_day" | "late" | "holiday" | "week_off" | "week_off_present" | "on_leave" | "missed_punch";
  source: "manual" | "biometric";
  uploadBatch?: string;
  uploadedAt?: string;
};

export type AttendanceSummary = {
  present: number;
  absent: number;
  missedPunch: number;
  late: number;
  halfDay: number;
  holiday: number;
  weekOff: number;
  onLeave: number;
  totalDays: number;
  workingDays: number;
  lopDays: number;
  paidDays: number;
};

export type HrHoliday = {
  id: string;
  employeeId?: string;
  employeeName?: string;
  date: string;
  name: string;
  type: "national" | "festival" | "optional";
};

export type HrHolidayFormState = {
  employeeId: string;
  date: string;
  name: string;
  type: HrHoliday["type"];
};

// ─── Letters ──────────────────────────────────────────────────────────────────

export type HrLetter = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  letterType: "offer" | "appointment" | "increment" | "experience" | "warning" | "noc" | "termination";
  subject: string;
  body: string;
  effectiveDate?: string;
  newSalary?: number;
  generatedAt: string;
  generatedBy?: { id: string; name: string };
};

export type HrLetterFormState = {
  employeeId: string;
  letterType: HrLetter["letterType"];
  subject: string;
  body: string;
  effectiveDate: string;
  newSalary: string;
};

// ─── Loan & Advance ───────────────────────────────────────────────────────────

export type HrLoan = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  loanType: "advance" | "loan";
  amount: number;
  monthlyEmi: number;
  disbursedDate: string;
  reason: string;
  status: "active" | "closed";
  paidAmount: number;
  remainingAmount: number;
  notes?: string;
  createdAt: string;
  createdBy?: { id: string; name: string };
};

export type HrLoanFormState = {
  employeeId: string;
  loanType: HrLoan["loanType"];
  amount: string;
  monthlyEmi: string;
  disbursedDate: string;
  reason: string;
  notes: string;
};

// ─── Warnings & Disciplinary ──────────────────────────────────────────────────

export type HrWarning = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  category: "attendance" | "conduct" | "performance" | "policy" | "other";
  severity: "verbal" | "written" | "final";
  subject: string;
  description: string;
  issuedAt: string;
  issuedBy?: { id: string; name: string };
  acknowledgedAt?: string;
  employeeResponse?: string;
};

export type HrWarningFormState = {
  employeeId: string;
  category: HrWarning["category"];
  severity: HrWarning["severity"];
  subject: string;
  description: string;
};

// ─── Expense Claims ───────────────────────────────────────────────────────────

export type HrExpenseClaim = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  category: "travel" | "food" | "accommodation" | "equipment" | "other";
  amount: number;
  date: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedBy?: { id: string; name: string };
  reviewedAt?: string;
  reviewNote?: string;
};

export type HrExpenseClaimFormState = {
  employeeId: string;
  category: HrExpenseClaim["category"];
  amount: string;
  date: string;
  description: string;
};

// ─── Roster / Shift ───────────────────────────────────────────────────────────

export type HrShift = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
};

export type HrRosterEntry = {
  id: string;
  employeeId: string;
  employeeName: string;
  department?: string;
  store?: string;
  date: string;
  shiftId: string;
  shiftName: string;
  shiftStart: string;
  shiftEnd: string;
};

export type HrRosterFormState = {
  employeeId: string;
  date: string;
  shiftId: string;
  shiftName: string;
  shiftStart: string;
  shiftEnd: string;
};

// ─── Appraisal ────────────────────────────────────────────────────────────────

export type HrAppraisal = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  period: string;
  rating: 1 | 2 | 3 | 4 | 5;
  goals: string;
  achievements: string;
  areasOfImprovement: string;
  managerComments: string;
  status: "draft" | "submitted" | "acknowledged";
  createdAt: string;
  reviewedBy?: { id: string; name: string };
  acknowledgedAt?: string;
};

export type HrAppraisalFormState = {
  employeeId: string;
  period: string;
  rating: string;
  goals: string;
  achievements: string;
  areasOfImprovement: string;
  managerComments: string;
};

// ─── Salary Increment History ─────────────────────────────────────────────────

export type HrIncrementRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  effectiveDate: string;
  previousBasic: number;
  newBasic: number;
  incrementAmount: number;
  incrementPercent: number;
  reason: string;
  approvedBy?: { id: string; name: string };
  createdAt: string;
};

export type HrIncrementFormState = {
  employeeId: string;
  effectiveDate: string;
  newBasic: string;
  reason: string;
};

// ─── Recruitment ──────────────────────────────────────────────────────────────

export type HrJobOpening = {
  id: string;
  title: string;
  department?: string;
  store?: string;
  openings: number;
  status: "open" | "closed" | "on_hold";
  description: string;
  createdAt: string;
  createdBy?: { id: string; name: string };
};

export type HrJobFormState = {
  title: string;
  department: string;
  store: string;
  openings: string;
  status: HrJobOpening["status"];
  description: string;
};

export type HrApplicant = {
  id: string;
  jobId: string;
  jobTitle: string;
  name: string;
  email: string;
  phone: string;
  experience: string;
  assignedOwner?: string;
  assignedRole?: "hr" | "recruiter";
  deadlineAt?: string;
  stage: "applied" | "screening" | "interview" | "offer" | "joined" | "on_hold" | "terminated" | "rejected";
  notes: string;
  appliedAt: string;
  updatedAt?: string;
  completedAt?: string;
};

export type HrApplicantFormState = {
  jobId: string;
  jobTitle: string;
  name: string;
  email: string;
  phone: string;
  experience: string;
  assignedOwner: string;
  assignedRole: "hr" | "recruiter";
  deadlineAt: string;
  stage: HrApplicant["stage"];
  notes: string;
};

// â”€â”€â”€ Phase 1 HRMS Expansion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type HrSelfServiceRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  requestType: "profile_update" | "attendance_regularization" | "document_request" | "general_help";
  title: string;
  details: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "in_review" | "approved" | "rejected";
  requestedAt: string;
  requestedBy?: { id: string; name: string };
  managerId?: string;
  managerName?: string;
  reviewedBy?: { id: string; name: string };
  reviewedAt?: string;
  reviewNote?: string;
};

export type HrSelfServiceFormState = {
  employeeId: string;
  requestType: HrSelfServiceRequest["requestType"];
  title: string;
  details: string;
  priority: HrSelfServiceRequest["priority"];
};

export type HrDepartmentRecord = {
  id: string;
  name: string;
  code?: string;
  managerId?: string;
  managerName?: string;
  description?: string;
  status: "active" | "inactive";
  createdAt: string;
  createdBy?: { id: string; name: string };
};

export type HrDepartmentFormState = {
  id?: string;
  name: string;
  code: string;
  managerId: string;
  description: string;
  status: HrDepartmentRecord["status"];
};

export type HrDesignationRecord = {
  id: string;
  title: string;
  department?: string;
  level?: string;
  description?: string;
  status: "active" | "inactive";
  createdAt: string;
  createdBy?: { id: string; name: string };
};

export type HrDesignationFormState = {
  id?: string;
  title: string;
  department: string;
  level: string;
  description: string;
  status: HrDesignationRecord["status"];
};

export type HrBranchRecord = {
  id: string;
  name: string;
  code?: string;
  location?: string;
  managerId?: string;
  managerName?: string;
  status: "active" | "inactive";
  createdAt: string;
  createdBy?: { id: string; name: string };
};

export type HrBranchFormState = {
  id?: string;
  name: string;
  code: string;
  location: string;
  managerId: string;
  status: HrBranchRecord["status"];
};
