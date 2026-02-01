import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { runAutopilot } from "@/lib/pms/autopilot";
import { simulateScheduleForOrder } from "@/lib/pms/simulator";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const jobId = String(body?.jobId || "").trim();

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
    const now = new Date().toISOString();

    const planSnap = await adminDb.collection("plan").where("jobId", "==", jobId).limit(1).get();
    const plan = planSnap.empty ? null : (planSnap.docs[0].data() as any);

    const actualStart = jobData.actualStart || jobData.plannedStart || now;
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
      type: "COMPLETE",
      at: now,
      machineId: plan?.machineId,
      personId: plan?.personId,
    });

    await jobRef.set(
      {
        status: "DONE",
        actualEnd: now,
        actualMinutes,
        varianceMinutes,
        updatedAt: now,
      },
      { merge: true }
    );

    const waitingJobsSnap = await adminDb.collection("jobs").where("status", "==", "WAITING").get();
    const waitingJobs = waitingJobsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));

    if (waitingJobs.length > 0) {
      const machinesSnap = await adminDb.collection("machines").where("active", "==", true).get();
      const skillsSnap = await adminDb.collection("machineSkills").where("allowed", "==", true).get();
      const productsSnap = await adminDb.collection("products").get();
      const plansSnap = await adminDb.collection("plan").get();
      const downtimeSnap = await adminDb.collection("machineDowntime").get();

      const orderIds = Array.from(new Set(waitingJobs.map((job) => job.orderId)));
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
        plans: plansSnap.docs.map((doc) => doc.data() as any),
        downtimes: downtimeSnap.docs.map((doc) => doc.data() as any),
        orderPriorityMap,
        now,
      });

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

    if (orderId) {
      const jobsSnap = await adminDb.collection("jobs").where("orderId", "==", orderId).get();
      const jobs = jobsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
      const machinesSnap = await adminDb.collection("machines").where("active", "==", true).get();
      const skillsSnap = await adminDb.collection("machineSkills").where("allowed", "==", true).get();
      const productsSnap = await adminDb.collection("products").get();
      const plansSnap = await adminDb.collection("plan").get();
      const downtimeSnap = await adminDb.collection("machineDowntime").get();
      const orderSnap = await adminDb.collection("orders").doc(orderId).get();
      const priority = orderSnap.exists ? orderSnap.data()?.priority : undefined;

      const etaResult = simulateScheduleForOrder({
        orderId,
        jobs,
        machines: machinesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
        skills: skillsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
        products: productsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
        plans: plansSnap.docs.map((doc) => doc.data() as any),
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
