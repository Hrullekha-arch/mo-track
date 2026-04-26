import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import {
  buildJobsFromRouting,
  EmbellishmentWorkPayload,
  hasEmbellishmentRoutingStep,
} from "@/lib/pms/routing";
import { simulateScheduleForOrder } from "@/lib/pms/simulator";
import { isOrderClosedForPms } from "@/app/dashboard/pms/utils/pmsHelpers";

const IST_TIMEZONE_OFFSET_MINUTES = 330;

const hasCompletedEmbellishment = (embellishment?: EmbellishmentWorkPayload) => {
  if (!embellishment?.enabled) return false;
  return Boolean(
    String(embellishment.customerName || "").trim() &&
      String(embellishment.customerPhone || "").trim() &&
      Number(embellishment.numberOfWindows || 0) > 0 &&
      Number(embellishment.numberOfPanels || 0) > 0 &&
      String(embellishment.embellishmentBarcode || "").trim() &&
      Number(embellishment.stitchingPerPanel || 0) > 0 &&
      Number(embellishment.hourlyCharge || 0) > 0 &&
      Number(embellishment.totalTime || 0) > 0
  );
};

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
    const rawEmbellishment = body?.embellishment;
    const embellishment: EmbellishmentWorkPayload | undefined =
      rawEmbellishment && typeof rawEmbellishment === "object"
        ? {
            enabled: Boolean(rawEmbellishment.enabled),
            customerName: String(rawEmbellishment.customerName || "").trim(),
            customerPhone: String(rawEmbellishment.customerPhone || "").trim(),
            numberOfWindows: Number(rawEmbellishment.numberOfWindows || 0),
            numberOfPanels: Number(rawEmbellishment.numberOfPanels || 0),
            embellishmentBarcode: String(rawEmbellishment.embellishmentBarcode || "").trim(),
            stitchingPerPanel: Number(rawEmbellishment.stitchingPerPanel || 0),
            designTime: Number(rawEmbellishment.designTime || 0),
            handWorkTime: Number(rawEmbellishment.handWorkTime || 0),
            totalHours: Number(rawEmbellishment.totalHours || 0),
            totalTime: Number(rawEmbellishment.totalTime || 0),
            hourlyCharge: Number(rawEmbellishment.hourlyCharge || 0),
            chargeAmount: Number(rawEmbellishment.chargeAmount || 0),
          }
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
    if (isOrderClosedForPms(orderDataSnapshot)) {
      return NextResponse.json(
        { success: false, message: "Order is already completed/cancelled for PMS." },
        { status: 400 }
      );
    }

    const routingSnap = await adminDb
      .collection("routing")
      .where("productId", "==", productId)
      .get();

    if (routingSnap.empty) {
      return NextResponse.json(
        { success: false, message: "Routing is not created for this PMS product yet." },
        { status: 400 }
      );
    }

    const routingSteps = routingSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    }));

    const requiresEmbellishment = hasEmbellishmentRoutingStep(routingSteps);
    if (requiresEmbellishment && !hasCompletedEmbellishment(embellishment)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "This PMS routing includes Embellishment work. Complete and save the Embellishment form before starting PMS.",
        },
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

    const jobs = buildJobsFromRouting(orderId, productId, qty, routingSteps, {
      priority,
      embellishment,
    });
    const batch = adminDb.batch();

    jobs.forEach((job) => {
      const jobRef = adminDb.collection("jobs").doc(job.id);
      batch.set(jobRef, { ...job, createdAt: now }, { merge: true });
    });

    await batch.commit();

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

    const etaResult = simulateScheduleForOrder({
      orderId,
      jobs: jobs.map((job) => ({ ...job })),
      machines: machinesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      people: peopleSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
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
