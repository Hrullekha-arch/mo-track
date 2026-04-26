import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { runAutopilot } from "@/lib/pms/autopilot";
import { getCanonicalPlans } from "@/lib/pms/plan-utils";

const IST_TIMEZONE_OFFSET_MINUTES = 330;

const chunk = <T,>(items: T[], size: number) => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
};

const getOrdersByIds = async (ids: string[]) => {
  const orderMap = new Map<string, any>();
  if (ids.length === 0) return orderMap;

  const refs = ids.map((id) => adminDb.collection("orders").doc(id));
  for (const batchRefs of chunk(refs, 400)) {
    const docs = await adminDb.getAll(...batchRefs);
    docs.forEach((doc) => {
      if (doc.exists) {
        orderMap.set(doc.id, doc.data() as any);
      }
    });
  }
  return orderMap;
};

const commitPlanMaintenance = async (
  plans: any[],
  stalePlanIds: string[],
  now: string,
  resetPlanJobIds: string[] = []
) => {
  const resetPlanJobIdSet = new Set(resetPlanJobIds.map((id) => String(id || "").trim()).filter(Boolean));
  const upsertPlanOps = plans.filter((plan) => {
    const jobId = String(plan?.jobId || "").trim();
    if (!jobId) return false;
    return !resetPlanJobIdSet.has(jobId);
  });
  for (let i = 0; i < upsertPlanOps.length; i += 350) {
    const batch = adminDb.batch();
    upsertPlanOps.slice(i, i + 350).forEach((plan) => {
      const jobId = String(plan.jobId || "").trim();
      if (!jobId) return;
      const planRef = adminDb.collection("plan").doc(jobId);
      batch.set(
        planRef,
        {
          ...plan,
          id: planRef.id,
          jobId,
          updatedAt: plan?.updatedAt || now,
          createdAt: plan?.createdAt || now,
        },
        { merge: true }
      );
    });
    await batch.commit();
  }

  const planIdsToDelete = Array.from(
    new Set([
      ...stalePlanIds,
      ...Array.from(resetPlanJobIdSet),
    ])
  );

  for (let i = 0; i < planIdsToDelete.length; i += 350) {
    const batch = adminDb.batch();
    planIdsToDelete.slice(i, i + 350).forEach((planId) => {
      const cleanId = String(planId || "").trim();
      if (!cleanId) return;
      batch.delete(adminDb.collection("plan").doc(cleanId));
    });
    await batch.commit();
  }
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsedOrderId = body?.orderId ? String(body.orderId).trim() : "";
    const orderId = parsedOrderId || null;
    const includePlanned =
      body?.includePlanned === true ||
      body?.includePlanned === "true" ||
      Number(body?.includePlanned) === 1;

    // 1) Load candidate jobs (optionally scoped to one order)
    const jobQuery = orderId
      ? adminDb.collection("jobs").where("orderId", "==", orderId)
      : includePlanned
      ? adminDb.collection("jobs").where("status", "in", ["WAITING", "PLANNED"])
      : adminDb.collection("jobs").where("status", "==", "WAITING");

    const jobsSnap = await jobQuery.get();
    if (jobsSnap.empty) {
      return NextResponse.json({
        success: true,
        planned: 0,
        message: includePlanned ? "No waiting/planned jobs." : "No waiting jobs.",
      });
    }

    const candidateJobs = jobsSnap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
      .filter((job) => {
        const status = String(job?.status || "").toUpperCase();
        if (includePlanned) return status === "WAITING" || status === "PLANNED";
        return status === "WAITING";
      });

    if (candidateJobs.length === 0) {
      return NextResponse.json({
        success: true,
        planned: 0,
        message: includePlanned ? "No waiting/planned jobs." : "No waiting jobs.",
      });
    }

    // 2) Existing PMS jobs remain schedulable as long as active jobs still exist.
    // New PMS job creation/start is still gated in createOrder.
    const orderIds = Array.from(new Set(candidateJobs.map((j) => j.orderId).filter(Boolean))) as string[];
    const orderDataById = await getOrdersByIds(orderIds);
    const schedulableOrderIds = new Set<string>();

    orderDataById.forEach((data, id) => {
      schedulableOrderIds.add(id);
    });

    const eligibleJobs = candidateJobs.filter((job) => schedulableOrderIds.has(job.orderId));
    if (eligibleJobs.length === 0) {
      return NextResponse.json({
        success: true,
        planned: 0,
        message: includePlanned ? "No waiting/planned jobs found." : "No waiting jobs found.",
      });
    }

    // 3) Load master data
    const [
      machinesSnap,
      peopleSnap,
      skillsSnap,
      productsSnap,
      plansSnap,
      downtimeSnap,
      workingHoursSnap,
    ] = await Promise.all([
      adminDb.collection("machines").where("active", "==", true).get(),
      adminDb.collection("people").get(),
      adminDb.collection("machineSkills").where("allowed", "==", true).get(),
      adminDb.collection("products").get(),
      adminDb.collection("plan").get(),
      adminDb.collection("machineDowntime").get(),
      adminDb.collection("pmsSettings").doc("workingHours").get(),
    ]);

    const workingHoursData = workingHoursSnap.exists ? (workingHoursSnap.data() as any) : {};
    const workingHours = {
      startTime: String(workingHoursData?.startTime || "10:00"),
      endTime: String(workingHoursData?.endTime || "20:00"),
      timezoneOffsetMinutes: IST_TIMEZONE_OFFSET_MINUTES,
    };

    // 4) For scheduling we need ALL jobs of those orders/groups (so chain works)
    const jobGroupIds = Array.from(
      new Set(eligibleJobs.map((job) => job.jobGroupId).filter(Boolean))
    ) as string[];

    const allPlans = plansSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
    const {
      plans: canonicalPlans,
      canonicalByJobId,
      stalePlanIds,
    } = getCanonicalPlans(allPlans);

    const schedulingJobsMap = new Map<string, any>();

    // fetch jobs by jobGroupId
    for (const batchIds of chunk(jobGroupIds, 10)) {
      const snap = await adminDb.collection("jobs").where("jobGroupId", "in", batchIds).get();
      snap.docs.forEach((doc) => schedulingJobsMap.set(doc.id, { id: doc.id, ...(doc.data() as any) }));
    }

    // fetch jobs by orderId (for cases without jobGroupId)
    for (const batchIds of chunk(orderIds, 10)) {
      const snap = await adminDb.collection("jobs").where("orderId", "in", batchIds).get();
      snap.docs.forEach((doc) => schedulingJobsMap.set(doc.id, { id: doc.id, ...(doc.data() as any) }));
    }

    // ensure eligible jobs included
    eligibleJobs.forEach((job) => schedulingJobsMap.set(job.id, job));

    // merge plannedStart/End from plan docs
    const planByJobId = canonicalByJobId;

    const schedulingCandidates = Array.from(schedulingJobsMap.values()).filter((j) =>
      schedulableOrderIds.has(j.orderId)
    );
    const resetPlanJobIds = Array.from(
      new Set(
        schedulingCandidates
          .filter((job) => {
            const rawStatus = String(job.status || "").toUpperCase();
            return rawStatus === "WAITING" || (includePlanned && rawStatus === "PLANNED");
          })
          .map((job) => String(job.id || "").trim())
          .filter(Boolean)
      )
    );

    const schedulingJobs = schedulingCandidates.map((j) => {
        const p = planByJobId.get(j.id);
        const rawStatus = String(j.status || "").toUpperCase();
        const normalizedStatus = includePlanned && rawStatus === "PLANNED" ? "WAITING" : j.status;
        const shouldResetPlanFields =
          includePlanned && (rawStatus === "PLANNED" || rawStatus === "WAITING");
        return {
          ...j,
          status: normalizedStatus,
          plannedStart: shouldResetPlanFields ? undefined : j.plannedStart || p?.plannedStart,
          plannedEnd: shouldResetPlanFields ? undefined : j.plannedEnd || p?.plannedEnd,
        };
      });

    // 5) order priority
    const orderPriorityMap: Record<string, number | undefined> = {};
    Array.from(schedulableOrderIds).forEach((id) => {
      orderPriorityMap[id] = orderDataById.get(id)?.priority;
    });

    // 6) Run autopilot
    const now = new Date().toISOString();
    const { planned, updatedJobs } = runAutopilot({
      jobs: schedulingJobs,
      machines: machinesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      skills: skillsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      products: productsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      peopleById: Object.fromEntries(
        peopleSnap.docs.map((doc) => [doc.id, { id: doc.id, ...(doc.data() as any) }])
      ),
      plans: canonicalPlans,
      downtimes: downtimeSnap.docs.map((d) => d.data() as any),
      orderPriorityMap,
      now,
      workingHours,
    });

    await commitPlanMaintenance(canonicalPlans, stalePlanIds, now, resetPlanJobIds);

    for (let i = 0; i < planned.length; i += 350) {
      const batch = adminDb.batch();
      planned.slice(i, i + 350).forEach((plan) => {
        const planRef = adminDb.collection("plan").doc(plan.jobId);
        batch.set(
          planRef,
          {
            ...plan,
            id: planRef.id,
            jobId: plan.jobId,
            updatedAt: now,
            createdAt: plan.createdAt || now,
          },
          { merge: true }
        );
      });
      await batch.commit();
    }

    for (let i = 0; i < updatedJobs.length; i += 350) {
      const batch = adminDb.batch();
      updatedJobs.slice(i, i + 350).forEach((job) => {
        const jobRef = adminDb.collection("jobs").doc(job.id);
        batch.set(
          jobRef,
          {
            status: job.status,
            plannedStart: job.plannedStart,
            plannedEnd: job.plannedEnd,
            updatedAt: now,
          },
          { merge: true }
        );
      });
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      planned: planned.length,
      mode: includePlanned ? "replan" : "waiting-only",
    });
  } catch (error) {
    console.error("PMS runAutopilot failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
