import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createZohoCustomer, searchZohoCustomers } from "@/lib/zoho-books";

const ALLOWED_GST_TREATMENTS = new Set([
  "business_gst",
  "business_none",
  "consumer",
  "overseas",
]);

export async function GET(req: NextRequest) {
  try {
    const search = String(req.nextUrl.searchParams.get("search") || "").trim();
    if (!search) {
      return NextResponse.json({ customers: [] });
    }

    const customers = await searchZohoCustomers(search, 20);
    return NextResponse.json({ customers });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to fetch Zoho customers." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const invoiceId = String(body?.invoiceId || "").trim() || undefined;
    const contactName = String(body?.contactName || "").trim();
    const companyName = String(body?.companyName || "").trim() || undefined;
    const email = String(body?.email || "").trim() || undefined;
    const phone = String(body?.phone || "").trim() || undefined;
    const gstNo = String(body?.gstNo || "").trim() || undefined;
    const placeOfContact = String(body?.placeOfContact || "").trim() || undefined;
    const gstTreatmentRaw = String(body?.gstTreatment || "").trim();
    const gstTreatment = ALLOWED_GST_TREATMENTS.has(gstTreatmentRaw)
      ? (gstTreatmentRaw as "business_gst" | "business_none" | "consumer" | "overseas")
      : undefined;
    const notes = String(body?.notes || "").trim() || undefined;

    const billingAddress = {
      attention: String(body?.billingAddress?.attention || "").trim() || undefined,
      address: String(body?.billingAddress?.address || "").trim() || undefined,
      street2: String(body?.billingAddress?.street2 || "").trim() || undefined,
      city: String(body?.billingAddress?.city || "").trim() || undefined,
      state: String(body?.billingAddress?.state || "").trim() || undefined,
      zip: String(body?.billingAddress?.zip || "").trim() || undefined,
      country: String(body?.billingAddress?.country || "").trim() || undefined,
      phone: String(body?.billingAddress?.phone || "").trim() || phone,
    };

    const shippingAddress = {
      attention: String(body?.shippingAddress?.attention || "").trim() || undefined,
      address: String(body?.shippingAddress?.address || "").trim() || undefined,
      street2: String(body?.shippingAddress?.street2 || "").trim() || undefined,
      city: String(body?.shippingAddress?.city || "").trim() || undefined,
      state: String(body?.shippingAddress?.state || "").trim() || undefined,
      zip: String(body?.shippingAddress?.zip || "").trim() || undefined,
      country: String(body?.shippingAddress?.country || "").trim() || undefined,
      phone: String(body?.shippingAddress?.phone || "").trim() || phone,
    };

    if (!contactName) {
      return NextResponse.json({ error: "contactName is required." }, { status: 400 });
    }

    const created = await createZohoCustomer({
      contactName,
      companyName,
      email,
      phone,
      gstNo,
      placeOfContact,
      gstTreatment,
      notes,
      billingAddress,
      shippingAddress,
    });

    if (invoiceId) {
      await adminDb
        .collection("invoices")
        .doc(invoiceId)
        .set(
          {
            zohoCustomerId: created.id,
            zohoCustomerName: created.name,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
    }

    return NextResponse.json({ customer: created });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to create Zoho customer." },
      { status: 500 }
    );
  }
}
