import { NextResponse } from "next/server";
import { getOrderBomLines, getProductionOrder } from "@/lib/my-production-fpms-data";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const orderId = String(body.orderId || "");
  const order = getProductionOrder(orderId);

  if (!order) {
    return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
  }

  const lines = getOrderBomLines(orderId);
  const allAvailable = lines.length > 0 && lines.every((line) => line.available);

  return NextResponse.json({
    success: true,
    orderId,
    allItemsAvailable: allAvailable,
    bomReleased: allAvailable && order.furnitureDrawing.status === "approved",
    nextStep:
      allAvailable && order.furnitureDrawing.status === "approved"
        ? "Release workshop process."
        : "Wait for stock or drawing approval.",
  });
}
