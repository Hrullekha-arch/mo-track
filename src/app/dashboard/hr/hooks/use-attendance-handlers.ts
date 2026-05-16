import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { User } from "@/lib/types";
import type { AttendanceRecord, HrEmployee, HrHolidayFormState, HrLeaveRequest } from "../types";
import { createHolidayFormState, formatMonthLabel, getMonthlyLeaveBalance } from "../utils";

interface Params {
  user: User | null;
  toast: (opts: { title: string; description?: string; variant?: "destructive" }) => void;
  selectedMonth: string;
  setSelectedMonth?: (month: string) => void;
  activeEmployees: HrEmployee[];
  leaveRequests: HrLeaveRequest[];
}

const sanitizeAttendancePayload = <T extends Record<string, unknown>>(payload: T) =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

export function useAttendanceHandlers({
  user,
  toast,
  selectedMonth,
  setSelectedMonth,
  activeEmployees,
  leaveRequests,
}: Params) {
  const [showAttendanceUpload, setShowAttendanceUpload] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [holidayForm, setHolidayForm] = useState<HrHolidayFormState | null>(null);
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [manageAttendanceEmployee, setManageAttendanceEmployee] = useState<HrEmployee | null>(null);

  const uploadAttendanceRecords = async (records: Omit<AttendanceRecord, "id">[], batchId: string) => {
    setSavingAttendance(true);
    try {
      const importedMonths = [...new Set(records.map((record) => record.date.slice(0, 7)).filter(Boolean))];
      const primaryImportedMonth =
        importedMonths.length === 1 && importedMonths[0]
          ? importedMonths[0]
          : selectedMonth;
      await Promise.all(
        records.map((record) => {
          const docId = `${record.employeeId}_${record.date}`;
          return setDoc(
            doc(db, "hrAttendance", docId),
            sanitizeAttendancePayload({ ...record, uploadBatch: batchId }),
            { merge: true }
          );
        })
      );
      toast({
        title: "Attendance imported",
        description: `${records.length} attendance record(s) saved for ${formatMonthLabel(primaryImportedMonth)}.`,
      });
      if (importedMonths.length === 1 && importedMonths[0] && importedMonths[0] !== selectedMonth) {
        setSelectedMonth?.(importedMonths[0]);
        toast({
          title: "Month switched",
          description: `Imported attendance belongs to ${formatMonthLabel(importedMonths[0])}, so the view was updated automatically.`,
        });
      }
      setShowAttendanceUpload(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload failed", description: error?.message });
    } finally {
      setSavingAttendance(false);
    }
  };

  const saveHoliday = async () => {
    if (!holidayForm || !holidayForm.date || !holidayForm.name.trim()) return;
    setSavingHoliday(true);
    try {
      const emp = holidayForm.employeeId
        ? activeEmployees.find((entry) => entry.id === holidayForm.employeeId)
        : null;
      await addDoc(collection(db, "hrHolidays"), {
        employeeId: holidayForm.employeeId || null,
        employeeName: emp?.name || null,
        date: holidayForm.date,
        name: holidayForm.name.trim(),
        type: holidayForm.type,
      });
      toast({ title: "Holiday saved", description: `${holidayForm.name} added successfully.` });
      setHolidayForm(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save failed", description: error?.message });
    } finally {
      setSavingHoliday(false);
    }
  };

  const deleteHoliday = async (id: string) => {
    try {
      await deleteDoc(doc(db, "hrHolidays", id));
      toast({ title: "Holiday removed" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete failed", description: error?.message });
    }
  };

  const saveAttendanceRecord = async (record: Omit<AttendanceRecord, "id">) => {
    setSavingAttendance(true);
    try {
      const docId = `${record.employeeId}_${record.date}`;
      const leaveDocId = `attendance_${record.employeeId}_${record.date}`;
      const attendanceRef = doc(db, "hrAttendance", docId);
      const leaveRef = doc(db, "hrLeaveRequests", leaveDocId);
      const employee = activeEmployees.find((entry) => entry.id === record.employeeId);
      const referenceDate = new Date(`${record.date}T00:00:00`);
      const hasManagedLeave = leaveRequests.some((entry) => entry.id === leaveDocId);
      const comparableLeaveRequests = leaveRequests.filter((entry) => entry.id !== leaveDocId);
      const currentBalance = getMonthlyLeaveBalance(comparableLeaveRequests, record.employeeId, employee, referenceDate);

      if (record.status === "on_leave" && !hasManagedLeave && currentBalance.balance < 1) {
        toast({
          variant: "destructive",
          title: "No paid leave balance",
          description: `${employee?.name || record.employeeName} has only ${currentBalance.balance} paid leave left.`,
        });
        return;
      }

      const batch = writeBatch(db);
      batch.set(attendanceRef, sanitizeAttendancePayload(record), { merge: true });

      if (record.status === "on_leave") {
        batch.set(
          leaveRef,
          {
            employeeId: record.employeeId,
            employeeName: record.employeeName,
            employeeCode: record.employeeCode || null,
            department: record.department || null,
            leaveType: "casual",
            fromDate: record.date,
            toDate: record.date,
            days: 1,
            reason: "Attendance-managed paid leave",
            status: "approved",
            appliedAt: new Date().toISOString(),
            reviewedAt: new Date().toISOString(),
            reviewedBy: user ? { id: user.id, name: user.name } : null,
            approvalDate: record.date,
            reviewNote: "Auto-approved from HR attendance management.",
          },
          { merge: true }
        );
      } else {
        batch.delete(leaveRef);
      }

      await batch.commit();

      const balanceAfterSave = currentBalance.balance - (record.status === "on_leave" && !hasManagedLeave ? 1 : 0);
      toast({
        title: "Attendance saved",
        description:
          record.status === "on_leave"
            ? `${record.date} - Paid leave used. Remaining balance: ${Math.max(balanceAfterSave, 0)} day(s).`
            : record.status === "missed_punch" || (!record.inTime || !record.outTime)
              ? `${record.date} - Missed punch recorded. HR can complete the missing punch later.`
            : `${record.date} - ${record.status}`,
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save failed", description: error?.message });
    } finally {
      setSavingAttendance(false);
    }
  };

  const deleteAttendanceRecord = async (record: AttendanceRecord) => {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "hrAttendance", record.id));
      batch.delete(doc(db, "hrLeaveRequests", `attendance_${record.employeeId}_${record.date}`));
      await batch.commit();
      toast({ title: "Record deleted" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete failed", description: error?.message });
    }
  };

  const openHolidayDialog = (employeeId?: string) => {
    setHolidayForm(createHolidayFormState(employeeId));
  };

  return {
    showAttendanceUpload,
    setShowAttendanceUpload,
    savingAttendance,
    holidayForm,
    setHolidayForm,
    savingHoliday,
    manageAttendanceEmployee,
    setManageAttendanceEmployee,
    uploadAttendanceRecords,
    saveHoliday,
    deleteHoliday,
    saveAttendanceRecord,
    deleteAttendanceRecord,
    openHolidayDialog,
  };
}
