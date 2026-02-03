import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { runAutopilot } from "@/lib/pms/autopilot";

const chunk = <T,>(items: T[], size: number) => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId = body?.orderId ? String(body.orderId) : null;

    // 1) Load WAITING jobs (optionally scoped to one order)
    const jobQuery = orderId
      ? adminDb.collection("jobs").where("orderId", "==", orderId).where("status", "==", "WAITING")
      : adminDb.collection("jobs").where("status", "==", "WAITING");

    const jobsSnap = await jobQuery.get();
    if (jobsSnap.empty) {
      return NextResponse.json({ success: true, planned: 0, message: "No waiting jobs." });
    }

    const waitingJobs = jobsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));

    // 2) Check invoiced orders only
    const orderIds = Array.from(new Set(waitingJobs.map((j) => j.orderId).filter(Boolean))) as string[];
    const invoicedOrderIds = new Set<string>();

    await Promise.all(
      orderIds.map(async (id) => {
        const snap = await adminDb.collection("orders").doc(id).get();
        if (!snap.exists) return;
        const data = snap.data() as any;

        const status = data?.invoicing?.status;
        const invoiceCount = Array.isArray(data?.invoicing?.invoices) ? data.invoicing.invoices.length : 0;
        const hasInvoice = Boolean((status && status !== "NOT_INVOICED") || invoiceCount > 0);

        if (hasInvoice) invoicedOrderIds.add(id);
      })
    );

    const eligibleWaiting = waitingJobs.filter((j) => invoicedOrderIds.has(j.orderId));
    if (eligibleWaiting.length === 0) {
      return NextResponse.json({
        success: true,
        planned: 0,
        message: "No waiting jobs for invoiced orders.",
      });
    }

    // 3) Load master data
    const [machinesSnap, skillsSnap, productsSnap, plansSnap, downtimeSnap] = await Promise.all([
      adminDb.collection("machines").where("active", "==", true).get(),
      adminDb.collection("machineSkills").where("allowed", "==", true).get(),
      adminDb.collection("products").get(),
      adminDb.collection("plan").get(),
      adminDb.collection("machineDowntime").get(),
    ]);

    // 4) For scheduling we need ALL jobs of those orders/groups (so chain works)
    const jobGroupIds = Array.from(new Set(eligibleWaiting.map((j) => j.jobGroupId).filter(Boolean))) as string[];

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

    // ensure eligible waiting included
    eligibleWaiting.forEach((j) => schedulingJobsMap.set(j.id, j));

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
        return {
          ...j,
          plannedStart: j.plannedStart || p?.plannedStart,
          plannedEnd: j.plannedEnd || p?.plannedEnd,
        };
      });

    // 5) order priority
    const orderPriorityMap: Record<string, number | undefined> = {};
    await Promise.all(
      Array.from(invoicedOrderIds).map(async (id) => {
        const snap = await adminDb.collection("orders").doc(id).get();
        if (snap.exists) orderPriorityMap[id] = (snap.data() as any)?.priority;
      })
    );

    // 6) Run autopilot
    const now = new Date().toISOString();
    const { planned, updatedJobs } = runAutopilot({
      jobs: schedulingJobs,
      machines: machinesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      skills: skillsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      products: productsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      plans: plansSnap.docs.map((d) => d.data() as any),
      downtimes: downtimeSnap.docs.map((d) => d.data() as any),
      orderPriorityMap,
      now,
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

    return NextResponse.json({ success: true, planned: planned.length });
  } catch (error) {
    console.error("PMS runAutopilot failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
