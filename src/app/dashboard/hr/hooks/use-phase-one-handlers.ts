import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { User } from "@/lib/types";
import type {
  HrBranchFormState,
  HrBranchRecord,
  HrDepartmentFormState,
  HrDepartmentRecord,
  HrDesignationFormState,
  HrDesignationRecord,
  HrEmployee,
  HrSelfServiceFormState,
} from "../types";
import {
  createBranchFormState,
  createDepartmentFormState,
  createDesignationFormState,
  createSelfServiceFormState,
} from "../utils";

interface Params {
  user: User | null;
  toast: (opts: { title: string; description?: string; variant?: "destructive" }) => void;
  activeEmployees: HrEmployee[];
}

export function usePhaseOneHandlers({ user, toast, activeEmployees }: Params) {
  const [selfServiceForm, setSelfServiceForm] = useState<HrSelfServiceFormState | null>(null);
  const [savingSelfService, setSavingSelfService] = useState(false);

  const [departmentForm, setDepartmentForm] = useState<HrDepartmentFormState | null>(null);
  const [savingDepartment, setSavingDepartment] = useState(false);

  const [designationForm, setDesignationForm] = useState<HrDesignationFormState | null>(null);
  const [savingDesignation, setSavingDesignation] = useState(false);

  const [branchForm, setBranchForm] = useState<HrBranchFormState | null>(null);
  const [savingBranch, setSavingBranch] = useState(false);

  const resolveManager = (managerId?: string) => {
    if (!managerId) return null;
    const manager = activeEmployees.find((entry) => entry.id === managerId);
    if (!manager) return null;
    return { id: manager.id, name: manager.name };
  };

  const resolveEmployeeManager = (employee: HrEmployee) => {
    const managerByName = activeEmployees.find(
      (entry) =>
        entry.name.trim().toLowerCase() ===
        String(employee.reportingManager || "").trim().toLowerCase()
    );
    return managerByName ? { id: managerByName.id, name: managerByName.name } : null;
  };

  const openSelfServiceDialog = (employeeId = "") => {
    setSelfServiceForm(createSelfServiceFormState(employeeId));
  };

  const closeSelfServiceDialog = () => {
    setSelfServiceForm(null);
  };

  const saveSelfServiceRequest = async () => {
    if (!selfServiceForm || !selfServiceForm.employeeId) return;
    const employee = activeEmployees.find((entry) => entry.id === selfServiceForm.employeeId);
    if (!employee) return;
    setSavingSelfService(true);
    try {
      const manager = resolveEmployeeManager(employee);
      await addDoc(collection(db, "hrSelfServiceRequests"), {
        employeeId: employee.id,
        employeeName: employee.name,
        employeeCode: employee.employeeCode || null,
        department: employee.department || null,
        requestType: selfServiceForm.requestType,
        title: selfServiceForm.title.trim(),
        details: selfServiceForm.details.trim(),
        priority: selfServiceForm.priority,
        status: "pending",
        requestedAt: new Date().toISOString(),
        requestedBy: user ? { id: user.id, name: user.name } : null,
        managerId: manager?.id || null,
        managerName: manager?.name || employee.reportingManager || null,
      });
      toast({
        title: "Self-service request saved",
        description: `${employee.name}'s request is now in the HR queue.`,
      });
      closeSelfServiceDialog();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Unable to save request",
        description: error?.message || "Please try again.",
      });
    } finally {
      setSavingSelfService(false);
    }
  };

  const reviewSelfServiceRequest = async (
    id: string,
    status: "in_review" | "approved" | "rejected"
  ) => {
    try {
      await updateDoc(doc(db, "hrSelfServiceRequests", id), {
        status,
        reviewedBy: user ? { id: user.id, name: user.name } : null,
        reviewedAt: new Date().toISOString(),
      });
      toast({
        title: `Request ${status.replace("_", " ")}`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Unable to update request",
        description: error?.message || "Please try again.",
      });
    }
  };

  const openDepartmentDialog = (entry?: HrDepartmentRecord) => {
    setDepartmentForm(createDepartmentFormState(entry));
  };

  const closeDepartmentDialog = () => {
    setDepartmentForm(null);
  };

  const saveDepartment = async () => {
    if (!departmentForm || !departmentForm.name.trim()) return;
    setSavingDepartment(true);
    try {
      const manager = resolveManager(departmentForm.managerId);
      const payload = {
        name: departmentForm.name.trim(),
        code: departmentForm.code.trim() || null,
        managerId: manager?.id || null,
        managerName: manager?.name || null,
        description: departmentForm.description.trim() || null,
        status: departmentForm.status,
        createdAt: new Date().toISOString(),
        createdBy: user ? { id: user.id, name: user.name } : null,
      };
      if (departmentForm.id) {
        await setDoc(doc(db, "hrDepartments", departmentForm.id), payload, { merge: true });
      } else {
        await addDoc(collection(db, "hrDepartments"), payload);
      }
      toast({
        title: `Department ${departmentForm.id ? "updated" : "created"}`,
        description: `${departmentForm.name.trim()} is saved in organization setup.`,
      });
      closeDepartmentDialog();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Unable to save department",
        description: error?.message || "Please try again.",
      });
    } finally {
      setSavingDepartment(false);
    }
  };

  const deleteDepartment = async (id: string) => {
    try {
      await deleteDoc(doc(db, "hrDepartments", id));
      toast({ title: "Department deleted" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Unable to delete department",
        description: error?.message || "Please try again.",
      });
    }
  };

  const openDesignationDialog = (entry?: HrDesignationRecord) => {
    setDesignationForm(createDesignationFormState(entry));
  };

  const closeDesignationDialog = () => {
    setDesignationForm(null);
  };

  const saveDesignation = async () => {
    if (!designationForm || !designationForm.title.trim()) return;
    setSavingDesignation(true);
    try {
      const payload = {
        title: designationForm.title.trim(),
        department: designationForm.department.trim() || null,
        level: designationForm.level.trim() || null,
        description: designationForm.description.trim() || null,
        status: designationForm.status,
        createdAt: new Date().toISOString(),
        createdBy: user ? { id: user.id, name: user.name } : null,
      };
      if (designationForm.id) {
        await setDoc(doc(db, "hrDesignations", designationForm.id), payload, { merge: true });
      } else {
        await addDoc(collection(db, "hrDesignations"), payload);
      }
      toast({
        title: `Designation ${designationForm.id ? "updated" : "created"}`,
        description: `${designationForm.title.trim()} is saved in organization setup.`,
      });
      closeDesignationDialog();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Unable to save designation",
        description: error?.message || "Please try again.",
      });
    } finally {
      setSavingDesignation(false);
    }
  };

  const deleteDesignation = async (id: string) => {
    try {
      await deleteDoc(doc(db, "hrDesignations", id));
      toast({ title: "Designation deleted" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Unable to delete designation",
        description: error?.message || "Please try again.",
      });
    }
  };

  const openBranchDialog = (entry?: HrBranchRecord) => {
    setBranchForm(createBranchFormState(entry));
  };

  const closeBranchDialog = () => {
    setBranchForm(null);
  };

  const saveBranch = async () => {
    if (!branchForm || !branchForm.name.trim()) return;
    setSavingBranch(true);
    try {
      const manager = resolveManager(branchForm.managerId);
      const payload = {
        name: branchForm.name.trim(),
        code: branchForm.code.trim() || null,
        location: branchForm.location.trim() || null,
        managerId: manager?.id || null,
        managerName: manager?.name || null,
        status: branchForm.status,
        createdAt: new Date().toISOString(),
        createdBy: user ? { id: user.id, name: user.name } : null,
      };
      if (branchForm.id) {
        await setDoc(doc(db, "hrBranches", branchForm.id), payload, { merge: true });
      } else {
        await addDoc(collection(db, "hrBranches"), payload);
      }
      toast({
        title: `Branch ${branchForm.id ? "updated" : "created"}`,
        description: `${branchForm.name.trim()} is saved in organization setup.`,
      });
      closeBranchDialog();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Unable to save branch",
        description: error?.message || "Please try again.",
      });
    } finally {
      setSavingBranch(false);
    }
  };

  const deleteBranch = async (id: string) => {
    try {
      await deleteDoc(doc(db, "hrBranches", id));
      toast({ title: "Branch deleted" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Unable to delete branch",
        description: error?.message || "Please try again.",
      });
    }
  };

  return {
    selfServiceForm,
    setSelfServiceForm,
    savingSelfService,
    openSelfServiceDialog,
    closeSelfServiceDialog,
    saveSelfServiceRequest,
    reviewSelfServiceRequest,
    departmentForm,
    setDepartmentForm,
    savingDepartment,
    openDepartmentDialog,
    closeDepartmentDialog,
    saveDepartment,
    deleteDepartment,
    designationForm,
    setDesignationForm,
    savingDesignation,
    openDesignationDialog,
    closeDesignationDialog,
    saveDesignation,
    deleteDesignation,
    branchForm,
    setBranchForm,
    savingBranch,
    openBranchDialog,
    closeBranchDialog,
    saveBranch,
    deleteBranch,
  };
}
