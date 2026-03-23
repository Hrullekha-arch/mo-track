import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    console.log("🔥 ===== ZOHO CALLBACK START =====");

    const url = new URL(req.url);
    const code = url.searchParams.get("code");

    if (!code) {
      console.error("❌ No authorization code received");
      return NextResponse.json({ error: "No code received" }, { status: 400 });
    }

    console.log("🔑 Auth Code:", code);

    // ✅ Redirect URI
    const redirectUri =
      process.env.NODE_ENV === "production"
        ? "https://studio--studio-3799785967-d0d9d.us-central1.hosted.app/api/zoho/callback"
        : "http://localhost:3000/api/zoho/callback";

    console.log("🔁 Redirect URI Used:", redirectUri);

    // ✅ Exchange code → token
    const tokenRes = await fetch("https://accounts.zoho.in/oauth/v2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.ZOHO_CLIENT_ID!,
        client_secret: process.env.ZOHO_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        code,
      }),
    });

    const data = await tokenRes.json();

    console.log("📦 FULL TOKEN RESPONSE:", data);

    if (!tokenRes.ok) {
      console.error("❌ Token exchange failed:", data);
      return NextResponse.json(
        { error: "Token exchange failed", details: data },
        { status: 500 }
      );
    }

    // 🔥 IMPORTANT: refresh_token only comes FIRST time
    const refreshToken = data.refresh_token;

    if (!refreshToken) {
      console.warn("⚠️ No refresh_token received (already authorized before)");
    }

    // ✅ Save in Firestore
    const tokenRef = adminDb.collection("zohoTokenDetails").doc("main");

    const now = Date.now();
    const expiresIn = Number(data.expires_in || 3600);
    const expiresAt = now + (expiresIn - 300) * 1000;

    await tokenRef.set(
      {
        accessToken: data.access_token,
        refreshToken: refreshToken || null, // store if available
        expiresAt,
        expiresIn,
        apiDomain: data.api_domain,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    console.log("✅ Token saved to Firestore");

    console.log("🔥 ===== ZOHO CALLBACK SUCCESS =====");

    return NextResponse.json({
      message: "Zoho Connected & Stored Successfully 🚀",
      refresh_token: refreshToken ? "✅ Received" : "❌ Not received",
    });

  } catch (err: any) {
    console.error("💥 ERROR:", err.message);

    return NextResponse.json(
      { error: "Something went wrong", details: err.message },
      { status: 500 }
    );
  }
}