// /src/app/api/mobile/latest-selection/route.ts

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

function log(...args: any[]) {
  console.log("📘 [LATEST-SELECTION]", ...args);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");
    const dealId = searchParams.get("dealId");

    log("🔍 Incoming Params:", { customerId, dealId });

    if (!customerId || !dealId) {
      log("❌ Missing parameters");
      return NextResponse.json(
        { error: "customerId and dealId are required" },
        { status: 400 }
      );
    }

    const selectionRef = adminDb
      .collection("customers")
      .doc(customerId)
      .collection("deals")
      .doc(dealId)
      .collection("selections");

    // ⭐ Get by createdAt DESC
    const snapshot = await selectionRef
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      log("⚠ No selections found");
      return NextResponse.json({ latestSelectionId: null });
    }

    const latestDoc = snapshot.docs[0];
    log("🟢 Latest Selection:", latestDoc.id);

    return NextResponse.json({
      latestSelectionId: latestDoc.id,
      data: latestDoc.data(),
    });

  } catch (e: any) {
    log("❌ ERROR:", e.message);
    return NextResponse.json(
      { error: e.message || "Server error" },
      { status: 500 }
    );
  }
}
