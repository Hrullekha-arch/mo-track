"use client";

import { LogOut, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HrExitRecord } from "../types";
import {
  EXIT_TYPE_LABELS,
  formatDateLabel,
  getEmploymentStatus,
  roleLabel,
} from "../utils";
import type { HrWorkspaceTabsProps } from "./types";

type Props = Pick<
  HrWorkspaceTabsProps,
  | "exitRecords"
  | "exitRecordsLoading"
  | "users"
  | "onOpenExitDialog"
>;

export function ExitTab({ exitRecords, exitRecordsLoading, users, onOpenExitDialog }: Props) {
  const fnfPending = exitRecords.filter((r) => r.fnfStatus !== "settled");
  const clearancePending = exitRecords.filter((r) => r.clearanceStatus !== "complete");
  const settled = exitRecords.filter((r) => r.fnfStatus === "settled");

  const exitStatusClass = (status: HrExitRecord["clearanceStatus"] | HrExitRecord["fnfStatus"]) => {
    if (status === "complete" || status === "settled") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (status === "in_progress" || status === "processing") return "border-amber-200 bg-amber-50 text-amber-700";
    return "border-slate-200 bg-slate-50 text-slate-600";
  };

  const inactiveEmployees = users.filter((entry) => getEmploymentStatus(entry) === "inactive");
  const onLeaveEmployees = users.filter((entry) => getEmploymentStatus(entry) === "on_leave");
  const allExitEmployees = [...inactiveEmployees, ...onLeaveEmployees];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-300 bg-slate-50">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Exit Records</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{exitRecords.length}</p>
            <p className="mt-1 text-sm text-slate-500">Total initiated exit processes.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">FnF Pending</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{fnfPending.length}</p>
            <p className="mt-1 text-sm text-slate-500">Full and final settlement not yet done.</p>
          </CardContent>
        </Card>
        <Card className="border-rose-200 bg-rose-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Clearance Pending</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{clearancePending.length}</p>
            <p className="mt-1 text-sm text-slate-500">Assets or access clearance not complete.</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fully Settled</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{settled.length}</p>
            <p className="mt-1 text-sm text-slate-500">FnF settled and closure complete.</p>
          </CardContent>
        </Card>
      </div>

      {exitRecords.length > 0 && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Exit &amp; FnF Records</CardTitle>
            <CardDescription>Track settlement status, clearance, and notice period for exiting employees.</CardDescription>
          </CardHeader>
          <CardContent>
            {exitRecordsLoading ? (
              <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Exit Type</TableHead>
                    <TableHead>Exit Date</TableHead>
                    <TableHead>Last Working Day</TableHead>
                    <TableHead>Notice Days</TableHead>
                    <TableHead>Clearance</TableHead>
                    <TableHead>Assets</TableHead>
                    <TableHead>Backup Email</TableHead>
                    <TableHead>FnF</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exitRecords.map((record) => {
                    const employee = users.find((u) => u.id === record.employeeId);
                    return (
                      <TableRow key={record.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{record.employeeName}</p>
                            <p className="text-xs text-muted-foreground">{record.department || record.employeeCode || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-slate-200">{EXIT_TYPE_LABELS[record.exitType]}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{formatDateLabel(record.exitDate)}</TableCell>
                        <TableCell className="text-sm">{formatDateLabel(record.lastWorkingDay)}</TableCell>
                        <TableCell>{record.noticePeriodDays}d</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={exitStatusClass(record.clearanceStatus)}>
                            {record.clearanceStatus.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={record.assetHandoverStatus === "returned" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                            {record.assetHandoverStatus === "returned" ? "returned" : "pending"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={record.backupEmailStatus === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                            {record.backupEmailStatus === "completed" ? "completed" : "pending"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={exitStatusClass(record.fnfStatus)}>
                            {record.fnfStatus.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button type="button" variant="outline" size="sm" onClick={() => employee && onOpenExitDialog(employee)}>
                            Update
                          </Button>
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

      <Card className="border-slate-200">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Inactive &amp; On-Leave Employees</CardTitle>
            <CardDescription>Initiate exit process or update status for these employees.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {allExitEmployees.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Joining</TableHead>
                  <TableHead>Exit Record</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allExitEmployees.map((entry) => {
                  const exitRecord = exitRecords.find((r) => r.employeeId === entry.id);
                  const status = getEmploymentStatus(entry);
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{entry.name}</p>
                          <p className="text-xs text-muted-foreground">{roleLabel(entry)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={status === "inactive" ? "border-slate-200 bg-slate-50 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-700"}>
                          {status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>{entry.department || "-"}</TableCell>
                      <TableCell>{entry.store || "-"}</TableCell>
                      <TableCell>{formatDateLabel(entry.joiningDate)}</TableCell>
                      <TableCell>
                        {exitRecord
                          ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Initiated</Badge>
                          : <Badge variant="outline" className="border-slate-200">Not started</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-8 h-8 p-0"
                          title={exitRecord ? "Update FnF" : "Initiate Exit"}
                          onClick={() => onOpenExitDialog(entry)}
                        >
                          {exitRecord ? <RefreshCw className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No inactive or on-leave employees. All staff are currently active.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
