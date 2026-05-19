import { format } from "date-fns";
import type {
  HrApplicant,
  HrApplicantFormState,
  HrAppraisalFormState,
  HrBranchFormState,
  HrBranchRecord,
  HrDepartmentFormState,
  HrDepartmentRecord,
  HrDesignationFormState,
  HrDesignationRecord,
  HrEmployee,
  HrExpenseClaimFormState,
  HrIncrementFormState,
  HrJobFormState,
  HrJobOpening,
  HrLetterFormState,
  HrLoanFormState,
  HrRosterFormState,
  HrSelfServiceFormState,
  HrSelfServiceRequest,
  HrShift,
  HrWarningFormState,
} from "../types";
const COMPANY_NAME = "MO Designs Pvt. Ltd.";

// ─── Letters ──────────────────────────────────────────────────────────────────

export const HR_ADMIN_EMAIL = "modesignsrajendarbisht@gmail.com";

export const LETTER_TYPE_LABELS: Record<string, string> = {
  offer: "Offer Letter",
  appointment: "Appointment Letter",
  increment: "Increment Letter",
  experience: "Experience Certificate",
  warning: "Warning Letter",
  noc: "No Objection Certificate",
  termination: "Termination Letter",
};

const formatLetterDate = (value?: string) => {
  if (!value) return format(new Date(), "dd MMM yyyy");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "dd MMM yyyy");
};

const parseLetterDate = (value?: string) => {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
};

