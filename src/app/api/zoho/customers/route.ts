import { getZohoToken } from "@/lib/zoho";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  console.log("🔥 ===== ZOHO CUSTOMER SEARCH START =====");

  try {
    // 👉 Log full URL
    console.log("📥 Full URL:", req.url);

    // 👉 Extract query
    const search = req.nextUrl.searchParams.get("search") || "";
    console.log("🔍 Search Query:", search);

    if (!search) {
      console.log("⚠️ No search param provided");
      return NextResponse.json({ customers: [] });
    }

    // 👉 Env logs (IMPORTANT)

    const accessToken = await getZohoToken();
    const orgId = process.env.ZOHO_ORG_ID;

    console.log("🔑 Token Exists:", !!accessToken);
    console.log("🏢 Org ID:", orgId);

    if (!accessToken || !orgId) {
      console.log("❌ Missing ENV variables");
      return NextResponse.json(
        { error: "Missing Zoho config" },
        { status: 500 }
      );
    }

    // 👉 Build Zoho URL
    const zohoUrl = `https://www.zohoapis.in/books/v3/contacts?organization_id=${orgId}&contact_name_contains=${encodeURIComponent(search)}`;

    console.log("🌐 Zoho URL:", zohoUrl);

    // 👉 Call Zoho
    const response = await fetch(zohoUrl, {
      method: "GET",
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    });

    console.log("📡 Zoho Status:", response.status);

    const data = await response.json();
      if (response.status === 401) {
    console.log("🔁 Retrying with fresh token...");

    const newToken = await getZohoToken();

    const retry = await fetch(zohoUrl, {
      headers: {
        Authorization: `Zoho-oauthtoken ${newToken}`,
      },
    });

    const retryData = await retry.json();

    return NextResponse.json({ customers: retryData.contacts || [] });
  }

    console.log("📦 Raw Zoho Response:", JSON.stringify(data));

    if (!response.ok) {
      console.log("❌ Zoho API Error:", data);
      return NextResponse.json(
        { error: data.message || "Zoho error" },
        { status: response.status }
      );
    }

    // 👉 Process data
    const customers = (data.contacts || []).slice(0, 10).map((c: any) => ({
      id: c.contact_id,
      name: c.contact_name,
      mobile: c.mobile,
      email: c.email,
      gst: c.gstin,
    }));

    console.log("✅ Customers Found:", customers.length);

    console.log("🔥 ===== ZOHO CUSTOMER SEARCH END =====");

    return NextResponse.json({ customers });

  } catch (error: any) {
    console.log("💥 SERVER ERROR:", error.message);
    console.log("🔥 ===== ZOHO CUSTOMER SEARCH FAILED =====");

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}