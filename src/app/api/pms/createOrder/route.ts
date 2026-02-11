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
    const rawPriority = body?.priority;
    const priority =
      rawPriority !== undefined && Number.isFinite(Number(rawPriority))
        ? Number(rawPriority)
        : undefined;

    if (!orderId || !productId || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(
        { success: false, message: "orderId, productId, qty are required." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 }
      );
    }

    const orderDataSnapshot = orderSnap.data() as any;
    const invoicingStatus = orderDataSnapshot?.invoicing?.status;
    const invoiceCount = Array.isArray(orderDataSnapshot?.invoicing?.invoices)
      ? orderDataSnapshot.invoicing.invoices.length
      : 0;
    const hasInvoice = Boolean(
      (invoicingStatus && invoicingStatus !== "NOT_INVOICED") || invoiceCount > 0
    );
    if (!hasInvoice) {
      return NextResponse.json(
        { success: false, message: "Invoice not generated for this order yet." },
        { status: 400 }
      );
    }

    const orderData: Record<string, unknown> = {
      productId,
      qty,
      createdAt: now,
    };
    if (priority !== undefined) {
      orderData.priority = priority;
    }

    await orderRef.set(orderData, { merge: true });

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

    const [
      machinesSnap,
      skillsSnap,
      productsSnap,
      plansSnap,
      downtimeSnap,
      workingHoursSnap,
    ] = await Promise.all([
      adminDb.collection("machines").where("active", "==", true).get(),
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
      timezoneOffsetMinutes: Number.isFinite(Number(workingHoursData?.timezoneOffsetMinutes))
        ? Number(workingHoursData?.timezoneOffsetMinutes)
        : 0,
    };

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
      workingHours,
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
