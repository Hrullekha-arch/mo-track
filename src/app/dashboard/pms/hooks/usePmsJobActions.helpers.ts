"use client";

import { doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CreateJobDialogRow, StoredEmbellishment } from "../types/pms";
import { isManualCompletionProcess } from "@/lib/pms/process-rules";
import { toNumber } from "../utils/pmsHelpers";

type ActionUser = {
  id?: string | null;
  name?: string | null;
  role?: string | null;
} | null | undefined;

type EmbellishmentFormState = {
  customerName: string;
  customerPhone: string;
  numberOfWindows: string;
  numberOfPanels: string;
  embellishmentBarcode: string;
  stitchingPerPanel: string;
  designTime: string;
  handWorkTime: string;
  hourlyCharge: string;
};

type EmbellishmentDialogState = {
  embellishmentEnabled: boolean;
  form: EmbellishmentFormState;
};

type EmbellishmentTotals = {
  totalHours: number;
  totalMinutes: number;
  chargeAmount: number;
};

export async function startPmsForRowRequest(
  row: CreateJobDialogRow,
  embellishment?: StoredEmbellishment
) {
  const qty = Number(row.qty) || 1;
  const createRes = await fetch("/api/pms/createOrder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: row.orderId,
      productId: row.matchedProductId,
      qty,
      embellishment,
    }),
  });
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok || !createData?.success) {
    throw new Error(createData?.message || "Failed to create PMS jobs.");
  }

  const runRes = await fetch("/api/pms/runAutopilot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: row.orderId }),
  });
  const runData = await runRes.json().catch(() => ({}));
  if (!runRes.ok || !runData?.success) {
    throw new Error(runData?.message || "PMS jobs were created, but scheduling failed.");
  }
}

export async function persistEmbellishmentRecord({
  row,
  embellishment,
  user,
}: {
  row: CreateJobDialogRow;
  embellishment: StoredEmbellishment;
  user: ActionUser;
}) {
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
}

export function validateEmbellishmentPayload(
  createJobDialog: EmbellishmentDialogState,
  createJobTotals: EmbellishmentTotals
): { payload?: StoredEmbellishment; error?: string; disabled?: boolean } {
  if (!createJobDialog.embellishmentEnabled) {
    return { disabled: true };
  }

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
    return {
      error:
        "Fill customer, windows, panels, barcode, stitching per panel, design time, hand work time, and hourly charge.",
    };
  }

  return {
    payload: {
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
    } satisfies StoredEmbellishment,
  };
}

export async function deleteDocsInChunks(refs: Array<ReturnType<typeof doc>>) {
  const chunkSize = 450;
  let deleted = 0;
  for (let index = 0; index < refs.length; index += chunkSize) {
    const batch = writeBatch(db);
    const chunk = refs.slice(index, index + chunkSize);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

export function buildManualDoneDialogRow(row: any) {
  return {
    key: row.key,
    jobId: row.currentJobId,
    orderId: row.orderId,
    orderNo: row.orderNo,
    customer: row.customer,
    smName: row.smName,
    vasName: row.vasName,
    process: row.process,
    person: row.person,
    qty: Number.isFinite(Number(row.qty)) ? Number(row.qty) : 0,
    stepNo: row.currentStepNo,
    totalSteps: row.totalSteps,
    isFinalStep: Boolean(row.isFinalStep),
    isManualCompletionStep: isManualCompletionProcess(row.process),
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    nextProcess: row.nextProcess,
    nextPerson: row.nextPerson,
    nextMachine: row.nextMachine,
    nextPlannedStart: row.nextPlannedStart,
    nextPlannedEnd: row.nextPlannedEnd,
  };
}
