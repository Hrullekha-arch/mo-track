import { NextResponse } from "next/server";
import type { WorkshopLogStartInput } from "@/types";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<WorkshopLogStartInput>;

  return NextResponse.json({
    success: true,
    message: "Workshop start log mounted successfully.",
    mounted: {
      orderId: body.orderId || null,
      personId: body.personId || null,
      helperName: body.helperName || null,
      machineId: body.machineId || null,
      startedAt: new Date().toISOString(),
    },
  });
}
