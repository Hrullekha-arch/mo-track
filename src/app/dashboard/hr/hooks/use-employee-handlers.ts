import { useState } from "react";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { User } from "@/lib/types";
import type { EmployeeFormState, HrEmployee, PayrollRecord } from "../types";
import {
  buildPayrollRecord,
  createBlankManualEmployee,
  createEmployeeFormState,
  createPayrollFormState,
} from "../utils";

interface Params {
  user: User | null;
  toast: (opts: { title: string; description?: string; variant?: "destructive" }) => void;
  setActiveTab: (tab: string) => void;
}

export function useEmployeeHandlers({ user, toast, setActiveTab }: Params) {
  const [employeeDialogUser, setEmployeeDialogUser] = useState<HrEmployee | null>(null);
  const [employeeForm, setEmployeeForm] = useState<EmployeeFormState | null>(null);
  const [savingEmployee, setSavingEmployee] = useState(false);

  const openEmployeeDialog = (employee: HrEmployee) => {
    setEmployeeDialogUser(employee);
    setEmployeeForm(createEmployeeFormState(employee));
  };

  const openCreateManualEmployeeDialog = (prefill?: Partial<HrEmployee>) => {
    const employee = createBlankManualEmployee(prefill);
    setEmployeeDialogUser(employee);
    setEmployeeForm(createEmployeeFormState(employee));
    setActiveTab("employees");
  };

  const closeEmployeeDialog = () => {
    setEmployeeDialogUser(null);
    setEmployeeForm(null);
  };

  const saveEmployeeDetails = async (options?: { keepOpen?: boolean }) => {
    if (!employeeDialogUser || !employeeForm) return false;

    setSavingEmployee(true);
    try {
      const trimmedName = employeeForm.name.trim() || "Unnamed Employee";
      const resolvedRole = employeeForm.role;
      const trimmedStore = employeeForm.store.trim() || null;
      const trimmedEmployeeCode = employeeForm.employeeCode.trim() || null;
      const trimmedBiometricId = trimmedEmployeeCode;
      const trimmedDepartment = employeeForm.department.trim() || null;
      const educationSummary = employeeForm.masterBoardName.trim()
        ? "Master"
        : employeeForm.bachelorBoardName.trim()
          ? "Bachelor"
          : employeeForm.twelfthBoardName.trim()
            ? "12th"
            : employeeForm.tenthBoardName.trim()
              ? "10th"
              : employeeForm.additionalQualification.trim()
                ? employeeForm.additionalQualification.trim()
                : null;
      const salaryBasic = Number(employeeForm.salaryBasic || 0) || null;
      const salaryHra = Number(employeeForm.salaryHra || 0) || null;
      const salarySpecialAllowance = Number(employeeForm.salarySpecialAllowance || 0) || null;
      const salaryOtherAllowance = Number(employeeForm.salaryOtherAllowance || 0) || null;
      const salaryPf = Number(employeeForm.salaryPf || 0) || null;
      const salaryEsi = Number(employeeForm.salaryEsi || 0) || null;
      const salaryProfessionalTax = Number(employeeForm.salaryProfessionalTax || 0) || null;
      const salaryTds = Number(employeeForm.salaryTds || 0) || null;
      const payload = {
        name: trimmedName,
        email: employeeForm.email.trim() || null,
        phone: employeeForm.phone.trim() || null,
        role: resolvedRole,
        store: trimmedStore,
        timesheetEnabled: Boolean(employeeForm.timesheetEnabled),
        employeeCode: trimmedEmployeeCode,
        biometricId: trimmedBiometricId,
        department: trimmedDepartment,
        education: educationSummary,
        tenthBoardName: employeeForm.tenthBoardName.trim() || null,
        tenthMarks: employeeForm.tenthMarks.trim() || null,
        twelfthBoardName: employeeForm.twelfthBoardName.trim() || null,
        twelfthMarks: employeeForm.twelfthMarks.trim() || null,
        bachelorBoardName: employeeForm.bachelorBoardName.trim() || null,
        bachelorMarks: employeeForm.bachelorMarks.trim() || null,
        masterBoardName: employeeForm.masterBoardName.trim() || null,
        masterMarks: employeeForm.masterMarks.trim() || null,
        additionalQualification: employeeForm.additionalQualification.trim() || null,
        experienceType: employeeForm.experienceType,
        experience:
          employeeForm.experienceType === "experienced" ? employeeForm.experience.trim() || null : null,
        designation: employeeForm.designation.trim() || null,
        reportingManager: employeeForm.reportingManager.trim() || null,
        joiningDate: employeeForm.joiningDate || null,
        timesheetDutyStart: employeeForm.workingTimeFrom || null,
        timesheetDutyEnd: employeeForm.workingTimeTo || null,
        employmentStatus: employeeForm.employmentStatus,
        panNumber: employeeForm.panNumber.trim() || null,
        aadhaarNumber: employeeForm.aadhaarNumber.trim() || null,
        bankName: employeeForm.bankName.trim() || null,
        bankAccountNumber: employeeForm.bankAccountNumber.trim() || null,
        bankIfsc: employeeForm.bankIfsc.trim() || null,
        uanNumber: employeeForm.uanNumber.trim() || null,
        esiNumber: employeeForm.esiNumber.trim() || null,
        medicalInsurance: employeeForm.medicalInsurance.trim() || null,
        issuedAssets: employeeForm.issuedAssets.trim() || null,
        salaryBasic,
        salaryHra,
        salarySpecialAllowance,
        salaryOtherAllowance,
        salaryPf,
        salaryEsi,
        salaryProfessionalTax,
        salaryTds,
        hasPf: Boolean(employeeForm.hasPf),
        hasHealthInsurance: Boolean(employeeForm.hasHealthInsurance),
        drivingLicense: employeeForm.drivingLicense.trim() || null,
        voterId: employeeForm.voterId.trim() || null,
        passportNumber: employeeForm.passportNumber.trim() || null,
        salaryOtherDeduction: Number(employeeForm.salaryOtherDeduction) || null,
        salaryOtherDeductionLabel: employeeForm.salaryOtherDeductionLabel.trim() || null,
        photoUrl: employeeForm.photoUrl.trim() || null,
      };

      if (employeeDialogUser.hasLoginAccount) {
        await setDoc(doc(db, "users", employeeDialogUser.recordId), payload, { merge: true });
      } else {
        const targetRef = employeeDialogUser.recordId
          ? doc(db, "hrEmployees", employeeDialogUser.recordId)
          : doc(collection(db, "hrEmployees"));

        await setDoc(
          targetRef,
          {
            ...payload,
            linkedUserId: employeeDialogUser.linkedUserId || null,
          },
          { merge: true }
        );
      }

      const refreshedEmployee: HrEmployee = {
        ...employeeDialogUser,
        name: trimmedName,
        role: resolvedRole as HrEmployee["role"],
        store: trimmedStore || undefined,
        timesheetEnabled: Boolean(employeeForm.timesheetEnabled),
        employeeCode: trimmedEmployeeCode || undefined,
        biometricId: trimmedBiometricId || undefined,
        department: trimmedDepartment || undefined,
        education: educationSummary || undefined,
        tenthBoardName: employeeForm.tenthBoardName.trim() || undefined,
        tenthMarks: employeeForm.tenthMarks.trim() || undefined,
        twelfthBoardName: employeeForm.twelfthBoardName.trim() || undefined,
        twelfthMarks: employeeForm.twelfthMarks.trim() || undefined,
        bachelorBoardName: employeeForm.bachelorBoardName.trim() || undefined,
        bachelorMarks: employeeForm.bachelorMarks.trim() || undefined,
        masterBoardName: employeeForm.masterBoardName.trim() || undefined,
        masterMarks: employeeForm.masterMarks.trim() || undefined,
        additionalQualification: employeeForm.additionalQualification.trim() || undefined,
        experienceType: employeeForm.experienceType,
        experience:
          employeeForm.experienceType === "experienced" ? employeeForm.experience.trim() || undefined : undefined,
        designation: employeeForm.designation.trim() || undefined,
        reportingManager: employeeForm.reportingManager.trim() || undefined,
        joiningDate: employeeForm.joiningDate || undefined,
        timesheetDutyStart: employeeForm.workingTimeFrom || undefined,
        timesheetDutyEnd: employeeForm.workingTimeTo || undefined,
        employmentStatus: employeeForm.employmentStatus,
        panNumber: employeeForm.panNumber.trim() || undefined,
        aadhaarNumber: employeeForm.aadhaarNumber.trim() || undefined,
        bankName: employeeForm.bankName.trim() || undefined,
        bankAccountNumber: employeeForm.bankAccountNumber.trim() || undefined,
        bankIfsc: employeeForm.bankIfsc.trim() || undefined,
        uanNumber: employeeForm.uanNumber.trim() || undefined,
        esiNumber: employeeForm.esiNumber.trim() || undefined,
        medicalInsurance: employeeForm.medicalInsurance.trim() || undefined,
        issuedAssets: employeeForm.issuedAssets.trim() || undefined,
        salaryBasic: salaryBasic || undefined,
        salaryHra: salaryHra || undefined,
        salarySpecialAllowance: salarySpecialAllowance || undefined,
        salaryOtherAllowance: salaryOtherAllowance || undefined,
        salaryPf: salaryPf || undefined,
        salaryEsi: salaryEsi || undefined,
        salaryProfessionalTax: salaryProfessionalTax || undefined,
        salaryTds: salaryTds || undefined,
        hasPf: Boolean(employeeForm.hasPf),
        hasHealthInsurance: Boolean(employeeForm.hasHealthInsurance),
        drivingLicense: employeeForm.drivingLicense.trim() || undefined,
        voterId: employeeForm.voterId.trim() || undefined,
        passportNumber: employeeForm.passportNumber.trim() || undefined,
        salaryOtherDeduction: Number(employeeForm.salaryOtherDeduction) || undefined,
        salaryOtherDeductionLabel: employeeForm.salaryOtherDeductionLabel.trim() || undefined,
        photoUrl: employeeForm.photoUrl.trim() || undefined,
      };

      const payrollSnapshot = await getDocs(
        query(collection(db, "hrPayroll"), where("userId", "==", employeeDialogUser.id))
      );
      await Promise.all(
        payrollSnapshot.docs.map((entry) => {
          const existingRecord = { id: entry.id, ...(entry.data() as Omit<PayrollRecord, "id">) };
          const rebuiltRecord = buildPayrollRecord(
            refreshedEmployee,
            existingRecord.month,
            createPayrollFormState(existingRecord, existingRecord.month),
            existingRecord.generatedBy,
            existingRecord
          );

          return setDoc(doc(db, "hrPayroll", entry.id), rebuiltRecord, { merge: true });
        })
      );

      toast({
        title: options?.keepOpen ? "Step saved" : "Employee details saved",
        description: options?.keepOpen
          ? `${trimmedName}'s information has been saved.`
          : `${trimmedName}'s HR profile is up to date.`,
      });
      if (!options?.keepOpen) {
        closeEmployeeDialog();
      }
      return true;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Unable to save employee details",
        description: error?.message || "Please try again.",
      });
      return false;
    } finally {
      setSavingEmployee(false);
    }
  };

  return {
    employeeDialogUser,
    employeeForm,
    setEmployeeForm,
    savingEmployee,
    openEmployeeDialog,
    openCreateManualEmployeeDialog,
    closeEmployeeDialog,
    saveEmployeeDetails,
  };
}
