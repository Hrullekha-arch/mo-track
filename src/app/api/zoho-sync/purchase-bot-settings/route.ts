import { NextRequest, NextResponse } from "next/server";
import {
  authenticateApiUser,
  canControlZohoPurchaseBot,
} from "@/lib/zoho-sync/api-auth";
import {
  getZohoPurchaseBotSettings,
  setZohoPurchaseBotEnabled,
} from "@/lib/zoho-sync/bot-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await authenticateApiUser(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    return NextResponse.json({
      settings: await getZohoPurchaseBotSettings(),
      canManage: canControlZohoPurchaseBot(actor.role),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to load Zoho purchase bot settings." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await authenticateApiUser(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!canControlZohoPurchaseBot(actor.role)) {
      return NextResponse.json(
        { error: "Only Admin, IT, and Data Analytics users can change this setting." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
    }

    const settings = await setZohoPurchaseBotEnabled({
      enabled: body.enabled,
      actor,
    });
    return NextResponse.json({ settings, canManage: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to update Zoho purchase bot settings." },
      { status: 500 }
    );
  }
}
