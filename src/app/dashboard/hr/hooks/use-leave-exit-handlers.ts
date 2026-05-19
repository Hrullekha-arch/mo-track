import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { User } from "@/lib/types";
import type {
  HrEmployee,
  HrExitFormState,
  HrExitRecord,
  HrLeaveFormState,
  HrLeaveRequest,
} from "../types";
import {
  calcLeaveDays,
  createExitFormState,
  createLeaveFormState,
  getMonthlyLeaveBalance,
} from "../utils";

interface Params {
  user: User | null;
  toast: (opts: { title: string; description?: string; variant?: "destructive" }) => void;
  activeEmployees: HrEmployee[];
  leaveRequests: HrLeaveRequest[];
  exitRecords: HrExitRecord[];
}

export function useLeaveExitHandlers({
  user,
  toast,
  activeEmployees,
  leaveRequests,
  exitRecords,
}: Params) {
  const [leaveDialogEmployee, setLeaveDialogEmployee] = useState<HrEmployee | null>(null);
  const [leaveForm, setLeaveForm] = useState<HrLeaveFormState | null>(null);
  const [savingLeave, setSavingLeave] = useState(false);

  const [exitDialogEmployee, setExitDialogEmployee] = useState<HrEmployee | null>(null);
  const [exitForm, setExitForm] = useState<HrExitFormState | null>(null);
  const [savingExit, setSavingExit] = useState(false);

  // ─── Leave ────────────────────────────────────────────────────────────────

  const openLeaveDialog = (employee: HrEmployee | null) => {
    setLeaveDialogEmployee(employee);
    setLeaveForm(createLeaveFormState(employee?.id ?? ""));
  };

  const closeLeaveDialog = () => {
    setLeaveDialogEmployee(null);
    setLeaveForm(null);
  };

  const submitLeaveRequest = async () => {
    if (!leaveForm || !leaveForm.employeeId) return;
    const resolvedEmployee = leaveDialogEmployee ?? activeEmployees.find((e) => e.id === leaveForm.employeeId);
    if (!resolvedEmployee) return;
    setSavingLeave(true);
    try {
      const days = calcLeaveDays(leaveForm.fromDate, leaveForm.toDate);
      const handoverEmployee = leaveForm.handoverId
        ? activeEmployees.find((e) => e.id === leaveForm.handoverId)
        : null;
      await addDoc(collection(db, "hrLeaveRequests"), {
        employeeId: resolvedEmployee.id,
        employeeName: resolvedEmployee.name,
        employeeCode: resolvedEmployee.employeeCode || null,
        department: resolvedEmployee.department || null,
        leaveType: leaveForm.leaveType,
        fromDate: leaveForm.fromDate,
        toDate: leaveForm.toDate,
        days,
        reason: leaveForm.reason.trim(),
        status: handoverEmployee ? "handover_pending" : "pending",
        appliedAt: new Date().toISOString(),
        handoverId: handoverEmployee?.id || null,
        handoverName: handoverEmployee?.name || null,
        handoverStatus: handoverEmployee ? "pending" : null,
      });
      toast({
        title: "Leave request submitted",
        description: handoverEmployee
          ? `${days} day(s) submitted. Awaiting handover acceptance from ${handoverEmployee.name}.`
          : `${days} day(s) applied for ${resolvedEmployee.name}.`,
      });
      closeLeaveDialog();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to submit leave", description: error?.message });
    } finally {
      setSavingLeave(false);
    }
  };

  const acceptHandover = async (requestId: string) => {
    try {
      await updateDoc(doc(db, "hrLeaveRequests", requestId), {
        status: "pending",
        handoverStatus: "accepted",
        handoverAcceptedAt: new Date().toISOString(),
      });
      toast({ title: "Handover accepted", description: "Leave request forwarded to HR for approval." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Action failed", description: error?.message });
    }
  };

  const rejectHandover = async (requestId: string) => {
    try {
      await updateDoc(doc(db, "hrLeaveRequests", requestId), {
        status: "rejected",
        handoverStatus: "rejected",
      });
      toast({ title: "Handover rejected", description: "Leave request rejected at handover stage." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Action failed", description: error?.message });
    }
  };

  const confirmLeaveRequest = async (requestId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "hrLeaveRequests", requestId), {
        hrConfirmedAt: new Date().toISOString(),
        hrConfirmedBy: { id: user.id, name: user.name },
      });
      toast({ title: "Leave confirmed", description: "Details reviewed. Set an approval date to finalise." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Action failed", description: error?.message });
    }
  };

  const reviewLeaveRequest = async (requestId: string, status: "approved" | "rejected", note = "", approvalDate?: string) => {
    if (!user) return;
    const request = leaveRequests.find((r) => r.id === requestId);
    if (!request) return;

    let finalLeaveType = request.leaveType;
    let lwpNote = "";

    if (status === "approved" && request.leaveType !== "unpaid") {
      const employee = activeEmployees.find((entry) => entry.id === request.employeeId);
      const lb = getMonthlyLeaveBalance(leaveRequests, request.employeeId, employee);
      if (lb.balance < request.days) {
        finalLeaveType = "unpaid";
        lwpNote = `Auto-converted to LWP: available balance ${lb.balance} day(s), requested ${request.days} day(s).`;
      }
    }

    try {
      await updateDoc(doc(db, "hrLeaveRequests", requestId), {
        status,
        leaveType: finalLeaveType,
        reviewedBy: { id: user.id, name: user.name },
        reviewedAt: new Date().toISOString(),
        reviewNote: lwpNote || note || null,
        ...(approvalDate ? { approvalDate } : {}),
      });

      if (lwpNote) {
        toast({
          title: "Leave approved as LWP",
          description: `No paid leave balance. ${request.days} day(s) approved as Leave Without Pay.`,
        });
      } else {
        toast({ title: `Leave ${status}`, description: `Request has been ${status}.` });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Action failed", description: error?.message });
    }
  };

  const deleteLeaveRequest = async (requestId: string) => {
    try {
      await deleteDoc(doc(db, "hrLeaveRequests", requestId));
      toast({ title: "Leave request deleted" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete failed", description: error?.message });
    }
  };

  // ─── Exit ─────────────────────────────────────────────────────────────────

  const openExitDialog = (employee: HrEmployee) => {
    const existing = exitRecords.find((r) => r.employeeId === employee.id);
    setExitDialogEmployee(employee);
    if (existing) {
      setExitForm({
        employeeId: employee.id,
        exitType: existing.exitType,
        noticePeriodDays: String(existing.noticePeriodDays),
        lastWorkingDay: existing.lastWorkingDay,
        exitDate: existing.exitDate,
        clearanceStatus: existing.clearanceStatus,
        assetHandoverStatus: existing.assetHandoverStatus || "pending",
        backupEmailStatus: existing.backupEmailStatus || "pending",
        fnfStatus: existing.fnfStatus,
        remarks: existing.remarks || "",
      });
    } else {
      setExitForm(createExitFormState(employee.id));
    }
  };

  const closeExitDialog = () => {
    setExitDialogEmployee(null);
    setExitForm(null);
  };

  const saveExitRecord = async () => {
    if (!exitDialogEmployee || !exitForm || !user) return;
    setSavingExit(true);
    try {
      if (
        exitForm.fnfStatus === "settled" &&
        (
          exitForm.clearanceStatus !== "complete" ||
          exitForm.assetHandoverStatus !== "returned" ||
          exitForm.backupEmailStatus !== "completed"
        )
      ) {
        toast({
          variant: "destructive",
          title: "FnF cannot be settled yet",
          description: "Complete clearance, asset handover, and backup email handover before final settlement.",
        });
        return;
      }

      const existing = exitRecords.find((r) => r.employeeId === exitDialogEmployee.id);
      const payload = {
        employeeId: exitDialogEmployee.id,
        employeeName: exitDialogEmployee.name,
        employeeCode: exitDialogEmployee.employeeCode || null,
        department: exitDialogEmployee.department || null,
        store: exitDialogEmployee.store || null,
        issuedAssets: exitDialogEmployee.issuedAssets || null,
        exitType: exitForm.exitType,
        noticePeriodDays: Number(exitForm.noticePeriodDays) || 0,
        lastWorkingDay: exitForm.lastWorkingDay,
        exitDate: exitForm.exitDate,
        clearanceStatus: exitForm.clearanceStatus,
        assetHandoverStatus: exitForm.assetHandoverStatus,
        backupEmailStatus: exitForm.backupEmailStatus,
        fnfStatus: exitForm.fnfStatus,
        remarks: exitForm.remarks.trim() || null,
        initiatedAt: existing?.initiatedAt || new Date().toISOString(),
        initiatedBy: existing?.initiatedBy || { id: user.id, name: user.name },
      };
      if (existing) {
        await setDoc(doc(db, "hrExitRecords", existing.id), payload, { merge: true });
      } else {
        await addDoc(collection(db, "hrExitRecords"), payload);
      }
      toast({ title: "Exit record saved", description: `${exitDialogEmployee.name}'s exit record is updated.` });
      closeExitDialog();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save failed", description: error?.message });
    } finally {
      setSavingExit(false);
    }
  };

  return {
    leaveDialogEmployee,
    leaveForm,
    setLeaveForm,
    savingLeave,
    exitDialogEmployee,
    exitForm,
    setExitForm,
    savingExit,
    openLeaveDialog,
    closeLeaveDialog,
    submitLeaveRequest,
    acceptHandover,
    rejectHandover,
    confirmLeaveRequest,
    reviewLeaveRequest,
    deleteLeaveRequest,
    openExitDialog,
    closeExitDialog,
    saveExitRecord,
  };
}
