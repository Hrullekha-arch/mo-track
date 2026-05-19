// @ts-nocheck
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { simulateScheduleForOrder } from "@/lib/pms/simulator";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const orderId = String(body?.orderId || "").trim();
    if (!orderId) {
      return NextResponse.json(
        { success: false, message: "orderId is required." },
        { status: 400 }
      );
    }

    const orderSnap = await adminDb.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 }
      );
    }

    const orderData = orderSnap.data() || {};
    const priority = orderData.priority;

    const jobsSnap = await adminDb.collection("jobs").where("orderId", "==", orderId).get();
    const jobs = jobsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));

    const machinesSnap = await adminDb.collection("machines").where("active", "==", true).get();
    const peopleSnap = await adminDb.collection("people").get();
    const skillsSnap = await adminDb.collection("machineSkills").where("allowed", "==", true).get();
    const peopleSnap = await adminDb.collection("people").get();
    const productsSnap = await adminDb.collection("products").get();
    const plansSnap = await adminDb.collection("plan").get();
    const downtimeSnap = await adminDb.collection("machineDowntime").get();

    const now = new Date().toISOString();
    const etaResult = simulateScheduleForOrder({
      orderId,
      jobs,
      machines: machinesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      people: peopleSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      skills: skillsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      people: peopleSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      products: productsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      plans: plansSnap.docs.map((doc) => doc.data() as any),
      downtimes: downtimeSnap.docs.map((doc) => doc.data() as any),
      orderPriorityMap: { [orderId]: priority },
      now,
    });

    await adminDb.collection("orders").doc(orderId).set({ pmsEta: etaResult.eta }, { merge: true });

    return NextResponse.json({ success: true, orderId, eta: etaResult.eta });
  } catch (error) {
    console.error("PMS simulateETA failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
