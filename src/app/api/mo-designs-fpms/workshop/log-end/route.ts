import { NextResponse } from "next/server";
import type { WorkshopLogEndInput } from "@/types";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<WorkshopLogEndInput>;
  const durationHours = Number(body.durationHours || 0);
  const labourRate = Number(body.labourRate || 0);
  const machineRate = Number(body.machineRate || 0);

  return NextResponse.json({
    success: true,
    message: "Workshop end log recorded and cost computed.",
    totals: {
      labourCost: durationHours * labourRate,
      machineCost: durationHours * machineRate,
      totalCost: durationHours * labourRate + durationHours * machineRate,
    },
    endedAt: new Date().toISOString(),
  });
}
