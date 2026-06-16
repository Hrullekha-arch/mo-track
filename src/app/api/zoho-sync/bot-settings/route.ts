import { NextRequest, NextResponse } from "next/server";
import {
  canControlZohoInvoiceBot,
  authenticateApiUser,
} from "@/lib/zoho-sync/api-auth";
import {
  getZohoInvoiceBotSettings,
  setZohoInvoiceBotEnabled,
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
      settings: await getZohoInvoiceBotSettings(),
      canManage: canControlZohoInvoiceBot(actor.role),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to load Zoho bot settings." },
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
    if (!canControlZohoInvoiceBot(actor.role)) {
      return NextResponse.json(
        { error: "Only Admin, IT, and Data Analytics users can change this setting." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
    }

    const settings = await setZohoInvoiceBotEnabled({
      enabled: body.enabled,
      actor,
    });
    return NextResponse.json({ settings, canManage: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to update Zoho bot settings." },
      { status: 500 }
    );
  }
}
