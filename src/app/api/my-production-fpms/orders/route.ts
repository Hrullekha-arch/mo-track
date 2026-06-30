import { NextResponse } from "next/server";
import { productionOrders } from "@/lib/my-production-fpms-data";

export async function GET() {
  return NextResponse.json({
    success: true,
    count: productionOrders.length,
    orders: productionOrders,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  return NextResponse.json({
    success: true,
    message: "New customer form and bed measurement payload received.",
    received: body,
    nextStep: "Generate bed drawing and furniture drawing for SM review.",
  });
}
