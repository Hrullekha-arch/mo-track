"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  BarChart3,
  BarChartHorizontalBig,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarOff,
  ChevronDown,
  CheckSquare,
  Clock3,
  CreditCard,
  FileText,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  LogOut,
  Receipt,
  Star,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatMonthLabel } from "./utils";
import type { HrWorkspaceTabsProps } from "./tabs/types";
export type { HrWorkspaceTabsProps };
import { OverviewTab } from "./tabs/tab-overview";
import { EmployeesTab } from "./tabs/tab-employees";
import { PayrollTab } from "./tabs/tab-payroll";
import { TimesheetsTab, PerformanceTab } from "./tabs/tab-timesheets-performance";
import { LeaveTab } from "./tabs/tab-leave";
import { DocumentsTab, OnboardingTab } from "./tabs/tab-docs-onboarding";
import { ExitTab } from "./tabs/tab-exit";
import { AttendanceTab } from "./tabs/tab-attendance";
import { ReportsTab } from "./tabs/tab-reports";
import { LettersTab, LoansTab, WarningsTab, ExpensesTab } from "./tabs/tab-hr-tools";
import { RosterTab, AppraisalsTab, IncrementsTab, RecruitmentTab } from "./tabs/tab-people";
import { ManagerApprovalsTab, OrganizationSetupTab, SelfServiceTab } from "./tabs/tab-phase-one";

const TAB_GROUPS = [
  {
    id: "core",
    label: undefined,
    tabs: [
      { value: "overview", icon: LayoutDashboard, label: "Overview" },
    ],
  },
  {
    id: "people",
    label: "People",
    tabs: [
      { value: "employees", icon: Users, label: "Employees" },
      { value: "self-service", icon: UserCheck, label: "Self-Service" },
      { value: "onboarding", icon: UserPlus, label: "Onboarding" },
      { value: "exit", icon: LogOut, label: "Exit & FnF" },
    ],
  },
  {
    id: "time",
    label: "Time",
    tabs: [
      { value: "attendance", icon: CalendarCheck, label: "Attendance" },
      { value: "timesheets", icon: Clock3, label: "Timesheets" },
      { value: "leave", icon: CalendarOff, label: "Leave" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    tabs: [
      { value: "payroll", icon: CreditCard, label: "Payroll" },
      { value: "loans", icon: Landmark, label: "Loans" },
      { value: "expenses", icon: Receipt, label: "Expenses" },
      { value: "increments", icon: TrendingUp, label: "Increments" },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    tabs: [
      { value: "performance", icon: BarChart3, label: "Performance" },
      { value: "appraisals", icon: Star, label: "Appraisals" },
      { value: "roster", icon: CheckSquare, label: "Roster" },
      { value: "recruitment", icon: Briefcase, label: "Recruitment" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    tabs: [
      { value: "manager-approvals", icon: CheckSquare, label: "Approvals" },
      { value: "org-setup", icon: Building2, label: "Org Setup" },
    ],
  },
  {
    id: "records",
    label: "Records",
    tabs: [
      { value: "reports", icon: BarChartHorizontalBig, label: "Reports" },
      { value: "documents", icon: FolderOpen, label: "Documents" },
      { value: "letters", icon: FileText, label: "Letters" },
      { value: "warnings", icon: AlertTriangle, label: "Warnings" },
    ],
  },
] as const;

const PRIMARY_TAB_VALUES = new Set([
  "overview",
  "employees",
  "self-service",
  "onboarding",
  "exit",
  "attendance",
  "timesheets",
  "leave",
  "payroll",
  "loans",
  "expenses",
]);

const PRIMARY_TABS = TAB_GROUPS.flatMap((group) =>
  group.tabs.filter((tab) => PRIMARY_TAB_VALUES.has(tab.value))
);

const SECONDARY_TAB_GROUPS = TAB_GROUPS
  .map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab) => !PRIMARY_TAB_VALUES.has(tab.value)),
  }))
  .filter((group) => group.tabs.length > 0);

