import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { runAutopilot } from "@/lib/pms/autopilot";

const minutesBetween = (start?: string, end?: string) => {
  if (!start || !end) return 0;
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.ceil((to - from) / 60000));
};

const normalizeIso = (value?: any) => {
  if (!value) return undefined;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "object") {
    if (typeof value.toMillis === "function") {
      const millis = value.toMillis();
      if (Number.isFinite(millis)) return new Date(millis).toISOString();
    }
    if (typeof value.toDate === "function") {
      const date = value.toDate();
      if (date instanceof Date && Number.isFinite(date.getTime())) return date.toISOString();
    }
  }
  return undefined;
};

const toMillis = (value?: any) => {
  const iso = normalizeIso(value);
  if (!iso) return undefined;
  const millis = new Date(iso).getTime();
  return Number.isFinite(millis) ? millis : undefined;
};

const chunk = <T,>(items: T[], size: number) => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

export async function POST() {
  try {
    const now = new Date().toISOString();
    const nowMs = new Date(now).getTime();

    const plannedSnap = await adminDb
      .collection("jobs")
      .where("status", "==", "PLANNED")
      .get();

    const plannedJobs = plannedSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
    const planByJob = new Map<
      string,
      { plannedStart?: string; plannedEnd?: string }
    >();
    const jobIds = plannedJobs.map((job) => job.id).filter(Boolean);
    if (jobIds.length > 0) {
      for (const batchIds of chunk(jobIds, 10)) {
        const planSnap = await adminDb
          .collection("plan")
          .where("jobId", "in", batchIds)
          .get();
        planSnap.docs.forEach((doc) => {
          const data = doc.data() as any;
          if (!data?.jobId) return;
          const candidate = {
            plannedStart: normalizeIso(data.plannedStart),
            plannedEnd: normalizeIso(data.plannedEnd),
          };
          const candidateTime = toMillis(candidate.plannedEnd || candidate.plannedStart);
          if (!candidateTime) return;
          const existing = planByJob.get(data.jobId);
          const existingTime = toMillis(existing?.plannedEnd || existing?.plannedStart);
          if (!existing || !existingTime || candidateTime >= existingTime) {
            planByJob.set(data.jobId, candidate);
          }
        });
      }
    }

    const plannedDueJobs = plannedJobs.filter((job) => {
      const plannedEnd = normalizeIso(job.plannedEnd) || planByJob.get(job.id)?.plannedEnd;
      const endMs = toMillis(plannedEnd);
      return endMs !== undefined && endMs <= nowMs;
    });

    let eligiblePlannedJobs: typeof plannedJobs = [];
    if (plannedDueJobs.length > 0) {
      const plannedOrderIds = Array.from(
        new Set(plannedDueJobs.map((job) => job.orderId).filter(Boolean))
      );
      const invoicedOrderIds = new Set<string>();
      await Promise.all(
        plannedOrderIds.map(async (id) => {
          const snap = await adminDb.collection("orders").doc(id).get();
          if (!snap.exists) return;
          const data = snap.data() as any;
          const status = data?.invoicing?.status;
          const invoiceCount = Array.isArray(data?.invoicing?.invoices)
            ? data.invoicing.invoices.length
            : 0;
          const hasInvoice = Boolean((status && status !== "NOT_INVOICED") || invoiceCount > 0);
          if (hasInvoice) invoicedOrderIds.add(id);
        })
      );

      eligiblePlannedJobs = plannedDueJobs.filter((job) => invoicedOrderIds.has(job.orderId));
    }

    if (eligiblePlannedJobs.length > 0) {
      const batch = adminDb.batch();
      eligiblePlannedJobs.forEach((job) => {
        const jobRef = adminDb.collection("jobs").doc(job.id);
        const plan = planByJob.get(job.id);
        const plannedStart = normalizeIso(job.plannedStart) || plan?.plannedStart;
        const plannedEnd = normalizeIso(job.plannedEnd) || plan?.plannedEnd;
        const actualStart = normalizeIso(job.actualStart) || plannedStart || now;
        const actualEnd = plannedEnd || normalizeIso(job.actualEnd) || now;
        const actualMinutes = minutesBetween(actualStart, actualEnd);
        const plannedMinutes = Number(job.requiredMinutes || 0);
        const varianceMinutes = actualMinutes - plannedMinutes;

        const updatePayload: Record<string, unknown> = {
          status: "DONE",
          actualEnd,
          actualMinutes,
          varianceMinutes,
          updatedAt: now,
        };
        if (!job.actualStart && actualStart) updatePayload.actualStart = actualStart;
        if (plannedStart) updatePayload.plannedStart = plannedStart;
        if (plannedEnd) updatePayload.plannedEnd = plannedEnd;

        batch.set(jobRef, updatePayload, { merge: true });
      });
      await batch.commit();
    }

    const waitingJobsSnap = await adminDb.collection("jobs").where("status", "==", "WAITING").get();
    const waitingJobs = waitingJobsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));

    let plannedCount = 0;
    if (waitingJobs.length > 0) {
      const machinesSnap = await adminDb.collection("machines").where("active", "==", true).get();
      const skillsSnap = await adminDb.collection("machineSkills").where("allowed", "==", true).get();
      const productsSnap = await adminDb.collection("products").get();
      const plansSnap = await adminDb.collection("plan").get();
      const downtimeSnap = await adminDb.collection("machineDowntime").get();

      const waitingOrderIds = Array.from(new Set(waitingJobs.map((job) => job.orderId).filter(Boolean)));
      const waitingInvoicedOrderIds = new Set<string>();
      await Promise.all(
        waitingOrderIds.map(async (id) => {
          const snap = await adminDb.collection("orders").doc(id).get();
          if (!snap.exists) return;
          const data = snap.data() as any;
          const status = data?.invoicing?.status;
          const invoiceCount = Array.isArray(data?.invoicing?.invoices)
            ? data.invoicing.invoices.length
            : 0;
          const hasInvoice = Boolean((status && status !== "NOT_INVOICED") || invoiceCount > 0);
          if (hasInvoice) waitingInvoicedOrderIds.add(id);
        })
      );

      const eligibleWaitingJobs = waitingJobs.filter((job) => waitingInvoicedOrderIds.has(job.orderId));
      if (eligibleWaitingJobs.length === 0) {
        return NextResponse.json({
          success: true,
          completed: eligiblePlannedJobs.length,
          planned: 0,
        });
      }

      const orderPriorityMap: Record<string, number | undefined> = {};
      await Promise.all(
        Array.from(waitingInvoicedOrderIds).map(async (id) => {
          const snap = await adminDb.collection("orders").doc(id).get();
          if (snap.exists) {
            orderPriorityMap[id] = snap.data()?.priority;
          }
        })
      );

      const jobGroupIds = Array.from(
        new Set(eligibleWaitingJobs.map((job) => job.jobGroupId).filter(Boolean))
      ) as string[];
      const orderIds = Array.from(
        new Set(
          eligibleWaitingJobs
            .filter((job) => !job.jobGroupId)
            .map((job) => job.orderId)
            .filter(Boolean)
        )
      ) as string[];

      const schedulingJobsMap = new Map<string, any>();
      for (const batchIds of chunk(jobGroupIds, 10)) {
        const snap = await adminDb.collection("jobs").where("jobGroupId", "in", batchIds).get();
        snap.docs.forEach((doc) => schedulingJobsMap.set(doc.id, { id: doc.id, ...(doc.data() as any) }));
      }
      for (const batchIds of chunk(orderIds, 10)) {
        const snap = await adminDb.collection("jobs").where("orderId", "in", batchIds).get();
        snap.docs.forEach((doc) => schedulingJobsMap.set(doc.id, { id: doc.id, ...(doc.data() as any) }));
      }
      eligibleWaitingJobs.forEach((job) => schedulingJobsMap.set(job.id, job));

      const planByJobId = new Map<string, any>();
      plansSnap.docs.forEach((doc) => {
        const data = doc.data() as any;
        if (data?.jobId) planByJobId.set(data.jobId, data);
      });

      const schedulingJobs = Array.from(schedulingJobsMap.values())
        .filter((job) => waitingInvoicedOrderIds.has(job.orderId))
        .map((job) => {
          const plan = planByJobId.get(job.id);
          return {
            ...job,
            plannedStart: job.plannedStart || plan?.plannedStart,
            plannedEnd: job.plannedEnd || plan?.plannedEnd,
          };
        });

      const { planned, updatedJobs } = runAutopilot({
        jobs: schedulingJobs,
        machines: machinesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
        skills: skillsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
        products: productsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
        plans: plansSnap.docs.map((doc) => doc.data() as any),
        downtimes: downtimeSnap.docs.map((doc) => doc.data() as any),
        orderPriorityMap,
        now,
      });

      plannedCount = planned.length;
      if (planned.length > 0 || updatedJobs.length > 0) {
        const batch = adminDb.batch();
        planned.forEach((planEntry) => {
          const planRef = adminDb.collection("plan").doc();
          batch.set(planRef, { ...planEntry, id: planRef.id, createdAt: now }, { merge: true });
        });
        updatedJobs.forEach((updated) => {
          const updatedRef = adminDb.collection("jobs").doc(updated.id);
          batch.set(
            updatedRef,
            {
              status: updated.status,
              plannedStart: updated.plannedStart,
              plannedEnd: updated.plannedEnd,
              updatedAt: now,
            },
            { merge: true }
          );
        });
        await batch.commit();
      }
    }

    return NextResponse.json({
      success: true,
      completed: eligiblePlannedJobs.length,
      planned: plannedCount,
    });
  } catch (error) {
    console.error("PMS autoAdvance failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
