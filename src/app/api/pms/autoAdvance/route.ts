import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { runAutopilot } from "@/lib/pms/autopilot";

const IST_TIMEZONE_OFFSET_MINUTES = 330;

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

const getOrdersByIds = async (ids: string[]) => {
  const orderMap = new Map<string, any>();
  if (ids.length === 0) return orderMap;
  const refs = ids.map((id) => adminDb.collection("orders").doc(id));
  for (const batchRefs of chunk(refs, 400)) {
    const docs = await adminDb.getAll(...batchRefs);
    docs.forEach((doc) => {
      if (doc.exists) orderMap.set(doc.id, doc.data() as any);
    });
  }
  return orderMap;
};

const isOrderClosedForPms = (order?: any) => {
  if (!order) return false;
  const workflowStatus = String(order?.workflow?.status || "").trim().toUpperCase();
  if (workflowStatus === "COMPLETED" || workflowStatus === "CANCELLED") return true;
  const status = String(order?.status || "").trim().toUpperCase();
  return status === "INSTALLATION DONE" || status === "COMPLETED" || status === "CANCELLED";
};

const hasInvoiceForPms = (order?: any) => {
  if (!order || isOrderClosedForPms(order)) return false;
  const status = order?.invoicing?.status;
  const invoiceCount = Array.isArray(order?.invoicing?.invoices)
    ? order.invoicing.invoices.length
    : 0;
  return Boolean((status && status !== "NOT_INVOICED") || invoiceCount > 0);
};

