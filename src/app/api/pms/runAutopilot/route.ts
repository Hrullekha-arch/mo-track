// @ts-nocheck
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { runAutopilot } from "@/lib/pms/autopilot";

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

const isOrderClosedForPms = (order?: any) => {
  if (!order) return false;
  const workflowStatus = String(order?.workflow?.status || "").trim().toUpperCase();
  if (workflowStatus === "COMPLETED" || workflowStatus === "CANCELLED") return true;
  const status = String(order?.status || "").trim().toUpperCase();
  return status === "INSTALLATION DONE" || status === "COMPLETED" || status === "CANCELLED";
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

    // 2) Check invoiced orders only
    const orderIds = Array.from(new Set(candidateJobs.map((j) => j.orderId).filter(Boolean))) as string[];
    const orderDataById = await getOrdersByIds(orderIds);
    const invoicedOrderIds = new Set<string>();

    orderDataById.forEach((data, id) => {
      if (isOrderClosedForPms(data)) return;
      if (data?.invoicing?.invoiceRequired === false) {
        invoicedOrderIds.add(id);
        return;
      }
      const status = data?.invoicing?.status;
      const invoiceCount = Array.isArray(data?.invoicing?.invoices)
        ? data.invoicing.invoices.length
        : 0;
      const hasInvoice = Boolean((status && status !== "NOT_INVOICED") || invoiceCount > 0);
      if (hasInvoice) invoicedOrderIds.add(id);
    });

    const eligibleJobs = candidateJobs.filter((job) => invoicedOrderIds.has(job.orderId));
    if (eligibleJobs.length === 0) {
      return NextResponse.json({
        success: true,
        planned: 0,
        message: includePlanned
          ? "No waiting/planned jobs for invoiced orders."
          : "No waiting jobs for invoiced orders.",
      });
    }

    // 3) Load master data
    const [
      machinesSnap,
      skillsSnap,
      peopleSnap,
      productsSnap,
      plansSnap,
      downtimeSnap,
      workingHoursSnap,
    ] = await Promise.all([
      adminDb.collection("machines").where("active", "==", true).get(),
      adminDb.collection("machineSkills").where("allowed", "==", true).get(),
      adminDb.collection("people").get(),
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
    const planByJobId = new Map<string, any>();
    plansSnap.docs.forEach((doc) => {
      const data = doc.data() as any;
      if (data?.jobId) planByJobId.set(data.jobId, data);
    });

    const schedulingJobs = Array.from(schedulingJobsMap.values())
      .filter((j) => invoicedOrderIds.has(j.orderId))
      .map((j) => {
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
    Array.from(invoicedOrderIds).forEach((id) => {
      orderPriorityMap[id] = orderDataById.get(id)?.priority;
    });

    // 6) Run autopilot
    const now = new Date().toISOString();
    const { planned, updatedJobs } = runAutopilot({
      jobs: schedulingJobs,
      machines: machinesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      skills: skillsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      peopleById: Object.fromEntries(
        peopleSnap.docs.map((d) => [d.id, { id: d.id, ...(d.data() as any) }])
      ),
      products: productsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      plans: plansSnap.docs.map((d) => d.data() as any),
      downtimes: downtimeSnap.docs.map((d) => d.data() as any),
      orderPriorityMap,
      now,
      workingHours,
    });

    // 7) Save: one plan per jobId
    const batch = adminDb.batch();

    planned.forEach((plan) => {
      const planRef = adminDb.collection("plan").doc(plan.jobId);
      batch.set(
        planRef,
        {
          ...plan,
          id: planRef.id,
          updatedAt: now,
          createdAt: plan.createdAt || now,
        },
        { merge: true }
      );
    });

    updatedJobs.forEach((job) => {
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