function buildMonthOptions(centerMonth: string) {
  const [year, month] = centerMonth.split("-").map(Number);
  const centerDate = new Date(year, month - 1, 1);
  return Array.from({ length: 37 }, (_, index) => {
    const optionDate = new Date(centerDate.getFullYear(), centerDate.getMonth() + 6 - index, 1);
    const optionYear = optionDate.getFullYear();
    const optionMonth = optionDate.getMonth() + 1;
    const value = `${optionYear}-${String(optionMonth).padStart(2, "0")}`;
    return {
      value,
      label: formatMonthLabel(value),
    };
  });
}

export function HrWorkspaceTabs({
  activeTab,
  setActiveTab,
  selectedMonth,
  setSelectedMonth,
  searchTerm,
  setSearchTerm,
  usersLoading,
  users,
  activeEmployees,
  payrollEmployees,
  salaryConfiguredCount,
  payrollGeneratedCount,
  totalNetPayout,
  submittedTodayCount,
  timesheetEligibleCount,
  filteredEmployees,
  filteredPayrollRows,
  filteredTodayRows,
  performanceRows,
  payrollLoading,
  timesheetsLoading,
  bulkGenerating,
  downloadingMonthSlips,
  onCreateManualEmployee,
  onOpenEmployeeDialog,
  onOpenPayrollDialog,
  onOpenSalarySlip,
  onGeneratePendingPayroll,
  onDownloadMonthlySalarySlips,
  leaveRequests,
  leaveRequestsLoading,
  exitRecords,
  exitRecordsLoading,
  onOpenLeaveDialog,
  onReviewLeaveRequest,
  onConfirmLeaveRequest,
  onDeleteLeaveRequest,
  onAcceptHandover,
  onRejectHandover,
  onOpenExitDialog,
  attendanceRecords,
  attendanceLoading,
  holidays,
  holidaysLoading,
  onOpenAttendanceUpload,
  onOpenHolidayDialog,
  onDeleteHoliday,
  onOpenManageAttendance,
  letters,
  lettersLoading,
  loans,
  loansLoading,
  warnings,
  warningsLoading,
  expenseClaims,
  expenseClaimsLoading,
  rosterEntries,
  rosterLoading,
  appraisals,
  appraisalsLoading,
  increments,
  incrementsLoading,
  jobs,
  jobsLoading,
  applicants,
  applicantsLoading,
  selfServiceRequests,
  selfServiceRequestsLoading,
  departments,
  departmentsLoading,
  designations,
  designationsLoading,
  branches,
  branchesLoading,
  onOpenLetterDialog,
  onOpenLoanDialog,
  onOpenWarningDialog,
  onOpenExpenseClaimDialog,
  onReviewExpenseClaim,
  onOpenRosterDialog,
  onDeleteRosterEntry,
  onOpenAppraisalDialog,
  onOpenIncrementDialog,
  onOpenJobDialog,
  onDeleteJob,
  onOpenApplicantDialog,
  onUpdateApplicantStage,
  onOpenSelfServiceDialog,
  onReviewSelfServiceRequest,
  onOpenDepartmentDialog,
  onDeleteDepartment,
  onOpenDesignationDialog,
  onDeleteDesignation,
  onOpenBranchDialog,
  onDeleteBranch,
}: HrWorkspaceTabsProps) {
  const monthOptions = useMemo(() => buildMonthOptions(selectedMonth), [selectedMonth]);

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      {/* ── Top bar: title + controls ─────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 border-b border-slate-100 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 shadow-sm">
            <Users className="h-4.5 w-4.5 h-[18px] w-[18px] text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-slate-900">HR Workspace</p>
            <p className="text-xs text-slate-400">
              {formatMonthLabel(selectedMonth)} · People, Payroll &amp; Operations
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedMonth} onValueChange={(value) => setSelectedMonth(value || selectedMonth)}>
            <SelectTrigger className="h-8 w-[170px] border-slate-200 text-sm focus:ring-indigo-500">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent align="end">
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search employee, dept, code…"
            className="h-8 w-full border-slate-200 text-sm focus-visible:ring-indigo-500 md:w-[260px]"
          />
        </div>
      </div>

      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* ── Tab navigation ────────────────────────────────────────────── */}
          <div className="border-b border-slate-100 bg-slate-50/50">
            <div className="flex flex-wrap items-stretch justify-between gap-x-2 gap-y-0">
              <TabsList className="flex h-auto flex-wrap items-stretch gap-0 rounded-none bg-transparent p-0">
                {PRIMARY_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={cn(
                      "group relative flex items-center gap-1.5 rounded-none border-b-2 border-transparent px-3 py-2.5 text-[13px] font-medium text-slate-500 shadow-none transition-colors",
                      "hover:text-slate-800",
                      "data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700"
                    )}
                  >
                    <tab.icon className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-colors",
                      "text-slate-400 group-hover:text-slate-600",
                      "group-data-[state=active]:text-indigo-600"
                    )} />
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {SECONDARY_TAB_GROUPS.length ? (
                <div className="px-3 py-1.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                      >
                        More
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 rounded-xl border-slate-200">
                      {SECONDARY_TAB_GROUPS.map((group, groupIndex) => (
                        <div key={group.id}>
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                            {group.label || "More"}
                          </DropdownMenuLabel>
                          {group.tabs.map((tab) => (
                            <DropdownMenuItem
                              key={tab.value}
                              onClick={() => setActiveTab(tab.value)}
                              className="cursor-pointer gap-2 rounded-lg text-sm"
                            >
                              <tab.icon className="h-4 w-4 text-slate-500" />
                              {tab.label}
                            </DropdownMenuItem>
                          ))}
                          {groupIndex < SECONDARY_TAB_GROUPS.length - 1 ? <DropdownMenuSeparator /> : null}
                        </div>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
            </div>
          </div>

          {/* ── Tab content ───────────────────────────────────────────────── */}
          <div className="p-4">

          <TabsContent value="overview" className="mt-0 space-y-4">
            <OverviewTab
              usersLoading={usersLoading}
              users={users}
              activeEmployees={activeEmployees}
              payrollEmployees={payrollEmployees}
              payrollLoading={payrollLoading}
              payrollGeneratedCount={payrollGeneratedCount}
              totalNetPayout={totalNetPayout}
              timesheetsLoading={timesheetsLoading}
              submittedTodayCount={submittedTodayCount}
              timesheetEligibleCount={timesheetEligibleCount}
              performanceRows={performanceRows}
              leaveRequests={leaveRequests}
              leaveRequestsLoading={leaveRequestsLoading}
              attendanceRecords={attendanceRecords}
              attendanceLoading={attendanceLoading}
              exitRecords={exitRecords}
              exitRecordsLoading={exitRecordsLoading}
              letters={letters}
              lettersLoading={lettersLoading}
              loans={loans}
              loansLoading={loansLoading}
              warnings={warnings}
              warningsLoading={warningsLoading}
              expenseClaims={expenseClaims}
              expenseClaimsLoading={expenseClaimsLoading}
              rosterEntries={rosterEntries}
              rosterLoading={rosterLoading}
              appraisals={appraisals}
              appraisalsLoading={appraisalsLoading}
              increments={increments}
              incrementsLoading={incrementsLoading}
              jobs={jobs}
              jobsLoading={jobsLoading}
              applicants={applicants}
              setActiveTab={setActiveTab}
              selectedMonth={selectedMonth}
            />
          </TabsContent>

          <TabsContent value="employees">
            <EmployeesTab
              usersLoading={usersLoading}
              filteredEmployees={filteredEmployees}
              onCreateManualEmployee={onCreateManualEmployee}
              onOpenEmployeeDialog={onOpenEmployeeDialog}
            />
          </TabsContent>

          <TabsContent value="payroll">
            <PayrollTab
              payrollLoading={payrollLoading}
              filteredPayrollRows={filteredPayrollRows}
              bulkGenerating={bulkGenerating}
              downloadingMonthSlips={downloadingMonthSlips}
              onGeneratePendingPayroll={onGeneratePendingPayroll}
              onDownloadMonthlySalarySlips={onDownloadMonthlySalarySlips}
              onOpenPayrollDialog={onOpenPayrollDialog}
              onOpenSalarySlip={onOpenSalarySlip}
              attendanceRecords={attendanceRecords}
            />
          </TabsContent>

          <TabsContent value="timesheets">
            <TimesheetsTab
              timesheetsLoading={timesheetsLoading}
              filteredEmployees={filteredEmployees}
              filteredTodayRows={filteredTodayRows}
              onOpenEmployeeDialog={onOpenEmployeeDialog}
            />
          </TabsContent>

          <TabsContent value="performance" className="mt-0 space-y-4">
            <PerformanceTab
              usersLoading={usersLoading}
              performanceRows={performanceRows}
              submittedTodayCount={submittedTodayCount}
              timesheetEligibleCount={timesheetEligibleCount}
              onCreateManualEmployee={onCreateManualEmployee}
              onOpenEmployeeDialog={onOpenEmployeeDialog}
            />
          </TabsContent>

          <TabsContent value="leave" className="mt-0 space-y-4">
            <LeaveTab
              usersLoading={usersLoading}
              activeEmployees={activeEmployees}
              leaveRequests={leaveRequests}
              leaveRequestsLoading={leaveRequestsLoading}
              onOpenLeaveDialog={onOpenLeaveDialog}
              onReviewLeaveRequest={onReviewLeaveRequest}
              onConfirmLeaveRequest={onConfirmLeaveRequest}
              onDeleteLeaveRequest={onDeleteLeaveRequest}
              onAcceptHandover={onAcceptHandover}
              onRejectHandover={onRejectHandover}
            />
          </TabsContent>

          <TabsContent value="documents" className="mt-0 space-y-4">
            <DocumentsTab
              usersLoading={usersLoading}
              activeEmployees={activeEmployees}
              salaryConfiguredCount={salaryConfiguredCount}
              onOpenEmployeeDialog={onOpenEmployeeDialog}
            />
          </TabsContent>

          <TabsContent value="onboarding" className="mt-0 space-y-4">
            <OnboardingTab
              usersLoading={usersLoading}
              activeEmployees={activeEmployees}
              onOpenEmployeeDialog={onOpenEmployeeDialog}
            />
          </TabsContent>

          <TabsContent value="exit" className="mt-0 space-y-4">
            <ExitTab
              exitRecords={exitRecords}
              exitRecordsLoading={exitRecordsLoading}
              users={users}
              onOpenExitDialog={onOpenExitDialog}
            />
          </TabsContent>

          <TabsContent value="attendance" className="mt-0 space-y-4">
            <AttendanceTab
              activeEmployees={activeEmployees}
              attendanceRecords={attendanceRecords}
              attendanceLoading={attendanceLoading}
              holidays={holidays}
              holidaysLoading={holidaysLoading}
              selectedMonth={selectedMonth}
              onOpenAttendanceUpload={onOpenAttendanceUpload}
              onOpenHolidayDialog={onOpenHolidayDialog}
              onDeleteHoliday={onDeleteHoliday}
              onOpenManageAttendance={onOpenManageAttendance}
              onOpenPayrollDialog={onOpenPayrollDialog}
            />
          </TabsContent>

          <TabsContent value="reports" className="mt-0 space-y-4">
            <ReportsTab
              activeEmployees={activeEmployees}
              payrollEmployees={payrollEmployees}
              payrollGeneratedCount={payrollGeneratedCount}
              totalNetPayout={totalNetPayout}
              selectedMonth={selectedMonth}
              leaveRequests={leaveRequests}
              filteredPayrollRows={filteredPayrollRows}
              setActiveTab={setActiveTab}
            />
          </TabsContent>

          <TabsContent value="letters" className="mt-0 space-y-4">
            <LettersTab
              letters={letters}
              lettersLoading={lettersLoading}
              activeEmployees={activeEmployees}
              onOpenLetterDialog={onOpenLetterDialog}
            />
          </TabsContent>

          <TabsContent value="self-service" className="mt-0 space-y-4">
            <SelfServiceTab
              selfServiceRequests={selfServiceRequests}
              selfServiceRequestsLoading={selfServiceRequestsLoading}
              onOpenSelfServiceDialog={onOpenSelfServiceDialog}
              onReviewSelfServiceRequest={onReviewSelfServiceRequest}
            />
          </TabsContent>

          <TabsContent value="org-setup" className="mt-0 space-y-4">
            <OrganizationSetupTab
              departments={departments}
              departmentsLoading={departmentsLoading}
              designations={designations}
              designationsLoading={designationsLoading}
              branches={branches}
              branchesLoading={branchesLoading}
              onOpenDepartmentDialog={onOpenDepartmentDialog}
              onDeleteDepartment={onDeleteDepartment}
              onOpenDesignationDialog={onOpenDesignationDialog}
              onDeleteDesignation={onDeleteDesignation}
              onOpenBranchDialog={onOpenBranchDialog}
              onDeleteBranch={onDeleteBranch}
            />
          </TabsContent>

          <TabsContent value="manager-approvals" className="mt-0 space-y-4">
            <ManagerApprovalsTab
              leaveRequests={leaveRequests}
              expenseClaims={expenseClaims}
              selfServiceRequests={selfServiceRequests}
              onReviewLeaveRequest={onReviewLeaveRequest}
              onReviewExpenseClaim={onReviewExpenseClaim}
              onReviewSelfServiceRequest={onReviewSelfServiceRequest}
            />
          </TabsContent>

          <TabsContent value="loans" className="mt-0 space-y-4">
            <LoansTab
              loans={loans}
              loansLoading={loansLoading}
              activeEmployees={activeEmployees}
              onOpenLoanDialog={onOpenLoanDialog}
            />
          </TabsContent>

          <TabsContent value="warnings" className="mt-0 space-y-4">
            <WarningsTab
              warnings={warnings}
              warningsLoading={warningsLoading}
              activeEmployees={activeEmployees}
              onOpenWarningDialog={onOpenWarningDialog}
            />
          </TabsContent>

          <TabsContent value="expenses" className="mt-0 space-y-4">
            <ExpensesTab
              expenseClaims={expenseClaims}
              expenseClaimsLoading={expenseClaimsLoading}
              onOpenExpenseClaimDialog={onOpenExpenseClaimDialog}
              onReviewExpenseClaim={onReviewExpenseClaim}
            />
          </TabsContent>

          <TabsContent value="roster" className="mt-0 space-y-4">
            <RosterTab
              rosterEntries={rosterEntries}
              rosterLoading={rosterLoading}
              selectedMonth={selectedMonth}
              onOpenRosterDialog={onOpenRosterDialog}
              onDeleteRosterEntry={onDeleteRosterEntry}
            />
          </TabsContent>

          <TabsContent value="appraisals" className="mt-0 space-y-4">
            <AppraisalsTab
              appraisals={appraisals}
              appraisalsLoading={appraisalsLoading}
              activeEmployees={activeEmployees}
              onOpenAppraisalDialog={onOpenAppraisalDialog}
            />
          </TabsContent>

          <TabsContent value="increments" className="mt-0 space-y-4">
            <IncrementsTab
              increments={increments}
              incrementsLoading={incrementsLoading}
              activeEmployees={activeEmployees}
              onOpenIncrementDialog={onOpenIncrementDialog}
            />
          </TabsContent>

          <TabsContent value="recruitment" className="mt-0 space-y-4">
            <RecruitmentTab
              jobs={jobs}
              jobsLoading={jobsLoading}
              applicants={applicants}
              applicantsLoading={applicantsLoading}
              onCreateManualEmployee={onCreateManualEmployee}
              onOpenJobDialog={onOpenJobDialog}
              onDeleteJob={onDeleteJob}
              onOpenApplicantDialog={onOpenApplicantDialog}
              onUpdateApplicantStage={onUpdateApplicantStage}
            />
          </TabsContent>

          </div>{/* /content padding */}
        </Tabs>
      </CardContent>
    </Card>
  );
}
