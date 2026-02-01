import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

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

    const planSnap = await adminDb.collection("plan").where("jobId", "==", jobId).limit(1).get();
    if (planSnap.empty) {
      return NextResponse.json(
        { success: false, message: "No plan assigned for this job." },
        { status: 400 }
      );
    }

    const plan = planSnap.docs[0].data() as any;
    const now = new Date().toISOString();

    const logRef = jobRef.collection("workLogs").doc();
    await logRef.set({
      id: logRef.id,
      jobId,
      type: "START",
      at: now,
      machineId: plan.machineId,
      personId: plan.personId,
    });

    await jobRef.set(
      {
        status: "IN_PROGRESS",
        actualStart: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, jobId });
  } catch (error) {
    console.error("PMS startJob failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
