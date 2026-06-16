import { NextRequest, NextResponse } from "next/server";
import { createZohoInvoice } from "@/lib/zoho-books";
import { adminDb } from "@/lib/firebase-admin";
import { isVasInvoice } from "@/lib/zoho-sync/invoice-eligibility";
import { getZohoInvoiceBotSettings } from "@/lib/zoho-sync/bot-settings";
import {
  createZohoSyncQueueEntry,
  failureSyncPatch,
  markZohoSyncQueueEntry,
  successSyncPatch,
  writeZohoSyncLog,
} from "@/lib/zoho-sync/logger";

export async function POST(req: NextRequest) {
  let invoiceDocId = "";
  let queueId = "";

  try {
    const settings = await getZohoInvoiceBotSettings();
    if (!settings.enabled) {
      return NextResponse.json(
        {
          error:
            "Automated Zoho invoicing is inactive. Create and retain the invoice in Mo Track only.",
        },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));

    invoiceDocId = String(body?.invoiceDocId || "").trim();
    const customerId = String(body?.customerId || "").trim();
    const store = String(body?.store || "").trim() || undefined;
    const salesperson = String(body?.salesperson || "").trim() || undefined;
    const invoiceNumber = String(body?.invoiceNumber || "").trim() || undefined;
    const date = String(body?.date || "").trim();
    const dueDate = String(body?.dueDate || "").trim() || undefined;
    const referenceNumber = String(body?.referenceNumber || "").trim() || undefined;
    const notes = String(body?.notes || "").trim() || undefined;
    const adjustment =
      body?.adjustment === undefined || body?.adjustment === null
        ? undefined
        : Number(body.adjustment);
    const adjustmentDescription =
      String(body?.adjustmentDescription || "").trim() || undefined;
    const lineItems = Array.isArray(body?.lineItems) ? body.lineItems : [];

    if (!customerId) {
      return NextResponse.json({ error: "customerId is required." }, { status: 400 });
    }
    if (!date) {
      return NextResponse.json({ error: "date is required (YYYY-MM-DD)." }, { status: 400 });
    }
    if (!lineItems.length) {
      return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
    }

    const sourceInvoice = invoiceDocId
      ? (await adminDb.collection("invoices").doc(invoiceDocId).get()).data()
      : undefined;
    if (isVasInvoice(sourceInvoice || body)) {
      return NextResponse.json(
        { error: "VAS invoices are recorded only in Mo Track and are not sent to Zoho." },
        { status: 400 }
      );
    }

    if (invoiceDocId) {
      queueId = await createZohoSyncQueueEntry({
        entityType: "invoice",
        entityId: invoiceDocId,
        sourceCollection: "invoices",
        sourcePath: `invoices/${invoiceDocId}`,
      });
    }

    const created = await createZohoInvoice({
      customerId,
      store,
      salesperson,
      invoiceNumber,
      date,
      dueDate,
      referenceNumber,
      notes,
      adjustment:
        typeof adjustment === "number" && Number.isFinite(adjustment)
          ? adjustment
          : undefined,
      adjustmentDescription,
      lineItems,
    });

    if (invoiceDocId) {
      await adminDb.collection("invoices").doc(invoiceDocId).set(
        successSyncPatch({
          zohoId: created.id,
          zohoNumber: created.number,
          extra: {
            zohoCustomerId: created.customerId || customerId,
            zohoCustomerName: created.customerName || undefined,
            zohoInvoiceId: created.id,
            zohoInvoiceNo: created.number,
            tallyVoucherNo: created.number,
          },
        }),
        { merge: true }
      );
      await markZohoSyncQueueEntry(queueId, "synced", `Zoho invoice ${created.number} created.`);
      await writeZohoSyncLog({
        queueId,
        entityType: "invoice",
        entityId: invoiceDocId,
        status: "synced",
        message: `Zoho invoice ${created.number} created.`,
      });
    }

    return NextResponse.json({ invoice: created });
  } catch (error: any) {
    const message = error?.message || "Unable to create Zoho invoice.";

    if (invoiceDocId) {
      await adminDb.collection("invoices").doc(invoiceDocId).set(failureSyncPatch(error), {
        merge: true,
      });
      if (queueId) {
        await markZohoSyncQueueEntry(queueId, "failed", message);
      }
      await writeZohoSyncLog({
        queueId: queueId || undefined,
        entityType: "invoice",
        entityId: invoiceDocId,
        status: "failed",
        message,
      });
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
