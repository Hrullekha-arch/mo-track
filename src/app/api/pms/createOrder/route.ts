import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { buildJobsFromRouting } from "@/lib/pms/routing";
import { simulateScheduleForOrder } from "@/lib/pms/simulator";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const orderId = String(body?.orderId || "").trim();
    const productId = String(body?.productId || "").trim();
    const qty = Number(body?.qty || 0);
    const priority = body?.priority !== undefined ? Number(body.priority) : undefined;

    if (!orderId || !productId || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(
        { success: false, message: "orderId, productId, qty are required." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const orderRef = adminDb.collection("orders").doc(orderId);

    await orderRef.set(
      {
        productId,
        qty,
        priority,
        createdAt: now,
      },
      { merge: true }
    );

    const routingSnap = await adminDb
      .collection("routing")
      .where("productId", "==", productId)
      .get();

    if (routingSnap.empty) {
      return NextResponse.json(
        { success: false, message: "No routing found for product." },
        { status: 400 }
      );
    }

    const routingSteps = routingSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    }));

    const jobs = buildJobsFromRouting(orderId, productId, qty, routingSteps, priority);
    const batch = adminDb.batch();

    jobs.forEach((job) => {
      const jobRef = adminDb.collection("jobs").doc(job.id);
      batch.set(jobRef, { ...job, createdAt: now }, { merge: true });
    });

    await batch.commit();

    const machinesSnap = await adminDb.collection("machines").where("active", "==", true).get();
    const skillsSnap = await adminDb.collection("machineSkills").where("allowed", "==", true).get();
    const productsSnap = await adminDb.collection("products").get();
    const plansSnap = await adminDb.collection("plan").get();
    const downtimeSnap = await adminDb.collection("machineDowntime").get();

    const etaResult = simulateScheduleForOrder({
      orderId,
      jobs: jobs.map((job) => ({ ...job })),
      machines: machinesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      skills: skillsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      products: productsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      plans: plansSnap.docs.map((doc) => doc.data() as any),
      downtimes: downtimeSnap.docs.map((doc) => doc.data() as any),
      orderPriorityMap: { [orderId]: priority },
      now,
    });

    await orderRef.set({ pmsEta: etaResult.eta }, { merge: true });

    return NextResponse.json({
      success: true,
      orderId,
      eta: etaResult.eta,
      jobsCreated: jobs.length,
    });
  } catch (error) {
    console.error("PMS createOrder failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
