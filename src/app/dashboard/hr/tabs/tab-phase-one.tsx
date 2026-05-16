"use client";

import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  SELF_SERVICE_PRIORITY_LABELS,
  SELF_SERVICE_TYPE_LABELS,
  updatedTimeLabel,
} from "../utils";
import type { HrWorkspaceTabsProps } from "./types";

type SelfServiceTabProps = Pick<
  HrWorkspaceTabsProps,
  | "selfServiceRequests"
  | "selfServiceRequestsLoading"
  | "onOpenSelfServiceDialog"
  | "onReviewSelfServiceRequest"
>;

export function SelfServiceTab({
  selfServiceRequests,
  selfServiceRequestsLoading,
  onOpenSelfServiceDialog,
  onReviewSelfServiceRequest,
}: SelfServiceTabProps) {
  const pendingRequests = selfServiceRequests.filter((entry) => entry.status === "pending");
  const inReviewRequests = selfServiceRequests.filter((entry) => entry.status === "in_review");
  const approvedRequests = selfServiceRequests.filter((entry) => entry.status === "approved");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-cyan-200 bg-cyan-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total Requests</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{selfServiceRequests.length}</p>
            <p className="mt-1 text-sm text-slate-500">All logged employee service tickets.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pending</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{pendingRequests.length}</p>
            <p className="mt-1 text-sm text-slate-500">Waiting for manager or HR action.</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">In Review</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{inReviewRequests.length}</p>
            <p className="mt-1 text-sm text-slate-500">Requests currently being processed.</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Approved</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{approvedRequests.length}</p>
            <p className="mt-1 text-sm text-slate-500">Completed or approved service items.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Employee Self-Service Queue</CardTitle>
            <CardDescription>
              Profile updates, attendance regularization, document requests, and general HR help.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" className="w-8 h-8 p-0" title="Add Request" onClick={() => onOpenSelfServiceDialog("")}>
            <Plus className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {selfServiceRequestsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : selfServiceRequests.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...selfServiceRequests]
                  .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
                  .map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{request.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{request.department || request.employeeCode || "-"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">
                          {SELF_SERVICE_TYPE_LABELS[request.requestType]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            request.priority === "high"
                              ? "border-red-200 bg-red-50 text-red-700"
                              : request.priority === "medium"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                          }
                        >
                          {SELF_SERVICE_PRIORITY_LABELS[request.priority]}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm">{request.title}</TableCell>
                      <TableCell className="text-sm">{request.managerName || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            request.status === "approved"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : request.status === "rejected"
                                ? "border-red-200 bg-red-50 text-red-700"
                                : request.status === "in_review"
                                  ? "border-blue-200 bg-blue-50 text-blue-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                          }
                        >
                          {request.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{updatedTimeLabel(request.requestedAt)}</TableCell>
                      <TableCell className="text-right">
                        {request.status !== "approved" && request.status !== "rejected" ? (
                          <div className="flex justify-end gap-1">
                            {request.status === "pending" ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void onReviewSelfServiceRequest(request.id, "in_review")}
                              >
                                Review
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              onClick={() => void onReviewSelfServiceRequest(request.id, "approved")}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-red-200 text-red-700 hover:bg-red-50"
                              onClick={() => void onReviewSelfServiceRequest(request.id, "rejected")}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No self-service requests yet. Click &quot;Add Request&quot; to start the queue.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type OrganizationSetupTabProps = Pick<
  HrWorkspaceTabsProps,
  | "departments"
  | "departmentsLoading"
  | "designations"
  | "designationsLoading"
  | "branches"
  | "branchesLoading"
  | "onOpenDepartmentDialog"
  | "onDeleteDepartment"
  | "onOpenDesignationDialog"
  | "onDeleteDesignation"
  | "onOpenBranchDialog"
  | "onDeleteBranch"
>;

export function OrganizationSetupTab({
  departments,
  departmentsLoading,
  designations,
  designationsLoading,
  branches,
  branchesLoading,
  onOpenDepartmentDialog,
  onDeleteDepartment,
  onOpenDesignationDialog,
  onDeleteDesignation,
  onOpenBranchDialog,
  onDeleteBranch,
}: OrganizationSetupTabProps) {
  const organizationLoading = departmentsLoading || designationsLoading || branchesLoading;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Departments</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{departments.length}</p>
            <p className="mt-1 text-sm text-slate-500">Functional units in the org structure.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Designations</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{designations.length}</p>
            <p className="mt-1 text-sm text-slate-500">Role titles and grade mappings.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Branches</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{branches.length}</p>
            <p className="mt-1 text-sm text-slate-500">Operating locations and branch ownership.</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Active Structure</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {departments.filter((entry) => entry.status === "active").length +
                branches.filter((entry) => entry.status === "active").length}
            </p>
            <p className="mt-1 text-sm text-slate-500">Active departments and branches in service.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-slate-200">
          <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle className="text-base">Departments</CardTitle>
              <CardDescription>Owners, codes, and active department list.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDepartmentDialog()}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </CardHeader>
          <CardContent>
            {organizationLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : departments.length ? (
              <div className="space-y-3">
                {[...departments].sort((left, right) => left.name.localeCompare(right.name)).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">{entry.name}</p>
                        <p className="text-xs text-slate-500">{entry.code || "No code"} · {entry.managerName || "No manager"}</p>
                      </div>
                      <Badge variant="outline" className={entry.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}>
                        {entry.status}
                      </Badge>
                    </div>
                    {entry.description ? <p className="mt-2 text-sm text-slate-600">{entry.description}</p> : null}
                    <div className="mt-3 flex justify-end gap-1">
                      <Button type="button" variant="outline" size="sm" onClick={() => onOpenDepartmentDialog(entry)}>
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="text-slate-400 hover:text-red-500" onClick={() => void onDeleteDepartment(entry.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No departments yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle className="text-base">Designations</CardTitle>
              <CardDescription>Role titles mapped to teams and grade levels.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDesignationDialog()}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </CardHeader>
          <CardContent>
            {organizationLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : designations.length ? (
              <div className="space-y-3">
                {[...designations].sort((left, right) => left.title.localeCompare(right.title)).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">{entry.title}</p>
                        <p className="text-xs text-slate-500">{entry.department || "No department"}{entry.level ? ` · ${entry.level}` : ""}</p>
                      </div>
                      <Badge variant="outline" className={entry.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}>
                        {entry.status}
                      </Badge>
                    </div>
                    {entry.description ? <p className="mt-2 text-sm text-slate-600">{entry.description}</p> : null}
                    <div className="mt-3 flex justify-end gap-1">
                      <Button type="button" variant="outline" size="sm" onClick={() => onOpenDesignationDialog(entry)}>
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="text-slate-400 hover:text-red-500" onClick={() => void onDeleteDesignation(entry.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No designations yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle className="text-base">Branches</CardTitle>
              <CardDescription>Branch code, city, and local branch ownership.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenBranchDialog()}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </CardHeader>
          <CardContent>
            {organizationLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : branches.length ? (
              <div className="space-y-3">
                {[...branches].sort((left, right) => left.name.localeCompare(right.name)).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">{entry.name}</p>
                        <p className="text-xs text-slate-500">{entry.code || "No code"}{entry.location ? ` · ${entry.location}` : ""}</p>
                      </div>
                      <Badge variant="outline" className={entry.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}>
                        {entry.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{entry.managerName || "No branch manager assigned"}</p>
                    <div className="mt-3 flex justify-end gap-1">
                      <Button type="button" variant="outline" size="sm" onClick={() => onOpenBranchDialog(entry)}>
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="text-slate-400 hover:text-red-500" onClick={() => void onDeleteBranch(entry.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No branches yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type ManagerApprovalsTabProps = Pick<
  HrWorkspaceTabsProps,
  | "leaveRequests"
  | "expenseClaims"
  | "selfServiceRequests"
  | "onReviewLeaveRequest"
  | "onReviewExpenseClaim"
  | "onReviewSelfServiceRequest"
>;

export function ManagerApprovalsTab({
  leaveRequests,
  expenseClaims,
  selfServiceRequests,
  onReviewLeaveRequest,
  onReviewExpenseClaim,
  onReviewSelfServiceRequest,
}: ManagerApprovalsTabProps) {
  const pendingLeave = leaveRequests.filter((entry) => ["pending", "handover_pending"].includes(entry.status));
  const pendingExpenses = expenseClaims.filter((entry) => entry.status === "pending");
  const pendingSelfService = selfServiceRequests.filter((entry) => ["pending", "in_review"].includes(entry.status));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pending Leave</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{pendingLeave.length}</p>
            <p className="mt-1 text-sm text-slate-500">Leave requests still waiting on action.</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pending Expenses</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{pendingExpenses.length}</p>
            <p className="mt-1 text-sm text-slate-500">Reimbursement claims needing review.</p>
          </CardContent>
        </Card>
        <Card className="border-cyan-200 bg-cyan-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Self-Service Queue</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{pendingSelfService.length}</p>
            <p className="mt-1 text-sm text-slate-500">Employee helpdesk requests in progress.</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total Pending</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {pendingLeave.length + pendingExpenses.length + pendingSelfService.length}
            </p>
            <p className="mt-1 text-sm text-slate-500">Combined approval desk workload.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Leave Approvals</CardTitle>
            <CardDescription>Fast-track pending leave and handover items.</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingLeave.length ? (
              <div className="space-y-3">
                {pendingLeave.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">{entry.employeeName}</p>
                        <p className="text-xs text-slate-500">{entry.leaveType} · {entry.days} day(s)</p>
                      </div>
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                        {entry.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{entry.reason}</p>
                    <div className="mt-3 flex justify-end gap-1">
                      <Button type="button" variant="outline" size="sm" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => void onReviewLeaveRequest(entry.id, "approved")}>
                        Approve
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => void onReviewLeaveRequest(entry.id, "rejected")}>
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No pending leave approvals.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Expense Approvals</CardTitle>
            <CardDescription>Review claim amount and approve reimbursements.</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingExpenses.length ? (
              <div className="space-y-3">
                {pendingExpenses.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">{entry.employeeName}</p>
                        <p className="text-xs text-slate-500">{entry.category} · {entry.amount.toLocaleString("en-IN")}</p>
                      </div>
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                        pending
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{entry.description}</p>
                    <div className="mt-3 flex justify-end gap-1">
                      <Button type="button" variant="outline" size="sm" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => void onReviewExpenseClaim(entry.id, "approved")}>
                        Approve
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => void onReviewExpenseClaim(entry.id, "rejected")}>
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No pending expense approvals.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Service Desk Approvals</CardTitle>
            <CardDescription>Move employee service items through review and closure.</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingSelfService.length ? (
              <div className="space-y-3">
                {pendingSelfService.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">{entry.employeeName}</p>
                        <p className="text-xs text-slate-500">{SELF_SERVICE_TYPE_LABELS[entry.requestType]}</p>
                      </div>
                      <Badge variant="outline" className={entry.status === "in_review" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                        {entry.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{entry.title}</p>
                    <div className="mt-3 flex justify-end gap-1">
                      {entry.status === "pending" ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => void onReviewSelfServiceRequest(entry.id, "in_review")}>
                          Review
                        </Button>
                      ) : null}
                      <Button type="button" variant="outline" size="sm" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => void onReviewSelfServiceRequest(entry.id, "approved")}>
                        Approve
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => void onReviewSelfServiceRequest(entry.id, "rejected")}>
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No pending self-service approvals.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
