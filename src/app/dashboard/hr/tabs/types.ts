import type {
  AttendanceRecord,
  EmployeePerformanceRow,
  HrApplicant,
  HrAppraisal,
  HrBranchRecord,
  HrDepartmentRecord,
  HrDesignationRecord,
  HrEmployee,
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
  PayrollRow,
} from "../types";

export type HrWorkspaceTabsProps = {
  activeTab: string;
  setActiveTab: (value: string) => void;
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  usersLoading: boolean;
  users: HrEmployee[];
  activeEmployees: HrEmployee[];
  payrollEmployees: HrEmployee[];
  salaryConfiguredCount: number;
  payrollGeneratedCount: number;
  totalNetPayout: number;
  submittedTodayCount: number;
  timesheetEligibleCount: number;
  filteredEmployees: HrEmployee[];
  filteredPayrollRows: PayrollRow[];
  filteredTodayRows: HrTimesheetRow[];
  performanceRows: EmployeePerformanceRow[];
  payrollLoading: boolean;
  timesheetsLoading: boolean;
  bulkGenerating: boolean;
  downloadingMonthSlips: boolean;
  onCreateManualEmployee: (prefill?: Partial<HrEmployee>) => void;
  onOpenEmployeeDialog: (employee: HrEmployee) => void;
  onOpenPayrollDialog: (employee: HrEmployee) => void;
  onOpenSalarySlip: (employee: HrEmployee, row: PayrollRow["record"]) => void;
  onGeneratePendingPayroll: () => void | Promise<void>;
  onDownloadMonthlySalarySlips: () => void | Promise<void>;
  leaveRequests: HrLeaveRequest[];
  leaveRequestsLoading: boolean;
  exitRecords: HrExitRecord[];
  exitRecordsLoading: boolean;
  onOpenLeaveDialog: (employee: HrEmployee | null) => void;
  onReviewLeaveRequest: (id: string, status: "approved" | "rejected", note?: string, approvalDate?: string) => void | Promise<void>;
  onConfirmLeaveRequest: (id: string) => void | Promise<void>;
  onDeleteLeaveRequest: (id: string) => void | Promise<void>;
  onAcceptHandover: (id: string) => void | Promise<void>;
  onRejectHandover: (id: string) => void | Promise<void>;
  onOpenExitDialog: (employee: HrEmployee) => void;
  attendanceRecords: AttendanceRecord[];
  attendanceLoading: boolean;
  holidays: HrHoliday[];
  holidaysLoading: boolean;
  onOpenAttendanceUpload: () => void;
  onOpenHolidayDialog: (employeeId?: string) => void;
  onDeleteHoliday: (id: string) => void | Promise<void>;
  onOpenManageAttendance: (employee: HrEmployee) => void;
  letters: HrLetter[];
  lettersLoading: boolean;
  loans: HrLoan[];
  loansLoading: boolean;
  warnings: HrWarning[];
  warningsLoading: boolean;
  expenseClaims: HrExpenseClaim[];
  expenseClaimsLoading: boolean;
  rosterEntries: HrRosterEntry[];
  rosterLoading: boolean;
  appraisals: HrAppraisal[];
  appraisalsLoading: boolean;
  increments: HrIncrementRecord[];
  incrementsLoading: boolean;
  jobs: HrJobOpening[];
  jobsLoading: boolean;
  applicants: HrApplicant[];
  applicantsLoading: boolean;
  selfServiceRequests: HrSelfServiceRequest[];
  selfServiceRequestsLoading: boolean;
  departments: HrDepartmentRecord[];
  departmentsLoading: boolean;
  designations: HrDesignationRecord[];
  designationsLoading: boolean;
  branches: HrBranchRecord[];
  branchesLoading: boolean;
  onOpenLetterDialog: (employee: HrEmployee | null) => void;
  onOpenLoanDialog: (employee: HrEmployee) => void;
  onOpenWarningDialog: (employee: HrEmployee) => void;
  onOpenExpenseClaimDialog: () => void;
  onReviewExpenseClaim: (id: string, status: "approved" | "rejected") => void | Promise<void>;
  onOpenRosterDialog: () => void;
  onDeleteRosterEntry: (id: string) => void | Promise<void>;
  onOpenAppraisalDialog: (employee: HrEmployee) => void;
  onOpenIncrementDialog: (employee: HrEmployee) => void;
  onOpenJobDialog: () => void;
  onDeleteJob: (id: string) => void | Promise<void>;
  onOpenApplicantDialog: (job: HrJobOpening) => void;
  onUpdateApplicantStage: (applicantId: string, stage: HrApplicant["stage"]) => void | Promise<void>;
  onOpenSelfServiceDialog: (employeeId?: string) => void;
  onReviewSelfServiceRequest: (id: string, status: "in_review" | "approved" | "rejected") => void | Promise<void>;
  onOpenDepartmentDialog: (entry?: HrDepartmentRecord) => void;
  onDeleteDepartment: (id: string) => void | Promise<void>;
  onOpenDesignationDialog: (entry?: HrDesignationRecord) => void;
  onDeleteDesignation: (id: string) => void | Promise<void>;
  onOpenBranchDialog: (entry?: HrBranchRecord) => void;
  onDeleteBranch: (id: string) => void | Promise<void>;
};
