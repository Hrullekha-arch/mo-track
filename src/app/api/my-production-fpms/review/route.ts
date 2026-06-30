import { NextResponse } from "next/server";
import { getProductionOrder } from "@/lib/my-production-fpms-data";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const orderId = String(body.orderId || "");
  const decision = String(body.decision || "pending");
  const order = getProductionOrder(orderId);

  if (!order) {
    return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    orderId,
    decision,
    barcode: decision === "approved" ? `BC-${order.orderNo.replace(/[^A-Z0-9]/gi, "")}` : null,
    nextStep:
      decision === "approved"
        ? "Check material availability and release BOM."
        : "Send furniture drawing back for correction.",
  });
}
