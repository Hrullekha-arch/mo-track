"use client";

import { useCallback } from "react";
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CreateJobDialogRow, StoredEmbellishment } from "../types/pms";
import { buildEmbellishmentForm, emptyEmbellishmentForm, toNumber } from "../utils/pmsHelpers";

type Params = {
  role?: string | null;
  user?: { id?: string | null; name?: string | null; role?: string | null } | null;
  toast: any;
  liveVasRowsAll: any[];
  createJobDialog: any;
  setCreateJobDialog: any;
  createJobTotals: any;
  runningAutopilot: boolean;
  runningPriorityReplan: boolean;
  resettingAutopilot: boolean;
  priorityUpdatingOrderId: string | null;
  deletingPlanKey: string | null;
  setCreatingJobKey: (value: string | null) => void;
  setResettingAutopilot: (value: boolean) => void;
  setResetAutopilotDialogOpen: (value: boolean) => void;
  setRunningAutopilot: (value: boolean) => void;
  setRunningPriorityReplan: (value: boolean) => void;
  setPriorityUpdatingOrderId: (value: string | null) => void;
  setDeletingPlanKey: (value: string | null) => void;
  manualDoneDialog: any;
  setManualDoneDialog: any;
  manualDoneSaving: boolean;
  setManualDoneSaving: (value: boolean) => void;
  manualDoneAllQtyReady: "yes" | "no";
  setManualDoneAllQtyReady: (value: "yes" | "no") => void;
  manualDoneRemainingQty: string;
  setManualDoneRemainingQty: (value: string) => void;
  manualDoneReason: string;
  setManualDoneReason: (value: string) => void;
  setActiveTab: (value: string) => void;
  setSelectedProductId: (value: string) => void;
};