export async function POST() {
  try {
    const now = new Date().toISOString();
    const nowMs = new Date(now).getTime();

    const [plannedSnap, inProgressSnap, routingSnap] = await Promise.all([
      adminDb.collection("jobs").where("status", "==", "PLANNED").get(),
      adminDb.collection("jobs").where("status", "==", "IN_PROGRESS").get(),
      adminDb.collection("routing").get(),
    ]);

    const plannedJobs = plannedSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
    const inProgressJobs = inProgressSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    }));
    const maxRouteStepByProduct = new Map<string, number>();
    routingSnap.docs.forEach((doc) => {
      const data = doc.data() as any;
      const productId = String(data?.productId || "").trim();
      const stepNo = Number(data?.stepNo || 0);
      if (!productId || !Number.isFinite(stepNo) || stepNo <= 0) return;
      maxRouteStepByProduct.set(
        productId,
        Math.max(maxRouteStepByProduct.get(productId) || 0, stepNo)
      );
    });
    const isFinalRouteStep = (job: any) => {
      const productId = String(job?.productId || "").trim();
      const stepNo = Number(job?.stepNo || 0);
      if (!productId || !Number.isFinite(stepNo) || stepNo <= 0) return false;
      const maxStep = Number(maxRouteStepByProduct.get(productId) || 0);
      if (!Number.isFinite(maxStep) || maxStep <= 0) return false;
      return stepNo >= maxStep;
    };

    const activeJobs = [...plannedJobs, ...inProgressJobs];
    const planByJob = new Map<
      string,
      { plannedStart?: string; plannedEnd?: string; machineId?: string; personId?: string }
    >();
    const jobIds = activeJobs.map((job) => job.id).filter(Boolean);
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
            machineId: data.machineId,
            personId: data.personId,
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

    const activeOrderIds = Array.from(
      new Set(activeJobs.map((job) => job.orderId).filter(Boolean))
    ) as string[];
    const activeOrderDataById = await getOrdersByIds(activeOrderIds);
    const invoicedOrderIds = new Set<string>();
    activeOrderDataById.forEach((data, id) => {
      if (hasInvoiceForPms(data)) invoicedOrderIds.add(id);
    });

    const getJobTiming = (job: any) => {
      const plan = planByJob.get(job.id);
      const plannedStart = normalizeIso(job.plannedStart) || plan?.plannedStart;
      const plannedEnd = normalizeIso(job.plannedEnd) || plan?.plannedEnd;
      return {
        job,
        plan,
        plannedStart,
        plannedEnd,
        plannedStartMs: toMillis(plannedStart),
        plannedEndMs: toMillis(plannedEnd),
      };
    };

    const completedInProgressJobs = inProgressJobs
      .map(getJobTiming)
      .filter(({ job, plannedEndMs }) => {
        if (!invoicedOrderIds.has(job.orderId)) return false;
        if (isFinalRouteStep(job)) return false;
        return plannedEndMs !== undefined && plannedEndMs <= nowMs;
      });

    const runningResourceLocks = inProgressJobs
      .map(getJobTiming)
      .filter(({ job, plannedEndMs }) => {
        if (!invoicedOrderIds.has(job.orderId)) return false;
        if (completedInProgressJobs.some((entry) => entry.job.id === job.id)) return false;
        return plannedEndMs === undefined || plannedEndMs > nowMs;
      })
      .map(({ job, plan, plannedEndMs }) => ({
        jobId: job.id as string,
        machineId: plan?.machineId as string | undefined,
        personId: plan?.personId as string | undefined,
        plannedEndMs: plannedEndMs as number,
      }));

    const promotedPlannedJobs: Array<{
      job: any;
      plannedStart?: string;
      plannedEnd?: string;
    }> = [];

    const readyPlannedJobs = plannedJobs
      .map(getJobTiming)
      .filter(({ job, plannedStartMs, plannedEndMs }) => {
        if (!invoicedOrderIds.has(job.orderId)) return false;
        if (plannedStartMs === undefined || plannedStartMs > nowMs) return false;
        if (plannedEndMs !== undefined && plannedEndMs <= nowMs) return false;
        return true;
      })
      .sort((a, b) => {
        const aStart = a.plannedStartMs ?? Number.MAX_SAFE_INTEGER;
        const bStart = b.plannedStartMs ?? Number.MAX_SAFE_INTEGER;
        if (aStart !== bStart) return aStart - bStart;
        const aEnd = a.plannedEndMs ?? Number.MAX_SAFE_INTEGER;
        const bEnd = b.plannedEndMs ?? Number.MAX_SAFE_INTEGER;
        return aEnd - bEnd;
      });

    for (const entry of readyPlannedJobs) {
      const machineId = entry.plan?.machineId;
      const personId = entry.plan?.personId;
      const hasConflict = runningResourceLocks.some((lock) => {
        const sameMachine = Boolean(machineId) && lock.machineId === machineId;
        const samePerson = Boolean(personId) && lock.personId === personId;
        return sameMachine || samePerson;
      });
      if (hasConflict) continue;
      promotedPlannedJobs.push({
        job: entry.job,
        plannedStart: entry.plannedStart,
        plannedEnd: entry.plannedEnd,
      });
      runningResourceLocks.push({
        jobId: String(entry.job.id),
        machineId,
        personId,
        plannedEndMs: entry.plannedEndMs ?? nowMs,
      });
    }

    if (completedInProgressJobs.length > 0 || promotedPlannedJobs.length > 0) {
      const batch = adminDb.batch();
      completedInProgressJobs.forEach(({ job, plannedStart, plannedEnd }) => {
        const jobRef = adminDb.collection("jobs").doc(job.id);
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
      promotedPlannedJobs.forEach(({ job, plannedStart, plannedEnd }) => {
        const jobRef = adminDb.collection("jobs").doc(job.id);
        const updatePayload: Record<string, unknown> = {
          status: "IN_PROGRESS",
          updatedAt: now,
        };
        if (!job.actualStart) updatePayload.actualStart = now;
        if (plannedStart) updatePayload.plannedStart = plannedStart;
        if (plannedEnd) updatePayload.plannedEnd = plannedEnd;
        batch.set(jobRef, updatePayload, { merge: true });
      });
      await batch.commit();
    }

    const queueJobsSnap = await adminDb
      .collection("jobs")
      .where("status", "in", ["WAITING", "PLANNED"])
      .get();
    const queueJobs = queueJobsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));

    let plannedCount = 0;
    if (queueJobs.length > 0) {
      const machinesSnap = await adminDb.collection("machines").where("active", "==", true).get();
      const skillsSnap = await adminDb.collection("machineSkills").where("allowed", "==", true).get();
      const productsSnap = await adminDb.collection("products").get();
      const plansSnap = await adminDb.collection("plan").get();
      const downtimeSnap = await adminDb.collection("machineDowntime").get();
      const workingHoursSnap = await adminDb.collection("pmsSettings").doc("workingHours").get();
      const workingHoursData = workingHoursSnap.exists ? (workingHoursSnap.data() as any) : {};

      const queueOrderIds = Array.from(
        new Set(queueJobs.map((job) => job.orderId).filter(Boolean))
      ) as string[];
      const queueOrderDataById = await getOrdersByIds(queueOrderIds);
      const queueSchedulableOrderIds = new Set<string>();
      queueOrderDataById.forEach((data, id) => {
        if (hasInvoiceForPms(data)) queueSchedulableOrderIds.add(id);
      });

      const eligibleQueueJobs = queueJobs.filter((job) => queueSchedulableOrderIds.has(job.orderId));
      if (eligibleQueueJobs.length === 0) {
        return NextResponse.json({
          success: true,
          completed: completedInProgressJobs.length,
          planned: 0,
        });
      }

      const orderPriorityMap: Record<string, number | undefined> = {};
      Array.from(queueSchedulableOrderIds).forEach((id) => {
        orderPriorityMap[id] = queueOrderDataById.get(id)?.priority;
      });

      const jobGroupIds = Array.from(
        new Set(eligibleQueueJobs.map((job) => job.jobGroupId).filter(Boolean))
      ) as string[];
      const orderIds = Array.from(
        new Set(
          eligibleQueueJobs
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
      eligibleQueueJobs.forEach((job) => schedulingJobsMap.set(job.id, job));
      inProgressJobs.forEach((job) => schedulingJobsMap.set(job.id, job));

      const planByJobId = new Map<string, any>();
      plansSnap.docs.forEach((doc) => {
        const data = doc.data() as any;
        if (data?.jobId) planByJobId.set(data.jobId, data);
      });

      const schedulingOrderIds = new Set(queueSchedulableOrderIds);
      inProgressJobs.forEach((job) => {
        if (job?.orderId) schedulingOrderIds.add(job.orderId);
      });

      const schedulingJobs = Array.from(schedulingJobsMap.values())
        .filter((job) => schedulingOrderIds.has(job.orderId))
        .map((job) => {
          const plan = planByJobId.get(job.id);
          const rawStatus = String(job.status || "").toUpperCase();
          const normalizedStatus = rawStatus === "PLANNED" ? "WAITING" : rawStatus;
          const shouldResetPlanFields = rawStatus === "PLANNED" || rawStatus === "WAITING";
          return {
            ...job,
            status: normalizedStatus,
            plannedStart: shouldResetPlanFields
              ? undefined
              : normalizeIso(job.plannedStart) || plan?.plannedStart,
            plannedEnd: shouldResetPlanFields
              ? undefined
              : normalizeIso(job.plannedEnd) || plan?.plannedEnd,
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
        workingHours: {
          startTime: String(workingHoursData?.startTime || "10:00"),
          endTime: String(workingHoursData?.endTime || "20:00"),
          timezoneOffsetMinutes: IST_TIMEZONE_OFFSET_MINUTES,
        },
      });

      plannedCount = planned.length;
      if (planned.length > 0 || updatedJobs.length > 0) {
        const batch = adminDb.batch();
        planned.forEach((planEntry) => {
          const planRef = adminDb.collection("plan").doc(planEntry.jobId);
          batch.set(
            planRef,
            {
              ...planEntry,
              id: planRef.id,
              updatedAt: now,
              createdAt: planEntry?.createdAt || now,
            },
            { merge: true }
          );
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
      completed: completedInProgressJobs.length,
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
