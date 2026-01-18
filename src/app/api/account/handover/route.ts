"use server";

import { NextRequest, NextResponse } from "next/server";
import {
  requestHandoverAndBackupAction,
  getSalesmenForCrmAction,
  getBackupOwnersAction,
  updateAccountPreferencesAction,
  getPendingHandoversForUserAction,
  acceptHandoverRequestAction,
  rejectHandoverRequestAction,
} from "@/app/dashboard/account/actions";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode");

  try {
    if (mode === "pending") {
      const toOwnerId = searchParams.get("toOwnerId") || "";
      const data = await getPendingHandoversForUserAction(toOwnerId);
      return NextResponse.json({ success: true, data });
    }
    if (mode === "salesmen") {
      const crmUserId = searchParams.get("crmUserId") || "";
      const data = await getSalesmenForCrmAction(crmUserId);
      return NextResponse.json({ success: true, data });
    }
    if (mode === "backup") {
      const role = searchParams.get("role") || "";
      const designation = searchParams.get("designation") || undefined;
      const data = await getBackupOwnersAction(role, designation);
      return NextResponse.json({ success: true, data });
    }
    return NextResponse.json({ success: false, message: "Invalid mode" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const mode = body?.mode;
  try {
    if (mode === "request") {
      const result = await requestHandoverAndBackupAction(body.payload);
      return NextResponse.json(result);
    }
    if (mode === "accept") {
      const result = await acceptHandoverRequestAction(body.payload);
      return NextResponse.json(result);
    }
    if (mode === "reject") {
      const result = await rejectHandoverRequestAction(body.payload);
      return NextResponse.json(result);
    }
    if (mode === "prefs") {
      const result = await updateAccountPreferencesAction(body.payload);
      return NextResponse.json(result);
    }
    return NextResponse.json({ success: false, message: "Invalid mode" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Error" }, { status: 500 });
  }
}
