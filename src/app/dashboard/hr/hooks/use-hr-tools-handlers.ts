import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { User } from "@/lib/types";
import type {
  HrApplicant,
  HrApplicantFormState,
  HrAppraisalFormState,
  HrEmployee,
  HrExpenseClaimFormState,
  HrIncrementFormState,
  HrJobFormState,
  HrJobOpening,
  HrLoan,
  HrLetterFormState,
  HrLoanFormState,
  HrRosterFormState,
  HrWarningFormState,
} from "../types";
import {
  createApplicantFormState,
  createAppraisalFormState,
  createExpenseClaimFormState,
  createIncrementFormState,
  createJobFormState,
  createLetterFormState,
  createLoanFormState,
  createRosterFormState,
  createWarningFormState,
} from "../utils";

interface Params {
  user: User | null;
  toast: (opts: { title: string; description?: string; variant?: "destructive" }) => void;
  activeEmployees: HrEmployee[];
  loans: HrLoan[];
}

export function useHrToolsHandlers({ user, toast, activeEmployees, loans }: Params) {
  // ─── Letters ────────────────────────────────────────────────────────────────
  const [letterDialogEmployee, setLetterDialogEmployee] = useState<HrEmployee | null>(null);
  const [letterForm, setLetterForm] = useState<HrLetterFormState | null>(null);
  const [savingLetter, setSavingLetter] = useState(false);

  // ─── Loans ──────────────────────────────────────────────────────────────────
  const [loanDialogEmployee, setLoanDialogEmployee] = useState<HrEmployee | null>(null);
  const [loanForm, setLoanForm] = useState<HrLoanFormState | null>(null);
  const [savingLoan, setSavingLoan] = useState(false);

  // ─── Warnings ───────────────────────────────────────────────────────────────
  const [warningDialogEmployee, setWarningDialogEmployee] = useState<HrEmployee | null>(null);
  const [warningForm, setWarningForm] = useState<HrWarningFormState | null>(null);
  const [savingWarning, setSavingWarning] = useState(false);

  // ─── Expense Claims ──────────────────────────────────────────────────────────
  const [expenseClaimForm, setExpenseClaimForm] = useState<HrExpenseClaimFormState | null>(null);
  const [savingExpenseClaim, setSavingExpenseClaim] = useState(false);

  // ─── Roster ──────────────────────────────────────────────────────────────────
  const [rosterForm, setRosterForm] = useState<HrRosterFormState | null>(null);
  const [savingRoster, setSavingRoster] = useState(false);

  // ─── Appraisals ──────────────────────────────────────────────────────────────
  const [appraisalDialogEmployee, setAppraisalDialogEmployee] = useState<HrEmployee | null>(null);
  const [appraisalForm, setAppraisalForm] = useState<HrAppraisalFormState | null>(null);
  const [savingAppraisal, setSavingAppraisal] = useState(false);

  // ─── Increments ──────────────────────────────────────────────────────────────
  const [incrementDialogEmployee, setIncrementDialogEmployee] = useState<HrEmployee | null>(null);
  const [incrementForm, setIncrementForm] = useState<HrIncrementFormState | null>(null);
  const [savingIncrement, setSavingIncrement] = useState(false);

  // ─── Jobs ────────────────────────────────────────────────────────────────────
  const [jobForm, setJobForm] = useState<HrJobFormState | null>(null);
  const [savingJob, setSavingJob] = useState(false);

  // ─── Applicants ──────────────────────────────────────────────────────────────
  const [applicantDialogJob, setApplicantDialogJob] = useState<HrJobOpening | null>(null);
  const [applicantForm, setApplicantForm] = useState<HrApplicantFormState | null>(null);
  const [savingApplicant, setSavingApplicant] = useState(false);

  // ─── Letter handlers ────────────────────────────────────────────────────────

  const openLetterDialog = (employee: HrEmployee | null) => {
    setLetterDialogEmployee(employee);
    setLetterForm(createLetterFormState(employee?.id ?? ""));
  };

  const closeLetterDialog = () => {
    setLetterForm(null);
    setLetterDialogEmployee(null);
  };

  const saveLetter = async () => {
    if (!letterForm || !letterForm.employeeId) return;
    const emp = letterDialogEmployee ?? activeEmployees.find((e) => e.id === letterForm.employeeId);
    if (!emp) return;
    setSavingLetter(true);
    try {
      await addDoc(collection(db, "hrLetters"), {
        employeeId: emp.id,
        employeeName: emp.name,
        employeeCode: emp.employeeCode || null,
        department: emp.department || null,
        letterType: letterForm.letterType,
        subject: letterForm.subject.trim(),
        body: letterForm.body.trim(),
        effectiveDate: letterForm.effectiveDate || null,
        newSalary: letterForm.newSalary ? Number(letterForm.newSalary) : null,
        generatedAt: new Date().toISOString(),
        generatedBy: user ? { id: user.id, name: user.name } : null,
      });
      toast({ title: "Letter saved", description: `${letterForm.subject} saved for ${emp.name}.` });
      closeLetterDialog();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save failed", description: error?.message });
    } finally {
      setSavingLetter(false);
    }
  };

  // ─── Loan handlers ──────────────────────────────────────────────────────────

  const openLoanDialog = (employee: HrEmployee) => {
    setLoanDialogEmployee(employee);
    setLoanForm(createLoanFormState(employee.id));
  };

  const closeLoanDialog = () => {
    setLoanForm(null);
    setLoanDialogEmployee(null);
  };

  const saveLoan = async () => {
    if (!loanDialogEmployee || !loanForm) return;
    setSavingLoan(true);
    try {
      const amount = Number(loanForm.amount) || 0;
      await addDoc(collection(db, "hrLoans"), {
        employeeId: loanDialogEmployee.id,
        employeeName: loanDialogEmployee.name,
        employeeCode: loanDialogEmployee.employeeCode || null,
        department: loanDialogEmployee.department || null,
        loanType: loanForm.loanType,
        amount,
        monthlyEmi: Number(loanForm.monthlyEmi) || 0,
        disbursedDate: loanForm.disbursedDate,
        reason: loanForm.reason.trim(),
        status: "active",
        paidAmount: 0,
        remainingAmount: amount,
        notes: loanForm.notes.trim() || null,
        createdAt: new Date().toISOString(),
        createdBy: user ? { id: user.id, name: user.name } : null,
      });
      toast({ title: "Loan recorded", description: `${loanForm.loanType === "advance" ? "Advance" : "Loan"} of ₹${amount.toLocaleString("en-IN")} saved.` });
      closeLoanDialog();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save failed", description: error?.message });
    } finally {
      setSavingLoan(false);
    }
  };

  const markLoanClosed = async (loanId: string) => {
    try {
      const loan = loans.find((l) => l.id === loanId);
      if (!loan) return;
      await updateDoc(doc(db, "hrLoans", loanId), { status: "closed", paidAmount: loan.amount, remainingAmount: 0 });
      toast({ title: "Loan closed", description: "Marked as fully repaid." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update failed", description: error?.message });
    }
  };

  // ─── Warning handlers ────────────────────────────────────────────────────────

  const openWarningDialog = (employee: HrEmployee) => {
    setWarningDialogEmployee(employee);
    setWarningForm(createWarningFormState(employee.id));
  };

  const closeWarningDialog = () => {
    setWarningForm(null);
    setWarningDialogEmployee(null);
  };

  const saveWarning = async () => {
    if (!warningDialogEmployee || !warningForm) return;
    setSavingWarning(true);
    try {
      await addDoc(collection(db, "hrWarnings"), {
        employeeId: warningDialogEmployee.id,
        employeeName: warningDialogEmployee.name,
        employeeCode: warningDialogEmployee.employeeCode || null,
        department: warningDialogEmployee.department || null,
        category: warningForm.category,
        severity: warningForm.severity,
        subject: warningForm.subject.trim(),
        description: warningForm.description.trim(),
        issuedAt: new Date().toISOString(),
        issuedBy: user ? { id: user.id, name: user.name } : null,
      });
      toast({ title: "Warning issued", description: `${warningForm.severity} warning saved for ${warningDialogEmployee.name}.` });
      closeWarningDialog();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save failed", description: error?.message });
    } finally {
      setSavingWarning(false);
    }
  };

  const deleteWarning = async (id: string) => {
    try {
      await deleteDoc(doc(db, "hrWarnings", id));
      toast({ title: "Warning deleted" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete failed", description: error?.message });
    }
  };

  // ─── Expense claim handlers ──────────────────────────────────────────────────

  const openExpenseClaimDialog = (employeeId?: string) => {
    setExpenseClaimForm(createExpenseClaimFormState(employeeId));
  };

  const saveExpenseClaim = async () => {
    if (!expenseClaimForm || !expenseClaimForm.employeeId) return;
    const emp = activeEmployees.find((e) => e.id === expenseClaimForm.employeeId);
    if (!emp) return;
    setSavingExpenseClaim(true);
    try {
      await addDoc(collection(db, "hrExpenseClaims"), {
        employeeId: emp.id,
        employeeName: emp.name,
        employeeCode: emp.employeeCode || null,
        department: emp.department || null,
        category: expenseClaimForm.category,
        amount: Number(expenseClaimForm.amount) || 0,
        date: expenseClaimForm.date,
        description: expenseClaimForm.description.trim(),
        status: "pending",
        submittedAt: new Date().toISOString(),
      });
      toast({ title: "Expense claim submitted", description: `₹${expenseClaimForm.amount} claim saved.` });
      setExpenseClaimForm(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save failed", description: error?.message });
    } finally {
      setSavingExpenseClaim(false);
    }
  };

  const reviewExpenseClaim = async (id: string, status: "approved" | "rejected") => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "hrExpenseClaims", id), {
        status,
        reviewedBy: { id: user.id, name: user.name },
        reviewedAt: new Date().toISOString(),
      });
      toast({ title: `Claim ${status}` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update failed", description: error?.message });
    }
  };

  // ─── Roster handlers ─────────────────────────────────────────────────────────

  const openRosterDialog = (employeeId?: string) => {
    setRosterForm(createRosterFormState(employeeId));
  };

  const saveRosterEntry = async () => {
    if (!rosterForm || !rosterForm.employeeId || !rosterForm.date) return;
    const emp = activeEmployees.find((e) => e.id === rosterForm.employeeId);
    if (!emp) return;
    setSavingRoster(true);
    try {
      const docId = `${rosterForm.employeeId}_${rosterForm.date}`;
      await setDoc(doc(db, "hrRoster", docId), {
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department || null,
        store: emp.store || null,
        date: rosterForm.date,
        shiftId: rosterForm.shiftId,
        shiftName: rosterForm.shiftName,
        shiftStart: rosterForm.shiftStart,
        shiftEnd: rosterForm.shiftEnd,
      }, { merge: true });
      toast({ title: "Roster entry saved", description: `${emp.name} — ${rosterForm.shiftName} on ${rosterForm.date}.` });
      setRosterForm(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save failed", description: error?.message });
    } finally {
      setSavingRoster(false);
    }
  };

  const deleteRosterEntry = async (id: string) => {
    try {
      await deleteDoc(doc(db, "hrRoster", id));
      toast({ title: "Roster entry removed" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete failed", description: error?.message });
    }
  };

  // ─── Appraisal handlers ──────────────────────────────────────────────────────

  const openAppraisalDialog = (employee: HrEmployee) => {
    setAppraisalDialogEmployee(employee);
    setAppraisalForm(createAppraisalFormState(employee.id));
  };

  const closeAppraisalDialog = () => {
    setAppraisalForm(null);
    setAppraisalDialogEmployee(null);
  };

  const saveAppraisal = async () => {
    if (!appraisalDialogEmployee || !appraisalForm) return;
    setSavingAppraisal(true);
    try {
      await addDoc(collection(db, "hrAppraisals"), {
        employeeId: appraisalDialogEmployee.id,
        employeeName: appraisalDialogEmployee.name,
        employeeCode: appraisalDialogEmployee.employeeCode || null,
        department: appraisalDialogEmployee.department || null,
        period: appraisalForm.period,
        rating: Number(appraisalForm.rating) as 1 | 2 | 3 | 4 | 5,
        goals: appraisalForm.goals.trim(),
        achievements: appraisalForm.achievements.trim(),
        areasOfImprovement: appraisalForm.areasOfImprovement.trim(),
        managerComments: appraisalForm.managerComments.trim(),
        status: "submitted",
        createdAt: new Date().toISOString(),
        reviewedBy: user ? { id: user.id, name: user.name } : null,
      });
      toast({ title: "Appraisal saved", description: `${appraisalDialogEmployee.name} — ${appraisalForm.period}.` });
      closeAppraisalDialog();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save failed", description: error?.message });
    } finally {
      setSavingAppraisal(false);
    }
  };

  // ─── Increment handlers ──────────────────────────────────────────────────────

  const openIncrementDialog = (employee: HrEmployee) => {
    setIncrementDialogEmployee(employee);
    setIncrementForm(createIncrementFormState(employee.id));
  };

  const closeIncrementDialog = () => {
    setIncrementForm(null);
    setIncrementDialogEmployee(null);
  };

  const saveIncrement = async () => {
    if (!incrementDialogEmployee || !incrementForm) return;
    setSavingIncrement(true);
    try {
      const previousBasic = incrementDialogEmployee.salaryBasic || 0;
      const newBasic = Number(incrementForm.newBasic) || 0;
      const incrementAmount = newBasic - previousBasic;
      const incrementPercent = previousBasic > 0 ? Math.round((incrementAmount / previousBasic) * 100 * 10) / 10 : 0;
      await addDoc(collection(db, "hrIncrements"), {
        employeeId: incrementDialogEmployee.id,
        employeeName: incrementDialogEmployee.name,
        employeeCode: incrementDialogEmployee.employeeCode || null,
        department: incrementDialogEmployee.department || null,
        effectiveDate: incrementForm.effectiveDate,
        previousBasic,
        newBasic,
        incrementAmount,
        incrementPercent,
        reason: incrementForm.reason.trim(),
        approvedBy: user ? { id: user.id, name: user.name } : null,
        createdAt: new Date().toISOString(),
      });
      if (incrementDialogEmployee.hasLoginAccount) {
        await updateDoc(doc(db, "users", incrementDialogEmployee.recordId), { salaryBasic: newBasic });
      } else {
        await updateDoc(doc(db, "hrEmployees", incrementDialogEmployee.recordId), { salaryBasic: newBasic });
      }
      toast({ title: "Increment applied", description: `${incrementDialogEmployee.name}'s basic updated to ₹${newBasic.toLocaleString("en-IN")}.` });
      closeIncrementDialog();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save failed", description: error?.message });
    } finally {
      setSavingIncrement(false);
    }
  };

  // ─── Job handlers ────────────────────────────────────────────────────────────

  const openJobDialog = () => {
    setJobForm(createJobFormState());
  };

  const saveJob = async () => {
    if (!jobForm || !jobForm.title.trim()) return;
    setSavingJob(true);
    try {
      await addDoc(collection(db, "hrJobs"), {
        title: jobForm.title.trim(),
        department: jobForm.department.trim() || null,
        store: jobForm.store.trim() || null,
        openings: Number(jobForm.openings) || 1,
        status: jobForm.status,
        description: jobForm.description.trim(),
        createdAt: new Date().toISOString(),
        createdBy: user ? { id: user.id, name: user.name } : null,
      });
      toast({ title: "Job opening saved", description: `${jobForm.title} posted.` });
      setJobForm(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save failed", description: error?.message });
    } finally {
      setSavingJob(false);
    }
  };

  const deleteJob = async (id: string) => {
    try {
      await deleteDoc(doc(db, "hrJobs", id));
      toast({ title: "Job opening deleted" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete failed", description: error?.message });
    }
  };

  // ─── Applicant handlers ──────────────────────────────────────────────────────

  const openApplicantDialog = (job: HrJobOpening) => {
    setApplicantDialogJob(job);
    setApplicantForm(createApplicantFormState(job));
  };

  const closeApplicantDialog = () => {
    setApplicantForm(null);
    setApplicantDialogJob(null);
  };

  const saveApplicant = async () => {
    if (!applicantForm || !applicantDialogJob) return;
    setSavingApplicant(true);
    try {
      await addDoc(collection(db, "hrApplicants"), {
        jobId: applicantDialogJob.id,
        jobTitle: applicantDialogJob.title,
        name: applicantForm.name.trim(),
        email: applicantForm.email.trim() || null,
        phone: applicantForm.phone.trim() || null,
        experience: applicantForm.experience.trim() || null,
        assignedOwner: applicantForm.assignedOwner.trim() || null,
        assignedRole: applicantForm.assignedRole,
        deadlineAt: applicantForm.deadlineAt || null,
        stage: applicantForm.stage,
        notes: applicantForm.notes.trim() || null,
        appliedAt: new Date().toISOString(),
        completedAt: applicantForm.stage === "joined" || applicantForm.stage === "rejected" ? new Date().toISOString() : null,
      });
      toast({ title: "Applicant added", description: `${applicantForm.name} added to pipeline.` });
      closeApplicantDialog();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save failed", description: error?.message });
    } finally {
      setSavingApplicant(false);
    }
  };

  const updateApplicantStage = async (applicantId: string, stage: HrApplicant["stage"]) => {
    try {
      await updateDoc(doc(db, "hrApplicants", applicantId), {
        stage,
        updatedAt: new Date().toISOString(),
        completedAt: stage === "joined" || stage === "rejected" ? new Date().toISOString() : null,
      });
      toast({ title: "Stage updated", description: `Applicant moved to ${stage}.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update failed", description: error?.message });
    }
  };

  return {
    // Letters
    letterDialogEmployee,
    letterForm,
    setLetterForm,
    savingLetter,
    openLetterDialog,
    closeLetterDialog,
    saveLetter,
    // Loans
    loanDialogEmployee,
    loanForm,
    setLoanForm,
    savingLoan,
    openLoanDialog,
    closeLoanDialog,
    saveLoan,
    markLoanClosed,
    // Warnings
    warningDialogEmployee,
    warningForm,
    setWarningForm,
    savingWarning,
    openWarningDialog,
    closeWarningDialog,
    saveWarning,
    deleteWarning,
    // Expense Claims
    expenseClaimForm,
    setExpenseClaimForm,
    savingExpenseClaim,
    openExpenseClaimDialog,
    saveExpenseClaim,
    reviewExpenseClaim,
    // Roster
    rosterForm,
    setRosterForm,
    savingRoster,
    openRosterDialog,
    saveRosterEntry,
    deleteRosterEntry,
    // Appraisals
    appraisalDialogEmployee,
    appraisalForm,
    setAppraisalForm,
    savingAppraisal,
    openAppraisalDialog,
    closeAppraisalDialog,
    saveAppraisal,
    // Increments
    incrementDialogEmployee,
    incrementForm,
    setIncrementForm,
    savingIncrement,
    openIncrementDialog,
    closeIncrementDialog,
    saveIncrement,
    // Jobs
    jobForm,
    setJobForm,
    savingJob,
    openJobDialog,
    saveJob,
    deleteJob,
    // Applicants
    applicantDialogJob,
    applicantForm,
    setApplicantForm,
    savingApplicant,
    openApplicantDialog,
    closeApplicantDialog,
    saveApplicant,
    updateApplicantStage,
  };
}