export const usePmsJobActions = ({
  role,
  user,
  toast,
  liveVasRowsAll,
  createJobDialog,
  setCreateJobDialog,
  createJobTotals,
  runningAutopilot,
  runningPriorityReplan,
  resettingAutopilot,
  priorityUpdatingOrderId,
  deletingPlanKey,
  setCreatingJobKey,
  setResettingAutopilot,
  setResetAutopilotDialogOpen,
  setRunningAutopilot,
  setRunningPriorityReplan,
  setPriorityUpdatingOrderId,
  setDeletingPlanKey,
  manualDoneDialog,
  setManualDoneDialog,
  manualDoneSaving,
  setManualDoneSaving,
  manualDoneAllQtyReady,
  setManualDoneAllQtyReady,
  manualDoneRemainingQty,
  setManualDoneRemainingQty,
  manualDoneReason,
  setManualDoneReason,
  setActiveTab,
  setSelectedProductId,
}: Params) => {
  const handleOpenRoutingSetup = useCallback((productId?: string) => {
    if (!productId) return;
    setSelectedProductId(productId);
    setActiveTab("routing");
  }, [setActiveTab, setSelectedProductId]);

  const handleCloseCreateJobDialog = useCallback(() => {
    setCreateJobDialog({
      open: false,
      row: null,
      embellishmentEnabled: false,
      form: emptyEmbellishmentForm,
    });
  }, [setCreateJobDialog]);

  const prepareCreateJobEditor = useCallback(
    (row: CreateJobDialogRow, open: boolean, options?: { allowExistingJobs?: boolean }) => {
      if (
        runningAutopilot ||
        runningPriorityReplan ||
        resettingAutopilot ||
        priorityUpdatingOrderId ||
        deletingPlanKey
      ) {
        return;
      }
      if (!row?.invoiceReady) {
        toast({
          variant: "destructive",
          title: "Invoice required",
          description: "Generate an invoice for this order before creating PMS jobs.",
        });
        return;
      }
      if (!row?.matchedProductId) {
        toast({
          variant: "destructive",
          title: "No PMS product match",
          description: "Create a PMS product with the same name as the VAS item, then try again.",
        });
        return;
      }
      if (!row.hasRouting && open) {
        toast({
          variant: "destructive",
          title: "Routing not created",
          description:
            role === "admin"
              ? "Create routing for this PMS product first, then create jobs."
              : "Ask admin to create routing for this PMS product first.",
        });
        if (role === "admin") {
          handleOpenRoutingSetup(row.matchedProductId);
        }
        return;
      }
      if (row.hasJobsForProduct && !options?.allowExistingJobs) {
        toast({
          title: "Jobs already exist",
          description: "PMS jobs are already created for this VAS item.",
        });
        return;
      }
      const existing = row.embellishment;
      setCreateJobDialog({
        open,
        row,
        embellishmentEnabled: Boolean(existing?.enabled),
        form: buildEmbellishmentForm(row, existing),
      });
    },
    [
      deletingPlanKey,
      handleOpenRoutingSetup,
      priorityUpdatingOrderId,
      resettingAutopilot,
      role,
      runningAutopilot,
      runningPriorityReplan,
      setCreateJobDialog,
      toast,
    ]
  );

  const handleOpenCreateJobDialog = useCallback(
    (row: CreateJobDialogRow) => {
      prepareCreateJobEditor(row, true);
    },
    [prepareCreateJobEditor]
  );

  const handleSelectEmbellishmentRow = useCallback(
    (row: CreateJobDialogRow) => {
      prepareCreateJobEditor(row, false, { allowExistingJobs: true });
    },
    [prepareCreateJobEditor]
  );

  const handleCreateJobDialogFieldChange = useCallback(
    (field: string, value: string) => {
      setCreateJobDialog((prev: any) => ({
        ...prev,
        form: {
          ...prev.form,
          [field]: value,
        },
      }));
    },
    [setCreateJobDialog]
  );

  const persistEmbellishmentForRow = useCallback(
    async (row: CreateJobDialogRow, embellishment: StoredEmbellishment) => {
      const nowIso = new Date().toISOString();
      await setDoc(
        doc(db, "pmsEmbellishment", row.key),
        {
          ...embellishment,
          orderId: row.orderId,
          orderNo: row.orderNo,
          customer: row.customer,
          customerPhone: row.customerPhone || embellishment.customerPhone || "",
          vasName: row.vasName,
          vasIndex: row.vasIndex,
          productId: row.matchedProductId || "",
          createdAt: nowIso,
          updatedAt: nowIso,
          updatedBy: {
            id: user?.id || null,
            name: user?.name || null,
            role: user?.role || null,
          },
        },
        { merge: true }
      );
    },
    [user]
  );

  const getValidatedEmbellishmentPayload = useCallback(() => {
    if (!createJobDialog.embellishmentEnabled) return undefined;

    const customerName = createJobDialog.form.customerName.trim();
    const customerPhone = createJobDialog.form.customerPhone.trim();
    const numberOfWindows = toNumber(createJobDialog.form.numberOfWindows);
    const numberOfPanels = toNumber(createJobDialog.form.numberOfPanels);
    const embellishmentBarcode = createJobDialog.form.embellishmentBarcode.trim();
    const stitchingPerPanel = toNumber(createJobDialog.form.stitchingPerPanel);
    const designTime = toNumber(createJobDialog.form.designTime);
    const handWorkTime = toNumber(createJobDialog.form.handWorkTime);
    const hourlyCharge = toNumber(createJobDialog.form.hourlyCharge);

    if (
      !customerName ||
      !customerPhone ||
      numberOfWindows <= 0 ||
      numberOfPanels <= 0 ||
      !embellishmentBarcode ||
      stitchingPerPanel <= 0 ||
      designTime < 0 ||
      handWorkTime < 0 ||
      hourlyCharge <= 0
    ) {
      toast({
        variant: "destructive",
        title: "Embelshment form incomplete",
        description:
          "Fill customer, windows, panels, barcode, stitching per panel, design time, hand work time, and hourly charge.",
      });
      return null;
    }

    return {
      enabled: true,
      customerName,
      customerPhone,
      numberOfWindows,
      numberOfPanels,
      embellishmentBarcode,
      stitchingPerPanel,
      designTime,
      handWorkTime,
      hourlyCharge,
      totalHours: createJobTotals.totalHours,
      totalTime: createJobTotals.totalMinutes,
      chargeAmount: createJobTotals.chargeAmount,
    } satisfies StoredEmbellishment;
  }, [createJobDialog, createJobTotals, toast]);

  const handleSaveEmbellishmentDetails = useCallback(async () => {
    const row = createJobDialog.row;
    if (!row) return;
    const embellishmentPayload = getValidatedEmbellishmentPayload();
    if (embellishmentPayload === null || !embellishmentPayload) return;
    setCreatingJobKey(row.key);
    try {
      await persistEmbellishmentForRow(row, embellishmentPayload);
      toast({
        title: "Embelshment details saved",
        description: `Saved ${row.vasName} with total time ${embellishmentPayload.totalTime} min and charge ${embellishmentPayload.chargeAmount}.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: (error as Error).message,
      });
    } finally {
      setCreatingJobKey(null);
    }
  }, [createJobDialog.row, getValidatedEmbellishmentPayload, persistEmbellishmentForRow, setCreatingJobKey, toast]);

  const handleSubmitCreateJobs = useCallback(async () => {
    const row = createJobDialog.row;
    if (!row) return;
    const qty = Number(row.qty) || 1;
    let embellishmentPayload: StoredEmbellishment | undefined;

    if (createJobDialog.embellishmentEnabled) {
      embellishmentPayload = getValidatedEmbellishmentPayload() || undefined;
      if (embellishmentPayload === undefined && createJobDialog.embellishmentEnabled) return;
    }

    setCreatingJobKey(row.key);
    try {
      if (embellishmentPayload) {
        await persistEmbellishmentForRow(row, embellishmentPayload);
      }

      const createRes = await fetch("/api/pms/createOrder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: row.orderId,
          productId: row.matchedProductId,
          qty,
          embellishment: embellishmentPayload,
        }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !createData?.success) {
        throw new Error(createData?.message || "Failed to create PMS jobs.");
      }

      await fetch("/api/pms/runAutopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: row.orderId }),
      });

      toast({
        title: "PMS jobs created",
        description: embellishmentPayload
          ? `Scheduled ${row.vasName} with Embelshment work (Total Time: ${embellishmentPayload.totalTime} min, Charge: ${embellishmentPayload.chargeAmount}).`
          : `Scheduled ${row.vasName} (Qty: ${qty}).`,
      });
      handleCloseCreateJobDialog();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "PMS creation failed",
        description: (error as Error).message,
      });
    } finally {
      setCreatingJobKey(null);
    }
  }, [
    createJobDialog,
    getValidatedEmbellishmentPayload,
    handleCloseCreateJobDialog,
    persistEmbellishmentForRow,
    setCreatingJobKey,
    toast,
  ]);

  const deleteDocsInBatches = useCallback(async (refs: Array<ReturnType<typeof doc>>) => {
    const chunkSize = 450;
    let deleted = 0;
    for (let i = 0; i < refs.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = refs.slice(i, i + chunkSize);
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
      deleted += chunk.length;
    }
    return deleted;
  }, []);

  const handleResetAndRerunAutopilot = useCallback(async () => {
    if (
      resettingAutopilot ||
      runningAutopilot ||
      runningPriorityReplan ||
      priorityUpdatingOrderId ||
      deletingPlanKey
    ) return;

    setResettingAutopilot(true);
    try {
      const jobGroupMap = new Map<string, { orderId: string; productId: string; qty: number; embellishment?: StoredEmbellishment }>();
      let skipped = 0;
      liveVasRowsAll.forEach((row) => {
        if (!row.matchedProductId) {
          skipped += 1;
          return;
        }
        const qty = Number(row.qty) || 1;
        const key = `${row.orderId}_${row.matchedProductId}`;
        const existing = jobGroupMap.get(key);
        if (existing) {
          existing.qty += qty;
          if (!existing.embellishment && row.embellishment?.enabled) {
            existing.embellishment = row.embellishment;
          }
        } else {
          jobGroupMap.set(key, {
            orderId: row.orderId,
            productId: row.matchedProductId,
            qty,
            embellishment: row.embellishment?.enabled ? row.embellishment : undefined,
          });
        }
      });

      const [allJobsSnap, allPlansSnap] = await Promise.all([
        getDocs(collection(db, "jobs")),
        getDocs(collection(db, "plan")),
      ]);
      const jobRefs = allJobsSnap.docs.map((jobDoc) => doc(db, "jobs", jobDoc.id));
      const planRefs = allPlansSnap.docs.map((planDoc) => doc(db, "plan", planDoc.id));
      const [deletedJobs, deletedPlans] = await Promise.all([
        deleteDocsInBatches(jobRefs),
        deleteDocsInBatches(planRefs),
      ]);

      let createdGroups = 0;
      let failedGroups = 0;
      for (const group of jobGroupMap.values()) {
        try {
          const createRes = await fetch("/api/pms/createOrder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(group),
          });
          const createData = await createRes.json().catch(() => ({}));
          if (!createRes.ok || !createData?.success) {
            throw new Error(createData?.message || "Failed to create PMS jobs.");
          }
          createdGroups += 1;
        } catch (error) {
          console.error("PMS reset create failed:", error);
          failedGroups += 1;
        }
      }

      const runRes = await fetch("/api/pms/runAutopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const runData = await runRes.json().catch(() => ({}));
      if (!runRes.ok || !runData?.success) {
        throw new Error(runData?.message || "Failed to run autopilot.");
      }

      let description = `Deleted ${deletedJobs} jobs and ${deletedPlans} plan(s).`;
      if (jobGroupMap.size > 0) description += ` Created ${createdGroups}/${jobGroupMap.size} job group(s).`;
      if (skipped > 0) description += ` Skipped ${skipped} item(s) without PMS product match.`;
      if (failedGroups > 0) description += ` ${failedGroups} group(s) failed to create.`;

      toast({ title: "Autopilot reset complete", description });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Autopilot reset failed",
        description: (error as Error).message,
      });
    } finally {
      setResettingAutopilot(false);
      setResetAutopilotDialogOpen(false);
    }
  }, [
    deleteDocsInBatches,
    deletingPlanKey,
    liveVasRowsAll,
    priorityUpdatingOrderId,
    resettingAutopilot,
    runningAutopilot,
    runningPriorityReplan,
    setResetAutopilotDialogOpen,
    setResettingAutopilot,
    toast,
  ]);

  const handleRunAutopilot = useCallback(async () => {
    if (resettingAutopilot || runningPriorityReplan || priorityUpdatingOrderId || deletingPlanKey) return;
    setRunningAutopilot(true);
    try {
      const res = await fetch("/api/pms/runAutopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includePlanned: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.message || "Failed to run autopilot.");
      toast({
        title: "Autopilot run",
        description:
          data?.planned && data.planned > 0
            ? `Planned ${data.planned} job(s).`
            : data?.message || "No new plans. Check the Not Scheduled Reason column.",
      });
    } catch (error) {
      toast({ variant: "destructive", title: "Autopilot failed", description: (error as Error).message });
    } finally {
      setRunningAutopilot(false);
    }
  }, [deletingPlanKey, priorityUpdatingOrderId, resettingAutopilot, runningPriorityReplan, setRunningAutopilot, toast]);

  const handleRunPriorityReplan = useCallback(async () => {
    if (resettingAutopilot || runningAutopilot || priorityUpdatingOrderId || deletingPlanKey) return;
    setRunningPriorityReplan(true);
    try {
      const res = await fetch("/api/pms/runAutopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includePlanned: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.message || "Failed to replan.");
      toast({
        title: "Priority replan complete",
        description:
          data?.planned && data.planned > 0
            ? `Replanned ${data.planned} job(s) including planned queue.`
            : data?.message || "No changes were required.",
      });
    } catch (error) {
      toast({ variant: "destructive", title: "Priority replan failed", description: (error as Error).message });
    } finally {
      setRunningPriorityReplan(false);
    }
  }, [deletingPlanKey, priorityUpdatingOrderId, resettingAutopilot, runningAutopilot, setRunningPriorityReplan, toast]);

  const handleSetOrderEmergencyPriority = useCallback(async (orderId: string, emergency: boolean) => {
    if (!orderId || runningAutopilot || runningPriorityReplan || resettingAutopilot || deletingPlanKey) return;
    setPriorityUpdatingOrderId(orderId);
    try {
      await setDoc(
        doc(db, "orders", orderId),
        {
          priority: emergency ? -100 : 500,
          pmsPriorityTag: emergency ? "EMERGENCY" : "NORMAL",
          pmsPriorityUpdatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      const replanRes = await fetch("/api/pms/runAutopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includePlanned: true }),
      });
      const replanData = await replanRes.json().catch(() => ({}));
      if (!replanRes.ok || !replanData?.success) {
        throw new Error(replanData?.message || "Priority updated, but replan failed.");
      }
      toast({
        title: emergency ? "Marked as emergency" : "Emergency cleared",
        description:
          replanData?.planned && replanData.planned > 0
            ? `Priority reapplied and ${replanData.planned} job(s) replanned.`
            : "Priority updated successfully.",
      });
    } catch (error) {
      toast({ variant: "destructive", title: "Priority update failed", description: (error as Error).message });
    } finally {
      setPriorityUpdatingOrderId(null);
    }
  }, [deletingPlanKey, resettingAutopilot, runningAutopilot, runningPriorityReplan, setPriorityUpdatingOrderId, toast]);

  const handleDeletePlannedWork = useCallback(async (row: any) => {
    if (deletingPlanKey || runningAutopilot || runningPriorityReplan || resettingAutopilot || priorityUpdatingOrderId) return;
    if (row.status === "IN_PROGRESS") {
      toast({
        variant: "destructive",
        title: "Cannot delete in-progress plan",
        description: "Complete or pause the current step before deleting planned work.",
      });
      return;
    }

    const uniqueJobIds = Array.from(new Set((row.resetJobIds || []).filter(Boolean)));
    const uniquePlanDocIds = Array.from(new Set((row.resetPlanDocIds || []).filter(Boolean)));
    if (uniqueJobIds.length === 0 && uniquePlanDocIds.length === 0) {
      toast({ title: "No planned work found", description: "This row has no removable planned work." });
      return;
    }

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Delete planned work for Order ${row.orderNo} (${row.vasName})?\n\nThis will remove schedule and reset related jobs to WAITING.`
          );
    if (!confirmed) return;

    setDeletingPlanKey(row.key);
    try {
      const nowIso = new Date().toISOString();
      const ops = [
        ...uniquePlanDocIds.map((id) => ({ type: "deletePlan" as const, id })),
        ...uniqueJobIds.map((id) => ({ type: "resetJob" as const, id })),
      ];
      for (let i = 0; i < ops.length; i += 380) {
        const batch = writeBatch(db);
        ops.slice(i, i + 380).forEach((op) => {
          const docId = String(op.id || "").trim();
          if (!docId) return;
          if (op.type === "deletePlan") {
            batch.delete(doc(db, "plan", docId));
            return;
          }
          batch.set(
            doc(db, "jobs", docId),
            {
              status: "WAITING",
              plannedStart: deleteField(),
              plannedEnd: deleteField(),
              updatedAt: nowIso,
            },
            { merge: true }
          );
        });
        await batch.commit();
      }
      toast({
        title: "Planned work deleted",
        description: `Reset ${uniqueJobIds.length} step(s) and removed ${uniquePlanDocIds.length} plan record(s).`,
      });
    } catch (error) {
      toast({ variant: "destructive", title: "Delete planned work failed", description: (error as Error).message });
    } finally {
      setDeletingPlanKey(null);
    }
  }, [deletingPlanKey, priorityUpdatingOrderId, resettingAutopilot, runningAutopilot, runningPriorityReplan, setDeletingPlanKey, toast]);

  const handleOpenManualDoneDialog = useCallback((row: any) => {
    setManualDoneAllQtyReady("yes");
    setManualDoneRemainingQty("");
    setManualDoneReason("");
    setManualDoneDialog({
      open: true,
      row: {
        key: row.key,
        jobId: row.currentJobId,
        orderId: row.orderId,
        orderNo: row.orderNo,
        customer: row.customer,
        vasName: row.vasName,
        process: row.process,
        qty: Number.isFinite(Number(row.qty)) ? Number(row.qty) : 0,
        stepNo: row.currentStepNo,
        totalSteps: row.totalSteps,
        plannedStart: row.plannedStart,
        plannedEnd: row.plannedEnd,
      },
    });
  }, [setManualDoneAllQtyReady, setManualDoneDialog, setManualDoneReason, setManualDoneRemainingQty]);

  const handleCloseManualDoneDialog = useCallback(() => {
    if (manualDoneSaving) return;
    setManualDoneDialog({ open: false, row: null });
  }, [manualDoneSaving, setManualDoneDialog]);

  const handleSubmitManualDone = useCallback(async () => {
    if (!manualDoneDialog.row || manualDoneSaving) return;
    const row = manualDoneDialog.row;
    const totalQty = Number(row.qty || 0);
    const allQtyReady = manualDoneAllQtyReady === "yes";
    const parsedRemainingQty = Number(manualDoneRemainingQty || 0);
    const remainingQty = allQtyReady ? 0 : parsedRemainingQty;

    if (!allQtyReady) {
      if (!Number.isFinite(parsedRemainingQty) || parsedRemainingQty <= 0) {
        toast({ variant: "destructive", title: "Remaining qty required", description: "Enter a valid remaining qty when all qty is not ready." });
        return;
      }
      if (totalQty > 0 && parsedRemainingQty > totalQty) {
        toast({ variant: "destructive", title: "Remaining qty is too high", description: `Remaining qty cannot exceed total qty (${totalQty}).` });
        return;
      }
      if (!manualDoneReason.trim()) {
        toast({ variant: "destructive", title: "Reason required", description: "Please provide a reason for remaining qty." });
        return;
      }
    }

    setManualDoneSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const readyQty = totalQty > 0 ? Math.max(0, Number((totalQty - remainingQty).toFixed(2))) : undefined;
      const completionPayload = {
        mode: "MANUAL_LAST_STEP" as const,
        isAllQtyReady: allQtyReady,
        totalQty: totalQty > 0 ? totalQty : null,
        readyQty: readyQty ?? null,
        remainingQty: allQtyReady ? 0 : remainingQty,
        remainingReason: allQtyReady ? null : manualDoneReason.trim(),
        completedBy: {
          id: user?.id || null,
          name: user?.name || null,
          role: user?.role || null,
        },
        completedAt: nowIso,
      };

      const jobRef = doc(db, "jobs", row.jobId);
      const jobSnap = await getDoc(jobRef);
      const jobData = jobSnap.exists() ? (jobSnap.data() as any) : {};
      const actualStart =
        String(jobData?.actualStart || "").trim() ||
        String(jobData?.plannedStart || "").trim() ||
        row.plannedStart ||
        nowIso;

      await setDoc(
        jobRef,
        {
          status: "DONE",
          actualStart,
          actualEnd: nowIso,
          updatedAt: nowIso,
          manualCompletion: completionPayload,
          completionMeta: completionPayload,
        },
        { merge: true }
      );

      await addDoc(collection(db, "pmsManualCompletions"), {
        jobId: row.jobId,
        orderId: row.orderId,
        orderNo: row.orderNo,
        customer: row.customer,
        vasItem: row.vasName,
        process: row.process,
        stepNo: row.stepNo || null,
        totalSteps: row.totalSteps || null,
        ...completionPayload,
        createdAt: nowIso,
      });

      await fetch("/api/pms/autoAdvance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      toast({
        title: "Step marked complete",
        description: allQtyReady
          ? "Final step completed with full qty."
          : "Final step completed with remaining qty recorded.",
      });
      setManualDoneDialog({ open: false, row: null });
    } catch (error) {
      toast({ variant: "destructive", title: "Manual completion failed", description: (error as Error).message });
    } finally {
      setManualDoneSaving(false);
    }
  }, [
    manualDoneAllQtyReady,
    manualDoneDialog,
    manualDoneReason,
    manualDoneRemainingQty,
    manualDoneSaving,
    setManualDoneDialog,
    setManualDoneSaving,
    toast,
    user,
  ]);

  return {
    handleOpenRoutingSetup,
    handleCloseCreateJobDialog,
    prepareCreateJobEditor,
    handleOpenCreateJobDialog,
    handleSelectEmbellishmentRow,
    handleCreateJobDialogFieldChange,
    handleSaveEmbellishmentDetails,
    handleSubmitCreateJobs,
    handleResetAndRerunAutopilot,
    handleRunAutopilot,
    handleRunPriorityReplan,
    handleSetOrderEmergencyPriority,
    handleDeletePlannedWork,
    handleOpenManualDoneDialog,
    handleCloseManualDoneDialog,
    handleSubmitManualDone,
    persistEmbellishmentForRow,
    getValidatedEmbellishmentPayload,
  };
};
