import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { runAutopilot } from "@/lib/pms/autopilot";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId = body?.orderId ? String(body.orderId) : null;

    const jobQuery = orderId
      ? adminDb.collection("jobs").where("orderId", "==", orderId).where("status", "==", "WAITING")
      : adminDb.collection("jobs").where("status", "==", "WAITING");
    const jobsSnap = await jobQuery.get();
    if (jobsSnap.empty) {
      return NextResponse.json({ success: true, planned: 0, message: "No waiting jobs." });
    }

    const jobs = jobsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
    const machinesSnap = await adminDb.collection("machines").where("active", "==", true).get();
    const skillsSnap = await adminDb.collection("machineSkills").where("allowed", "==", true).get();
    const productsSnap = await adminDb.collection("products").get();
    const plansSnap = await adminDb.collection("plan").get();
    const downtimeSnap = await adminDb.collection("machineDowntime").get();

    const orderIds = Array.from(new Set(jobs.map((job) => job.orderId)));
    const orderPriorityMap: Record<string, number | undefined> = {};
    await Promise.all(
      orderIds.map(async (id) => {
        const snap = await adminDb.collection("orders").doc(id).get();
        if (snap.exists) {
          orderPriorityMap[id] = snap.data()?.priority;
        }
      })
    );

    const now = new Date().toISOString();
    const { planned, updatedJobs } = runAutopilot({
      jobs,
      machines: machinesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      skills: skillsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      products: productsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      plans: plansSnap.docs.map((doc) => doc.data() as any),
      downtimes: downtimeSnap.docs.map((doc) => doc.data() as any),
      orderPriorityMap,
      now,
    });

    const batch = adminDb.batch();
    planned.forEach((plan) => {
      const planRef = adminDb.collection("plan").doc();
      batch.set(planRef, { ...plan, id: planRef.id, createdAt: now }, { merge: true });
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
    });
  } catch (error) {
    console.error("PMS runAutopilot failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
