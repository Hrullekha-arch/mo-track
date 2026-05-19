"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { addDoc, collection, collectionGroup, onSnapshot, query, where } from "firebase/firestore";
import { ArrowRight, Clock3, CreditCard, Eye, FileText, Landmark, Loader2, Pencil, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import type { User } from "@/lib/types";
import type {
  AttendanceRecord,
  HrApplicant,
  HrAppraisal,
  HrBranchRecord,
  HrDepartmentRecord,
  HrDesignationRecord,
  HrExpenseClaim,
  HrExitRecord,
  HrHoliday,
  HrIncrementRecord,
  HrJobOpening,
  HrLeaveRequest,
  HrLetter,
  HrLoan,
  HrRosterEntry,
  HrSelfServiceRequest,
  HrTimesheetRow,
  HrWarning,
  PayrollRecord,
  PayrollRow,
  TimesheetSummary,
} from "./types";
import { calcAttendanceSummary } from "./utils/attendance-leave-utils";
import {
  buildPayrollRecord,
  buildEmployeePerformanceRow,
  createAttendancePayrollFormState,
  createDraftPayrollRecord,
  createExpenseClaimFormState,
  createHolidayFormState,
  createJobFormState,
  createRosterFormState,
  formatCurrency,
  formatDateLabel,
  formatDutyLabel,
  formatMonthLabel,
  hasSalaryConfig,
  mapAccountUserToHrEmployee,
  mapManualEmployeeToHrEmployee,
  normalizeText,
  roleLabel,
  safeText,
  updatedTimeLabel,
} from "./utils";
import type { HrEmployee } from "./types";
import { usePayrollHandlers } from "./hooks/use-payroll-handlers";
import { useEmployeeHandlers } from "./hooks/use-employee-handlers";
import { useLeaveExitHandlers } from "./hooks/use-leave-exit-handlers";
import { useAttendanceHandlers } from "./hooks/use-attendance-handlers";
import { useHrToolsHandlers } from "./hooks/use-hr-tools-handlers";
import { usePhaseOneHandlers } from "./hooks/use-phase-one-handlers";
import { ExitRecordDialog, LeaveRequestDialog } from "./dialogs/leave";

const EmployeeDetailsDialog = dynamic(() => import("./dialogs/employee").then((mod) => mod.EmployeeDetailsDialog), { ssr: false });
const PayrollSetupDialog = dynamic(() => import("./dialogs/payroll").then((mod) => mod.PayrollSetupDialog), { ssr: false });
const SalarySlipDialog = dynamic(() => import("./dialogs/payroll").then((mod) => mod.SalarySlipDialog), { ssr: false });
const AttendanceUploadDialog = dynamic(() => import("./dialogs/attendance").then((mod) => mod.AttendanceUploadDialog), { ssr: false });
const HolidayDialog = dynamic(() => import("./dialogs/attendance").then((mod) => mod.HolidayDialog), { ssr: false });
const ManageAttendanceDialog = dynamic(() => import("./dialogs/attendance").then((mod) => mod.ManageAttendanceDialog), { ssr: false });
const LetterDialog = dynamic(() => import("./dialogs/letter").then((mod) => mod.LetterDialog), { ssr: false });
const LoanDialog = dynamic(() => import("./dialogs/loan-warning-expense").then((mod) => mod.LoanDialog), { ssr: false });
const WarningDialog = dynamic(() => import("./dialogs/loan-warning-expense").then((mod) => mod.WarningDialog), { ssr: false });
const ExpenseClaimDialog = dynamic(() => import("./dialogs/loan-warning-expense").then((mod) => mod.ExpenseClaimDialog), { ssr: false });
const RosterEntryDialog = dynamic(() => import("./dialogs/roster-appraisal-increment").then((mod) => mod.RosterEntryDialog), { ssr: false });
const AppraisalDialog = dynamic(() => import("./dialogs/roster-appraisal-increment").then((mod) => mod.AppraisalDialog), { ssr: false });
const IncrementDialog = dynamic(() => import("./dialogs/roster-appraisal-increment").then((mod) => mod.IncrementDialog), { ssr: false });
const JobDialog = dynamic(() => import("./dialogs/recruitment").then((mod) => mod.JobDialog), { ssr: false });
const ApplicantDialog = dynamic(() => import("./dialogs/recruitment").then((mod) => mod.ApplicantDialog), { ssr: false });
const SelfServiceRequestDialog = dynamic(() => import("./dialogs/phase-one").then((mod) => mod.SelfServiceRequestDialog), { ssr: false });
const DepartmentDialog = dynamic(() => import("./dialogs/phase-one").then((mod) => mod.DepartmentDialog), { ssr: false });
const DesignationDialog = dynamic(() => import("./dialogs/phase-one").then((mod) => mod.DesignationDialog), { ssr: false });
const BranchDialog = dynamic(() => import("./dialogs/phase-one").then((mod) => mod.BranchDialog), { ssr: false });
const HrWorkspaceTabs = dynamic(() => import("./tabs").then((mod) => mod.HrWorkspaceTabs), {
  loading: () => (
    <Card className="border-slate-200">
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <Skeleton className="h-10 w-56" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-44" />
            <Skeleton className="h-10 w-72" />
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[420px] w-full" />
      </CardContent>
    </Card>
  ),
});

type CanonicalEmployeeDirectory = {
  employees: HrEmployee[];
  aliasToCanonicalId: Record<string, string>;
  employeeById: Record<string, HrEmployee>;
};

const normalizeEmployeeIdentity = (value?: string) =>
  safeText(value).replace(/\s+/g, " ").toLowerCase();

const hasValue = (value: unknown) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const employeeIdentityScore = (employee: HrEmployee) =>
  (employee.hasLoginAccount ? 100 : 0) +
  (hasSalaryConfig(employee) ? 25 : 0) +
  (normalizeEmployeeIdentity(employee.employeeCode) ? 10 : 0) +
  (normalizeEmployeeIdentity(employee.biometricId) ? 8 : 0) +
  (normalizeEmployeeIdentity(employee.department) ? 2 : 0) +
  (normalizeEmployeeIdentity(employee.designation) ? 1 : 0);

const fallbackEmployeeKey = (employee: HrEmployee) =>
  [
    normalizeEmployeeIdentity(employee.name),
    normalizeEmployeeIdentity(employee.role),
    normalizeEmployeeIdentity(employee.department),
    normalizeEmployeeIdentity(employee.store),
  ].join("|");

const employeesLookSame = (left: HrEmployee, right: HrEmployee) => {
  const leftLinked = normalizeEmployeeIdentity(left.linkedUserId || (left.hasLoginAccount ? left.id : ""));
  const rightLinked = normalizeEmployeeIdentity(right.linkedUserId || (right.hasLoginAccount ? right.id : ""));
  if (leftLinked && rightLinked && leftLinked === rightLinked) return true;

  const leftCodes = [left.employeeCode, left.biometricId].map(normalizeEmployeeIdentity).filter(Boolean);
  const rightCodes = [right.employeeCode, right.biometricId].map(normalizeEmployeeIdentity).filter(Boolean);
  if (leftCodes.length && rightCodes.length && leftCodes.some((code) => rightCodes.includes(code))) return true;

  const leftFallback = fallbackEmployeeKey(left);
  const rightFallback = fallbackEmployeeKey(right);
  if (!leftFallback.replace(/\|/g, "") || !rightFallback.replace(/\|/g, "")) return false;
  return leftFallback === rightFallback;
};

const mergeEmployeeRecords = (primary: HrEmployee, duplicate: HrEmployee): HrEmployee => {
  const merged = { ...primary } as HrEmployee;
  Object.entries(duplicate).forEach(([key, rawValue]) => {
    const currentValue = (merged as any)[key];
    if (key === "permissions") {
      const mergedPermissions = [...new Set([...(Array.isArray(currentValue) ? currentValue : []), ...(Array.isArray(rawValue) ? rawValue : [])])];
      (merged as any)[key] = mergedPermissions;
      return;
    }
    if (typeof currentValue === "boolean" || typeof rawValue === "boolean") {
      (merged as any)[key] = Boolean(currentValue) || Boolean(rawValue);
      return;
    }
    if (!hasValue(currentValue) && hasValue(rawValue)) {
      (merged as any)[key] = rawValue;
    }
  });
  return merged;
};

const buildCanonicalEmployeeDirectory = (employees: HrEmployee[]): CanonicalEmployeeDirectory => {
  const canonicalEmployees: HrEmployee[] = [];
  const aliasToCanonicalId: Record<string, string> = {};

  [...employees]
    .sort((left, right) => employeeIdentityScore(right) - employeeIdentityScore(left) || safeText(left.name).localeCompare(safeText(right.name)))
    .forEach((employee) => {
      const matchIndex = canonicalEmployees.findIndex((entry) => employeesLookSame(entry, employee));
      if (matchIndex === -1) {
        canonicalEmployees.push(employee);
        aliasToCanonicalId[employee.id] = employee.id;
        return;
      }

      canonicalEmployees[matchIndex] = mergeEmployeeRecords(canonicalEmployees[matchIndex], employee);
      aliasToCanonicalId[employee.id] = canonicalEmployees[matchIndex].id;
    });

  const employeeById = Object.fromEntries(canonicalEmployees.map((employee) => [employee.id, employee])) as Record<string, HrEmployee>;
  return {
    employees: canonicalEmployees.sort((left, right) => safeText(left.name).localeCompare(safeText(right.name))),
    aliasToCanonicalId,
    employeeById,
  };
};

const isBetterAttendanceRecord = (candidate: AttendanceRecord, current: AttendanceRecord) => {
  const candidateScore =
    (candidate.source === "biometric" ? 10 : 0) +
    (candidate.inTime ? 4 : 0) +
    (candidate.outTime ? 4 : 0) +
    (candidate.uploadedAt ? 1 : 0);
  const currentScore =
    (current.source === "biometric" ? 10 : 0) +
    (current.inTime ? 4 : 0) +
    (current.outTime ? 4 : 0) +
    (current.uploadedAt ? 1 : 0);
  return candidateScore > currentScore;
};

const normalizeAttendanceRecordsForDirectory = (
  records: AttendanceRecord[],
  directory: CanonicalEmployeeDirectory
) => {
  const normalized = new Map<string, AttendanceRecord>();

  records.forEach((record) => {
    const canonicalId = directory.aliasToCanonicalId[record.employeeId] || record.employeeId;
    const employee = directory.employeeById[canonicalId];
    const entry: AttendanceRecord = {
      ...record,
      employeeId: canonicalId,
      employeeName: employee?.name || record.employeeName,
      employeeCode: employee?.employeeCode || record.employeeCode,
      biometricId: employee?.biometricId || record.biometricId,
      department: employee?.department || record.department,
    };
    const key = `${canonicalId}::${record.date}`;
    const existing = normalized.get(key);
    if (!existing || isBetterAttendanceRecord(entry, existing)) {
      normalized.set(key, entry);
    }
  });

  return Array.from(normalized.values());
};

const normalizePayrollMapForDirectory = (
  payrollMap: Record<string, PayrollRecord>,
  directory: CanonicalEmployeeDirectory
) => {
  const normalized: Record<string, PayrollRecord> = {};

  Object.values(payrollMap).forEach((record) => {
    const canonicalId = directory.aliasToCanonicalId[record.userId] || record.userId;
    const employee = directory.employeeById[canonicalId];
    const nextRecord: PayrollRecord = {
      ...record,
      userId: canonicalId,
      employeeName: employee?.name || record.employeeName,
      employeeCode: employee?.employeeCode || record.employeeCode,
      department: employee?.department || record.department,
      role: employee?.role || record.role,
      designation: employee?.designation || record.designation,
      store: employee?.store || record.store,
    };
    const current = normalized[canonicalId];
    if (!current) {
      normalized[canonicalId] = nextRecord;
      return;
    }
    const nextStamp = new Date(nextRecord.updatedAt || 0).getTime();
    const currentStamp = new Date(current.updatedAt || 0).getTime();
    if (nextStamp >= currentStamp) {
      normalized[canonicalId] = nextRecord;
    }
  });

  return normalized;
};

export default function HrDashboardClientPage() {
  const { user, role, loading } = useAuth();
  const { toast } = useToast();

  // ─── Core data ──────────────────────────────────────────────────────────────
  const [accountUsers, setAccountUsers] = useState<HrEmployee[]>([]);
  const [manualEmployees, setManualEmployees] = useState<HrEmployee[]>([]);
  const [timesheetMap, setTimesheetMap] = useState<Record<string, TimesheetSummary>>({});
  const [payrollMapRaw, setPayrollMapRaw] = useState<Record<string, PayrollRecord>>({});
  const [accountUsersLoading, setAccountUsersLoading] = useState(true);
  const [manualEmployeesLoading, setManualEmployeesLoading] = useState(true);
  const [timesheetsLoading, setTimesheetsLoading] = useState(true);
  const [payrollLoading, setPayrollLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [activeTab, setActiveTab] = useState("overview");
  const [activatedTabs, setActivatedTabs] = useState<Set<string>>(() => new Set(["overview"]));
  const tabsRef = useRef<HTMLDivElement>(null);
  const [secondaryDataReady, setSecondaryDataReady] = useState(false);

  // ─── Secondary collections ──────────────────────────────────────────────────
  const [leaveRequests, setLeaveRequests] = useState<HrLeaveRequest[]>([]);
  const [leaveRequestsLoading, setLeaveRequestsLoading] = useState(true);
  const [exitRecords, setExitRecords] = useState<HrExitRecord[]>([]);
  const [exitRecordsLoading, setExitRecordsLoading] = useState(true);
  const [attendanceRecordsRaw, setAttendanceRecordsRaw] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [holidays, setHolidays] = useState<HrHoliday[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState(true);
  const [letters, setLetters] = useState<HrLetter[]>([]);
  const [lettersLoading, setLettersLoading] = useState(true);
  const [loans, setLoans] = useState<HrLoan[]>([]);
  const [loansLoading, setLoansLoading] = useState(true);
  const [warnings, setWarnings] = useState<HrWarning[]>([]);
  const [warningsLoading, setWarningsLoading] = useState(true);
  const [expenseClaims, setExpenseClaims] = useState<HrExpenseClaim[]>([]);
  const [expenseClaimsLoading, setExpenseClaimsLoading] = useState(true);
  const [rosterEntries, setRosterEntries] = useState<HrRosterEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [appraisals, setAppraisals] = useState<HrAppraisal[]>([]);
  const [appraisalsLoading, setAppraisalsLoading] = useState(true);
  const [increments, setIncrements] = useState<HrIncrementRecord[]>([]);
  const [incrementsLoading, setIncrementsLoading] = useState(true);
  const [jobs, setJobs] = useState<HrJobOpening[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [applicants, setApplicants] = useState<HrApplicant[]>([]);
  const [applicantsLoading, setApplicantsLoading] = useState(true);
  const [selfServiceRequests, setSelfServiceRequests] = useState<HrSelfServiceRequest[]>([]);
  const [selfServiceRequestsLoading, setSelfServiceRequestsLoading] = useState(true);
  const [departments, setDepartments] = useState<HrDepartmentRecord[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [designations, setDesignations] = useState<HrDesignationRecord[]>([]);
  const [designationsLoading, setDesignationsLoading] = useState(true);
  const [branches, setBranches] = useState<HrBranchRecord[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);

  const showTab = (tab: string) => {
    setActiveTab(tab);
    setTimeout(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  useEffect(() => {
    setActivatedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const canAccessHr =
    role === "admin" || role === "Hr" || Boolean(user?.permissions?.includes("/dashboard/hr"));
  const shouldLoadPayroll = canAccessHr && (secondaryDataReady || activeTab !== "overview");
  const shouldLoadTimesheets =
    canAccessHr && (secondaryDataReady || activeTab === "timesheets" || activeTab === "performance");
  const hasActivatedTab = (...tabs: string[]) => tabs.some((tab) => activatedTabs.has(tab));
  const shouldLoadLeaveRequests = canAccessHr && (secondaryDataReady || hasActivatedTab("leave", "manager-approvals", "reports"));
  const shouldLoadExitRecords = canAccessHr && (secondaryDataReady || hasActivatedTab("exit"));
  const shouldLoadAttendance = canAccessHr && (secondaryDataReady || hasActivatedTab("attendance", "performance", "payroll", "reports"));
  const shouldLoadHolidays = canAccessHr && (secondaryDataReady || hasActivatedTab("attendance", "performance", "payroll"));
  const shouldLoadLetters = canAccessHr && (secondaryDataReady || hasActivatedTab("letters"));
  const shouldLoadLoans = canAccessHr && (secondaryDataReady || hasActivatedTab("loans"));
  const shouldLoadWarnings = canAccessHr && (secondaryDataReady || hasActivatedTab("warnings"));
  const shouldLoadExpenseClaims = canAccessHr && (secondaryDataReady || hasActivatedTab("expenses", "manager-approvals"));
  const shouldLoadRoster = canAccessHr && (secondaryDataReady || hasActivatedTab("roster"));
  const shouldLoadAppraisals = canAccessHr && (secondaryDataReady || hasActivatedTab("appraisals"));
  const shouldLoadIncrements = canAccessHr && (secondaryDataReady || hasActivatedTab("increments"));
  const shouldLoadJobs = canAccessHr && (secondaryDataReady || hasActivatedTab("recruitment"));
  const shouldLoadApplicants = canAccessHr && hasActivatedTab("recruitment");
  const shouldLoadSelfServiceRequests = canAccessHr && hasActivatedTab("self-service", "manager-approvals");
  const shouldLoadOrgSetup = canAccessHr && hasActivatedTab("org-setup");

  const employeeDirectory = useMemo(
    () => buildCanonicalEmployeeDirectory([...accountUsers, ...manualEmployees]),
    [accountUsers, manualEmployees]
  );
  const users = employeeDirectory.employees;
  const usersLoading = accountUsersLoading || manualEmployeesLoading;
  const accountUserIds = useMemo(
    () => new Set(accountUsers.map((entry) => entry.id)),
    [accountUsers]
  );
  const attendanceRecords = useMemo(
    () => normalizeAttendanceRecordsForDirectory(attendanceRecordsRaw, employeeDirectory),
    [attendanceRecordsRaw, employeeDirectory]
  );
  const payrollMap = useMemo(
    () => normalizePayrollMapForDirectory(payrollMapRaw, employeeDirectory),
    [employeeDirectory, payrollMapRaw]
  );
  const teamMembers = useMemo(
    () =>
      users.filter((entry) => {
        if (entry.role === "admin") return false;
        return entry.hasLoginAccount || !entry.linkedUserId || !accountUserIds.has(entry.linkedUserId);
      }),
    [accountUserIds, users]
  );
  const activeEmployees = useMemo(
    () => teamMembers.filter((e) => (e.employmentStatus || "active") !== "inactive"),
    [teamMembers]
  );
  const departmentNames = useMemo(
    () =>
      [...new Set(departments.map((entry) => entry.name.trim()).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right)),
    [departments]
  );
  const timesheetEligibleUsers = useMemo(
    () => teamMembers.filter((e) => e.role !== "installer" && Boolean(e.timesheetEnabled)),
    [teamMembers]
  );
  const submittedTodayCount = useMemo(
    () => timesheetEligibleUsers.filter((e) => Boolean(timesheetMap[e.id])).length,
    [timesheetEligibleUsers, timesheetMap]
  );
  const salaryConfiguredEmployees = useMemo(
    () => activeEmployees.filter((e) => hasSalaryConfig(e)),
    [activeEmployees]
  );
  const payrollEligibleEmployeeIds = useMemo(
    () =>
      new Set(
        attendanceRecords
          .filter((record) => record.date.startsWith(selectedMonth))
          .map((record) => record.employeeId)
      ),
    [attendanceRecords, selectedMonth]
  );
  const payrollEmployees = useMemo(
    () =>
      salaryConfiguredEmployees.filter(
        (employee) => payrollEligibleEmployeeIds.has(employee.id) || Boolean(payrollMap[employee.id])
      ),
    [payrollEligibleEmployeeIds, payrollMap, salaryConfiguredEmployees]
  );
  const salaryConfiguredCount = salaryConfiguredEmployees.length;
  const payrollGeneratedCount = useMemo(
    () => payrollEmployees.filter((employee) => Boolean(payrollMap[employee.id])).length,
    [payrollEmployees, payrollMap]
  );

  const payrollRows: PayrollRow[] = useMemo(
    () => payrollEmployees.map((employee) => {
      const existing = payrollMap[employee.id];
      if (existing) {
        return { employee, record: existing, status: "generated" as const };
      }
      const attSummary = calcAttendanceSummary(attendanceRecords, employee.id, selectedMonth, holidays, employee);
      const draftRecord = attSummary.totalDays
        ? buildPayrollRecord(employee, selectedMonth, createAttendancePayrollFormState(selectedMonth, attSummary))
        : createDraftPayrollRecord(employee, selectedMonth);
      return { employee, record: draftRecord, status: "draft" as const };
    }),
    [attendanceRecords, holidays, payrollEmployees, payrollMap, selectedMonth]
  );

  const totalNetPayout = useMemo(
    () => payrollRows.filter((r) => r.status === "generated").reduce((sum, r) => sum + r.record.netPay, 0),
    [payrollRows]
  );

  const filteredEmployees = useMemo(() => {
    const needle = normalizeText(deferredSearchTerm);
    if (!needle) return teamMembers;
    return teamMembers.filter((e) =>
      [e.name, e.email, e.role, e.designation, e.department, e.education, e.tenthBoardName, e.tenthMarks,
        e.twelfthBoardName, e.twelfthMarks, e.bachelorBoardName, e.bachelorMarks, e.masterBoardName,
        e.masterMarks, e.additionalQualification, e.experienceType, e.experience, e.employeeCode, e.store, e.reportingManager]
        .map((v) => normalizeText(v)).join(" ").includes(needle)
    );
  }, [teamMembers, deferredSearchTerm]);

  const filteredPayrollRows = useMemo(() => {
    const needle = normalizeText(deferredSearchTerm);
    if (!needle) return payrollRows;
    return payrollRows.filter((row) =>
      [row.employee.name, row.employee.email, row.employee.department, row.employee.education,
        row.employee.tenthBoardName, row.employee.tenthMarks, row.employee.twelfthBoardName, row.employee.twelfthMarks,
        row.employee.bachelorBoardName, row.employee.bachelorMarks, row.employee.masterBoardName, row.employee.masterMarks,
        row.employee.additionalQualification, row.employee.experienceType, row.employee.experience,
        row.employee.employeeCode, row.employee.store, row.status]
        .map((v) => normalizeText(v)).join(" ").includes(needle)
    );
  }, [payrollRows, deferredSearchTerm]);

  const todayRows: HrTimesheetRow[] = useMemo(
    () => timesheetEligibleUsers.map((entry): HrTimesheetRow => {
      const summary = timesheetMap[entry.id];
      return {
        user: entry,
        status: summary ? "submitted" : "pending",
        dutyLabel: formatDutyLabel(summary?.dutyStart || entry.timesheetDutyStart, summary?.dutyEnd || entry.timesheetDutyEnd),
        filledSlots: summary?.filledSlots || 0,
        totalSlots: summary?.totalSlots || 0,
        remark: summary?.remark || "",
        updatedAt: summary?.updatedAt,
      };
    }).sort((l, r) => {
      if (l.status !== r.status) return l.status === "pending" ? -1 : 1;
      return safeText(l.user.name).localeCompare(safeText(r.user.name));
    }),
    [timesheetEligibleUsers, timesheetMap]
  );

  const filteredTodayRows = useMemo(() => {
    const needle = normalizeText(deferredSearchTerm);
    if (!needle) return todayRows;
    return todayRows.filter((row) =>
      [row.user.name, row.user.email, row.user.department, row.user.education, row.user.tenthBoardName,
        row.user.tenthMarks, row.user.twelfthBoardName, row.user.twelfthMarks, row.user.bachelorBoardName,
        row.user.bachelorMarks, row.user.masterBoardName, row.user.masterMarks, row.user.additionalQualification,
        row.user.experienceType, row.user.experience, row.user.employeeCode, row.user.store, row.remark, row.status]
        .map((v) => normalizeText(v)).join(" ").includes(needle)
    );
  }, [deferredSearchTerm, todayRows]);

  const performanceRows = useMemo(() => {
    const rows = activeEmployees.map((employee) => {
      const attSummary = calcAttendanceSummary(attendanceRecords, employee.id, selectedMonth, holidays, employee);
      return buildEmployeePerformanceRow(employee, timesheetMap[employee.id], payrollMap[employee.id], attSummary);
    });
    const needle = normalizeText(deferredSearchTerm);
    return rows
      .filter((row) => {
        if (!needle) return true;
        return [row.employee.name, row.employee.department, row.employee.education, row.employee.tenthBoardName,
          row.employee.tenthMarks, row.employee.twelfthBoardName, row.employee.twelfthMarks, row.employee.bachelorBoardName,
          row.employee.bachelorMarks, row.employee.masterBoardName, row.employee.masterMarks,
          row.employee.additionalQualification, row.employee.experienceType, row.employee.experience,
          row.employee.employeeCode, row.employee.store, row.note, row.band]
          .map((v) => normalizeText(v)).join(" ").includes(needle);
      })
      .sort((l, r) => r.score - l.score || safeText(l.employee.name).localeCompare(safeText(r.employee.name)));
  }, [activeEmployees, attendanceRecords, deferredSearchTerm, holidays, payrollMap, selectedMonth, timesheetMap]);

  // ─── Hooks ──────────────────────────────────────────────────────────────────

  const payroll = usePayrollHandlers({ user, toast, selectedMonth, payrollMap, payrollEmployees, payrollRows, attendanceRecords, holidays });
  const employee = useEmployeeHandlers({ user, toast, setActiveTab });
  const leaveExit = useLeaveExitHandlers({ user, toast, activeEmployees, leaveRequests, exitRecords });
  const attendance = useAttendanceHandlers({ user, toast, selectedMonth, setSelectedMonth, activeEmployees, leaveRequests });
  const hrTools = useHrToolsHandlers({ user, toast, activeEmployees, loans });
  const phaseOne = usePhaseOneHandlers({ user, toast, activeEmployees });
  const isLeaveDialogOpen = Boolean(leaveExit.leaveForm);

  // ─── Data subscriptions ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!canAccessHr) { setSecondaryDataReady(false); return; }
    if (activeTab !== "overview") { setSecondaryDataReady(true); return; }
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    const bw = typeof window === "undefined" ? undefined : (window as any);
    const markReady = () => setSecondaryDataReady(true);
    if (typeof bw?.requestIdleCallback === "function") {
      idleId = bw.requestIdleCallback(markReady, { timeout: 900 });
    } else {
      timeoutId = setTimeout(markReady, 250);
    }
    return () => {
      if (idleId !== null && typeof bw?.cancelIdleCallback === "function") bw.cancelIdleCallback(idleId);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [activeTab, canAccessHr]);

  useEffect(() => {
    if (!canAccessHr) { setAccountUsersLoading(false); return; }
    const unsub = onSnapshot(query(collection(db, "users")), (snap) => {
      setAccountUsers(snap.docs.map((e) => mapAccountUserToHrEmployee({ id: e.id, ...e.data() } as User)));
      setAccountUsersLoading(false);
    }, () => setAccountUsersLoading(false));
    return () => unsub();
  }, [canAccessHr]);

  useEffect(() => {
    if (!canAccessHr) { setManualEmployeesLoading(false); return; }
    const unsub = onSnapshot(query(collection(db, "hrEmployees")), (snap) => {
      setManualEmployees(snap.docs.map((e) => mapManualEmployeeToHrEmployee(e.id, e.data())));
      setManualEmployeesLoading(false);
    }, () => setManualEmployeesLoading(false));
    return () => unsub();
  }, [canAccessHr]);

  useEffect(() => {
    if (!canAccessHr) { setTimesheetsLoading(false); return; }
    if (!shouldLoadTimesheets) return;
    const todayDocId = format(new Date(), "yyyy-MM-dd");
    setTimesheetsLoading(true);
    const unsub = onSnapshot(query(collectionGroup(db, "Timesheet"), where("date", "==", todayDocId)), (snap) => {
      const nextMap: Record<string, TimesheetSummary> = {};
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const userId = String(data?.updatedBy?.id || "").trim() || String(docSnap.ref.parent.parent?.id || "").trim();
        if (!userId) return;
        const perHour = Array.isArray(data?.perHour) ? data.perHour : [];
        nextMap[userId] = { userId, dutyStart: data?.dutyStart, dutyEnd: data?.dutyEnd, remark: String(data?.remark || ""), updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : undefined, filledSlots: perHour.filter((e: any) => String(e?.workDetail || "").trim()).length, totalSlots: perHour.length };
      });
      setTimesheetMap(nextMap);
      setTimesheetsLoading(false);
    }, () => setTimesheetsLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadTimesheets]);

  useEffect(() => {
    if (!canAccessHr) { setPayrollLoading(false); return; }
    if (!shouldLoadPayroll) return;
    setPayrollLoading(true);
    const unsub = onSnapshot(query(collection(db, "hrPayroll"), where("month", "==", selectedMonth)), (snap) => {
      const nextMap: Record<string, PayrollRecord> = {};
      snap.docs.forEach((e) => { const data = e.data() as Omit<PayrollRecord, "id">; nextMap[data.userId] = { id: e.id, ...data }; });
      setPayrollMapRaw(nextMap);
      setPayrollLoading(false);
    }, () => setPayrollLoading(false));
    return () => unsub();
  }, [canAccessHr, selectedMonth, shouldLoadPayroll]);

  useEffect(() => {
    if (!canAccessHr) { setLeaveRequestsLoading(false); return; }
    if (!shouldLoadLeaveRequests) return;
    const unsub = onSnapshot(query(collection(db, "hrLeaveRequests")), (snap) => { setLeaveRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrLeaveRequest, "id">) }))); setLeaveRequestsLoading(false); }, () => setLeaveRequestsLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadLeaveRequests]);

  useEffect(() => {
    if (!canAccessHr) { setExitRecordsLoading(false); return; }
    if (!shouldLoadExitRecords) return;
    const unsub = onSnapshot(query(collection(db, "hrExitRecords")), (snap) => { setExitRecords(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrExitRecord, "id">) }))); setExitRecordsLoading(false); }, () => setExitRecordsLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadExitRecords]);

  useEffect(() => {
    if (!canAccessHr) { setAttendanceLoading(false); return; }
    if (!shouldLoadAttendance) return;
    const unsub = onSnapshot(query(collection(db, "hrAttendance"), where("date", ">=", `${selectedMonth}-01`), where("date", "<=", `${selectedMonth}-31`)), (snap) => { setAttendanceRecordsRaw(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AttendanceRecord, "id">) }))); setAttendanceLoading(false); }, () => setAttendanceLoading(false));
    return () => unsub();
  }, [canAccessHr, selectedMonth, shouldLoadAttendance]);

  useEffect(() => {
    if (!canAccessHr) { setHolidaysLoading(false); return; }
    if (!shouldLoadHolidays) return;
    const unsub = onSnapshot(query(collection(db, "hrHolidays")), (snap) => { setHolidays(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrHoliday, "id">) }))); setHolidaysLoading(false); }, () => setHolidaysLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadHolidays]);

  useEffect(() => {
    if (!canAccessHr) { setLettersLoading(false); return; }
    if (!shouldLoadLetters) return;
    const unsub = onSnapshot(query(collection(db, "hrLetters")), (snap) => { setLetters(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrLetter, "id">) }))); setLettersLoading(false); }, () => setLettersLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadLetters]);

  useEffect(() => {
    if (!canAccessHr) { setLoansLoading(false); return; }
    if (!shouldLoadLoans) return;
    const unsub = onSnapshot(query(collection(db, "hrLoans")), (snap) => { setLoans(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrLoan, "id">) }))); setLoansLoading(false); }, () => setLoansLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadLoans]);

  useEffect(() => {
    if (!canAccessHr) { setWarningsLoading(false); return; }
    if (!shouldLoadWarnings) return;
    const unsub = onSnapshot(query(collection(db, "hrWarnings")), (snap) => { setWarnings(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrWarning, "id">) }))); setWarningsLoading(false); }, () => setWarningsLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadWarnings]);

  useEffect(() => {
    if (!canAccessHr) { setExpenseClaimsLoading(false); return; }
    if (!shouldLoadExpenseClaims) return;
    const unsub = onSnapshot(query(collection(db, "hrExpenseClaims")), (snap) => { setExpenseClaims(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrExpenseClaim, "id">) }))); setExpenseClaimsLoading(false); }, () => setExpenseClaimsLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadExpenseClaims]);

  useEffect(() => {
    if (!canAccessHr) { setRosterLoading(false); return; }
    if (!shouldLoadRoster) return;
    const unsub = onSnapshot(query(collection(db, "hrRoster"), where("date", ">=", `${selectedMonth}-01`), where("date", "<=", `${selectedMonth}-31`)), (snap) => { setRosterEntries(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrRosterEntry, "id">) }))); setRosterLoading(false); }, () => setRosterLoading(false));
    return () => unsub();
  }, [canAccessHr, selectedMonth, shouldLoadRoster]);

  useEffect(() => {
    if (!canAccessHr) { setAppraisalsLoading(false); return; }
    if (!shouldLoadAppraisals) return;
    const unsub = onSnapshot(query(collection(db, "hrAppraisals")), (snap) => { setAppraisals(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrAppraisal, "id">) }))); setAppraisalsLoading(false); }, () => setAppraisalsLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadAppraisals]);

  useEffect(() => {
    if (!canAccessHr) { setIncrementsLoading(false); return; }
    if (!shouldLoadIncrements) return;
    const unsub = onSnapshot(query(collection(db, "hrIncrements")), (snap) => { setIncrements(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrIncrementRecord, "id">) }))); setIncrementsLoading(false); }, () => setIncrementsLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadIncrements]);

  useEffect(() => {
    if (!canAccessHr) { setJobsLoading(false); return; }
    if (!shouldLoadJobs) return;
    const unsub = onSnapshot(query(collection(db, "hrJobs")), (snap) => { setJobs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrJobOpening, "id">) }))); setJobsLoading(false); }, () => setJobsLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadJobs]);

  useEffect(() => {
    if (!canAccessHr) { setApplicantsLoading(false); return; }
    if (!shouldLoadApplicants) return;
    const unsub = onSnapshot(query(collection(db, "hrApplicants")), (snap) => { setApplicants(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrApplicant, "id">) }))); setApplicantsLoading(false); }, () => setApplicantsLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadApplicants]);

  // ─── Early returns ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!canAccessHr) { setSelfServiceRequestsLoading(false); return; }
    if (!shouldLoadSelfServiceRequests) return;
    const unsub = onSnapshot(query(collection(db, "hrSelfServiceRequests")), (snap) => {
      setSelfServiceRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrSelfServiceRequest, "id">) })));
      setSelfServiceRequestsLoading(false);
    }, () => setSelfServiceRequestsLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadSelfServiceRequests]);

  useEffect(() => {
    if (!canAccessHr) { setDepartmentsLoading(false); return; }
    if (!shouldLoadOrgSetup) return;
    const unsub = onSnapshot(query(collection(db, "hrDepartments")), (snap) => {
      setDepartments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrDepartmentRecord, "id">) })));
      setDepartmentsLoading(false);
    }, () => setDepartmentsLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadOrgSetup]);

  useEffect(() => {
    if (!canAccessHr) { setDesignationsLoading(false); return; }
    if (!shouldLoadOrgSetup) return;
    const unsub = onSnapshot(query(collection(db, "hrDesignations")), (snap) => {
      setDesignations(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrDesignationRecord, "id">) })));
      setDesignationsLoading(false);
    }, () => setDesignationsLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadOrgSetup]);

  useEffect(() => {
    if (!canAccessHr) { setBranchesLoading(false); return; }
    if (!shouldLoadOrgSetup) return;
    const unsub = onSnapshot(query(collection(db, "hrBranches")), (snap) => {
      setBranches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HrBranchRecord, "id">) })));
      setBranchesLoading(false);
    }, () => setBranchesLoading(false));
    return () => unsub();
  }, [canAccessHr, shouldLoadOrgSetup]);

  if (!loading && !canAccessHr) {
    return (
      <div className="container mx-auto p-3 md:p-4 lg:p-5">
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <ShieldCheck className="h-5 w-5" />
              HR Access Required
            </CardTitle>
            <CardDescription>You do not currently have permission to open the HR dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline"><Link href="/dashboard/account">Open My Account</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto space-y-4 p-3 md:p-4 lg:p-5">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-5 w-80" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-[480px] w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-4 p-3 md:p-4 lg:p-5">
      <div className="relative overflow-hidden rounded-xl bg-[linear-gradient(135deg,_#0b1f33_0%,_#17324d_54%,_#1f4b5d_100%)] text-white shadow-lg shadow-slate-900/10">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-sky-400/10 blur-3xl" />
          <div className="absolute -bottom-8 right-40 h-44 w-44 rounded-full bg-emerald-300/10 blur-3xl" />
          <div className="absolute left-1/3 top-0 h-px w-1/2 bg-gradient-to-r from-transparent via-white/12 to-transparent" />
        </div>

        <div className="relative z-10 flex flex-col gap-4 p-5 md:p-6 xl:flex-row xl:items-center xl:gap-8">
          <div className="flex-1 space-y-2.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-teal-300" />
              <span className="text-[10px] font-bold uppercase tracking-[0.36em] text-slate-200">People Operations</span>
            </div>
            <h1 className="max-w-xl text-2xl font-bold tracking-tight text-white md:text-3xl">
              HR &amp; Payroll Desk
            </h1>
            <p className="max-w-lg text-sm leading-relaxed text-slate-200/85">
              Manage employee records, run monthly payroll, print salary slips, and track performance — all in one workspace.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 xl:w-[360px]">
            <Button
              type="button"
              className="col-span-2 h-10 justify-start gap-3 rounded-lg border-0 bg-[#1f6f78] px-4 text-white shadow-none hover:bg-[#255f6e]"
              onClick={() => employee.openCreateManualEmployeeDialog()}
            >
              <UserPlus className="h-4 w-4 shrink-0" />
              <span className="font-semibold">Add Non-Login Employee</span>
            </Button>
            <Button
              type="button"
              className="h-9 justify-start gap-2 rounded-lg border border-white/12 bg-white/7 px-3.5 text-white hover:bg-white/14"
              onClick={() => void payroll.generatePendingPayroll()}
              disabled={payroll.bulkGenerating || payrollLoading}
            >
              {payroll.bulkGenerating ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <FileText className="h-4 w-4 shrink-0" />}
              <span className="text-sm font-medium">Run Payroll</span>
            </Button>
            <Button
              type="button"
              className="h-9 justify-start gap-2 rounded-lg border border-white/12 bg-white/7 px-3.5 text-white hover:bg-white/14"
              onClick={() => void payroll.downloadMonthlySalarySlips()}
              disabled={payroll.downloadingMonthSlips || payrollLoading}
            >
              {payroll.downloadingMonthSlips ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <FileText className="h-4 w-4 shrink-0" />}
              <span className="text-sm font-medium">Salary Slips</span>
            </Button>
            <Button
              asChild
              className="col-span-2 h-8 justify-between rounded-lg border border-white/12 bg-transparent px-3.5 text-slate-300 hover:bg-white/8 hover:text-white"
            >
              <Link href="/dashboard/users">
                <span className="flex items-center gap-2 text-xs font-medium">
                  <Landmark className="h-3.5 w-3.5" />
                  User Management
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => showTab("employees")}
          className="group relative overflow-hidden rounded-xl border border-indigo-100 bg-[linear-gradient(180deg,_#fcfdff_0%,_#eef4ff_100%)] p-4 text-left shadow-sm transition-all hover:border-indigo-200 hover:shadow-md"
        >
          <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-indigo-500" />
          <div className="flex items-start justify-between gap-3 pl-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Active Employees</p>
              {usersLoading ? <Skeleton className="mt-2 h-8 w-14" /> : <p className="mt-1 text-2xl font-bold text-slate-950">{activeEmployees.length}</p>}
              <p className="mt-1 text-xs text-slate-500">Currently active or on leave</p>
            </div>
            <div className="rounded-lg bg-white/80 p-2 ring-1 ring-indigo-100"><Users className="h-4 w-4 text-indigo-600" /></div>
          </div>
          <div className="mt-2.5 flex items-center gap-2 pl-3">
            <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-slate-400 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600">
              <Eye className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-medium transition-[max-width] duration-200 group-hover:max-w-[32px]">
                View
              </span>
            </span>
            <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-slate-400 transition-colors group-hover:bg-amber-50 group-hover:text-amber-600">
              <Pencil className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-medium transition-[max-width] duration-200 group-hover:max-w-[48px]">
                Update
              </span>
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => showTab("employees")}
          className="group relative overflow-hidden rounded-xl border border-sky-100 bg-[linear-gradient(180deg,_#fbfeff_0%,_#edf8ff_100%)] p-4 text-left shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
        >
          <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-blue-500" />
          <div className="flex items-start justify-between gap-3 pl-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Salary Configured</p>
              {usersLoading ? <Skeleton className="mt-2 h-8 w-14" /> : <p className="mt-1 text-2xl font-bold text-slate-950">{salaryConfiguredCount}</p>}
              <p className="mt-1 text-xs text-slate-500">Ready for payroll generation</p>
            </div>
            <div className="rounded-lg bg-white/80 p-2 ring-1 ring-blue-100"><Landmark className="h-4 w-4 text-blue-600" /></div>
          </div>
          <p className="mt-3 pl-3 text-[11px] font-medium text-slate-400 transition-colors group-hover:text-blue-600">View details →</p>
        </button>

        <button
          type="button"
          onClick={() => showTab("payroll")}
          className="group relative overflow-hidden rounded-xl border border-emerald-100 bg-[linear-gradient(180deg,_#fbfffd_0%,_#ecfdf5_100%)] p-4 text-left shadow-sm transition-all hover:border-emerald-200 hover:shadow-md"
        >
          <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-emerald-500" />
          <div className="flex items-start justify-between gap-3 pl-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Payroll Generated</p>
              {payrollLoading ? <Skeleton className="mt-2 h-8 w-14" /> : <p className="mt-1 text-2xl font-bold text-slate-950">{payrollGeneratedCount}</p>}
              <p className="mt-1 text-xs text-slate-500">{formatMonthLabel(selectedMonth)} records saved</p>
            </div>
            <div className="rounded-lg bg-white/80 p-2 ring-1 ring-emerald-100"><CreditCard className="h-4 w-4 text-emerald-600" /></div>
          </div>
          <p className="mt-3 pl-3 text-[11px] font-medium text-slate-400 transition-colors group-hover:text-emerald-600">View details →</p>
        </button>

        <button
          type="button"
          onClick={() => showTab("timesheets")}
          className="group relative overflow-hidden rounded-xl border border-amber-100 bg-[linear-gradient(180deg,_#fffdfa_0%,_#fff7e8_100%)] p-4 text-left shadow-sm transition-all hover:border-amber-200 hover:shadow-md"
        >
          <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-amber-500" />
          <div className="flex items-start justify-between gap-3 pl-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Submitted Today</p>
              {timesheetsLoading ? <Skeleton className="mt-2 h-8 w-14" /> : <p className="mt-1 text-2xl font-bold text-slate-950">{submittedTodayCount}</p>}
              <p className="mt-1 text-xs text-slate-500">of {timesheetEligibleUsers.length} tracked users</p>
            </div>
            <div className="rounded-lg bg-white/80 p-2 ring-1 ring-amber-100"><Clock3 className="h-4 w-4 text-amber-600" /></div>
          </div>
          <p className="mt-3 pl-3 text-[11px] font-medium text-slate-400 transition-colors group-hover:text-amber-600">View details →</p>
        </button>
      </div>

      <div ref={tabsRef}>
        <HrWorkspaceTabs
          activeTab={activeTab} setActiveTab={setActiveTab}
          selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
          searchTerm={searchTerm} setSearchTerm={setSearchTerm}
          usersLoading={usersLoading} users={users} activeEmployees={activeEmployees}
          payrollEmployees={payrollEmployees} salaryConfiguredCount={salaryConfiguredCount}
          payrollGeneratedCount={payrollGeneratedCount} totalNetPayout={totalNetPayout}
          submittedTodayCount={submittedTodayCount} timesheetEligibleCount={timesheetEligibleUsers.length}
          filteredEmployees={filteredEmployees} filteredPayrollRows={filteredPayrollRows}
          filteredTodayRows={filteredTodayRows} performanceRows={performanceRows}
          payrollLoading={payrollLoading} timesheetsLoading={timesheetsLoading}
          bulkGenerating={payroll.bulkGenerating} downloadingMonthSlips={payroll.downloadingMonthSlips}
          onCreateManualEmployee={employee.openCreateManualEmployeeDialog}
          onOpenEmployeeDialog={employee.openEmployeeDialog}
          onOpenPayrollDialog={payroll.openPayrollDialog}
          onOpenSalarySlip={payroll.openSalarySlip}
          onGeneratePendingPayroll={payroll.generatePendingPayroll}
          onDownloadMonthlySalarySlips={payroll.downloadMonthlySalarySlips}
          leaveRequests={leaveRequests} leaveRequestsLoading={leaveRequestsLoading}
          exitRecords={exitRecords} exitRecordsLoading={exitRecordsLoading}
          onOpenLeaveDialog={leaveExit.openLeaveDialog}
          onReviewLeaveRequest={leaveExit.reviewLeaveRequest}
          onConfirmLeaveRequest={leaveExit.confirmLeaveRequest}
          onDeleteLeaveRequest={leaveExit.deleteLeaveRequest}
          onAcceptHandover={leaveExit.acceptHandover}
          onRejectHandover={leaveExit.rejectHandover}
          onOpenExitDialog={leaveExit.openExitDialog}
          attendanceRecords={attendanceRecords} attendanceLoading={attendanceLoading}
          holidays={holidays} holidaysLoading={holidaysLoading}
          onOpenAttendanceUpload={() => attendance.setShowAttendanceUpload(true)}
          onOpenHolidayDialog={(employeeId) => attendance.setHolidayForm(createHolidayFormState(employeeId))}
          onDeleteHoliday={attendance.deleteHoliday}
          onOpenManageAttendance={(emp) => attendance.setManageAttendanceEmployee(emp)}
          letters={letters} lettersLoading={lettersLoading}
          loans={loans} loansLoading={loansLoading}
          warnings={warnings} warningsLoading={warningsLoading}
          expenseClaims={expenseClaims} expenseClaimsLoading={expenseClaimsLoading}
          rosterEntries={rosterEntries} rosterLoading={rosterLoading}
          appraisals={appraisals} appraisalsLoading={appraisalsLoading}
          increments={increments} incrementsLoading={incrementsLoading}
          jobs={jobs} jobsLoading={jobsLoading}
          applicants={applicants} applicantsLoading={applicantsLoading}
          selfServiceRequests={selfServiceRequests}
          selfServiceRequestsLoading={selfServiceRequestsLoading}
          departments={departments}
          departmentsLoading={departmentsLoading}
          designations={designations}
          designationsLoading={designationsLoading}
          branches={branches}
          branchesLoading={branchesLoading}
          onOpenLetterDialog={hrTools.openLetterDialog}
          onOpenLoanDialog={hrTools.openLoanDialog}
          onOpenWarningDialog={hrTools.openWarningDialog}
          onOpenExpenseClaimDialog={() => hrTools.setExpenseClaimForm(createExpenseClaimFormState())}
          onReviewExpenseClaim={hrTools.reviewExpenseClaim}
          onOpenRosterDialog={() => hrTools.setRosterForm(createRosterFormState())}
          onDeleteRosterEntry={hrTools.deleteRosterEntry}
          onOpenAppraisalDialog={hrTools.openAppraisalDialog}
          onOpenIncrementDialog={hrTools.openIncrementDialog}
          onOpenJobDialog={() => hrTools.setJobForm(createJobFormState())}
          onDeleteJob={hrTools.deleteJob}
          onOpenApplicantDialog={hrTools.openApplicantDialog}
          onUpdateApplicantStage={hrTools.updateApplicantStage}
          onOpenSelfServiceDialog={phaseOne.openSelfServiceDialog}
          onReviewSelfServiceRequest={phaseOne.reviewSelfServiceRequest}
          onOpenDepartmentDialog={phaseOne.openDepartmentDialog}
          onDeleteDepartment={phaseOne.deleteDepartment}
          onOpenDesignationDialog={phaseOne.openDesignationDialog}
          onDeleteDesignation={phaseOne.deleteDesignation}
          onOpenBranchDialog={phaseOne.openBranchDialog}
          onDeleteBranch={phaseOne.deleteBranch}
        />
      </div>

      {/* ─── Dialogs ─────────────────────────────────────────────────────────── */}

      {employee.employeeDialogUser && employee.employeeForm ? (
        <EmployeeDetailsDialog employeeDialogUser={employee.employeeDialogUser} employeeForm={employee.employeeForm} setEmployeeForm={employee.setEmployeeForm} savingEmployee={employee.savingEmployee} onClose={employee.closeEmployeeDialog} onSave={employee.saveEmployeeDetails} />
      ) : null}

      {payroll.payrollDialogUser && payroll.payrollForm ? (
        <PayrollSetupDialog payrollDialogUser={payroll.payrollDialogUser} payrollForm={payroll.payrollForm} setPayrollForm={payroll.setPayrollForm} previewRecord={payroll.previewPayrollRecord} selectedMonth={selectedMonth} savingPayroll={payroll.savingPayroll} onClose={payroll.closePayrollDialog} onSave={payroll.savePayroll} />
      ) : null}

      {payroll.salarySlipRecord && payroll.salarySlipEmployee ? (
        <SalarySlipDialog salarySlipRecord={payroll.salarySlipRecord} salarySlipEmployee={payroll.salarySlipEmployee} downloadingHistorySlips={payroll.downloadingHistorySlips} onClose={payroll.closeSalarySlipDialog} onDownloadHistory={payroll.downloadEmployeeSalarySlipHistory} onPrint={payroll.printSalarySlip} />
      ) : null}

      {isLeaveDialogOpen ? (
        <LeaveRequestDialog open={isLeaveDialogOpen} employee={leaveExit.leaveDialogEmployee} employees={activeEmployees} form={leaveExit.leaveForm!} setForm={leaveExit.setLeaveForm} saving={leaveExit.savingLeave} onClose={leaveExit.closeLeaveDialog} onSave={leaveExit.submitLeaveRequest} />
      ) : null}

      {leaveExit.exitDialogEmployee && leaveExit.exitForm ? (
        <ExitRecordDialog employee={leaveExit.exitDialogEmployee} form={leaveExit.exitForm} setForm={leaveExit.setExitForm} attendanceRecords={attendanceRecords} holidays={holidays} leaveRequests={leaveRequests} saving={leaveExit.savingExit} onClose={leaveExit.closeExitDialog} onSave={leaveExit.saveExitRecord} />
      ) : null}

      {attendance.showAttendanceUpload ? (
        <AttendanceUploadDialog employees={activeEmployees} month={selectedMonth} saving={attendance.savingAttendance} onClose={() => attendance.setShowAttendanceUpload(false)} onSync={attendance.syncAttendanceFromApi} />
      ) : null}

      {attendance.holidayForm ? (
        <HolidayDialog employees={activeEmployees} form={attendance.holidayForm} setForm={attendance.setHolidayForm} saving={attendance.savingHoliday} onClose={() => attendance.setHolidayForm(null)} onSave={attendance.saveHoliday} />
      ) : null}

      {attendance.manageAttendanceEmployee ? (
        <ManageAttendanceDialog employee={attendance.manageAttendanceEmployee} month={selectedMonth} existingRecords={attendanceRecords} leaveRequests={leaveRequests} saving={attendance.savingAttendance} onClose={() => attendance.setManageAttendanceEmployee(null)} onSave={attendance.saveAttendanceRecord} onDelete={attendance.deleteAttendanceRecord} />
      ) : null}

      {phaseOne.selfServiceForm ? (
        <SelfServiceRequestDialog
          employees={activeEmployees}
          form={phaseOne.selfServiceForm}
          setForm={phaseOne.setSelfServiceForm}
          saving={phaseOne.savingSelfService}
          onClose={phaseOne.closeSelfServiceDialog}
          onSave={phaseOne.saveSelfServiceRequest}
        />
      ) : null}

      {phaseOne.departmentForm ? (
        <DepartmentDialog
          employees={activeEmployees}
          form={phaseOne.departmentForm}
          setForm={phaseOne.setDepartmentForm}
          saving={phaseOne.savingDepartment}
          onClose={phaseOne.closeDepartmentDialog}
          onSave={phaseOne.saveDepartment}
        />
      ) : null}

      {phaseOne.designationForm ? (
        <DesignationDialog
          departments={departmentNames}
          form={phaseOne.designationForm}
          setForm={phaseOne.setDesignationForm}
          saving={phaseOne.savingDesignation}
          onClose={phaseOne.closeDesignationDialog}
          onSave={phaseOne.saveDesignation}
        />
      ) : null}

      {phaseOne.branchForm ? (
        <BranchDialog
          employees={activeEmployees}
          form={phaseOne.branchForm}
          setForm={phaseOne.setBranchForm}
          saving={phaseOne.savingBranch}
          onClose={phaseOne.closeBranchDialog}
          onSave={phaseOne.saveBranch}
        />
      ) : null}

      {hrTools.letterForm ? (
        <LetterDialog employee={hrTools.letterDialogEmployee} employees={activeEmployees} form={hrTools.letterForm} setForm={hrTools.setLetterForm} saving={hrTools.savingLetter} onClose={hrTools.closeLetterDialog} onSave={hrTools.saveLetter} />
      ) : null}

      {hrTools.loanForm && hrTools.loanDialogEmployee ? (
        <LoanDialog employee={hrTools.loanDialogEmployee} employees={activeEmployees} form={hrTools.loanForm} setForm={hrTools.setLoanForm} existingLoans={loans.filter((l) => l.employeeId === hrTools.loanDialogEmployee!.id)} saving={hrTools.savingLoan} onClose={hrTools.closeLoanDialog} onSave={hrTools.saveLoan} onMarkClosed={hrTools.markLoanClosed} />
      ) : null}

      {hrTools.warningForm && hrTools.warningDialogEmployee ? (
        <WarningDialog employee={hrTools.warningDialogEmployee} employees={activeEmployees} form={hrTools.warningForm} setForm={hrTools.setWarningForm} existingWarnings={warnings.filter((w) => w.employeeId === hrTools.warningDialogEmployee!.id)} saving={hrTools.savingWarning} onClose={hrTools.closeWarningDialog} onSave={hrTools.saveWarning} onDelete={hrTools.deleteWarning} />
      ) : null}

      {hrTools.expenseClaimForm ? (
        <ExpenseClaimDialog employees={activeEmployees} form={hrTools.expenseClaimForm} setForm={hrTools.setExpenseClaimForm} saving={hrTools.savingExpenseClaim} onClose={() => hrTools.setExpenseClaimForm(null)} onSave={hrTools.saveExpenseClaim} />
      ) : null}

      {hrTools.rosterForm ? (
        <RosterEntryDialog employees={activeEmployees} form={hrTools.rosterForm} setForm={hrTools.setRosterForm} saving={hrTools.savingRoster} onClose={() => hrTools.setRosterForm(null)} onSave={hrTools.saveRosterEntry} />
      ) : null}

      {hrTools.appraisalForm && hrTools.appraisalDialogEmployee ? (
        <AppraisalDialog employee={hrTools.appraisalDialogEmployee} employees={activeEmployees} form={hrTools.appraisalForm} setForm={hrTools.setAppraisalForm} saving={hrTools.savingAppraisal} onClose={hrTools.closeAppraisalDialog} onSave={hrTools.saveAppraisal} />
      ) : null}

      {hrTools.incrementForm && hrTools.incrementDialogEmployee ? (
        <IncrementDialog employee={hrTools.incrementDialogEmployee} employees={activeEmployees} form={hrTools.incrementForm} setForm={hrTools.setIncrementForm} saving={hrTools.savingIncrement} onClose={hrTools.closeIncrementDialog} onSave={hrTools.saveIncrement} />
      ) : null}

      {hrTools.jobForm ? (
        <JobDialog form={hrTools.jobForm} setForm={hrTools.setJobForm} saving={hrTools.savingJob} onClose={() => hrTools.setJobForm(null)} onSave={hrTools.saveJob} />
      ) : null}

      {hrTools.applicantForm && hrTools.applicantDialogJob ? (
        <ApplicantDialog jobs={jobs} form={hrTools.applicantForm} setForm={hrTools.setApplicantForm} existingApplicants={applicants.filter((a) => a.jobId === hrTools.applicantDialogJob!.id)} saving={hrTools.savingApplicant} onClose={hrTools.closeApplicantDialog} onSave={hrTools.saveApplicant} onUpdateStage={hrTools.updateApplicantStage} />
      ) : null}
    </div>
  );
}
