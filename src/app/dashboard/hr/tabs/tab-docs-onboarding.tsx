"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Download, Eye, Loader2, Settings2 } from "lucide-react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HrEmployee } from "../types";
import { exportEmployeeRosterCsv, hasSalaryConfig, roleLabel } from "../utils";
import {
  getMissingOnboardingFields,
  getOnboardingProgress,
  HR_ONBOARDING_CONFIG_COLLECTION,
  HR_ONBOARDING_CONFIG_DOC_ID,
  HR_ONBOARDING_POPUP_FIELD,
} from "../utils/onboarding-utils";
import type { HrWorkspaceTabsProps } from "./types";

type DocsTabProps = Pick<
  HrWorkspaceTabsProps,
  | "usersLoading"
  | "activeEmployees"
  | "salaryConfiguredCount"
  | "onOpenEmployeeDialog"
>;

export function DocumentsTab({
  usersLoading,
  activeEmployees,
  salaryConfiguredCount,
  onOpenEmployeeDialog,
}: DocsTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const docStatus = (val?: string) => !!val?.trim();
  const bankReady = (e: HrEmployee) => docStatus(e.bankName) && docStatus(e.bankAccountNumber) && docStatus(e.bankIfsc);
  const uanEsiReady = (e: HrEmployee) => docStatus(e.uanNumber) || docStatus(e.esiNumber);
  const searchNeedle = searchTerm.trim().toLowerCase();
  const fullyReady = activeEmployees.filter(
    (e) => docStatus(e.panNumber) && docStatus(e.aadhaarNumber) && bankReady(e) && uanEsiReady(e)
  );
  const employeesMissingBank = activeEmployees.filter(
    (entry) => !entry.bankName || !entry.bankAccountNumber || !entry.bankIfsc
  );
  const employeesMissingCompliance = activeEmployees.filter(
    (entry) => !entry.panNumber || !entry.aadhaarNumber || (!entry.uanNumber && !entry.esiNumber)
  );

  const docCell = (ok: boolean) => (
    <Badge variant="outline" className={ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}>
      {ok ? "Ready" : "Missing"}
    </Badge>
  );

  const visibleEmployees = useMemo(
    () =>
      searchNeedle
        ? activeEmployees.filter((entry) =>
            [entry.name, entry.department, entry.role, entry.employeeCode, entry.biometricId, entry.panNumber, entry.aadhaarNumber]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(searchNeedle))
          )
        : activeEmployees,
    [activeEmployees, searchNeedle]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fully Ready</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{fullyReady.length}</p>
            <p className="mt-1 text-sm text-slate-500">PAN + Aadhaar + Bank + UAN/ESI all filled.</p>
          </CardContent>
        </Card>
        <Card className="border-rose-200 bg-rose-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Bank Gaps</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{employeesMissingBank.length}</p>
            <p className="mt-1 text-sm text-slate-500">Missing bank name, account, or IFSC.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Compliance Gaps</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{employeesMissingCompliance.length}</p>
            <p className="mt-1 text-sm text-slate-500">PAN, Aadhaar, or UAN/ESI required.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Salary Slip Safe</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{salaryConfiguredCount}</p>
            <p className="mt-1 text-sm text-slate-500">Salary template configured for payroll.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Full Document Status - All Employees</CardTitle>
            <CardDescription>Complete document checklist across every active employee.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => exportEmployeeRosterCsv(activeEmployees)}>
            <Download className="h-4 w-4" />
            Export Roster CSV
          </Button>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : (
            <div className="space-y-3">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search employee, dept, role, code, PAN..."
                className="max-w-sm"
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>PAN</TableHead>
                    <TableHead>Aadhaar</TableHead>
                    <TableHead>Bank Details</TableHead>
                    <TableHead>UAN / ESI</TableHead>
                    <TableHead>Salary Config</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleEmployees.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{entry.name}</p>
                          <p className="text-xs text-muted-foreground">{entry.department || roleLabel(entry)}</p>
                        </div>
                      </TableCell>
                      <TableCell>{docCell(docStatus(entry.panNumber))}</TableCell>
                      <TableCell>{docCell(docStatus(entry.aadhaarNumber))}</TableCell>
                      <TableCell>{docCell(bankReady(entry))}</TableCell>
                      <TableCell>{docCell(uanEsiReady(entry))}</TableCell>
                      <TableCell>{docCell(hasSalaryConfig(entry))}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="outline" size="sm" onClick={() => onOpenEmployeeDialog(entry)}>
                          Update
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!visibleEmployees.length && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">
                        No document rows match the current search.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type OnboardingTabProps = Pick<
  HrWorkspaceTabsProps,
  | "usersLoading"
  | "activeEmployees"
  | "onOpenEmployeeDialog"
>;

export function OnboardingTab({ usersLoading, activeEmployees, onOpenEmployeeDialog }: OnboardingTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [popupEnabled, setPopupEnabled] = useState(false);
  const [popupConfigLoading, setPopupConfigLoading] = useState(true);
  const [savingPopupConfig, setSavingPopupConfig] = useState(false);

  useEffect(() => {
    const configRef = doc(db, HR_ONBOARDING_CONFIG_COLLECTION, HR_ONBOARDING_CONFIG_DOC_ID);
    const unsubscribe = onSnapshot(
      configRef,
      (snapshot) => {
        setPopupEnabled(Boolean(snapshot.data()?.[HR_ONBOARDING_POPUP_FIELD]));
        setPopupConfigLoading(false);
      },
      () => {
        setPopupConfigLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const togglePopupRequirement = async (checked: boolean) => {
    if (!user) return;

    const previous = popupEnabled;
    setPopupEnabled(checked);
    setSavingPopupConfig(true);

    try {
      await setDoc(
        doc(db, HR_ONBOARDING_CONFIG_COLLECTION, HR_ONBOARDING_CONFIG_DOC_ID),
        {
          [HR_ONBOARDING_POPUP_FIELD]: checked,
          updatedAt: new Date().toISOString(),
          updatedBy: { id: user.id, name: user.name },
        },
        { merge: true }
      );

      toast({
        title: `Onboarding popup ${checked ? "enabled" : "disabled"}`,
        description: checked
          ? "Users will be prompted to complete missing onboarding details at login."
          : "Users will no longer be blocked by onboarding profile checks at login.",
      });
    } catch (error: any) {
      setPopupEnabled(previous);
      toast({
        variant: "destructive",
        title: "Unable to update onboarding popup setting",
        description: error?.message || "Please try again.",
      });
    } finally {
      setSavingPopupConfig(false);
    }
  };

  const getProgress = (employee: HrEmployee) => getOnboardingProgress(employee, { includeAutoManaged: true });
  const searchNeedle = searchTerm.trim().toLowerCase();

  const sorted = [...activeEmployees]
    .filter((entry) =>
      !searchNeedle
        ? true
        : [entry.name, entry.department, entry.role, entry.employeeCode, entry.biometricId, entry.reportingManager]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(searchNeedle))
    )
    .sort((a, b) => getProgress(a).percent - getProgress(b).percent);

  const ready = activeEmployees.filter((employee) => getProgress(employee).percent === 100);
  const incomplete = activeEmployees.filter((employee) => getProgress(employee).percent < 100);

  const employeeDetailsGapCount = activeEmployees.filter((employee) =>
    getMissingOnboardingFields(employee).some((field) => field.section === "Employee Details")
  ).length;

  const kycAndBankGapCount = activeEmployees.filter((employee) =>
    getMissingOnboardingFields(employee).some((field) => field.section === "KYC & Bank")
  ).length;

  return (
    <div className="space-y-4">
      <Card className="border-indigo-200 bg-indigo-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4 text-indigo-600" />
            Mandatory Onboarding Popup
          </CardTitle>
          <CardDescription>
            When enabled, users must complete required onboarding profile fields at login.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col gap-3 rounded-xl border border-indigo-100 bg-white p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <Label htmlFor="onboarding-popup-toggle" className="text-sm font-semibold text-slate-900">
                Force profile completion on login
              </Label>
              <p className="mt-1 text-xs text-slate-500">
                Salary fields are excluded from this user-level onboarding requirement.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start md:self-auto">
              {(popupConfigLoading || savingPopupConfig) ? (
                <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
              ) : null}
              <Switch
                id="onboarding-popup-toggle"
                checked={popupEnabled}
                onCheckedChange={(checked) => void togglePopupRequirement(Boolean(checked))}
                disabled={popupConfigLoading || savingPopupConfig}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fully Onboarded</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{ready.length}</p>
            <p className="mt-1 text-sm text-slate-500">All required profile details complete.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pending</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{incomplete.length}</p>
            <p className="mt-1 text-sm text-slate-500">Profiles with at least one missing field.</p>
          </CardContent>
        </Card>
        <Card className="border-sky-200 bg-sky-50/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Employee Details Gaps</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{employeeDetailsGapCount}</p>
            <p className="mt-1 text-sm text-slate-500">Code, department, designation, or manager missing.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">KYC & Bank Gaps</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{kycAndBankGapCount}</p>
            <p className="mt-1 text-sm text-slate-500">PAN, Aadhaar, UAN, ESI, or bank fields missing.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Onboarding Checklist - All Employees</CardTitle>
          <CardDescription>
            Required fields: basic profile, employee details, working details, KYC and bank details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : (
            <div className="space-y-3">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search employee, dept, role, code, manager..."
                className="max-w-sm"
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Missing Fields</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((entry) => {
                    const progress = getProgress(entry);
                    const pct = progress.percent;
                    const missingPreview = progress.missing.slice(0, 3).map((field) => field.label).join(", ");

                    return (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{entry.name}</p>
                            <p className="text-xs text-muted-foreground">{roleLabel(entry)}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-red-400")}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-slate-600">{pct}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {progress.missing.length ? (
                            <div className="space-y-1">
                              <p className="text-xs text-slate-700">
                                {missingPreview}
                                {progress.missing.length > 3 ? ` +${progress.missing.length - 3} more` : ""}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                {progress.completed}/{progress.total} completed
                              </p>
                            </div>
                          ) : (
                            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                              Complete
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            type="button"
                            onClick={() => onOpenEmployeeDialog(entry)}
                            className="group/btn ml-auto flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-slate-500 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600"
                          >
                            {pct === 100
                              ? <Eye className="h-3.5 w-3.5 shrink-0" />
                              : <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />}
                            <span className="max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-medium transition-[max-width] duration-200 group-hover/btn:max-w-[56px]">
                              {pct === 100 ? "View" : "Complete"}
                            </span>
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!sorted.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-slate-500">
                        No onboarding rows match the current search.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
