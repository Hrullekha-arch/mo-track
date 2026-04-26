import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { runAutopilot } from "@/lib/pms/autopilot";
import { getCanonicalPlans } from "@/lib/pms/plan-utils";
import { simulateScheduleForOrder } from "@/lib/pms/simulator";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const jobId = String(body?.jobId || "").trim();
    const manualCompletion =
      body?.manualCompletion && typeof body.manualCompletion === "object"
        ? body.manualCompletion
        : undefined;
    const completedAt =
      typeof body?.completedAt === "string" && body.completedAt.trim()
        ? body.completedAt.trim()
        : new Date().toISOString();

    if (!jobId) {
      return NextResponse.json(
        { success: false, message: "jobId is required." },
        { status: 400 }
      );
    }

    const jobRef = adminDb.collection("jobs").doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) {
      return NextResponse.json(
        { success: false, message: "Job not found." },
        { status: 404 }
      );
    }

    const jobData = jobSnap.data() as any;
    const orderId = jobData.orderId;
    const now = completedAt;

    const planSnap = await adminDb.collection("plan").where("jobId", "==", jobId).get();
    const {
      plans: canonicalJobPlans,
      stalePlanIds: staleJobPlanIds,
    } = getCanonicalPlans(planSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })));
    const plan = canonicalJobPlans[0] || null;

    if (!plan && !manualCompletion) {
      return NextResponse.json(
        { success: false, message: "No plan assigned for this job." },
        { status: 400 }
      );
    }

    const actualStart =
      String(body?.actualStart || "").trim() ||
      jobData.actualStart ||
      jobData.plannedStart ||
      plan?.plannedStart ||
      now;
    const actualMinutes = Math.max(
      0,
      Math.ceil((new Date(now).getTime() - new Date(actualStart).getTime()) / 60000)
    );
    const plannedMinutes = Number(jobData.requiredMinutes || 0);
    const varianceMinutes = actualMinutes - plannedMinutes;

    const logRef = jobRef.collection("workLogs").doc();
    await logRef.set({
      id: logRef.id,
      jobId,
      type: manualCompletion ? "MANUAL_COMPLETE" : "COMPLETE",
      at: now,
      machineId: plan?.machineId,
      personId: plan?.personId,
    });

    await jobRef.set(
      {
        status: "DONE",
        actualStart,
        actualEnd: now,
        actualMinutes,
        varianceMinutes,
        updatedAt: now,
        ...(manualCompletion
          ? {
              manualCompletion,
              completionMeta: manualCompletion,
            }
          : {}),
      },
      { merge: true }
    );

    if (manualCompletion) {
      const manualLogRef = adminDb.collection("pmsManualCompletions").doc();
      await manualLogRef.set({
        id: manualLogRef.id,
        jobId,
        orderId: manualCompletion?.orderId || orderId || null,
        orderNo: manualCompletion?.orderNo || null,
        customer: manualCompletion?.customer || null,
        vasItem: manualCompletion?.vasItem || null,
        process: manualCompletion?.process || jobData?.process || null,
        stepNo: manualCompletion?.stepNo ?? jobData?.stepNo ?? null,
        totalSteps: manualCompletion?.totalSteps ?? null,
        ...manualCompletion,
        createdAt: now,
      });
    }

    if (plan) {
      await adminDb.collection("plan").doc(jobId).set(
        {
          ...plan,
          id: jobId,
          jobId,
          updatedAt: now,
          createdAt: plan?.createdAt || now,
        },
        { merge: true }
      );
    }

    if (staleJobPlanIds.length > 0) {
      for (let i = 0; i < staleJobPlanIds.length; i += 350) {
        const batch = adminDb.batch();
        staleJobPlanIds.slice(i, i + 350).forEach((planId) => {
          const cleanId = String(planId || "").trim();
          if (!cleanId) return;
          batch.delete(adminDb.collection("plan").doc(cleanId));
        });
        await batch.commit();
      }
    }

    // Reset future PLANNED steps in the same group to WAITING so autopilot
    // re-schedules them from the current time (not the stale pre-planned time).
    const jobGroupId = String(jobData.jobGroupId || "").trim();
    const currentStepNo = Number(jobData.stepNo || 0);
    if (jobGroupId && currentStepNo > 0) {
      const groupSnap = await adminDb
        .collection("jobs")
        .where("jobGroupId", "==", jobGroupId)
        .get();
      const resetBatch = adminDb.batch();
      let hasResets = false;
      groupSnap.docs.forEach((doc) => {
        const data = doc.data() as any;
        const stepNo = Number(data.stepNo || 0);
        if (stepNo > currentStepNo && String(data.status || "").toUpperCase() === "PLANNED") {
          resetBatch.set(doc.ref, { status: "WAITING", updatedAt: now }, { merge: true });
          resetBatch.delete(adminDb.collection("plan").doc(doc.id));
          hasResets = true;
        }
      });
      if (hasResets) await resetBatch.commit();
    }

    const waitingJobsSnap = await adminDb.collection("jobs").where("status", "==", "WAITING").get();
    const waitingJobs = waitingJobsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));

    if (waitingJobs.length > 0) {
      const machinesSnap = await adminDb.collection("machines").where("active", "==", true).get();
      const peopleSnap = await adminDb.collection("people").get();
      const skillsSnap = await adminDb.collection("machineSkills").where("allowed", "==", true).get();
      const productsSnap = await adminDb.collection("products").get();
      const plansSnap = await adminDb.collection("plan").get();
      const {
        plans: canonicalPlans,
        stalePlanIds,
      } = getCanonicalPlans(
        plansSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
      );
      const downtimeSnap = await adminDb.collection("machineDowntime").get();

      const orderIds = Array.from(
        new Set(waitingJobs.map((job: any) => job.orderId).filter(Boolean))
      ) as string[];
      const orderPriorityMap: Record<string, number | undefined> = {};
      await Promise.all(
        orderIds.map(async (id) => {
          const snap = await adminDb.collection("orders").doc(id).get();
          if (snap.exists) {
            orderPriorityMap[id] = snap.data()?.priority;
          }
        })
      );

      const { planned, updatedJobs } = runAutopilot({
        jobs: waitingJobs,
        machines: machinesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
        skills: skillsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
        products: productsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
        peopleById: Object.fromEntries(
          peopleSnap.docs.map((doc) => [doc.id, { id: doc.id, ...(doc.data() as any) }])
        ),
        plans: canonicalPlans,
        downtimes: downtimeSnap.docs.map((doc) => doc.data() as any),
        orderPriorityMap,
        now,
      });

      const resetPlanJobIds = Array.from(
        new Set(waitingJobs.map((job: any) => String(job.id || "").trim()).filter(Boolean))
      );

      const batch = adminDb.batch();
      Array.from(new Set([...stalePlanIds, ...resetPlanJobIds])).forEach((planId) => {
        const cleanId = String(planId || "").trim();
        if (!cleanId) return;
        batch.delete(adminDb.collection("plan").doc(cleanId));
      });
      planned.forEach((planEntry) => {
        const planRef = adminDb.collection("plan").doc(planEntry.jobId);
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

    if (orderId) {
      const jobsSnap = await adminDb.collection("jobs").where("orderId", "==", orderId).get();
      const jobs = jobsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
      const machinesSnap = await adminDb.collection("machines").where("active", "==", true).get();
      const peopleSnap = await adminDb.collection("people").get();
      const skillsSnap = await adminDb.collection("machineSkills").where("allowed", "==", true).get();
      const productsSnap = await adminDb.collection("products").get();
      const plansSnap = await adminDb.collection("plan").get();
      const canonicalPlans = getCanonicalPlans(
        plansSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
      ).plans as any[];
      const downtimeSnap = await adminDb.collection("machineDowntime").get();
      const orderSnap = await adminDb.collection("orders").doc(orderId).get();
      const priority = orderSnap.exists ? orderSnap.data()?.priority : undefined;

      const etaResult = simulateScheduleForOrder({
        orderId,
        jobs,
        machines: machinesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
        people: peopleSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
        skills: skillsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
        products: productsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
        plans: canonicalPlans,
        downtimes: downtimeSnap.docs.map((doc) => doc.data() as any),
        orderPriorityMap: { [orderId]: priority },
        now,
      });

      await adminDb.collection("orders").doc(orderId).set({ pmsEta: etaResult.eta }, { merge: true });
    }

    return NextResponse.json({ success: true, jobId });
  } catch (error) {
    console.error("PMS completeJob failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
