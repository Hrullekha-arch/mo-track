"use client";

import { Briefcase, ChevronUp, PauseCircle, Plus, Star, Trash2, TrendingUp, UserPlus, UserX, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { HrApplicant } from "../types";
import {
  APPLICANT_STAGE_LABELS,
  formatCurrency,
  formatDateLabel,
  formatMonthLabel,
  updatedTimeLabel,
} from "../utils";
import type { HrWorkspaceTabsProps } from "./types";

// ---- Roster Tab ----

type RosterTabProps = Pick<
  HrWorkspaceTabsProps,
  | "rosterEntries"
  | "rosterLoading"
  | "selectedMonth"
  | "onOpenRosterDialog"
  | "onDeleteRosterEntry"
>;

export function RosterTab({ rosterEntries, rosterLoading, selectedMonth, onOpenRosterDialog, onDeleteRosterEntry }: RosterTabProps) {
  return (
    <Card className="border-slate-200">
      <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <CardTitle className="text-base">Roster — {formatMonthLabel(selectedMonth)}</CardTitle>
          <CardDescription>Shift assignments for the selected month. Add or modify employee schedules.</CardDescription>
        </div>
        <Button type="button" variant="outline" onClick={onOpenRosterDialog}>
          <Plus className="h-4 w-4" />
          Assign Shift
        </Button>
      </CardHeader>
      <CardContent>
        {rosterLoading ? (
          <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : rosterEntries.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...rosterEntries].sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName)).map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <p className="font-medium">{entry.employeeName}</p>
                  </TableCell>
                  <TableCell className="text-sm">{formatDateLabel(entry.date)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-pink-200 bg-pink-50 text-pink-700">{entry.shiftName}</Badge>
                  </TableCell>
                  <TableCell className="text-sm font-mono">{entry.shiftStart}</TableCell>
                  <TableCell className="text-sm font-mono">{entry.shiftEnd}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{entry.department || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="ghost" size="sm" className="text-slate-400 hover:text-red-500" onClick={() => void onDeleteRosterEntry(entry.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No roster entries for {formatMonthLabel(selectedMonth)}. Click &quot;Assign Shift&quot; to schedule employees.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Appraisals Tab ----

type AppraisalsTabProps = Pick<
  HrWorkspaceTabsProps,
  | "appraisals"
  | "appraisalsLoading"
  | "activeEmployees"
  | "onOpenAppraisalDialog"
>;

export function AppraisalsTab({ appraisals, appraisalsLoading, activeEmployees, onOpenAppraisalDialog }: AppraisalsTabProps) {
  const avgRating = appraisals.length
    ? Math.round((appraisals.reduce((s, a) => s + a.rating, 0) / appraisals.length) * 10) / 10
    : 0;
  const excellentAppraisals = appraisals.filter((a) => a.rating >= 4).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-yellow-200 bg-yellow-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total Appraisals</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{appraisals.length}</p>
            <p className="mt-1 text-sm text-slate-500">All performance review records.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Average Rating</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{avgRating}/5</p>
            <p className="mt-1 text-sm text-slate-500">Mean rating across all appraisals.</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Excellent (4-5★)</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{excellentAppraisals}</p>
            <p className="mt-1 text-sm text-slate-500">High-performance appraisals.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Employees Appraised</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{new Set(appraisals.map((a) => a.employeeId)).size}</p>
            <p className="mt-1 text-sm text-slate-500">Unique employees with appraisals.</p>
          </CardContent>
        </Card>
      </div>
      <Card className="border-slate-200">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Performance Appraisals</CardTitle>
            <CardDescription>Annual or periodic appraisal records with goals, achievements, and ratings.</CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => activeEmployees[0] && onOpenAppraisalDialog(activeEmployees[0])}>
            <Star className="h-4 w-4" />
            Add Appraisal
          </Button>
        </CardHeader>
        <CardContent>
          {appraisalsLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : appraisals.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Goals</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...appraisals].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((appraisal) => {
                  const emp = activeEmployees.find((e) => e.id === appraisal.employeeId);
                  return (
                    <TableRow key={appraisal.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{appraisal.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{appraisal.department || "-"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{appraisal.period}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={cn("h-3.5 w-3.5", i < appraisal.rating ? "fill-amber-400 text-amber-400" : "text-slate-200")} />
                          ))}
                          <span className="ml-1 text-xs font-medium text-slate-600">{appraisal.rating}/5</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          appraisal.status === "acknowledged" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : appraisal.status === "submitted" ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                        }>
                          {appraisal.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">{appraisal.goals || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{updatedTimeLabel(appraisal.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        {emp && (
                          <Button type="button" variant="outline" size="sm" onClick={() => onOpenAppraisalDialog(emp)}>
                            New
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No appraisal records yet. Click &quot;Add Appraisal&quot; to start.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Increments Tab ----

type IncrementsTabProps = Pick<
  HrWorkspaceTabsProps,
  | "increments"
  | "incrementsLoading"
  | "activeEmployees"
  | "onOpenIncrementDialog"
>;

export function IncrementsTab({ increments, incrementsLoading, activeEmployees, onOpenIncrementDialog }: IncrementsTabProps) {
  const totalIncrementAmount = increments.reduce((s, i) => s + i.incrementAmount, 0);
  const avgIncrementPct = increments.length
    ? Math.round((increments.reduce((s, i) => s + i.incrementPercent, 0) / increments.length) * 10) / 10
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-lime-200 bg-lime-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total Increments</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{increments.length}</p>
            <p className="mt-1 text-sm text-slate-500">All salary increment records.</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total Increment Value</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{formatCurrency(totalIncrementAmount)}</p>
            <p className="mt-1 text-sm text-slate-500">Cumulative salary increment across all records.</p>
          </CardContent>
        </Card>
        <Card className="border-cyan-200 bg-cyan-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Avg Increment %</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{avgIncrementPct}%</p>
            <p className="mt-1 text-sm text-slate-500">Average percentage increase across increments.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Employees Incremented</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{new Set(increments.map((i) => i.employeeId)).size}</p>
            <p className="mt-1 text-sm text-slate-500">Unique employees with increment history.</p>
          </CardContent>
        </Card>
      </div>
      <Card className="border-slate-200">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Salary Increment History</CardTitle>
            <CardDescription>Full audit trail of salary revisions with effective dates and approval records.</CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => activeEmployees[0] && onOpenIncrementDialog(activeEmployees[0])}>
            <TrendingUp className="h-4 w-4" />
            Apply Increment
          </Button>
        </CardHeader>
        <CardContent>
          {incrementsLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : increments.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Previous Basic</TableHead>
                  <TableHead>New Basic</TableHead>
                  <TableHead>Increment</TableHead>
                  <TableHead>%</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...increments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((inc) => {
                  const emp = activeEmployees.find((e) => e.id === inc.employeeId);
                  return (
                    <TableRow key={inc.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{inc.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{inc.department || "-"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{formatDateLabel(inc.effectiveDate)}</TableCell>
                      <TableCell>{formatCurrency(inc.previousBasic)}</TableCell>
                      <TableCell className="font-semibold text-emerald-700">{formatCurrency(inc.newBasic)}</TableCell>
                      <TableCell className="text-emerald-700">+{formatCurrency(inc.incrementAmount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-lime-200 bg-lime-50 text-lime-700">+{inc.incrementPercent}%</Badge>
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">{inc.reason || "-"}</TableCell>
                      <TableCell className="text-right">
                        {emp && (
                          <Button type="button" variant="outline" size="sm" onClick={() => onOpenIncrementDialog(emp)}>
                            New
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No increment records yet. Click &quot;Apply Increment&quot; to start.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Recruitment Tab ----

type RecruitmentTabProps = Pick<
  HrWorkspaceTabsProps,
  | "jobs"
  | "jobsLoading"
  | "applicants"
  | "applicantsLoading"
  | "onCreateManualEmployee"
  | "onOpenJobDialog"
  | "onDeleteJob"
  | "onOpenApplicantDialog"
  | "onUpdateApplicantStage"
>;

export function RecruitmentTab({
  jobs,
  jobsLoading,
  applicants,
  applicantsLoading,
  onCreateManualEmployee,
  onOpenJobDialog,
  onDeleteJob,
  onOpenApplicantDialog,
  onUpdateApplicantStage,
}: RecruitmentTabProps) {
  const openJobs = jobs.filter((j) => j.status === "open");
  const totalOpenings = openJobs.reduce((s, j) => s + j.openings, 0);
  const pipelineApplicants = applicants.filter((a) => !["joined", "on_hold", "terminated", "rejected"].includes(a.stage));
  const todayKey = new Date().toISOString().slice(0, 10);
  const overdueApplicants = pipelineApplicants.filter((a) => a.deadlineAt && a.deadlineAt < todayKey);
  const stageCounts = applicants.reduce<Record<string, number>>((acc, a) => {
    acc[a.stage] = (acc[a.stage] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-cyan-200 bg-cyan-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Open Positions</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{openJobs.length}</p>
            <p className="mt-1 text-sm text-slate-500">{totalOpenings} total openings across active jobs.</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total Applicants</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{applicants.length}</p>
            <p className="mt-1 text-sm text-slate-500">All applicants across all job openings.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">In Pipeline</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{pipelineApplicants.length}</p>
            <p className="mt-1 text-sm text-slate-500">{overdueApplicants.length} overdue for HR / recruiter action.</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Joined</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{stageCounts["joined"] || 0}</p>
            <p className="mt-1 text-sm text-slate-500">Applicants successfully joined.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Job Openings</CardTitle>
            <CardDescription>Active and archived job positions for your organisation.</CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={onOpenJobDialog}>
            <Briefcase className="h-4 w-4" />
            Post Job
          </Button>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : jobs.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Openings</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applicants</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((job) => {
                  const jobApplicants = applicants.filter((a) => a.jobId === job.id);
                  return (
                    <TableRow key={job.id}>
                      <TableCell>
                        <p className="font-medium">{job.title}</p>
                        <p className="text-xs text-muted-foreground">{job.store || "-"}</p>
                      </TableCell>
                      <TableCell>{job.department || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-slate-200">{job.openings}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          job.status === "open" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : job.status === "on_hold" ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-slate-200 text-slate-500"
                        }>
                          {job.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">{jobApplicants.length}</span>
                        <span className="ml-1 text-xs text-slate-500">
                          ({jobApplicants.filter((a) => !["joined", "on_hold", "terminated", "rejected"].includes(a.stage)).length} active)
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{updatedTimeLabel(job.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="outline" size="sm" onClick={() => onOpenApplicantDialog(job)}>
                            <Plus className="h-3.5 w-3.5" />
                            Add Applicant
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="text-slate-400 hover:text-red-500" onClick={() => void onDeleteJob(job.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No job openings yet. Click &quot;Post Job&quot; to create one.</p>
          )}
        </CardContent>
      </Card>

      {applicants.length > 0 && (
        <Card className="border-slate-200">
          <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle className="text-base">Applicant Pipeline</CardTitle>
              <CardDescription>All applicants across screening, HR interview, HOD round, and MD final round.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stageCounts).map(([stage, count]) => (
                <Badge key={stage} variant="outline" className="border-slate-200">
                  {APPLICANT_STAGE_LABELS[stage as HrApplicant["stage"]] || stage}: {count}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {applicantsLoading ? (
              <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Experience</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Applied</TableHead>
                    <TableHead className="text-right">Move Stage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...applicants].sort((a, b) => b.appliedAt.localeCompare(a.appliedAt)).map((applicant) => {
                    const stageOrder: HrApplicant["stage"][] = ["applied", "screening", "interview", "offer", "joined"];
                    const currentIdx = stageOrder.indexOf(applicant.stage as HrApplicant["stage"]);
                    const canAdvance = currentIdx >= 0 && currentIdx < stageOrder.length - 1;
                    const isTerminal = ["rejected", "terminated"].includes(applicant.stage);
                    const canReject = !isTerminal && applicant.stage !== "joined" && applicant.stage !== "on_hold";
                    return (
                      <TableRow key={applicant.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{applicant.name}</p>
                            <p className="text-xs text-muted-foreground">{applicant.email || applicant.phone || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{applicant.jobTitle}</TableCell>
                        <TableCell className="text-sm">{applicant.experience || "-"}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{applicant.assignedOwner || "-"}</p>
                            <p className="text-xs text-slate-500">{applicant.assignedRole === "recruiter" ? "Recruiter" : applicant.assignedRole === "hr" ? "HR" : "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            applicant.stage === "joined" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : applicant.stage === "on_hold" ? "border-orange-200 bg-orange-50 text-orange-700"
                                : applicant.stage === "terminated" ? "border-red-300 bg-red-50 text-red-800"
                                  : applicant.stage === "rejected" ? "border-red-200 bg-red-50 text-red-700"
                                    : applicant.stage === "offer" ? "border-blue-200 bg-blue-50 text-blue-700"
                                      : "border-amber-200 bg-amber-50 text-amber-700"
                          }>
                            {APPLICANT_STAGE_LABELS[applicant.stage as HrApplicant["stage"]] || applicant.stage}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {applicant.deadlineAt ? (
                            <Badge
                              variant="outline"
                              className={
                                applicant.stage !== "joined" && applicant.stage !== "rejected" && applicant.deadlineAt < todayKey
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : "border-slate-200 text-slate-600"
                              }
                            >
                              {applicant.deadlineAt}
                            </Badge>
                          ) : (
                            <span className="text-sm text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{updatedTimeLabel(applicant.appliedAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1 flex-wrap">
                            {/* Joined: can start hiring, put on hold, or terminate */}
                            {applicant.stage === "joined" && (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 w-8 h-8 p-0"
                                  title="Start Hiring"
                                  onClick={() =>
                                    onCreateManualEmployee({
                                      name: applicant.name,
                                      email: applicant.email,
                                      phone: applicant.phone,
                                      experienceType: applicant.experience ? "experienced" : "fresher",
                                      experience: applicant.experience || "",
                                    })
                                  }
                                >
                                  <UserPlus className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="border-orange-200 text-orange-700 hover:bg-orange-50 w-8 h-8 p-0"
                                  title="On Hold — employee not showing up"
                                  onClick={() => void onUpdateApplicantStage(applicant.id, "on_hold")}
                                >
                                  <PauseCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="border-red-200 text-red-700 hover:bg-red-50 w-8 h-8 p-0"
                                  title="Terminate — employee did not join"
                                  onClick={() => void onUpdateApplicantStage(applicant.id, "terminated")}
                                >
                                  <UserX className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {/* On Hold: can start hiring or terminate */}
                            {applicant.stage === "on_hold" && (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 w-8 h-8 p-0"
                                  title="Start Hiring"
                                  onClick={() =>
                                    onCreateManualEmployee({
                                      name: applicant.name,
                                      email: applicant.email,
                                      phone: applicant.phone,
                                      experienceType: applicant.experience ? "experienced" : "fresher",
                                      experience: applicant.experience || "",
                                    })
                                  }
                                >
                                  <UserPlus className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="border-red-200 text-red-700 hover:bg-red-50 w-8 h-8 p-0"
                                  title="Terminate — employee did not join"
                                  onClick={() => void onUpdateApplicantStage(applicant.id, "terminated")}
                                >
                                  <UserX className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {/* Advance stage */}
                            {canAdvance && (
                              <Button type="button" variant="outline" size="sm" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => void onUpdateApplicantStage(applicant.id, stageOrder[currentIdx + 1])}>
                                <ChevronUp className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {/* Reject (pipeline stages only) */}
                            {canReject && (
                              <Button type="button" variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => void onUpdateApplicantStage(applicant.id, "rejected")}>
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