const formatExperienceDuration = (start?: string, end?: string) => {
  const startDate = parseLetterDate(start);
  const endDate = parseLetterDate(end);
  if (!startDate || !endDate || endDate < startDate) return "";

  let years = endDate.getFullYear() - startDate.getFullYear();
  let months = endDate.getMonth() - startDate.getMonth();
  const endDayBeforeStartDay = endDate.getDate() < startDate.getDate();

  if (endDayBeforeStartDay) {
    months -= 1;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years < 0) return "";

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? "" : "s"}`);

  return parts.join(" ");
};

export const getHrLetterRoleLabel = (employee: HrEmployee) => {
  const rawDesignation = String(employee.designation || "").trim();
  const rawRole = String(employee.role || "").trim();

  return (rawDesignation || rawRole || "")
    .replace(/data anylitics/gi, "Data Analytics")
    .replace(/sr\.\s*mis/gi, "Sr. MIS");
};

export const getHrLetterDepartmentLabel = (employee: HrEmployee) => {
  const rawDepartment = String(employee.department || "").trim();
  return rawDepartment.replace(/sr\.\s*mis/gi, "Sr. MIS");
};

export const generateLetterBody = (
  type: HrLetterFormState["letterType"],
  employee: HrEmployee,
  form: HrLetterFormState
): string => {
  const date = formatLetterDate(form.effectiveDate);
  const name = employee.name;
  const dept = getHrLetterDepartmentLabel(employee);
  const role = getHrLetterRoleLabel(employee);
  const comp = COMPANY_NAME;
  const joiningDateLine = employee.joiningDate
    ? `\n\nJoining Date: ${formatLetterDate(employee.joiningDate)}`
    : "";
  const experienceDuration = formatExperienceDuration(
    employee.joiningDate,
    form.effectiveDate
  );
  const experienceLine = experienceDuration
    ? `\nExperience: ${experienceDuration}`
    : "";

  const roleClause = role ? ` as ${role}` : "";
  const deptClause = dept ? ` in the ${dept} Department` : "";
  const roleDept = role && dept ? `${role}, ${dept} Department` : role || dept || "your position";

  switch (type) {
    case "offer":
      return `Dear ${name},\n\nWe are pleased to offer you the position of ${roleDept} at ${comp}.\n\nYour date of joining will be ${date}. This offer is subject to satisfactory verification of your documents and references.\n\nPlease sign and return a copy of this letter as your formal acceptance.\n\nWe look forward to having you as part of our team.\n\nWarm regards,\nHR Department\n${comp}`;
    case "appointment":
      return `Dear ${name},\n\nWith reference to your application and subsequent interaction with us, we are pleased to confirm your appointment${roleClause}${deptClause} at ${comp} with effect from ${date}.\n\nYou will be governed by the rules, regulations, and policies of the company as applicable from time to time.\n\nWe trust you will fulfil the responsibilities entrusted to you with dedication and sincerity.\n\nCongratulations and welcome aboard!\n\nRegards,\nHR Department\n${comp}`;
    case "increment":
      return `Dear ${name},\n\nWith reference to your performance appraisal and contribution to the organisation, we are pleased to inform you of a revision in your compensation package effective ${date}.\n\nYour revised Basic Salary will be ₹${form.newSalary || "____"} per month.\n\nWe appreciate your continued dedication and look forward to your sustained contribution.\n\nSincerely,\nHR Department\n${comp}`;
    case "experience":
      return `To Whom It May Concern,\n\nThis is to certify that ${name} was employed with ${comp}${roleClause}${deptClause}.${joiningDateLine}${experienceLine}\n\nDuring their tenure, ${name} demonstrated professionalism, dedication, and a high standard of work. We wish them the very best in their future endeavours.\n\nThis certificate is issued at the request of the individual for whatever purpose it may serve.\n\nIssued on: ${date}\n\nFor ${comp}\nHR Department`;
    case "warning":
      return `Dear ${name},\n\nThis letter serves as a formal warning regarding your recent conduct / performance as observed and reported by the management.\n\nYou are hereby advised to immediately rectify the behaviour / performance in question. Any further recurrence may result in strict disciplinary action, up to and including termination of employment.\n\nYou are requested to acknowledge receipt of this letter and submit your written response within three (3) working days.\n\nDate: ${date}\n\nHR Department\n${comp}`;
    case "noc":
      return `To Whom It May Concern,\n\nThis is to certify that ${name}${roleClause ? `, ${roleClause.trim().replace(/^as /, "")}` : ""}${dept ? `, ${dept} Department` : ""}, ${comp}, has no objection to proceed with the purpose for which this certificate has been requested.\n\nThis certificate is issued on the basis of our records and at the specific request of the individual.\n\nIssued on: ${date}\n\nFor ${comp}\nHR Department`;
    case "termination":
      return `Dear ${name},\n\nAfter careful consideration by the management, we regret to inform you that your employment with ${comp} stands terminated with effect from ${date}.\n\nYou are requested to complete the handover of all duties, documents, and company property before your last working day.\n\nYour Full and Final settlement will be processed in accordance with company policy and applicable laws.\n\nRegards,\nHR Department\n${comp}`;
    default:
      return "";
  }
};

export const createLetterFormState = (
  employeeId = "",
  type: HrLetterFormState["letterType"] = "appointment"
): HrLetterFormState => ({
  employeeId,
  letterType: type,
  subject: LETTER_TYPE_LABELS[type] || "",
  body: "",
  effectiveDate: format(new Date(), "yyyy-MM-dd"),
  newSalary: "",
});

// ─── Loan & Advance ───────────────────────────────────────────────────────────

export const createLoanFormState = (employeeId = ""): HrLoanFormState => ({
  employeeId,
  loanType: "advance",
  amount: "",
  monthlyEmi: "",
  disbursedDate: format(new Date(), "yyyy-MM-dd"),
  reason: "",
  notes: "",
});

// ─── Warnings ─────────────────────────────────────────────────────────────────

export const WARNING_CATEGORY_LABELS: Record<HrWarningFormState["category"], string> = {
  attendance: "Attendance",
  conduct: "Conduct",
  performance: "Performance",
  policy: "Policy Violation",
  other: "Other",
};

export const WARNING_SEVERITY_LABELS: Record<HrWarningFormState["severity"], string> = {
  verbal: "Verbal Warning",
  written: "Written Warning",
  final: "Final Warning",
};

export const createWarningFormState = (employeeId = ""): HrWarningFormState => ({
  employeeId,
  category: "conduct",
  severity: "written",
  subject: "",
  description: "",
});

// ─── Expense Claims ───────────────────────────────────────────────────────────

export const EXPENSE_CATEGORY_LABELS: Record<HrExpenseClaimFormState["category"], string> = {
  travel: "Travel",
  food: "Food & Meals",
  accommodation: "Accommodation",
  equipment: "Equipment / Tools",
  other: "Other",
};

export const createExpenseClaimFormState = (employeeId = ""): HrExpenseClaimFormState => ({
  employeeId,
  category: "travel",
  amount: "",
  date: format(new Date(), "yyyy-MM-dd"),
  description: "",
});

// ─── Roster / Shifts ──────────────────────────────────────────────────────────

export const DEFAULT_SHIFTS: HrShift[] = [
  { id: "morning", name: "Morning", startTime: "09:00", endTime: "18:00", color: "bg-blue-100 text-blue-800" },
  { id: "evening", name: "Evening", startTime: "13:00", endTime: "22:00", color: "bg-violet-100 text-violet-800" },
  { id: "night", name: "Night", startTime: "22:00", endTime: "07:00", color: "bg-slate-200 text-slate-800" },
  { id: "half", name: "Half Day", startTime: "09:00", endTime: "13:00", color: "bg-amber-100 text-amber-800" },
  { id: "off", name: "Week Off", startTime: "", endTime: "", color: "bg-slate-100 text-slate-500" },
];

export const createRosterFormState = (employeeId = ""): HrRosterFormState => ({
  employeeId,
  date: format(new Date(), "yyyy-MM-dd"),
  shiftId: "morning",
  shiftName: "Morning",
  shiftStart: "09:00",
  shiftEnd: "18:00",
});

// ─── Appraisal ────────────────────────────────────────────────────────────────

export const APPRAISAL_RATING_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Below Expectations",
  3: "Meets Expectations",
  4: "Exceeds Expectations",
  5: "Outstanding",
};

export const createAppraisalFormState = (employeeId = ""): HrAppraisalFormState => {
  const now = new Date();
  const half = now.getMonth() < 6 ? "H1" : "H2";
  return {
    employeeId,
    period: `${now.getFullYear()}-${half}`,
    rating: "3",
    goals: "",
    achievements: "",
    areasOfImprovement: "",
    managerComments: "",
  };
};

// ─── Increment ────────────────────────────────────────────────────────────────

export const createIncrementFormState = (employeeId = ""): HrIncrementFormState => ({
  employeeId,
  effectiveDate: format(new Date(), "yyyy-MM-dd"),
  newBasic: "",
  reason: "",
});

// ─── Recruitment ──────────────────────────────────────────────────────────────

export const APPLICANT_STAGE_LABELS: Record<HrApplicant["stage"], string> = {
  applied: "Initial Screening",
  screening: "HR Interview",
  interview: "HOD Round",
  offer: "MD Final Round",
  joined: "Joined",
  on_hold: "On Hold",
  terminated: "Terminated",
  rejected: "Rejected",
};

export const createJobFormState = (): HrJobFormState => ({
  title: "",
  department: "",
  store: "",
  openings: "1",
  status: "open",
  description: "",
});

export const createApplicantFormState = (job: HrJobOpening): HrApplicantFormState => ({
  jobId: job.id,
  jobTitle: job.title,
  name: "",
  email: "",
  phone: "",
  experience: "",
  assignedOwner: "",
  assignedRole: "hr",
  deadlineAt: "",
  stage: "applied",
  notes: "",
});

// â”€â”€â”€ Phase 1 HRMS Expansion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const SELF_SERVICE_TYPE_LABELS: Record<HrSelfServiceRequest["requestType"], string> = {
  profile_update: "Profile Update",
  attendance_regularization: "Attendance Regularization",
  document_request: "Document Request",
  general_help: "General Help",
};

export const SELF_SERVICE_PRIORITY_LABELS: Record<HrSelfServiceRequest["priority"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const createSelfServiceFormState = (employeeId = ""): HrSelfServiceFormState => ({
  employeeId,
  requestType: "profile_update",
  title: "",
  details: "",
  priority: "medium",
});

export const createDepartmentFormState = (
  entry?: Partial<HrDepartmentRecord>
): HrDepartmentFormState => ({
  id: entry?.id,
  name: entry?.name || "",
  code: entry?.code || "",
  managerId: entry?.managerId || "",
  description: entry?.description || "",
  status: entry?.status || "active",
});

export const createDesignationFormState = (
  entry?: Partial<HrDesignationRecord>
): HrDesignationFormState => ({
  id: entry?.id,
  title: entry?.title || "",
  department: entry?.department || "",
  level: entry?.level || "",
  description: entry?.description || "",
  status: entry?.status || "active",
});

export const createBranchFormState = (
  entry?: Partial<HrBranchRecord>
): HrBranchFormState => ({
  id: entry?.id,
  name: entry?.name || "",
  code: entry?.code || "",
  location: entry?.location || "",
  managerId: entry?.managerId || "",
  status: entry?.status || "active",
});
