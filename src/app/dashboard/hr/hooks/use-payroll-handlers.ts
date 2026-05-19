import { useState, useMemo } from "react";
import { format } from "date-fns";
import { collection, getDocs, query, setDoc, doc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { User } from "@/lib/types";
import type {
  HrEmployee,
  HrHoliday,
  PayrollFormState,
  PayrollRecord,
  PayrollRow,
} from "../types";
import { openSalarySlipPrintWindow } from "../print";
import {
  buildPayrollRecord,
  calcAttendanceSummary,
  createAttendancePayrollFormState,
  createDraftPayrollRecord,
  createPayrollFormState,
  formatMonthLabel,
  getMonthKeyFromDate,
  hasSalaryConfig,
  listMonthKeysInRange,
  safeText,
} from "../utils";
import type { AttendanceRecord } from "../types";

interface Params {
  user: User | null;
  toast: (opts: { title: string; description?: string; variant?: "destructive" }) => void;
  selectedMonth: string;
  payrollMap: Record<string, PayrollRecord>;
  payrollEmployees: HrEmployee[];
  payrollRows: PayrollRow[];
  attendanceRecords: AttendanceRecord[];
  holidays: HrHoliday[];
}

export function usePayrollHandlers({
  user,
  toast,
  selectedMonth,
  payrollMap,
  payrollEmployees,
  payrollRows,
  attendanceRecords,
  holidays,
}: Params) {
  const [payrollDialogUser, setPayrollDialogUser] = useState<HrEmployee | null>(null);
  const [payrollForm, setPayrollForm] = useState<PayrollFormState | null>(null);
  const [salarySlipRecord, setSalarySlipRecord] = useState<PayrollRecord | null>(null);
  const [salarySlipEmployee, setSalarySlipEmployee] = useState<HrEmployee | null>(null);
  const [savingPayroll, setSavingPayroll] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [downloadingMonthSlips, setDownloadingMonthSlips] = useState(false);
  const [downloadingHistorySlips, setDownloadingHistorySlips] = useState(false);

  const createAttendanceBackedPayrollForm = (employee: HrEmployee) => {
    const existing = payrollMap[employee.id];
    const baseForm = createPayrollFormState(existing, selectedMonth);
    const attSummary = calcAttendanceSummary(attendanceRecords, employee.id, selectedMonth, holidays, employee);
    if (existing) {
      return { baseForm, attSummary, existing };
    }
    if (attSummary.totalDays === 0) {
      return { baseForm, attSummary, existing };
    }

    return {
      existing,
      attSummary,
      baseForm: createAttendancePayrollFormState(selectedMonth, attSummary),
    };
  };

  const previewPayrollRecord = useMemo(() => {
    if (!payrollDialogUser || !payrollForm) return null;
    return buildPayrollRecord(
      payrollDialogUser,
      selectedMonth,
      payrollForm,
      user ? { id: user.id, name: user.name } : undefined,
      payrollMap[payrollDialogUser.id]
    );
  }, [payrollDialogUser, payrollForm, payrollMap, selectedMonth, user]);

  const openPayrollDialog = (employee: HrEmployee) => {
    setPayrollDialogUser(employee);
    const { existing, attSummary, baseForm } = createAttendanceBackedPayrollForm(employee);
    if (!existing && attSummary.totalDays === 0) {
      toast({
        variant: "destructive",
        title: "Attendance not synced",
        description: "Payroll can be calculated only for active employees whose biometric code attendance is synced for this month.",
      });
      setPayrollDialogUser(null);
      setPayrollForm(null);
      return;
    }
    setPayrollForm(baseForm);
  };

  const closePayrollDialog = () => {
    setPayrollDialogUser(null);
    setPayrollForm(null);
  };

  const openSalarySlip = (employee: HrEmployee, record?: PayrollRecord) => {
    const attSummary = calcAttendanceSummary(attendanceRecords, employee.id, selectedMonth, holidays, employee);
    const draftRecord = attSummary.totalDays
      ? buildPayrollRecord(employee, selectedMonth, createAttendancePayrollFormState(selectedMonth, attSummary))
      : createDraftPayrollRecord(employee, selectedMonth);
    const resolvedRecord = record || payrollMap[employee.id] || draftRecord;
    setSalarySlipEmployee(employee);
    setSalarySlipRecord(resolvedRecord);
  };

  const closeSalarySlipDialog = () => {
    setSalarySlipRecord(null);
    setSalarySlipEmployee(null);
  };

  const savePayroll = async () => {
    if (!payrollDialogUser || !payrollForm) return;
    if (!hasSalaryConfig(payrollDialogUser)) {
      toast({
        variant: "destructive",
        title: "Salary template missing",
        description: "Add salary details in Employee Master before generating payroll.",
      });
      return;
    }

    setSavingPayroll(true);
    try {
      const existing = payrollMap[payrollDialogUser.id];
      const record = buildPayrollRecord(
        payrollDialogUser,
        selectedMonth,
        payrollForm,
        user ? { id: user.id, name: user.name } : undefined,
        existing
      );

      await setDoc(doc(db, "hrPayroll", record.id), record, { merge: true });
      toast({
        title: "Payroll saved",
        description: `Payroll generated for ${payrollDialogUser.name} for ${formatMonthLabel(selectedMonth)}.`,
      });
      closePayrollDialog();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Unable to save payroll",
        description: error?.message || "Please try again.",
      });
    } finally {
      setSavingPayroll(false);
    }
  };

  const generatePendingPayroll = async () => {
    const pendingRows = payrollEmployees.filter((entry) => !payrollMap[entry.id]);
    if (!pendingRows.length) {
      toast({
        title: "Nothing pending",
        description: "Payroll is already generated for all active employees with synced attendance this month.",
      });
      return;
    }

    setBulkGenerating(true);
    try {
      await Promise.all(
        pendingRows.map((entry) => {
          const { baseForm } = createAttendanceBackedPayrollForm(entry);
          const record = buildPayrollRecord(
            entry,
            selectedMonth,
            baseForm,
            user ? { id: user.id, name: user.name } : undefined
          );
          return setDoc(doc(db, "hrPayroll", record.id), record, { merge: true });
        })
      );

      toast({
        title: "Payroll drafts created",
        description: `${pendingRows.length} payroll record(s) generated for ${formatMonthLabel(selectedMonth)}.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Bulk generation failed",
        description: error?.message || "Please try again.",
      });
    } finally {
      setBulkGenerating(false);
    }
  };

  const downloadMonthlySalarySlips = async () => {
    const generatedRows = payrollRows
      .filter((row) => row.status === "generated" && hasSalaryConfig(row.employee))
      .sort((left, right) => safeText(left.employee.name).localeCompare(safeText(right.employee.name)));

    if (!generatedRows.length) {
      toast({
        title: "No salary slips to download",
        description: `There are no generated salary slips for ${formatMonthLabel(selectedMonth)}.`,
      });
      return;
    }

    setDownloadingMonthSlips(true);
    try {
      const { saveSalarySlipPdfBundle } = await import("../pdf");
      await saveSalarySlipPdfBundle(
        generatedRows.map((row) => ({ employee: row.employee, record: row.record })),
        `Salary-Slips-${selectedMonth}.pdf`
      );
      toast({
        title: "Salary slips downloaded",
        description: `${generatedRows.length} salary slip(s) downloaded for ${formatMonthLabel(selectedMonth)}.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: error?.message || "Unable to create salary slip PDF.",
      });
    } finally {
      setDownloadingMonthSlips(false);
    }
  };

  const downloadEmployeeSalarySlipHistory = async () => {
    if (!salarySlipEmployee) return;
    if (!hasSalaryConfig(salarySlipEmployee)) {
      toast({
        variant: "destructive",
        title: "Salary template missing",
        description: "Add salary details before downloading salary slips.",
      });
      return;
    }

    const currentMonth = format(new Date(), "yyyy-MM");
    setDownloadingHistorySlips(true);
    try {
      const payrollSnapshot = await getDocs(
        query(collection(db, "hrPayroll"), where("userId", "==", salarySlipEmployee.id))
      );
      const payrollHistory = new Map<string, PayrollRecord>();

      payrollSnapshot.docs.forEach((entry) => {
        const data = entry.data() as Omit<PayrollRecord, "id">;
        payrollHistory.set(data.month, { id: entry.id, ...data });
      });

      const joinMonth = getMonthKeyFromDate(salarySlipEmployee.joiningDate);
      const earliestSavedMonth = Array.from(payrollHistory.keys()).sort()[0];
      const startMonth = joinMonth || earliestSavedMonth || currentMonth;
      const monthKeys = listMonthKeysInRange(startMonth, currentMonth);

      if (!monthKeys.length) {
        toast({
          variant: "destructive",
          title: "Unable to prepare slips",
          description: "Joining date is missing or invalid for this employee.",
        });
        return;
      }

      const records = monthKeys.map(
        (month) => payrollHistory.get(month) || createDraftPayrollRecord(salarySlipEmployee, month)
      );
      const { saveSalarySlipPdfBundle } = await import("../pdf");
      const safeName = safeText(salarySlipEmployee.name).replace(/\s+/g, "-") || "employee";
      await saveSalarySlipPdfBundle(
        records.map((record) => ({ employee: salarySlipEmployee, record })),
        `${safeName}-salary-slips-${startMonth}-to-${currentMonth}.pdf`
      );
      toast({
        title: "Salary slip history downloaded",
        description: `${records.length} salary slip(s) prepared from ${formatMonthLabel(startMonth)} to ${formatMonthLabel(currentMonth)}.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "History download failed",
        description: error?.message || "Unable to create salary slip history PDF.",
      });
    } finally {
      setDownloadingHistorySlips(false);
    }
  };

  const printSalarySlip = () => {
    if (!salarySlipRecord || !salarySlipEmployee) return;
    const opened = openSalarySlipPrintWindow(salarySlipEmployee, salarySlipRecord);
    if (!opened) {
      toast({
        variant: "destructive",
        title: "Unable to open print window",
        description: "Please allow pop-ups and try again.",
      });
    }
  };

  return {
    payrollDialogUser,
    payrollForm,
    setPayrollForm,
    salarySlipRecord,
    salarySlipEmployee,
    savingPayroll,
    bulkGenerating,
    downloadingMonthSlips,
    downloadingHistorySlips,
    previewPayrollRecord,
    openPayrollDialog,
    closePayrollDialog,
    openSalarySlip,
    closeSalarySlipDialog,
    savePayroll,
    generatePendingPayroll,
    downloadMonthlySalarySlips,
    downloadEmployeeSalarySlipHistory,
    printSalarySlip,
  };
}
